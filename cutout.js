'use strict';
/*
 * 照片伙伴抠图（主进程）
 *
 * 两条引擎，都是纯本地、不联网：
 *   1) macOS 14+：调用 tools/bin/cutout（Swift + Vision 的
 *      VNGenerateForegroundInstanceMaskRequest），边缘最好；
 *   2) Windows / Linux / macOS 13 及以下：把 tools/bin/ort 里的
 *      ONNX Runtime(wasm) + u2netp 模型丢进一个隐藏窗口里跑，
 *      拿到遮罩后按原图尺寸合成透明 PNG（见 renderer/cutout-page.js）。
 *
 * 对外只暴露 available() / cutout()，其余（隐藏窗口、petcut 协议、
 * IPC 请求表）都在这里收着。
 */
const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const IS_MAC = process.platform === 'darwin';
const ROOT = __dirname;
const VISION_BIN = path.join(ROOT, 'tools', 'bin', 'cutout');
const ORT_DIR = path.join(ROOT, 'tools', 'bin', 'ort');
const ORT_FILES = [
  'ort.wasm.min.js',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'u2netp.onnx'
];

const SCHEME = 'petcut';
const PAGE = `${SCHEME}://app/renderer/cutout.html`;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8'
};

// 页面里等推理结果的最长时间：第一次要编译 wasm，慢机器给足
const TIMEOUT_MS = 180000;

// ---- 引擎探测（结果缓存，装不装资源只影响启动那一刻） ----
let probed = null;
function probe() {
  if (probed) return probed;
  const vision = IS_MAC && fs.existsSync(VISION_BIN);
  const onnx = ORT_FILES.every(f => {
    try { return fs.statSync(path.join(ORT_DIR, f)).size > 0; } catch (_) { return false; }
  });
  probed = { vision, onnx };
  return probed;
}
function preferVision() { return probe().vision; }
function available() { const p = probe(); return p.vision || p.onnx; }
function engineName() { const p = probe(); return p.vision ? 'vision' : (p.onnx ? 'onnx' : 'none'); }

// ---- 自定义协议：只放行 app 目录里的文件 ----
// 隐藏窗口从 petcut://app/renderer/cutout.html 打开，
// ort 的 wasm / 模型都用相对路径取，file:// 下 fetch 会被 CORS 拦。
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

let protocolInstalled = false;
function installProtocol() {
  if (protocolInstalled) return;
  protocolInstalled = true;
  const base = path.resolve(ROOT);
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(base, rel);
      if (file !== base && !file.startsWith(base + path.sep)) {
        return new Response('forbidden', { status: 403 });
      }
      const body = await fs.promises.readFile(file);
      return new Response(body, {
        headers: {
          'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-store'
        }
      });
    } catch (err) {
      return new Response('not found', { status: 404 });
    }
  });
}

// ---- Vision 引擎（老的 macOS 路径，行为不变） ----
function runVision(inputPath, outPath) {
  return new Promise((resolve) => {
    const jsonPath = outPath + '.json';
    execFile(VISION_BIN, [inputPath, outPath, jsonPath], { timeout: 30000 }, (err) => {
      if (err) return resolve({ ok: false, engine: 'vision', reason: 'vision: ' + (err.message || 'failed') });
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (_) {}
      try { fs.unlinkSync(jsonPath); } catch (_) {}
      resolve({
        ok: true,
        engine: 'vision',
        w: meta.width || 0,
        h: meta.height || 0,
        fallback: !!meta.fallback
      });
    });
  });
}

// ---- ONNX 引擎：隐藏窗口 + IPC ----
let worker = null;          // BrowserWindow
let workerReady = null;     // Promise
let seq = 0;
const pending = new Map();  // id -> { resolve, timer }

function failAll(reason) {
  for (const [id, job] of pending) {
    clearTimeout(job.timer);
    job.resolve({ ok: false, engine: 'onnx', reason });
  }
  pending.clear();
}

function ensureWorker() {
  if (worker && !worker.isDestroyed()) return workerReady;
  const win = new BrowserWindow({
    show: false,
    width: 240,
    height: 240,
    frame: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(ROOT, 'renderer', 'cutout-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  worker = win;
  workerReady = win.loadURL(PAGE).then(() => win);
  workerReady.catch((err) => {
    console.error('[cutout] 抠图窗口加载失败:', err && (err.message || err));
    failAll('worker-load-failed');
    try { win.destroy(); } catch (_) {}
    if (worker === win) { worker = null; workerReady = null; }
  });
  win.on('closed', () => {
    if (worker === win) { worker = null; workerReady = null; }
    failAll('worker-closed');
  });
  win.on('render-process-gone', () => {
    failAll('worker-crashed');
  });
  return workerReady;
}

function runOnnx(buffer, maxSide) {
  return new Promise((resolve) => {
    const id = ++seq;
    ensureWorker().then((win) => {
      if (!win || win.isDestroyed()) return resolve({ ok: false, engine: 'onnx', reason: 'no-worker' });
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, engine: 'onnx', reason: 'timeout' });
        // 卡死的窗口没有复用价值，关掉下次重建
        try { win.destroy(); } catch (_) {}
      }, TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      win.webContents.send('cutout:request', { id, buffer: copy, maxSide });
    }, (err) => {
      resolve({ ok: false, engine: 'onnx', reason: 'worker-load-failed: ' + (err && err.message || err) });
    });
  });
}

ipcMain.on('cutout:result', (event, id, payload) => {
  const job = pending.get(id);
  if (!job) return;
  if (worker && !worker.isDestroyed() && event.sender !== worker.webContents) return;
  pending.delete(id);
  clearTimeout(job.timer);
  if (!payload || !payload.ok) {
    return job.resolve({ ok: false, engine: 'onnx', reason: (payload && payload.reason) || 'failed' });
  }
  job.resolve({
    ok: true,
    engine: 'onnx',
    png: Buffer.from(payload.png),
    w: payload.w || 0,
    h: payload.h || 0,
    fallback: !!payload.fallback
  });
});

ipcMain.on('cutout:log', (_event, msg) => {
  console.log('[cutout]', msg);
});

// 解码兜底 1：Chromium 读不了的格式，先用 nativeImage 试试
function viaNativeImage(inputPath) {
  try {
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromPath(inputPath);
    if (!img || img.isEmpty()) return null;
    return img.toPNG();
  } catch (_) {
    return null;
  }
}

// 解码兜底 2：macOS 上还有 sips，iPhone 的 HEIC 靠它转 PNG
// （Chromium 和 nativeImage 都不认 HEIC，Windows 只能请用户自己转 JPG）
function viaSips(inputPath) {
  if (!IS_MAC) return null;
  const os = require('os');
  const { execFileSync } = require('child_process');
  const dest = path.join(os.tmpdir(), `pet-heic-${process.pid}-${Date.now()}.png`);
  try {
    execFileSync('sips', ['-s', 'format', 'png', inputPath, '--out', dest], { timeout: 20000, stdio: 'ignore' });
    const png = fs.readFileSync(dest);
    return png && png.length ? png : null;
  } catch (_) {
    return null;
  } finally {
    try { fs.unlinkSync(dest); } catch (_) {}
  }
}

// 调试用：PET_CUTOUT_ENGINE=onnx 可以强制走跨平台引擎（在 mac 上验证 Windows 那条路）
const DEFAULT_ENGINE = ['onnx', 'vision'].includes(process.env.PET_CUTOUT_ENGINE)
  ? process.env.PET_CUTOUT_ENGINE
  : 'auto';

/**
 * 抠图并写文件。
 * @param {string} inputPath 用户选的原始照片
 * @param {string} outPath   写出的透明 PNG
 * @param {{maxSide?:number, engine?:'auto'|'vision'|'onnx'}} [opts]
 * @returns {Promise<{ok:boolean, engine?:string, w?:number, h?:number, fallback?:boolean, reason?:string}>}
 */
async function cutout(inputPath, outPath, opts = {}) {
  const maxSide = Math.max(240, Math.min(4096, Number(opts.maxSide) || 1600));
  const want = opts.engine || DEFAULT_ENGINE;   // 测试时可以指定引擎
  if (!available()) return { ok: false, reason: 'no-engine' };

  if (want !== 'onnx' && preferVision()) {
    const r = await runVision(inputPath, outPath);
    if (r.ok) return r;
    console.warn('[cutout] Vision 抠图失败，改用本地模型:', r.reason);
    if (!probe().onnx) return r;
  }

  let buffer;
  try { buffer = await fs.promises.readFile(inputPath); }
  catch (err) { return { ok: false, engine: 'onnx', reason: 'read: ' + (err.message || err) }; }

  let r = await runOnnx(buffer, maxSide);
  if (!r.ok && r.reason === 'decode') {
    const png = viaNativeImage(inputPath) || viaSips(inputPath);
    if (png) {
      console.log('[cutout] 浏览器解不了这张图，先转成 PNG 再试');
      r = await runOnnx(png, maxSide);
    }
  }
  if (!r.ok) {
    // iPhone 的 HEIC 在 Windows 上没有解码器，给一句能照做的提示
    const ext = path.extname(inputPath).toLowerCase();
    if (r.reason === 'decode' && (ext === '.heic' || ext === '.heif')) {
      return { ok: false, engine: 'onnx', reason: 'heic' };
    }
    return r;
  }

  try { await fs.promises.writeFile(outPath, r.png); }
  catch (err) { return { ok: false, engine: 'onnx', reason: 'write: ' + (err.message || err) }; }
  return { ok: true, engine: 'onnx', w: r.w, h: r.h, fallback: r.fallback };
}

function destroy() {
  failAll('shutdown');
  if (worker && !worker.isDestroyed()) {
    try { worker.destroy(); } catch (_) {}
  }
  worker = null;
  workerReady = null;
}

app.whenReady().then(installProtocol);

module.exports = { available, engineName, cutout, destroy, ORT_DIR };
