/*
 * 生成 data/names-en.json（全国图鉴 001-1025 的英文名）
 *
 * 数据来自 PokeAPI 的 CSV 数据集（pokeapi/data/v2/csv），需先下载：
 *   tools/csv/pokemon_species_names.csv
 * 用法：node tools/build-names-en.js
 *
 * 输出格式：{ "1": "Bulbasaur", "25": "Pikachu", ... }
 */
const fs = require('fs');
const path = require('path');

const CSV = process.env.CSV_DIR || path.join(__dirname, 'csv');

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const file = path.join(CSV, 'pokemon_species_names.csv');
if (!fs.existsSync(file)) {
  console.error('缺少 ' + file + '（从 PokeAPI 的 data/v2/csv 下载后放进 tools/csv/）');
  process.exit(1);
}

const rows = parseCSV(fs.readFileSync(file, 'utf8'));
const out = {};
for (const [sid, lang, name] of rows) {
  if (lang !== '9') continue;            // 9 = English
  const dex = Number(sid);
  if (!Number.isInteger(dex) || dex < 1 || dex > 1025) continue;
  if (name) out[dex] = name;
}

const missing = [];
for (let d = 1; d <= 1025; d++) if (!out[d]) missing.push(d);
if (missing.length) {
  console.error('缺少编号：' + missing.join(', '));
  process.exit(1);
}

const sorted = {};
for (const d of Object.keys(out).map(Number).sort((a, b) => a - b)) sorted[d] = out[d];
const dest = path.join(__dirname, '..', 'data', 'names-en.json');
fs.writeFileSync(dest, JSON.stringify(sorted));
console.log('✅ 已写入 ' + dest + '（' + Object.keys(sorted).length + ' 只，' + fs.statSync(dest).size + ' 字节）');
