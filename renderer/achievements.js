const ICONS = {
  first: '👋', dex10: '🚪', dex50: '🧭', dex200: '🔬', dex1025: '📚',
  shiny1: '✨', shiny8: '💎', sig10: '🌟', sig100: '🏅',
  feed50: '🍎', pet500: '🤚', throw10: '🎾',
  streak7: '📅', checkin7: '✅'
};

async function load() {
  const c = await window.ach.get();
  const list = c.achievements || [];
  const done = list.filter(a => a.unlocked).length;
  document.getElementById('sub').textContent = `已解锁 ${done} / ${list.length}`;
  document.getElementById('bar').style.width = Math.round((done / Math.max(1, list.length)) * 100) + '%';

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const a of list) {
    const el = document.createElement('div');
    el.className = 'ach' + (a.unlocked ? '' : ' locked');
    el.innerHTML = `
      <span class="tick">${a.unlocked ? '✓' : '🔒'}</span>
      <div class="badge">${ICONS[a.id] || '🏆'}</div>
      <span class="n">${a.name}</span>
      <span class="d">${a.desc}</span>`;
    grid.append(el);
  }
}

document.getElementById('close').onclick = () => window.ach.close();
load().catch(e => console.error('[ach]', e));
