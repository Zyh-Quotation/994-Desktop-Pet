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
