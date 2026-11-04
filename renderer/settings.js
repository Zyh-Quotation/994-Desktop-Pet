const listEl = document.getElementById('list');
const chipsEl = document.getElementById('chips');
const countEl = document.getElementById('count');
const login = document.getElementById('login');
const sizesEl = document.getElementById('sizes');
const searchEl = document.getElementById('search');
const genEl = document.getElementById('gen');
const hintEl = document.getElementById('hint');
const diceEl = document.getElementById('dice');
const sound = document.getElementById('sound');
const verEl = document.getElementById('ver');
const updBtn = document.getElementById('check-upd');
const updMsg = document.getElementById('upd-msg');
const shinySeg = document.getElementById('shiny-seg');
const langSeg = document.getElementById('lang-seg');
const themeSeg = document.getElementById('theme-seg');
const rotationEl = document.getElementById('rotation');
const focusSw = document.getElementById('focus');
const pomoState = document.getElementById('pomo-state');
const lvlEl = document.getElementById('lvl');
const dexProgEl = document.getElementById('dex-prog');


const guestSw = document.getElementById('guest');
const roamCountEl = document.getElementById('roam-count');
const customImportBtn = document.getElementById('custom-import');
const customOnSw = document.getElementById('custom-on');
const customPetsGrid = document.getElementById('custom-pets-grid');
const customPetsCount = document.getElementById('custom-pets-count');
const bagStones = document.getElementById('bag-stones');
const bagEggs = document.getElementById('bag-eggs');
const bagBar = document.getElementById('bag-bar');
const bagProgText = document.getElementById('bag-prog-text');
const bagCheckin = document.getElementById('bag-checkin');
const bagHatched = document.getElementById('bag-hatched');
const bagEggHint = document.getElementById('bag-egg-hint');
const bagSkin = document.getElementById('bag-skin');
const achGrid = document.getElementById('ach-grid');
const achCount = document.getElementById('ach-count');
const achBar = document.getElementById('ach-bar');
const ACH_ICONS = {
  first: '👋', dex10: '🚪', dex50: '🧭', dex200: '🔬', dex1025: '📚',
  shiny1: '✨', shiny8: '💎', sig10: '🌟', sig100: '🏅',
  feed50: '🍎', pet500: '🤚', throw10: '🎾', streak7: '📅', checkin7: '✅'
};
const natureEl = document.getElementById('nature');
const notifyBadge = document.getElementById('notify-badge');
const notifySystem = document.getElementById('notify-system');
const noticeList = document.getElementById('notice-list');
const noticeSummary = document.getElementById('notice-summary');
const noticeRead = document.getElementById('notice-read');
const noticeClear = document.getElementById('notice-clear');
const dailyTasks = document.getElementById('daily-tasks');
const weeklyTasks = document.getElementById('weekly-tasks');
const dailyReset = document.getElementById('daily-reset');
const weeklyReset = document.getElementById('weekly-reset');
const teamSprite = document.getElementById('team-sprite');
const teamName = document.getElementById('team-name');
const teamLevel = document.getElementById('team-level');
const teamSub = document.getElementById('team-sub');
const teamGrid = document.getElementById('team-grid');
const teamCount = document.getElementById('team-count');
const hatSelect = document.getElementById('hat-select');
const scarfSelect = document.getElementById('scarf-select');
const renameBtn = document.getElementById('rename-btn');
const renameRow = document.getElementById('rename-row');
const renameInput = document.getElementById('rename-input');
const renameSave = document.getElementById('rename-save');
let formTimer = null;
const formBox = document.getElementById('form-box');
const formActions = document.getElementById('form-actions');
const formStatus = document.getElementById('form-status');
const skinSeg = document.getElementById('skin-seg');
const festivalAuto = document.getElementById('festival-auto');
const reduceMotion = document.getElementById('reduce-motion');
const highContrast = document.getElementById('high-contrast');
const scaleSeg = document.getElementById('scale-seg');
const volume = document.getElementById('volume');
const volumeVal = document.getElementById('volume-val');
const waterMin = document.getElementById('water-min');
const sitMin = document.getElementById('sit-min');
const viewSeg = document.getElementById('view-seg');
const sortSelect = document.getElementById('sort-select');
const dexVirtual = document.getElementById('dex-virtual');
const virtualHint = document.getElementById('virtual-hint');
const heatmapEl = document.getElementById('heatmap');
const heatmapMonths = document.getElementById('heatmap-months');
const achStreak = document.getElementById('ach-streak');
const achCheckinTotal = document.getElementById('ach-checkin-total');
const achDays = document.getElementById('ach-days');
const achCount2 = document.getElementById('ach-count2');

const TYPE_COLOR = {
  草: '#78C850', 火: '#F08030', 水: '#6890F0', 电: '#F8D030',
  一般: '#A8A878', 超能力: '#F85888', 幽灵: '#705898', 格斗: '#C03028',
  恶: '#705848', 虫: '#A8B820', 飞行: '#A890F0', 岩石: '#B8A038',
  地面: '#E0C068', 冰: '#98D8D8', 龙: '#7038F8', 钢: '#B8B8D0',
  毒: '#A040A0', 妖精: '#EE99AC'
};
const TYPE_EN = {
  一般: 'Normal', 火: 'Fire', 水: 'Water', 电: 'Electric', 草: 'Grass', 冰: 'Ice',
  格斗: 'Fighting', 毒: 'Poison', 地面: 'Ground', 飞行: 'Flying', 超能力: 'Psychic',
  虫: 'Bug', 岩石: 'Rock', 幽灵: 'Ghost', 龙: 'Dragon', 恶: 'Dark', 钢: 'Steel', 妖精: 'Fairy'
};
const typeLabel = t => isEn() ? (TYPE_EN[t] || t) : (window.I18N ? window.I18N.translate(t) : t);
const ALL_COLOR = '#e63b3b';
const LEGEND_COLOR = '#d4a017';
const GEN_LABEL = ['', '第一代', '第二代', '第三代', '第四代', '第五代', '第六代', '第七代', '第八代', '第九代'];

function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

let conf = null;
let current = 175;
let filter = '全部';
let favorites = new Set();
let unlockedDex = new Set();
let query = '';
let genFilter = 0;
let built = false;
let dexView = 'chain';
let sortKey = 'dex';
let flatItems = [];
let flatGrid = null;
let flatRange = '';
let flatKey = '';
const FLAT_COLS = 6;
const FLAT_ROW_H = 120;
const lineEls = [];
const spByDex = new Map();

function markSizes(key) {
  sizesEl.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
}

function spriteUrl(dex) {
  return conf.spriteBase + dex + '.gif';
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

// 英文界面优先用英文名（data/names-en.json 提供，没有就退回中文）
// PET_LANG 是 preload 暴露的只读初始值；运行时切语言以 I18N.lang 为准
function uiLang() { return window.I18N ? window.I18N.lang : (window.PET_LANG || 'zh'); }
function isEn() { return uiLang() === 'en'; }
function displayName(sp) {
  const l = uiLang();
  if (l === 'ja' && sp.nameJa) return sp.nameJa;
  if (l === 'ko' && sp.nameKo) return sp.nameKo;
  if (l === 'en' && sp.nameEn) return sp.nameEn;
  return sp.name;
}
function T(zh, en) { return isEn() ? en : (window.I18N ? window.I18N.translate(zh) : zh); }
function formName(f) {
  if (!f) return '';
  const l = uiLang();
  return (l === 'ja' && f.nameJa) || (l === 'ko' && f.nameKo) || (l === 'en' ? f.name : f.nameZh) || f.name || '';
}
function formMoveName(m) {
  if (!m) return '';
  const l = uiLang();
  if (l === 'ja') return m.ja || m.en || m.zh || '';
  if (l === 'ko') return m.ko || m.en || m.zh || '';
  if (l === 'en') return m.en || m.zh || '';
  return m.zh || m.en || '';
}
function applyAccessUi(a) {
  if (!a) return;
  document.body.classList.toggle('reduce-motion', !!a.reduceMotion);
  document.body.classList.toggle('high-contrast', !!a.highContrast);
}
function applySkinUi(s) {
  document.documentElement.dataset.skin = s || 'default';
}
try { applySkinUi(window.PET_SKIN); } catch (_) {}
try { applyAccessUi(window.PET_ACCESS); } catch (_) {}
if (window.cfg.onSkin) window.cfg.onSkin(s => applySkinUi(s));
if (window.cfg.onAccess) window.cfg.onAccess(a => applyAccessUi(a));
function fmtAgo(ts) {
  const s2 = Math.max(0, (Date.now() - ts) / 1000);
  if (s2 < 60) return uiLang() === 'ja' ? 'たった今' : uiLang() === 'ko' ? '방금' : T('刚刚', 'just now');
  if (s2 < 3600) return uiLang() === 'ja' ? `${Math.floor(s2 / 60)}分前` : uiLang() === 'ko' ? `${Math.floor(s2 / 60)}분 전` : T(`${Math.floor(s2 / 60)} 分钟前`, `${Math.floor(s2 / 60)} min ago`);
  if (s2 < 86400) return uiLang() === 'ja' ? `${Math.floor(s2 / 3600)}時間前` : uiLang() === 'ko' ? `${Math.floor(s2 / 3600)}시간 전` : T(`${Math.floor(s2 / 3600)} 小时前`, `${Math.floor(s2 / 3600)} h ago`);
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtCountdown(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60), mm = m % 60;
  if (uiLang() === 'ja') return h ? `${h}時間${mm}分` : `${m}分`;
  if (uiLang() === 'ko') return h ? `${h}시간 ${mm}분` : `${m}분`;
  return h ? T(`${h} 小时 ${mm} 分`, `${h} h ${mm} min`) : T(`${m} 分钟`, `${m} min`);
}
function nextMidnight() {
  const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime();
}
function nextMonday() {
  const d = new Date(); const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + (7 - day)); d.setHours(0, 0, 0, 0); return d.getTime();
}

function makeCard(sp) {
  const locked = !unlockedDex.has(sp.dex);
  const b = document.createElement('button');
  b.className = 'card' + (sp.dex === current ? ' active' : '') + (locked ? ' locked' : '');
  b.dataset.dex = String(sp.dex);
  b.title = locked ? `${displayName(sp)} · ${uiLang() === 'ja' ? '未解禁' : uiLang() === 'ko' ? '미해금' : isEn() ? 'locked' : '还没解锁'}` : `${displayName(sp)} · No.${pad3(sp.dex)}`;

  const img = document.createElement('img');
  img.src = spriteUrl(sp.dex);
  img.alt = displayName(sp);
  img.loading = 'lazy';
  img.decoding = 'async';

  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = displayName(sp);

  const types = document.createElement('span');
  types.className = 'card-types';
  types.textContent = sp.types.map(typeLabel).join('·');

  const fav = document.createElement('span');
  fav.className = 'card-fav' + (favorites.has(sp.dex) ? ' on' : '');
  fav.textContent = favorites.has(sp.dex) ? '♥' : '♡';
  fav.title = '收藏';
  b.append(img, name, types, fav);
  fav.onclick = async e => {
    e.preventDefault();
    e.stopPropagation();
    const r = await window.cfg.setFav(sp.dex, !favorites.has(sp.dex));
    favorites = new Set(r.favorites || []);
    fav.classList.toggle('on', favorites.has(sp.dex));
    fav.textContent = favorites.has(sp.dex) ? '♥' : '♡';
    const chip = chipsEl.querySelector('[data-type="收藏"]');
    if (chip) chip.textContent = `♥ 收藏 ${favorites.size || ''}`.trim();
    if (filter === '收藏') applyFilter();
  };
  b.onclick = async () => {
    // 动态判断：卡片建好之后靠孵蛋/进化解锁的，不能再被创建时的 locked 快照挡住
    if (!unlockedDex.has(sp.dex)) {
      if (hintEl) hintEl.textContent = `${displayName(sp)} 还没解锁 —— 孵蛋或者进化才能遇到它`;
      return;
    }
    await window.cfg.setSpecies(sp.dex);
    current = sp.dex;
    for (const line of lineEls) {
      for (const c of line.cards) c.el.classList.toggle('active', c.sp.dex === current);
    }
  };
  return b;
}

// 把某只设为当前，并在列表里定位、闪一下
function focusSpecies(dex) {
  current = dex;
  if (dexView === 'flat') {
    query = ''; filter = '全部'; genFilter = 0;
    if (searchEl) searchEl.value = '';
    if (genEl) genEl.value = '0';
    buildChips();
    renderFlat(true);
    const idx = flatItems.findIndex(x => x.dex === dex);
    if (idx >= 0) {
      dexVirtual.scrollTop = Math.floor(idx / FLAT_COLS) * FLAT_ROW_H;
      paintFlat(true);
      const card = dexVirtual.querySelector(`[data-dex="${dex}"]`);
      if (card) {
        card.classList.add('flash');
        setTimeout(() => card.classList.remove('flash'), 1200);
      }
    }
    return;
  }
  let el = null;
  for (const line of lineEls) {
    for (const c of line.cards) {
      c.el.classList.toggle('active', c.sp.dex === current);
      if (c.sp.dex === dex) el = c.el;
    }
  }
  if (!el) return;
  if (el.classList.contains('hide')) {
    filter = '全部'; query = ''; genFilter = 0;
    searchEl.value = ''; genEl.value = '0';
    buildChips();
    applyFilter();
  }
  el.scrollIntoView({ block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function buildChips() {
  const order = ['一般', '火', '水', '电', '草', '冰', '格斗', '毒', '地面', '飞行',
    '超能力', '虫', '岩石', '幽灵', '龙', '恶', '钢', '妖精'];
  const present = new Set(conf.species.flatMap(s => s.types || []));
  const types = ['全部', '收藏', '已解锁', '传说', ...order.filter(t => present.has(t))];
  chipsEl.innerHTML = '';
  for (const t of types) {
    const color = t === '传说' ? LEGEND_COLOR : t === '已解锁' ? '#34c759' : (TYPE_COLOR[t] || ALL_COLOR);
    const c = document.createElement('button');
    c.className = 'chip' + (t === filter ? ' active' : '');
    c.textContent = t === '收藏' ? `♥ 收藏${favorites.size ? ' ' + favorites.size : ''}` : t;
    c.dataset.type = t;
    c.style.setProperty('--chip', color);
    c.style.setProperty('--chip-tint', tint(color, .13));
    c.style.setProperty('--chip-border', tint(color, .38));
    c.onclick = () => {
      filter = t;
      chipsEl.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x.dataset.type === t));
      applyFilter();
      listEl.scrollTop = 0;
    };
    chipsEl.append(c);
  }
}

function buildGens() {
  genEl.innerHTML = '';
  const all = document.createElement('option');
  all.value = '0';
  all.textContent = '全部世代';
  genEl.append(all);
  for (let g = 1; g <= 9; g++) {
    const o = document.createElement('option');
    o.value = String(g);
    o.textContent = GEN_LABEL[g] || `第${g}代`;
    genEl.append(o);
  }
}

function buildLines() {
  for (const chain of conf.chains) {
    const box = document.createElement('div');
    box.className = 'line';
    box.style.setProperty('--tcolor', TYPE_COLOR[chain.type] || '#888888');

    const hd = document.createElement('div');
    hd.className = 'line-hd';
    const tag = document.createElement('span');
    tag.className = 'line-type';
    tag.textContent = chain.type || '?';
    hd.append(tag);
    if (!chain.hows.length) {
      const note = document.createElement('span');
      note.className = 'line-note';
      note.textContent = '无进化';
      hd.append(note);
    }
    box.append(hd);

    const body = document.createElement('div');
    body.className = 'line-body';
    const cards = [];
    const stageEls = [];
    const arrowEls = [];

    chain.stages.forEach((stage, i) => {
      const st = document.createElement('div');
      st.className = 'stage';
      for (const dex of stage) {
        const sp = spByDex.get(dex);
        if (!sp) continue;
        const el = makeCard(sp);
        st.append(el);
        cards.push({ sp, el, stage: i });
      }
      body.append(st);
      stageEls.push(st);

      if (i < chain.stages.length - 1) {
        const ar = document.createElement('div');
        ar.className = 'arrow';
        ar.textContent = '→';
        if (chain.hows[i]) {
          const em = document.createElement('em');
          em.textContent = chain.hows[i];
          ar.append(em);
        }
        body.append(ar);
        arrowEls.push(ar);
      }
    });

    box.append(body);

    // 只有一只、且没有进化 → 小卡片排布，避免一行一只浪费空间
    const onlyOne = chain.stages.length === 1 && chain.stages[0].length === 1;
    if (onlyOne) box.classList.add('single');

    listEl.append(box);
    lineEls.push({ type: chain.type, el: box, cards, stages: stageEls, arrows: arrowEls });
  }
}

function buildLegendGrid() {
  const legends = conf.species.filter(s => s.legend);
  if (!legends.length) return;

  const box = document.createElement('div');
  box.className = 'line legend-line';
  box.style.setProperty('--tcolor', LEGEND_COLOR);

  const hd = document.createElement('div');
  hd.className = 'line-hd';
  const badge = document.createElement('span');
  badge.className = 'line-badge';
  badge.textContent = '传说';
  const note = document.createElement('span');
  note.className = 'line-note';
  note.textContent = `${legends.length} 只 · 含幻兽`;
  hd.append(badge, note);
  box.append(hd);

  const body = document.createElement('div');
  body.className = 'legend-grid';
  const cards = [];
  for (const sp of legends) {
    const el = makeCard(sp);
    body.append(el);
    cards.push({ sp, el });
  }
  box.append(body);
  listEl.append(box);
  lineEls.push({ type: '传说', special: 'legend', el: box, cards });
}

function spVisible(sp) {
  if (genFilter && sp.gen !== genFilter) return false;
  if (!matches(sp)) return false;
  if (filter === '收藏') return favorites.has(sp.dex);
  if (filter === '已解锁') return unlockedDex.has(sp.dex);
  if (filter === '传说') return !!sp.legend;
  if (filter === '全部') return true;
  return (sp.types || []).includes(filter);
}

function sortSpecies(list) {
  const arr = list.slice();
  const sortLocale = uiLang() === 'ja' ? 'ja' : uiLang() === 'ko' ? 'ko' : isEn() ? 'en' : 'zh';
  const byName = (a, b) => displayName(a).localeCompare(displayName(b), sortLocale);
  if (sortKey === 'name') arr.sort(byName);
  else if (sortKey === 'type') arr.sort((a, b) => (a.types[0] || '').localeCompare(b.types[0] || '', 'zh') || a.dex - b.dex);
  else if (sortKey === 'gen') arr.sort((a, b) => (a.gen || 0) - (b.gen || 0) || a.dex - b.dex);
  else if (sortKey === 'legend') arr.sort((a, b) => (b.legend ? 1 : 0) - (a.legend ? 1 : 0) || a.dex - b.dex);
  else arr.sort((a, b) => a.dex - b.dex);
  return arr;
}

function paintFlat(force) {
  if (!flatGrid || !dexVirtual) return;
  const total = flatItems.length;
  const rows = Math.ceil(total / FLAT_COLS);
  const top = dexVirtual.scrollTop;
  const h = dexVirtual.clientHeight || 560;
  let start = Math.max(0, Math.floor(top / FLAT_ROW_H) - 1);
  let end = Math.min(rows, Math.ceil((top + h) / FLAT_ROW_H) + 1);
  const key = `${start}:${end}:${total}:${dexView}`;
  if (!force && key === flatRange) { flatGrid.style.top = start * FLAT_ROW_H + 'px'; return; }
  flatRange = key;
  flatGrid.style.top = start * FLAT_ROW_H + 'px';
  const frag = document.createDocumentFragment();
  for (let i = start * FLAT_COLS; i < Math.min(total, end * FLAT_COLS); i++) {
    const sp = flatItems[i];
    if (!sp) continue;
    frag.append(makeCard(sp));
  }
  flatGrid.replaceChildren(frag);
}

function renderFlat(reset) {
  if (!dexVirtual) return;
  flatItems = sortSpecies(conf.species.filter(spVisible));
  const rows = Math.ceil(flatItems.length / FLAT_COLS);
  if (!flatGrid) reset = true;
  if (reset) {
    dexVirtual.innerHTML = `<div class="dex-virtual-spacer" style="height:${Math.max(1, rows) * FLAT_ROW_H}px;position:relative"><div class="dex-virtual-grid" style="position:absolute;left:0;right:0;top:0"></div></div>`;
    flatGrid = dexVirtual.querySelector('.dex-virtual-grid');
    dexVirtual.scrollTop = 0;
    flatRange = '';
  } else {
    const spacer = dexVirtual.querySelector('.dex-virtual-spacer');
    if (spacer) spacer.style.height = Math.max(1, rows) * FLAT_ROW_H + 'px';
    const maxTop = Math.max(0, rows * FLAT_ROW_H - (dexVirtual.clientHeight || 0));
    if (dexVirtual.scrollTop > maxTop) dexVirtual.scrollTop = maxTop;
  }
  paintFlat(true);
  const filtering = !!query || filter !== '全部' || genFilter !== 0;
  if (countEl) countEl.textContent = filtering ? T(`找到 ${flatItems.length} 只`, `${flatItems.length} found`) : T(`共 ${flatItems.length} 只`, `${flatItems.length} total`);
}

function setDexView(v) {
  dexView = v === 'flat' ? 'flat' : 'chain';
  document.querySelectorAll('#view-seg .size-btn').forEach(b => b.classList.toggle('active', b.dataset.view === dexView));
  if (listEl) listEl.hidden = dexView === 'flat';
  if (dexVirtual) dexVirtual.hidden = dexView !== 'flat';
  if (virtualHint) virtualHint.hidden = dexView !== 'flat';
  if (dexView === 'flat') {
    flatKey = `${query}|${filter}|${genFilter}|${sortKey}`;
    renderFlat(true);
  } else { listEl.scrollTop = 0; applyFilter(); }
}

function build() {
  spByDex.clear();
  for (const sp of conf.species) spByDex.set(sp.dex, sp);

  buildChips();
  buildGens();
  listEl.innerHTML = '';
  lineEls.length = 0;
  buildLines();
  buildLegendGrid();
  built = true;
  if (dexView === 'flat') renderFlat(true);
}

function matches(sp) {
  if (!query) return true;
  const q = query.toLowerCase();
  return sp.name.includes(query) ||
    String(sp.nameEn || '').toLowerCase().includes(q) ||
    String(sp.nameJa || '').includes(query) ||
    String(sp.nameKo || '').includes(query) ||
    String(sp.dex).includes(query) ||
    (sp.types || []).some(t => t.includes(query));
}

function cardVisible(line, sp) {
  if (genFilter && sp.gen !== genFilter) return false;
  if (!matches(sp)) return false;
  if (filter === '收藏') return favorites.has(sp.dex);
  if (filter === '已解锁') return unlockedDex.has(sp.dex);
  if (line.special === 'legend') return filter === '传说';
  if (filter === '传说') return false;
  return filter === '全部' || line.type === filter;
}

function applyFilter() {
  if (dexView === 'flat') {
    const key = `${query}|${filter}|${genFilter}|${sortKey}`;
    const changed = key !== flatKey;
    flatKey = key;
    renderFlat(changed);
    return;
  }
  let shown = 0;

  for (const line of lineEls) {
    let hits = 0;
    const perStage = line.stages ? new Array(line.stages.length).fill(0) : null;

    for (const c of line.cards) {
      const visible = cardVisible(line, c.sp);
      c.el.classList.toggle('hide', !visible);
      if (visible) {
        hits++;
        if (perStage && c.stage != null) perStage[c.stage]++;
      }
    }

    if (perStage) {
      line.stages.forEach((st, i) => st.classList.toggle('hide', perStage[i] === 0));
      line.arrows.forEach((ar, i) => {
        const a = perStage[i] === 0;
        const b = perStage[i + 1] === 0;
        ar.classList.toggle('hide', a || b);
      });
    }

    line.el.classList.toggle('hide', hits === 0);
    shown += hits;
  }

  // 没筛选时显示进度（共 N 只本来会被「已解锁 x / y」盖掉），筛选时显示命中数
  const filtering = !!query || filter !== '全部' || genFilter !== 0;
  countEl.textContent = filtering
    ? `找到 ${shown} 只`
    : `已解锁 ${unlockedDex.size} / ${conf.species.length}`;
  if (!document.getElementById('pane-dex').hidden) {
    hintEl.textContent = shown === 0
      ? '没有匹配的宝可梦：换个关键词，或点「全部」取消属性/世代筛选'
      : '点任意一只即可切换';
  }
}

const NOTICE_ICON = {
  egg: '🥚', hatch: '🐣', achievement: '🏆', health: '💧', pomo: '⏱️',
  task: '✅', reward: '🎁', checkin: '📅', info: '🔔', form: '✨'
};

const ACH_DESC_EN = {
  '遇见第一只宝可梦': 'Meet your first Pokémon', '遇见 10 只': 'Meet 10 Pokémon',
  '遇见 50 只': 'Meet 50 Pokémon', '遇见 200 只': 'Meet 200 Pokémon',
  '遇见全部 1025 只': 'Meet all 1025 Pokémon', '见过一只异色': 'See one shiny',
  '见齐 8 只原生异色': 'Collect 8 original shinies', '发动 10 次专属动作': 'Use a signature move 10 times',
  '亲密度到 90': 'Reach friendship 90', '喂食 50 次': 'Feed 50 times',
  '小游戏接到 20 个': 'Catch 20 in the mini-game', '完成一次进化': 'Evolve once',
  '等级到 50': 'Reach level 50', '连续陪伴 7 天': 'Keep it open for 7 days',
  '摸头 500 次': 'Pet 500 times', '解锁 20 个成就': 'Unlock 20 badges',
  '连续签到 7 天': 'Check in 7 days in a row', '陪伴等级到 10 级': 'Reach level 10',
  '陪伴等级到 25 级': 'Reach level 25', '陪伴等级到 50 级': 'Reach level 50',
  '孵出第一只宝可梦': 'Hatch your first egg', '累计孵出 10 只': 'Hatch 10 eggs',
  '累计走 10 公里': 'Walk 10 km in total', '遇见 500 只': 'Meet 500 Pokémon',
  '见过 3 只异色': 'See 3 shinies', '喂食 200 次': 'Feed 200 times',
  '摸头 1000 次': 'Pet 1000 times', '发动 500 次专属动作': 'Use 500 signature moves',
  '把宠物扔出去 50 次': 'Throw the pet 50 times', '连续签到 30 天': 'Check in 30 days in a row',
  '连续陪伴 30 天': 'Stay together 30 days', '领取 10 个每日任务奖励': 'Claim 10 daily task rewards',
  '领取 4 个每周任务奖励': 'Claim 4 weekly task rewards'
};
function renderAchievements(c) {
  const list = c.achievements || [];
  const done = list.filter(a => a.unlocked).length;
  if (achCount) achCount.textContent = `${done} / ${list.length}`;
  if (achCount2) achCount2.textContent = `${done} / ${list.length}`;
  if (achBar) achBar.style.width = Math.round((done / Math.max(1, list.length)) * 100) + '%';
  if (!achGrid) return;
  achGrid.innerHTML = list.map(a => {
    const nm = uiLang() === 'ja' ? (a.ja || a.en || a.name) : uiLang() === 'ko' ? (a.ko || a.en || a.name) : uiLang() === 'zh' ? a.name : (a.en || a.name);
    const pr = a.progress;
    const pct = pr ? Math.round(Math.min(1, pr.value / Math.max(1, pr.target)) * 100) : 0;
    const when = a.at ? new Date(a.at).toLocaleDateString(uiLang() === 'ja' ? 'ja-JP' : uiLang() === 'ko' ? 'ko-KR' : isEn() ? 'en-US' : 'zh-CN') : '';
    const descText = uiLang() === 'ja' ? (a.descJa || a.desc) : uiLang() === 'ko' ? (a.descKo || a.desc) : uiLang() === 'zh' ? a.desc : (ACH_DESC_EN[a.desc] || a.desc);
    return `<div class="ach-card${a.unlocked ? '' : ' locked'}" title="${descText}">
      <span class="b">${ACH_ICONS[a.id] || '🏆'}</span>
      <span class="n">${nm}</span>
      <span class="d">${uiLang() === 'ja' ? (a.descJa || ACH_DESC_EN[a.desc] || a.desc) : uiLang() === 'ko' ? (a.descKo || ACH_DESC_EN[a.desc] || a.desc) : uiLang() === 'zh' ? a.desc : (ACH_DESC_EN[a.desc] || a.desc)}</span>
      ${pr ? `<span class="p"><i style="width:${pct}%"></i></span><span class="at">${Math.min(pr.value, pr.target)} / ${pr.target}</span>` : ''}
      ${when ? `<span class="at">${when}</span>` : ''}
    </div>`;
  }).join('');
}

function renderHeatmap(c) {
  if (!heatmapEl) return;
  const act = c.activity || {};
  const checked = new Set(c.checkins || []);
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(end.getDate() - 364);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));  // 对齐到周一
  const cells = [];
  const cur = new Date(start);
  while (cur <= end) {
    const weeks = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur); d.setDate(cur.getDate() + i);
      if (d > end) { weeks.push('<i style="visibility:hidden"></i>'); continue; }
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const n = Number(act[key]) || 0;
      const lv = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4;
      const cls = 'l' + lv + (checked.has(key) ? ' checkin' : '');
      const tip = `${key} · ${n} ${uiLang() === 'ja' ? '回の交流' : uiLang() === 'ko' ? '회 상호작용' : isEn() ? 'interactions' : '次互动'}${checked.has(key) ? (uiLang() === 'ja' ? ' · チェックイン済み' : uiLang() === 'ko' ? ' · 출석 완료' : isEn() ? ' · checked in' : ' · 已签到') : ''}`;
      weeks.push(`<i class="${cls}" title="${tip}"></i>`);
    }
    cells.push(weeks.join(''));
    cur.setDate(cur.getDate() + 7);
  }
  heatmapEl.innerHTML = cells.join('');
  if (heatmapMonths) heatmapMonths.innerHTML = '';
  if (achStreak) achStreak.textContent = c.checkInDays || 0;
  if (achCheckinTotal) achCheckinTotal.textContent = (c.checkins || []).length;
  if (achDays) achDays.textContent = c.firstLaunch ? Math.max(1, Math.floor((Date.now() - c.firstLaunch) / 86400000) + 1) : 1;
}

function renderFormActions(c) {
  if (!formBox || !formActions) return;
  if (formTimer) { clearInterval(formTimer); formTimer = null; }
  const forms = c.forms || { mega: [], gmax: [] };
  const active = c.battleForm;
  const has = (forms.mega && forms.mega.length) || (forms.gmax && forms.gmax.length);
  formBox.hidden = !has && !active;
  formActions.innerHTML = '';
  if (!has && !active) return;
  if (formStatus) {
    if (active) {
      const head = `${active.kind === 'mega' ? T('超级进化', 'Mega') : T('超极巨化', 'G-Max')} · ${formName(active)}`;
      const move = formMoveName(active.move);
      const update = () => {
        const left = Math.max(0, Math.ceil((active.until - Date.now()) / 1000));
        if (formStatus) formStatus.textContent = `${head}${move ? ' · ' + move : ''} · ${left}s`;
        if (left <= 0 && formTimer) { clearInterval(formTimer); formTimer = null; }
      };
      update();
      formTimer = setInterval(update, 1000);
    } else {
      formStatus.textContent = T('可以变身', 'Ready');
    }
  }
  if (active) {
    const b = document.createElement('button');
    b.className = 'form-btn end';
    b.textContent = T('变回原样', 'Revert');
    b.onclick = async () => { b.disabled = true; await window.cfg.transformForm('', ''); await reload(); };
    formActions.append(b);
    return;
  }
  for (const kind of ['mega', 'gmax']) {
    for (const f of (forms[kind] || [])) {
      const b = document.createElement('button');
      b.className = 'form-btn ' + kind;
      const full = formName(f);
      const short = full.replace(/^(超级|超极巨化|Mega |Gigantamax |メガ|キョダイマックス|메가|거대맥스)/, '');
      b.textContent = kind === 'mega'
        ? `${T('超级进化', 'Mega')} · ${short}`
        : `${T('超极巨化', 'G-Max')} · ${short}`;
      b.title = formMoveName(f.move);
      b.onclick = async () => { b.disabled = true; await window.cfg.transformForm(kind, f.file); await reload(); };
      formActions.append(b);
    }
  }
}

function renderTeam(c) {
  if (!teamGrid) return;
  renderFormActions(c);
  const list = c.roster || [];
  const active = list.find(p => p.active) || list.find(p => p.dex === c.current) || null;
  if (teamCount) teamCount.textContent = `${list.length} / 12`;
  if (active) {
    const sp = spByDex.get(active.dex) || { dex: active.dex, name: active.name, nameEn: active.nameEn, nameJa: active.nameJa, nameKo: active.nameKo, types: active.types || [] };
    if (teamSprite) teamSprite.src = (c.battleForm && c.battleForm.url) || spriteUrl(active.dex);
    if (teamName) teamName.textContent = active.nickname || displayName(sp);
    if (teamLevel) teamLevel.textContent = `Lv.${c.level}`;
    if (teamSub) {
      const types = (c.battleForm && c.battleForm.types && c.battleForm.types.length) ? c.battleForm.types : sp.types;
      teamSub.textContent = `No.${pad3(active.dex)} · ${types.map(typeLabel).join(' / ')}` + (c.battleForm ? ` · ${formName(c.battleForm)}` : '');
    }
    if (hatSelect) hatSelect.value = active.hat || 'none';
    if (scarfSelect) scarfSelect.value = active.scarf || 'none';
    if (renameInput) renameInput.value = active.nickname || '';
  }
  teamGrid.innerHTML = list.map(p => {
    const sp = spByDex.get(p.dex) || { dex: p.dex, name: p.name, nameEn: p.nameEn, nameJa: p.nameJa, nameKo: p.nameKo, types: p.types || [] };
    const nm = p.nickname || displayName(sp);
    return `<div class="team-card${p.active ? ' active' : ''}" data-dex="${p.dex}">
      <img src="${spriteUrl(p.dex)}" alt="${nm}">
      <b>${nm}</b>
      <span>No.${pad3(p.dex)}</span>
      <div class="team-actions">
        <button class="mini" data-act="switch" data-dex="${p.dex}" ${p.active ? 'disabled' : ''}>${p.active ? T('当前', 'Active') : T('切换', 'Switch')}</button>
        ${p.active ? '' : `<button class="mini del" data-act="remove" data-dex="${p.dex}">${T('移除', 'Remove')}</button>`}
      </div>
    </div>`;
  }).join('');
}

function renderTasks(c) {
  const build = (freq, el) => {
    if (!el) return;
    const list = (c.tasks && c.tasks[freq]) || [];
    el.innerHTML = list.map(d => {
      const done = d.progress >= d.target;
      const pct = Math.round(Math.min(1, d.progress / Math.max(1, d.target)) * 100);
      const label = isEn() ? d.en : ((uiLang() === 'ja' ? d.ja : uiLang() === 'ko' ? d.ko : '') || d.zh);
      const stoneText = d.stones ? (uiLang() === 'ja' ? ` · +${d.stones} 個` : uiLang() === 'ko' ? ` · +${d.stones}개` : ` · +${d.stones} ${isEn() ? 'stone' : '石'}`) : '';
      const expWord = uiLang() === 'ja' ? '経験値' : uiLang() === 'ko' ? '경험치' : 'EXP';
      const reward = `+${d.reward} ${expWord}${stoneText}`;
      return `<div class="task-card${done ? ' done' : ''}${d.claimed ? ' claimed' : ''}">
        <span class="task-title">${label}</span>
        <span class="task-side">
          <button class="task-claim" data-freq="${freq}" data-id="${d.id}" ${(!done || d.claimed) ? 'disabled' : ''}>
            ${d.claimed ? T('已领取', 'Claimed') : done ? T('领取', 'Claim') : `${d.progress} / ${d.target}`}
          </button>
        </span>
        <span class="task-reward">${reward}</span>
        <span class="task-bar"><i style="width:${pct}%"></i></span>
      </div>`;
    }).join('') || `<p class="hint">${T('暂无任务', 'No tasks')}</p>`;
  };
  build('daily', dailyTasks);
  build('weekly', weeklyTasks);
  const resetWord = uiLang() === 'ja' ? '更新まで' : uiLang() === 'ko' ? '갱신까지' : T('距刷新', 'resets in');
  if (dailyReset) dailyReset.textContent = `${resetWord} ${fmtCountdown(nextMidnight() - Date.now())}`;
  if (weeklyReset) weeklyReset.textContent = `${resetWord} ${fmtCountdown(nextMonday() - Date.now())}`;
}

function renderNotices(c) {
  const list = c.notifications || [];
  const unread = list.filter(n => !n.read).length;
  if (notifyBadge) {
    notifyBadge.hidden = unread === 0;
    notifyBadge.textContent = unread > 99 ? '99+' : String(unread);
  }
  if (noticeSummary) noticeSummary.textContent = uiLang() === 'ja' ? `${list.length}件 · 未読${unread}件` : uiLang() === 'ko' ? `전체 ${list.length}개 · 안 읽음 ${unread}개` : T(`${list.length} 条 · ${unread} 条未读`, `${list.length} total · ${unread} unread`);
  if (notifySystem) notifySystem.checked = !!c.notifySystem;
  if (!noticeList) return;
  if (!list.length) {
    noticeList.innerHTML = `<p class="notice-empty">${T('还没有通知。签到、孵蛋、任务和提醒都会出现在这里。', 'No notifications yet. Check-ins, eggs, tasks and reminders will show up here.')}</p>`;
    return;
  }
  noticeList.innerHTML = list.map(n => `<div class="notice-card${n.read ? '' : ' unread'}" data-id="${n.id}">
    <span class="notice-ico">${NOTICE_ICON[n.kind] || '🔔'}</span>
    <div class="notice-main">
      <div class="notice-title"><span>${uiLang() === 'ja' ? (n.titleJa || n.titleEn || n.title) : uiLang() === 'ko' ? (n.titleKo || n.titleEn || n.title) : isEn() ? (n.titleEn || n.title) : (window.I18N ? window.I18N.translate(n.title) : n.title)}</span><time>${fmtAgo(n.t)}</time></div>
      <div class="notice-body">${uiLang() === 'ja' ? (n.bodyJa || n.bodyEn || n.body) : uiLang() === 'ko' ? (n.bodyKo || n.bodyEn || n.body) : isEn() ? (n.bodyEn || n.body) : (window.I18N ? window.I18N.translate(n.body) : n.body)}</div>
    </div>
  </div>`).join('');
}

function renderSkinAccess(c) {
  document.querySelectorAll('.skin-btn').forEach(b => b.classList.toggle('active', b.dataset.skin === (c.skin || 'default')));
  if (festivalAuto) festivalAuto.checked = c.festivalAuto !== false;
  if (reduceMotion) reduceMotion.checked = !!(c.access && c.access.reduceMotion);
  if (highContrast) highContrast.checked = !!(c.access && c.access.highContrast);
  if (scaleSeg) markSeg(scaleSeg, String((c.access && c.access.uiScale) || 100));
  if (volume) volume.value = String((c.access && c.access.volume) || 45);
  if (volumeVal) volumeVal.textContent = `${(c.access && c.access.volume) || 45}%`;
  if (waterMin) waterMin.value = String(c.waterWarnMin ?? 60);
  if (sitMin) sitMin.value = String(c.sitWarnMin ?? 45);
  if (skinSeg) {
    const eff = c.effectiveSkin || c.skin || 'default';
    skinSeg.title = T(`当前生效：${eff}`, `Active: ${eff}`);
  }
}

function markSeg(el, key) {
  if (!el) return;
  el.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
}

function renderOpts(c) {
  if (!c) return;
  markSeg(shinySeg, c.shinyMode);
  markSeg(langSeg, c.lang);
  markSeg(themeSeg, c.theme || 'auto');
  if (rotationEl) rotationEl.value = String(c.rotateMin || 0);
  if (login) login.checked = !!c.loginAtStart;
  if (sound) sound.checked = c.soundOn !== false;
  if (focusSw) focusSw.checked = !!c.focusMode;
  if (guestSw) guestSw.checked = c.guestEnabled !== false;
  if (roamCountEl) roamCountEl.value = String(c.roamCount || 0);
  const nl = c.nature ? (uiLang() === 'ja' ? ({ cheer: 'ようき', lazy: 'のんき', timid: 'おくびょう', tsun: 'ツンデレ', greedy: 'くいしんぼう', sleepy: 'ねぼすけ' })[c.nature.key] : uiLang() === 'ko' ? ({ cheer: '명랑', lazy: '느긋', timid: '소심', tsun: '츤데레', greedy: '먹보', sleepy: '잠꾸러기' })[c.nature.key] : isEn() ? c.nature.en : c.nature.zh) : '–';
  if (natureEl) natureEl.textContent = nl || '–';
  if (lvlEl) lvlEl.textContent = `Lv.${c.level} · ${uiLang() === 'ja' ? '経験値' : uiLang() === 'ko' ? '경험치' : isEn() ? 'EXP' : '经验'} ${c.expInLevel ?? (c.exp % 100)}/${c.expNeed ?? 100}`;
  if (dexProgEl) dexProgEl.textContent = `${uiLang() === 'ja' ? '出会い' : uiLang() === 'ko' ? '만남' : isEn() ? 'Seen' : '遇见'} ${c.met}/${c.total} · ${uiLang() === 'ja' ? '色違い' : uiLang() === 'ko' ? '이로치' : isEn() ? 'Shiny' : '异色'} ${c.shinyMet}`;
  renderAchievements(c);
  renderTeam(c);
  renderTasks(c);
  renderNotices(c);
  renderReminders(c);
  renderHealth();
  renderCustomPets(c);
  renderHeatmap(c);
  renderSkinAccess(c);
  if (bagStones) bagStones.textContent = c.stones || 0;
  if (bagEggs) bagEggs.textContent = c.hasEgg ? '1' : '0';
  if (bagEggHint) bagEggHint.textContent = c.hasEgg
    ? (uiLang() === 'ja' ? '画面にタマゴがあります。クリックで孵化' : uiLang() === 'ko' ? '화면에 알이 있습니다. 클릭해 부화하세요' : isEn() ? 'There is an egg on screen — click it to hatch' : '屏幕上有一颗，点它孵化')
    : (uiLang() === 'ja' ? '歩いていると見つかります' : uiLang() === 'ko' ? '걷다 보면 발견합니다' : isEn() ? 'You will find one while walking' : '走走就能捡到');
  if (bagBar) bagBar.style.width = Math.round((c.eggProgress || 0) * 100) + '%';
  if (bagProgText) bagProgText.textContent = c.hasEgg
    ? (uiLang() === 'ja' ? 'タマゴがあります。クリックしてください' : uiLang() === 'ko' ? '알이 있습니다. 클릭하세요' : isEn() ? 'An egg is waiting — click it' : '已经有蛋了，去点它')
    : (uiLang() === 'ja' ? `${Math.round((c.eggProgress || 0) * 100)}%（歩くと見つかります）` : uiLang() === 'ko' ? `${Math.round((c.eggProgress || 0) * 100)}% (걷다 보면 발견)` : isEn() ? `${Math.round((c.eggProgress || 0) * 100)}% (keep walking)` : `${Math.round((c.eggProgress || 0) * 100)}%（走够就有一颗）`);
  const bagEggwin = document.getElementById('bag-eggwin');
if (bagEggwin) bagEggwin.onclick = () => window.cfg.action('eggwin');

if (bagCheckin) {
    bagCheckin.disabled = !!c.checkedIn;
    bagCheckin.textContent = c.checkedIn
      ? (uiLang() === 'ja' ? `今日はチェックイン済み（連続${c.checkInDays}日）` : uiLang() === 'ko' ? `오늘 출석 완료 (연속 ${c.checkInDays}일)` : isEn() ? `Checked in today (${c.checkInDays}-day streak)` : `今天已签到（连续 ${c.checkInDays} 天）`)
      : (uiLang() === 'ja' ? '+50経験値 +1進化の石を受け取る' : uiLang() === 'ko' ? '+50 경험치 +1 진화의돌 받기' : isEn() ? 'Claim +50 EXP +1 stone' : '领取 +50 经验 +1 进化石');
  }
  if (bagHatched) bagHatched.textContent = c.eggs || 0;
  if (bagSkin) bagSkin.textContent = nl || '–';

  if (pomoState) {
    pomoState.textContent = c.pomo
      ? (c.pomo.phase === 'work' ? '专注中…' : '休息中…')
      : '';
  }
}

// 解锁状态变了只同步卡片，不重建 DOM：
// 重建 540 条进化链会让列表跳回顶部，正好在你看着某只的时候
function syncCards() {
  for (const line of lineEls) {
    for (const c of line.cards) {
      const on = unlockedDex.has(c.sp.dex);
      c.el.classList.toggle('locked', !on);
      c.el.classList.toggle('active', c.sp.dex === current);
      c.el.title = `${displayName(c.sp)} · ${on ? 'No.' + pad3(c.sp.dex) : (isEn() ? 'locked' : '还没解锁')}`;
      const nm = c.el.querySelector('.card-name');
      if (nm) nm.textContent = displayName(c.sp);
      const im = c.el.querySelector('img');
      if (im) im.alt = displayName(c.sp);
      const fav = c.el.querySelector('.card-fav');
      if (fav) {
        const f = favorites.has(c.sp.dex);
        fav.classList.toggle('on', f);
        fav.textContent = f ? '♥' : '♡';
      }
    }
  }
  const chip = chipsEl.querySelector('[data-type="收藏"]');
  if (chip) chip.textContent = `♥ 收藏${favorites.size ? ' ' + favorites.size : ''}`;
}

async function reload() {
  conf = await window.cfg.get();
  current = conf.current;
  unlockedDex = new Set(conf.dexMet || []);
  favorites = new Set(conf.favorites || []);
  renderOpts(conf);
  if (!built) build();
  else syncCards();
  applyFilter();
}

async function init() {
  conf = await window.cfg.get();
  current = conf.current;

  login.checked = !!conf.loginAtStart;
  sound.checked = conf.soundOn !== false;
  if (verEl) verEl.textContent = conf.version || '?';
  favorites = new Set(conf.favorites || []);
  unlockedDex = new Set(conf.dexMet || []);
  if (countEl) countEl.textContent = `已解锁 ${unlockedDex.size} / ${conf.species.length}`;
  markSizes(conf.sizeKey);
  renderOpts(conf);
  build();
  applyFilter();

  window.cfg.onChanged && window.cfg.onChanged(() => {
    reload().catch(e => console.error('[settings] 刷新失败', e));
  });

  // 切语言：不整页重载（会把当前标签页/滚动位置丢掉），只重刷文案与名字
  window.cfg.onLang && window.cfg.onLang(async l => {
    if (window.I18N) window.I18N.setLang(l);
    markSeg(langSeg, ['zh', 'en', 'ja', 'ko'].includes(l) ? l : 'zh');
    syncCards();
    applyFilter();
    await reload();
  });

  // 兜底：万一推送丢了，靠轮询也能追上进度
  let pulse = { n: unlockedDex.size, cur: current, level: conf.level };
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const p = await window.cfg.dexPulse();
      if (p.n !== pulse.n || p.cur !== pulse.cur || p.level !== pulse.level) {
        pulse = p;
        await reload();
      }
    } catch (_) {}
  }, 1800);

  const active = listEl.querySelector('.card.active');
  if (active) active.scrollIntoView({ block: 'center' });
}

searchEl.addEventListener('input', () => {
  query = searchEl.value.trim();
  if (!built) return;
  applyFilter();
  listEl.scrollTop = 0;
});

searchEl.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    searchEl.value = '';
    query = '';
    applyFilter();
  }
});

diceEl.addEventListener('click', async () => {
  diceEl.disabled = true;
  try {
    const r = await window.cfg.random();
    focusSpecies(r.current);
  } finally {
    diceEl.disabled = false;
  }
});

genEl.addEventListener('change', () => {
  genFilter = Number(genEl.value) || 0;
  if (!built) return;
  applyFilter();
  listEl.scrollTop = 0;
});

login.addEventListener('change', async () => {
  const r = await window.cfg.setLogin(login.checked);
  login.checked = !!r.loginAtStart;
});

sizesEl.addEventListener('click', async e => {
  const btn = e.target.closest('.size-btn');
  if (!btn) return;
  await window.cfg.setSize(btn.dataset.key);
  markSizes(btn.dataset.key);
});

updBtn.onclick = async () => {
  updBtn.disabled = true;
  updMsg.className = 'upd-msg';
  updMsg.textContent = '检查中…';
  try {
    const r = await window.cfg.checkUpdate();
    if (!r || r.ok === false) {
      updMsg.className = 'upd-msg err';
      updMsg.textContent = r && r.reason === 'no-source' ? '未配置更新源'
        : r && r.reason === 'busy' ? '正在检查…' : '连不上更新源';
    } else if (r.hasUpdate) {
      updMsg.className = 'upd-msg new';
      updMsg.textContent = r.prompted ? `发现 v${r.latest}，请在弹出的窗口确认更新` : `发现 v${r.latest}，正在更新…`;
    } else {
      updMsg.className = 'upd-msg ok';
      updMsg.textContent = `已是最新 v${r.current}`;
    }
  } catch (e) {
    updMsg.className = 'upd-msg err';
    updMsg.textContent = '检查失败';
  } finally {
    updBtn.disabled = false;
  }
};

sound.onchange = async () => {
  await window.cfg.setSound(sound.checked);
};

// ---- 设置页的选项 ----
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.pane').forEach(p => {
      p.hidden = p.id !== 'pane-' + t.dataset.pane;
    });
    const hints = {
      dex: T('点任意一只即可切换', 'Click any Pokémon to switch'),
      team: T('最多 12 只伙伴，点切换即可换到它', 'Up to 12 companions — switch anytime'),
      tasks: T('每日 0 点、每周一刷新；完成后点「领取」', 'Daily resets at midnight, weekly on Monday'),
      ach: T('金色是已解锁，灰色是还没达成', 'Gold badges are unlocked; grey ones are still locked'),
      notify: T('签到、孵蛋、任务和提醒都会记录在这里', 'Check-ins, eggs, tasks and reminders are kept here'),
      bag: T('进化石和蛋都在这里', 'Stones and eggs live here'),
      opts: T('改完立刻生效', 'Changes apply immediately')
    };
    if (hintEl) hintEl.textContent = hints[t.dataset.pane] || '';
  };
});

if (viewSeg) {
  viewSeg.addEventListener('click', e => {
    const b = e.target.closest('.size-btn');
    if (!b) return;
    setDexView(b.dataset.view);
  });
}
if (sortSelect) {
  sortSelect.addEventListener('change', () => {
    sortKey = sortSelect.value;
    setDexView('flat');
  });
}
if (dexVirtual) {
  dexVirtual.addEventListener('scroll', () => {
    if (dexView !== 'flat') return;
    if (dexVirtual._raf) return;
    dexVirtual._raf = requestAnimationFrame(() => { dexVirtual._raf = 0; paintFlat(false); });
  }, { passive: true });
}

if (shinySeg) {
  shinySeg.addEventListener('click', async e => {
    const b = e.target.closest('.size-btn');
    if (!b) return;
    renderOpts(await window.cfg.setOpt('shiny', b.dataset.key));
  });
}

if (themeSeg) {
  themeSeg.addEventListener('click', async e => {
    const b = e.target.closest('button[data-key]');
    if (!b) return;
    renderOpts(await window.cfg.setOpt('theme', b.dataset.key));
    // 主题变化会让所有窗口的 prefers-color-scheme 立刻更新，无需刷新
  });
}

if (langSeg) {
  langSeg.addEventListener('click', async e => {
    const b = e.target.closest('.size-btn');
    if (!b) return;
    renderOpts(await window.cfg.setOpt('lang', b.dataset.key));
  });
}

if (rotationEl) {
  rotationEl.addEventListener('change', async () => {
    renderOpts(await window.cfg.setOpt('rotate', Number(rotationEl.value)));
  });
}

if (focusSw) {
  focusSw.addEventListener('change', async () => {
    renderOpts(await window.cfg.setOpt('focus', focusSw.checked));
  });
}

if (guestSw) {
  guestSw.addEventListener('change', async () => {
    renderOpts(await window.cfg.setOpt('guest', guestSw.checked));
  });
}
if (roamCountEl) {
  roamCountEl.addEventListener('change', async () => {
    renderOpts(await window.cfg.setOpt('roam', Number(roamCountEl.value)));
  });
}

const pomo25 = document.getElementById('pomo25');
const pomo45 = document.getElementById('pomo45');
const pomoStop = document.getElementById('pomo-stop');
if (pomo25) pomo25.onclick = async () => renderOpts(await window.cfg.action('pomo25'));
if (pomo45) pomo45.onclick = async () => renderOpts(await window.cfg.action('pomo45'));
if (pomoStop) pomoStop.onclick = async () => renderOpts(await window.cfg.action('pomoStop'));

const randomBtn = document.getElementById('random-btn');
if (randomBtn) {
  randomBtn.onclick = async () => {
    const r = await window.cfg.action('random');
    if (r) focusSpecies(r.current);
    renderOpts(r);
  };
}

const shareBtn = document.getElementById('share-btn');
if (shareBtn) {
  shareBtn.onclick = async () => {
    shareBtn.disabled = true;
    try { renderOpts(await window.cfg.action('share')); } finally { shareBtn.disabled = false; }
  };
}

if (bagCheckin) {
  bagCheckin.onclick = async () => {
    bagCheckin.disabled = true;
    const r = await window.cfg.action('checkin');
    if (r) renderOpts(r);
  };
}

const reportBtn = document.getElementById('report-btn');
if (reportBtn) reportBtn.onclick = () => window.cfg.action('report');

const gameBtn = document.getElementById('game-btn');
if (gameBtn) gameBtn.onclick = () => window.cfg.action('game');

// ---- 通知中心 ----
if (noticeList) {
  noticeList.addEventListener('click', async e => {
    const card = e.target.closest('.notice-card');
    if (!card) return;
    const id = Number(card.dataset.id);
    if (!id || !card.classList.contains('unread')) return;
    await window.cfg.readNotices([id]);
    card.classList.remove('unread');
    card.classList.add('read');
    await reload();
  });
}
if (noticeRead) noticeRead.onclick = async () => { await window.cfg.readNotices(); await reload(); };
if (noticeClear) noticeClear.onclick = async () => { await window.cfg.clearNotices(); await reload(); };
if (notifySystem) notifySystem.onchange = async () => {
  await window.cfg.setOpt('notifySystem', notifySystem.checked);
};

// ---- 任务领取 ----
const taskClick = async e => {
  const b = e.target.closest('.task-claim');
  if (!b || b.disabled) return;
  b.disabled = true;
  await window.cfg.claimTask(b.dataset.freq, b.dataset.id);
  await reload();
};
if (dailyTasks) dailyTasks.addEventListener('click', taskClick);
if (weeklyTasks) weeklyTasks.addEventListener('click', taskClick);

// ---- 伙伴 ----
if (teamGrid) {
  teamGrid.addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const dex = Number(b.dataset.dex);
    if (b.dataset.act === 'switch') await window.cfg.switchPet(dex);
    else if (b.dataset.act === 'remove') await window.cfg.removePet(dex);
    await reload();
  });
}
if (renameBtn) renameBtn.onclick = () => {
  if (!renameRow) return;
  renameRow.hidden = !renameRow.hidden;
  if (!renameRow.hidden) { renameInput.focus(); renameInput.select(); }
};
const doRename = async () => {
  if (!renameInput) return;
  const r = await window.cfg.rename(renameInput.value);
  if (renameRow) renameRow.hidden = true;
  await reload();
  return r;
};
if (renameSave) renameSave.onclick = doRename;
if (renameInput) renameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doRename();
  if (e.key === 'Escape') { renameRow.hidden = true; }
});
if (hatSelect) hatSelect.onchange = async () => { await window.cfg.setLook({ hat: hatSelect.value }); await reload(); };
if (scarfSelect) scarfSelect.onchange = async () => { await window.cfg.setLook({ scarf: scarfSelect.value }); await reload(); };

// ---- 皮肤 / 辅助功能 ----
if (skinSeg) {
  skinSeg.addEventListener('click', async e => {
    const b = e.target.closest('.skin-btn');
    if (!b) return;
    await window.cfg.setOpt('skin', b.dataset.skin);
    await reload();
  });
}
if (festivalAuto) festivalAuto.onchange = async () => { await window.cfg.setOpt('festivalAuto', festivalAuto.checked); await reload(); };
if (reduceMotion) reduceMotion.onchange = async () => {
  await window.cfg.setOpt('access', { reduceMotion: reduceMotion.checked });
};
if (highContrast) highContrast.onchange = async () => {
  await window.cfg.setOpt('access', { highContrast: highContrast.checked });
};
if (scaleSeg) {
  scaleSeg.addEventListener('click', async e => {
    const b = e.target.closest('.size-btn');
    if (!b) return;
    await window.cfg.setOpt('access', { uiScale: Number(b.dataset.key) });
    await reload();
  });
}
if (volume) {
  volume.oninput = () => { if (volumeVal) volumeVal.textContent = volume.value + '%'; };
  volume.onchange = async () => { await window.cfg.setOpt('access', { volume: Number(volume.value) }); };
}
if (waterMin) waterMin.onchange = () => window.cfg.setOpt('water', Number(waterMin.value));
if (sitMin) sitMin.onchange = () => window.cfg.setOpt('sit', Number(sitMin.value));

document.getElementById('close').onclick = () => window.cfg.close();

// ---- 自定义提醒事项 ----
const remindList = document.getElementById('reminder-list');
const remindLabel = document.getElementById('remind-label');
const remindTime = document.getElementById('remind-time');
const remindAddBtn = document.getElementById('remind-add');
const remindWeek = document.getElementById('remind-week');
const remindWeekHint = document.getElementById('remind-week-hint');
let remindSelectedDays = new Set();

function remindDaysText(days) {
  if (!days || !days.length) return T('每天', 'Every day');
  const labels = isEn() ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : ['日','一','二','三','四','五','六'];
  return days.slice().sort((a, b) => a - b).map(d => labels[d]).join(' ');
}

function renderReminders(c) {
  if (!remindList) return;
  const list = c.reminders || [];
  if (!list.length) {
    remindList.innerHTML = `<div class="reminder-empty">${T('还没有提醒，添加一个吧', 'No reminders yet — add one')}</div>`;
    return;
  }
  remindList.innerHTML = list.map(r => `
    <div class="reminder-item" data-id="${r.id}">
      <span class="r-time">${r.time}</span>
      <span class="r-label">${(r.label || T('提醒', 'Reminder')).replace(/</g, '&lt;')}</span>
      <span class="r-days">${remindDaysText(r.days)}</span>
      <span class="switch-wrap"><input type="checkbox" class="r-en" ${r.enabled ? 'checked' : ''}><i class="switch"></i></span>
      <button class="r-del" title="${T('删除', 'Delete')}">✕</button>
    </div>
  `).join('');
  remindList.querySelectorAll('.reminder-item').forEach(item => {
    const id = Number(item.dataset.id);
    item.querySelector('.r-en').onchange = async e => { await window.cfg.updateReminder(id, { enabled: e.target.checked }); };
    item.querySelector('.r-del').onclick = async () => { await window.cfg.removeReminder(id); await reload(); };
  });
}

if (remindWeek) {
  remindWeek.querySelectorAll('.week-btn').forEach(b => {
    b.onclick = () => {
      const d = Number(b.dataset.d);
      if (remindSelectedDays.has(d)) { remindSelectedDays.delete(d); b.classList.remove('active'); }
      else { remindSelectedDays.add(d); b.classList.add('active'); }
      if (remindWeekHint) remindWeekHint.textContent = remindSelectedDays.size ? T('已选 ' + remindSelectedDays.size + ' 天', remindSelectedDays.size + ' selected') : T('不选 = 每天', 'none = every day');
    };
  });
}
async function doAddReminder() {
  const label = remindLabel ? remindLabel.value.trim() : '';
  const time = remindTime ? remindTime.value : '09:00';
  if (!label && remindLabel) { remindLabel.focus(); return; }
  await window.cfg.addReminder({ label, time, days: [...remindSelectedDays] });
  if (remindLabel) remindLabel.value = '';
  remindSelectedDays.clear();
  if (remindWeek) remindWeek.querySelectorAll('.week-btn').forEach(b => b.classList.remove('active'));
  if (remindWeekHint) remindWeekHint.textContent = T('不选 = 每天', 'none = every day');
  await reload();
}
if (remindAddBtn) remindAddBtn.onclick = doAddReminder;
if (remindLabel) remindLabel.addEventListener('keydown', e => { if (e.key === 'Enter') doAddReminder(); });

// ---- 健康曲线 / 仪表盘 ----
const healthMood = document.getElementById('health-mood');
const healthHunger = document.getElementById('health-hunger');
const healthAvgMood = document.getElementById('health-avg-mood');
const healthAvgHunger = document.getElementById('health-avg-hunger');
const healthMoodBar = document.getElementById('health-mood-bar');
const healthHungerBar = document.getElementById('health-hunger-bar');
const healthSamples = document.getElementById('health-samples');
const healthChart = document.getElementById('health-chart');

async function renderHealth() {
  if (!healthChart) return;
  let data;
  try { data = await window.cfg.health(); } catch (_) { return; }
  if (!data) return;
  if (healthMood) healthMood.textContent = data.currentMood;
  if (healthHunger) healthHunger.textContent = data.currentHunger;
  if (healthAvgMood) healthAvgMood.textContent = data.avgMood;
  if (healthAvgHunger) healthAvgHunger.textContent = data.avgHunger;
  if (healthMoodBar) healthMoodBar.style.width = data.currentMood + '%';
  if (healthHungerBar) healthHungerBar.style.width = data.currentHunger + '%';
  if (healthSamples) healthSamples.textContent = T('已记录 ' + data.totalSamples + ' 天', data.totalSamples + ' days logged');
  drawHealthChart(data.series || []);
}

function drawHealthChart(series) {
  if (!healthChart) return;
  const ctx = healthChart.getContext('2d');
  const W = healthChart.width, H = healthChart.height;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  ctx.clearRect(0, 0, W, H);
  // 背景网格
  ctx.strokeStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (H - 30) * i / 4 + 10;
    ctx.beginPath(); ctx.moveTo(36, y); ctx.lineTo(W - 10, y); ctx.stroke();
  }
  ctx.fillStyle = dark ? '#98989d' : '#8e8e93';
  ctx.font = '10px -apple-system';
  for (let i = 0; i <= 4; i++) ctx.fillText(String(100 - i * 25), 6, (H - 30) * i / 4 + 14);
  if (!series.length) {
    ctx.fillStyle = dark ? '#98989d' : '#8e8e93';
    ctx.font = '13px -apple-system';
    ctx.textAlign = 'center';
    ctx.fillText(T('还没有数据，养几天就有了', 'No data yet — come back in a few days'), W / 2, H / 2);
    ctx.textAlign = 'left';
    return;
  }
  const n = series.length;
  const xStep = (W - 46) / Math.max(1, n - 1);
  const plot = (key, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    series.forEach((p, i) => {
      const x = 36 + i * xStep;
      const y = 10 + (1 - (p[key] || 0) / 100) * (H - 30);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // 数据点
    ctx.fillStyle = color;
    series.forEach((p, i) => {
      const x = 36 + i * xStep;
      const y = 10 + (1 - (p[key] || 0) / 100) * (H - 30);
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    });
  };
  plot('mood', '#ff6b6b');
  plot('hunger', '#ff9f43');
}

// ---- 照片伙伴 ----
function renderCustomPets(c) {
  if (!customPetsGrid) return;
  const pets = (c && c.customPets) || [];
  if (customOnSw) customOnSw.checked = c.customPetsOn !== false;
  if (customPetsCount) customPetsCount.textContent = T(pets.length + ' 只', pets.length + '');
  if (!pets.length) {
    customPetsGrid.innerHTML = `<div class="reminder-empty">${T('还没有照片伙伴，点上面「导入照片」试试', 'No photo pets yet — tap Import photo above')}</div>`;
    return;
  }
  customPetsGrid.innerHTML = pets.map(p => `
    <div class="custom-pet-card" data-id="${p.id}">
      <img src="${p.fileUrl}" alt="">
      <span class="cp-name">${(p.name || '').replace(/</g, '&lt;')}</span>
      <button class="cp-del" title="${T('删除', 'Delete')}">${T('删除', 'Delete')}</button>
    </div>
  `).join('');
  customPetsGrid.querySelectorAll('.custom-pet-card').forEach(card => {
    const id = Number(card.dataset.id);
    card.querySelector('.cp-del').onclick = async () => { await window.cfg.removeCustomPet(id); await reload(); };
  });
}

if (customImportBtn) {
  customImportBtn.onclick = async () => {
    customImportBtn.disabled = true;
    try { await window.cfg.importCustomPet(); await reload(); }
    finally { customImportBtn.disabled = false; }
  };
}
if (customOnSw) {
  customOnSw.onchange = async () => { await window.cfg.setOpt('customPetsOn', customOnSw.checked); await reload(); };
}

init().catch(err => {
  console.error('[settings] init 失败:', err && (err.stack || err.message || err));
});
