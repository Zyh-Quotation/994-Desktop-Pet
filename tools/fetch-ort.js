#!/usr/bin/env node
/*
 * 照片伙伴的跨平台抠图资源（Windows / Linux / 老 macOS 都用它）
 *
 *   产物：tools/bin/ort/
 *     ort.wasm.min.js                 ONNX Runtime Web 的 wasm-only 入口（48KB）
 *     ort-wasm-simd-threaded.mjs      wasm 胶水（21KB）
 *     ort-wasm-simd-threaded.wasm     wasm 运行库（11MB）
 *     u2netp.onnx                     U^2-Net 轻量抠图模型（4.4MB）
 *
 * macOS 14+ 仍然优先用系统 Vision（tools/bin/cutout，质量更好），
 * 这几个文件是 Windows / Linux / macOS 13 及以下的兜底引擎。
 *
 * 用法：
 *   node tools/fetch-ort.js          # 缺什么补什么
 *   node tools/fetch-ort.js --force  # 全部重下
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'tools', 'bin', 'ort');
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'ort-assets.json'), 'utf8'));
const FORCE = process.argv.includes('--force');

const FILES = [
  'ort.wasm.min.js',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  ...SPEC.models.map(m => m.name)
];

function log(msg) { console.log(msg); }

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function has(file, expect) {
  try { return sha256(file) === expect; } catch (_) { return false; }
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'togepi-pet-build' } }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (redirects > 5) return reject(new Error('重定向太多：' + url));
        const next = new URL(res.headers.location, url).toString();
        return download(next, dest, redirects + 1).then(resolve, reject);
      }
      if (code !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${code} ${url}`));
      }
      const total = Number(res.headers['content-length'] || 0);
      let got = 0, lastPct = -1;
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      res.on('data', (chunk) => {
        got += chunk.length;
        if (total > 0) {
          const pct = Math.floor(got / total * 100);
          if (pct >= lastPct + 20) { lastPct = pct; log(`   ${pct}%  ${(got / 1048576).toFixed(1)}MB`); }
        }
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.setTimeout(60000, () => req.destroy(new Error('下载超时：' + url)));
    req.on('error', reject);
  });
}

async function downloadOne(item, dest, primary, fallback) {
  const urls = [primary, fallback].filter(Boolean);
  for (const url of urls) {
    try {
      log(`▶ 下载 ${path.basename(dest)} ← ${url}`);
      await download(url, dest);
      return true;
    } catch (err) {
      log(`   失败：${err.message}`);
      try { fs.unlinkSync(dest); } catch (_) {}
    }
  }
  return false;
}

async function fetchOrtRuntime(tmp) {
  const tgz = path.join(tmp, 'ort.tgz');
  const ok = await downloadOne(tgz, path.join(tmp, 'ort.tgz'), SPEC['onnxruntime-web'].tarball, SPEC['onnxruntime-web'].fallback);
  if (!ok) throw new Error('onnxruntime-web 下载失败，请检查网络后重试');
  const hash = sha256(tgz);
  if (hash !== SPEC['onnxruntime-web'].sha256) {
    throw new Error(`onnxruntime-web 校验失败\nexpected ${SPEC['onnxruntime-web'].sha256}\ngot      ${hash}`);
  }
  log('▶ 解压 onnxruntime-web（只要 dist 里 3 个文件）…');
  const xdir = path.join(tmp, 'ort');
  fs.mkdirSync(xdir, { recursive: true });
  for (const f of SPEC['onnxruntime-web'].files) {
    execFileSync('tar', ['-xzf', tgz, '-C', xdir, f], { stdio: 'inherit' });
    fs.copyFileSync(path.join(xdir, f), path.join(OUT, path.basename(f)));
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const missing = FORCE ? FILES.slice() : FILES.filter(f => !fs.existsSync(path.join(OUT, f)));
  if (!missing.length) {
    log(`✅ 抠图资源已就绪：${OUT}`);
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-ort-'));
  try {
    if (missing.some(f => !f.endsWith('.onnx'))) {
      await fetchOrtRuntime(tmp);
    }
    for (const m of SPEC.models) {
      const dest = path.join(OUT, m.name);
      if (!FORCE && fs.existsSync(dest)) continue;
      const ok = await downloadOne(m, dest, m.url, m.fallback);
      if (!ok) throw new Error(`${m.name} 下载失败，请检查网络后重试`);
      const hash = sha256(dest);
      if (hash !== m.sha256) throw new Error(`${m.name} 校验失败\nexpected ${m.sha256}\ngot      ${hash}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(OUT, 'LICENSES.txt'), [
    '照片伙伴跨平台抠图运行时',
    '',
    'onnxruntime-web 1.22.0 — MIT License, © Microsoft Corporation',
    '  https://github.com/microsoft/onnxruntime',
    '',
    'u2netp.onnx — U^2-Net (Small) by Xuebin Qin et al., Apache License 2.0',
    '  https://github.com/xuebinqin/U-2-Net',
    '  权重文件来自 rembg 的发布包：https://github.com/danielgatis/rembg',
    '',
    '这些文件只在本地跑，照片不会上传到任何服务器。'
  ].join('\n'));

  const total = FILES.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  log(`✅ 抠图资源就绪：${OUT}（${FILES.length} 个文件，共 ${(total / 1048576).toFixed(1)}MB）`);
}

main().catch(err => {
  console.error('❌ ' + (err && err.message || err));
  process.exit(1);
});
