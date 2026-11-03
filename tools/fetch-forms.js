/*
 * 下载超级进化 / 超极巨化形态的动画图（普通 + 异色）
 * 数据来自 data/forms.json；图片来自 Pokémon Showdown 的 ani / ani-shiny。
 * 用法：node tools/fetch-forms.js
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'forms');
const SD = 'https://play.pokemonshowdown.com/sprites';
const JSD = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/showdown';
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'forms.json'), 'utf8')).forms;

function candidates(id) {
  const list = [id];
  // Showdown 把 mega-x 写成 megax
  list.push(id.replace(/-mega-([xyz])$/, '-mega$1'));
  // 超极巨化的特殊形态：先试去掉 amped / low-key / single-strike / rapid-strike
  list.push(id.replace(/-(amped|low-key|single-strike|rapid-strike)-gmax$/, '-gmax'));
  // 性别形态：Showdown 一般只有默认形态
  list.push(id.replace(/-male-mega$/, '-mega').replace(/-female-mega$/, '-mega'));
  // 米立龙等形态：先试基础 mega
  list.push(id.replace(/^tatsugiri-(curly|droopy|stretchy)-mega$/, 'tatsugiri-mega'));
  return [...new Set(list)];
}
async function grab(url, dest) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 300) return false;
    fs.writeFileSync(dest, buf);
    return true;
  } catch (_) { return false; }
  finally { clearTimeout(timer); }
}
function good(p) { try { return fs.statSync(p).size > 1000; } catch (_) { return false; } }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const jobs = [];
  for (const bucket of Object.values(data)) for (const kind of ['mega', 'gmax']) for (const f of bucket[kind]) {
    jobs.push({ file: f.file, sprite: f.sprite, formId: f.formId, shiny: false });
    jobs.push({ file: f.file, sprite: f.sprite, formId: f.formId, shiny: true });
  }
  let done = 0, fail = 0;
  const queue = jobs.slice();
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const j = queue.shift();
      const dest = path.join(OUT, j.file + (j.shiny ? '-shiny' : '') + '.gif');
      if (good(dest)) { done++; continue; }
      let ok = false;
      for (const id of candidates(j.sprite)) {
        const folder = j.shiny ? 'ani-shiny' : 'ani';
        if (await grab(`${SD}/${folder}/${id}.gif`, dest)) { ok = true; break; }
      }
      if (!ok && j.formId) {
        const folder = j.shiny ? '/shiny' : '';
        if (await grab(`${JSD}${folder}/${j.formId}.gif`, dest)) ok = true;
      }
      done++;
      if (!ok) { fail++; console.log('FAIL', j.file, j.shiny ? 'shiny' : 'normal', j.sprite); }
      if (done % 20 === 0) console.log('进度', done + '/' + jobs.length);
    }
  });
  await Promise.all(workers);
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.gif'));
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('完成：', files.length, '个文件', (bytes / 1048576).toFixed(1) + 'MB', '失败', fail);
})();
