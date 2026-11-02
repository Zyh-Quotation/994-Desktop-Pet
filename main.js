const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// 在受限/无 GPU 环境下也能跑（桌宠小窗口对软件渲染无感）
app.commandLine.appendSwitch('no-sandbox');

// 主进程未捕获异常：只记日志、不弹吓人的错误框
process.on('uncaughtException', err => {
  console.error('[main] uncaughtException:', (err && err.stack) || err);
});

app.setName('togepi-pet');
// 开发时把 userData 放进项目目录（便携）；打包成自包含 app 时放系统标准位置
// （否则会往已签名的 bundle 里写文件，破坏签名，也可能没权限）
const IN_BUNDLE = __dirname.includes('.app/Contents/Resources/');
app.setPath('userData', IN_BUNDLE
  ? path.join(app.getPath('appData'), '神奇宝贝')
  : path.join(__dirname, 'userdata'));

// 日志同时写入 userdata/app.log（打包成 bundle 后没有终端输出）
(function () {
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const write = (level, args) => {
    try {
      const line = new Date().toISOString() + ' [' + level + '] ' +
        args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
      fs.appendFileSync(path.join(__dirname, 'userdata', 'app.log'), line);
    } catch (_) { /* 日志失败不影响运行 */ }
  };
  console.log = (...a) => { origLog(...a); write('info', a); };
  console.error = (...a) => { origErr(...a); write('err', a); };
})();

console.log('[debug] main.js 模块加载开始');
const locked = app.requestSingleInstanceLock();
console.log('[debug] 单实例锁:', locked);
if (!locked) {
  app.quit();
}

// ---------- 常量 ----------
const SIZES = { small: 64, medium: 96, large: 128 };
const SIZE_LABEL = { small: '小 64px', medium: '中 96px', large: '大 128px' };
const MARGIN_X = 26;      // 窗口左右留白（气泡、挣扎动画用）
const BUBBLE_H = 84;      // 头顶气泡区域高度
const PET_BOTTOM = 6;     // 精灵底部离窗口底边的距离（放影子）
const GRAVITY = 1900;     // px/s²

// ---------- 世界状态 ----------
let win = null;
let tray = null;
let petH = 96;        // 精灵显示高度
let alt = 0;          // 当前离地高度（px），>0 表示在空中
let altTarget = 0;    // 飞行目标高度
let inBall = false;   // 收在精灵球里
let soundOn = true;   // 叫声开关
let followReadyAt = 0; // 下次可以跟鼠标的时间
let petW = 96;
let aspect = 1;       // 素材宽高比
let winW = 150, winH = 190;
let x = 0, y = 0;     // 窗口左上角
let state = 'idle';   // idle|walk|sleep|drag|fall|eat|happy|angry
let stateUntil = 0;
let dir = 1;
let speed = 45;
let vx = 0, vy = 0;
let bounceCount = 0;
let hardThrow = false;
let stats = { hunger: 80, mood: 80 };
let sizeKey = 'medium';
let hover = false;
let hungerNagAt = 0, moodNagAt = 0;
let clickTimes = [];
let shiny = Math.random() < 1 / 128; // 彩蛋：1/128 异色
let lastTs = Date.now();
let speciesDex = 175;                // 当前宝可梦（全国图鉴编号）
let settingsWin = null;

// ---------- 图鉴数据（由 data/pokedex.json 生成，覆盖 001-1025） ----------
const DEX_FILE = path.join(__dirname, 'data', 'pokedex.json');
const DEX_DATA = JSON.parse(fs.readFileSync(DEX_FILE, 'utf8'));
const SPECIES = DEX_DATA.species;
const byDex = new Map(SPECIES.map(s => [s.dex, s]));

// 进化链 → 每条链的「分层」结构，用于设置页展示
const LINES = DEX_DATA.chains.map(c => {
  const base = byDex.get(c.stages[0][0]);
  return { stages: c.stages, hows: c.hows, type: (base && base.types[0]) || '' };
}).sort((a, b) => a.stages[0][0] - b.stages[0][0]);

const SPRITE_DIR = path.join(__dirname, 'assets', 'pokemon');
const spriteBase = () => require('url').pathToFileURL(SPRITE_DIR).href + '/';

// ---------- 叫声 ----------
const CRY_DIR = path.join(__dirname, 'assets', 'cries');
function cryUrlFor(dex) {
  for (const ext of ['mp3', 'ogg', 'wav']) {
    const f = path.join(CRY_DIR, `${dex}.${ext}`);
    if (fs.existsSync(f)) return require('url').pathToFileURL(f).href;
  }
  return null;
}
let lastCryAt = 0;
function playCry(dex = speciesDex, force = false) {
  if (!soundOn) return;
  const t = now();
  if (!force && t - lastCryAt < 1200) return;
  const url = cryUrlFor(dex);
  if (!url) return;
  lastCryAt = t;
  if (win && !win.isDestroyed()) win.webContents.send('cry', url);
}

// ---------- 待机小动作 ----------
function maybeIdleAct() {
  setTimeout(() => {
    if (state !== 'idle' || inBall) return;
    const a = pick(['yawn', 'scratch', 'look', 'pounce']);
    if (win && !win.isDestroyed()) win.webContents.send('act', a);
    if (a === 'yawn') bubble('😪', 1100);
    else if (a === 'pounce') bubble('!', 700);
    else if (a === 'scratch' && Math.random() < 0.4) playCry();
  }, 500 + Math.random() * 900);
}

// ---------- 图鉴小故事 ----------
let LORE = {};
try { LORE = (JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'lore.json'), 'utf8')).lore) || {}; }
catch (e) { console.error('[lore] 读取失败:', e.message); }

// ---------- 通用 HTTP GET（自动选协议，永不抛异常） ----------
function httpGetText(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let mod;
    try { mod = new URL(url).protocol === 'http:' ? http : https; } catch (e) { reject(e); return; }
    const req = mod.get(url, { headers: { 'User-Agent': 'pokepet/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        httpGetText(res.headers.location, timeoutMs).then(resolve, reject);
        return;
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { try { req.destroy(new Error('timeout')); } catch (_) {} });
  });
}

// ---------- 天气 / 时间段 ----------
let weather = null;          // { kind: '晴'|'云'|'雨'|'雪'|'雷', temp, desc }
let weatherAt = 0;
const WEATHER_ICON = { 晴: '☀️', 云: '☁️', 雨: '🌧️', 雪: '❄️', 雷: '⛈️' };

function timeLabel() {
  const h = new Date().getHours();
  if (h < 5) return '深夜';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 14) return '中午';
  if (h < 18) return '午后';
  if (h < 22) return '晚上';
  return '深夜';
}
const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 5; };

function fetchWeather() {
  if (now() - weatherAt < 30 * 60 * 1000) return;
  weatherAt = now();
  httpGetText('https://wttr.in/?format=j1', 9000).then(({ body }) => {
    const j = JSON.parse(body);
    const c = j.current_condition && j.current_condition[0];
    if (!c) return;
    const desc = (c.weatherDesc && c.weatherDesc[0] && c.weatherDesc[0].value) || '';
    const code = Number(c.weatherCode) || 0;
    const kind =
      /thunder|storm/i.test(desc) || [200, 386, 389, 392, 395].includes(code) ? '雷'
      : /snow|sleet|blizzard|ice/i.test(desc) || (code >= 227 && code <= 230) || (code >= 311 && code <= 338) || (code >= 368 && code <= 377) ? '雪'
      : /rain|drizzle|shower/i.test(desc) || (code >= 176 && code <= 185) || (code >= 293 && code <= 308) || (code >= 353 && code <= 359) ? '雨'
      : /cloud|overcast|mist|fog|haze/i.test(desc) || [116, 119, 122, 143, 248, 260].includes(code) ? '云'
      : '晴';
    const prev = weather && weather.kind;
    weather = { kind, temp: Number(c.temp_C), desc };
    refreshTray();
    if (prev && prev !== kind && win && !win.isDestroyed()) {
      bubble(`${WEATHER_ICON[kind]} ${kind === '雨' ? '外面下雨了…' : kind === '雪' ? '下雪啦!' : kind === '雷' ? '打雷了，好可怕…' : kind === '晴' ? '天晴了!' : '云散开了…'}`, 2600);
    }
  }).catch(e => console.error('[weather] 失败', e.message));
}


const spriteUrlFor = (dex, wantShiny) => {
  const shinyFile = path.join(SPRITE_DIR, `${dex}-shiny.gif`);
  const plainFile = path.join(SPRITE_DIR, `${dex}.gif`);
  const file = wantShiny && fs.existsSync(shinyFile) ? shinyFile : plainFile;
  return require('url').pathToFileURL(file).href;
};

const speciesInfo = () => byDex.get(speciesDex) || byDex.get(175);

const now = () => Date.now();
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stateFile = () => path.join(app.getPath('userData'), 'pet-state.json');

// ---------- 谁会飞 ----------
// 飞行属性的都能飞；另外补一些自带漂浮/悬空设定的宝可梦（鬼斯、小磁怪、拉帝亚斯…）
const FLY_EXTRA = new Set([81, 82, 92, 93, 109, 110, 150, 151, 343, 344, 380, 381, 425, 426, 462, 479, 489, 490, 774]);
function canFlyNow() {
  const sp = speciesInfo();
  if (!sp) return false;
  if ((sp.types || []).includes('飞行')) return true;
  return FLY_EXTRA.has(sp.dex);
}

// ---------- 持久化 ----------
function loadState() {
  try {
    const d = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    stats.hunger = clamp(Number(d.stats?.hunger ?? 80), 0, 100);
    stats.mood = clamp(Number(d.stats?.mood ?? 80), 0, 100);
    if (SIZES[d.sizeKey]) sizeKey = d.sizeKey;
    if (typeof d.soundOn === 'boolean') soundOn = d.soundOn;
    if (d.species && SPECIES.some(s => s.dex === Number(d.species))) speciesDex = Number(d.species);
  } catch (_) { /* 首次运行 */ }
}
function saveState() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({
      stats, sizeKey, soundOn, species: speciesDex, savedAt: new Date().toISOString()
    }));
  } catch (e) { console.error('saveState failed:', e.message); }
}

// ---------- 尺寸 / 定位 ----------
function recomputeDims() {
  petW = Math.round(aspect * petH);
  winW = Math.max(petW + MARGIN_X * 2, 150);
  winH = petH + BUBBLE_H + PET_BOTTOM + 4;
}
function waFor(px, py) {
  return screen.getDisplayNearestPoint({ x: Math.round(px), y: Math.round(py) }).workArea;
}
function floorFor(px, py) {
  const wa = waFor(px, py);
  return wa.y + wa.height;
}
function groundYFor() {
  return floorFor(x + winW / 2, y + winH) - winH + PET_BOTTOM;
}
// 站在当前屏边缘时，看看旁边还有没有显示器
function neighborOf(wa, dir) {
  const cy = y + winH - petH / 2;
  return screen.getAllDisplays().find(d => {
    const a = d.workArea;
    const vertOk = cy >= a.y - 8 && cy <= a.y + a.height + 8;
    if (!vertOk) return false;
    if (dir > 0) return Math.abs(a.x - (wa.x + wa.width)) <= 3;
    return Math.abs(a.x + a.width - wa.x) <= 3;
  });
}
function clampX() {
  const wa = waFor(x + winW / 2, y + winH / 2);
  x = clamp(x, wa.x, wa.x + wa.width - winW);
}
function applyPosition() {
  if (win && !win.isDestroyed()) win.setPosition(Math.round(x), Math.round(y));
}

// ---------- 状态机 ----------
function setState(s, durMs = 0) {
  // 除了飞行相关的状态，其余状态都回到地面
  if (s !== 'ball') inBall = false;
  if (s !== 'fly' && s !== 'landing' && alt > 1) {
    alt = 0;
    altTarget = 0;
  }
  state = s;
  stateUntil = now() + durMs;
  if (win && !win.isDestroyed()) {
    win.webContents.send('state', s);
    updateIgnore();
  }
}
let sentFace = 0;
let sentAlt = -1;
function pushFace() {
  if (sentFace === dir) return;
  sentFace = dir;
  if (win && !win.isDestroyed()) win.webContents.send('face', dir);
}

function bubble(text, ms = 1800) {
  if (win && !win.isDestroyed()) win.webContents.send('bubble', { text, ms });
}

function nextRandomState(t) {
  if (stats.hunger < 15 && Math.random() < 0.5) {
    setState('sleep', 8000 + Math.random() * 9000);
    bubble('饿得没力气了…', 2200);
    return;
  }
  // 偶尔跟着鼠标跑一段（90 秒冷却，不打扰）
  if (t > followReadyAt && Math.random() < 0.12) {
    followReadyAt = t + 90000;
    setState('follow', 4000 + Math.random() * 3000);
    if (Math.random() < 0.45) bubble(pick(['等等我～', '跟着你!', '嗯?']), 1500);
    return;
  }

  // 会飞的宝可梦：一半概率起飞，飞到半空漂一圈
  if (canFlyNow() && Math.random() < 0.5) {
    const wa = waFor(x + winW / 2, y + winH / 2);
    const maxAlt = Math.max(80, (wa.height - winH) * 0.55);
    altTarget = 60 + Math.random() * maxAlt;
    dir = Math.random() < 0.5 ? -1 : 1;
    speed = 40 + Math.random() * 55;
    setState('fly', 5000 + Math.random() * 6000);
    if (Math.random() < 0.35) bubble(pick(['呼——', '咻~', '♪']), 1500);
    return;
  }

  // 下雨下雪就懒得出门，深夜更容易睡
  const badWeather = weather && (weather.kind === '雨' || weather.kind === '雪' || weather.kind === '雷');
  const night = isNight();
  const r = Math.random();
  if (badWeather && Math.random() < 0.5) {
    setState('idle', 2500 + Math.random() * 3000);
    if (Math.random() < 0.3) bubble(pick(['外面在下雨…', '不想出去', '好冷…']), 1800);
    return;
  }
  if (night && Math.random() < 0.45) {
    setState('sleep', 10000 + Math.random() * 12000);
    if (Math.random() < 0.5) bubble('Zzz…', 2200);
    return;
  }
  if (r < 0.4) {
    setState('idle', 1500 + Math.random() * 4000);
    if (Math.random() < 0.55) maybeIdleAct();
    if (Math.random() < 0.4) bubble(pick(['♪', '?', '咕~', '♪♪']), 1600);
  } else if (r < 0.86) {
    dir = Math.random() < 0.5 ? -1 : 1;
    speed = Math.random() < 0.18 ? 95 + Math.random() * 45 : 35 + Math.random() * 30;
    setState('walk', 2000 + Math.random() * 4000);
    if (speed > 80 && Math.random() < 0.5) bubble('♪♪!', 1500);
  } else {
    setState('sleep', 8000 + Math.random() * 10000);
    bubble('Zzz…', 2200);
  }
}

function decayAndNag(t, dt) {
  if (state === 'sleep') {
    stats.mood = Math.min(100, stats.mood + dt * 0.8);
    stats.hunger = Math.max(0, stats.hunger - dt * 0.01);
  } else {
    stats.hunger = Math.max(0, stats.hunger - dt * 0.045);
    stats.mood = Math.max(0, stats.mood - dt * 0.03);
  }
  if (stats.hunger < 30 && t > hungerNagAt) {
    bubble('肚子饿…波皮…', 2200);
    hungerNagAt = t + 30000;
    refreshTray();
  } else if (stats.mood < 30 && t > moodNagAt) {
    bubble('陪我玩嘛…', 2200);
    moodNagAt = t + 30000;
    refreshTray();
  }
}

function land() {
  alt = 0;
  altTarget = 0;
  setState('idle', 1200 + Math.random() * 2500);
  if (hardThrow || bounceCount >= 1) {
    bubble(pick(['啊!', '好晕…', '哎哟!']), 1800);
    if (hardThrow) stats.mood = Math.max(0, stats.mood - 3);
  }
  hardThrow = false;
  bounceCount = 0;
  refreshTray();
}

// ---------- 主循环 ----------
function tick() {
  const t = now();
  const dt = Math.min(100, t - lastTs) / 1000;
  lastTs = t;
  if (!win || win.isDestroyed()) return;

  const groundY = groundYFor();

  if (state === 'drag') {
    const p = screen.getCursorScreenPoint();
    const k = Math.min(1, dt * 16);
    x += (p.x - winW / 2 - x) * k;
    y += (p.y - (winH - PET_BOTTOM - petH / 2) - y) * k; // 光标按住精灵中心
    if (t > stateUntil) { // 安全兜底：拖太久自动松手
      hardThrow = false;
      bounceCount = 0;
      vx = 0; vy = 0;
      setState('fall');
    }
  } else if (state === 'fall') {
    vy += GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    const wa = waFor(x + winW / 2, y + winH / 2);
    if (x < wa.x) { x = wa.x; vx = Math.abs(vx) * 0.5; }
    if (x + winW > wa.x + wa.width) { x = wa.x + wa.width - winW; vx = -Math.abs(vx) * 0.5; }
    if (y >= groundY) {
      y = groundY;
      if (Math.abs(vy) > 280) {
        vy = -vy * 0.38;
        vx *= 0.6;
        bounceCount++;
      } else {
        vy = 0; vx = 0;
        land();
      }
    }
  } else if (state === 'follow') {
    const p = screen.getCursorScreenPoint();
    const wa = waFor(x + winW / 2, y + winH / 2);
    const targetX = clamp(p.x - winW / 2, wa.x, wa.x + wa.width - winW);
    if (targetX > x + 2) dir = 1;
    else if (targetX < x - 2) dir = -1;
    x += dir * 155 * dt;
    x = clamp(x, wa.x, wa.x + wa.width - winW);
    y = groundY;
    if (Math.abs(targetX - x) < 14 || t >= stateUntil) setState('idle', 700 + Math.random() * 900);
    decayAndNag(t, dt);
  } else if (state === 'fly') {
    alt += (altTarget - alt) * Math.min(1, dt * 1.6);
    x += dir * speed * dt;
    const wa = waFor(x + winW / 2, y + winH / 2);
    if (x <= wa.x && !neighborOf(wa, -1)) { x = wa.x; dir = 1; }
    if (x + winW >= wa.x + wa.width && !neighborOf(wa, 1)) { x = wa.x + wa.width - winW; dir = -1; }
    const bob = Math.sin(t / 320) * 4; // 轻微上下浮动
    y = clamp(groundY - alt + bob, wa.y + 16, groundY);

    if (t >= stateUntil) {
      if (Math.random() < 0.55) {
        const maxAlt = Math.max(80, (wa.height - winH) * 0.55);
        altTarget = 60 + Math.random() * maxAlt;
        dir = Math.random() < 0.5 ? -1 : 1;
        speed = 40 + Math.random() * 55;
        stateUntil = t + 4000 + Math.random() * 5000;
      } else {
        setState('landing');
      }
    }
    decayAndNag(t, dt);
  } else if (state === 'landing') {
    alt = Math.max(0, alt - 240 * dt);
    y = groundY - alt;
    if (alt <= 0.5) {
      alt = 0;
      y = groundY;
      land();
    }
  } else {
    if (!inBall && t >= stateUntil) nextRandomState(t);
    y = groundY;
    if (state === 'walk') {
      x += dir * speed * dt;
      const wa = waFor(x + winW / 2, y + winH / 2);
      if (x <= wa.x && !neighborOf(wa, -1)) { x = wa.x; dir = 1; }
      if (x + winW >= wa.x + wa.width && !neighborOf(wa, 1)) { x = wa.x + wa.width - winW; dir = -1; }
    }
    decayAndNag(t, dt);
  }
  applyPosition();
  pushFace();

  const altRatio = clamp(alt / 220, 0, 1);
  if (Math.abs(altRatio - sentAlt) > 0.06) {
    sentAlt = altRatio;
    if (win && !win.isDestroyed()) win.webContents.send('alt', Math.round(altRatio * 100) / 100);
  }
}

// ---------- 调试：窗口自截图 ----------
function captureTo(winRef, file) {
  if (!process.env.PET_CAPTURE) return;   // 平时不截图，调试时 PET_CAPTURE=1 才落盘
  if (!winRef || winRef.isDestroyed()) return;
  setTimeout(() => {
    if (!winRef || winRef.isDestroyed()) return;
    winRef.webContents.capturePage().then(img => {
      try {
        fs.writeFileSync(path.join(__dirname, file), img.toPNG());
        console.log('[debug] 截图已保存', file, JSON.stringify(img.getSize()));
      } catch (e) { console.error('[debug] 截图保存失败', e.message); }
    }).catch(e => console.error('[debug] capturePage 失败', e.message));
  }, 2500);
}

// ---------- 窗口 ----------
function createWindow() {
  win = new BrowserWindow({
    width: winW,
    height: winH,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // 把渲染进程日志转发到终端，便于排查
  win.webContents.on('console-message', (...args) => {
    const d = (args[1] && typeof args[1] === 'object') ? args[1] : null;
    console.log('[renderer]', d ? d.message : args[2]);
  });
  // 页面加载完就显示窗口（不依赖精灵图是否加载成功）
  win.webContents.on('did-finish-load', () => {
    const wa = screen.getPrimaryDisplay().workArea;
    x = wa.x + (wa.width - winW) / 2;
    y = wa.y + wa.height - winH + PET_BOTTOM;
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: winW, height: winH });
    win.show();
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.send('init', { shiny, petH, spriteUrl: spriteUrlFor(speciesDex, shiny) });
    setState('walk', 3500);
    dir = 1;
    speed = 45;
    if (shiny) bubble('✨ 异色宝可梦出现了 ✨', 4000);
    const hh = new Date().getHours();
    const greet = hh < 5 ? '这么晚还没睡…' : hh < 9 ? '早上好～' : hh < 12 ? '上午好～'
      : hh < 14 ? '中午好～' : hh < 18 ? '下午好～' : '晚上好～';
    setTimeout(() => { if (!inBall) bubble(greet, 2600); }, 1200);
    fetchWeather();
    setInterval(fetchWeather, 15 * 60 * 1000);
    setTimeout(() => checkUpdate(false), 8000);
    setInterval(() => checkUpdate(false), 6 * 60 * 60 * 1000);
  });
}

// ---------- 托盘 ----------
function createTray() {
  // 彩色精灵球图标（比模板图更醒目）
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayPokeball.png'));
  console.log('[main] tray icon 空?', icon.isEmpty(), JSON.stringify(icon.getSize()));
  tray = new Tray(icon);
  tray.setToolTip('神奇宝贝桌宠');
  refreshTray();
  // 部分 macOS 版本首次创建状态栏项不渲染，延迟重设一次
  setTimeout(() => {
    try { tray.setImage(icon); } catch (_) { /* 托盘已销毁 */ }
  }, 1200);
}
function petMenuTemplate() {
  return [
    {
      label: `${speciesInfo().name} · 饱食度 ${Math.round(stats.hunger)} · 心情 ${Math.round(stats.mood)}`
        + ` · ${timeLabel()}`
        + (weather ? ` · ${WEATHER_ICON[weather.kind]}${weather.kind} ${weather.temp}°` : '')
        + ` · v${app.getVersion()}`,
      enabled: false
    },
    { type: 'separator' },
    { label: '喂食 🍞', click: doFeed },
    { label: '玩耍 🎾', click: doPlay },
    { label: '打盹 😴', click: doNap },
    ...(canFlyNow() ? [{ label: '飞一飞 🕊️', click: doFly }] : []),
    { label: inBall ? '放出来 ⚪' : '收进球 ⚪', click: () => toggleBall() },
    { label: '看介绍 📖', click: () => showLore() },
    { label: '叫声', type: 'checkbox', checked: soundOn, click: m => { soundOn = !!m.checked; saveState(); refreshTray(); } },
    { label: '随机一只 🎲', click: () => randomSpecies() },
    { type: 'separator' },
    {
      label: '大小',
      submenu: Object.keys(SIZES).map(k => ({
        label: SIZE_LABEL[k],
        type: 'radio',
        checked: k === sizeKey,
        click: () => setSize(k)
      }))
    },
    { label: '检查更新 ⟳', click: () => checkUpdate(true) },
    { label: '设置…', click: createSettingsWindow },
    { type: 'separator' },
    { label: '退出', click: () => { saveState(); app.quit(); } }
  ];
}
function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(petMenuTemplate()));
}

// ---------- 托盘动作 ----------
function doFeed() {
  if (state === 'drag' || state === 'fall') return;
  stats.hunger = Math.min(100, stats.hunger + 35);
  stats.mood = Math.min(100, stats.mood + 8);
  setState('eat', 2000);
  bubble('美味♪', 1800);
  playCry();
  refreshTray();
  saveState();
}
function doPlay() {
  if (state === 'drag' || state === 'fall') return;
  stats.mood = Math.min(100, stats.mood + 25);
  stats.hunger = Math.max(0, stats.hunger - 4);
  setState('happy', 2200);
  bubble(pick(['波克波克♪', '再来一次!']), 1800);
  refreshTray();
  saveState();
}
function doNap() {
  if (state === 'drag' || state === 'fall') return;
  setState('sleep', 12000);
  bubble('Zzz…', 2200);
}
function doFly() {
  if (state === 'drag' || state === 'fall') return;
  if (!canFlyNow()) { bubble('这只飞不起来呀…', 1800); return; }
  const wa = waFor(x + winW / 2, y + winH / 2);
  const maxAlt = Math.max(80, (wa.height - winH) * 0.55);
  altTarget = 60 + Math.random() * maxAlt;
  dir = Math.random() < 0.5 ? -1 : 1;
  speed = 45 + Math.random() * 45;
  setState('fly', 6000 + Math.random() * 5000);
  bubble('起飞!', 1500);
}
function toggleBall(forceOut) {
  if (inBall || forceOut) {
    inBall = false;
    setState('happy', 900);
    bubble(pick(['出来啦!', '噗!', '🌫️']), 1200);
  } else {
    inBall = true;
    alt = 0;
    setState('ball');
    bubble('晃啊晃…', 1400);
  }
  refreshTray();
}

// ---------- 检查更新 ----------
const UPDATE_CONF = path.join(__dirname, 'update-config.json');

function readUpdateConf() {
  try { return JSON.parse(fs.readFileSync(UPDATE_CONF, 'utf8')); } catch (_) { return {}; }
}
function cmpVer(a, b) {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = A[i] || 0, y = B[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
let updateBusy = false;
async function checkUpdate(manual = true) {
  const conf = readUpdateConf();
  if (!conf.manifest) {
    console.log('[update] 未配置更新源');
    if (manual) bubble('还没配置更新源', 2400);
    return { ok: false, reason: 'no-source' };
  }
  if (updateBusy) return { ok: false, reason: 'busy' };
  updateBusy = true;
  try {
    const sep = conf.manifest.includes('?') ? '&' : '?';
    const url = `${conf.manifest}${sep}t=${Date.now()}`;
    const { body } = await httpGetText(url, 10000);
    const m = JSON.parse(body);
    const cur = app.getVersion();
    const newer = cmpVer(m.version, cur) > 0;
    console.log('[update] 远端', m.version, '本地', cur, '需更新?', newer);
    if (newer) {
      if (manual) bubble(`发现 v${m.version}，正在更新…`, 3200);
      installUpdate(conf.manifest);
    } else if (manual) {
      bubble(`已是最新 v${cur}`, 2400);
    }
    return { ok: true, current: cur, latest: m.version, hasUpdate: newer };
  } catch (e) {
    console.error('[update] 检查失败', e.message);
    if (manual) bubble('连不上更新源', 2400);
    return { ok: false, reason: 'network' };
  } finally {
    updateBusy = false;
  }
}

function installUpdate(manifestUrl) {
  const { spawn } = require('child_process');
  const script = path.join(__dirname, 'tools', 'update.sh');
  if (!fs.existsSync(script)) { bubble('缺少更新脚本', 2400); return; }
  console.log('[update] 启动更新:', manifestUrl);
  spawn('/bin/bash', [script, manifestUrl], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => { saveState(); app.quit(); }, 1500);
}

// ---------- 故事卡 ----------
let loreWin = null, loreTimer = null;

function loreDataFor(dex) {
  const sp = byDex.get(Number(dex)) || speciesInfo();
  const l = LORE[dex] || {};
  return {
    dex: sp.dex,
    name: sp.name,
    types: sp.types || [],
    genus: l.genus || '',
    habitat: l.habitat || '',
    where: l.where || '',
    flavor: l.flavor || '',
    h: l.h || 0,
    w: l.w || 0,
    likes: l.likes || '',
    rare: l.rare || '',
    spriteUrl: spriteUrlFor(sp.dex, shiny)
  };
}

function hideLore() {
  if (loreTimer) { clearTimeout(loreTimer); loreTimer = null; }
  if (loreWin && !loreWin.isDestroyed()) loreWin.hide();
}

function showLore(dex = speciesDex, autoCloseMs = 9000) {
  const data = loreDataFor(dex);
  const w = 372, h = 234;
  if (!loreWin || loreWin.isDestroyed()) {
    loreWin = new BrowserWindow({
      width: w, height: h, frame: false, transparent: true, resizable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: false, show: false,
      webPreferences: {
        preload: path.join(__dirname, 'lore-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    loreWin.setAlwaysOnTop(true, 'floating');
    loreWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    loreWin.loadFile(path.join(__dirname, 'renderer', 'lore.html'));
    loreWin.webContents.on('did-finish-load', () => {
      if (loreWin && !loreWin.isDestroyed()) loreWin.webContents.send('lore:data', loreDataFor(dex));
    });
  } else {
    loreWin.webContents.send('lore:data', data);
  }
  const wa = waFor(x + winW / 2, y + winH / 2);
  let lx = x + winW + 10;
  if (lx + w > wa.x + wa.width - 6) lx = x - w - 10;
  lx = clamp(lx, wa.x + 6, wa.x + wa.width - w - 6);
  const ly = clamp(y + winH - h - 6, wa.y + 6, wa.y + wa.height - h - 6);
  loreWin.setPosition(Math.round(lx), Math.round(ly));
  loreWin.showInactive();
  if (loreTimer) clearTimeout(loreTimer);
  loreTimer = setTimeout(hideLore, autoCloseMs);
}

function randomSpecies() {
  let n = speciesDex;
  for (let i = 0; i < 30 && n === speciesDex; i++) n = pick(SPECIES).dex;
  switchSpecies(n);
  const sp = speciesInfo();
  bubble(`🎲 ${sp.name} · ${sp.types.join('·')}`, 2400);
  refreshTray();
  return { current: sp.dex, name: sp.name, types: sp.types, legend: !!sp.legend };
}
function setSize(k) {
  if (!SIZES[k]) return;
  sizeKey = k;
  petH = SIZES[k];
  const oldW = winW;
  recomputeDims();
  x -= (winW - oldW) / 2;
  clampX();
  y = groundYFor();
  if (win && !win.isDestroyed()) {
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: winW, height: winH });
    win.webContents.send('size', petH);
  }
  saveState();
}

// ---------- 渲染层 IPC ----------
ipcMain.on('sprite-loaded', (_e, nw, nh) => {
  console.log('[main] sprite-loaded', nw, nh);
  if (nw && nh) aspect = nw / nh;
  const oldW = winW;
  recomputeDims();
  x -= (winW - oldW) / 2;
  clampX();
  y = groundYFor();
  if (win && !win.isDestroyed()) {
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: winW, height: winH });
    win.webContents.send('size', petH);
  }
  captureTo(win, 'capture.png');
});
ipcMain.on('lore:close', () => hideLore());
ipcMain.on('context', () => {
  Menu.buildFromTemplate(petMenuTemplate()).popup({});
});
let petAt = 0;
ipcMain.on('pet', () => {
  if (inBall || state === 'drag' || state === 'fall') return;
  const t = now();
  if (t - petAt < 520) return;
  petAt = t;
  stats.mood = Math.min(100, stats.mood + 0.7);
  if (Math.random() < 0.22) {
    setState('happy', 700);
    bubble(pick(['❤️', '♪', '嗯…', '再摸摸']), 1000);
  }
  refreshTray();
});

ipcMain.on('over-pet', (_e, v) => {
  hover = !!v;
  updateIgnore();
});
function updateIgnore() {
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(state !== 'drag' && !hover, { forward: true });
  }
}
ipcMain.on('grab', () => {
  if (state === 'drag' || state === 'fall') return;
  setState('drag', 15000);
});
ipcMain.on('release', (_e, vxIn, vyIn) => {
  if (state !== 'drag') return;
  vx = clamp(Number(vxIn) || 0, -650, 650);
  vy = clamp(Number(vyIn) || 0, -1200, 1100);
  bounceCount = 0;
  hardThrow = Math.abs(vx) > 320 || Math.abs(vy) > 700;
  setState('fall');
});
ipcMain.on('click', () => {
  if (state !== 'drag') return;
  if (inBall) { toggleBall(true); return; }
  const t = now();
  clickTimes = clickTimes.filter(c => t - c < 1600);
  clickTimes.push(t);
  if (clickTimes.length >= 3) {
    clickTimes = [];
    setState('angry', 2600);
    dir = -dir;
    bubble('哼!', 1800);
    playCry();
  } else {
    setState('happy', 1500);
    bubble('❤️', 1400);
    playCry();
    stats.mood = Math.min(100, stats.mood + 3);
  }
  refreshTray();
});

// ---------- 设置 / 开机自启 / 切换宝可梦 ----------
const launchAgentPath = () => path.join(app.getPath('home'), 'Library', 'LaunchAgents', 'local.togepi.pet.autostart.plist');

function loginItemSystemEnabled() {
  try { return !!app.getLoginItemSettings().openAtLogin; } catch (_) { return false; }
}
function loginAgentExists() {
  try { return fs.existsSync(launchAgentPath()); } catch (_) { return false; }
}
function loginAtStartEnabled() { return loginItemSystemEnabled() || loginAgentExists(); }

function bundlePath() {
  const m = String(process.execPath).match(/^(.*\.app)\/Contents\/MacOS\//);
  return m ? m[1] : null;
}

function writeLaunchAgent(on) {
  const p = launchAgentPath();
  if (!on) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return !loginAgentExists();
  }
  const b = bundlePath();
  if (!b) { console.error('[main] 非 .app 方式启动，跳过 LaunchAgent'); return false; }
  fs.writeFileSync(p, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.togepi.pet.autostart</string>
  <key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-a</string><string>${b}</string></array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
`);
  console.log('[main] 已写入 LaunchAgent:', p);
  return true;
}

function setLoginAtStart(on) {
  on = !!on;
  // 1) 系统登录项（macOS 13+ SMAppService，推荐）
  try {
    app.setLoginItemSettings({ openAtLogin: on });
    const st = app.getLoginItemSettings();
    console.log('[main] 系统登录项状态:', JSON.stringify(st));
    if (!!st.openAtLogin === on) return on;
  } catch (e) {
    console.error('[main] setLoginItemSettings 失败:', e.message);
  }
  // 2) 回退：LaunchAgent（~/Library/LaunchAgents 可写时）
  try { writeLaunchAgent(on); } catch (e) { console.error('[main] LaunchAgent 写入失败:', e.message); }
  return loginAtStartEnabled();
}

function switchSpecies(dex) {
  if (!SPECIES.some(s => s.dex === dex)) return;
  speciesDex = dex;
  if (alt > 1 && !canFlyNow()) { alt = 0; altTarget = 0; y = groundYFor(); }
  sentFace = 0;
  if (win && !win.isDestroyed()) win.webContents.send('sprite', { url: spriteUrlFor(dex, shiny) });
  bubble(`${speciesInfo().name}，来啦!`, 2000);
  setTimeout(() => playCry(dex, true), 260);
  refreshTray();
  saveState();
  showLore(dex, 9000);
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const wa = screen.getPrimaryDisplay().workAreaSize;
  settingsWin = new BrowserWindow({
    width: Math.min(780, wa.width - 80), height: Math.min(840, wa.height - 80),
    resizable: false, minimizable: false, maximizable: false,
    title: '神奇宝贝 · 设置',
    backgroundColor: '#f5f5f7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.webContents.on('console-message', (_e, _level, message) => {
    console.log('[settings]', message);
  });
  settingsWin.once('ready-to-show', () => { settingsWin.show(); captureTo(settingsWin, 'settings-capture.png'); });
  settingsWin.on('closed', () => { settingsWin = null; });
}

ipcMain.handle('cfg:get', () => ({
  species: SPECIES.map(s => ({ dex: s.dex, name: s.name, types: s.types, gen: s.gen, legend: !!(s.legend || s.myth) })),
  chains: LINES.map(l => ({ stages: l.stages, hows: l.hows, type: l.type })),
  spriteBase: spriteBase(),
  current: speciesDex,
  loginAtStart: loginAtStartEnabled(),
  sizeKey,
  soundOn,
  version: app.getVersion(),
  total: SPECIES.length
}));
ipcMain.handle('cfg:setSpecies', (_e, dex) => { switchSpecies(Number(dex)); return { current: speciesDex }; });
ipcMain.handle('cfg:random', () => randomSpecies());
ipcMain.handle('cfg:checkUpdate', () => checkUpdate(true));
ipcMain.handle('cfg:setSound', (_e, on) => { soundOn = !!on; saveState(); if (soundOn) playCry(speciesDex, true); refreshTray(); return { soundOn }; });
ipcMain.handle('cfg:setLogin', (_e, on) => ({ loginAtStart: setLoginAtStart(!!on) }));
ipcMain.handle('cfg:setSize', (_e, k) => { setSize(k); return { sizeKey }; });
ipcMain.on('cfg:close', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close(); });

// ---------- 生命周期 ----------
app.on('second-instance', () => { if (win) win.show(); });
app.on('window-all-closed', () => { /* 保持在托盘运行 */ });
app.on('before-quit', saveState);

app.whenReady().then(() => {
  console.log('[debug] whenReady 已触发', JSON.stringify(process.argv));
  loadState();
  petH = SIZES[sizeKey] || 96;
  recomputeDims();
  createTray();                                        // 先建托盘状态项
  if (process.platform === 'darwin') app.dock.setMenu(Menu.buildFromTemplate(petMenuTemplate())); // Dock 菜单兜底
  console.log('[debug] 本次启动保留 Dock 图标（右键 Dock 图标有菜单）');
  createWindow();
  setInterval(tick, 33);
  setInterval(saveState, 30000);
  if (process.argv.includes('--settings')) setTimeout(createSettingsWindow, 1500);
  // 调试钩子：kill -USR2 <pid> 可打开设置窗口
  try { process.on('SIGUSR2', () => createSettingsWindow()); } catch (_) { /* 忽略 */ }


});
