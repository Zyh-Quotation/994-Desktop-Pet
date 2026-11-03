// 给 data/lore.json 补英文：分类 / 图鉴说明 / 栖息地 / 喜好 / 传说标记
// 输入（PokeAPI CSV，默认 tools/csv，也可 CSV_DIR=/path）：
//   pokemon_species.csv / pokemon_species_names.csv /
//   pokemon_species_flavor_text.csv / pokemon_habitats.csv / pokemon.csv
// 用法：CSV_DIR=/tmp/pokeapi-csv node tools/build-lore-en.js
const fs = require('fs');
const path = require('path');

const CSV_DIR = process.env.CSV_DIR || path.join(__dirname, 'csv');
const LORE_FILE = path.join(__dirname, '..', 'data', 'lore.json');
const POKEDEX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'pokedex.json'), 'utf8'));
const EN = 9;

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
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
  const file = path.join(CSV_DIR, name + '.csv');
  if (!fs.existsSync(file)) throw new Error('找不到 ' + file);
  const rows = parseCSV(fs.readFileSync(file, 'utf8'));
  const header = rows.shift();
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

const HABITAT = {
  cave: ['caves', 'in caves'],
  forest: ['forests', 'in forests'],
  grassland: ['grasslands', 'on open grasslands'],
  mountain: ['mountains', 'in the mountains'],
  rare: ['rare places', 'in remote places'],
  'rough-terrain': ['rough terrain', 'on rough terrain'],
  sea: ['the sea', 'out at sea'],
  urban: ['towns', 'around towns'],
  'waters-edge': ['watersides', 'by the water']
};
const TYPE_HABITAT = {
  Water: ['watersides', 'by rivers and lakes'], Ice: ['cold mountains', 'in cold mountains'],
  Grass: ['forests', 'in forests'], Bug: ['grasslands', 'among grass and leaves'],
  Flying: ['high places', 'high up in the sky'], Rock: ['mountains', 'in the mountains'],
  Ground: ['dry badlands', 'in dry badlands'], Ghost: ['dark caves', 'in dark caves'],
  Poison: ['damp corners', 'in damp corners'], Fire: ['warm places', 'somewhere warm'],
  Electric: ['towns', 'near towns'], Steel: ['towns and factories', 'near towns and factories'],
  Fighting: ['open grasslands', 'on open grasslands'], Psychic: ['quiet places', 'somewhere quiet'],
  Fairy: ['flower fields', 'near flower fields'], Dragon: ['remote places', 'in remote places'],
  Dark: ['shadowy caves', 'in shadowy caves'], Normal: ['grasslands', 'on quiet grasslands']
};
const TYPE_LIKE = {
  Normal: 'familiar places and quiet afternoons',
  Fire: 'warm spots and sunbathing',
  Water: 'soaking in water and splashing about',
  Electric: 'crackling with static, though it hates damp',
  Grass: 'sunshine and the smell of fresh soil',
  Ice: 'cool places, and wilts in the heat',
  Fighting: 'a good sparring match',
  Poison: 'odd corners and stranger smells',
  Ground: 'dry sand and dust, and hates baths',
  Flying: 'high perches and open skies',
  Psychic: 'quiet spots and watching people',
  Bug: 'leaves and tall grass to hide in',
  Rock: 'hard ground and staying perfectly still',
  Ghost: 'darkness and playing quiet pranks',
  Dragon: 'the highest perch it can find',
  Dark: 'late nights, and naps during the day',
  Steel: 'shiny metal and solid ground',
  Fairy: 'sweets and pretty, sparkling things'
};
const TYPE_EN = {
  一般: 'Normal', 火: 'Fire', 水: 'Water', 电: 'Electric', 草: 'Grass', 冰: 'Ice',
  格斗: 'Fighting', 毒: 'Poison', 地面: 'Ground', 飞行: 'Flying', 超能力: 'Psychic',
  虫: 'Bug', 岩石: 'Rock', 幽灵: 'Ghost', 龙: 'Dragon', 恶: 'Dark', 钢: 'Steel', 妖精: 'Fairy'
};

function clean(text) {
  if (!text) return '';
  let t = String(text).replace(/[\n\f\r]+/g, ' ').replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
  // 全角标点/字母数字转半角
  t = t.replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  // 最多保留 2 句 / 230 字符，避免截断在单词中间
  const sentences = t.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [t];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).trim().length > 230) break;
    out += s;
  }
  out = out.trim() || t;
  if (out.length > 230) {
    out = out.slice(0, 227);
    const cut = out.lastIndexOf(' ');
    out = (cut > 160 ? out.slice(0, cut) : out).replace(/[,;:\s]+$/, '') + '…';
  }
  return out;
}

const species = readTable('pokemon_species');
const names = readTable('pokemon_species_names');
const flavors = readTable('pokemon_species_flavor_text');
const habitats = readTable('pokemon_habitats');
const pokes = readTable('pokemon');

const habitatById = new Map(habitats.map(h => [Number(h.id), h.identifier]));
const nameById = new Map();
for (const n of names) {
  if (Number(n.local_language_id) !== EN) continue;
  nameById.set(Number(n.pokemon_species_id), { name: n.name, genus: n.genus });
}

// 每个物种取版本号最大的英文说明
const flavorById = new Map();
for (const f of flavors) {
  if (Number(f.language_id) !== EN) continue;
  const sid = Number(f.species_id), ver = Number(f.version_id) || 0;
  const text = clean(f.flavor_text);
  if (!text) continue;
  const cur = flavorById.get(sid);
  if (!cur || ver >= cur.ver) flavorById.set(sid, { text, ver });
}

const dimById = new Map();
for (const p of pokes) {
  if (String(p.is_default) !== '1') continue;
  dimById.set(Number(p.species_id), { h: Number(p.height) / 10, w: Number(p.weight) / 10 });
}

const typesById = new Map(POKEDEX.species.map(s => [s.dex, s.types || []]));
const lore = JSON.parse(fs.readFileSync(LORE_FILE, 'utf8'));
let flavored = 0;

for (const s of species) {
  const id = Number(s.id);
  if (id < 1 || id > 1025) continue;
  const rec = lore.lore[id];
  if (!rec) continue;
  const meta = nameById.get(id) || {};
  const types = typesById.get(id) || [];
  const typeEn = TYPE_EN[types[0]] || 'Normal';
  const hab = HABITAT[habitatById.get(Number(s.habitat_id))]
    || TYPE_HABITAT[types.map(t => TYPE_EN[t]).find(t => TYPE_HABITAT[t])]
    || (s.is_legendary === '1' || s.is_mythical === '1' ? ['rare places', 'in remote places'] : ['grasslands', 'on quiet grasslands']);
  const flavor = flavorById.get(id);
  if (flavor) flavored++;
  const dim = dimById.get(id) || {};
  Object.assign(rec, {
    nameEn: meta.name || (POKEDEX.species.find(x => x.dex === id) || {}).nameEn || '',
    genusEn: meta.genus || `${typeEn} Pokémon`,
    habitatEn: hab[0],
    whereEn: hab[1],
    flavorEn: flavor ? flavor.text : '',
    likesEn: TYPE_LIKE[typeEn] || TYPE_LIKE.Normal,
    rareEn: s.is_mythical === '1' ? 'Mythical' : s.is_legendary === '1' ? 'Legendary' : '',
    h: dim.h || rec.h || 0,
    w: dim.w || rec.w || 0
  });
}

fs.writeFileSync(LORE_FILE, JSON.stringify(lore));
console.log(`已写入 ${LORE_FILE}`);
console.log(`英文图鉴说明 ${flavored} / 1025 只`);
