const field = document.getElementById('field');
const pet = document.getElementById('pet');
const scoreEl = document.getElementById('score');
const missEl = document.getElementById('miss');
const leftEl = document.getElementById('left');
const overEl = document.getElementById('over');
const startBtn = document.getElementById('start');

let score = 0, miss = 0, left = 30, running = false;
let balls = [];
let petX = 0, petW = 56;
let spawnTimer = null, secTimer = null;
let lastTs = 0;
let hopT = 0;

// 主进程把当前宠物的图传进来
window.setPet = url => { if (url) pet.src = url; };

function fieldW() { return field.clientWidth; }
function petY() { return field.clientHeight - 34; }

function spawn() {
  if (!running) return;
  const w = fieldW();
  const el = document.createElement('div');
  el.className = 'ball';
  const x = 20 + Math.random() * (w - 40);
  el.style.left = x + 'px';
  el.style.top = '-34px';
  field.append(el);
  balls.push({ el, x, y: -34, vy: 85 + Math.random() * 55 });
}

function poof(x, y, text, isMiss) {
  const p = document.createElement('div');
  p.className = 'poof' + (isMiss ? ' miss' : '');
  p.textContent = text;
  p.style.left = x + 'px';
  p.style.top = y + 'px';
  field.append(p);
  setTimeout(() => p.remove(), 620);
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
  lastTs = ts;

  const w = fieldW();
  const baseY = petY();

  // 找落得最低的球，跑过去接
  let target = null;
  for (const b of balls) {
    if (b.dead) continue;
    if (!target || b.y > target.y) target = b;
  }
  const speed = 330;
  if (target) {
    const dx = target.x - petX;
    if (Math.abs(dx) > 4) petX += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
  } else {
    // 没球时回到中间附近晃晃
    const home = w / 2;
    const dx = home - petX;
    if (Math.abs(dx) > 8) petX += Math.sign(dx) * Math.min(Math.abs(dx), speed * 0.35 * dt);
  }
  petX = Math.max(petW / 2, Math.min(w - petW / 2, petX));
  pet.style.left = petX + 'px';

  // 球的运动和判定
  for (const b of balls) {
    if (b.dead) continue;
    b.y += b.vy * dt;
    b.el.style.top = b.y + 'px';

    const nearX = Math.abs(b.x - petX) < petW * 0.55;
    const nearY = b.y > baseY - 26 && b.y < baseY + 16;
    if (nearX && nearY) {
      b.dead = true;
      b.el.remove();
      score++;
      scoreEl.textContent = score;
      poof(b.x, b.y, '+1', false);
      pet.classList.add('hop');
      hopT = ts;
      continue;
    }
    if (b.y > field.clientHeight - 4) {
      b.dead = true;
      b.el.remove();
      miss++;
      missEl.textContent = miss;
      poof(b.x, field.clientHeight - 20, '漏了', true);
    }
  }
  if (pet.classList.contains('hop') && ts - hopT > 110) pet.classList.remove('hop');
  balls = balls.filter(b => !b.dead);

  requestAnimationFrame(loop);
}

function start() {
  score = 0; miss = 0; left = 30; running = true;
  scoreEl.textContent = '0';
  missEl.textContent = '0';
  leftEl.textContent = '30';
  overEl.hidden = true;
  startBtn.disabled = true;
  startBtn.textContent = '它在接了…';
  balls.forEach(b => b.el.remove());
  balls = [];
  petX = fieldW() / 2;
  lastTs = 0;

  requestAnimationFrame(loop);
  spawnTimer = setInterval(spawn, 560);
  spawn(); spawn();
  secTimer = setInterval(() => {
    left -= 1;
    leftEl.textContent = left;
    if (left <= 0) end();
  }, 1000);
}

function end() {
  running = false;
  clearInterval(spawnTimer); clearInterval(secTimer);
  balls.forEach(b => b.el.remove());
  balls = [];
  startBtn.disabled = false;
  startBtn.textContent = '再来一局';
  overEl.hidden = false;
  overEl.innerHTML = `<h2>时间到！</h2>
    <p>接住 ${score} 个 · 漏掉 ${miss} 个 · 经验 +${score * 8}</p>`;
  try { window.game.done(score); } catch (_) {}
}

startBtn.onclick = start;
