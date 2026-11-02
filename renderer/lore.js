const TYPE_COLOR = {
  草: '#78C850', 火: '#F08030', 水: '#6890F0', 电: '#F8D030',
  一般: '#A8A878', 超能力: '#F85888', 幽灵: '#705898', 格斗: '#C03028',
  恶: '#705848', 虫: '#A8B820', 飞行: '#A890F0', 岩石: '#B8A038',
  地面: '#E0C068', 冰: '#98D8D8', 龙: '#7038F8', 钢: '#B8B8D0',
  毒: '#A040A0', 妖精: '#EE99AC'
};

const el = id => document.getElementById(id);

function render(d) {
  el('dex').textContent = '#' + String(d.dex).padStart(3, '0');
  el('name').textContent = d.name;
  el('genus').textContent = d.genus || '';
  el('rare').hidden = !d.rare;
  if (d.rare) el('rare').textContent = d.rare;

  const accent = TYPE_COLOR[d.types[0]] || '#e63b3b';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-soft', hexA(accent, .12));

  const types = el('types');
  types.innerHTML = '';
  for (const t of d.types) {
    const s = document.createElement('span');
    s.className = 'type';
    s.textContent = t;
    s.style.background = TYPE_COLOR[t] || '#888';
    types.append(s);
  }

  const bits = [];
  if (d.h) bits.push('身高 ' + d.h + ' m');
  if (d.w) bits.push('体重 ' + d.w + ' kg');
  el('meta').textContent = bits.join(' · ');

  el('home').textContent = d.where ? `🏠 常在${d.where}出没` : (d.habitat ? `🏠 ${d.habitat}` : '');

  const flavor = el('flavor');
  if (d.flavor) {
    flavor.textContent = d.flavor;
    flavor.hidden = false;
  } else {
    flavor.hidden = true;
  }

  el('likes').textContent = '💭 ' + d.likes;

  const img = el('sprite');
  img.onerror = () => { img.style.visibility = 'hidden'; };
  img.src = d.spriteUrl;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

window.lore.onData(render);
document.addEventListener('mousedown', () => window.lore.close());
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.lore.close(); });
