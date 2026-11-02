/*
 * 下载 1025 只宝可梦的精灵图（普通 + 异色）
 *
 * 1-649 用 PokeAPI 的黑白动画 GIF；650-1025 用 Pokémon Showdown 的动画图，
 * Showdown 没有的（部分第九世代）回退到 PokeAPI 静态图。
 * 用法：node tools/fetch-sprites.js
 */
const fs = require('fs');
const path = require('path');

const OUT = process.env.OUT || __dirname + '/../assets/pokemon';
const CSV = process.env.CSV_DIR ? process.env.CSV_DIR + '/pokemon.csv' : __dirname + '/csv/pokemon.csv';

const rows = fs.readFileSync(CSV, 'utf8').split('\n').slice(1);
const ident = new Map();
for (const line of rows) {
  const p = line.split(',');
  if (p.length < 8) continue;
  if (p[7] === '1') ident.set(Number(p[2]), p[1]);
}

const JSD = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon';
const ANI = JSD + '/versions/generation-v/black-white/animated';
const SD = 'https://play.pokemonshowdown.com/sprites';

function good(p) {
  try { return fs.statSync(p).size > 1000; } catch (_) { return false; }
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
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function one(dex) {
  const name = ident.get(dex) || String(dex);
  const bare = name.replace(/-/g, '');
  const normal = path.join(OUT, dex + '.gif');
  const shiny = path.join(OUT, dex + '-shiny.gif');

  const normalUrls = dex <= 649
    ? [ANI + '/' + dex + '.gif']
    : [SD + '/ani/' + name + '.gif', SD + '/ani/' + bare + '.gif', JSD + '/' + dex + '.png'];

  const shinyUrls = dex <= 649
    ? [ANI + '/shiny/' + dex + '.gif']
    : [SD + '/ani-shiny/' + name + '.gif', SD + '/ani-shiny/' + bare + '.gif', JSD + '/shiny/' + dex + '.png'];

  const res = [];
  for (const [dest, urls] of [[normal, normalUrls], [shiny, shinyUrls]]) {
    if (good(dest)) { res.push('skip'); continue; }
    let ok = false;
    for (const u of urls) { if (await grab(u, dest)) { ok = true; break; } }
    res.push(ok ? 'ok' : 'FAIL');
  }
  return { dex, name, res };
}

(async () => {
  const queue = [];
  for (let d = 1; d <= 1025; d++) queue.push(d);

  let done = 0;
  const failed = [];

  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const d = queue.shift();
      const r = await one(d);
      done++;
      if (r.res.includes('FAIL')) failed.push(r);
      if (done % 100 === 0) console.log('进度 ' + done + '/1025  已用文件 ' + fs.readdirSync(OUT).length);
    }
  });
  await Promise.all(workers);

  console.log('完成，失败:', failed.length);
  for (const f of failed.slice(0, 30)) console.log('  ' + f.dex + ' ' + f.name + ' ' + f.res.join('/'));
  const files = fs.readdirSync(OUT).filter(f => /\.(gif|png)$/.test(f));
  let bytes = 0;
  for (const f of files) bytes += fs.statSync(path.join(OUT, f)).size;
  console.log('文件数:', files.length, '大小:', (bytes / 1048576).toFixed(1) + 'MB');
})();
