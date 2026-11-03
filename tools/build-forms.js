/*
 * 生成超级进化 / 超极巨化的形态表：data/forms.json
 * 数据源：PokeAPI CSV（pokemon_forms / pokemon / form_names / types）
 * 用法：CSV_DIR=/path/to/csv node tools/build-forms.js
 */
const fs = require('fs');
const path = require('path');
const CSV = process.env.CSV_DIR || path.join(__dirname, 'csv');
const read = f => fs.readFileSync(path.join(CSV, f), 'utf8').replace(/\r/g, '').trim().split('\n');
const rows = f => {
  const lines = read(f), head = lines.shift().split(',');
  return lines.map(l => { const p = l.split(','); const o = {}; head.forEach((h, i) => o[h] = p[i] ?? ''); return o; });
};
const pokemon = new Map(rows('pokemon.csv').map(r => [r.id, r]));
const forms = rows('pokemon_forms.csv');
const names = rows('pokemon_form_names.csv');
const ptypes = rows('pokemon_types.csv');

const TYPE_ZH = {
  normal: '一般', fighting: '格斗', flying: '飞行', poison: '毒', ground: '地面',
  rock: '岩石', bug: '虫', ghost: '幽灵', steel: '钢', fire: '火', water: '水',
  grass: '草', electric: '电', psychic: '超能力', ice: '冰', dragon: '龙',
  dark: '恶', fairy: '妖精'
};
const dex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'pokedex.json'), 'utf8')).species;
const baseByDex = new Map(dex.map(s => [Number(s.dex), s]));
const nameMap = new Map();
for (const n of names) {
  if (!['9', '12'].includes(n.local_language_id)) continue;
  const cur = nameMap.get(n.pokemon_form_id) || {};
  cur[n.local_language_id] = n.pokemon_name || n.form_name || '';
  nameMap.set(n.pokemon_form_id, cur);
}
const typesByPokemon = new Map();
for (const t of ptypes) {
  if (!typesByPokemon.has(t.pokemon_id)) typesByPokemon.set(t.pokemon_id, []);
  typesByPokemon.get(t.pokemon_id).push({ slot: Number(t.slot), type: t.type_id });
}
const typeId = new Map(rows('types.csv').map(r => [r.id, r.identifier]));

const clean = s => String(s || '')
  .replace(/Ｘ/g, 'X').replace(/Ｙ/g, 'Y').replace(/Ｚ/g, 'Z')
  .replace(/\s+/g, ' ').trim();

function suffixOf(identifier) {
  const m = identifier.match(/-(mega(?:-[xyz])?|gmax)$/);
  if (!m) return '';
  return m[1].replace(/-/g, '');
}
const out = {};
let count = 0;
for (const f of forms) {
  const kind = f.is_mega === '1' ? 'mega' : f.form_identifier === 'gmax' ? 'gmax' : '';
  if (!kind) continue;
  const p = pokemon.get(f.pokemon_id);
  if (!p) continue;
  const d = Number(p.species_id), base = baseByDex.get(d);
  if (!base) continue;
  const nm = nameMap.get(f.id) || {};
  const suffix = suffixOf(f.identifier);
  const styleEn = f.identifier.includes('single-strike') ? ' (Single Strike)' : f.identifier.includes('rapid-strike') ? ' (Rapid Strike)' : '';
  let name = clean(nm['9']);
  if (!name) name = kind === 'gmax' ? `Gigantamax ${base.name}${styleEn}` : `Mega ${base.name} ${suffix.replace('mega', '')}`.trim();
  else if (kind === 'gmax' && styleEn && !name.includes('Single') && !name.includes('Rapid')) name += styleEn;
  let nameZh = clean(nm['12']);
  if (!nameZh) {
    const extra = f.identifier.includes('single-strike') ? '（一击流）' : f.identifier.includes('rapid-strike') ? '（连击流）' : '';
    nameZh = kind === 'gmax' ? `超极巨化${base.name}${extra}` : `超级${base.name}${suffix.replace('mega', '').toUpperCase()}`;
  }
  const types = (typesByPokemon.get(f.pokemon_id) || [])
    .sort((a, b) => a.slot - b.slot)
    .map(t => TYPE_ZH[typeId.get(t.type)]).filter(Boolean);
  if (!types.length) types.push(...base.types);
  const baseIdent = [...pokemon.values()].find(p => Number(p.species_id) === d && p.is_default === '1')?.identifier || '';
  const token = baseIdent && f.identifier.startsWith(baseIdent + '-')
    ? f.identifier.slice(baseIdent.length + 1)
    : f.identifier;
  const file = `${d}-${token}`;
  const entry = { kind, file, name, nameZh, types, sprite: f.identifier, formId: Number(f.pokemon_id) };
  if (!out[d]) out[d] = { mega: [], gmax: [] };
  if (out[d][kind].some(x => x.file === file)) continue;
  out[d][kind].push(entry);
  count++;
}
const cleanOut = {};
for (const d of Object.keys(out).map(Number).sort((a, b) => a - b)) {
  const v = out[d];
  cleanOut[d] = { mega: v.mega, gmax: v.gmax };
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'forms.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  count,
  forms: cleanOut
}, null, 2) + '\n');
console.log('forms:', count, 'species:', Object.keys(cleanOut).length);
for (const [d, v] of Object.entries(cleanOut)) {
  for (const f of [...v.mega, ...v.gmax]) console.log(d, f.kind, f.name, '|', f.nameZh, '|', f.file, '|', f.types.join(','));
}
