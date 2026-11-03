const lang = ['zh', 'en', 'ja', 'ko'].includes(window.PET_LANG) ? window.PET_LANG : 'zh';
const en = lang !== 'zh';
const LABELS = {
  zh: {
    availableKicker: '发现新版本', installedKicker: '更新完成', availableTitle: '新版本已经准备好',
    installedTitle: '已经是最新版本', newTitle: '新增功能', fixTitle: '修复内容', infoTitle: '更新说明',
    later: '稍后', update: '立即更新', preparing: '准备中…', done: '开始使用',
    empty: '这个版本暂时没有详细说明。', failed: '更新启动失败，请稍后再试。', close: '关闭',
    scroll: '向下滚动查看全部内容 ↓'
  },
  en: {
    availableKicker: 'UPDATE AVAILABLE', installedKicker: 'UPDATED', availableTitle: 'A new version is ready',
    installedTitle: 'You are up to date', newTitle: 'New features', fixTitle: 'Fixes', infoTitle: 'Release notes',
    later: 'Later', update: 'Update now', preparing: 'Preparing…', done: 'Got it',
    empty: 'No detailed notes for this release yet.', failed: 'Could not start the update. Please try again.',
    close: 'Close', scroll: 'Scroll for all changes ↓'
  },
  ja: {
    availableKicker: '新しいバージョン', installedKicker: 'アップデート完了', availableTitle: '新しいバージョンの準備ができました',
    installedTitle: '最新バージョンです', newTitle: '新機能', fixTitle: '修正内容', infoTitle: '更新情報',
    later: 'あとで', update: '今すぐ更新', preparing: '準備中…', done: 'はじめる',
    empty: 'このバージョンの詳細情報はまだありません。', failed: '更新を開始できませんでした。もう一度お試しください。',
    close: '閉じる', scroll: '下にスクロールしてすべて表示 ↓'
  },
  ko: {
    availableKicker: '새 버전 있음', installedKicker: '업데이트 완료', availableTitle: '새 버전이 준비되었습니다',
    installedTitle: '최신 버전입니다', newTitle: '새 기능', fixTitle: '수정 내용', infoTitle: '업데이트 정보',
    later: '나중에', update: '지금 업데이트', preparing: '준비 중…', done: '시작하기',
    empty: '이 버전의 상세 정보가 아직 없습니다.', failed: '업데이트를 시작하지 못했습니다. 다시 시도해 주세요.',
    close: '닫기', scroll: '아래로 스크롤해 모두 보기 ↓'
  }
};
const L = LABELS[lang] || LABELS.zh;


const api = window.updateNotes;
const $ = id => document.getElementById(id);
const scroll = $('scroll');
const laterBtn = $('later');
const primaryBtn = $('primary');
const errEl = $('err');

document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
document.title = lang === 'ja' ? '更新情報' : lang === 'ko' ? '업데이트 정보' : en ? "What's new" : '更新内容';
$('close').title = L.close;
$('close').setAttribute('aria-label', L.close);

function addSection(type, items, heading, icon) {
  if (!items || !items.length) return;
  const section = document.createElement('section');
  section.className = 'section ' + type;
  const h = document.createElement('h2');
  const i = document.createElement('span');
  i.className = 'icon';
  i.textContent = icon;
  h.append(i, document.createTextNode(heading));
  const ul = document.createElement('ul');
  for (const item of items) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.textContent = type === 'fix' ? '✓' : type === 'new' ? '＋' : 'i';
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = (item[lang] || item.en || item.zh || '');
    li.append(dot, text);
    ul.append(li);
  }
  section.append(h, ul);
  scroll.append(section);
}

function fmtDate(value) {
  if (!value) return '';
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) + 'T12:00:00' : value;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'ja' ? 'ja-JP' : lang === 'ko' ? 'ko-KR' : en ? 'en-US' : 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function boot() {
  let p = null;
  try { p = await api.get(); } catch (_) {}
  if (!p) p = { mode: 'installed', version: '0.0.0', title: {}, notes: { new: [], fix: [], info: [] } };
  const available = p.mode === 'available';
  $('kicker').textContent = available ? L.availableKicker : L.installedKicker;
  $('spark').textContent = available ? '🚀' : '🎉';
  $('title').textContent = (p.title && (p.title[lang] || p.title.en || p.title.zh)) || (available ? L.availableTitle : L.installedTitle);
  $('version').textContent = 'v' + String(p.version || '0.0.0');
  $('date').textContent = fmtDate(p.date);
  const notes = p.notes || {};
  const counts = [];
  if (notes.new && notes.new.length) counts.push(lang === 'ja' ? `${notes.new.length}件の新機能` : lang === 'ko' ? `새 기능 ${notes.new.length}개` : en ? `${notes.new.length} new` : `${notes.new.length} 项新增`);
  if (notes.fix && notes.fix.length) counts.push(lang === 'ja' ? `${notes.fix.length}件の修正` : lang === 'ko' ? `수정 ${notes.fix.length}개` : en ? `${notes.fix.length} fixes` : `${notes.fix.length} 项修复`);
  $('counts').textContent = counts.join(' · ');
  addSection('new', notes.new, L.newTitle, '＋');
  addSection('fix', notes.fix, L.fixTitle, '✓');
  addSection('info', notes.info, L.infoTitle, 'i');
  if (!scroll.children.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = L.empty;
    scroll.append(empty);
  }
  const hint = $('hint');
  hint.textContent = L.scroll;
  const updateHint = () => {
    const more = scroll.scrollHeight > scroll.clientHeight + 4 && scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 8;
    hint.classList.toggle('show', more);
  };
  scroll.addEventListener('scroll', updateHint, { passive: true });
  requestAnimationFrame(updateHint);
  window.addEventListener('resize', updateHint);
  laterBtn.textContent = L.later;
  primaryBtn.textContent = available ? L.update : L.done;
  if (!available) laterBtn.style.display = 'none';

  laterBtn.onclick = () => api.close();
  $('close').onclick = () => api.close();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') api.close(); });
  primaryBtn.onclick = async () => {
    if (!available) { api.close(); return; }
    primaryBtn.disabled = true;
    laterBtn.disabled = true;
    primaryBtn.textContent = L.preparing;
    errEl.textContent = '';
    let r = null;
    try { r = await api.install(); } catch (_) {}
    if (!r || !r.ok) {
      primaryBtn.disabled = false;
      laterBtn.disabled = false;
      primaryBtn.textContent = L.update;
      errEl.textContent = L.failed;
    }
  };
}

boot();
