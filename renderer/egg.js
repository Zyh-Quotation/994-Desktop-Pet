const ring = document.getElementById('ring');
const eggEl = document.getElementById('egg');
const timerEl = document.getElementById('timer');
const statEl = document.getElementById('stat');
const hatchBtn = document.getElementById('hatch');
const logEl = document.getElementById('log');
const subEl = document.getElementById('sub');

// 走动速度约 45px/s，估算剩余时间
const SPEED = 45;

function fmt(sec) {
  if (sec <= 0) return '可以孵了';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
  if (m > 0) return `${m} 分 ${String(s).padStart(2, '0')} 秒`;
  return `${s} 秒`;
}

let last = null;

function render(d) {
  last = d;
  const pct = d.hasEgg ? 1 : (d.eggProgress || 0);
  ring.style.setProperty('--p', Math.round(pct * 100) + '%');
  ring.classList.toggle('ready', !!d.hasEgg);
  eggEl.textContent = '🥚';
  eggEl.style.filter = d.hasEgg ? 'none' : 'grayscale(1) opacity(.22)';

  if (d.hasEgg) {
    timerEl.innerHTML = '孵化 <small>点下面的按钮</small>';
    statEl.textContent = '它正在脚边轻轻晃';
    hatchBtn.disabled = false;
    hatchBtn.textContent = '现在孵化 🐣';
    subEl.textContent = '蛋已经捡到了';
  } else {
    const leftPx = Math.max(0, (1 - (d.eggProgress || 0)) * d.eggAt);
    timerEl.innerHTML = `约 ${fmt(leftPx / SPEED)}<small> 还差</small>`;
    const walked = Math.round((d.eggProgress || 0) * d.eggAt / 50);
    const total = Math.round(d.eggAt / 50);
    statEl.textContent = `进度 ${Math.round((d.eggProgress || 0) * 100)}% · 已走 ${walked} / ${total} 米`;
    hatchBtn.disabled = true;
    hatchBtn.textContent = '还没有蛋，先让它走走';
    subEl.textContent = '它走着走着就会捡到一颗';
  }
  logEl.textContent = `已经孵出 ${d.eggs || 0} 只 · 进化石 ${d.stones || 0} 颗`;
}

async function refresh() {
  const d = await window.egg.get();
  if (d) render(d);
}

hatchBtn.onclick = async () => {
  hatchBtn.disabled = true;
  hatchBtn.textContent = '孵化中…';
  await window.egg.hatch();
  setTimeout(refresh, 1400);
};

document.getElementById('close').onclick = () => window.egg.close();

refresh().catch(e => console.error('[egg]', e));
setInterval(() => { if (!last || !last.hasEgg) refresh().catch(() => {}); }, 2500);
