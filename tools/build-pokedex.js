/*
 * 生成 data/pokedex.json（全国图鉴 001-1025）
 *
 * 数据来自 PokeAPI 的 CSV 数据集（pokeapi/data/v2/csv），需先下载到 tools/csv/：
 *   pokemon_species.csv  pokemon_species_names.csv  pokemon.csv  pokemon_types.csv
 *   type_names.csv  pokemon_evolution.csv  evolution_triggers.csv  item_names.csv
 * 用法：node tools/build-pokedex.js
 */
const fs = require('fs');
const path = require('path');
const DIR = process.env.CSV_DIR || __dirname + '/csv';

// 极简 CSV 解析（支持引号包裹）
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

function readTable(name) {
  const rows = parseCSV(fs.readFileSync(path.join(DIR, name + '.csv'), 'utf8'));
  const header = rows.shift();
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

const speciesRows = readTable('pokemon_species');
const speciesNames = readTable('pokemon_species_names');
const pokemonRows = readTable('pokemon');
const typeRows = readTable('pokemon_types');
const typeNames = readTable('type_names');
const evoRows = readTable('pokemon_evolution');
const itemNames = readTable('item_names');

const zhName = new Map();
for (const r of speciesNames) if (r.local_language_id === '12') zhName.set(Number(r.pokemon_species_id), r.name);

const typeZh = new Map();
for (const r of typeNames) if (r.local_language_id === '12') typeZh.set(Number(r.type_id), r.name);

const itemZh = new Map();
for (const r of itemNames) if (r.local_language_id === '12') itemZh.set(Number(r.item_id), r.name);

const pokeBySpecies = new Map();
for (const p of pokemonRows) if (p.is_default === '1') pokeBySpecies.set(Number(p.species_id), Number(p.id));

const typesByPoke = new Map();
for (const t of typeRows) {
  const pid = Number(t.pokemon_id);
  if (!typesByPoke.has(pid)) typesByPoke.set(pid, []);
  typesByPoke.get(pid).push({ slot: Number(t.slot), name: typeZh.get(Number(t.type_id)) || String(t.type_id) });
}

const evoBySpecies = new Map();
for (const e of evoRows) {
  if (e.is_default !== '1') continue;
  const sid = Number(e.evolved_species_id);
  if (!evoBySpecies.has(sid)) evoBySpecies.set(sid, e);
}

function itemName(id) {
  if (!id) return null;
  return itemZh.get(Number(id)) || null;
}

function howText(e) {
  if (!e) return '';
  const trig = e.evolution_trigger_id;
  const item = itemName(e.trigger_item_id);
  const bits = [];

  if (trig === '3') bits.push(item || '道具');
  else if (trig === '2') {
    bits.push('通信');
    if (item) bits.push('携带' + item);
    if (e.trade_species_id) bits.push('交换');
  } else if (trig === '4') bits.push('特殊条件');
  else {
    if (e.minimum_level) bits.push('Lv.' + e.minimum_level);
    if (item) bits.push(item);
    if (e.minimum_happiness) bits.push('亲密度');
    if (e.time_of_day) bits.push(e.time_of_day === 'day' ? '白天' : '夜晚');
    if (e.held_item_id) bits.push('携带' + (itemName(e.held_item_id) || '道具'));
    if (e.known_move_id) bits.push('学会特定招式');
    if (e.known_move_type_id) bits.push('掌握属性招式');
    if (e.location_id) bits.push('特殊地点');
    if (e.needs_overworld_rain === '1') bits.push('下雨');
    if (e.turn_upside_down === '1') bits.push('倒置');
    if (e.relative_physical_stats) bits.push(Number(e.relative_physical_stats) > 0 ? '攻击>防御' : '攻击<防御');
    if (e.minimum_beauty) bits.push('美丽度');
    if (e.minimum_affection) bits.push('友好度');
  }
  return bits.join('·') || '特殊条件';
}

const species = [];
const byDex = new Map();

for (const s of speciesRows) {
  const dex = Number(s.id);
  if (!dex || dex > 1025) continue;

  const pokeId = pokeBySpecies.get(dex);
  const types = (typesByPoke.get(pokeId) || []).sort((a, b) => a.slot - b.slot).map(t => t.name);
  const from = s.evolves_from_species_id ? Number(s.evolves_from_species_id) : null;
  const evo = evoBySpecies.get(dex);

  const item = {
    dex,
    name: zhName.get(dex) || s.identifier,
    types,
    gen: Number(s.generation_id),
    chain: Number(s.evolution_chain_id) || 0,
    legend: s.is_legendary === '1',
    myth: s.is_mythical === '1',
    from,
    how: from ? howText(evo) : ''
  };
  species.push(item);
  byDex.set(dex, item);
}

// 按进化链分组 → BFS 分层
const chainsMap = new Map();
for (const sp of species) {
  if (!sp.chain) continue;
  if (!chainsMap.has(sp.chain)) chainsMap.set(sp.chain, []);
  chainsMap.get(sp.chain).push(sp);
}

const chains = [];
for (const [id, members] of chainsMap) {
  const childrenOf = new Map();
  for (const m of members) {
    if (m.from == null) continue;
    if (!childrenOf.has(m.from)) childrenOf.set(m.from, []);
    childrenOf.get(m.from).push(m);
  }
  const roots = members.filter(m => m.from == null || !byDex.has(m.from)).map(m => m.dex);
  if (!roots.length) continue;

  const stages = [];
  const hows = [];
  let level = roots.slice();

  while (level.length) {
    stages.push(level.slice());
    const next = [];
    const conds = new Set();
    for (const d of level) {
      for (const child of (childrenOf.get(d) || [])) {
        if (next.includes(child.dex)) continue;
        next.push(child.dex);
        if (child.how) conds.add(child.how);
      }
    }
    if (!next.length) break;
    hows.push([...conds].slice(0, 3).join(' / ') || '进化');
    level = next;
  }

  chains.push({ id, stages, hows });
}

// 单只成链的也保留（传说/无进化）
const chainIdsWithMulti = new Set(chains.map(c => c.id));
const singles = species.filter(sp => !chainIdsWithMulti.has(sp.chain) || sp.chain === 0);

const out = {
  generatedAt: new Date().toISOString(),
  count: species.length,
  species,
  chains
};

fs.writeFileSync(process.env.OUT_JSON || __dirname + '/../data/pokedex.json', JSON.stringify(out));
console.log('物种数:', species.length, '进化链数:', chains.length);
console.log('缺中文名的:', species.filter(s => !zhName.has(s.dex)).length);
console.log('缺属性的:', species.filter(s => !s.types.length).length);
console.log('样例:', JSON.stringify(species.find(s => s.dex === 384)), JSON.stringify(chains.find(c => c.stages.flat().includes(1))));
console.log('传说/幻兽:', species.filter(s => s.legend || s.myth).length);
console.log('已写入 pokedex.json');
