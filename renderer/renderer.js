const sprite = document.getElementById('sprite');
const accHat = document.getElementById('acc-hat');
const accScarf = document.getElementById('acc-scarf');
const bubbleEl = document.getElementById('bubble');
const ballEl = document.getElementById('ball');
let bubbleTimer = null;
let dragging = false;
let downX = 0, downY = 0, downT = 0;
const samples = [];
let hoverState = false;
let petAccum = 0;
let petTimer = null;
const inBall = () => document.body.dataset.state === 'ball';
const stage = document.getElementById('pet-stage');
const cutin = document.getElementById('form-cutin');
const cutKicker = cutin && cutin.querySelector('.cut-kicker');
const cutName = cutin && cutin.querySelector('.cut-name');
const cutMove = cutin && cutin.querySelector('.cut-move');
const cutSparks = cutin && cutin.querySelector('.cut-sparks');
let baseSpriteUrl = '';
let currentForm = null;
let cutTimer = null;
let cutinUntil = 0;
const tr = s => (window.I18N && window.I18N.translate ? window.I18N.translate(s) : s);

function formDisplayName(f) {
  const l = window.I18N ? window.I18N.lang : 'zh';
  if (l === 'ja' && f.nameJa) return f.nameJa;
  if (l === 'ko' && f.nameKo) return f.nameKo;
  if (l === 'en') return f.name || f.nameZh || '';
  return f.nameZh || f.name || '';
}
function formMoveDisplay(f) {
  const l = window.I18N ? window.I18N.lang : 'zh';
  const m = f.move || {};
  if (l === 'ja') return m.ja || m.en || m.zh || '';
  if (l === 'ko') return m.ko || m.en || m.zh || '';
  if (l === 'en') return m.en || m.zh || '';
  return m.zh || m.en || '';
}

// 变身专属演出：闪白 → 能量环 → 粒子爆散 → 形态/招式横幅
function playFormCutin(form) {
  if (!cutin) return;
  const kind = form.kind || 'mega';
  const color = (form.move && form.move.color) || (kind === 'gmax' ? '#ff4f9a' : '#ffb43c');
  cutin.style.setProperty('--cut-color', color);
  cutin.style.setProperty('--cut-deep', kind === 'gmax' ? '#c2186a' : '#d65b00');
  cutin.dataset.kind = kind;
  if (cutKicker) cutKicker.textContent = tr(kind === 'mega' ? '超级进化' : '超极巨化');
  if (cutName) cutName.textContent = formDisplayName(form);
  const move = formMoveDisplay(form);
  if (cutMove) cutMove.textContent = move ? `${tr('形态专属招式')} · ${move}` : '';
  if (cutSparks) {
    cutSparks.innerHTML = '';
    for (let i = 0; i < 18; i++) {
      const sp = document.createElement('span');
      sp.className = 'cut-spark';
      const a = (Math.PI * 2 * i) / 18 + Math.random() * .22;
      const dist = 44 + Math.random() * 58;
      sp.style.setProperty('--dx', (Math.cos(a) * dist).toFixed(1) + 'px');
      sp.style.setProperty('--dy', (Math.sin(a) * dist - 24).toFixed(1) + 'px');
      sp.style.setProperty('--sz', (4 + Math.random() * 7).toFixed(1) + 'px');
      sp.style.setProperty('--dur', (.65 + Math.random() * .45).toFixed(2) + 's');
      sp.style.setProperty('--delay', (Math.random() * .12).toFixed(2) + 's');
      cutSparks.appendChild(sp);
    }
  }
  clearTimeout(cutTimer);
  cutinUntil = Date.now() + 2000;
  clearTimeout(bubbleTimer);
  bubbleEl.classList.remove('show');
  cutin.hidden = false;
  cutin.setAttribute('aria-hidden', 'false');
  cutin.classList.remove('show');
  document.body.classList.remove('form-cutin');
  void cutin.offsetWidth;
  cutin.classList.add('show');
  document.body.classList.add('form-cutin');
  cutTimer = setTimeout(() => {
    cutin.classList.remove('show');
    cutin.hidden = true;
    cutin.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('form-cutin');
  }, 1900);
}

function applyForm(form, animate = false) {
  const prev = currentForm;
  currentForm = form || null;
  const kind = form && form.kind ? form.kind : '';
  document.body.dataset.form = kind;
  // 没有专属立绘的形态（Z-A 新超级进化）：放大更多 + 形态色描边/呼吸光环，
  // 至少让「变身成功」一眼可见；图补进 assets/forms 后 noart 自动变 false。
  const noart = !!(form && form.noart);
  document.body.classList.toggle('form-noart', noart);
  if (stage) {
    const scale = kind === 'gmax' ? (noart ? 1.92 : 1.75) : kind === 'mega' ? (noart ? 1.34 : 1.22) : 1;
    stage.style.setProperty('--form-scale', scale);
    const c = (form && form.move && form.move.color) || (kind === 'gmax' ? '#ff5fa2' : '#ffd166');
    stage.style.setProperty('--form-c', c);
  }
  if (form && form.url) sprite.src = form.url;
  else if (!form && baseSpriteUrl) sprite.src = baseSpriteUrl;
  if (animate && form && (!prev || prev.file !== form.file)) playFormCutin(form);
  if (!form && cutin && !cutin.hidden) {
    clearTimeout(cutTimer);
    cutin.classList.remove('show');
    cutin.hidden = true;
    document.body.classList.remove('form-cutin');
  }
}
const cryAudio = new Audio();
cryAudio.volume = 0.45;

// ---------- 主进程消息 ----------
window.pet.onInit(d => {
  console.log('[init] petH=' + d.petH + ' shiny=' + d.shiny + ' url=' + d.spriteUrl);
  document.documentElement.style.setProperty('--petH', d.petH + 'px');
  baseSpriteUrl = d.spriteUrl;
  sprite.src = d.spriteUrl;
  if (d.hat || d.scarf) applyLook(d);
  if (d.form) applyForm(d.form, false);
});
window.pet.onLook(d => applyLook(d || {}));
window.pet.onForm(d => applyForm(d, true));
window.pet.onSkin(s => { document.documentElement.dataset.skin = s || 'default'; });

function applyLook(d) {
  const hats = { cap: '🧢', tophat: '🎩', crown: '👑' };
  if (hats[d.hat]) {
    accHat.hidden = false;
    accHat.textContent = hats[d.hat];
  } else accHat.hidden = true;
  const scarves = { red: '#e5484d', blue: '#3d8bfd', green: '#34c759' };
  if (scarves[d.scarf]) {
    accScarf.hidden = false;
    accScarf.style.background = scarves[d.scarf];
  } else accScarf.hidden = true;
}

function applyAccess(a) {
  if (!a) return;
  document.body.classList.toggle('reduce-motion', !!a.reduceMotion);
  document.body.classList.toggle('high-contrast', !!a.highContrast);
  cryAudio.volume = Math.max(0, Math.min(1, (Number(a.volume) || 0) / 100));
}
window.pet.onAccess(a => applyAccess(a));
try {
  document.documentElement.dataset.skin = window.pet.syncSkin();
  applyAccess(window.pet.syncAccess());
} catch (_) {}
window.pet.onSize(h => {
  document.documentElement.style.setProperty('--petH', h + 'px');
});
window.pet.onState(s => {
  document.body.dataset.state = s;
});
// 运行中切语言：不重载页面（会跳回屏幕中间），只让 i18n 重刷一遍
window.pet.onLang(l => {
  if (window.I18N && window.I18N.setLang) window.I18N.setLang(l);
});
// ---------- 叫声 ----------
window.pet.onCry(url => {
  try {
    cryAudio.pause();
    cryAudio.currentTime = 0;
    cryAudio.src = url;
    cryAudio.play().catch(() => { /* 用户可能没交互过，忽略 */ });
  } catch (_) { /* 忽略 */ }
});

// ---------- 待机小动作 ----------
let actTimer = null;
window.pet.onAct(a => {
  const cls = 'act-' + a;
  sprite.classList.remove('act-yawn', 'act-scratch', 'act-look', 'act-pounce');
  void sprite.offsetWidth;
  sprite.classList.add(cls);
  clearTimeout(actTimer);
  actTimer = setTimeout(() => sprite.classList.remove(cls), 1400);
});

// ---------- 专属动作 ----------
const fxLayer = document.getElementById('fx');
const MOTIONS = ['charge', 'stomp', 'bump', 'hover', 'dash', 'bounce'];
let fxTimer = null;

// 每种特效：粒子数量、大小范围、运动幅度
const FX_SHAPE = {
  spark:   { n: 14, sz: [16, 26], dx: 74, dy: [-78, -22], dur: [.6, .95] },
  ember:   { n: 13, sz: [13, 24], dx: 54, dy: [-96, -38], dur: [.7, 1.1] },
  bubble:  { n: 12, sz: [12, 26], dx: 54, dy: [-88, -28], dur: [.8, 1.35] },
  leaf:    { n: 12, sz: [11, 18], dx: 74, dy: [-64, 2],   dur: [.8, 1.25] },
  crystal: { n: 11, sz: [11, 19], dx: 70, dy: [-70, -12], dur: [.6, 1.0] },
  shock:   { n: 5,  sz: [22, 32], dx: 76, dy: [-14, 14], dur: [.5, .75] },
  slime:   { n: 10, sz: [13, 23], dx: 46, dy: [-52, -10], dur: [.75, 1.15] },
  rock:    { n: 10, sz: [8, 15],  dx: 70, dy: [-62, 8],   dur: [.65, .95] },
  wind:    { n: 9,  sz: [18, 32], dx: 92, dy: [-30, 6],   dur: [.5, .8] },
  ring:    { n: 5,  sz: [18, 28], dx: 62, dy: [-8, 8],    dur: [.65, .95] },
  dot:     { n: 16, sz: [6, 11],  dx: 64, dy: [-64, -8],  dur: [.5, .85] },
  ghost:   { n: 11, sz: [16, 28], dx: 58, dy: [-76, -24], dur: [.85, 1.25] },
  spiral:  { n: 9,  sz: [15, 24], dx: 62, dy: [-84, -26], dur: [.75, 1.15] },
  dark:    { n: 11, sz: [18, 32], dx: 68, dy: [-44, 18],  dur: [.65, .95] },
  flash:   { n: 10, sz: [13, 22], dx: 66, dy: [-66, -6],  dur: [.45, .75] },
  star:    { n: 12, sz: [11, 20], dx: 68, dy: [-76, -12], dur: [.65, 1.05] }
};

const rnd = (a, b) => a + Math.random() * (b - a);

window.pet.onFx(spec => {
  console.log('[fx] ' + spec.move + ' kind=' + spec.kind + ' n=' + (FX_SHAPE[spec.kind] ? FX_SHAPE[spec.kind].n : 0));
  const kind = FX_SHAPE[spec.kind] ? spec.kind : 'star';
  const shape = FX_SHAPE[kind];
  const color = spec.color || '#ffffff';

  clearTimeout(fxTimer);
  fxLayer.innerHTML = '';
  sprite.classList.remove(...MOTIONS.map(m => 'mv-' + m));
  sprite.style.setProperty('--mv-c', color);

  // 中心光环
  const aura = document.createElement('div');
  aura.className = 'aura';
  aura.style.setProperty('--c', color);
  fxLayer.appendChild(aura);
  const ring = document.createElement('div');
  ring.className = 'ring';
  ring.style.setProperty('--c', color);
  fxLayer.appendChild(ring);

  // 粒子：左右各一半，方向从身体中心往外散
  for (let i = 0; i < shape.n; i++) {
    const p = document.createElement('div');
    p.className = 'p p-' + kind;
    const side = i % 2 === 0 ? -1 : 1;
    const spread = rnd(0.35, 1);
    p.style.setProperty('--c', color);
    p.style.setProperty('--sz', rnd(shape.sz[0], shape.sz[1]).toFixed(1) + 'px');
    p.style.setProperty('--dx', (side * shape.dx * spread + rnd(-8, 8)).toFixed(1) + 'px');
    p.style.setProperty('--dy', rnd(shape.dy[0], shape.dy[1]).toFixed(1) + 'px');
    p.style.setProperty('--dur', rnd(shape.dur[0], shape.dur[1]).toFixed(2) + 's');
    p.style.setProperty('--d', rnd(0, 0.16).toFixed(2) + 's');
    p.style.setProperty('--rot', Math.round(rnd(-200, 260)) + 'deg');
    fxLayer.appendChild(p);
  }

  // 本体动作
  void sprite.offsetWidth;
  const motion = MOTIONS.includes(spec.motion) ? spec.motion : 'bump';
  sprite.classList.add('mv-' + motion);

  fxTimer = setTimeout(() => {
    fxLayer.innerHTML = '';
    sprite.classList.remove(...MOTIONS.map(m => 'mv-' + m));
  }, 1400);
});

// ---------- 离地高度（影子） ----------
window.pet.onAlt(r => {
  document.documentElement.style.setProperty('--alt', String(Math.max(0, Math.min(1, r))));
});

window.pet.onFace(d => {
  document.body.dataset.dir = d < 0 ? 'left' : 'right';
});
window.pet.onBubble(b => showBubble(b.text, b.ms));
window.pet.onSprite(d => {
  console.log('[switch sprite] ' + d.url);
  baseSpriteUrl = d.url;
  if (!currentForm) sprite.src = d.url;
});

// ---------- 喂食 / 玩耍 的动作表演 ----------
function popFx(text, frames, opts) {
  const el = document.createElement('div');
  el.className = 'tmp-fx';
  el.textContent = text;
  document.body.appendChild(el);
  const a = el.animate(frames, opts);
  a.onfinish = () => el.remove();
  setTimeout(() => el.remove(), (opts.duration || 900) + 600);
}

window.pet.onFeedFx(() => {
  // 食物从上面掉到嘴边，被一口吃掉
  popFx('🍎', [
    { transform: 'translate(-50%, -170px) scale(.85)', opacity: 0 },
    { transform: 'translate(-50%, -34px) scale(1)', opacity: 1, offset: .62 },
    { transform: 'translate(-50%, -6px) scale(.15)', opacity: 0 }
  ], { duration: 1150, easing: 'cubic-bezier(.34,1.1,.64,1)' });
  // 吃完冒爱心
  for (let i = 0; i < 3; i++) {
    setTimeout(() => popFx('❤️', [
      { transform: 'translate(-50%, -4px) scale(.5)', opacity: 0 },
      { transform: `translate(calc(-50% + ${(i - 1) * 20}px), -72px) scale(1)`, opacity: 1, offset: .5 },
      { transform: `translate(calc(-50% + ${(i - 1) * 30}px), -118px) scale(.75)`, opacity: 0 }
    ], { duration: 880, easing: 'ease-out' }), 760 + i * 120);
  }
  // 小跳一下
  sprite.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-9px)' },
    { transform: 'translateY(0)' }
  ], { duration: 420, iterations: 2, easing: 'ease-out' });
});

window.pet.onPlayFx(() => {
  // 球弹出去又弹回来，逗它去追
  popFx('🎾', [
    { transform: 'translate(-50%, 4px) scale(.5)', opacity: 0 },
    { transform: 'translate(calc(-50% - 58px), -66px) scale(1)', opacity: 1, offset: .28 },
    { transform: 'translate(calc(-50% - 96px), 8px) scale(.95)', opacity: 1, offset: .52 },
    { transform: 'translate(calc(-50% - 24px), -44px) scale(.9)', opacity: 1, offset: .74 },
    { transform: 'translate(calc(-50% + 34px), 6px) scale(.75)', opacity: 0 }
  ], { duration: 1450, easing: 'ease-in-out' });
  // 扑腾两下
  sprite.animate([
    { transform: 'translateY(0) rotate(0deg)' },
    { transform: 'translateY(-7px) rotate(-7deg)' },
    { transform: 'translateY(0) rotate(0deg)' },
    { transform: 'translateY(-7px) rotate(7deg)' },
    { transform: 'translateY(0) rotate(0deg)' }
  ], { duration: 1300, easing: 'ease-in-out' });
  setTimeout(() => popFx('✨', [
    { transform: 'translate(-50%, 0) scale(.4)', opacity: 0 },
    { transform: 'translate(-50%, -50px) scale(1.1)', opacity: 1, offset: .5 },
    { transform: 'translate(-50%, -90px) scale(.6)', opacity: 0 }
  ], { duration: 800, easing: 'ease-out' }), 600);
});

// 自定义提醒到点：跳一下 + 冒个铃铛
window.pet.onReminderFx(() => {
  popFx('🔔', [
    { transform: 'translate(-50%, -10px) scale(.4)', opacity: 0 },
    { transform: 'translate(-50%, -56px) scale(1.15)', opacity: 1, offset: .5 },
    { transform: 'translate(-50%, -86px) scale(.7)', opacity: 0 }
  ], { duration: 1100, easing: 'ease-out' });
  sprite.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-12px)' },
    { transform: 'translateY(0)' }
  ], { duration: 380, iterations: 3, easing: 'ease-out' });
});

// 蛋：走够了会冒出来，点一下孵化
const eggEl = document.getElementById('egg');
window.pet.onEgg(d => {
  eggEl.hidden = false;
  eggEl.className = (d && d.rarity) ? d.rarity : '';
  const rareNames = { rare: ['稀有', 'Rare'], legendary: ['传说', 'Legendary'], shiny: ['异色', 'Shiny'] };
  const rn = d && rareNames[d.rarity];
  eggEl.title = rn ? (window.I18N && window.I18N.lang === 'en' ? `${rn[1]} egg` : `${rn[0]}蛋`) : '';
  sprite.style.visibility = 'hidden';
});
window.pet.onEggGone(() => { eggEl.hidden = true; eggEl.className = ''; sprite.style.visibility = ''; });
eggEl.addEventListener('click', e => { e.stopPropagation(); window.pet.hatch(); });

// 进化：白闪一下再换形态
const evolveFlash = document.getElementById('flash');
window.pet.onEvolve(d => {
  evolveFlash.style.opacity = '1';
  setTimeout(() => { sprite.src = d.url; }, 280);
  setTimeout(() => { evolveFlash.style.opacity = '0'; }, 760);
});

sprite.addEventListener('load', () => {
  console.log('[sprite loaded] ' + sprite.naturalWidth + 'x' + sprite.naturalHeight);
  sprite.classList.add('ready');
  window.pet.reportSprite(sprite.naturalWidth, sprite.naturalHeight);
});
sprite.addEventListener('error', () => {
  console.error('[sprite error] ' + sprite.src);
});

// ---------- 鼠标交互 ----------
function onDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  dragging = true;
  downX = e.screenX;
  downY = e.screenY;
  downT = performance.now();
  samples.length = 0;
  samples.push({ x: e.screenX, y: e.screenY, t: performance.now() });
  window.pet.grab();
}
sprite.addEventListener('mousedown', onDown);
// 右键：直接弹出快捷菜单（必须拦住冒泡，否则 window 上那个监听也会弹一次，两个菜单打架）
sprite.addEventListener('contextmenu', e => {
  e.preventDefault();
  e.stopPropagation();
  window.pet.contextMenu();
});
ballEl.addEventListener('mousedown', onDown);

// 命中测试：球 / 精灵 / 蛋（蛋显示时精灵是隐藏的，必须单独算）
function hit(el) {
  const r = el.getBoundingClientRect();
  return lastMouse.x >= r.left - 2 && lastMouse.x <= r.right + 2 &&
         lastMouse.y >= r.top - 2 && lastMouse.y <= r.bottom + 2;
}
const lastMouse = { x: -9999, y: -9999 };

window.addEventListener('mousemove', e => {
  lastMouse.x = e.clientX;
  lastMouse.y = e.clientY;
  // 告诉主进程光标是否在宠物身上（控制点击穿透）
  const inside = inBall()
    ? hit(ballEl)
    : (!eggEl.hidden ? hit(eggEl) : (sprite.classList.contains('ready') && hit(sprite)));
  if (inside !== hoverState) {
    hoverState = inside;
    window.pet.overPet(inside);
  }

  // 摸头：在宠物身上来回蹭，累计位移够了就算摸了一次
  if (inside && !dragging && !inBall()) {
    petAccum += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    if (petAccum > 120) {
      petAccum = 0;
      sprite.classList.add('petting');
      clearTimeout(petTimer);
      petTimer = setTimeout(() => sprite.classList.remove('petting'), 320);
      window.pet.pet();
    }
  } else {
    petAccum = 0;
  }
  // 拖拽中记录轨迹，用于计算抛出速度
  if (!dragging) return;
  const t = performance.now();
  samples.push({ x: e.screenX, y: e.screenY, t });
  while (samples.length && t - samples[0].t > 140) samples.shift();
});

window.addEventListener('contextmenu', e => {
  e.preventDefault();
  window.pet.context();
});

// 指针离开窗口（或窗口失焦）时清掉 hover，否则窗口会一直是「可点击」状态，
// 透明区域开始吞掉桌面上的点击 —— 表现为点别的东西没反应
function clearHover() {
  if (!hoverState) return;
  hoverState = false;
  window.pet.overPet(false);
}
document.addEventListener('mouseleave', clearHover);
document.documentElement.addEventListener('mouseleave', clearHover);
window.addEventListener('blur', clearHover);

window.addEventListener('mouseup', e => {
  if (!dragging) return;
  dragging = false;
  const t = performance.now();
  const dt = t - downT;
  const dist = Math.hypot(e.screenX - downX, e.screenY - downY);
  // 短按且几乎没动 => 点击互动
  if (dt < 350 && dist < 8) window.pet.click();
  // 计算抛出速度（取最近 140ms 内的位移）
  let vx = 0, vy = 0;
  const old = samples.find(s => t - s.t <= 140);
  const last = samples[samples.length - 1];
  if (old && last && last.t > old.t) {
    const sec = (last.t - old.t) / 1000;
    vx = (last.x - old.x) / sec;
    vy = (last.y - old.y) / sec;
  }
  window.pet.release(vx, vy);
});

// ---------- 气泡 ----------
function showBubble(text, ms = 1800) {
  // 变身演出期间不叠普通气泡，避免和形态横幅打架
  if (Date.now() < cutinUntil) return;
  bubbleEl.textContent = text;
  bubbleEl.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), ms);
}
