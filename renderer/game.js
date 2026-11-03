const field = document.getElementById('field');
const scoreEl = document.getElementById('score');
const leftEl = document.getElementById('left');
const overEl = document.getElementById('over');
const overT = document.getElementById('over-t');
const overS = document.getElementById('over-s');
const startBtn = document.getElementById('start');
const againBtn = document.getElementById('again');

let score = 0, running = false, left = 30;
let tickTimer = null, spawnTimer = null, secTimer = null;
let balls = [];

function spawn() {
  if (!running) return;
  const b = document.createElement('div');
  b.className = 'ball';
  b.style.left = (14 + Math.random() * (field.clientWidth - 28)) + 'px';
  b.style.top = '-36px';
  field.append(b);
  const item = { el: b, y: -36, vy: 90 + Math.random() * 70 };
  balls.push(item);
  b.onclick = e => {
    e.stopPropagation();
    if (!running || item.dead) return;
    item.dead = true;
    b.remove();
    balls = balls.filter(x => x !== item);
    score += 1;
    scoreEl.textContent = score;
    const p = document.createElement('div');
    p.className = 'poof';
    p.textContent = '+1';
    p.style.left = b.style.left;
    p.style.top = item.y + 'px';
    field.append(p);
    setTimeout(() => p.remove(), 620);
  };
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.05, (ts - (loop.last || ts)) / 1000);
  loop.last = ts;
  for (const it of balls) {
    it.y += it.vy * dt;
    it.el.style.top = it.y + 'px';
    if (it.y > field.clientHeight) {
      it.el.remove();
      it.dead = true;
    }
  }
  balls = balls.filter(x => !x.dead);
  requestAnimationFrame(loop);
}

function start() {
  score = 0; left = 30; running = true;
  scoreEl.textContent = '0';
  leftEl.textContent = '30';
  overEl.hidden = true;
  startBtn.disabled = true;
  startBtn.textContent = '游戏中…';
  balls.forEach(b => b.el.remove());
  balls = [];
  loop.last = 0;

  requestAnimationFrame(loop);
  spawnTimer = setInterval(spawn, 520);
  for (let i = 0; i < 3; i++) setTimeout(spawn, i * 180);

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
  overT.textContent = '时间到！';
  const bonus = score * 8;
  overS.textContent = `接住 ${score} 个球 · 经验 +${bonus}`;
  try { window.game.done(score); } catch (_) {}
}

startBtn.onclick = start;
againBtn.onclick = start;
