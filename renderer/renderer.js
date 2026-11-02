const sprite = document.getElementById('sprite');
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

// ---------- 主进程消息 ----------
window.pet.onInit(d => {
  console.log('[init] petH=' + d.petH + ' shiny=' + d.shiny + ' url=' + d.spriteUrl);
  document.documentElement.style.setProperty('--petH', d.petH + 'px');
  sprite.src = d.spriteUrl;
});
window.pet.onSize(h => {
  document.documentElement.style.setProperty('--petH', h + 'px');
});
window.pet.onState(s => {
  document.body.dataset.state = s;
});
// ---------- 叫声 ----------
const cryAudio = new Audio();
cryAudio.volume = 0.45;
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
  sprite.src = d.url;
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
ballEl.addEventListener('mousedown', onDown);

window.addEventListener('mousemove', e => {
  // 告诉主进程光标是否在宠物身上（控制点击穿透）
  const target = inBall() ? ballEl : sprite;
  const r = target.getBoundingClientRect();
  const inside = (inBall() || sprite.classList.contains('ready')) &&
    e.clientX >= r.left - 2 && e.clientX <= r.right + 2 &&
    e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2;
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
  bubbleEl.textContent = text;
  bubbleEl.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), ms);
}
