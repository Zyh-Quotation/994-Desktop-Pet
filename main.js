const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, shell, dialog } = require('electron');
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
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
if (IS_WIN) {
  app.setAppUserModelId('com.zyh.togepipet');  // Windows 任务栏/通知归组
  // Windows：Chromium 的原生遮挡检测会把这些透明置顶窗口误判成「被别的窗口盖住了」，
  // 于是暂停绘制 —— 表现就是宠物一闪一闪、甚至整只消失，只留下移动时的残影。
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}
// 开发时把 userData 放进项目目录（便携）；打包成自包含 app 时放系统标准位置
// （否则会往已签名的 bundle 里写文件，破坏签名，也可能没权限）
//
// 不能只看 app.isPackaged：直接执行 .app/Contents/MacOS/Electron 调试时，
// Electron 可能把它当成默认 app（defaultApp=true），userData 就会落进 bundle。
// 所以补一条：app 目录在 .app 里、且不是软链（开发版是软链指向项目），才算打包版。
function isBundledApp() {
  if (app.isPackaged) return true;
  try {
    const appDir = app.getAppPath();
    if (!/\.app\/Contents\/Resources\/app$/.test(appDir)) return false;
    return !fs.lstatSync(appDir).isSymbolicLink();
  } catch (_) {
    return false;
  }
}
const IN_BUNDLE = isBundledApp();
app.setPath('userData', IN_BUNDLE
  ? path.join(app.getPath('appData'), '神奇宝贝')
  : path.join(__dirname, 'userdata'));

// 全新安装（尤其 Intel 版）第一次启动时这个目录还不存在，
// 而日志、单实例锁、存档都要往里写——不先建出来，requestSingleInstanceLock()
// 会因为建不了锁文件而返回 false，进程直接退出，表现为"双击没反应"。
try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); } catch (_) {}

// 日志同时写入 userdata/app.log（打包成 bundle 后没有终端输出）
(function () {
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const write = (level, args) => {
    try {
      const line = new Date().toISOString() + ' [' + level + '] ' +
        args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
      fs.appendFileSync(path.join(app.getPath('userData'), 'app.log'), line);
    } catch (_) { /* 日志失败不影响运行 */ }
  };
  console.log = (...a) => { origLog(...a); write('info', a); };
  console.error = (...a) => { origErr(...a); write('err', a); };
})();

console.log('[debug] main.js 模块加载开始');

// ---------- 单实例 ----------
// 教训：Electron 在 requestSingleInstanceLock() 返回 false 的进程里，
// app.whenReady() 有可能永远不 resolve（实测会挂住）。所以这一段只在模块加载期
// 做同步判断，绝不依赖 ready 事件。
// 另外自己用 ps 扫一遍真实进程：只有真的还有一只在跑才算"第二只"，
// 否则清掉上次崩溃/强退留下的陈旧锁文件继续启动（避免误判成"闪退"）。
const PID_FILE = path.join(app.getPath('userData'), 'instance.pid');
const LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie']
  .map(f => path.join(app.getPath('userData'), f));

function pidFileOwner() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    return pid && pid !== process.pid ? pid : 0;
  } catch (_) { return 0; }
}

function scanOtherInstances() {
  // Windows 上 ps 不可用，退回只看 pid 文件
  if (process.platform === 'win32') return [];
  try {
    const out = require('child_process').execSync('ps -axo pid=,command=', {
      encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore']
    });
    const hits = [];
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(.*)$/);
      if (!m) continue;
      const pid = parseInt(m[1], 10);
      if (pid === process.pid) continue;
      const cmd = m[2];
      // 本应用的两种可执行文件名，AppTranslocation 路径也包含这一段
      if (/\/MacOS\/(Electron|TogepiPet)$/.test(cmd) && /神奇宝贝|togepi/i.test(cmd)) hits.push(pid);
    }
    return hits;
  } catch (_) { return []; }
}

const scanned = scanOtherInstances();
const pidOwner = pidFileOwner();
const OTHERS = [...new Set([...scanned, ...(pidOwner ? [pidOwner] : [])])]
  .filter(pid => { try { process.kill(pid, 0); return true; } catch (_) { return false; } });

if (OTHERS.length === 0) {
  // 没有活着的实例：把可能残留的锁文件清掉，否则 Electron 会误以为已有一只
  for (const f of LOCK_FILES) {
    try { fs.rmSync(f, { recursive: true, force: true }); } catch (_) {}
  }
}

const locked = app.requestSingleInstanceLock();
console.log('[debug] 单实例锁:', locked, '| 其它实例 pid:', OTHERS.join(',') || '无');

if (OTHERS.length > 0 || !locked) {
  // 真的还有一只（或锁就是拿不到）：立刻退出，不碰 ready，也不建托盘。
  // 界面上的反馈由已有那只负责——它会收到 second-instance，冒个泡蹦一下。
  console.log('[main] 已有实例在运行' +
    (OTHERS.length ? '（pid ' + OTHERS.join(',') + '）' : '（锁被占用）') + '，本进程退出');
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'app.log'),
    new Date().toISOString() + ' [info] [main] 第二实例退出，已有实例：' +
    (OTHERS.join(',') || '未知') + '\n'); } catch (_) {}
  app.quit();
} else {
  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch (e) {
    console.error('[main] 写 pid 文件失败:', e && e.message);
  }
}

// ---------- 常量 ----------
const SIZES = { small: 64, medium: 96, large: 128 };
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
let lastWinX = null, lastWinY = null, lastWinW = 0, lastWinH = 0;
let bounceCount = 0;
let hardThrow = false;
let stats = { hunger: 80, mood: 80 };
let sizeKey = 'medium';
let hover = false;
let hungerNagAt = 0, moodNagAt = 0;
let clickTimes = [];
let shiny = false;                  // 当前这只是否用异色图
let shinyMode = 'auto';             // auto（1/128 彩蛋）| always | never
let lastTs = Date.now();
let achCheckAt = 0;
let expAt = 0;
let speciesDex = 175;                // 当前宝可梦（全国图鉴编号）
let settingsWin = null;
let starWin = null;
let starAsked = false;   // 只在第一次打开时问一次要不要去点 Star
let focusMode = false;   // 专注模式：不跑、不冒泡、不打扰
let pomo = null;         // 番茄钟 { phase: 'work' | 'rest', until, workMin, restMin }

// ---------- 收集 / 成就 ----------
let dexMet = [];                     // 遇见过的图鉴编号
let shinyMet = [];                   // 见过异色的编号
let counters = { sig: 0, feed: 0, play: 0, pet: 0, throw: 0, streak: 0, lastDay: '', checkIn: 0, lastCheckIn: '' };
let unlocked = {};                   // 成就 id -> 解锁时间
let lang = 'zh';  // zh | en
try {
  // 打包后才按系统语言判断；开发模式下 getLocale 不可靠，直接中文
  if (app.isPackaged && !String(app.getLocale() || '').toLowerCase().startsWith('zh')) lang = 'en';
} catch (_) {}
let rotateMin = 0;                   // 自动换宝可梦的间隔（分钟），0=关
let rotateAt = 0;
let level = 1;                       // 陪伴等级
let exp = 0;                         // 经验，每 100 一级

const NATURES = [
  { key: 'cheer',  zh: '开朗', en: 'Cheerful', speed: 1.25, sleepMult: .7 },
  { key: 'lazy',   zh: '慵懒', en: 'Lazy',     speed: .8,  sleepMult: 1.4 },
  { key: 'timid',  zh: '胆小', en: 'Timid',    speed: 1.1, flee: true },
  { key: 'tsun',   zh: '傲娇', en: 'Tsundere', speed: 1,   tsun: true },
  { key: 'greedy', zh: '贪吃', en: 'Greedy',   speed: 1,   hungerMult: 1.35 },
  { key: 'sleepy', zh: '爱睡', en: 'Sleepy',   speed: .9,  sleepMult: 1.7 }
];
function natureFor(dex) {
  let h = Math.imul((dex | 0) ^ 0x7f4a7c15, 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return NATURES[(h >>> 0) % NATURES.length];
}
let currentNature = NATURES[0];
let walkedPx = 0;        // 走了多少像素，攒够了给颗蛋
const EGG_MIN = 22000;   // 约 8 分钟纯走路
const EGG_MAX = 58000;   // 约 21 分钟
const EGG_AT = Number(process.env.PET_EGG_AT || 0);   // 调试用固定值，0 表示随机
let eggTarget = EGG_AT || (EGG_MIN + Math.floor(Math.random() * (EGG_MAX - EGG_MIN)));
let hasEgg = false;
let guestWin = null;     // 串门的另一只
let guest = null;        // { dex, x, dir, until, phase: 'in'|'stay'|'out' }
let nextGuestAt = 0;
let guestEnabled = true;
let favorites = [];       // 收藏的图鉴编号
let firstLaunch = 0;      // 第一次打开的时间（生日）
let sitWarnMin = 45;      // 坐多久提醒一次
let waterWarnMin = 60;    // 多久提醒喝水
let lastSitAt = Date.now();
let lastWaterAt = Date.now();
let climbDir = 'up';     // up / hold / down
let climbTop = 80;

const ACHIEVEMENTS = [
  { id: 'first', name: '初次见面', en: 'First meeting', desc: '遇见第一只宝可梦', test: () => dexMet.length >= 1 },
  { id: 'dex10', name: '串门儿', en: 'Visitor', desc: '遇见 10 只', test: () => dexMet.length >= 10 },
  { id: 'dex50', name: '见多识广', en: 'Well-travelled', desc: '遇见 50 只', test: () => dexMet.length >= 50 },
  { id: 'dex200', name: '博物学家', en: 'Naturalist', desc: '遇见 200 只', test: () => dexMet.length >= 200 },
  { id: 'dex1025', name: '图鉴全开', en: 'Full dex', desc: '遇见全部 1025 只', test: () => dexMet.length >= 1025 },
  { id: 'shiny1', name: '异色猎人', en: 'Shiny hunter', desc: '见过一只异色', test: () => shinyMet.length >= 1 },
  { id: 'shiny8', name: '异色收藏家', en: 'Shiny collector', desc: '见齐 8 只原生异色', test: () => shinyMet.length >= 8 },
  { id: 'sig10', name: '初出茅庐', en: 'Getting started', desc: '发动 10 次专属动作', test: () => counters.sig >= 10 },
  { id: 'sig100', name: '招式大师', en: 'Move master', desc: '发动 100 次专属动作', test: () => counters.sig >= 100 },
  { id: 'feed50', name: '饲养员', en: 'Caretaker', desc: '喂食 50 次', test: () => counters.feed >= 50 },
  { id: 'pet500', name: '摸头狂魔', en: 'Head-pat pro', desc: '摸头 500 次', test: () => counters.pet >= 500 },
  { id: 'throw10', name: '投掷训练', en: 'Throw training', desc: '把宠物扔出去 10 次', test: () => counters.throw >= 10 },
  { id: 'streak7', name: '老朋友', en: 'Old friend', desc: '连续陪伴 7 天', test: () => counters.streak >= 7 },
  { id: 'checkin7', name: '每日打卡', en: 'Daily regular', desc: '连续签到 7 天', test: () => counters.checkIn >= 7 }
];

function evolvesAt(how) {
  const m = /Lv\.(\d+)/.exec(how || '');
  if (m) return Number(m[1]);
  if ((how || '').includes('亲密度')) return 20;
  if ((how || '').includes('通信')) return 30;
  return 25;   // 道具 / 地点 / 招式 等简化成等级
}

// 每级需求递增：100, 125, 150 …（Lv.64 约需 5.5 万经验）
function expNeedFor(lv) { return 100 + (lv - 1) * 25; }
function expTotalForLevel(lv) { let t = 0; for (let i = 1; i < lv; i++) t += expNeedFor(i); return t; }
function levelForExp(total) {
  let lv = 1, acc = 0;
  while (lv < 300) {
    const need = expNeedFor(lv);
    if (total < acc + need) break;
    acc += need; lv++;
  }
  return lv;
}

function addExp(n) {
  exp += n;
  const lv = levelForExp(exp);
  if (lv > level) {
    level = lv;
    bubble(`Lv.${level}！`, 1400);
    tryEvolve();
  }
  saveState();
}

function tryEvolve() {
  if (state === 'drag' || state === 'fall' || state === 'ball') return;
  const opts = (EVO_MAP[speciesDex] || []).filter(o => evolvesAt(o.how) <= level);
  if (!opts.length) return;
  doEvolve(opts[Math.floor(Math.random() * opts.length)]);
}

function doEvolve(ev) {
  const to = byDex.get(ev.to);
  if (!to) return;
  const fromName = (byDex.get(speciesDex) || {}).name || '它';
  speciesDex = ev.to;
  shiny = shinyFor(speciesDex);
  currentNature = natureFor(speciesDex);
  if (win && !win.isDestroyed()) {
    win.webContents.send('evolve', { url: spriteUrlFor(speciesDex, shiny), name: to.name });
  }
  markMet(speciesDex);
  markShiny(speciesDex);
  setState('happy', 1600);
  saveState();
  refreshTray();
  console.log(`[evolve] ${fromName} → ${to.name}（${ev.how}）`);
  setTimeout(() => {
    bubble(`✨ ${fromName} 进化成 ${to.name}！`, 5200, true);
    try { playCry(speciesDex, true); } catch (_) {}
  }, 900);
  setTimeout(() => tryEvolve(), 9000);   // 三段进化可能接着来
}

function notifySettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    try { settingsWin.webContents.send('cfg:changed'); } catch (_) {}
  }
}

function markMet(dex) {
  if (!Number.isFinite(dex) || dexMet.includes(dex)) return;
  dexMet.push(dex);
  notifySettings();
  saveState();
  checkAchievements();
}
function markShiny(dex) {
  if (!shiny || !Number.isFinite(dex) || shinyMet.includes(dex)) return;
  shinyMet.push(dex);
  saveState();
  checkAchievements();
}
function updateStreak() {
  const day = new Date().toISOString().slice(0, 10);
  if (counters.lastDay === day) return;
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  counters.streak = counters.lastDay === yest ? (Number(counters.streak) || 0) + 1 : 1;
  counters.lastDay = day;
  saveState();
}
function guestSprite(url) {
  if (!guestWin || guestWin.isDestroyed()) return;
  guestWin.webContents.executeJavaScript(`document.getElementById('s').src = ${JSON.stringify(url)}`).catch(() => {});
}

function spawnGuest() {
  if (guestWin || !guestEnabled || focusMode || inBall) return;
  const pool = SPECIES.filter(sp => sp.dex !== speciesDex);
  const target = pool[Math.floor(Math.random() * pool.length)];
  const wa = waFor(x + winW / 2, y + winH / 2);
  const size = 110;
  const fromLeft = Math.random() < 0.5;
  guestWin = new BrowserWindow({
    width: size, height: size,
    x: Math.round(fromLeft ? wa.x - size : wa.x + wa.width),
    y: Math.round(wa.y + wa.height - size),
    frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  guestWin.setIgnoreMouseEvents(true);
  guestWin.loadFile(path.join(__dirname, 'renderer', 'guest.html'));
  guestWin.once('ready-to-show', () => {
    if (!guestWin || guestWin.isDestroyed()) return;
    guestWin.showInactive();
    guestSprite(spriteUrlFor(target.dex, shinyFor(target.dex)));
  });
  guest = {
    dex: target.dex,
    x: fromLeft ? wa.x - size : wa.x + wa.width,
    dir: fromLeft ? 1 : -1,
    phase: 'in',
    until: now() + 120000,
    size
  };
  nextGuestAt = now() + (12 + Math.random() * 18) * 60000;
  bubble(lang === 'en' ? `${target.name} came by!` : `${target.name} 跑过来串门了`, 3000, true);
}

function updateGuest(t, dt) {
  if (!guest) return;
  const wa = waFor(guest.x + guest.size / 2, guest.y || 0);
  const groundY = wa.y + wa.height - guest.size;
  if (!guestWin || guestWin.isDestroyed()) { guest = null; guestWin = null; return; }

  guest.x += guest.dir * 55 * dt;
  const minX = wa.x - guest.size, maxX = wa.x + wa.width;

  if (guest.phase === 'in' && guest.x > wa.x + 140) guest.phase = 'stay';
  if (guest.phase === 'stay' && t > guest.until - 12000) {
    guest.phase = 'out';
    guest.dir = guest.x > (wa.x + wa.width / 2) ? 1 : -1;
  }
  if (guest.phase === 'out' && (guest.x < minX || guest.x > maxX)) {
    guestWin.destroy();
    guestWin = null;
    guest = null;
    return;
  }
  if (t > guest.until + 40000) {
    guestWin.destroy(); guestWin = null; guest = null;
    return;
  }
  try { guestWin.setBounds({ x: Math.round(guest.x), y: Math.round(groundY), width: guest.size, height: guest.size }); } catch (_) {}
}

function spawnEgg() {
  if (hasEgg) return;
  hasEgg = true;
  if (win && !win.isDestroyed()) win.webContents.send('egg');
  bubble(lang === 'en' ? 'Huh? An egg appeared…' : '咦…这里怎么有个蛋？', 3200, true);
  if (process.env.PET_EGG_CLICK) {
    setTimeout(() => { try { win.webContents.executeJavaScript("document.getElementById('egg').click()"); } catch (_) {} }, 3000);
  }
}

function doHatch() {
  if (!hasEgg) return { ok: false };
  hasEgg = false;
  if (win && !win.isDestroyed()) win.webContents.send('egg-gone');
  // 蛋只孵基础形态：有 from 的说明是进化来的，不能从蛋里出
  const baseForms = SPECIES.filter(sp => !sp.from);
  const unseen = baseForms.filter(sp => !dexMet.includes(sp.dex));
  const pool = unseen.length ? unseen : baseForms;
  const target = pool[Math.floor(Math.random() * pool.length)];
  switchSpecies(target.dex);
  bubble(lang === 'en' ? `It hatched! ${target.name}!` : `蛋孵出来啦！是 ${target.name}！`, 4200, true);
  try { playCry(target.dex, true); } catch (_) {}
  counters.hatch = (counters.hatch || 0) + 1;
  walkedPx = 0;                       // 孵完重新攒下一颗
  eggTarget = EGG_AT || (EGG_MIN + Math.floor(Math.random() * (EGG_MAX - EGG_MIN)));
  addStone(1);
  saveState();
  console.log('[hatch] 孵出', target.dex, target.name, '| 有前置进化?', !!target.from);
  return { ok: true, dex: target.dex, name: target.name };
}

ipcMain.on('hatch', () => { doHatch(); });

function checkSitWater() {
  if (focusMode) return;
  const nowMs = Date.now();
  if (sitWarnMin > 0 && nowMs - lastSitAt > sitWarnMin * 60000) {
    lastSitAt = nowMs;
    bubble(lang === 'en' ? 'Been sitting a while — stretch!' : '坐挺久了吧？起来动一动', 3800, true);
    return;
  }
  if (waterWarnMin > 0 && nowMs - lastWaterAt > waterWarnMin * 60000) {
    lastWaterAt = nowMs;
    bubble(lang === 'en' ? 'Time for some water 💧' : '该喝口水啦 💧', 3200, true);
  }
}

function festivalToday() {
  const d = new Date();
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 12 && day === 25) return { fx: '🎄', zh: '圣诞快乐！', en: 'Merry Christmas!' };
  if (m === 12 && day === 31) return { fx: '🎊', zh: '今晚跨年！', en: "New Year's Eve!" };
  if (m === 1 && day === 1) return { fx: '🎆', zh: '新年快乐！', en: 'Happy New Year!' };
  if (m === 2 && day === 14) return { fx: '💝', zh: '情人节快乐', en: "Happy Valentine's" };
  if (m === 5 && day === 1) return { fx: '🌷', zh: '劳动节快乐', en: 'Happy May Day' };
  if (m === 10 && day === 1) return { fx: '🎉', zh: '国庆快乐！', en: 'Happy National Day' };
  return null;
}

function checkFestival() {
  const f = festivalToday();
  if (!f) return;
  const key = new Date().toISOString().slice(0, 10);
  if (counters.lastFestival === key) return;
  counters.lastFestival = key;
  addExp(80);
  saveState();
  setTimeout(() => bubble(`${f.fx} ${lang === 'en' ? f.en : f.zh}`, 4200, true), 5200);
}

function checkBirthday() {
  if (!firstLaunch) return;
  const born = new Date(firstLaunch), nowD = new Date();
  if (born.getMonth() !== nowD.getMonth() || born.getDate() !== nowD.getDate()) return;
  const year = nowD.getFullYear();
  if (counters.lastBirthday === year) return;
  counters.lastBirthday = year;
  addExp(300);
  saveState();
  const years = year - born.getFullYear();
  setTimeout(() => {
    bubble(years <= 0
      ? (lang === 'en' ? '🎂 It has been a whole year!' : '🎂 今天是我来你桌面的第一年！')
      : (lang === 'en' ? `🎂 ${years} years today!` : `🎂 今天是我 ${years} 岁生日！`), 5000, true);
  }, 7000);
}

function followCursor() {
  if (focusMode) return false;
  try {
    const cur = screen.getCursorScreenPoint();
    const tx = cur.x - winW / 2;
    if (Math.abs(tx - x) < 60) return false;
    dir = tx > x ? 1 : -1;
    setState('walk', 2200 + Math.random() * 1800);
    return true;
  } catch (_) { return false; }
}

const STONE_BY_TYPE = {
  火: '火之石', 水: '水之石', 电: '雷之石', 草: '叶之石', 冰: '冰之石',
  恶: '暗之石', 超能力: '月之石', 妖精: '光之石', 龙: '日之石',
  一般: '觉醒石', 虫: '觉醒石', 幽灵: '暗之石', 格斗: '觉醒石',
  岩石: '觉醒石', 地面: '觉醒石', 飞行: '觉醒石', 毒: '觉醒石', 钢: '觉醒石'
};
function stoneFor() {
  const t = (speciesInfo().types || [])[0];
  return STONE_BY_TYPE[t] || '进化石';
}
function addStone(n = 1) {
  counters.stones = (counters.stones || 0) + n;
  saveState();
}
function useStone() {
  const have = counters.stones || 0;
  if (have <= 0) {
    bubble(lang === 'en' ? 'No stone yet — check in or hatch one' : '还没有进化石，每日签到或孵蛋会给', 3200, true);
    return;
  }
  const opts = EVO_MAP[speciesDex] || [];
  if (!opts.length) {
    bubble(lang === 'en' ? 'It is already at its final form' : '它已经进化到头了', 2800, true);
    return;
  }
  counters.stones = have - 1;
  const stone = stoneFor();
  const ev = opts[Math.floor(Math.random() * opts.length)];
  bubble(lang === 'en' ? `Used a ${stone}!` : `用了${stone}！`, 2200, true);
  doEvolve(ev);
  saveState();
}

function dailyCheckIn() {
  const day = new Date().toISOString().slice(0, 10);
  if (counters.lastCheckIn === day) return false;
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  counters.checkIn = counters.lastCheckIn === yest ? (Number(counters.checkIn) || 0) + 1 : 1;
  counters.lastCheckIn = day;
  addExp(50);
  addStone(1);
  saveState();
  setTimeout(() => {
    bubble(lang === 'en'
      ? `Daily check-in +50 EXP (${counters.checkIn} days in a row)`
      : `今日签到 +50 经验（连续 ${counters.checkIn} 天）`, 3400, true);
  }, 3200);
  checkAchievements();
  return true;
}

// 系统负载：内存吃紧时它会显得累
let systemLoad = 0;
function updateLoad() {
  try {
    const m = process.getSystemMemoryInfo();
    const total = m.total || 0;
    const free = m.free !== undefined ? m.free : (m.available || 0);
    if (total > 0) systemLoad = Math.min(1, Math.max(0, (total - free) / total));
  } catch (_) { systemLoad = 0; }
}

function checkAchievements() {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked[a.id]) continue;
    try { if (a.test()) { unlocked[a.id] = Date.now(); fresh.push(a); } } catch (_) {}
  }
  if (!fresh.length) return;
  saveState();
  refreshTray();
  const a = fresh[0];
  bubble(`🏆 成就解锁：${a.name}`, 4200, true);
  setTimeout(() => { try { playCry(speciesDex, true); } catch (_) {} }, 260);
}

// ---------- 图鉴数据（由 data/pokedex.json 生成，覆盖 001-1025） ----------
const DEX_FILE = path.join(__dirname, 'data', 'pokedex.json');
const DEX_DATA = JSON.parse(fs.readFileSync(DEX_FILE, 'utf8'));
const SPECIES = DEX_DATA.species;
const byDex = new Map(SPECIES.map(s => [s.dex, s]));
// 进化表：from -> [{ to, how }]，伊布这种一个前身多条分支
const EVO_MAP = (() => {
  const m = {};
  for (const sp of SPECIES) {
    if (!sp.from) continue;
    (m[sp.from] = m[sp.from] || []).push({ to: sp.dex, how: sp.how || '' });
  }
  return m;
})();

// 进化链 → 每条链的「分层」结构，用于设置页展示
const LINES = DEX_DATA.chains.map(c => {
  const base = byDex.get(c.stages[0][0]);
  return { stages: c.stages, hows: c.hows, type: (base && base.types[0]) || '' };
}).sort((a, b) => a.stages[0][0] - b.stages[0][0]);

// ---------- 专属动作（由 tools/build-signatures.js 生成） ----------
const SIG_FILE = path.join(__dirname, 'data', 'signatures.json');
let SIGNATURES = {};
try { SIGNATURES = JSON.parse(fs.readFileSync(SIG_FILE, 'utf8')); } catch (e) {
  console.error('[main] 招式表读取失败:', e.message);
}
function signatureFor(dex) {
  const s = SIGNATURES[dex];
  if (s) return s;
  const sp = byDex.get(dex);
  const type = (sp && sp.types && sp.types[0]) || '一般';
  return { move: '撞击', kind: 'star', motion: 'bump', color: '#c8c2b0', type, name: sp ? sp.name : '' };
}

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

// ---------- 专属动作 ----------
let moveCooldown = 0;
function playSignature(reason = 'manual') {
  const t = now();
  if (t < moveCooldown) return false;
  if (state === 'drag' || state === 'fall' || state === 'ball') return false;
  counters.sig++;
  addExp(25);
  const spec = signatureFor(speciesDex);
  console.log('[move] ' + spec.name + ' 使用 ' + spec.move + '（' + spec.kind + '/' + spec.motion + '）' +
    ' bounds=' + JSON.stringify(win ? win.getBounds() : null));
  moveCooldown = t + (reason === 'auto' ? 40000 + Math.random() * 40000 : 6000);
  setState('move', 1200);
  if (win && !win.isDestroyed()) win.webContents.send('fx', spec);
  bubble(spec.move + '！', 1700);
  playCry(speciesDex, true);
  return true;
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

// 异色判定：
// auto 用图鉴编号做确定性哈希（约 1/128），同一只宝可梦每次结果一致，
// 不会切来切去就变；always / never 由用户强制。
function autoShinyFor(dex) {
  // murmur3 收尾混合，1025 只里正好 8 只（约 1/128）
  let h = Math.imul((dex | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return ((h >>> 0) % 128) === 0;
}
function shinyFor(dex) {
  if (shinyMode === 'always') return true;
  if (shinyMode === 'never') return false;
  return autoShinyFor(dex);
}

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
    let d;
    try {
      d = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    } catch (err) {
      const bak = stateFile() + '.bak';
      if (!fs.existsSync(bak)) throw err;
      console.warn('[loadState] 主存档损坏，改用备份');
      d = JSON.parse(fs.readFileSync(bak, 'utf8'));
    }
    stats.hunger = clamp(Number(d.stats?.hunger ?? 80), 0, 100);
    stats.mood = clamp(Number(d.stats?.mood ?? 80), 0, 100);
    if (SIZES[d.sizeKey]) sizeKey = d.sizeKey;
    if (typeof d.soundOn === 'boolean') soundOn = d.soundOn;
    if (d.species && SPECIES.some(s => s.dex === Number(d.species))) speciesDex = Number(d.species);
    if (d.shinyMode === 'auto' || d.shinyMode === 'always' || d.shinyMode === 'never') shinyMode = d.shinyMode;
    if (d.starAsked === true) starAsked = true;
    if (d.focusMode === true) focusMode = true;
    if (d.guestEnabled === false) guestEnabled = false;
    if (Array.isArray(d.favorites)) favorites = d.favorites.filter(n => Number.isFinite(n));
    if (Number.isFinite(d.eggTarget) && d.eggTarget > 1000) eggTarget = d.eggTarget;
    if (Number.isFinite(d.walkedPx)) walkedPx = Math.max(0, d.walkedPx);
    if (Number.isFinite(d.firstLaunch)) firstLaunch = d.firstLaunch;
    if (Number.isFinite(d.sitWarnMin)) sitWarnMin = d.sitWarnMin;
    if (Number.isFinite(d.waterWarnMin)) waterWarnMin = d.waterWarnMin;
    if (Number.isFinite(d.counters && d.counters.stones)) counters.stones = d.counters.stones;
    if (Array.isArray(d.dexMet)) dexMet = d.dexMet.filter(n => Number.isFinite(n));
    if (Array.isArray(d.shinyMet)) shinyMet = d.shinyMet.filter(n => Number.isFinite(n));
    if (d.counters && typeof d.counters === 'object') counters = { ...counters, ...d.counters };
    if (d.unlocked && typeof d.unlocked === 'object') unlocked = d.unlocked;
    if (d.lang === 'zh' || d.lang === 'en') lang = d.lang;
    if (Number.isFinite(d.rotateMin)) rotateMin = d.rotateMin;
    if (Number.isFinite(d.level)) level = d.level;
    if (Number.isFinite(d.exp)) exp = d.exp;
    // 曲线改版后老存档的 exp 可能不足，补到当前等级起点，绝不掉级
    if (!Number.isFinite(exp)) exp = 0;
    if (!Number.isFinite(level) || level < 1) level = 1;
    const needFloor = expTotalForLevel(level);
    if (exp < needFloor) exp = needFloor;

  } catch (_) { /* 首次运行 */ }
  shiny = shinyFor(speciesDex);
}
function saveState() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const file = stateFile();
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({
      stats, sizeKey, soundOn, species: speciesDex, shinyMode, starAsked, focusMode, dexMet, shinyMet, counters, unlocked, level, exp, lang, rotateMin, guestEnabled, favorites, firstLaunch, sitWarnMin, waterWarnMin, eggTarget, walkedPx, savedAt: new Date().toISOString()
    }));
    // 先写临时文件再改名：断电时旧存档仍完整
    try { if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak'); } catch (_) {}
    fs.renameSync(tmp, file);
  } catch (e) { console.error('saveState failed:', e.message); }
}

// ---------- 尺寸 / 定位 ----------
const FX_PAD = 66;          // 放专属动作时粒子要飞出去，窗口四周留出的透明边
function recomputeDims() {
  petW = Math.round(aspect * petH);
  winW = Math.max(petW + (MARGIN_X + FX_PAD) * 2, 150);
  winH = petH + BUBBLE_H + FX_PAD + PET_BOTTOM + 4;
}
function waFor(px, py) {
  // px/py 可能是 NaN，也可能远在所有显示器之外（宠物掉出屏幕时就是这样）。
  // 这一步要是拿不到显示器，地面高度就算成无效值，掉落判定永远不成立，
  // 宠物会一路往下跑出屏幕——Windows 上表现为"只剩声音，找不到宝可梦"。
  const pt = {
    x: Math.round(Number.isFinite(px) ? px : 0),
    y: Math.round(Number.isFinite(py) ? py : 0)
  };
  let d = null;
  try { d = screen.getDisplayNearestPoint(pt); } catch (_) {}
  if (!d) {
    // 退回自己按矩形距离找最近的一块屏
    const dist2 = a => {
      const dx = Math.max(a.x - pt.x, 0, pt.x - (a.x + a.width));
      const dy = Math.max(a.y - pt.y, 0, pt.y - (a.y + a.height));
      return dx * dx + dy * dy;
    };
    d = screen.getAllDisplays().reduce(
      (best, cur) => (!best || dist2(cur) < dist2(best) ? cur : best), null);
  }
  return (d || screen.getPrimaryDisplay()).workArea;
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
  if (!win || win.isDestroyed()) return;
  ensureOnScreen();
  const nx = Math.round(x), ny = Math.round(y);
  // 位置和尺寸都没变就不碰窗口：静止时每帧重设位置会白触发一次重绘，
  // Windows 上容易看出闪烁
  if (nx === lastWinX && ny === lastWinY && winW === lastWinW && winH === lastWinH) return;
  lastWinX = nx; lastWinY = ny; lastWinW = winW; lastWinH = winH;
  if (IS_WIN) win.setBounds({ x: nx, y: ny, width: winW, height: winH });
  else win.setPosition(nx, ny);
}

// 兜底：整只跑到所有显示器之外时，挪回主屏地面。
// Windows 上掉出任务栏下方后，光靠地面判定已经纠正不回来了。
function ensureOnScreen() {
  if (!Number.isFinite(x)) x = 0;
  if (!Number.isFinite(y)) y = 0;
  const areas = screen.getAllDisplays().map(d => d.workArea);
  const cx = x + winW / 2, cy = y + winH / 2;
  const visible = areas.some(a =>
    cx >= a.x - 40 && cx <= a.x + a.width + 40 &&
    cy >= a.y - 40 && cy <= a.y + a.height + 40);
  if (visible) return;
  const wa = screen.getPrimaryDisplay().workArea;
  x = clamp(x, wa.x, Math.max(wa.x, wa.x + wa.width - winW));
  y = wa.y + wa.height - winH + PET_BOTTOM;
  vx = 0; vy = 0;
  if (state === 'fall') land();
}

// ---------- 状态机 ----------
function setState(s, durMs = 0) {
  // 除了飞行相关的状态，其余状态都回到地面
  if (s !== 'ball') inBall = false;
  if (s !== 'fly' && s !== 'landing' && s !== 'climb' && alt > 1) {
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

function bubble(text, ms = 1800, force = false) {
  if (focusMode && !force) return;   // 专注模式不打扰
  if (win && !win.isDestroyed()) win.webContents.send('bubble', { text, ms });
}

function nextRandomState(t) {
  if (focusMode) { setState('idle', 4000); return; }

  const isNightNow = isNight();
  if (!isNightNow && Math.random() < 0.12 && followCursor()) return;

  // 机器忙的时候它也会累
  if (systemLoad > 0.86 && Math.random() < 0.4) {
    setState('idle', 3200 + Math.random() * 3000);
    if (Math.random() < 0.45) bubble(pick(['电脑好烫…', '有点卡…', '累了…']), 2200);
    return;
  }

  // 天气 / 时间的表现
  const wk = weather && weather.kind;
  if (wk === '雪' && Math.random() < 0.35) {
    setState('idle', 2600 + Math.random() * 2200);
    bubble(pick(['❄️', '下雪了!', '好冷…']), 1800);
    return;
  }
  if (wk === '雷' && Math.random() < 0.4) {
    setState('happy', 900);
    bubble(pick(['⚡!', '吓一跳', '打雷了…']), 1600);
    return;
  }
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
  const night = isNightNow;
  const r = Math.random();
  if (badWeather && Math.random() < 0.5) {
    setState('idle', 2500 + Math.random() * 3000);
    if (Math.random() < 0.3) bubble(pick(['外面在下雨…', '不想出去', '好冷…']), 1800);
    return;
  }
  if (night && Math.random() < 0.45 * ((currentNature || NATURES[0]).sleepMult || 1) && Math.random() < 0.9) {
    setState('sleep', 10000 + Math.random() * 12000);
    if (Math.random() < 0.5) bubble('Zzz…', 2200);
    return;
  }
  if (r < 0.4) {
    // 偶尔自己来一发专属动作，让人看见它还有这一手
    if (Math.random() < 0.18 && playSignature('auto')) return;
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
  if (focusMode) return;   // 专注期间不饿也不闹
  if (state === 'sleep') {
    stats.mood = Math.min(100, stats.mood + dt * 0.8);
    stats.hunger = Math.max(0, stats.hunger - dt * 0.01);
  } else {
    // 醒着时约 2.3 小时饿、3.5 小时心情见底（原来是 37 / 55 分钟，太催了）
    stats.hunger = Math.max(0, stats.hunger - dt * 0.008 * ((currentNature || NATURES[0]).hungerMult || 1));
    stats.mood = Math.max(0, stats.mood - dt * 0.008);
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
// 主循环外面再套一层：任何意外都不许把窗口永远留在屏幕外
function tick() {
  try {
    tickStep();
  } catch (e) {
    console.error('[tick] 异常，已拉回屏幕:', e && e.message);
    try {
      vx = 0; vy = 0;
      ensureOnScreen();
      if (win && !win.isDestroyed()) win.setPosition(Math.round(x), Math.round(y));
    } catch (_) {}
  }
}

function tickStep() {
  const t = now();
  const dt = Math.min(100, t - lastTs) / 1000;
  lastTs = t;
  if (!win || win.isDestroyed()) return;

  tickPomodoro(t);
  if (t > achCheckAt) { achCheckAt = t + 15000; checkAchievements(); }
  if (t > expAt) { expAt = t + 60000; if (!focusMode) addExp(10); }
  if (rotateMin > 0 && t > rotateAt) { rotateAt = t + rotateMin * 60000; if (dexMet.length > 1) randomSpecies(); }
  checkSitWater();
  if (guestEnabled && !guest && t > nextGuestAt) spawnGuest();
  updateGuest(t, dt);
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
    // 数值意外时直接落地，免得越掉越远再也回不来
    if (!Number.isFinite(x)) x = wa.x;
    if (!Number.isFinite(y)) y = groundY;
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
  } else if (state === 'climb') {
    const wac = waFor(x + winW / 2, y + winH / 2);
    if (climbDir === 'up') {
      alt += 70 * dt;
      if (alt >= climbTop) { alt = climbTop; climbDir = 'hold'; stateUntil = t + 6000 + Math.random() * 8000; }
    } else if (climbDir === 'hold') {
      if (t > stateUntil) climbDir = 'down';
    } else {
      alt -= 110 * dt;
      if (alt <= 0) { alt = 0; climbDir = 'up'; setState('idle', 1200 + Math.random() * 1500); }
    }
    y = clamp(groundY - alt, wac.y + 16, groundY);
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
    if (state === 'walk' && currentNature && currentNature.flee) {
      const cur = screen.getCursorScreenPoint();
      const dx = cur.x - (x + winW / 2);
      if (Math.abs(dx) < 130 && Math.abs(cur.y - (y + winH / 2)) < 190) dir = dx > 0 ? -1 : 1;
    }
    if (state === 'walk') {
      x += dir * speed * ((currentNature || NATURES[0]).speed || 1) * dt;
      const waW = waFor(x + winW / 2, y + winH / 2);
      if ((x <= waW.x + 1 || x + winW >= waW.x + waW.width - 1) && Math.random() < 0.25) {
        climbTop = Math.max(50, (waW.height - winH) * (0.2 + Math.random() * 0.3));
        climbDir = 'up';
        alt = 0;
        setState('climb', 45000);
        bubble(pick(['爬上去咯', '这里视野好', '贴在边上']), 2400);
      }
      walkedPx += Math.abs(speed * ((currentNature || NATURES[0]).speed || 1) * dt);
      counters.walked = (counters.walked || 0) + Math.abs(speed * ((currentNature || NATURES[0]).speed || 1) * dt);
      if (walkedPx > eggTarget && !hasEgg && !inBall) { walkedPx = 0; spawnEgg(); }
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
      nodeIntegration: false,
      // 桌宠窗口经常处于「没焦点/被判定为不可见」的状态，
      // 默认节流会把动画降到 1fps 甚至停住，看起来就是卡顿和频闪
      backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
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
    // 装好第一次打开时，等它露面十几秒再问，别一启动就糊脸
    setTimeout(() => { if (!starAsked && !inBall) createStarWindow(); }, 12000);
    if (process.env.PET_SHARE) setTimeout(() => makeShareCard(process.env.PET_SHARE), 3000);
    if (process.env.PET_SETTINGS) setTimeout(() => createSettingsWindow(), 2500);
    if (process.env.PET_DIAG) setTimeout(async () => {
      console.log('[diag] settingsWin?', !!settingsWin, settingsWin && !settingsWin.isDestroyed());
      if (!settingsWin) return;
      const t0 = Date.now();
      try {
        const r = await settingsWin.webContents.executeJavaScript("JSON.stringify({cards:document.querySelectorAll('.card').length,locked:document.querySelectorAll('.card.locked').length,listH:document.getElementById('list').scrollHeight,clientH:document.getElementById('list').clientHeight})");
        console.log('[diag]', Date.now()-t0, 'ms', r);
        await settingsWin.webContents.executeJavaScript("document.getElementById('list').scrollTop=800");
        console.log('[diag] scrollTop=', await settingsWin.webContents.executeJavaScript("document.getElementById('list').scrollTop"));
      } catch (e) { console.log('[diag] 失败', e.message); }
    }, 9000);
    if (process.env.PET_EGG === '1') setTimeout(() => spawnEgg(), 4000);
    if (process.env.PET_REPORT) setTimeout(() => createReportWindow(), 2500);
    if (process.env.PET_GAME) setTimeout(() => createGameWindow(), 2500);
    if (process.env.PET_EGGWIN) setTimeout(() => createEggWindow(), 2500);
    if (process.env.PET_DIAG2) setTimeout(async () => {
      try {
        const r = await settingsWin.webContents.executeJavaScript(`
          (async () => {
            const c = await window.cfg.get();
            return JSON.stringify({
              unlockedInDOM: document.querySelectorAll('.card:not(.locked)').length,
              dexMetLen: c.dexMet.length,
              hasPulse: typeof window.cfg.dexPulse,
              hasOnChanged: typeof window.cfg.onChanged
            });
          })()`);
        console.log('[diag2]', r);
      } catch (e) { console.log('[diag2] 失败', e.message); }
    }, 14000);
    if (process.env.PET_EVOLVE_TEST) setTimeout(() => {
      const evs = EVO_MAP[speciesDex] || [];
      console.log('[evolve-test] 当前', speciesDex, 'Lv', level, '可进化到', JSON.stringify(evs));
      if (evs.length) doEvolve(evs[0]);
    }, 6000);
    if (process.env.PET_CLIMB === '1') setTimeout(() => { climbDir = 'up'; climbTop = 220; alt = 0; setState('climb', 45000); }, 1200);
    if (process.env.PET_CLIMB === '1') setTimeout(() => { try { console.log('[climb] y=', win.getBounds().y, 'state=', state, 'alt=', Math.round(alt)); } catch (_) {} }, 6000);
    if (process.env.PET_STONE === '1') { counters.stones = 3; saveState(); setTimeout(() => useStone(), 5000); }
    nextGuestAt = now() + (6 + Math.random() * 8) * 60000;
    if (process.env.PET_GUEST === '1') setTimeout(() => spawnGuest(), 4000);
  });
}

// ---------- 托盘 ----------
function createTray() {
  // 彩色精灵球图标（比模板图更醒目）
  const iconPath = path.join(__dirname, 'assets', IS_WIN ? 'tray.png' : 'trayPokeball.png');
  const icon = nativeImage.createFromPath(iconPath);
  console.log('[main] tray icon 空?', icon.isEmpty(), JSON.stringify(icon.getSize()));
  tray = new Tray(icon);
  tray.setToolTip('神奇宝贝桌宠');
  refreshTray();
  // 部分 macOS 版本首次创建状态栏项不渲染，延迟重设一次
  setTimeout(() => {
    try { tray.setImage(icon); } catch (_) { /* 托盘已销毁 */ }
  }, 1200);
}
// ---------- 拍照分享卡 ----------
let shareWin = null;
async function makeShareCard(savePath) {
  try {
    if (shareWin && !shareWin.isDestroyed()) shareWin.destroy();
    const sp = loreDataFor(speciesDex);
    shareWin = new BrowserWindow({
      width: 640, height: 420, show: false, frame: false,
      backgroundColor: '#f6f7fb',
      webPreferences: {
        preload: path.join(__dirname, 'renderer', 'share-preload.js'),
        contextIsolation: true, nodeIntegration: false
      }
    });
    await shareWin.loadFile(path.join(__dirname, 'renderer', 'share.html'));
    const spec = signatureFor(speciesDex) || {};
    const data = {
      dex: sp.dex, name: sp.name, types: sp.types || [], genus: sp.genus || '',
      flavor: sp.flavor || '', shiny, spriteUrl: sp.spriteUrl,
      move: spec.move || '',
      date: new Date().toLocaleDateString('zh-CN')
    };
    await new Promise(res => {
      let done = false;
      const fin = () => { if (done) return; done = true; ipcMain.removeListener('share-ready', fin); res(); };
      ipcMain.on('share-ready', fin);
      setTimeout(fin, 2600);
      shareWin.webContents.send('share-data', data);
    });
    await new Promise(r => setTimeout(r, 260));
    const img = await shareWin.webContents.capturePage();
    shareWin.destroy(); shareWin = null;
    if (savePath) { fs.writeFileSync(savePath, img.toPNG()); console.log('[share] 已保存', savePath); return; }
    const dir = app.getPath('pictures') || app.getPath('desktop');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '保存图鉴卡',
      defaultPath: path.join(dir, `神奇宝贝-${sp.name}.png`),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    });
    if (canceled || !filePath) return;
    fs.writeFileSync(filePath, img.toPNG());
    bubble('图鉴卡存好啦 📸', 2400, true);
    shell.showItemInFolder(filePath);
  } catch (e) {
    console.error('[share] 生成失败', e);
    bubble('图鉴卡生成失败…', 2200, true);
  }
}

function setLang(v) {
  lang = v === 'en' ? 'en' : 'zh';
  saveState();
  refreshTray();
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('lang', lang);
  bubble(lang === 'en' ? 'Switched to English' : '换成中文啦', 1600, true);
}

function setRotate(min) {
  rotateMin = Number(min) || 0;
  rotateAt = now() + rotateMin * 60000;
  bubble(rotateMin
    ? (lang === 'en' ? `New Pokémon every ${rotateMin} min` : `每 ${rotateMin} 分钟换一只新的`)
    : (lang === 'en' ? 'Auto switch off' : '不自动切换了'), 1900, true);
  saveState();
  refreshTray();
}

function setFocus(on) {
  focusMode = !!on;
  if (focusMode) {
    altTarget = 0; alt = 0;
    y = groundYFor();
    setState('idle', 3600000);
  }
  bubble(focusMode ? '专注模式，我不吵你 🎯' : '我回来啦', 1600, true);
  updateIgnore();
  refreshTray();
  saveState();
}


function startPomodoro(min = 25) {
  pomo = { phase: 'work', until: Date.now() + min * 60000, restMin: 5 };
  bubble(`好，专注 ${min} 分钟 ⏱`, 2400, true);
  refreshTray();
}

function stopPomodoro() {
  pomo = null;
  bubble('番茄钟停啦', 1600, true);
  refreshTray();
}

function tickPomodoro(t) {
  if (!pomo || t < pomo.until) return;
  if (pomo.phase === 'work') {
    bubble('时间到！起来动一动 🧘', 9000, true);
    try { playCry(speciesDex, true); } catch (_) {}
    setState('happy', 2600);
    pomo = { ...pomo, phase: 'rest', until: t + pomo.restMin * 60000 };
  } else {
    bubble('休息结束，继续加油 💪', 6000, true);
    pomo = null;
  }
  refreshTray();
}

function setShinyMode(mode) {
  shinyMode = mode;
  shiny = shinyFor(speciesDex);
  if (win && !win.isDestroyed()) {
    win.webContents.send('sprite', { url: spriteUrlFor(speciesDex, shiny) });
  }
  saveState();
  refreshTray();
  bubble(shiny ? `✨ 异色 ${speciesInfo().name}` : speciesInfo().name, 1600);
}

function petMenuTemplate() {
  const L = (zh, en) => (lang === 'en' ? en : zh);
  return [
    {
      label: `${speciesInfo().name} · ${L((currentNature || NATURES[0]).zh, (currentNature || NATURES[0]).en)} · Lv.${level} · ${L('饱食度', 'Hunger')} ${Math.round(stats.hunger)} · ${L('心情', 'Mood')} ${Math.round(stats.mood)}`,
      enabled: false
    },
    { type: 'separator' },
    { label: L('喂食 🍞', 'Feed 🍞'), click: doFeed },
    { label: L('玩耍 🎾', 'Play 🎾'), click: doPlay },
    { label: L('打盹 😴', 'Nap 😴'), click: doNap },
    ...(canFlyNow() ? [{ label: L('飞一飞 🕊️', 'Fly 🕊️'), click: doFly }] : []),
    { label: inBall ? L('放出来 ⚪', 'Let out ⚪') : L('收进球 ⚪', 'Into ball ⚪'), click: () => toggleBall() },
    { label: L('专属动作 ✨', 'Signature move ✨'), click: () => playSignature('manual') },
    { label: L(`用${stoneFor()}进化 ✨ (${counters.stones || 0})`, `Evolve with stone ✨ (${counters.stones || 0})`), click: useStone },
    { label: L('随机一只 🎲', 'Random 🎲'), click: () => randomSpecies() },
    { label: L('看介绍 📖', 'Profile 📖'), click: () => showLore() },
    { type: 'separator' },
    { label: L('设置…', 'Settings…'), click: createSettingsWindow },
    { label: L('退出', 'Quit'), click: () => { saveState(); app.quit(); } }
  ];
}
function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(petMenuTemplate()));
}

// ---------- 托盘动作 ----------
function doFeed() {
  if (state === 'drag' || state === 'fall') return;
  stats.hunger = Math.min(100, stats.hunger + 40);
  stats.mood = Math.min(100, stats.mood + 8);
  counters.feed++;
  addExp(60);
  if (win && !win.isDestroyed()) win.webContents.send('feed-fx');
  setState('eat', 2400);
  bubble('美味♪', 1800);
  playCry();
  refreshTray();
  saveState();
}
function doPlay() {
  if (state === 'drag' || state === 'fall') return;
  stats.mood = Math.min(100, stats.mood + 25);
  stats.hunger = Math.max(0, stats.hunger - 4);
  counters.play++;
  addExp(45);
  if (win && !win.isDestroyed()) win.webContents.send('play-fx');
  setState('happy', 2600);
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
  // Windows 上没法替换正在运行的 exe，直接把人送到下载页
  if (IS_WIN) {
    shell.openExternal('https://github.com/Zyh-Quotation/994-Desktop-Pet/releases/latest');
    bubble('新版已在浏览器打开，下载后解压覆盖', 6000);
    return;
  }
  const { spawn } = require('child_process');
  const script = path.join(__dirname, 'tools', 'update.sh');
  try {
    spawn('/bin/bash', [script, manifestUrl], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {
    console.error('[update] 启动更新脚本失败', e.message);
    bubble('更新失败，请手动下载', 3000);
  }
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
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });
    loreWin.setAlwaysOnTop(true, 'floating');
    if (IS_MAC) loreWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
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
  const pool = dexMet.length ? SPECIES.filter(sp => dexMet.includes(sp.dex)) : SPECIES;
  if (pool.length <= 1) {
    bubble(lang === 'en'
      ? 'Only one unlocked — hatch an egg or evolve first'
      : '只解锁了这一只，先孵颗蛋或进化吧', 3200, true);
    refreshTray();
    return { current: speciesDex };
  }
  let n = speciesDex;
  for (let i = 0; i < 30 && n === speciesDex && pool.length > 1; i++) n = pick(pool).dex;
  if (n === speciesDex && pool.length) n = pool[0].dex;
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
  counters.pet++;
  addExp(2);
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
ipcMain.on('context-menu', () => {
  if (!win || win.isDestroyed()) return;
  try { Menu.buildFromTemplate(petMenuTemplate()).popup({ window: win }); } catch (e) { console.error('[menu]', e); }
});
ipcMain.on('grab', () => {
  if (state === 'drag' || state === 'fall') return;
  setState('drag', 15000);
});
ipcMain.on('release', (_e, vxIn, vyIn) => {
  if (state !== 'drag') return;
  vx = clamp(Number(vxIn) || 0, -650, 650);
  vy = clamp(Number(vyIn) || 0, -1200, 1100);
  bounceCount = 0;
  counters.throw++;
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
  notifySettings();
  if (!SPECIES.some(s => s.dex === dex)) return;
  speciesDex = dex;
  if (alt > 1 && !canFlyNow()) { alt = 0; altTarget = 0; y = groundYFor(); }
  sentFace = 0;
  shiny = shinyFor(dex);
  markMet(dex);
  markShiny(dex);
  if (win && !win.isDestroyed()) win.webContents.send('sprite', { url: spriteUrlFor(dex, shiny) });
  bubble(`${speciesInfo().name}，来啦!`, 2000);
  setTimeout(() => playCry(dex, true), 260);
  refreshTray();
  saveState();
  showLore(dex, 9000);
}

// ---------- 第一次打开：问一句要不要去点 Star ----------
let eggWin = null;

function createEggWindow() {
  if (eggWin && !eggWin.isDestroyed()) { eggWin.show(); eggWin.focus(); return; }
  eggWin = new BrowserWindow({
    width: 360, height: 560, resizable: false, minimizable: false, maximizable: false,
    title: '孵蛋', backgroundColor: '#fffdf3', show: false, alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'egg-preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  eggWin.loadFile(path.join(__dirname, 'renderer', 'egg.html'));
  eggWin.once('ready-to-show', () => {
    eggWin.show();
    if (process.env.PET_CAPTURE) captureTo(eggWin, 'egg-shot.png');
  });
  eggWin.on('closed', () => { eggWin = null; });
}

ipcMain.handle('egg:get', () => ({
  hasEgg,
  eggProgress: Math.min(1, walkedPx / eggTarget),
  eggAt: eggTarget,
  eggs: counters.hatch || 0,
  stones: counters.stones || 0
}));
ipcMain.handle('egg:hatch', () => doHatch());
ipcMain.on('egg:close', () => { if (eggWin && !eggWin.isDestroyed()) eggWin.close(); });

let gameWin = null;

function createGameWindow() {
  if (gameWin && !gameWin.isDestroyed()) { gameWin.show(); gameWin.focus(); return; }
  gameWin = new BrowserWindow({
    width: 420, height: 560, resizable: false, minimizable: false, maximizable: false,
    title: '接球小游戏', backgroundColor: '#eef6ff', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'game-preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  gameWin.loadFile(path.join(__dirname, 'renderer', 'game.html'));
  gameWin.webContents.once('did-finish-load', () => {
    const url = spriteUrlFor(speciesDex, shinyFor(speciesDex));
    gameWin.webContents.executeJavaScript(`window.setPet(${JSON.stringify(url)})`).catch(() => {});
    if (process.env.PET_GAME === '2') {
      setTimeout(() => { try { gameWin.webContents.executeJavaScript("document.getElementById('start').click()"); } catch (_) {} }, 1200);
      setTimeout(async () => {
        try {
          const img = await gameWin.webContents.capturePage();
          fs.writeFileSync(path.join(__dirname, 'game-shot.png'), img.toPNG());
          console.log('[game] 截图完成 score=', await gameWin.webContents.executeJavaScript("document.getElementById('score').textContent"));
        } catch (_) {}
      }, 9000);
    }
  });
  gameWin.once('ready-to-show', () => {
    gameWin.show();
    if (process.env.PET_CAPTURE) captureTo(gameWin, 'game-shot.png');
  });
  gameWin.on('closed', () => { gameWin = null; });
}

ipcMain.on('game:done', (_e, score) => {
  const n = Math.max(0, Math.min(200, Number(score) || 0));
  if (n <= 0) return;
  addExp(n * 8);
  counters.play = (counters.play || 0) + 1;
  saveState();
  bubble(lang === 'en' ? `Caught ${n}! +${n * 8} EXP` : `接住 ${n} 个！经验 +${n * 8}`, 3200, true);
});
ipcMain.on('game:close', () => { if (gameWin && !gameWin.isDestroyed()) gameWin.close(); });

let reportWin = null;

function reportData() {
  const days = firstLaunch ? Math.max(1, Math.floor((Date.now() - firstLaunch) / 86400000) + 1) : 1;
  return {
    days,
    hours: Math.floor((counters.runningMs || 0) / 3600000),
    meters: Math.round((counters.walked || 0) / 50),
    feed: counters.feed || 0,
    play: counters.play || 0,
    pet: counters.pet || 0,
    thrown: counters.throw || 0,
    sig: counters.sig || 0,
    met: dexMet.length,
    shiny: shinyMet.length,
    total: SPECIES.length,
    hatch: counters.hatch || 0,
    streak: counters.streak || 1,
    level,
    expInLevel: Math.max(0, exp - expTotalForLevel(level)),
    expNeed: expNeedFor(level),
    firstLaunch
  };
}

function createReportWindow() {
  if (reportWin && !reportWin.isDestroyed()) { reportWin.show(); reportWin.focus(); return; }
  reportWin = new BrowserWindow({
    width: 460, height: 740, resizable: false, minimizable: false, maximizable: false,
    title: '陪伴报告', backgroundColor: '#ffffff', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'report-preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  reportWin.loadFile(path.join(__dirname, 'renderer', 'report.html'));
  reportWin.once('ready-to-show', () => {
    reportWin.show();
    if (process.env.PET_CAPTURE) captureTo(reportWin, 'report-shot.png');
  });
  reportWin.on('closed', () => { reportWin = null; });
}

ipcMain.handle('report:get', () => reportData());
ipcMain.handle('report:save', async () => {
  if (!reportWin || reportWin.isDestroyed()) return { ok: false };
  try {
    const img = await reportWin.webContents.capturePage();
    const file = path.join(app.getPath('desktop'), `陪伴报告-${new Date().toISOString().slice(0, 10)}.png`);
    fs.writeFileSync(file, img.toPNG());
    return { ok: true, file };
  } catch (e) { return { ok: false, reason: e.message }; }
});
ipcMain.on('report:close', () => { if (reportWin && !reportWin.isDestroyed()) reportWin.close(); });

function createStarWindow() {
  if (starWin && !starWin.isDestroyed()) { starWin.show(); return; }
  starWin = new BrowserWindow({
    width: 400, height: 258,
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'star-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  starWin.loadFile(path.join(__dirname, 'renderer', 'star.html'));
  starWin.once('ready-to-show', () => {
    starWin.center();
    starWin.show();
    starWin.focus();
    console.log('[star] 首次启动弹窗已显示');
    captureTo(starWin, 'star-capture.png');
  });
  starWin.on('closed', () => { starWin = null; });
}

function markStarAsked() {
  starAsked = true;
  saveState();
}

ipcMain.on('star:go', () => {
  markStarAsked();
  shell.openExternal('https://github.com/Zyh-Quotation/994-Desktop-Pet');
  if (starWin && !starWin.isDestroyed()) starWin.close();
});
ipcMain.on('star:later', () => {
  markStarAsked();
  if (starWin && !starWin.isDestroyed()) starWin.close();
});

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const wa = screen.getPrimaryDisplay().workAreaSize;
  settingsWin = new BrowserWindow({
    width: Math.min(820, wa.width - 80), height: Math.min(840, wa.height - 80),
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
  if (process.env.PET_CAPTURE) {
    settingsWin.webContents.once('did-finish-load', async () => {
      if (process.env.PET_SETTINGS === '2') {
        try { await settingsWin.webContents.executeJavaScript("document.getElementById('tab-opts').click()"); } catch (_) {}
        await new Promise(r => setTimeout(r, 600));
      }
      if (process.env.PET_SETTINGS === '5') {
        try { await settingsWin.webContents.executeJavaScript("document.getElementById('tab-bag').click()"); } catch (_) {}
        await new Promise(r => setTimeout(r, 700));
      }
      if (process.env.PET_SETTINGS === '4') {
        try { await settingsWin.webContents.executeJavaScript("document.getElementById('tab-ach').click()"); } catch (_) {}
        await new Promise(r => setTimeout(r, 700));
      }
      if (process.env.PET_SETTINGS === '3') {
        try {
          await settingsWin.webContents.executeJavaScript(
            "const f=document.querySelector('.card-fav'); if(f) f.click();");
        } catch (_) {}
        await new Promise(r => setTimeout(r, 900));
      }
      captureTo(settingsWin, 'settings-capture.png');
    });
  }
  settingsWin.webContents.on('console-message', (_e, _level, message) => {
    console.log('[settings]', message);
  });
  settingsWin.once('ready-to-show', () => { settingsWin.show(); captureTo(settingsWin, 'settings-capture.png'); });
  settingsWin.on('closed', () => { settingsWin = null; });
}

function cfgSnapshot() {
  return {
    current: speciesDex,
    sizeKey, soundOn,
    loginAtStart: loginAtStartEnabled(),
    shinyMode, rotateMin, lang, focusMode, guestEnabled, favorites,
    nature: { zh: (currentNature || NATURES[0]).zh, en: (currentNature || NATURES[0]).en },
    dexMet: dexMet.slice(),
    stones: counters.stones || 0,
    eggs: counters.hatch || 0,
    hasEgg,
    eggProgress: Math.min(1, walkedPx / eggTarget),
    eggAt: eggTarget,
    checkedIn: counters.lastCheckIn === new Date().toISOString().slice(0, 10),
    checkInDays: counters.checkIn || 0,
    pomo: pomo ? { phase: pomo.phase, left: Math.max(0, pomo.until - Date.now()) } : null,
    level, exp,
    expInLevel: Math.max(0, exp - expTotalForLevel(level)),
    expNeed: expNeedFor(level),
    met: dexMet.length, shinyMet: shinyMet.length, total: SPECIES.length,
    achievements: ACHIEVEMENTS.map(a => ({ id: a.id, name: a.name, en: a.en || a.name, desc: a.desc, unlocked: !!unlocked[a.id] })),
    streak: counters.streak || 1, sig: counters.sig,
    version: app.getVersion()
  };
}

ipcMain.handle('cfg:dexPulse', () => ({ n: dexMet.length, cur: speciesDex, level }));
ipcMain.handle('cfg:get', () => ({
  species: SPECIES.map(s => ({ dex: s.dex, name: s.name, types: s.types, gen: s.gen, legend: !!(s.legend || s.myth) })),
  chains: LINES.map(l => ({ stages: l.stages, hows: l.hows, type: l.type })),
  spriteBase: spriteBase(),
  ...cfgSnapshot()
}));

ipcMain.handle('cfg:setOpt', (_e, key, value) => {
  try {
    if (key === 'size') setSize(value);
    else if (key === 'shiny') setShinyMode(value);
    else if (key === 'rotate') setRotate(Number(value) || 0);
    else if (key === 'lang') setLang(value);
    else if (key === 'focus') setFocus(!!value);
    else if (key === 'guest') { guestEnabled = !!value; nextGuestAt = now() + 5 * 60000; saveState(); }
    else if (key === 'sound') { soundOn = !!value; saveState(); refreshTray(); }
    else if (key === 'login') setLoginAtStart(!!value);
  } catch (e) { console.error('[cfg:setOpt]', key, e); }
  return cfgSnapshot();
});

ipcMain.handle('cfg:action', async (_e, name) => {
  try {
    if (name === 'random') randomSpecies();
    else if (name === 'share') await makeShareCard();
    else if (name === 'pomo25') startPomodoro(25);
    else if (name === 'pomo45') startPomodoro(45);
    else if (name === 'pomoStop') stopPomodoro();
    else if (name === 'report') createReportWindow();
    else if (name === 'game') createGameWindow();
    else if (name === 'eggwin') createEggWindow();
    else if (name === 'checkin') {
      if (!dailyCheckIn()) bubble(lang === 'en' ? 'Already checked in today' : '今天已经签到过啦', 2600, true);
    }
  } catch (e) { console.error('[cfg:action]', name, e); }
  return cfgSnapshot();
});
ipcMain.handle('cfg:setSpecies', (_e, dex) => {
  const d = Number(dex);
  if (!dexMet.includes(d)) return { current: speciesDex, locked: true };
  switchSpecies(d);
  return { current: speciesDex };
});
ipcMain.handle('cfg:random', () => randomSpecies());
ipcMain.handle('cfg:checkUpdate', () => checkUpdate(true));
ipcMain.handle('cfg:setSound', (_e, on) => { soundOn = !!on; saveState(); if (soundOn) playCry(speciesDex, true); refreshTray(); return { soundOn }; });
ipcMain.handle('cfg:setLogin', (_e, on) => ({ loginAtStart: setLoginAtStart(!!on) }));
ipcMain.handle('cfg:setSize', (_e, k) => { setSize(k); return { sizeKey }; });
ipcMain.handle('cfg:setFav', (_e, dex, on) => {
  const d = Number(dex);
  if (Number.isFinite(d)) {
    if (on && !favorites.includes(d)) favorites.push(d);
    if (!on) favorites = favorites.filter(x => x !== d);
    saveState();
  }
  return { favorites };
});
ipcMain.on('cfg:close', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close(); });

// ---------- 生命周期 ----------
app.on('second-instance', () => {
  // 有人又双击了一次：把宠物叫出来动一下，别让人以为没反应
  console.log('[main] 收到 second-instance，叫醒宠物');
  if (!win || win.isDestroyed()) return;
  win.show();
  win.moveTop();
  bubble('我在这儿呢～', 3000);
  altTarget = 46;                            // 蹦一下
  setTimeout(() => { altTarget = 0; }, 700);
});
app.on('window-all-closed', () => { /* 保持在托盘运行 */ });
app.on('before-quit', () => {
  saveState();
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid === process.pid) fs.unlinkSync(PID_FILE);   // 只删自己写的
  } catch (_) {}
});

app.whenReady().then(() => {
  // 开发时跑的是 Electron 本体，Dock 默认显示 Electron 原子图标，这里换成自己的
  if (IS_MAC && app.dock) {
    try { app.dock.setIcon(path.join(__dirname, 'assets', 'app-icon.png')); } catch (_) {}
  }
  console.log('[debug] whenReady 已触发', JSON.stringify(process.argv));
  loadState();
  if (!firstLaunch) { firstLaunch = Date.now(); saveState(); }
  if (!dexMet.length) {
    const starters = [1, 4, 7, 25, 133, 152, 155, 158, 252, 255, 258, 387, 390, 393];
    const pickDex = starters[Math.floor(Math.random() * starters.length)];
    speciesDex = pickDex;
    markMet(pickDex);
    saveState();
  }
  updateStreak();
  dailyCheckIn();
  checkFestival();
  checkBirthday();
  updateLoad();
  setInterval(updateLoad, 30000);
  setInterval(() => { counters.runningMs = (counters.runningMs || 0) + 60000; if (Math.random() < 0.1) saveState(); }, 60000);
  markMet(speciesDex);
  markShiny(speciesDex);
  setTimeout(() => tryEvolve(), 3000);   // 等级够了就进化
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
  // kill -USR1 <pid> 立刻放一次专属动作（调试/录屏用）
  try { process.on('SIGUSR1', () => playSignature('manual')); } catch (_) { /* 忽略 */ }


});
