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
const rotationEl = document.getElementById('rotation');
const focusSw = document.getElementById('focus');
const pomoState = document.getElementById('pomo-state');
const lvlEl = document.getElementById('lvl');
const dexProgEl = document.getElementById('dex-prog');
const achProgEl = document.getElementById('ach-prog');

const guestSw = document.getElementById('guest');
const achGrid = document.getElementById('ach-grid');
const achCount = document.getElementById('ach-count');
const achBar = document.getElementById('ach-bar');
const ACH_ICONS = {
  first: '👋', dex10: '🚪', dex50: '🧭', dex200: '🔬', dex1025: '📚',
  shiny1: '✨', shiny8: '💎', sig10: '🌟', sig100: '🏅',
  feed50: '🍎', pet500: '🤚', throw10: '🎾', streak7: '📅', checkin7: '✅'
};
const natureEl = document.getElementById('nature');

const TYPE_COLOR = {
  草: '#78C850', 火: '#F08030', 水: '#6890F0', 电: '#F8D030',
  一般: '#A8A878', 超能力: '#F85888', 幽灵: '#705898', 格斗: '#C03028',
  恶: '#705848', 虫: '#A8B820', 飞行: '#A890F0', 岩石: '#B8A038',
  地面: '#E0C068', 冰: '#98D8D8', 龙: '#7038F8', 钢: '#B8B8D0',
  毒: '#A040A0', 妖精: '#EE99AC'
};
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

function makeCard(sp) {
  const locked = !unlockedDex.has(sp.dex);
  const b = document.createElement('button');
  b.className = 'card' + (sp.dex === current ? ' active' : '') + (locked ? ' locked' : '');
  b.dataset.dex = String(sp.dex);
  b.title = locked ? `${sp.name} · 还没解锁` : `${sp.name} · No.${pad3(sp.dex)}`;

  const img = document.createElement('img');
  img.src = spriteUrl(sp.dex);
  img.alt = sp.name;
  img.loading = 'lazy';
  img.decoding = 'async';

  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = sp.name;

  const types = document.createElement('span');
  types.className = 'card-types';
  types.textContent = sp.types.join('·');

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
    if (locked) {
      if (hintEl) hintEl.textContent = `${sp.name} 还没解锁 —— 孵蛋或者进化才能遇到它`;
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
  const types = ['全部', '收藏', '传说', ...order.filter(t => present.has(t))];
  chipsEl.innerHTML = '';
  for (const t of types) {
    const color = t === '传说' ? LEGEND_COLOR : (TYPE_COLOR[t] || ALL_COLOR);
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
}

function matches(sp) {
  if (!query) return true;
  return sp.name.includes(query) ||
    String(sp.dex).includes(query) ||
    (sp.types || []).some(t => t.includes(query));
}

function cardVisible(line, sp) {
  if (genFilter && sp.gen !== genFilter) return false;
  if (!matches(sp)) return false;
  if (filter === '收藏') return favorites.has(sp.dex);
  if (line.special === 'legend') return filter === '传说';
  if (filter === '传说') return false;
  return filter === '全部' || line.type === filter;
}

function applyFilter() {
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

  countEl.textContent = query ? `找到 ${shown} 只` : `共 ${shown} 只`;
  hintEl.textContent = shown === 0
    ? '没有匹配的宝可梦：换个关键词，或点「全部」取消属性/世代筛选'
    : '点任意一只即可切换';
}

function markSeg(el, key) {
  if (!el) return;
  el.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
}

function renderOpts(c) {
  if (!c) return;
  markSeg(shinySeg, c.shinyMode);
  markSeg(langSeg, c.lang);
  if (rotationEl) rotationEl.value = String(c.rotateMin || 0);
  if (focusSw) focusSw.checked = !!c.focusMode;
  if (guestSw) guestSw.checked = c.guestEnabled !== false;
  if (natureEl) natureEl.textContent = c.nature ? c.nature.zh : '–';
  if (lvlEl) lvlEl.textContent = `Lv.${c.level} · 经验 ${c.exp % 100}/100`;
  if (dexProgEl) dexProgEl.textContent = `遇见 ${c.met}/${c.total} · 异色 ${c.shinyMet}`;
  const list = c.achievements || [];
  if (achGrid) {
    const done = list.filter(a => a.unlocked).length;
    if (achCount) achCount.textContent = `${done} / ${list.length}`;
    if (achBar) achBar.style.width = Math.round((done / Math.max(1, list.length)) * 100) + '%';
    achGrid.innerHTML = list.map(a =>
      `<div class="ach-card${a.unlocked ? '' : ' locked'}">
         <span class="b">${ACH_ICONS[a.id] || '🏆'}</span>
         <span class="n">${a.name}</span>
         <span class="d">${a.desc}</span>
       </div>`).join('');
  }
  if (achProgEl) achProgEl.textContent = `${list.filter(a => a.unlocked).length}/${list.length} 已解锁`;

  if (pomoState) {
    pomoState.textContent = c.pomo
      ? (c.pomo.phase === 'work' ? '专注中…' : '休息中…')
      : '';
  }
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
      updMsg.textContent = `发现 v${r.latest}，正在更新…`;
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
  };
});

if (shinySeg) {
  shinySeg.addEventListener('click', async e => {
    const b = e.target.closest('.size-btn');
    if (!b) return;
    renderOpts(await window.cfg.setOpt('shiny', b.dataset.key));
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

const achBtn = document.getElementById('ach-btn');
if (achBtn) achBtn.onclick = () => window.cfg.action('ach');

const reportBtn = document.getElementById('report-btn');
if (reportBtn) reportBtn.onclick = () => window.cfg.action('report');

const gameBtn = document.getElementById('game-btn');
if (gameBtn) gameBtn.onclick = () => window.cfg.action('game');

document.getElementById('close').onclick = () => window.cfg.close();

init().catch(err => {
  console.error('[settings] init 失败:', err && (err.stack || err.message || err));
});
