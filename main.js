const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, shell, dialog, nativeTheme, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

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
  ? path.join(app.getPath('appData'), '桌面宠物')
  : path.join(__dirname, 'userdata'));

// 0.7.0 把数据目录从「神奇宝贝」改名为「桌面宠物」。
// 老用户升级后新目录还是空的，这里把旧目录的存档/图鉴等整份搬过来，进度不丢。
if (IN_BUNDLE) {
  try {
    const newDir = app.getPath('userData');
    const oldDir = path.join(app.getPath('appData'), '神奇宝贝');
    const newState = path.join(newDir, 'pet-state.json');
    const oldState = path.join(oldDir, 'pet-state.json');
    if (!fs.existsSync(newState) && fs.existsSync(oldState)) {
      fs.mkdirSync(newDir, { recursive: true });
      for (const f of fs.readdirSync(oldDir)) {
        const src = path.join(oldDir, f);
        const dst = path.join(newDir, f);
        try {
          if (fs.statSync(src).isFile() && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
        } catch (_) { /* 单个文件失败不影响其它 */ }
      }
      console.log('[migrate] 已把「神奇宝贝」数据目录迁移到「桌面宠物」');
    }
  } catch (_) { /* 迁移失败就用全新存档，不影响启动 */ }
}

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
      if (/\/MacOS\/(Electron|TogepiPet)$/.test(cmd) && /桌面宠物|神奇宝贝|togepi/i.test(cmd)) hits.push(pid);
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
let petBooted = false;   // 宠物窗口的一次性初始化是否已做过
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
let shinyLocked = false;            // 异色蛋孵出的这只强制异色
let lastTs = Date.now();
let achCheckAt = 0;
let expAt = 0;
let speciesDex = 175;                // 当前宝可梦（全国图鉴编号）
let settingsWin = null;
let starWin = null;
let starAsked = false;   // 只在第一次打开时问一次要不要去点 Star
let focusMode = false;   // 专注模式：不跑、不冒泡、不打扰
let pomo = null;         // 番茄钟 { phase: 'work' | 'rest', until, workMin, restMin }

// ---------- 自定义提醒 / 闹钟 ----------
// { id, label, time:'HH:MM', days:[0..6] 周日=0，空数组=每天, enabled, lastFired:'YYYY-MM-DD HH:MM' }
let reminders = [];
let reminderSeq = 0;
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function reminderDaysLabel(r) {
  if (!r.days || !r.days.length) return lang === 'en' ? 'Every day' : '每天';
  const labels = lang === 'en' ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS;
  return r.days.slice().sort((a, b) => a - b).map(d => labels[d]).join(' ');
}

function checkReminders() {
  if (focusMode) return;
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const nowHM = `${hh}:${mm}`;
  const dow = t.getDay();
  const todayKey = dayKey();
  for (const r of reminders) {
    if (!r.enabled || r.time !== nowHM) continue;
    if (r.days && r.days.length && !r.days.includes(dow)) continue;
    const fireKey = `${todayKey} ${nowHM}`;
    if (r.lastFired === fireKey) continue;
    r.lastFired = fireKey;
    const label = r.label || (lang === 'en' ? 'Reminder' : '提醒');
    bubble(`⏰ ${label}`, 5000, true);
    pushNotice({
      kind: 'reminder',
      title: lang === 'en' ? 'Reminder' : '提醒事项',
      body: label,
      titleEn: 'Reminder', bodyEn: label,
      titleJa: 'リマインダー', bodyJa: label,
      titleKo: '알림', bodyKo: label
    });
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('reminder-fx', { label }); } catch (_) {}
    }
  }
  saveState();
}

function addReminder({ label, time, days }) {
  const r = {
    id: ++reminderSeq,
    label: String(label || '').slice(0, 24),
    time: /^\d{2}:\d{2}$/.test(time) ? time : '09:00',
    days: Array.isArray(days) ? days.filter(d => d >= 0 && d <= 6) : [],
    enabled: true,
    lastFired: ''
  };
  reminders.push(r);
  saveState();
  return r;
}

function updateReminder(id, patch) {
  const r = reminders.find(x => x.id === id);
  if (!r) return null;
  if (patch.label !== undefined) r.label = String(patch.label).slice(0, 24);
  if (patch.time !== undefined && /^\d{2}:\d{2}$/.test(patch.time)) r.time = patch.time;
  if (patch.days !== undefined) r.days = Array.isArray(patch.days) ? patch.days.filter(d => d >= 0 && d <= 6) : [];
  if (patch.enabled !== undefined) r.enabled = !!patch.enabled;
  r.lastFired = '';
  saveState();
  return r;
}

function removeReminder(id) {
  const i = reminders.findIndex(x => x.id === id);
  if (i < 0) return false;
  reminders.splice(i, 1);
  saveState();
  return true;
}

// ---------- 收集 / 成就 ----------
let dexMet = [];                     // 遇见过的图鉴编号
let shinyMet = [];                   // 见过异色的编号
let counters = { sig: 0, feed: 0, play: 0, pet: 0, throw: 0, streak: 0, lastDay: '', checkIn: 0, lastCheckIn: '' };
let unlocked = {};                   // 成就 id -> 解锁时间
let uiLang = 'zh'; // 界面语言：zh | en | ja | ko
let lang = 'zh';   // 主进程文案语言：zh | en（ja/ko 用中文原文，交给 i18n 翻译）
try {
  // 打包后才按系统语言判断；开发模式下 getLocale 不可靠，直接中文
  if (app.isPackaged) {
    const loc = String(app.getLocale() || '').toLowerCase();
    if (loc.startsWith('ja')) uiLang = 'ja';
    else if (loc.startsWith('ko')) uiLang = 'ko';
    else if (!loc.startsWith('zh')) uiLang = 'en';
  }
} catch (_) {}
lang = uiLang === 'en' ? 'en' : 'zh';
let rotateMin = 0;                   // 自动换宝可梦的间隔（分钟），0=关
let rotateAt = 0;
let level = 1;                       // 陪伴等级
let exp = 0;                         // 经验，每 100 一级
let lastSeenVersion = '';            // 上次启动时已展示过更新说明的版本
let pendingUpdate = null;            // 更新前暂存的说明，供重启后的「更新完成」弹窗使用
let hadStateFile = false;            // 本次启动前是否已有存档（区分首装与升级）
let updateSnoozeUntil = 0;           // 用户点「稍后」后，自动检查暂不安装的截止时间

// ---------- 通知中心 / 任务 / 活动日历 ----------
let notifications = [];   // { id, t, kind, title, body, read }
let notifySeq = 0;
let notifySystem = false; // 是否同时发系统通知
let tasksState = { day: '', week: '', daily: {}, weekly: {} };
let checkins = [];        // 签到过的本地日期（YYYY-MM-DD）
let activity = {};        // 日期 -> 当天互动次数，用于热力图
let heatmapDays = 365;
const TASK_DEFS = {
  daily: [
    { id: 'walk',  metric: 'walk',  target: 100,  reward: 40,  zh: '走 100 米', en: 'Walk 100 m', ja: '100メートル歩く', ko: '100미터 걷기' },
    { id: 'feed',  metric: 'feed',  target: 3,    reward: 35,  zh: '喂食 3 次', en: 'Feed 3 times', ja: 'ごはんを3回', ko: '먹이 3회' },
    { id: 'pet',   metric: 'pet',   target: 10,   reward: 30,  zh: '摸头 10 次', en: 'Pet 10 times', ja: 'なでる 10回', ko: '쓰다듬기 10회' },
    { id: 'play',  metric: 'play',  target: 2,    reward: 30,  zh: '玩耍 2 次', en: 'Play 2 times', ja: '遊ぶ 2回', ko: '놀기 2회' },
    { id: 'sig',   metric: 'sig',   target: 2,    reward: 30,  zh: '发动 2 次专属动作', en: 'Use a signature move twice', ja: '専用技を2回', ko: '전용 기술 2회' },
    { id: 'checkin', metric: 'checkin', target: 1, reward: 20, zh: '完成签到', en: 'Check in', ja: 'チェックイン', ko: '출석 체크' }
  ],
  weekly: [
    { id: 'walk',  metric: 'walk',  target: 800,  reward: 160, stones: 1, zh: '走 800 米', en: 'Walk 800 m', ja: '800メートル歩く', ko: '800미터 걷기' },
    { id: 'feed',  metric: 'feed',  target: 20,   reward: 150, zh: '喂食 20 次', en: 'Feed 20 times', ja: 'ごはんを20回', ko: '먹이 20회' },
    { id: 'sig',   metric: 'sig',   target: 20,   reward: 150, zh: '发动 20 次专属动作', en: 'Use signature moves 20 times', ja: '専用技を20回', ko: '전용 기술 20회' },
    { id: 'hatch', metric: 'hatch', target: 1,    reward: 120, stones: 1, zh: '孵出 1 只', en: 'Hatch 1 egg', ja: '1匹孵化する', ko: '1마리 부화' },
    { id: 'evolve', metric: 'evolve', target: 1,  reward: 120, zh: '进化 1 次', en: 'Evolve once', ja: '1回進化する', ko: '1회 진화' },
    { id: 'newdex', metric: 'newdex', target: 5,  reward: 180, zh: '遇见 5 只新宝可梦', en: 'Meet 5 new Pokémon', ja: '新しいポケモンに5匹出会う', ko: '새 포켓몬 5마리 만나기' }
  ]
};
function weekKey(d) {
  const t = d instanceof Date ? d : new Date(d === undefined ? Date.now() : d);
  const x = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // 周一为一周开始
  return dayKey(x);
}
function defaultTaskBucket(defs) {
  const o = {};
  for (const d of defs) o[d.id] = { p: 0, claimed: false, notified: false };
  return o;
}
function ensureTasks() {
  const day = dayKey(), week = weekKey();
  let changed = false;
  if (tasksState.day !== day) {
    tasksState.day = day;
    tasksState.daily = defaultTaskBucket(TASK_DEFS.daily);
    changed = true;
  }
  if (tasksState.week !== week) {
    tasksState.week = week;
    tasksState.weekly = defaultTaskBucket(TASK_DEFS.weekly);
    changed = true;
  }
  return changed;
}
function taskProgress(freq, id) {
  ensureTasks();
  const b = tasksState[freq] && tasksState[freq][id];
  return b ? b.p : 0;
}
function bumpTask(metric, n = 1) {
  if (!metric || !(n > 0)) return;
  ensureTasks();
  for (const freq of ['daily', 'weekly']) {
    for (const def of TASK_DEFS[freq]) {
      if (def.metric !== metric) continue;
      const b = tasksState[freq][def.id];
      if (!b || b.p >= def.target) continue;
      b.p = Math.min(def.target, b.p + n);
      if (b.p >= def.target && !b.notified) {
        b.notified = true;
        pushNotice({
          kind: 'task',
          title: '任务完成', titleEn: 'Task complete', titleJa: 'タスク達成', titleKo: '작업 완료',
          body: def.zh + ' —— 到设置里领奖励',
          bodyEn: def.en + ' — claim your reward in Settings',
          bodyJa: def.ja + ' — 設定で報酬を受け取れます',
          bodyKo: def.ko + ' — 설정에서 보상을 받으세요'
        });
      }
    }
  }
  saveSoon();
}
function taskSnapshot(freq) {
  ensureTasks();
  return TASK_DEFS[freq].map(def => {
    const b = tasksState[freq][def.id] || { p: 0, claimed: false };
    return {
      id: def.id, zh: def.zh, en: def.en, ja: def.ja, ko: def.ko, target: def.target,
      reward: def.reward, stones: def.stones || 0,
      progress: Math.min(def.target, b.p), claimed: !!b.claimed
    };
  });
}
function claimTask(freq, id) {
  if (!['daily', 'weekly'].includes(freq)) return false;
  ensureTasks();
  const def = (TASK_DEFS[freq] || []).find(d => d.id === id);
  const b = tasksState[freq] && tasksState[freq][id];
  if (!def || !b || b.claimed || b.p < def.target) return false;
  b.claimed = true;
  counters[freq === 'daily' ? 'tasksClaimed' : 'tasksWeeklyClaimed'] =
    (counters[freq === 'daily' ? 'tasksClaimed' : 'tasksWeeklyClaimed'] || 0) + 1;
  addExp(def.reward);
  if (def.stones) addStone(def.stones);
  pushNotice({
    kind: 'reward',
    title: '奖励已领取', titleEn: 'Reward claimed', titleJa: '報酬を受け取りました', titleKo: '보상 수령',
    body: def.zh + ` · +${def.reward} 经验` + (def.stones ? ` · +${def.stones} 进化石` : ''),
    bodyEn: def.en + ` · +${def.reward} EXP` + (def.stones ? ` · +${def.stones} stone` : ''),
    bodyJa: def.ja + ` · +${def.reward} 経験値` + (def.stones ? ` · +${def.stones} 進化の石` : ''),
    bodyKo: def.ko + ` · +${def.reward} 경험치` + (def.stones ? ` · +${def.stones} 진화의돌` : '')
  });
  saveState();
  notifySettings();
  return true;
}
function bumpActivity(n = 1) {
  const d = dayKey();
  activity[d] = (Number(activity[d]) || 0) + n;
  // 只保留一年多一点
  const keys = Object.keys(activity).sort();
  while (keys.length > 420) delete activity[keys.shift()];
}
function pushNotice({ kind = 'info', title = '', body = '', titleEn = '', bodyEn = '', titleJa = '', bodyJa = '', titleKo = '', bodyKo = '', silent = false } = {}) {
  const n = { id: ++notifySeq, t: Date.now(), kind, title: String(title || ''), body: String(body || ''),
    titleEn: String(titleEn || ''), bodyEn: String(bodyEn || ''),
    titleJa: String(titleJa || titleEn || title || ''), bodyJa: String(bodyJa || bodyEn || body || ''),
    titleKo: String(titleKo || titleEn || title || ''), bodyKo: String(bodyKo || bodyEn || body || ''), read: false };
  notifications.unshift(n);
  if (notifications.length > 100) notifications.length = 100;
  if (!silent && notifySystem) {
    try {
      if (Notification.isSupported()) {
        const en = uiLang === 'en';
        const title = uiLang === 'ja' ? n.titleJa : uiLang === 'ko' ? n.titleKo : en ? n.titleEn : n.title;
        const body = uiLang === 'ja' ? n.bodyJa : uiLang === 'ko' ? n.bodyKo : en ? n.bodyEn : n.body;
        const sys = new Notification({ title: title || n.title, body: body || n.body, silent: true });
        sys.on('click', () => openSettingsTab('notify'));
        sys.show();
      }
    } catch (_) {}
  }
  saveState();
  notifySettings();
  return n;
}

// 气泡里要拼「名字 · 属性」，i18n 只翻整段，这里给属性一个英文表
const TYPE_EN = {
  一般: 'Normal', 火: 'Fire', 水: 'Water', 电: 'Electric', 草: 'Grass', 冰: 'Ice',
  格斗: 'Fighting', 毒: 'Poison', 地面: 'Ground', 飞行: 'Flying', 超能力: 'Psychic',
  虫: 'Bug', 岩石: 'Rock', 幽灵: 'Ghost', 龙: 'Dragon', 恶: 'Dark', 钢: 'Steel', 妖精: 'Fairy'
};
const typeLabel = t => (lang === 'en' ? (TYPE_EN[t] || t) : t);
const TYPE_COLOR_MAIN = {
  一般: '#A8A878', 火: '#F08030', 水: '#6890F0', 电: '#F8D030', 草: '#78C850', 冰: '#98D8D8',
  格斗: '#C03028', 毒: '#A040A0', 地面: '#E0C068', 飞行: '#A890F0', 超能力: '#F85888',
  虫: '#A8B820', 岩石: '#B8A038', 幽灵: '#705898', 龙: '#7038F8', 恶: '#705848',
  钢: '#B8B8D0', 妖精: '#EE99AC'
};

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
let walkTaskPx = 0;      // 任务进度：不足 1 米的部分
const EGG_MIN = 22000;   // 约 8 分钟纯走路
const EGG_MAX = 58000;   // 约 21 分钟
const EGG_AT = Number(process.env.PET_EGG_AT || 0);   // 调试用固定值，0 表示随机
let eggTarget = EGG_AT || (EGG_MIN + Math.floor(Math.random() * (EGG_MAX - EGG_MIN)));
let hasEgg = false;
let eggRarity = 'common';   // common | rare | legendary | shiny
const EGG_RARITIES = {
  common:    { weight: 70, label: '普通',   en: 'Common',    ja: 'ノーマル', ko: '노말' },
  rare:      { weight: 20, label: '稀有',   en: 'Rare',      ja: 'レア',     ko: '레어' },
  legendary: { weight: 7,  label: '传说',   en: 'Legendary', ja: '伝説',     ko: '전설' },
  shiny:     { weight: 3,  label: '异色',   en: 'Shiny',     ja: '色違い',   ko: '이로치' }
};
// 稀有蛋的基础形态：准传说 / 稀有幼体
const RARE_BASE = new Set([147, 246, 371, 374, 443, 633, 704, 782, 885, 996]);
function rollEggRarity() {
  // 连签 / 等级会稍微提高稀有与传说概率，但普通仍是大头
  const boost = Math.min(15, (Number(counters.streak) || 1) + Math.floor(level / 10));
  const weights = {
    common: Math.max(45, EGG_RARITIES.common.weight - boost * 0.5),
    rare: EGG_RARITIES.rare.weight + boost * 0.3,
    legendary: EGG_RARITIES.legendary.weight + boost * 0.18,
    shiny: EGG_RARITIES.shiny.weight + boost * 0.05
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const k of Object.keys(weights)) { r -= weights[k]; if (r <= 0) return k; }
  return 'common';
}
let guestWin = null;     // 串门的另一只
let guest = null;        // { dex, x, dir, until, phase: 'in'|'stay'|'out' }
let nextGuestAt = 0;
let guestEnabled = true;
let roamCount = 0;         // 同屏放养数量（额外在桌面上溜达的伙伴数）
let roamers = [];          // [{ dex, win, x, y, dir, until, state, size }]
const MAX_ROAM = 3;        // 最多同时放养 3 只
let nextRoamInteractAt = 0; // 下次检测伙伴间互动的时间
// ---------- 健康 / 心情曲线 ----------
// 每天采样心情 / 饱食度均值，存 { day: { moodSum, hungerSum, n, moodAvg, hungerAvg, feed, play } }
let healthLog = {};
let lastHealthSampleAt = 0;
let favorites = [];       // 收藏的图鉴编号
let roster = [];          // 伙伴队伍 [{ dex, nickname, hat, scarf }]
let nickname = '';        // 当前伙伴的昵称
let hat = 'none';         // none | cap | tophat | crown
let scarf = 'none';       // none | red | blue | green
let battleForm = null;    // { kind: 'mega'|'gmax', entry, until } 仅本次运行有效
const MAX_ROSTER = 12;
// 自定义精灵（照片导入） { id, name, file(绝对路径), w, h }
let customPets = [];
let customSeq = 0;
const CUSTOM_DIR = () => path.join(app.getPath('userData'), 'custom-sprites');
let customRoamers = [];    // [{ id, win, x, y, dir, until, state, w, h }]
let customPetsOn = true;   // 是否让照片伙伴出现在桌面上
function activeRosterEntry() { return roster.find(p => p.dex === speciesDex); }
function syncRosterEntry() {
  if (!SPECIES.some(sp => sp.dex === speciesDex)) return;
  let e = activeRosterEntry();
  if (!e) {
    e = { dex: speciesDex, nickname: nickname || '', hat: hat || 'none', scarf: scarf || 'none' };
    roster.unshift(e);
  } else {
    e.nickname = nickname || '';
    e.hat = hat || 'none';
    e.scarf = scarf || 'none';
  }
  // 队伍只保留 12 只；优先保留当前这只
  if (roster.length > MAX_ROSTER) {
    const active = activeRosterEntry();
    roster = roster.filter(p => p === active).concat(roster.filter(p => p !== active)).slice(0, MAX_ROSTER);
  }
}
function loadRosterLook(dex) {
  const e = roster.find(p => p.dex === dex);
  nickname = e ? (e.nickname || '') : '';
  hat = e && ['none','cap','tophat','crown'].includes(e.hat) ? e.hat : 'none';
  scarf = e && ['none','red','blue','green'].includes(e.scarf) ? e.scarf : 'none';
}
const petName = () => nickname || (battleForm ? formLabel(battleForm.entry) : nameOf(speciesDex));
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
  { id: 'checkin7', name: '每日打卡', en: 'Daily regular', desc: '连续签到 7 天', test: () => counters.checkIn >= 7 },
  { id: 'level10', name: '十级伙伴', en: 'Level 10', desc: '陪伴等级到 10 级', test: () => level >= 10, prog: () => [level, 10] },
  { id: 'level25', name: '形影不离', en: 'Inseparable', desc: '陪伴等级到 25 级', test: () => level >= 25, prog: () => [level, 25] },
  { id: 'level50', name: '传说训练家', en: 'Legendary trainer', desc: '陪伴等级到 50 级', test: () => level >= 50, prog: () => [level, 50] },
  { id: 'hatch1', name: '破壳而出', en: 'First hatch', desc: '孵出第一只宝可梦', test: () => (counters.hatch || 0) >= 1, prog: () => [counters.hatch || 0, 1] },
  { id: 'hatch10', name: '孵化专家', en: 'Egg expert', desc: '累计孵出 10 只', test: () => (counters.hatch || 0) >= 10, prog: () => [counters.hatch || 0, 10] },
  { id: 'walk10k', name: '万里长征', en: 'Long walk', desc: '累计走 10 公里', test: () => (counters.walked || 0) >= 500000, prog: () => [Math.round((counters.walked || 0) / 50), 10000] },
  { id: 'dex500', name: '半部图鉴', en: 'Half a dex', desc: '遇见 500 只', test: () => dexMet.length >= 500, prog: () => [dexMet.length, 500] },
  { id: 'shiny3', name: '闪光收藏', en: 'Shiny stash', desc: '见过 3 只异色', test: () => shinyMet.length >= 3, prog: () => [shinyMet.length, 3] },
  { id: 'feed200', name: '大厨', en: 'Chef', desc: '喂食 200 次', test: () => counters.feed >= 200, prog: () => [counters.feed || 0, 200] },
  { id: 'pet1000', name: '摸头宗师', en: 'Pet master', desc: '摸头 1000 次', test: () => counters.pet >= 1000, prog: () => [counters.pet || 0, 1000] },
  { id: 'sig500', name: '招式宗师', en: 'Move grandmaster', desc: '发动 500 次专属动作', test: () => counters.sig >= 500, prog: () => [counters.sig || 0, 500] },
  { id: 'throw50', name: '投掷高手', en: 'Throw expert', desc: '把宠物扔出去 50 次', test: () => counters.throw >= 50, prog: () => [counters.throw || 0, 50] },
  { id: 'checkin30', name: '月度全勤', en: 'Perfect month', desc: '连续签到 30 天', test: () => counters.checkIn >= 30, prog: () => [counters.checkIn || 0, 30] },
  { id: 'streak30', name: '室友', en: 'Roommate', desc: '连续陪伴 30 天', test: () => counters.streak >= 30, prog: () => [counters.streak || 0, 30] },
  { id: 'tasks10', name: '任务达人', en: 'Task runner', desc: '领取 10 个每日任务奖励', test: () => (counters.tasksClaimed || 0) >= 10, prog: () => [counters.tasksClaimed || 0, 10] },
  { id: 'weekly4', name: '每周全勤', en: 'Weekly regular', desc: '领取 4 个每周任务奖励', test: () => (counters.tasksWeeklyClaimed || 0) >= 4, prog: () => [counters.tasksWeeklyClaimed || 0, 4] }
];

// 成就名的日 / 韩文（描述也在同一张表里，避免设置页出现半句中文）
const ACH_I18N = {
  first: ['はじめての出会い', '첫 만남', 'はじめてのポケモンと出会う', '첫 포켓몬 만나기'],
  dex10: ['お客さん', '손님', '10匹のポケモンと出会う', '포켓몬 10마리 만나기'],
  dex50: ['旅慣れ', '견문이 넓음', '50匹のポケモンと出会う', '포켓몬 50마리 만나기'],
  dex200: ['博物学者', '박물학자', '200匹のポケモンと出会う', '포켓몬 200마리 만나기'],
  dex1025: ['図鑑コンプリート', '도감 완성', '1025匹すべてと出会う', '포켓몬 1025마리 모두 만나기'],
  shiny1: ['色違いハンター', '이로치 헌터', '色違いを1匹見る', '이로치 1마리 보기'],
  shiny8: ['色違いコレクター', '이로치 수집가', '元の色違いを8匹集める', '원래 이로치 8마리 모으기'],
  sig10: ['駆け出し', '초보', '専用技を10回使う', '전용 기술 10회 사용'],
  sig100: ['技マスター', '기술 마스터', '専用技を100回使う', '전용 기술 100회 사용'],
  feed50: ['飼育員', '사육사', 'ごはんを50回あげる', '먹이 50회 주기'],
  pet500: ['なでなで魔王', '쓰다듬기 마왕', '500回なでる', '500회 쓰다듬기'],
  throw10: ['投げ練習', '던지기 훈련', '10回投げる', '10회 던지기'],
  streak7: ['古い友達', '오랜 친구', '7日連続で一緒に過ごす', '7일 연속 함께하기'],
  checkin7: ['毎日チェックイン', '매일 출석', '7日連続でチェックイン', '7일 연속 출석'],
  level10: ['レベル10の相棒', '레벨 10 파트너', '一緒のレベルが10になる', '함께 레벨 10 달성'],
  level25: ['いつも一緒', '그림자처럼', '一緒のレベルが25になる', '함께 레벨 25 달성'],
  level50: ['伝説のトレーナー', '전설의 트레이너', '一緒のレベルが50になる', '함께 레벨 50 달성'],
  hatch1: ['殻から出た', '껍질을 깨고', 'はじめてタマゴを孵す', '첫 알 부화'],
  hatch10: ['孵化の専門家', '부화 전문가', '合計10匹孵化する', '누적 10마리 부화'],
  walk10k: ['万里の道', '만리 길', '合計10km歩く', '누적 10km 걷기'],
  dex500: ['図鑑の半分', '도감 절반', '500匹のポケモンと出会う', '포켓몬 500마리 만나기'],
  shiny3: ['光るコレクション', '반짝이 컬렉션', '色違いを3匹見る', '이로치 3마리 보기'],
  feed200: ['料理長', '요리사', 'ごはんを200回あげる', '먹이 200회 주기'],
  pet1000: ['なでなで宗師', '쓰다듬기 종사', '1000回なでる', '1000회 쓰다듬기'],
  sig500: ['技の宗師', '기술 종사', '専用技を500回使う', '전용 기술 500회 사용'],
  throw50: ['投げの達人', '던지기 달인', '50回投げる', '50회 던지기'],
  checkin30: ['皆勤賞', '개근상', '30日連続でチェックイン', '30일 연속 출석'],
  streak30: ['ルームメイト', '룸메이트', '30日連続で一緒に過ごす', '30일 연속 함께하기'],
  tasks10: ['タスクの達人', '작업 달인', 'デイリータスク報酬を10回受け取る', '일일 작업 보상 10회 받기'],
  weekly4: ['週間皆勤', '주간 개근', 'ウィークリータスク報酬を4回受け取る', '주간 작업 보상 4회 받기']
};
for (const a of ACHIEVEMENTS) {
  const t = ACH_I18N[a.id];
  if (t) { a.ja = t[0]; a.ko = t[1]; a.descJa = t[2]; a.descKo = t[3]; }
}

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
  if (battleForm) clearForm(true, true);
  const fromName = nameOf(speciesDex) || '它';
  const evoEntry = activeRosterEntry();
  if (evoEntry) evoEntry.dex = ev.to;
  speciesDex = ev.to;
  shiny = shinyFor(speciesDex);
  currentNature = natureFor(speciesDex);
  if (win && !win.isDestroyed()) {
    win.webContents.send('evolve', { url: spriteUrlFor(speciesDex, shiny), name: to.name });
  }
  markMet(speciesDex);
  markShiny(speciesDex);
  bumpTask('evolve', 1);
  bumpActivity(3);
  setState('happy', 1600);
  saveState();
  refreshTray();
  console.log(`[evolve] ${fromName} → ${to.name}（${ev.how}）`);
  setTimeout(() => {
    bubble(lang === 'en'
      ? `✨ ${fromName} evolved into ${nameOf(speciesDex)}!`
      : `✨ ${fromName} 进化成 ${nameOf(speciesDex)}！`, 5200, true);
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
  bumpTask('newdex', 1);
  bumpActivity(2);
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
  const day = dayKey();
  if (counters.lastDay === day) return;
  const yest = dayKey(Date.now() - 86400000);
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
  const pool = weatherGuestPool();
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
    y: wa.y + wa.height - size,   // 记住所在屏幕的地面
    dir: fromLeft ? 1 : -1,
    phase: 'in',
    until: now() + 120000,
    size
  };
  nextGuestAt = now() + (12 + Math.random() * 18) * 60000;
  // 天气联动气泡：下雨来水系、夜晚来幽灵系……
  const wk = weather && weather.kind;
  const night = isNight();
  const weatherWord = wk ? (lang === 'en' ? wk : wk) : '';
  let msg;
  if (wk === '雨' && target.types.includes('水')) msg = lang === 'en' ? `Raining — a wild ${nameOf(target.dex)} came by!` : `下雨天，野生 ${nameOf(target.dex)} 跑来串门了！`;
  else if (wk === '雷' && target.types.includes('电')) msg = lang === 'en' ? `Stormy — a wild ${nameOf(target.dex)} appeared!` : `雷雨天，野生 ${nameOf(target.dex)} 冒出来了！`;
  else if (wk === '雪' && target.types.includes('冰')) msg = lang === 'en' ? `Snowy — a wild ${nameOf(target.dex)} came by!` : `下雪天，野生 ${nameOf(target.dex)} 跑来串门了！`;
  else if (night && (target.types.includes('幽灵') || target.types.includes('恶'))) msg = lang === 'en' ? `At night — a wild ${nameOf(target.dex)} lurked by!` : `夜深了，野生 ${nameOf(target.dex)} 悄悄靠近……`;
  else msg = lang === 'en' ? `${nameOf(target.dex)} came by!` : `${nameOf(target.dex)} 跑过来串门了`;
  bubble(msg, 3000, true);
  markMet(target.dex);   // 串门也算遇见，计入图鉴
  pushNotice({
    kind: 'guest',
    title: lang === 'en' ? 'Wild visitor' : '野生访客',
    body: msg,
    titleEn: 'Wild visitor', bodyEn: msg,
    titleJa: '野生の訪問者', bodyJa: msg,
    titleKo: '야생 방문객', bodyKo: msg
  });
}

function updateGuest(t, dt) {
  if (!guest) return;
  const wa = waFor(guest.x + guest.size / 2, guest.y + guest.size / 2);
  const groundY = wa.y + wa.height - guest.size;
  guest.y = groundY;
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

// ---------- 多宠物同屏放养 ----------
// 把队伍里除当前伙伴以外的宝可梦放几只到桌面上溜达，彼此会靠近、打招呼、一起玩耍
function syncRoamers() {
  // 清掉多余的 / 已不在队伍的
  roamers = roamers.filter(r => {
    const stillIn = roster.some(p => p.dex === r.dex) && r.dex !== speciesDex;
    if (!stillIn || roamers.indexOf(r) >= roamCount) {
      if (r.win && !r.win.isDestroyed()) try { r.win.destroy(); } catch (_) {}
      return false;
    }
    return true;
  });
  if (focusMode || inBall) {
    for (const r of roamers) { if (r.win && !r.win.isDestroyed()) r.win.hide(); }
    return;
  }
  // 需要补几只
  const candidates = roster
    .filter(p => p.dex !== speciesDex && !roamers.some(r => r.dex === p.dex))
    .slice(0, Math.max(0, roamCount - roamers.length));
  for (const p of candidates) {
    if (roamers.length >= roamCount) break;
    spawnRoamer(p.dex);
  }
  for (const r of roamers) { if (r.win && !r.win.isDestroyed()) r.win.showInactive(); }
}

function spawnRoamer(dex) {
  if (roamers.length >= MAX_ROAM) return;
  const size = 96;
  const wa = waFor(x + winW / 2, y + winH / 2);
  const fromLeft = Math.random() < 0.5;
  const groundY = wa.y + wa.height - size;
  const w = new BrowserWindow({
    width: size, height: size,
    x: Math.round(fromLeft ? wa.x + 40 : wa.x + wa.width - 40 - size),
    y: Math.round(groundY),
    frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  w.setIgnoreMouseEvents(true);
  w.loadFile(path.join(__dirname, 'renderer', 'guest.html'));
  w.once('ready-to-show', () => {
    if (w.isDestroyed()) return;
    w.showInactive();
    try { w.webContents.executeJavaScript(`document.getElementById('s').src = ${JSON.stringify(spriteUrlFor(dex, shinyFor(dex)))}`); } catch (_) {}
  });
  roamers.push({
    dex, win: w,
    x: fromLeft ? wa.x + 40 : wa.x + wa.width - 40 - size,
    y: groundY, dir: fromLeft ? 1 : -1,
    until: now() + 5000 + Math.random() * 6000,
    state: 'walk', size
  });
}

function updateRoamers(t, dt) {
  if (!roamers.length) return;
  const wa = waFor(x + winW / 2, y + winH / 2);
  const groundY = wa.y + wa.height - 96;
  for (const r of roamers) {
    if (!r.win || r.win.isDestroyed()) continue;
    r.y = groundY;
    // 简单溜达：走到方向时限就反向
    if (t > r.until) {
      r.dir = -r.dir;
      r.until = t + 4000 + Math.random() * 6000;
      r.state = Math.random() < 0.3 ? 'idle' : 'walk';
      if (r.state === 'idle') r.until = t + 2000 + Math.random() * 3000;
    }
    if (r.state === 'walk') {
      r.x += r.dir * 38 * dt;
      // 限制在当前屏幕内
      const minX = wa.x + 10, maxX = wa.x + wa.width - r.size - 10;
      if (r.x < minX) { r.x = minX; r.dir = 1; }
      if (r.x > maxX) { r.x = maxX; r.dir = -1; }
    }
    try { r.win.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: r.size, height: r.size }); } catch (_) {}
  }
  // 伙伴间 / 与访客 / 与主角的互动检测
  if (t > nextRoamInteractAt) {
    nextRoamInteractAt = t + 8000 + Math.random() * 12000;
    checkRoamerInteraction(t);
  }
}

// ---------- 自定义照片伙伴：同屏溜达 ----------
function syncCustomRoamers() {
  const want = (customPetsOn && !focusMode && !inBall) ? Math.min(customPets.length, 2) : 0;
  // 关掉多余的
  while (customRoamers.length > want) {
    const r = customRoamers.pop();
    if (r.win && !r.win.isDestroyed()) try { r.win.destroy(); } catch (_) {}
  }
  // 补上需要的（按 customPets 顺序）
  for (const p of customPets) {
    if (customRoamers.length >= want) break;
    if (customRoamers.some(r => r.id === p.id)) continue;
    spawnCustomRoamer(p);
  }
  for (const r of customRoamers) { if (r.win && !r.win.isDestroyed()) r.win.showInactive(); }
}

function spawnCustomRoamer(p) {
  const wa = waFor(x + winW / 2, y + winH / 2);
  // 照片宠物按原始比例算显示尺寸，最大 140 高
  const ratio = (p.w && p.h) ? p.w / p.h : 1;
  const dispH = 120;
  const dispW = Math.round(dispH * ratio);
  const w = new BrowserWindow({
    width: dispW, height: dispH,
    x: Math.round(wa.x + wa.width * 0.2),
    y: Math.round(wa.y + wa.height - dispH),
    frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  w.setIgnoreMouseEvents(true);
  w.loadFile(path.join(__dirname, 'renderer', 'guest.html'));
  const fileUrl = require('url').pathToFileURL(p.file).href;
  w.once('ready-to-show', () => {
    if (w.isDestroyed()) return;
    w.showInactive();
    try { w.webContents.executeJavaScript(`document.getElementById('s').src = ${JSON.stringify(fileUrl)}; document.getElementById('s').style.imageRendering='auto';`); } catch (_) {}
  });
  customRoamers.push({
    id: p.id, win: w,
    x: wa.x + wa.width * (0.15 + Math.random() * 0.5),
    y: wa.y + wa.height - dispH,
    dir: Math.random() < 0.5 ? 1 : -1,
    until: now() + 4000 + Math.random() * 5000,
    state: 'walk', w: dispW, h: dispH
  });
}

function updateCustomRoamers(t, dt) {
  if (!customRoamers.length) return;
  const wa = waFor(x + winW / 2, y + winH / 2);
  for (const r of customRoamers) {
    if (!r.win || r.win.isDestroyed()) continue;
    r.y = wa.y + wa.height - r.h;
    if (t > r.until) {
      r.dir = -r.dir;
      r.until = t + 4000 + Math.random() * 6000;
      r.state = Math.random() < 0.3 ? 'idle' : 'walk';
      if (r.state === 'idle') r.until = t + 2000 + Math.random() * 3000;
    }
    if (r.state === 'walk') {
      r.x += r.dir * 34 * dt;
      const minX = wa.x + 10, maxX = wa.x + wa.width - r.w - 10;
      if (r.x < minX) { r.x = minX; r.dir = 1; }
      if (r.x > maxX) { r.x = maxX; r.dir = -1; }
    }
    try { r.win.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: r.w, height: r.h }); } catch (_) {}
  }
}

function checkRoamerInteraction(t) {
  if (focusMode) return;
  // 收集所有"在场"的 x 坐标：主角、访客、放养的伙伴
  const actors = [];
  if (!inBall) actors.push({ kind: 'main', dex: speciesDex, x: x + winW / 2, name: petName() });
  if (guest && guest.phase === 'stay') actors.push({ kind: 'guest', dex: guest.dex, x: guest.x + guest.size / 2, name: nameOf(guest.dex) });
  for (const r of roamers) {
    if (r.win && !r.win.isDestroyed()) actors.push({ kind: 'roamer', dex: r.dex, x: r.x + r.size / 2, name: nameOf(r.dex) });
  }
  // 找最近的一对（距离 < 220px 视为靠近）
  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      if (Math.abs(actors[i].x - actors[j].x) < 220) {
        const a = actors[i], b = actors[j];
        const greetings = lang === 'en'
          ? [`${a.name} and ${b.name} are playing together!`, `${a.name} greeted ${b.name}!`, `${a.name} and ${b.name} are chasing each other!`]
          : [`${a.name} 和 ${b.name} 玩到了一起！`, `${a.name} 跟 ${b.name} 打了个招呼！`, `${a.name} 和 ${b.name} 追来追去！`];
        bubble(pick(greetings), 3000, true);
        // 双方都跳一下：让放养伙伴朝对方走一步
        if (a.kind === 'roamer') { const rr = roamers.find(r => r.dex === a.dex); if (rr) rr.dir = b.x > a.x ? 1 : -1; }
        if (b.kind === 'roamer') { const rr = roamers.find(r => r.dex === b.dex); if (rr) rr.dir = a.x > b.x ? 1 : -1; }
        if (a.kind === 'main' || b.kind === 'main') {
          stats.mood = Math.min(100, stats.mood + 5);
          addExp(8);
        }
        return;   // 一次只触发一对
      }
    }
  }
}

function spawnEgg() {
  if (hasEgg) return;
  hasEgg = true;
  eggRarity = rollEggRarity();
  saveState();   // 蛋要落盘，否则重启就白走了
  notifySettings();
  if (win && !win.isDestroyed()) win.webContents.send('egg', { rarity: eggRarity });
  const rareWord = uiLang === 'ja' ? EGG_RARITIES[eggRarity].ja : uiLang === 'ko' ? EGG_RARITIES[eggRarity].ko : lang === 'en' ? EGG_RARITIES[eggRarity].en : EGG_RARITIES[eggRarity].label;
  bubble(eggRarity === 'common'
    ? (uiLang === 'ja' ? 'あれ…タマゴが落ちてる？' : uiLang === 'ko' ? '어라…알이 떨어져 있어?' : lang === 'en' ? 'Huh? An egg appeared…' : '咦…这里怎么有个蛋？')
    : (uiLang === 'ja' ? `${rareWord}のタマゴ！` : uiLang === 'ko' ? `${rareWord} 알이야!` : lang === 'en' ? `A ${rareWord.toLowerCase()} egg!` : `是一颗${rareWord}的蛋！`), 3600, true);
  pushNotice({
    kind: 'egg',
    title: lang === 'en' ? 'An egg appeared' : '捡到一颗蛋',
    body: lang === 'en' ? `${rareWord} egg · click it to hatch` : `${rareWord}蛋 · 点它孵化`,
    titleJa: 'タマゴを見つけた', titleKo: '알을 발견했어요',
    bodyJa: `${rareWord}のタマゴ · クリックで孵化`, bodyKo: `${rareWord} 알 · 클릭해 부화`
  });
  if (process.env.PET_EGG_CLICK) {
    setTimeout(() => { try { win.webContents.executeJavaScript("document.getElementById('egg').click()"); } catch (_) {} }, 3000);
  }
}

function doHatch() {
  if (!hasEgg) return { ok: false };
  const rarity = eggRarity || 'common';
  hasEgg = false;
  if (win && !win.isDestroyed()) win.webContents.send('egg-gone');
  // 蛋只孵基础形态：有 from 的说明是进化来的，不能从蛋里出
  const baseForms = SPECIES.filter(sp => !sp.from);
  let basePool = baseForms;
  if (rarity === 'legendary') basePool = baseForms.filter(sp => sp.legend || sp.myth);
  else if (rarity === 'rare') basePool = baseForms.filter(sp => RARE_BASE.has(sp.dex));
  else if (rarity === 'shiny') basePool = baseForms.filter(sp => autoShinyFor(sp.dex));
  if (!basePool.length) basePool = baseForms;
  const unseen = basePool.filter(sp => !dexMet.includes(sp.dex));
  const pool = unseen.length ? unseen : basePool;
  const target = pool[Math.floor(Math.random() * pool.length)];
  switchSpecies(target.dex, { shiny: rarity === 'shiny' });
  bubble(uiLang === 'ja'
    ? `${rarity === 'common' ? '' : EGG_RARITIES[rarity].ja + 'の'}タマゴが孵った！${nameOf(target.dex)}！`
    : uiLang === 'ko'
      ? `${rarity === 'common' ? '' : EGG_RARITIES[rarity].ko + ' '}알이 부화했어요! ${nameOf(target.dex)}!`
      : lang === 'en'
        ? `${rarity === 'common' ? '' : EGG_RARITIES[rarity].en + ' '}It hatched! ${nameOf(target.dex)}!`
        : `${rarity === 'common' ? '' : EGG_RARITIES[rarity].label}蛋孵出来啦！是 ${nameOf(target.dex)}！`, 4200, true);
  try { playCry(target.dex, true); } catch (_) {}
  counters.hatch = (counters.hatch || 0) + 1;
  bumpTask('hatch', 1);
  bumpActivity(4);
  walkedPx = 0;                       // 孵完重新攒下一颗
  eggTarget = EGG_AT || (EGG_MIN + Math.floor(Math.random() * (EGG_MAX - EGG_MIN)));
  addStone(1);
  saveState();
  pushNotice({
    kind: 'hatch',
    title: lang === 'en' ? 'Egg hatched' : '孵蛋成功',
    body: lang === 'en' ? `${nameOf(target.dex)} joined your team` : `孵出了 ${nameOf(target.dex)}`,
    titleJa: 'タマゴが孵った', titleKo: '알 부화 성공',
    bodyJa: `${nameOf(target.dex)}が仲間になりました`, bodyKo: `${nameOf(target.dex)}이(가) 팀에 합류했어요`
  });
  console.log('[hatch] 孵出', target.dex, target.name, '| 稀有度', rarity, '| 有前置进化?', !!target.from);
  return { ok: true, dex: target.dex, name: nameOf(target.dex), rarity };
}

ipcMain.on('hatch', () => { doHatch(); });

// ---------- 自定义精灵：照片导入 ----------
const CUTOUT_BIN = path.join(__dirname, 'tools', 'bin', 'cutout');
function cutoutAvailable() { return IS_MAC && fs.existsSync(CUTOUT_BIN); }

// 用 Vision 抠图，返回 { ok, file, w, h }
function runCutout(inputPath, outPath) {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    const json = outPath + '.json';
    execFile(CUTOUT_BIN, [inputPath, outPath, json], { timeout: 30000 }, (err) => {
      if (err) { resolve({ ok: false, reason: err.message }); return; }
      let meta = { w: 0, h: 0 };
      try { const m = JSON.parse(fs.readFileSync(json, 'utf8')); meta = { w: m.width || 0, h: m.height || 0 }; } catch (_) {}
      try { fs.unlinkSync(json); } catch (_) {}
      resolve({ ok: true, file: outPath, w: meta.w, h: meta.h });
    });
  });
}

// 让用户选一张照片，抠图后注册为自定义精灵
async function importCustomPet() {
  if (!cutoutAvailable()) {
    bubble(uiLang === 'ja' ? 'この機能はmacOS 14+でのみ使えます' : uiLang === 'ko' ? '이 기능은 macOS 14+에서만 사용할 수 있어요' : lang === 'en' ? 'This needs macOS 14+' : '这个功能需要 macOS 14+', 3000, true);
    return { ok: false, reason: 'unsupported' };
  }
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: lang === 'en' ? 'Choose a photo for your pet' : '选一张照片做你的桌宠',
    properties: ['openFile'],
    filters: [{ name: lang === 'en' ? 'Images' : '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'heic'] }]
  });
  if (canceled || !filePaths || !filePaths.length) return { ok: false, reason: 'canceled' };
  fs.mkdirSync(CUSTOM_DIR(), { recursive: true });
  const id = ++customSeq;
  const out = path.join(CUSTOM_DIR(), `custom-${id}.png`);
  bubble(lang === 'en' ? 'Cutting out the photo…' : '正在抠图…', 4000, true);
  const r = await runCutout(filePaths[0], out);
  if (!r.ok) {
    bubble(lang === 'en' ? 'Cutout failed' : '抠图失败了', 2600, true);
    return { ok: false, reason: r.reason };
  }
  const p = { id, name: `伙伴 ${id}`, file: out, w: r.w, h: r.h };
  customPets.push(p);
  saveState();
  bubble(lang === 'en' ? `Added your photo pet!` : '你的照片伙伴来了！', 2600, true);
  pushNotice({
    kind: 'custom', title: lang === 'en' ? 'New photo pet' : '新的照片伙伴',
    body: lang === 'en' ? 'Your photo is now a desktop pet' : '照片已经变成桌宠啦'
  });
  refreshTray();
  return { ok: true, pet: p, all: customPets };
}

function removeCustomPet(id) {
  const i = customPets.findIndex(p => p.id === id);
  if (i < 0) return false;
  try { fs.unlinkSync(customPets[i].file); } catch (_) {}
  customPets.splice(i, 1);
  saveState();
  refreshTray();
  return true;
}
function checkSitWater() {
  if (focusMode) return;
  const nowMs = Date.now();
  if (sitWarnMin > 0 && nowMs - lastSitAt > sitWarnMin * 60000) {
    lastSitAt = nowMs;
    bubble(lang === 'en' ? 'Been sitting a while — stretch!' : '坐挺久了吧？起来动一动', 3800, true);
    pushNotice({ kind: 'health', title: lang === 'en' ? 'Time to stretch' : '久坐提醒', body: lang === 'en' ? 'You have been sitting for a while — stand up and move!' : '坐得有点久啦，起来活动一下' });
    saveState();
    return;
  }
  if (waterWarnMin > 0 && nowMs - lastWaterAt > waterWarnMin * 60000) {
    lastWaterAt = nowMs;
    bubble(lang === 'en' ? 'Time for some water 💧' : '该喝口水啦 💧', 3200, true);
    pushNotice({ kind: 'health', title: lang === 'en' ? 'Water break' : '喝水提醒', body: lang === 'en' ? 'Take a sip of water 💧' : '喝口水吧 💧' });
    saveState();
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
  const key = dayKey();
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
  const day = dayKey();
  if (counters.lastCheckIn === day) return false;
  const yest = dayKey(Date.now() - 86400000);
  counters.checkIn = counters.lastCheckIn === yest ? (Number(counters.checkIn) || 0) + 1 : 1;
  counters.lastCheckIn = day;
  if (!checkins.includes(day)) { checkins.push(day); if (checkins.length > 420) checkins.shift(); }
  bumpTask('checkin', 1);
  bumpActivity(3);
  addExp(50);
  addStone(1);
  pushNotice({
    kind: 'checkin',
    title: lang === 'en' ? 'Daily check-in' : '每日签到',
    body: lang === 'en' ? `+50 EXP · ${counters.checkIn} days in a row` : `+50 经验 · 连续 ${counters.checkIn} 天`,
    titleJa: 'デイリーチェックイン', titleKo: '일일 출석',
    bodyJa: `+50経験値 · ${counters.checkIn}日連続`, bodyKo: `+50 경험치 · ${counters.checkIn}일 연속`
  });
  saveState();
  setTimeout(() => {
    bubble(uiLang === 'ja'
      ? `今日のチェックイン +50経験値（${counters.checkIn}日連続）`
      : uiLang === 'ko'
        ? `오늘 출석 +50 경험치 (${counters.checkIn}일 연속)`
        : lang === 'en'
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
  for (const f of fresh) {
    pushNotice({
      kind: 'achievement',
      title: '成就解锁', titleEn: 'Achievement unlocked', titleJa: '実績解除', titleKo: '업적 달성',
      body: f.name, bodyEn: f.en || f.name,
      bodyJa: f.descJa || f.ja || f.en || f.name, bodyKo: f.descKo || f.ko || f.en || f.name
    });
  }
  bumpActivity(1);
  bubble(uiLang === 'ja' ? `🏆 実績解除：${a.ja || a.en || a.name}`
    : uiLang === 'ko' ? `🏆 업적 달성: ${a.ko || a.en || a.name}`
    : lang === 'en' ? `🏆 Badge unlocked: ${a.en || a.name}`
    : `🏆 成就解锁：${a.name}`, 4200, true);
  setTimeout(() => { try { playCry(speciesDex, true); } catch (_) {} }, 260);
}

// ---------- 图鉴数据（由 data/pokedex.json 生成，覆盖 001-1025） ----------
const DEX_FILE = path.join(__dirname, 'data', 'pokedex.json');
const DEX_DATA = JSON.parse(fs.readFileSync(DEX_FILE, 'utf8'));
// 英文名数据（data/names-en.json，形如 {"25":"Pikachu"}；没有也不影响中文）
let EN_NAMES = {};
let JA_NAMES = {};
let KO_NAMES = {};
try {
  EN_NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'names-en.json'), 'utf8')) || {};
} catch (_) { EN_NAMES = {}; }
try {
  JA_NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'names-ja.json'), 'utf8')) || {};
} catch (_) { JA_NAMES = {}; }
try {
  KO_NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'names-ko.json'), 'utf8')) || {};
} catch (_) { KO_NAMES = {}; }

const SPECIES = DEX_DATA.species;
const byDex = new Map(SPECIES.map(s => [s.dex, s]));
// 超级进化 / 超极巨化形态表（data/forms.json，由 tools/build-forms.js 生成）
let FORM_DATA = {};
try {
  FORM_DATA = (JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'forms.json'), 'utf8')).forms) || {};
} catch (e) { console.error('[main] 形态表读取失败:', e.message); }
// 形态专属招式（data/form-moves.json，由 tools/build-form-moves.js 生成）
let FORM_MOVES = {};
try {
  FORM_MOVES = (JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'form-moves.json'), 'utf8')).moves) || {};
} catch (e) { console.error('[main] 形态招式表读取失败:', e.message); }
// 进化表：from -> [{ to, how }]，伊布这种一个前身多条分支
const EVO_MAP = (() => {
  const m = {};
  for (const sp of SPECIES) {
    if (!sp.from) continue;
    (m[sp.from] = m[sp.from] || []).push({ to: sp.dex, how: sp.how || '' });
  }
  return m;
})();

// 进化条件的中文 → 英文。数据里的条件由「Lv. / 石头 / 白天 / 携带物」拼成，
// 这里按整词替换，避免把「通信·交换」「攻击>防御」拆坏。
const EVO_WORD_EN = [
  ['通信·交换', 'Trade'],
  ['亲密度·掌握属性招式', 'Friendship · knows a type move'],
  ['攻击<防御', 'Atk < Def'], ['攻击>防御', 'Atk > Def'],
  ['掌握属性招式', 'knows a type move'], ['掌握', 'knows '],
  ['携带锐利之牙', 'holding Razor Fang'], ['携带锐利之爪', 'holding Razor Claw'],
  ['携带浑圆之石', 'holding Oval Stone'], ['携带草莓糖饰', 'holding Strawberry Sweet'],
  ['携带', 'holding '],
  ['亲密度', 'Friendship'], ['白天', 'Day'], ['夜晚', 'Night'], ['下雨', 'Rain'],
  ['特殊地点', 'special location'], ['特殊条件', 'special condition'], ['倒置', 'inverted'],
  ['学会特定招式', 'learns a specific move'],
  ['光之石', 'Shiny Stone'], ['冰之石', 'Ice Stone'], ['叶之石', 'Leaf Stone'],
  ['日之石', 'Sun Stone'], ['暗之石', 'Dusk Stone'], ['月之石', 'Moon Stone'],
  ['水之石', 'Water Stone'], ['火之石', 'Fire Stone'], ['雷之石', 'Thunder Stone'],
  ['觉醒之石', 'Dawn Stone'], ['黑奇石', 'Black Augurite'], ['通信', 'Trade'],
  ['凡作茶碗', 'Chipped Pot'], ['破裂的茶壶', 'Cracked Pot'],
  ['咒术之铠', 'Malicious Armor'], ['庆祝之铠', 'Auspicious Armor'],
  ['复合金属', 'Metal Alloy'], ['恶之挂轴', 'Scroll of Darkness'], ['泥炭块', 'Peat Block'],
  ['酸酸苹果', 'Tart Apple'], ['甜甜苹果', 'Sweet Apple'], ['蜜汁苹果', 'Syrupy Apple']
];
function howEn(h) {
  let s = String(h || '');
  for (const [zh, en] of EVO_WORD_EN) s = s.split(zh).join(en);
  return s.replace(/·/g, ' · ').replace(/\s+/g, ' ').trim();
}

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
  return { move: '撞击', moveEn: 'Tackle', kind: 'star', motion: 'bump', color: '#c8c2b0', type, name: sp ? sp.name : '', nameEn: sp ? (EN_NAMES[sp.dex] || '') : '' };
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
// 以前「自动动作」和「手动点击」共用一个 40–80s 冷却：宠物自己放完招之后，
// 用户在这段时间里点「专属动作 / 形态专属招式」都会被静默拦掉——界面上
// 一点反馈都没有，看起来就是"点了没反应"。而且这个冷却还是全局的，换宠物、
// 超级进化都不会重置，所以很容易误以为"有的宠物坏了"。
// 现在拆成三道闸：
//   manualGate   1.2s，仅挡住上一条演出还没放完时的连点（画面本来就在动）
//   manualReward 6s，只限制经验/计数结算，避免连点刷经验
//   autoMoveAt   40–80s，只约束自动动作自己，绝不再拦手动点击
let manualGate = 0;
let manualRewardAt = 0;
let autoMoveAt = 0;
const MANUAL_MOVE_MS = 1200;
const MANUAL_REWARD_MS = 6000;
const AUTO_MOVE_MS = 40000;
// 变身 / 换宠物后让专属招式立刻可用（不重置经验结算，防止变身连点刷经验）
function resetMoveGate() {
  manualGate = 0;
  autoMoveAt = 0;
}

function playSignature(reason = 'manual') {
  const t = now();
  if (reason === 'auto') {
    if (t < autoMoveAt) return false;          // 自动动作自己的冷却
    if (t < manualGate + 3000) return false;   // 用户刚点过，别抢戏
  } else if (t < manualGate) {
    return false;                              // 上一条演出还没放完，画面已经在动
  }
  if (state === 'drag' || state === 'fall' || state === 'ball') return false;
  // 手动连点也照常放招，只是经验/计数最多 6 秒结算一次
  const rewarded = reason === 'auto' || t >= manualRewardAt;
  if (rewarded) {
    counters.sig++;
    bumpTask('sig', 1);
    bumpActivity(1);
    addExp(25);
    manualRewardAt = t + MANUAL_REWARD_MS;
  }
  const formMove = battleForm ? formMoveFor(battleForm.entry) : null;
  const spec = formMove || signatureFor(speciesDex);
  console.log('[move] ' + (battleForm ? formLabel(battleForm.entry) : spec.name) + ' 使用 ' + spec.move + '（' + spec.kind + '/' + spec.motion + '）' +
    ' bounds=' + JSON.stringify(win ? win.getBounds() : null) + (rewarded ? '' : ' [repeat]'));
  if (reason === 'auto') autoMoveAt = t + AUTO_MOVE_MS + Math.random() * 40000;
  else manualGate = t + MANUAL_MOVE_MS;
  setState('move', 1200);
  if (win && !win.isDestroyed()) win.webContents.send('fx', { ...spec, form: !!battleForm, moveText: formMove ? formMoveLabel(spec) : '' });
  bubble(formMove ? `${formMoveLabel(spec)}！` : ((lang === 'en' ? (spec.moveEn || spec.move) : spec.move) + (lang === 'en' ? '!' : '！')), 1700);
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

// 天气 / 时段 → 偏好属性：串门时优先抽这些属性的宝可梦，模拟"野外遭遇"
const WEATHER_TYPE_PREF = {
  雨: ['水', '虫', '草'],
  雪: ['冰', '妖精', '水'],
  雷: ['电', '飞行', '龙'],
  晴: ['火', '草', '地面', '妖精'],
  云: ['一般', '飞行', '超能力']
};
const NIGHT_TYPE_PREF = ['幽灵', '恶', '虫'];   // 夜晚额外偏好

function weatherGuestPool() {
  const exclude = new Set([speciesDex, ...(roster.map(p => p.dex))]);
  let pool = SPECIES.filter(sp => !exclude.has(sp.dex));
  const prefs = [];
  const wk = weather && weather.kind;
  if (wk && WEATHER_TYPE_PREF[wk]) prefs.push(...WEATHER_TYPE_PREF[wk]);
  if (isNight()) prefs.push(...NIGHT_TYPE_PREF);
  if (!prefs.length) return pool;
  // 把偏好属性的宝可梦在池里复制几份（提高被抽中概率），但保留全池兜底
  const boosted = [];
  for (const sp of pool) {
    const hit = sp.types.some(t => prefs.includes(t));
    boosted.push(sp);
    if (hit) { boosted.push(sp); boosted.push(sp); }   // 偏好属性权重 ×3
  }
  return boosted;
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

// ---------- 超级进化 / 超极巨化 ----------
const FORM_DIR = path.join(__dirname, 'assets', 'forms');
const FORM_MS = { mega: 120000, gmax: 90000 };
function formMoveFor(entry) {
  const m = entry && FORM_MOVES[entry.file];
  if (m) return m;
  const base = entry ? signatureFor(entry.dex || speciesDex) : null;
  return base ? { ...base, file: entry ? entry.file : '' } : { move: '撞击', moveEn: 'Tackle', moveJa: '', moveKo: '', type: '一般', kind: 'star', motion: 'bump', color: '#c8c2b0' };
}
function localizeForm(entry, dex) {
  if (!entry) return entry;
  return {
    ...entry,
    dex: dex || entry.dex || speciesDex,
    nameJa: formLabelFor(entry, 'ja'),
    nameKo: formLabelFor(entry, 'ko'),
    move: formMoveFor({ ...entry, dex: dex || entry.dex || speciesDex })
  };
}
const formOptions = dex => {
  const v = FORM_DATA[dex] || {};
  return {
    mega: Array.isArray(v.mega) ? v.mega.map(e => localizeForm(e, dex)) : [],
    gmax: Array.isArray(v.gmax) ? v.gmax.map(e => localizeForm(e, dex)) : []
  };
};
function formLabelFor(entry, l) {
  if (!entry) return '';
  if (l === 'en') return entry.name;
  if (l === 'zh') return entry.nameZh;
  const dex = entry.dex || speciesDex;
  const base = (l === 'ja' ? JA_NAMES[dex] : KO_NAMES[dex]) || entry.name || entry.nameZh || '';
  const suffix = (String(entry.name || '').match(/\b([XYZ])$/) || String(entry.nameZh || '').match(/([XYZ])$/) || [])[1] || '';
  const prefix = entry.kind === 'gmax' ? (l === 'ja' ? 'キョダイマックス' : '거대맥스') : (l === 'ja' ? 'メガ' : '메가');
  return `${prefix}${base}${suffix}`;
}
function formLabel(entry) { return formLabelFor(entry, uiLang); }
function formKindLabel(kind) {
  if (uiLang === 'en') return kind === 'mega' ? 'Mega Evolution' : 'Gigantamax';
  if (uiLang === 'ja') return kind === 'mega' ? 'メガシンカ' : 'キョダイマックス';
  if (uiLang === 'ko') return kind === 'mega' ? '메가진화' : '거대맥스';
  return kind === 'mega' ? '超级进化' : '超极巨化';
}
function formMoveLabel(move) {
  if (!move) return '';
  if (uiLang === 'ja') return move.moveJa || move.moveEn || move.move || '';
  if (uiLang === 'ko') return move.moveKo || move.moveEn || move.move || '';
  if (uiLang === 'en') return move.moveEn || move.move || '';
  return move.move || move.moveEn || '';
}
function formSpriteUrl(entry, wantShiny, baseDex = speciesDex) {
  const shiny = path.join(FORM_DIR, entry.file + '-shiny.gif');
  const plain = path.join(FORM_DIR, entry.file + '.gif');
  // 异色形态没有图时优先退回同形态普通图，再退回本体图
  const f = wantShiny && fs.existsSync(shiny) ? shiny : (fs.existsSync(plain) ? plain : null);
  if (f) return require('url').pathToFileURL(f).href;
  return spriteUrlFor(baseDex, wantShiny);
}
function formPayload() {
  if (!battleForm) return null;
  const e = battleForm.entry;
  const move = formMoveFor(e);
  // 有少数新形态（Z-A 的超级进化）官方素材库还没出图。这里显式告诉渲染端，
  // 让它用「本体图 + 形态色描边 / 呼吸光环」顶替，避免变身后看起来没变化。
  // 等 tools/fetch-forms.js 把图补进 assets/forms 后，这里会自动变回 false。
  const noart = !fs.existsSync(path.join(FORM_DIR, e.file + '.gif'));
  return {
    kind: battleForm.kind, file: e.file, name: e.name, nameZh: e.nameZh,
    nameJa: formLabelFor(e, 'ja'), nameKo: formLabelFor(e, 'ko'), types: e.types, until: battleForm.until,
    noart,
    move: { zh: move.move, en: move.moveEn, ja: move.moveJa || '', ko: move.moveKo || '', type: move.type, color: move.color },
    url: formSpriteUrl(e, shiny)
  };
}
function sendForm() {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('form', formPayload()); } catch (_) {}
  }
}
function clearForm(auto = false, silent = false) {
  if (!battleForm) return;
  const was = battleForm.kind;
  battleForm = null;
  sendForm();
  refreshTray();
  saveState();
  notifySettings();
  if (!silent) bubble(auto
    ? (uiLang === 'ja' ? `${formKindLabel(was)}が終了、元に戻りました` : uiLang === 'ko' ? `${formKindLabel(was)} 종료, 원래대로 돌아왔습니다` : lang === 'en' ? `${formKindLabel(was)} ended` : `${formKindLabel(was)}结束，变回来了`)
    : (uiLang === 'ja' ? '元の姿に戻りました' : uiLang === 'ko' ? '원래 모습으로 돌아왔습니다' : lang === 'en' ? 'Reverted to normal' : '变回原来的样子了'), 2200);
}
function transformForm(kind, file) {
  if (battleForm) { clearForm(false); return { ok: true, reverted: true }; }
  const opts = formOptions(speciesDex);
  const list = opts[kind] || [];
  if (!list.length) return { ok: false, reason: 'none' };
  const entry = list.find(e => e.file === file) || list[0];
  const move = formMoveFor(entry);
  battleForm = { kind, entry, until: Date.now() + (FORM_MS[kind] || 60000) };
  resetMoveGate();   // 变身完成，专属招式立刻能放
  if (!fs.existsSync(path.join(FORM_DIR, entry.file + '.gif'))) console.log('[form] 无立绘，使用本体图+替代特效:', entry.file);
  sendForm();
  refreshTray();
  saveState();
  notifySettings();
  const label = formLabel(entry);
  bubble(`${formKindLabel(kind)}！${label}！${formMoveLabel(move)}！`, 3600);
  const secs = Math.round((FORM_MS[kind] || 60000) / 1000);
  const secsText = uiLang === 'ja' ? `${secs}秒` : uiLang === 'ko' ? `${secs}초` : `持续 ${secs} 秒`;
  pushNotice({
    kind: 'form',
    title: formKindLabel(kind),
    body: `${label} · ${formMoveLabel(move)} · ${secsText}`,
    titleEn: kind === 'mega' ? 'Mega Evolution' : 'Gigantamax',
    bodyEn: `${entry.name} · ${move.moveEn || move.move} · lasts ${secs}s`,
    titleJa: kind === 'mega' ? 'メガシンカ' : 'キョダイマックス',
    bodyJa: `${formLabelFor(entry, 'ja')} · ${move.moveJa || move.moveEn || move.move} · ${secs}秒`,
    titleKo: kind === 'mega' ? '메가진화' : '거대맥스',
    bodyKo: `${formLabelFor(entry, 'ko')} · ${move.moveKo || move.moveEn || move.move} · ${secs}초`
  });
  // 变身专属演出由渲染层接管；这里只负责把形态和招式同步过去
  setTimeout(() => playCry(speciesDex, true), 250);
  return { ok: true, kind, file: entry.file };
}

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
// 当前语言下的名字：英文界面优先用 names-en.json（没数据就退回中文）
const nameOf = dex => {
  const sp = byDex.get(Number(dex));
  if (!sp) return '';
  if (uiLang === 'en' && EN_NAMES[sp.dex]) return EN_NAMES[sp.dex];
  if (uiLang === 'ja' && JA_NAMES[sp.dex]) return JA_NAMES[sp.dex];
  if (uiLang === 'ko' && KO_NAMES[sp.dex]) return KO_NAMES[sp.dex];
  return sp.name;
};

const shellBg = () => (nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7');
const now = () => Date.now();
const pick = a => a[(Math.random() * a.length) | 0];

// 用「本地日期」做每日判定（签到 / 连续陪伴 / 节日）。
// 原来用 toISOString() 是 UTC，东八区会在早上 8 点才翻篇，
// 导致早上打开还能重复签到、连续天数错位。
function dayKey(d) {
  const t = d instanceof Date ? d : new Date(d === undefined ? Date.now() : d);
  const p = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
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
let themeMode = 'auto';   // auto | light | dark

// ---------- 皮肤 / 辅助功能 ----------
let skin = 'default';        // default | sakura | ocean | forest | festival
let festivalAuto = true;     // 节日自动换肤
let access = { reduceMotion: false, highContrast: false, uiScale: 100, volume: 45 };
const SKINS = ['default', 'sakura', 'ocean', 'forest', 'festival'];
function festivalSkinFor(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  const inRange = (m1, d1, m2, d2) => {
    const cur = m * 100 + day, a = m1 * 100 + d1, b = m2 * 100 + d2;
    return a <= b ? (cur >= a && cur <= b) : (cur >= a || cur <= b);
  };
  if (inRange(12, 20, 1, 3) || inRange(10, 1, 10, 7) || inRange(10, 25, 10, 31)) return 'festival';
  if (inRange(2, 7, 2, 14)) return 'sakura';
  if (inRange(7, 1, 7, 7)) return 'ocean';
  if (inRange(3, 20, 4, 10)) return 'forest';
  return 'default';
}
function effectiveSkin() {
  if (festivalAuto) {
    const f = festivalSkinFor();
    if (f !== 'default') return f;
  }
  return SKINS.includes(skin) ? skin : 'default';
}
function sendSkin(w) {
  if (!w || w.isDestroyed()) return;
  try { w.webContents.send('skin', effectiveSkin()); } catch (_) {}
}
function sendAccess(w) {
  if (!w || w.isDestroyed()) return;
  try { w.webContents.send('access', { ...access }); } catch (_) {}
}
function applyZoom(w) {
  if (!w || w.isDestroyed() || w === win || w === loreWin) return;
  try { w.webContents.setZoomFactor(Math.max(.8, Math.min(1.3, access.uiScale / 100))); } catch (_) {}
}
function applyUiTo(w) {
  if (!w || w.isDestroyed()) return;
  sendSkin(w); sendAccess(w); applyZoom(w);
}
app.on('browser-window-created', (_e, w) => {
  w.webContents.on('did-finish-load', () => applyUiTo(w));
});
function setSkin(s2) {
  skin = SKINS.includes(s2) ? s2 : 'default';
  saveState();
  for (const w of BrowserWindow.getAllWindows()) sendSkin(w);
  notifySettings();
}
function setAccess(patch) {
  access = { ...access, ...patch };
  access.uiScale = [90, 100, 110, 125].includes(Number(access.uiScale)) ? Number(access.uiScale) : 100;
  access.volume = clamp(Number(access.volume) || 0, 0, 100);
  access.reduceMotion = !!access.reduceMotion;
  access.highContrast = !!access.highContrast;
  saveState();
  for (const w of BrowserWindow.getAllWindows()) {
    sendAccess(w);
    if (w !== win && w !== loreWin) applyZoom(w);
  }
  notifySettings();
}

function applyTheme() {
  try {
    nativeTheme.themeSource = themeMode === 'auto' ? 'system' : (themeMode === 'dark' ? 'dark' : 'light');
  } catch (_) {}
}

// 老版本通知只有中文；切换英文时补一份英文，避免整页混着中文
function legacyNoticeEn(n) {
  if (!n) return n;
  const cjk = s => /[\u3400-\u9fff]/.test(String(s || ''));
  let titleEn = n.titleEn;
  if (!titleEn || cjk(titleEn)) {
    const map = { '任务完成': 'Task complete', '奖励已领取': 'Reward claimed', '成就解锁': 'Achievement unlocked', '签到成功': 'Checked in', '捡到蛋': 'Egg found', '孵化了': 'Hatched' };
    titleEn = map[n.title] || (n.kind === 'task' ? 'Task complete' : n.kind === 'achievement' ? 'Achievement unlocked' : n.kind === 'form' ? (String(n.title).includes('巨') ? 'Gigantamax' : 'Mega Evolution') : 'Notification');
  }
  let bodyEn = n.bodyEn;
  if (!bodyEn || cjk(bodyEn)) {
    let b = String(n.body || '');
    b = b.replace(/—— 到设置里领奖励/g, '— claim in Settings')
      .replace(/^发动 (\d+) 次专属动作/, 'Use signature move $1 times')
      .replace(/^走 (\d+) 米/, 'Walk $1 m')
      .replace(/^喂食 (\d+) 次/, 'Feed $1 times')
      .replace(/^摸头 (\d+) 次/, 'Pet $1 times')
      .replace(/^玩耍 (\d+) 次/, 'Play $1 times')
      .replace(/^签到 (\d+) 次/, 'Check in $1 times')
      .replace(/^孵蛋 (\d+) 次/, 'Hatch $1 eggs')
      .replace(/^进化 (\d+) 次/, 'Evolve $1 times')
      .replace(/持续 (\d+) 秒/g, 'lasts $1s');
    if (cjk(b)) {
      const a = ACHIEVEMENTS.find(x => x.name === n.body);
      b = a ? a.en : 'Open Settings for details';
    }
    bodyEn = b;
  }
  return { ...n, titleEn, bodyEn };
}

let stateRev = 0;   // 存档版本号：每次保存 +1，防止旧实例退出时用旧快照覆盖新存档
function loadState() {
  try {
    hadStateFile = fs.existsSync(stateFile());
    let d;
    try {
      d = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    } catch (err) {
      const bak = stateFile() + '.bak';
      if (!fs.existsSync(bak)) throw err;
      console.warn('[loadState] 主存档损坏，改用备份');
      d = JSON.parse(fs.readFileSync(bak, 'utf8'));
    }
    stateRev = Number(d.rev) || 0;
    stats.hunger = clamp(Number(d.stats?.hunger ?? 80), 0, 100);
    stats.mood = clamp(Number(d.stats?.mood ?? 80), 0, 100);
    if (SIZES[d.sizeKey]) sizeKey = d.sizeKey;
    if (typeof d.soundOn === 'boolean') soundOn = d.soundOn;
    if (d.species && SPECIES.some(s => s.dex === Number(d.species))) speciesDex = Number(d.species);
    if (d.shinyMode === 'auto' || d.shinyMode === 'always' || d.shinyMode === 'never') shinyMode = d.shinyMode;
    if (d.starAsked === true) starAsked = true;
    if (d.focusMode === true) focusMode = true;
    if (d.guestEnabled === false) guestEnabled = false;
    if (Number.isFinite(d.roamCount)) roamCount = clamp(Number(d.roamCount), 0, MAX_ROAM);
    if (d.customPetsOn === false) customPetsOn = false;
    if (d.healthLog && typeof d.healthLog === 'object') {
      healthLog = {};
      for (const [k, v] of Object.entries(d.healthLog)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object') {
          healthLog[k] = {
            moodSum: Number(v.moodSum) || 0, hungerSum: Number(v.hungerSum) || 0,
            n: Number(v.n) || 0, moodAvg: Number(v.moodAvg) || 0, hungerAvg: Number(v.hungerAvg) || 0,
            feed: Number(v.feed) || 0, play: Number(v.play) || 0
          };
        }
      }
    }
    if (Array.isArray(d.favorites)) favorites = d.favorites.filter(n => Number.isFinite(n));
    if (Array.isArray(d.roster)) {
      roster = d.roster
        .filter(p => p && SPECIES.some(sp => sp.dex === Number(p.dex)))
        .map(p => ({
          dex: Number(p.dex),
          nickname: typeof p.nickname === 'string' ? p.nickname.slice(0, 12) : '',
          hat: ['none','cap','tophat','crown'].includes(p.hat) ? p.hat : 'none',
          scarf: ['none','red','blue','green'].includes(p.scarf) ? p.scarf : 'none'
        }))
        .slice(0, 12);
    }
    if (typeof d.nickname === 'string') nickname = d.nickname.slice(0, 12);
    if (Array.isArray(d.customPets)) {
      customPets = d.customPets
        .filter(p => p && typeof p.file === 'string')
        .map(p => ({
          id: Number(p.id) || 0,
          name: typeof p.name === 'string' ? p.name.slice(0, 16) : '伙伴',
          file: p.file,
          w: Number(p.w) || 0, h: Number(p.h) || 0
        }))
        .slice(0, 20);
      customSeq = customPets.reduce((m, p) => Math.max(m, p.id), 0);
    }
    if (['none','cap','tophat','crown'].includes(d.hat)) hat = d.hat;
    if (['none','red','blue','green'].includes(d.scarf)) scarf = d.scarf;
    if (Number.isFinite(d.eggTarget) && d.eggTarget > 1000) eggTarget = d.eggTarget;
    if (Number.isFinite(d.walkedPx)) walkedPx = Math.max(0, d.walkedPx);
    if (d.hasEgg === true) hasEgg = true;   // 上次退出时脚边那颗蛋还在
    if (['common','rare','legendary','shiny'].includes(d.eggRarity)) eggRarity = d.eggRarity;
    if (d.shinyLocked === true) shinyLocked = true;
    if (Number.isFinite(d.firstLaunch)) firstLaunch = d.firstLaunch;
    if (Number.isFinite(d.sitWarnMin)) sitWarnMin = d.sitWarnMin;
    if (Number.isFinite(d.waterWarnMin)) waterWarnMin = d.waterWarnMin;
    if (Number.isFinite(d.lastSitAt)) lastSitAt = d.lastSitAt;
    if (Number.isFinite(d.lastWaterAt)) lastWaterAt = d.lastWaterAt;
    if (d.pomo && Number.isFinite(d.pomo.until) && d.pomo.until > Date.now()) {
      pomo = {
        phase: d.pomo.phase === 'rest' ? 'rest' : 'work',
        until: d.pomo.until,
        restMin: Number(d.pomo.restMin) || 5,
        workMin: Number(d.pomo.workMin) || 25
      };
    } else if (d.pomo) {
      pomo = null;
    }
    if (['auto', 'light', 'dark'].includes(d.theme)) themeMode = d.theme;
    if (SKINS.includes(d.skin)) skin = d.skin;
    if (typeof d.festivalAuto === 'boolean') festivalAuto = d.festivalAuto;
    if (d.access && typeof d.access === 'object') {
      access = {
        reduceMotion: !!d.access.reduceMotion,
        highContrast: !!d.access.highContrast,
        uiScale: [90, 100, 110, 125].includes(Number(d.access.uiScale)) ? Number(d.access.uiScale) : 100,
        volume: clamp(Number(d.access.volume ?? 45), 0, 100)
      };
    }
    if (Number.isFinite(d.counters && d.counters.stones)) counters.stones = d.counters.stones;
    if (Array.isArray(d.dexMet)) dexMet = d.dexMet.filter(n => Number.isFinite(n));
    if (Array.isArray(d.shinyMet)) shinyMet = d.shinyMet.filter(n => Number.isFinite(n));
    if (d.counters && typeof d.counters === 'object') counters = { ...counters, ...d.counters };
    if (d.unlocked && typeof d.unlocked === 'object') unlocked = d.unlocked;
    if (['zh', 'en', 'ja', 'ko'].includes(d.lang)) uiLang = d.lang;
    lang = uiLang === 'en' ? 'en' : 'zh';
    if (typeof d.lastSeenVersion === 'string') lastSeenVersion = d.lastSeenVersion;
    if (Number.isFinite(d.updateSnoozeUntil)) updateSnoozeUntil = Number(d.updateSnoozeUntil);
    if (d.pendingUpdate && typeof d.pendingUpdate === 'object' && typeof d.pendingUpdate.version === 'string') {
      pendingUpdate = { version: d.pendingUpdate.version, notes: d.pendingUpdate.notes || null, at: Number(d.pendingUpdate.at) || Date.now(), date: String(d.pendingUpdate.date || '') };
    }
    if (Array.isArray(d.notifications)) {
      notifications = d.notifications.filter(n => n && Number.isFinite(n.id)).map(legacyNoticeEn).slice(0, 100);
      notifySeq = notifications.reduce((m, n) => Math.max(m, n.id), 0);
    }
    if (typeof d.notifySystem === 'boolean') notifySystem = d.notifySystem;
    if (Array.isArray(d.checkins)) checkins = d.checkins.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(String(x))).slice(-420);
    if (!checkins.length && /^\d{4}-\d{2}-\d{2}$/.test(String((d.counters || {}).lastCheckIn || ''))) {
      checkins = [String(d.counters.lastCheckIn)];
    }
    if (d.activity && typeof d.activity === 'object') {
      activity = {};
      for (const [k, v] of Object.entries(d.activity)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(Number(v))) activity[k] = Number(v);
      }
    }
    if (d.tasks && typeof d.tasks === 'object') {
      tasksState = {
        day: typeof d.tasks.day === 'string' ? d.tasks.day : '',
        week: typeof d.tasks.week === 'string' ? d.tasks.week : '',
        daily: d.tasks.daily && typeof d.tasks.daily === 'object' ? d.tasks.daily : {},
        weekly: d.tasks.weekly && typeof d.tasks.weekly === 'object' ? d.tasks.weekly : {}
      };
      for (const freq of ['daily', 'weekly']) {
        for (const def of TASK_DEFS[freq]) {
          const b = tasksState[freq][def.id];
          if (!b || !Number.isFinite(b.p)) tasksState[freq][def.id] = { p: 0, claimed: false, notified: false };
        }
      }
    }
    ensureTasks();
    // 自定义提醒事项
    if (Array.isArray(d.reminders)) {
      reminders = d.reminders
        .filter(r => r && typeof r === 'object')
        .map(r => ({
          id: Number(r.id) || 0,
          label: typeof r.label === 'string' ? r.label.slice(0, 24) : '',
          time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '09:00',
          days: Array.isArray(r.days) ? r.days.filter(x => x >= 0 && x <= 6) : [],
          enabled: r.enabled !== false,
          lastFired: typeof r.lastFired === 'string' ? r.lastFired : ''
        }))
        .slice(0, 50);
      reminderSeq = reminders.reduce((m, r) => Math.max(m, r.id), 0);
    }
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
  if (rotateMin > 0) rotateAt = Date.now() + rotateMin * 60000;   // 启动后先陪一会儿，别一上来就换
  if (!roster.length && SPECIES.some(sp => sp.dex === speciesDex)) {
    roster = [{ dex: speciesDex, nickname: nickname || '', hat: hat || 'none', scarf: scarf || 'none' }];
  } else {
    loadRosterLook(speciesDex);
  }
  syncRosterEntry();
}
function saveState() {
  try {
    syncRosterEntry();
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const file = stateFile();
    const tmp = file + '.tmp';
    // 防多实例竞态：磁盘上已有更新的存档时绝不覆盖。
    // （曾有旧实例退出时的保存把新存档冲回旧快照，用户进度看起来"回档"）
    let diskRev = 0;
    try { diskRev = Number(JSON.parse(fs.readFileSync(file, 'utf8')).rev) || 0; } catch (_) {}
    if (diskRev > stateRev) {
      console.error(`[saveState] 磁盘存档较新（rev ${diskRev} > 本实例 ${stateRev}），疑似另一个实例在写，跳过本次保存`);
      return;
    }
    stateRev = diskRev + 1;
    fs.writeFileSync(tmp, JSON.stringify({
      stats, sizeKey, soundOn, species: speciesDex, shinyMode, shinyLocked, starAsked, focusMode, dexMet, shinyMet, counters, unlocked, level, exp, lang: uiLang, rotateMin, guestEnabled, roamCount, favorites, firstLaunch, sitWarnMin, waterWarnMin, eggTarget, walkedPx, hasEgg, eggRarity, theme: themeMode,
      roster, nickname, hat, scarf, skin, festivalAuto, access, customPets, customPetsOn,
      notifications, notifySystem, checkins, activity, tasks: tasksState, reminders, healthLog,
      lastSeenVersion, pendingUpdate, updateSnoozeUntil,
      lastSitAt, lastWaterAt,
      pomo: pomo ? { phase: pomo.phase, until: pomo.until, restMin: pomo.restMin, workMin: pomo.workMin } : null,
      rev: stateRev,
      savedAt: new Date().toISOString()
    }));
    // 先写临时文件再改名：断电时旧存档仍完整；另保留两代备份（.bak / .bak2）
    try { const bak = file + '.bak'; if (fs.existsSync(bak)) fs.copyFileSync(bak, file + '.bak2'); } catch (_) {}
    try { if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak'); } catch (_) {}
    fs.renameSync(tmp, file);
  } catch (e) { console.error('saveState failed:', e.message); }
}

let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveState(); }, 1200);
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

// 每 30 秒采样一次心情 / 饱食度，攒成当天的均值；跨天时自动滚动
function sampleHealth() {
  const t = now();
  if (t - lastHealthSampleAt < 30000) return;
  lastHealthSampleAt = t;
  const dk = dayKey();
  if (!healthLog[dk]) healthLog[dk] = { moodSum: 0, hungerSum: 0, n: 0, feed: counters.feed || 0, play: counters.play || 0 };
  const e = healthLog[dk];
  e.moodSum += stats.mood; e.hungerSum += stats.hunger; e.n++;
  e.moodAvg = Math.round(e.moodSum / e.n);
  e.hungerAvg = Math.round(e.hungerSum / e.n);
  e.feed = counters.feed || 0;
  e.play = counters.play || 0;
  // 只保留最近 366 天
  const keys = Object.keys(healthLog).sort();
  if (keys.length > 366) for (let i = 0; i < keys.length - 366; i++) delete healthLog[keys[i]];
  saveSoon();
}

// 年度仪表盘数据
function healthDashboard() {
  const days = firstLaunch ? Math.max(1, Math.floor((Date.now() - firstLaunch) / 86400000) + 1) : 1;
  const keys = Object.keys(healthLog).sort();
  const series = keys.slice(-30).map(k => ({ day: k, mood: healthLog[k].moodAvg ?? 0, hunger: healthLog[k].hungerAvg ?? 0 }));
  // 年度统计
  const year = keys.slice(-365);
  let moodSum = 0, hungerSum = 0, n = 0;
  for (const k of year) { moodSum += healthLog[k].moodAvg ?? 0; hungerSum += healthLog[k].hungerAvg ?? 0; n++; }
  const avgMood = n ? Math.round(moodSum / n) : Math.round(stats.mood);
  const avgHunger = n ? Math.round(hungerSum / n) : Math.round(stats.hunger);
  // 最常养的前 5 只（按出现次数）
  const petCount = {};
  for (const k of year) {
    // healthLog 不存 species，用 roster + dexMet 近似：取已解锁里前 5
  }
  const topPets = (dexMet.length ? dexMet : [speciesDex]).slice(-5).map(d => ({ dex: d, name: nameOf(d) }));
  return {
    days, avgMood, avgHunger,
    currentMood: Math.round(stats.mood), currentHunger: Math.round(stats.hunger),
    series, totalSamples: keys.length,
    topPets,
    feed: counters.feed || 0, play: counters.play || 0, pet: counters.pet || 0
  };
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

  if (battleForm && t > battleForm.until) clearForm(true);
  tickPomodoro(t);
  if (t > achCheckAt) { achCheckAt = t + 15000; checkAchievements(); }
  if (t > expAt) { expAt = t + 60000; if (!focusMode) addExp(10); }
  if (rotateMin > 0 && t > rotateAt) { rotateAt = t + rotateMin * 60000; if (dexMet.length > 1) randomSpecies(); }
  checkSitWater();
  checkReminders();
  sampleHealth();
  if (guestEnabled && !guest && t > nextGuestAt) spawnGuest();
  updateGuest(t, dt);
  syncRoamers();
  updateRoamers(t, dt);
  syncCustomRoamers();
  updateCustomRoamers(t, dt);
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
      const stepPx = Math.abs(speed * ((currentNature || NATURES[0]).speed || 1) * dt);
      walkedPx += stepPx;
      counters.walked = (counters.walked || 0) + stepPx;
      walkTaskPx += stepPx;
      if (walkTaskPx >= 50) {
        const meters = Math.floor(walkTaskPx / 50);
        walkTaskPx -= meters * 50;
        bumpTask('walk', meters);
      }
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
    win.webContents.send('init', { shiny, petH, spriteUrl: spriteUrlFor(speciesDex, shiny), hat, scarf, nickname, form: formPayload() });
    sendLook();
    sendAccess(win);
    sendSkin(win);
    // 重载页面（切语言时会）后，主进程缓存的「上次发送值」要失效，
    // 否则朝向/高度/蛋这几条只会发一次的消息会被当成已发过而漏掉
    sentFace = 0;
    sentAlt = -1;
    if (hasEgg) win.webContents.send('egg', { rarity: eggRarity });
    setState('walk', 3500);
    dir = 1;
    speed = 45;
    if (shiny) bubble('✨ 异色宝可梦出现了 ✨', 4000);
    const hh = new Date().getHours();
    const greet = hh < 5 ? '这么晚还没睡…' : hh < 9 ? '早上好～' : hh < 12 ? '上午好～'
      : hh < 14 ? '中午好～' : hh < 18 ? '下午好～' : '晚上好～';
    setTimeout(() => { if (!inBall) bubble(greet, 2600); }, 1200);
    // 下面这些只做一次：页面重载（换语言 / 崩溃恢复）时重复注册会翻倍
    if (petBooted) return;
    petBooted = true;
    setTimeout(() => maybeShowWhatsNew(), 2600);
    if (process.env.PET_UI_LANG) setTimeout(() => setLang(process.env.PET_UI_LANG), 400);
    if (process.env.PET_FORM) setTimeout(() => {
      const parts = String(process.env.PET_FORM).split(':');
      const kind = parts[0] === 'gmax' ? 'gmax' : 'mega';
      const r = transformForm(kind, parts[1] || '');
      console.log('[form-debug]', JSON.stringify(r));
      if (process.env.PET_CAPTURE) setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        win.webContents.capturePage().then(img => {
          fs.writeFileSync(path.join(__dirname, 'form-shot.png'), img.toPNG());
          console.log('[form-debug] 演出截图 form-shot.png');
        }).catch(() => {});
      }, 900);
    }, 900);
    fetchWeather();
    setInterval(fetchWeather, 15 * 60 * 1000);
    setTimeout(() => checkUpdate(false), 8000);
    setInterval(() => checkUpdate(false), 6 * 60 * 60 * 1000);
    // 装好第一次打开时，等它露面十几秒再问，别一启动就糊脸
    setTimeout(() => { if (!starAsked && !inBall) createStarWindow(); }, 12000);
    if (process.env.PET_SHARE) setTimeout(() => makeShareCard(process.env.PET_SHARE), 3000);
    if (process.env.PET_SETTINGS) setTimeout(() => createSettingsWindow(), 2500);
    if (process.env.PET_THEMETEST) setTimeout(async () => {
      try {
        if (!settingsWin || settingsWin.isDestroyed()) createSettingsWindow();
        await new Promise(r => setTimeout(r, 1600));
        await settingsWin.webContents.executeJavaScript(
          "document.querySelector('#theme-seg [data-key=\"dark\"]').click()");
        await new Promise(r => setTimeout(r, 800));
        const dark = await settingsWin.webContents.executeJavaScript(
          "JSON.stringify({dark:matchMedia('(prefers-color-scheme: dark)').matches, bg:getComputedStyle(document.body).backgroundColor})");
        console.log('[theme] 深色后', dark);
        await settingsWin.webContents.executeJavaScript(
          "document.querySelector('#theme-seg [data-key=\"light\"]').click()");
        await new Promise(r => setTimeout(r, 800));
        const light = await settingsWin.webContents.executeJavaScript(
          "JSON.stringify({dark:matchMedia('(prefers-color-scheme: dark)').matches, bg:getComputedStyle(document.body).backgroundColor})");
        console.log('[theme] 浅色后', light);
      } catch (e) { console.log('[theme] 失败', e.message); }
    }, 8000);
    if (process.env.PET_EGGI18N) setTimeout(async () => {
      createEggWindow();
      setTimeout(async () => {
        try {
          const r = await eggWin.webContents.executeJavaScript(
            "JSON.stringify({title:document.querySelector('h1')?.textContent, sub:document.querySelector('.sub')?.textContent, btn:document.querySelector('button')?.textContent, dark:matchMedia('(prefers-color-scheme: dark)').matches})");
          console.log('[eggi18n]', r);
        } catch (e) { console.log('[eggi18n] 失败', e.message); }
      }, 2500);
    }, 7000);
    if (process.env.PET_I18N) setTimeout(async () => {
      try {
        const r = await settingsWin.webContents.executeJavaScript(`(function(){
          document.getElementById('tab-dex').click();
          return new Promise(res => setTimeout(() => {
          const q = s => [...document.querySelectorAll(s)].map(e => e.textContent.trim());
          res(JSON.stringify({
            tabs: q('.tab'),
            chips: q('.chip').slice(0, 6),
            hint: document.getElementById('hint').textContent,
            count: document.getElementById('count').textContent,
            names: [...document.querySelectorAll('.card .name')].slice(0, 3).map(e => e.textContent.trim())
          }));
          }, 400));
        })()`);
        console.log('[i18n]', r);
      } catch (e) { console.log('[i18n] 失败', e.message); }
    }, 9000);
    if (process.env.PET_DIAG) setTimeout(async () => {
      console.log('[diag] settingsWin?', !!settingsWin, settingsWin && !settingsWin.isDestroyed());
      if (!settingsWin) return;
      const t0 = Date.now();
      try {
        const r = await settingsWin.webContents.executeJavaScript("JSON.stringify({cards:document.querySelectorAll('.card').length,locked:document.querySelectorAll('.card.locked').length,listH:document.getElementById('list').scrollHeight,clientH:document.getElementById('list').clientHeight})");
        console.log('[diag]', Date.now()-t0, 'ms', r);
        await settingsWin.webContents.executeJavaScript("document.getElementById('list').scrollTop=1200");
        const before = await settingsWin.webContents.executeJavaScript("document.getElementById('list').scrollTop");
        await settingsWin.webContents.executeJavaScript("document.querySelector('.card:not(.locked):not(.active)').click()");
        await new Promise(r => setTimeout(r, 900));
        const after = await settingsWin.webContents.executeJavaScript("document.getElementById('list').scrollTop");
        const active = await settingsWin.webContents.executeJavaScript("document.querySelector('.card.active') && document.querySelector('.card.active').dataset.dex");
        console.log('[diag] scroll before/after', before, after, 'active', active);
        // 英文名搜索：输入 pikachu 应该只剩皮卡丘
        await settingsWin.webContents.executeJavaScript(
          "const s=document.getElementById('search');s.value='pikachu';s.dispatchEvent(new Event('input'))");
        await new Promise(r => setTimeout(r, 400));
        const n = await settingsWin.webContents.executeJavaScript("document.getElementById('count').textContent");
        const vis = await settingsWin.webContents.executeJavaScript("document.querySelectorAll('.card:not(.hide)').length");
        console.log('[diag] search', n, 'visible', vis);
      } catch (e) { console.log('[diag] 失败', e.message); }
    }, 9000);
    if (process.env.PET_EGG === '1') setTimeout(() => spawnEgg(), 4000);
    if (process.env.PET_REPORT) setTimeout(() => createReportWindow(), 2500);
    if (process.env.PET_GAME) setTimeout(() => createGameWindow(), 2500);
    if (process.env.PET_LORE) setTimeout(() => showLore(), 3500);
    if (process.env.PET_STAR) setTimeout(() => createStarWindow(), 4200);
    if (process.env.PET_LANGTEST) setTimeout(async () => {
      try {
        // 先固定成中文，放一句有英文词条的隐藏文字，再切到英文：
        // 验证「不重载页面也能把已有节点整句换掉」
        await win.webContents.executeJavaScript(
          "window.I18N.setLang('zh');" +
          "const s=document.createElement('span');s.id='langprobe';" +
          "s.style.cssText='position:fixed;left:-9999px';s.textContent='点下面的按钮';" +
          "document.body.append(s);");
        await new Promise(r => setTimeout(r, 400));
        setLang(process.env.PET_LANGTEST === 'zh' ? 'zh' : 'en');
        await new Promise(r => setTimeout(r, 1200));
        const r = await win.webContents.executeJavaScript(
          "JSON.stringify({probe:document.getElementById('langprobe').textContent, lang:window.I18N&&window.I18N.lang})");
        console.log('[langtest]', r);
        if (settingsWin && !settingsWin.isDestroyed()) {
          const s = await settingsWin.webContents.executeJavaScript(
            "JSON.stringify({tab:document.querySelector('.tab.active')&&document.querySelector('.tab.active').textContent," +
            "name:document.querySelector('.card.active .card-name')&&document.querySelector('.card.active .card-name').textContent," +
            "favChip:[...document.querySelectorAll('.chip')].find(c=>c.dataset.type==='收藏')&&[...document.querySelectorAll('.chip')].find(c=>c.dataset.type==='收藏').textContent})");
          console.log('[langtest settings]', s);
        }
      } catch (e) { console.log('[langtest] 失败', e.message); }
    }, 9000);
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
  tray.setToolTip('桌面宠物');
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
      backgroundColor: (nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f6f7fb'),
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
      date: new Date().toLocaleDateString(uiLang === 'ja' ? 'ja-JP' : uiLang === 'ko' ? 'ko-KR' : uiLang === 'en' ? 'en-US' : 'zh-CN')
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
      defaultPath: path.join(dir, `桌面宠物-${sp.name}.png`),
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
  uiLang = ['zh', 'en', 'ja', 'ko'].includes(v) ? v : 'zh';
  lang = uiLang === 'en' ? 'en' : 'zh';
  saveState();
  refreshTray();
  hideLore();
  // 宠物窗口只换 i18n 语言，不重载：重载会让它跳回屏幕中间
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('lang', uiLang); } catch (_) {}
  }
  // 其余窗口里有大量「按当前语言生成」的内容（图鉴名、倒计时、报告文案），
  // 直接重载最省事也最不容易留半句旧语言
  if (settingsWin && !settingsWin.isDestroyed()) {
    try { settingsWin.webContents.send('lang', uiLang); } catch (_) {}
  }
  for (const w of [eggWin, reportWin, loreWin]) {
    if (w && !w.isDestroyed()) { try { w.webContents.reload(); } catch (_) {} }
  }
  bubble(uiLang === 'ja' ? '日本語に切り替えました' : uiLang === 'ko' ? '한국어로 전환했습니다' : uiLang === 'en' ? 'Switched to English' : '换成中文啦', 1600, true);
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
  pomo = { phase: 'work', until: Date.now() + min * 60000, restMin: 5, workMin: min };
  bubble(lang === 'en' ? `Focus for ${min} minutes ⏱` : `好，专注 ${min} 分钟 ⏱`, 2400, true);
  pushNotice({ kind: 'pomo', title: lang === 'en' ? 'Focus started' : '开始专注', body: lang === 'en' ? `${min} minutes · the pet will remind you` : `${min} 分钟，结束后会提醒你` });
  saveState();
  refreshTray();
}

function stopPomodoro() {
  pomo = null;
  bubble(lang === 'en' ? 'Timer stopped' : '番茄钟停啦', 1600, true);
  saveState();
  refreshTray();
}

function tickPomodoro(t) {
  if (!pomo || t < pomo.until) return;
  if (pomo.phase === 'work') {
    bubble(lang === 'en' ? 'Time is up — stand up and stretch 🧘' : '时间到！起来动一动 🧘', 9000, true);
    pushNotice({ kind: 'pomo', title: lang === 'en' ? 'Focus finished' : '专注结束', body: lang === 'en' ? 'Take a 5-minute break' : '休息 5 分钟吧' });
    try { playCry(speciesDex, true); } catch (_) {}
    setState('happy', 2600);
    pomo = { ...pomo, phase: 'rest', until: t + pomo.restMin * 60000 };
  } else {
    bubble(lang === 'en' ? 'Break over — back to work 💪' : '休息结束，继续加油 💪', 6000, true);
    pushNotice({ kind: 'pomo', title: lang === 'en' ? 'Break over' : '休息结束', body: lang === 'en' ? 'Ready for another round?' : '准备下一轮吧' });
    pomo = null;
  }
  saveState();
  refreshTray();
}

function setShinyMode(mode) {
  shinyMode = mode;
  shinyLocked = false;
  shiny = shinyFor(speciesDex);
  if (win && !win.isDestroyed()) {
    win.webContents.send('sprite', { url: spriteUrlFor(speciesDex, shiny) });
    if (battleForm) sendForm();
  }
  saveState();
  refreshTray();
  bubble(shiny
    ? (lang === 'en' ? `✨ Shiny ${nameOf(speciesDex)}` : `✨ 异色 ${nameOf(speciesDex)}`)
    : nameOf(speciesDex), 1600);
}

function formMenuItems(L) {
  if (battleForm) {
    const kindName = formKindLabel(battleForm.kind);
    const endLabel = uiLang === 'ja' ? `${kindName}を解除` : uiLang === 'ko' ? `${kindName} 해제` : uiLang === 'en' ? `End ${kindName}` : `解除${kindName}`;
    const move = formMoveFor(battleForm.entry);
    return [
      { label: `${kindName} · ${formMoveLabel(move)}`, enabled: false },
      { label: endLabel, click: () => clearForm(false) }
    ];
  }
  const opts = formOptions(speciesDex);
  const items = [];
  for (const kind of ['mega', 'gmax']) {
    const list = opts[kind] || [];
    if (!list.length) continue;
    const base = L(kind === 'mega' ? '超级进化' : '超极巨化', kind === 'mega' ? 'Mega Evolution' : 'Gigantamax');
    if (list.length === 1) {
      items.push({
        label: `${base} · ${formLabel(list[0])}`,
        click: () => transformForm(kind, list[0].file)
      });
    } else {
      items.push({
        label: base,
        submenu: list.map(e => ({ label: formLabel(e), click: () => transformForm(kind, e.file) }))
      });
    }
  }
  return items;
}

// 托盘 / Dock 菜单位于主进程，没法走 DOM 的 i18n，单独放一份小字典
const MENU_JA = {
  '伙伴队伍': 'なかま', '喂食 🍞': 'ごはん 🍞', '玩耍 🎾': '遊ぶ 🎾', '打盹 😴': 'うたた寝 😴',
  '飞一飞 🕊️': '飛ぶ 🕊️', '放出来 ⚪': '出す ⚪', '收进球 ⚪': 'ボールに戻す ⚪',
  '专属动作 ✨': '専用技 ✨', '形态专属招式 ✨': '形態専用技 ✨', '随机一只 🎲': 'ランダム 🎲', '看介绍 📖': '図鑑 📖',
  '通知中心': '通知センター', '提醒事项': 'リマインダー', '导入照片伙伴 📷': '写真の仲間を読み込む 📷', '设置…': '設定…', '退出': '終了',
  '饱食度': '満腹度', '心情': 'きもち', '超级进化': 'メガシンカ', '超极巨化': 'キョダイマックス'
};
const MENU_KO = {
  '伙伴队伍': '파트너', '喂食 🍞': '먹이 🍞', '玩耍 🎾': '놀기 🎾', '打盹 😴': '낮잠 😴',
  '飞一飞 🕊️': '날기 🕊️', '放出来 ⚪': '꺼내기 ⚪', '收进球 ⚪': '볼에 넣기 ⚪',
  '专属动作 ✨': '전용 기술 ✨', '形态专属招式 ✨': '형태 전용 기술 ✨', '随机一只 🎲': '랜덤 🎲', '看介绍 📖': '도감 📖',
  '通知中心': '알림 센터', '提醒事项': '알림', '导入照片伙伴 📷': '사진 동료 가져오기 📷', '设置…': '설정…', '退出': '종료',
  '饱食度': '포만감', '心情': '기분', '超级进化': '메가진화', '超极巨化': '거대맥스'
};
function natureLabel(n) {
  if (!n) return '';
  if (uiLang === 'ja') return ({ cheer: 'ようき', lazy: 'のんき', timid: 'おくびょう', tsun: 'ツンデレ', greedy: 'くいしんぼう', sleepy: 'ねぼすけ' })[n.key] || n.en;
  if (uiLang === 'ko') return ({ cheer: '명랑', lazy: '느긋', timid: '소심', tsun: '츤데레', greedy: '먹보', sleepy: '잠꾸러기' })[n.key] || n.en;
  return uiLang === 'en' ? n.en : n.zh;
}
function petMenuTemplate() {
  const L = (zh, en) => uiLang === 'ja' ? (MENU_JA[zh] || en) : uiLang === 'ko' ? (MENU_KO[zh] || en) : uiLang === 'en' ? en : zh;
  const stoneItem = uiLang === 'ja' ? `進化させる ✨ (${counters.stones || 0})` : uiLang === 'ko' ? `진화시키기 ✨ (${counters.stones || 0})` : L(`用${stoneFor()}进化 ✨ (${counters.stones || 0})`, `Evolve with stone ✨ (${counters.stones || 0})`);
  return [
    {
      label: `${petName()} · ${natureLabel(currentNature || NATURES[0])} · Lv.${level} · ${L('饱食度', 'Hunger')} ${Math.round(stats.hunger)} · ${L('心情', 'Mood')} ${Math.round(stats.mood)}`,
      enabled: false
    },
    { type: 'separator' },
    ...(roster.length > 1 ? [{
      label: L('伙伴队伍', 'Team'),
      submenu: roster.map(p => ({
        label: (p.nickname || nameOf(p.dex)) + (p.dex === speciesDex ? ' ✓' : ''),
        click: () => switchSpecies(p.dex)
      }))
    }, { type: 'separator' }] : []),
    { label: L('喂食 🍞', 'Feed 🍞'), click: doFeed },
    { label: L('玩耍 🎾', 'Play 🎾'), click: doPlay },
    { label: L('打盹 😴', 'Nap 😴'), click: doNap },
    ...(canFlyNow() ? [{ label: L('飞一飞 🕊️', 'Fly 🕊️'), click: doFly }] : []),
    { label: inBall ? L('放出来 ⚪', 'Let out ⚪') : L('收进球 ⚪', 'Into ball ⚪'), click: () => toggleBall() },
    { label: battleForm ? L('形态专属招式 ✨', 'Form move ✨') : L('专属动作 ✨', 'Signature move ✨'), click: () => playSignature('manual') },
    { label: stoneItem, click: useStone },
    ...formMenuItems(L),
    { label: L('随机一只 🎲', 'Random 🎲'), click: () => randomSpecies() },
    { label: L('看介绍 📖', 'Profile 📖'), click: () => showLore() },
    { label: L('导入照片伙伴 📷', 'Import photo pet 📷'), click: async () => { await importCustomPet(); } },
    { type: 'separator' },
    { label: L('通知中心', 'Notification center') + (notifications.some(n => !n.read) ? ` (${notifications.filter(n => !n.read).length})` : ''), click: () => openSettingsTab('notify') },
    { label: L('提醒事项', 'Reminders'), click: () => openSettingsTab('remind') },
    { label: L('设置…', 'Settings…'), click: createSettingsWindow },
    { label: L('退出', 'Quit'), click: () => { saveState(); app.quit(); } }
  ];
}
function sendLook() {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('look', { hat, scarf, nickname, name: petName() }); } catch (_) {}
  }
}
function rosterSnapshot() {
  return roster.map(p => {
    const sp = byDex.get(p.dex) || {};
    return {
      dex: p.dex, name: sp.name || '', nameEn: EN_NAMES[p.dex] || '', nameJa: JA_NAMES[p.dex] || '', nameKo: KO_NAMES[p.dex] || '', types: sp.types || [],
      nickname: p.nickname || '', hat: p.hat || 'none', scarf: p.scarf || 'none',
      active: p.dex === speciesDex
    };
  });
}

function refreshTray() {
  if (!tray) return;
  tray.setToolTip(uiLang === 'ja' ? 'デスクトップペット' : uiLang === 'ko' ? '데스크톱 펫' : uiLang === 'en' ? 'Desktop Pet' : '桌面宠物');
  tray.setContextMenu(Menu.buildFromTemplate(petMenuTemplate()));
  // Dock 右键菜单是启动时拍的一张快照，换精灵/喂食后要一起刷新
  if (IS_MAC && app.dock) {
    try { app.dock.setMenu(Menu.buildFromTemplate(petMenuTemplate())); } catch (_) {}
  }
}

// ---------- 托盘动作 ----------
function doFeed() {
  if (state === 'drag' || state === 'fall') return;
  stats.hunger = Math.min(100, stats.hunger + 40);
  stats.mood = Math.min(100, stats.mood + 8);
  counters.feed++;
  bumpTask('feed', 1);
  bumpActivity(1);
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
  bumpTask('play', 1);
  bumpActivity(1);
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
let CHANGELOG = {};
try {
  CHANGELOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'changelog.json'), 'utf8')) || {};
} catch (e) { console.error('[changelog] 读取失败:', e.message); }

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
function noteItem(x) {
  if (!x) return null;
  if (typeof x === 'string') return { zh: x, en: x, ja: x, ko: x };
  const zh = String(x.zh || x.en || '').trim();
  const en = String(x.en || x.zh || '').trim();
  const ja = String(x.ja || en || zh || '').trim();
  const ko = String(x.ko || en || zh || '').trim();
  return zh || en ? { zh: zh || en, en: en || zh, ja: ja || en || zh, ko: ko || en || zh } : null;
}
function notesFor(version, raw) {
  const local = CHANGELOG[version] || null;
  const src = raw || local || null;
  if (!src) return { new: [], fix: [], info: [] };
  if (typeof src === 'string') {
    const it = noteItem(src);
    return { new: [], fix: [], info: it ? [it] : [] };
  }
  if (Array.isArray(src)) {
    return { new: [], fix: [], info: src.map(noteItem).filter(Boolean) };
  }
  const out = { new: [], fix: [], info: [] };
  for (const key of ['new', 'fix']) {
    const v = src[key] || (key === 'new' ? src.added : src.fixed);
    if (Array.isArray(v)) out[key] = v.map(noteItem).filter(Boolean);
  }
  if (Array.isArray(src.info)) out.info = src.info.map(noteItem).filter(Boolean);
  if (Array.isArray(src.items)) {
    for (const it of src.items) {
      const n = noteItem(it);
      if (!n) continue;
      const type = it && it.type === 'fix' ? 'fix' : it && it.type === 'new' ? 'new' : 'info';
      out[type].push(n);
    }
  }
  if (!out.new.length && !out.fix.length && !out.info.length) {
    // 兼容只有 title / body 的旧清单
    const n = noteItem({ zh: src.body || src.zh, en: src.bodyEn || src.body || src.en });
    if (n) out.info.push(n);
  }
  if (!out.new.length && !out.fix.length && !out.info.length && local && local !== src) {
    return notesFor(version, local);
  }
  return out;
}
function updatePayload(mode, version, rawNotes, date) {
  const local = CHANGELOG[version] || {};
  const rawTitle = rawNotes && typeof rawNotes === 'object' && !Array.isArray(rawNotes) ? rawNotes.title : null;
  const title = rawTitle || local.title || {};
  return {
    mode,
    version,
    date: date || local.date || new Date().toISOString().slice(0, 10),
    title: { zh: title.zh || (mode === 'available' ? '发现新版本' : '更新完成'), en: title.en || (mode === 'available' ? 'Update available' : 'Updated'), ja: title.ja || title.en || 'アップデート情報', ko: title.ko || title.en || '업데이트 정보' },
    notes: notesFor(version, rawNotes),
    currentVersion: app.getVersion()
  };
}
let updateNotesWin = null;
let updateNotesPayload = null;
let availableUpdate = null;
function deferAvailableUpdate() {
  if (!availableUpdate) return;
  availableUpdate = null;
  updateSnoozeUntil = Date.now() + 6 * 60 * 60 * 1000; // 「稍后」= 下一次自动检查再说
  saveState();
}
function closeUpdateNotes() {
  deferAvailableUpdate();
  if (updateNotesWin && !updateNotesWin.isDestroyed()) updateNotesWin.close();
}
function showUpdateNotes(payload) {
  updateNotesPayload = payload;
  if (updateNotesWin && !updateNotesWin.isDestroyed()) {
    try { updateNotesWin.webContents.reload(); } catch (_) {}
    updateNotesWin.show();
    updateNotesWin.focus();
    return;
  }
  updateNotesWin = new BrowserWindow({
    width: 520, height: 640,
    minWidth: 460, minHeight: 480,
    frame: false, resizable: false, maximizable: false, fullscreenable: false,
    center: true, show: false, alwaysOnTop: true, skipTaskbar: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f6f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'update-notes-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  updateNotesWin.setMenuBarVisibility(false);
  if (IS_MAC) updateNotesWin.setAlwaysOnTop(true, 'floating');
  if (IS_MAC) updateNotesWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  updateNotesWin.loadFile(path.join(__dirname, 'renderer', 'update-notes.html'));
  updateNotesWin.webContents.on('did-finish-load', () => {
    if (!updateNotesWin || updateNotesWin.isDestroyed()) return;
    applyZoom(updateNotesWin);
    console.log('[update-notes] loaded', updateNotesPayload && updateNotesPayload.mode, updateNotesPayload && updateNotesPayload.version);
    if (process.env.PET_CAPTURE) captureTo(updateNotesWin, 'update-shot.png');
  });
  updateNotesWin.once('ready-to-show', () => {
    if (!updateNotesWin || updateNotesWin.isDestroyed()) return;
    updateNotesWin.show();
    updateNotesWin.moveTop();
    updateNotesWin.focus();
    console.log('[update-notes] shown', updateNotesWin.isVisible());
  });
  updateNotesWin.on('closed', () => {
    deferAvailableUpdate();
    updateNotesWin = null;
    updateNotesPayload = null;
  });
}
function markPendingUpdate(m) {
  const notes = notesFor(m.version, m.notes);
  pendingUpdate = { version: String(m.version || ''), notes, at: Date.now(), date: m.publishedAt || '' };
  saveState();
}
function maybeShowWhatsNew() {
  const cur = app.getVersion();
  const pendingInstalled = pendingUpdate && cmpVer(pendingUpdate.version, cur) <= 0;
  let shouldShow = false;
  if (pendingInstalled) shouldShow = true;
  else if (lastSeenVersion) shouldShow = cmpVer(cur, lastSeenVersion) > 0;
  else if (hadStateFile) shouldShow = true; // 0.6.0 之前没有这个字段：老用户升级时补一次说明
  if (pendingUpdate && !pendingInstalled) {
    // 更新没有真正装好（例如失败后重启），不要把新版本说明当成本次更新
    pendingUpdate = null;
    lastSeenVersion = cur;
    saveState();
    return;
  }
  if (!shouldShow) {
    if (!lastSeenVersion) { lastSeenVersion = cur; saveState(); }
    return;
  }
  const version = pendingInstalled ? pendingUpdate.version : cur;
  updateSnoozeUntil = 0;
  const payload = updatePayload('installed', version, pendingInstalled ? pendingUpdate.notes : null,
    pendingInstalled ? pendingUpdate.date : '');
  lastSeenVersion = cur;
  pendingUpdate = null;
  saveState();
  if (!payload.notes.new.length && !payload.notes.fix.length && !payload.notes.info.length) return;
  setTimeout(() => showUpdateNotes(payload), 1200);
}

let updateBusy = false;
async function checkUpdate(manual = true) {
  const conf = readUpdateConf();
  if (!conf.manifest) {
    console.log('[update] 未配置更新源');
    if (manual) bubble('还没配置更新源', 2400);
    return { ok: false, reason: 'no-source' };
  }
  if (!manual && Date.now() < updateSnoozeUntil) {
    console.log('[update] 用户选择了稍后，跳过本次自动更新');
    return { ok: true, snoozed: true };
  }
  if (!manual && (availableUpdate || updateNotesWin)) return { ok: true, prompted: true };
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
      // 手动 / 自动一致：发现新版本直接下载并覆盖安装，不再弹窗确认。
      // 更新说明在重启后的首次启动由 maybeShowWhatsNew() 展示（「更新完成」窗口）
      availableUpdate = m;
      updateSnoozeUntil = 0;
      markPendingUpdate(m);
      installUpdate(m);
    } else if (manual) {
      bubble(`已是最新 v${cur}`, 2400);
    }
    return { ok: true, current: cur, latest: m.version, hasUpdate: newer, prompted: !!(manual && newer) };
  } catch (e) {
    console.error('[update] 检查失败', e.message);
    if (manual) bubble('连不上更新源', 2400);
    return { ok: false, reason: 'network' };
  } finally {
    updateBusy = false;
  }
}

function downloadTo(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadTo(new URL(res.headers.location, url).toString(), dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const st = fs.createReadStream(file);
    st.on('data', d => h.update(d));
    st.on('end', () => resolve(h.digest('hex')));
    st.on('error', reject);
  });
}

async function installWindowsUpdate(m) {
  const base = (m.builds && (m.builds.win || m.builds['win-x64'])) || m.win || {};
  const url = base.url || m.winUrl || '';
  const sha = base.sha256 || m.winSha256 || '';
  const ver = m.version || '';
  if (!url || !sha) throw new Error('清单缺少 Windows 包');
  if (!app.isPackaged) {
    shell.openExternal('https://github.com/Zyh-Quotation/994-Desktop-Pet/releases/latest');
    bubble(lang === 'en' ? 'Opened the release page — download and replace manually' : '已在浏览器打开下载页，请手动覆盖', 6000);
    return { ok: false, reason: 'dev' };
  }
  const dir = path.dirname(process.execPath);
  const exe = process.execPath;
  const zip = path.join(app.getPath('temp'), `pokepet-${ver}-win-x64.zip`);
  bubble(lang === 'en' ? `Downloading v${ver}…` : `正在下载 v${ver}…`, 4000);
  pushNotice({ kind: 'info', title: '开始更新', titleEn: 'Update started', body: `正在下载 v${ver}`, bodyEn: `Downloading v${ver}` });
  await downloadTo(url, zip);
  const got = await sha256File(zip);
  if (got.toLowerCase() !== String(sha).toLowerCase()) {
    try { fs.unlinkSync(zip); } catch (_) {}
    throw new Error('sha256 mismatch');
  }
  const script = path.join(__dirname, 'tools', 'update-win.ps1');
  const { spawn } = require('child_process');
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-TargetPid', String(process.pid), '-Zip', zip, '-Sha', String(sha),
    '-AppDir', dir, '-Exe', exe], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  bubble(lang === 'en' ? 'Update ready — closing to finish…' : '更新包已就绪，正在关闭并安装…', 5000);
  setTimeout(() => app.quit(), 1800);
  return { ok: true };
}

function installUpdate(m) {
  if (IS_WIN) {
    installWindowsUpdate(m).catch(e => {
      console.error('[update] Windows 更新失败', e.message);
      pushNotice({ kind: 'info', title: '更新失败', titleEn: 'Update failed', body: '改为打开下载页', bodyEn: 'Opening the release page instead' });
      shell.openExternal('https://github.com/Zyh-Quotation/994-Desktop-Pet/releases/latest');
      bubble(lang === 'en' ? 'Update failed — opened the release page' : '更新失败，已打开下载页', 5000);
    });
    return;
  }
  if (!app.isPackaged) {
    shell.openExternal('https://github.com/Zyh-Quotation/994-Desktop-Pet/releases/latest');
    bubble(lang === 'en' ? 'Opened the release page — download and replace manually' : '已在浏览器打开下载页，请手动覆盖', 6000);
    return;
  }
  // 在主进程里就挑好架构 / 取出 URL 和 sha256 传给脚本：
  // 脚本里不再需要 node 或 JSON 解析（用户机器上不一定有 node）
  const arch = process.arch === 'x64' ? 'x64' : 'arm64';
  const build = (m && m.builds && m.builds[arch]) || {};
  const url = build.url || (m && m.url);
  const sha = build.sha256 || (m && m.sha256);
  const ver = (m && m.version) || '';
  if (!url || !sha) {
    console.error('[update] 清单缺少下载地址或 sha256');
    bubble('更新清单不完整，请手动下载', 4000);
    return;
  }
  const { spawn } = require('child_process');
  const script = path.join(__dirname, 'tools', 'update.sh');
  bubble(lang === 'en' ? `Downloading v${ver}…` : `正在下载 v${ver}…`, 4000);
  pushNotice({ kind: 'info', title: '开始更新', titleEn: 'Update started', body: `正在下载 v${ver}`, bodyEn: `Downloading v${ver}` });
  try {
    spawn('/bin/bash', [script, url, sha, ver], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {
    console.error('[update] 启动更新脚本失败', e.message);
    bubble('更新失败，请手动下载', 3000);
  }
}

// ---------- 故事卡 ----------
let loreWin = null, loreTimer = null, loreDex = 175;

function loreDataFor(dex) {
  const sp = byDex.get(Number(dex)) || speciesInfo();
  const l = LORE[dex] || {};
  const en = uiLang !== 'zh'; // 日文/韩文暂时用英文长文兜底，名字仍然是本地名字
  return {
    dex: sp.dex,
    name: nameOf(sp.dex),
    types: (sp.types || []).map(typeLabel),
    typeColors: (sp.types || []).map(t => TYPE_COLOR_MAIN[t] || '#888888'),
    genus: (en ? (l.genusEn || l.genus) : l.genus) || '',
    habitat: (en ? (l.habitatEn || l.habitat) : l.habitat) || '',
    where: (en ? (l.whereEn || l.where) : l.where) || '',
    flavor: (en ? (l.flavorEn || l.flavor) : l.flavor) || '',
    h: l.h || 0,
    w: l.w || 0,
    likes: (en ? (l.likesEn || l.likes) : l.likes) || '',
    rare: (en ? (l.rareEn || l.rare) : l.rare) || '',
    lang: en ? 'en' : 'zh',
    spriteUrl: spriteUrlFor(sp.dex, shiny)
  };
}

function hideLore() {
  if (loreTimer) { clearTimeout(loreTimer); loreTimer = null; }
  if (loreWin && !loreWin.isDestroyed()) loreWin.hide();
}

function showLore(dex = speciesDex, autoCloseMs = 9000) {
  const data = loreDataFor(dex);
  loreDex = dex;   // 窗口首次加载完成时按最新的这只发数据，避免慢加载时显示上一只
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
      if (loreWin && !loreWin.isDestroyed()) loreWin.webContents.send('lore:data', loreDataFor(loreDex));
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
  captureTo(loreWin, 'lore-shot.png');
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
  bubble(`🎲 ${nameOf(sp.dex)} · ${sp.types.map(typeLabel).join(' · ')}`, 2400);
  refreshTray();
  return { current: sp.dex, name: nameOf(sp.dex), types: sp.types, legend: !!sp.legend };
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
  bumpTask('pet', 1);
  bumpActivity(1);
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
  // 球里的时候，点一下就是「噗」地放出来，而不是把球抓起来扔出去
  if (inBall) { toggleBall(true); return; }
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
const LOGIN_ITEM_NAME = '桌面宠物';
// 旧名字：改名之前的登录项会留在系统里，得能认出来并顺手清掉
const LOGIN_ITEM_ALIASES = ['神奇宝贝', 'PokéPal', 'Pokepal', 'Desktop Pet', 'デスクトップペット', '데스크톱 펫'];

function loginItemSystemEnabled() {
  try { return !!app.getLoginItemSettings().openAtLogin; } catch (_) { return false; }
}
function loginAgentExists() {
  try { return fs.existsSync(launchAgentPath()); } catch (_) { return false; }
}
function bundlePath() {
  const m = String(process.execPath).match(/^(.*\.app)\/Contents\/MacOS\//);
  return m ? m[1] : null;
}

// ── 系统登录项（System Events）──
// 为什么需要这条路：macOS 13+ 的 app.setLoginItemSettings 走 SMAppService，
// 对 ad-hoc 签名 / 开发目录里的 app 经常注册不上（getLoginItemSettings 返回
// status:"not-found"）；而 ~/Library/LaunchAgents 在有些机器上不是用户可写的
// （比如被 root 拥有），LaunchAgent 兜底也会 EACCES。这两条都断了以后，
// 唯一还能用的就是 System Events 的用户登录项。
const OSA_READ_LOGIN_ITEMS = `set __o to ""
tell application "System Events"
  try
    repeat with __li in login items
      try
        set __o to __o & (name of __li) & "," & (path of __li) & linefeed
      end try
    end repeat
  end try
end tell
return __o`;

function osa(script, timeout = 8000) {
  try {
    return require('child_process').execFileSync('/usr/bin/osascript', ['-e', script], {
      timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) { return null; }
}

function parseLoginItems(text) {
  if (!text) return [];
  return String(text).split(/[\r\n]+/).filter(Boolean).map(line => {
    const i = line.lastIndexOf(',');
    return i < 0 ? { name: line, path: '' } : { name: line.slice(0, i), path: line.slice(i + 1) };
  });
}

// 同步读系统登录项；读不到（没授权 / 非 mac）返回 null，和"空列表"区分开
function systemLoginItemsSync() {
  if (!IS_MAC) return null;
  const out = osa(OSA_READ_LOGIN_ITEMS);
  return out === null ? null : parseLoginItems(out);
}

const samePath = (a, b) => {
  if (!a || !b) return false;
  try { return path.resolve(a) === path.resolve(b); } catch (_) { return a === b; }
};

function isOurLoginItem(it, b) {
  if (!it) return false;
  if (samePath(it.path, b)) return true;
  const n = String(it.name || '').trim();
  return n === LOGIN_ITEM_NAME || LOGIN_ITEM_ALIASES.includes(n);
}

// 已经失效的登录项：指向被删的旧 app，或指向开发期的裸 Electron
function isStaleLoginItem(it, b) {
  if (!it || !it.path) return true;
  if (/node_modules[\\/]electron[\\/]dist[\\/]Electron\.app$/i.test(it.path)) return true;
  if (samePath(it.path, b)) return false;
  try { return !fs.existsSync(it.path); } catch (_) { return true; }
}

const quoteOsa = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function addSystemLoginItem() {
  const b = bundlePath();
  if (!IS_MAC || !b) return false;
  osa(`tell application "System Events" to make login item at end with properties {name:"${quoteOsa(LOGIN_ITEM_NAME)}", path:"${quoteOsa(b)}", hidden:false}`);
  const items = systemLoginItemsSync() || [];
  return items.some(it => samePath(it.path, b));
}

function removeSystemLoginItems() {
  if (!IS_MAC) return false;
  const b = bundlePath();
  for (let pass = 0; pass < 6; pass++) {
    const left = (systemLoginItemsSync() || []).filter(it => isOurLoginItem(it, b));
    if (!left.length) return true;
    for (const it of left) {
      osa(`tell application "System Events" to delete login item "${quoteOsa(it.name)}"`);
    }
  }
  return (systemLoginItemsSync() || []).filter(it => isOurLoginItem(it, bundlePath())).length === 0;
}

// 清掉改名/搬目录留下的死项（指向已删除的旧 app、或开发期的裸 Electron）
function cleanupStaleLoginItems() {
  if (!IS_MAC) return 0;
  const b = bundlePath();
  const stale = (systemLoginItemsSync() || []).filter(it => isOurLoginItem(it, b) && isStaleLoginItem(it, b));
  for (const it of stale) {
    osa(`tell application "System Events" to delete login item "${quoteOsa(it.name)}"`);
    console.log('[main] 已清除失效登录项:', it.name, it.path);
  }
  return stale.length;
}

// 状态缓存：cfgSnapshot 调用非常频繁，不能每次都起一个 osascript
let loginStateCache = null;

function computeLoginAtStart(syncItems) {
  if (loginItemSystemEnabled()) return true;
  if (loginAgentExists()) return true;
  const items = syncItems !== undefined ? syncItems : systemLoginItemsSync();
  if (items) {
    const b = bundlePath();
    return items.some(it => samePath(it.path, b));
  }
  return false;
}

function loginAtStartEnabled() {
  if (loginStateCache === null) loginStateCache = computeLoginAtStart();
  return loginStateCache;
}

// 异步刷新（打开设置页时调用，避免开机就弹自动化授权框）
function refreshLoginState(cb) {
  if (!IS_MAC) {
    loginStateCache = loginItemSystemEnabled() || loginAgentExists();
    if (cb) cb(loginStateCache);
    return;
  }
  require('child_process').execFile('/usr/bin/osascript', ['-e', OSA_READ_LOGIN_ITEMS],
    { timeout: 8000, encoding: 'utf8' }, (err, stdout) => {
      if (err) {
        // 读不到（没给自动化授权）：退回不需要授权的那两个来源
        loginStateCache = loginItemSystemEnabled() || loginAgentExists();
      } else {
        loginStateCache = computeLoginAtStart(parseLoginItems(stdout));
      }
      if (cb) cb(loginStateCache);
    });
}

function writeLaunchAgent(on) {
  if (!IS_MAC) return false;   // Windows/Linux 没有 LaunchAgents，别在别处写文件
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
  // 1) 原生 API（macOS 13+ SMAppService；在正式签名包里这是最干净的路）
  try {
    app.setLoginItemSettings({ openAtLogin: on });
    console.log('[main] 系统登录项状态:', JSON.stringify(app.getLoginItemSettings()));
  } catch (e) {
    console.error('[main] setLoginItemSettings 失败:', e.message);
  }
  // 2) System Events 用户登录项（原生 API 注册不上时用这条）
  let viaSystem = false;
  try {
    if (on) {
      // 先清掉同名的旧项（可能指向改名前的路径/开发期的裸 Electron/另一个安装位置），
      // 保证系统里只剩一条、且指向当前这个 app
      removeSystemLoginItems();
      viaSystem = addSystemLoginItem();
    } else {
      viaSystem = removeSystemLoginItems();
    }
  } catch (e) {
    console.error('[main] 登录项操作失败:', e.message);
  }
  // 3) 最后兜底：LaunchAgent（目录可写时才成功）
  try {
    if (!on) writeLaunchAgent(false);
    else if (!viaSystem && !loginItemSystemEnabled()) writeLaunchAgent(true);
  } catch (e) {
    console.error('[main] LaunchAgent 写入失败:', e.message);
  }
  if (on) { try { cleanupStaleLoginItems(); } catch (_) {} }
  loginStateCache = null;
  const now = computeLoginAtStart(systemLoginItemsSync());
  loginStateCache = now;
  console.log('[main] 开机自启 ->', on, '实际:', now, 'viaSystem:', viaSystem);
  return now;
}

// 调试钩子：PET_LOGIN_TEST=1 时把开机自启走一遍并打印结果
function runLoginTest() {
  const before = loginAtStartEnabled();
  console.log('[login-test] bundlePath:', String(bundlePath()));
  console.log('[login-test] 原生状态:', JSON.stringify(app.getLoginItemSettings()));
  console.log('[login-test] 系统登录项:', JSON.stringify(systemLoginItemsSync()));
  const on = setLoginAtStart(true);
  console.log('[login-test] 打开后:', on, '| 登录项:', JSON.stringify(systemLoginItemsSync()));
  const off = setLoginAtStart(false);
  console.log('[login-test] 关掉后:', off, '| 登录项:', JSON.stringify(systemLoginItemsSync()));
  const back = setLoginAtStart(true);
  console.log('[login-test] 再打开:', back, '| 登录项:', JSON.stringify(systemLoginItemsSync()));
  console.log('[login-test] 初始值:', before);
}

function switchSpecies(dex, opts = {}) {
  notifySettings();
  if (!SPECIES.some(s => s.dex === dex)) return;
  if (battleForm) clearForm(true, true);
  if (speciesDex !== dex) {
    syncRosterEntry();
    loadRosterLook(dex);
  }
  if (opts.shiny) shinyLocked = true;
  else if (speciesDex !== dex) shinyLocked = false;
  speciesDex = dex;
  resetMoveGate();   // 换宠物后专属招式立即可用，不继承上一只的冷却
  if (alt > 1 && !canFlyNow()) { alt = 0; altTarget = 0; y = groundYFor(); }
  sentFace = 0;
  shiny = shinyFor(dex);
  markMet(dex);
  markShiny(dex);
  if (win && !win.isDestroyed()) {
    win.webContents.send('sprite', { url: spriteUrlFor(dex, shiny) });
    sendLook();
  }
  bubble(lang === 'en' ? `${petName()} is here!` : `${petName()}，来啦!`, 2000);
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
    title: '孵蛋', backgroundColor: (nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#fffdf3'), show: false, alwaysOnTop: true,
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
  stones: counters.stones || 0,
  rarity: eggRarity,
  rarityLabel: EGG_RARITIES[eggRarity] ? EGG_RARITIES[eggRarity].label : '',
  rarityEn: EGG_RARITIES[eggRarity] ? EGG_RARITIES[eggRarity].en : ''
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
  bumpTask('play', 1);
  bumpActivity(1);
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
    title: '陪伴报告', backgroundColor: shellBg(), show: false,
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
    const file = path.join(app.getPath('desktop'), `陪伴报告-${dayKey()}.png`);
    fs.writeFileSync(file, img.toPNG());
    return { ok: true, file };
  } catch (e) { return { ok: false, reason: e.message }; }
});
ipcMain.on('report:close', () => { if (reportWin && !reportWin.isDestroyed()) reportWin.close(); });

// ── 健康仪表盘 ──
ipcMain.handle('cfg:health', () => healthDashboard());

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

function openSettingsTab(tab) {
  createSettingsWindow();
  if (!settingsWin || settingsWin.isDestroyed()) return;
  const go = () => {
    if (!settingsWin || settingsWin.isDestroyed()) return;
    settingsWin.webContents.executeJavaScript(`document.getElementById('tab-${tab}') && document.getElementById('tab-${tab}').click()`).catch(() => {});
  };
  if (settingsWin.webContents.isLoading()) settingsWin.webContents.once('did-finish-load', go);
  else setTimeout(go, 120);
}

function createSettingsWindow() {
  // 打开设置页时刷新一次开机自启的真实状态（异步，不卡窗口）
  try { refreshLoginState(() => { try { notifySettings(); } catch (_) {} }); } catch (_) {}
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const wa = screen.getPrimaryDisplay().workAreaSize;
  settingsWin = new BrowserWindow({
    width: Math.min(820, wa.width - 80), height: Math.min(840, wa.height - 80),
    resizable: false, minimizable: false, maximizable: false,
    title: '桌面宠物 · 设置',
    backgroundColor: shellBg(),
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
      if (process.env.PET_EN) {
        try {
          await settingsWin.webContents.executeJavaScript(`document.querySelector('#lang-seg [data-key="en"]').click()`);
          await new Promise(r => setTimeout(r, 1200));
        } catch (_) {}
      }
      if (process.env.PET_TAB) {
        try { await settingsWin.webContents.executeJavaScript(`document.getElementById('tab-${process.env.PET_TAB}').click()`); } catch (_) {}
        await new Promise(r => setTimeout(r, 700));
      }
      if (process.env.PET_ENAUDIT) {
        try {
          const tabs = ['dex', 'team', 'tasks', 'ach', 'notify', 'bag', 'opts'];
          for (const tab of tabs) {
            await settingsWin.webContents.executeJavaScript(`document.getElementById('tab-${tab}').click()`);
            await new Promise(r => setTimeout(r, 500));
            const out = await settingsWin.webContents.executeJavaScript(`(() => {
              const bad = new Set();
              const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              while (tw.nextNode()) {
                const n = tw.currentNode, el = n.parentElement;
                if (!el || el.closest('#lang-seg, script, style, [hidden]')) continue;
                const t = (n.textContent || '').trim();
                if (t && /[\u3400-\u9fff]/.test(t) && el.offsetParent !== null) bad.add(t.slice(0, 80));
              }
              return JSON.stringify([...bad]);
            })()`);
            console.log('[enaudit]', tab, out);
          }
        } catch (e) { console.log('[enaudit] err', e.message); }
      }
      if (process.env.PET_CLAIM) {
        try {
          const r = await settingsWin.webContents.executeJavaScript(`(async () => {
            const b = document.querySelector('.task-claim:not([disabled])');
            if (!b) return 'no-claimable';
            b.click();
            await new Promise(r => setTimeout(r, 900));
            return JSON.stringify({ exp: document.querySelector('#lvl')?.textContent, tasks: [...document.querySelectorAll('.task-card.claimed')].length });
          })()`);
          console.log('[claim]', r);
        } catch (e) { console.log('[claim] err', e.message); }
      }
      if (process.env.PET_FLAT) {
        try {
          await settingsWin.webContents.executeJavaScript(`
            document.getElementById('tab-dex').click();
            document.getElementById('sort-select').value = '${process.env.PET_FLAT}';
            document.getElementById('sort-select').dispatchEvent(new Event('change'));
          `);
        } catch (_) {}
        await new Promise(r => setTimeout(r, 800));
      }
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
      if (process.env.PET_SCROLL) {
        try {
          await settingsWin.webContents.executeJavaScript(`(() => {
            const pane = [...document.querySelectorAll('.pane')].find(p => !p.hidden);
            if (pane) pane.scrollTop = pane.scrollHeight;
            window.scrollTo(0, document.body.scrollHeight);
          })()`);
        } catch (_) {}
        await new Promise(r => setTimeout(r, 700));
      }
      captureTo(settingsWin, process.env.PET_TAB ? `settings-${process.env.PET_TAB}.png` : 'settings-capture.png');
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
    nickname, hat, scarf, roster: rosterSnapshot(),
    forms: formOptions(speciesDex), battleForm: formPayload(),
    sizeKey, soundOn,
    loginAtStart: loginAtStartEnabled(),
    shinyMode, rotateMin, lang: uiLang, focusMode, guestEnabled, roamCount, favorites,
    customPets: customPets.map(p => ({ id: p.id, name: p.name, w: p.w, h: p.h, fileUrl: require('url').pathToFileURL(p.file).href })),
    customPetsOn,
    nature: { key: (currentNature || NATURES[0]).key, zh: (currentNature || NATURES[0]).zh, en: (currentNature || NATURES[0]).en },
    dexMet: dexMet.slice(),
    stones: counters.stones || 0,
    eggs: counters.hatch || 0,
    hasEgg,
    eggRarity,
    eggRarityLabel: EGG_RARITIES[eggRarity] ? EGG_RARITIES[eggRarity].label : '',
    eggRarityEn: EGG_RARITIES[eggRarity] ? EGG_RARITIES[eggRarity].en : '',
    eggProgress: Math.min(1, walkedPx / eggTarget),
    eggAt: eggTarget,
    checkedIn: counters.lastCheckIn === dayKey(),
    checkInDays: counters.checkIn || 0,
    pomo: pomo ? { phase: pomo.phase, left: Math.max(0, pomo.until - Date.now()) } : null,
    level, exp,
    theme: themeMode,
    skin, effectiveSkin: effectiveSkin(), festivalAuto, access,
    expInLevel: Math.max(0, exp - expTotalForLevel(level)),
    expNeed: expNeedFor(level),
    met: dexMet.length, shinyMet: shinyMet.length, total: SPECIES.length,
    achievements: ACHIEVEMENTS.map(a => {
      let prog = null;
      try { prog = a.prog ? a.prog() : null; } catch (_) {}
      return {
        id: a.id, name: a.name, en: a.en || a.name, desc: a.desc,
        ja: a.ja || '', ko: a.ko || '', descJa: a.descJa || '', descKo: a.descKo || '',
        unlocked: !!unlocked[a.id], at: unlocked[a.id] || 0,
        progress: prog ? { value: prog[0], target: prog[1] } : null
      };
    }),
    streak: counters.streak || 1, sig: counters.sig,
    waterWarnMin, sitWarnMin, firstLaunch,
    notifications: notifications.slice(0, 100),
    unread: notifications.filter(n => !n.read).length,
    notifySystem,
    tasks: {
      daily: taskSnapshot('daily'),
      weekly: taskSnapshot('weekly'),
      day: tasksState.day, week: tasksState.week
    },
    checkins: checkins.slice(-420),
    activity,
    heatmapDays,
    reminders: reminders.map(r => ({ ...r, daysLabel: reminderDaysLabel(r) })),
    version: app.getVersion()
  };
}

ipcMain.handle('cfg:dexPulse', () => ({ n: dexMet.length, cur: speciesDex, level }));
ipcMain.on('lang:sync', e => { try { e.returnValue = uiLang; } catch (_) {} });
ipcMain.on('skin:sync', e => { try { e.returnValue = effectiveSkin(); } catch (_) {} });
ipcMain.on('access:sync', e => { try { e.returnValue = { ...access }; } catch (_) {} });

ipcMain.handle('cfg:get', () => ({
  species: SPECIES.map(s => ({ dex: s.dex, name: s.name, nameEn: EN_NAMES[s.dex] || '', nameJa: JA_NAMES[s.dex] || '', nameKo: KO_NAMES[s.dex] || '', types: s.types, gen: s.gen, legend: !!(s.legend || s.myth) })),
  chains: LINES.map(l => ({ stages: l.stages, hows: l.hows.map(h => lang === 'en' ? howEn(h) : h), type: l.type })),
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
    else if (key === 'roam') { roamCount = clamp(Number(value) || 0, 0, MAX_ROAM); saveState(); syncRoamers(); }
    else if (key === 'customPetsOn') { customPetsOn = !!value; saveState(); syncCustomRoamers(); }
    else if (key === 'sound') { soundOn = !!value; saveState(); refreshTray(); }
    else if (key === 'login') setLoginAtStart(!!value);
    else if (key === 'theme') { themeMode = ['auto','light','dark'].includes(value) ? value : 'auto'; applyTheme(); saveState(); }
    else if (key === 'skin') setSkin(value);
    else if (key === 'festivalAuto') { festivalAuto = !!value; saveState(); for (const w of BrowserWindow.getAllWindows()) sendSkin(w); }
    else if (key === 'access') setAccess(value || {});
    else if (key === 'notifySystem') { notifySystem = !!value; saveState(); }
    else if (key === 'water') { waterWarnMin = clamp(Number(value) || 0, 0, 240); saveState(); }
    else if (key === 'sit') { sitWarnMin = clamp(Number(value) || 0, 0, 240); saveState(); }
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
ipcMain.handle('update-notes:get', () => updateNotesPayload || updatePayload('installed', app.getVersion(), null));
ipcMain.on('update-notes:close', () => closeUpdateNotes());
ipcMain.handle('update-notes:install', () => {
  const m = availableUpdate;
  if (!m) return { ok: false, reason: 'none' };
  availableUpdate = null;
  markPendingUpdate(m);
  closeUpdateNotes();
  setTimeout(() => installUpdate(m), 350);
  return { ok: true };
});
ipcMain.handle('cfg:setSound', (_e, on) => { soundOn = !!on; saveState(); if (soundOn) playCry(speciesDex, true); refreshTray(); return { soundOn }; });
ipcMain.handle('cfg:setLogin', (_e, on) => {
  const loginAtStart = setLoginAtStart(!!on);
  // 用户在系统里被拒了权限时给个明确提示，而不是让开关默默弹回去
  if (!!on && !loginAtStart) {
    bubble(lang === 'en'
      ? 'macOS blocked it — allow it in System Settings › General › Login Items'
      : '系统没放行，可到「系统设置 › 通用 › 登录项」手动打开', 5000, true);
  }
  return { loginAtStart };
});
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
ipcMain.handle('cfg:readNotices', (_e, ids) => {
  if (Array.isArray(ids)) {
    for (const n of notifications) if (ids.includes(n.id)) n.read = true;
  } else {
    for (const n of notifications) n.read = true;
  }
  saveState();
  notifySettings();
  return { notifications, unread: notifications.filter(n => !n.read).length };
});
ipcMain.handle('cfg:clearNotices', () => {
  notifications = [];
  saveState();
  notifySettings();
  return { notifications, unread: 0 };
});
ipcMain.handle('cfg:claimTask', (_e, freq, id) => {
  const ok = claimTask(String(freq), String(id));
  return { ok, ...cfgSnapshot() };
});
// ── 自定义提醒事项 ──
ipcMain.handle('cfg:addReminder', (_e, data) => {
  addReminder(data || {});
  return cfgSnapshot();
});
ipcMain.handle('cfg:updateReminder', (_e, id, patch) => {
  updateReminder(Number(id), patch || {});
  return cfgSnapshot();
});
ipcMain.handle('cfg:removeReminder', (_e, id) => {
  removeReminder(Number(id));
  return cfgSnapshot();
});
// ── 自定义照片伙伴 ──
ipcMain.handle('cfg:importCustomPet', async () => {
  const r = await importCustomPet();
  return { ...r, ...cfgSnapshot() };
});
ipcMain.handle('cfg:removeCustomPet', (_e, id) => {
  removeCustomPet(Number(id));
  return cfgSnapshot();
});
ipcMain.handle('cfg:rename', (_e, name) => {
  nickname = String(name || '').trim().slice(0, 12);
  syncRosterEntry();
  saveState();
  refreshTray();
  sendLook();
  return { nickname, ...cfgSnapshot() };
});
ipcMain.handle('cfg:transform', (_e, kind, file) => {
  const r = transformForm(String(kind || ''), String(file || ''));
  return { ...r, ...cfgSnapshot() };
});
ipcMain.handle('cfg:setLook', (_e, look) => {
  const l = look || {};
  if (['none','cap','tophat','crown'].includes(l.hat)) hat = l.hat;
  if (['none','red','blue','green'].includes(l.scarf)) scarf = l.scarf;
  syncRosterEntry();
  saveState();
  sendLook();
  return { hat, scarf, ...cfgSnapshot() };
});
ipcMain.handle('cfg:switchPet', (_e, dex) => {
  const d = Number(dex);
  if (!SPECIES.some(sp => sp.dex === d)) return { ok: false, ...cfgSnapshot() };
  switchSpecies(d);
  return { ok: true, ...cfgSnapshot() };
});
ipcMain.handle('cfg:removePet', (_e, dex) => {
  const d = Number(dex);
  if (d === speciesDex || roster.length <= 1) return { ok: false, ...cfgSnapshot() };
  roster = roster.filter(p => p.dex !== d);
  saveState();
  notifySettings();
  refreshTray();
  return { ok: true, ...cfgSnapshot() };
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
// 点 Dock 图标：把设置页叫出来（比只把宠物往前推更符合预期）
app.on('activate', () => {
  if (!app.isReady()) return;   // 首次启动时 ready 之前也会触发，交给 whenReady 建窗
  if (!win || win.isDestroyed()) createWindow();
  else createSettingsWindow();
});
app.on('before-quit', () => {
  saveState();
  // 关掉所有放养伙伴窗口
  for (const r of roamers) { if (r.win && !r.win.isDestroyed()) try { r.win.destroy(); } catch (_) {} }
  roamers = [];
  for (const r of customRoamers) { if (r.win && !r.win.isDestroyed()) try { r.win.destroy(); } catch (_) {} }
  customRoamers = [];
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid === process.pid) fs.unlinkSync(PID_FILE);   // 只删自己写的
  } catch (_) {}
});

app.whenReady().then(() => {
  applyTheme();
  if (process.env.PET_DARK) nativeTheme.themeSource = process.env.PET_DARK === 'light' ? 'light' : 'dark';
  // 开发时跑的是 Electron 本体，Dock 默认显示 Electron 原子图标，这里换成自己的
  if (IS_MAC && app.dock) {
    try { app.dock.setIcon(path.join(__dirname, 'assets', 'app-icon.png')); } catch (_) {}
  }
  console.log('[debug] whenReady 已触发', JSON.stringify(process.argv));
  // 开机自启的初始状态只用不需要授权的来源算，避免一启动就弹「控制 System Events」授权框；
  // 用户真正打开设置页时再用 refreshLoginState() 补上系统登录项的真实状态。
  loginStateCache = loginItemSystemEnabled() || loginAgentExists();
  if (process.env.PET_LOGIN_TEST) setTimeout(() => runLoginTest(), 2500);
  loadState();
  if (process.env.PET_SKIN && SKINS.includes(process.env.PET_SKIN)) skin = process.env.PET_SKIN;
  if (process.env.PET_LOOK && ['cap','tophat','crown'].includes(process.env.PET_LOOK)) hat = process.env.PET_LOOK;
  if (process.env.PET_SCARF && ['red','blue','green'].includes(process.env.PET_SCARF)) scarf = process.env.PET_SCARF;
  // loadState 会把存档里的外观读进 themeMode，必须再应用一次，
  // 否则「深色」只在设置里点了当次有效，重启又跟回系统
  if (process.env.PET_DARK) nativeTheme.themeSource = process.env.PET_DARK === 'light' ? 'light' : 'dark';
  else applyTheme();
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
