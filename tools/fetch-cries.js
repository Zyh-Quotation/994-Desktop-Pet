// 下载宝可梦叫声（PokeAPI/cries），保存到 assets/cries/{dex}.mp3|ogg
// 用法：node tools/fetch-cries.js [起始] [结束]
// 数据源：https://github.com/PokeAPI/cries （CC0 / 官方音效素材）

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'cries');
const BASE = 'https://cdn.jsdelivr.net/gh/PokeAPI/cries@main/cries/pokemon';
const CONCURRENCY = 6;
const TIMEOUT = 20000;

const from = Number(process.argv[2]) || 1;
const to = Number(process.argv[3]) || 1025;

fs.mkdirSync(OUT, { recursive: true });

function extOf(buf) {
  if (buf.length > 3 && buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg';
  if (buf.length > 1 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  if (buf.length > 3 && buf.slice(0, 3).toString('ascii') === 'ID3') return 'mp3';
  if (buf.length > 4 && buf.slice(0, 4).toString('ascii') === 'RIFF') return 'wav';
  return 'bin';
}

function exists(dex) {
  return ['mp3', 'ogg', 'wav'].some(e => fs.existsSync(path.join(OUT, `${dex}.${e}`)));
}

async function fetchOne(dex) {
  if (exists(dex)) return 'skip';
  for (const variant of ['latest', 'legacy']) {
    const url = `${BASE}/${variant}/${dex}.ogg`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
      if (!res.ok) { clearTimeout(timer); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);
      if (buf.length < 400) continue;
      const ext = extOf(buf);
      if (ext === 'bin') continue;
      fs.writeFileSync(path.join(OUT, `${dex}.${ext}`), buf);
      return 'ok';
    } catch (e) {
      clearTimeout(timer);
      continue;
    }
  }
  return 'fail';
}

(async () => {
  const list = [];
  for (let i = from; i <= to; i++) list.push(i);
  let ok = 0, skip = 0, fail = 0;
  const failed = [];
  const queue = list.slice();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const dex = queue.shift();
      const r = await fetchOne(dex);
      if (r === 'ok') ok++;
      else if (r === 'skip') skip++;
      else { fail++; failed.push(dex); }
      const done = ok + skip + fail;
      if (done % 100 === 0) console.log(`进度 ${done}/${list.length}（新下载 ${ok}，已存在 ${skip}，失败 ${fail}）`);
    }
  });
  await Promise.all(workers);
  console.log(`完成：新下载 ${ok}，跳过 ${skip}，失败 ${fail}`);
  if (failed.length) console.log('失败的编号:', failed.slice(0, 60).join(','), failed.length > 60 ? '...' : '');
})();
