const $ = id => document.getElementById(id);

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function load() {
  const r = await window.report.get();
  if (!r) return;
  $('sub').textContent = r.firstLaunch
    ? `从 ${fmtDate(r.firstLaunch)} 到今天 · Lv.${r.level}`
    : `Lv.${r.level}`;
  $('days').innerHTML = `${r.days}<small> 天</small>`;
  $('hours').textContent = r.hours;
  $('meters').textContent = r.meters;
  $('feed').textContent = r.feed;
  $('play').textContent = r.play;
  $('pet').textContent = r.pet;
  $('thrown').textContent = r.thrown;
  $('sig').textContent = r.sig;
  $('met').textContent = r.met;
  $('shiny').textContent = r.shiny;
  $('hatch').textContent = r.hatch;
  $('streak').textContent = r.streak;
  const pct = Math.min(100, Math.round((r.days / 365) * 100));
  $('yearbar').style.width = pct + '%';
  $('hint').textContent = `图鉴 ${r.met}/${r.total} · 异色 ${r.shiny}`;
}

$('save').onclick = async () => {
  const btn = $('save');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    const r = await window.report.save();
    btn.textContent = r && r.ok ? '已保存到桌面' : '保存失败';
  } catch (_) {
    btn.textContent = '保存失败';
  } finally {
    setTimeout(() => { btn.disabled = false; btn.textContent = '保存成图片'; }, 2200);
  }
};

load().catch(e => console.error('[report]', e));
