// 给 data/signatures.json 补英文招式名 / 英文宝可梦名
// 输入：pokemon_species_names.csv、move_names.csv（PokeAPI CSV）
// 用法：CSV_DIR=/tmp/pokeapi-csv node tools/build-signatures-en.js
const fs = require('fs');
const path = require('path');

const CSV_DIR = process.env.CSV_DIR || path.join(__dirname, 'csv');
const FILE = path.join(__dirname, '..', 'data', 'signatures.json');
const EN = 9, ZH = 12;

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readTable(name) {
  const rows = parseCSV(fs.readFileSync(path.join(CSV_DIR, name + '.csv'), 'utf8'));
  const header = rows.shift();
  return rows.filter(r => r.length > 1).map(r => {
    const o = {}; header.forEach((h, i) => { o[h] = r[i]; }); return o;
  });
}

const moveNames = readTable('move_names');
const zhMove = new Map(), enMove = new Map();
for (const m of moveNames) {
  const id = Number(m.move_id), lang = Number(m.local_language_id);
  if (lang === ZH) zhMove.set(m.name, id);
  if (lang === EN) enMove.set(id, m.name);
}
const speciesNames = readTable('pokemon_species_names');
const enSpecies = new Map();
for (const s of speciesNames) {
  if (Number(s.local_language_id) === EN) enSpecies.set(Number(s.pokemon_species_id), s.name);
}

const sig = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let moved = 0, missing = [];
for (const [dex, rec] of Object.entries(sig)) {
  const id = zhMove.get(rec.move);
  if (id && enMove.has(id)) { rec.moveEn = enMove.get(id); moved++; }
  else { rec.moveEn = ''; missing.push(`${dex}:${rec.move}`); }
  rec.nameEn = enSpecies.get(Number(dex)) || '';
}
fs.writeFileSync(FILE, JSON.stringify(sig));
console.log(`英文招式 ${moved} / ${Object.keys(sig).length}`);
if (missing.length) console.log('未匹配：', missing.slice(0, 20).join(', '), missing.length > 20 ? `…共 ${missing.length}` : '');
