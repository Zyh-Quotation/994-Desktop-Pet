// 生成 data/lore.json：每只宝可梦的图鉴小故事
// 输入（PokeAPI CSV）：
//   pokemon_species.csv           —— 栖息地 / 传说标记
//   pokemon_species_names.csv     —— 中文名、分类（如「种子宝可梦」）
//   pokemon_species_flavor_text.csv —— 各版本图鉴说明（取最新中文）
//   pokemon_habitats.csv          —— 栖息地英文名
//   pokemon.csv                   —— 身高(dm) / 体重(hg)
// 用法：CSV_DIR=/tmp/fndata node tools/build-lore.js

const fs = require('fs');
const path = require('path');

const CSV_DIR = process.env.CSV_DIR || path.join(__dirname, 'csv');
const OUT = path.join(__dirname, '..', 'data', 'lore.json');
const ZH_HANS = 12;
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
  const rows = parseCSV(fs.readFileSync(path.join(CSV_DIR, name + '.csv'), 'utf8'));
  const header = rows.shift();
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

// 栖息地英文 → 中文（顺带一句更口语的）
const HABITAT = {
  cave: ['洞窟', '阴凉的洞窟'],
  forest: ['森林', '树林里'],
  grassland: ['草原', '开阔的草地'],
  mountain: ['山地', '山地里'],
  rare: ['秘境', '人迹罕至的地方'],
  'rough-terrain': ['荒野', '崎岖的荒野'],
  sea: ['大海', '海里'],
  urban: ['城镇', '城镇的角落'],
  'waters-edge': ['水边', '河流湖泊边']
};

// 属性 → 栖息地（PokeAPI 的 habitat 字段基本是空的，这里按属性推断）
const TYPE_HABITAT = {
  水: ['水边', '河流湖泊边'],
  冰: ['山地', '寒冷的山地'],
  草: ['森林', '森林里'],
  虫: ['森林', '树林和草丛'],
  飞行: ['天空', '高处和天空'],
  岩石: ['山地', '山里'],
  地面: ['荒野', '干燥的荒野'],
  幽灵: ['洞窟', '阴暗的洞窟'],
  毒: ['荒野', '潮湿的角落'],
  火: ['山地', '温暖的地方'],
  电: ['城镇', '城镇附近'],
  钢: ['城镇', '城镇和工厂'],
  格斗: ['草原', '开阔的草地'],
  超能力: ['秘境', '安静的地方'],
  妖精: ['秘境', '花田附近'],
  龙: ['秘境', '人迹罕至的地方'],
  恶: ['洞窟', '阴暗处'],
  一般: ['草原', '草地']
};

// 属性 → 脾气 / 喜好
const TYPE_LIKE = {
  一般: '喜欢待在熟悉的地方，安安静静地待着',
  火: '喜欢温暖的地方，晒太阳时会舒服得眯起眼睛',
  水: '喜欢泡在水里，被水花溅到会很开心',
  电: '喜欢噼里啪啦放电，但很怕潮湿',
  草: '喜欢晒太阳，也喜欢新鲜的泥土味',
  冰: '喜欢凉凉的环境，大热天会没精神',
  格斗: '精力旺盛，喜欢找人比划两下',
  毒: '喜欢角落和奇怪的味道，不太受欢迎',
  地面: '喜欢干燥的沙土，最讨厌洗澡',
  飞行: '喜欢站在高处吹风，看到天空就想飞',
  超能力: '喜欢安静，被盯着看会让人心里发毛',
  虫: '喜欢躲在叶子和草丛里，一惊动就窜走',
  岩石: '喜欢硬邦邦的地方，趴着一动不动',
  幽灵: '喜欢黑暗，也喜欢悄悄捉弄人',
  龙: '喜欢耀武扬威地占住最高的地方',
  恶: '喜欢半夜活动，白天基本在打瞌睡',
  钢: '喜欢闪亮亮的金属，身体硬得很',
  妖精: '喜欢甜食和漂亮的东西，脾气有点任性'
};

function clean(text) {
  if (!text) return '';
  let t = String(text)
    .replace(/[\n\f\r]/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // 全角数字/字母转半角
  t = t.replace(/[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // 中文之间不该有空格（CSV 里是换行造成的）
  t = t.replace(/([\u4e00-\u9fa5\u3001\u3002\uff01\uff1f\uff0c\uff1b\uff1a])\s+(?=[\u4e00-\u9fa5\u3001\u3002\uff01\uff1f\uff0c\uff1b\uff1a\u201c\u201d\uff08\uff09])/g, '$1');
  t = t.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1');
  const m = t.match(/^[^。！？!?]{6,}[。！？!?]/);
  if (m && t.length > 110) t = m[0];
  if (t.length > 110) t = t.slice(0, 108) + '…';
  return t;
}

// ---------- 读表 ----------
const species = readTable('pokemon_species');
const names = readTable('pokemon_species_names');
const flavors = readTable('pokemon_species_flavor_text');
const pokes = readTable('pokemon');

const nameById = new Map();
for (const n of names) {
  if (Number(n.local_language_id) !== ZH_HANS) continue;
  nameById.set(Number(n.pokemon_species_id), { name: n.name, genus: n.genus });
}

// 每只取最新版本的中文说明，没有中文就退回英文
const flavorById = new Map();
for (const f of flavors) {
  const sid = Number(f.species_id);
  const lang = Number(f.language_id);
  const ver = Number(f.version_id) || 0;
  const text = clean(f.flavor_text);
  if (!text) continue;
  const cur = flavorById.get(sid);
  if (lang !== ZH_HANS) continue;
  const score = ver;
  if (!cur || score > cur.score) flavorById.set(sid, { text, score, zh: true });
}

const dimById = new Map();
for (const p of pokes) {
  if (String(p.is_default) !== '1') continue;
  dimById.set(Number(p.species_id), { h: Number(p.height) / 10, w: Number(p.weight) / 10 });
}

const dexPath = path.join(__dirname, '..', 'data', 'pokedex.json');
const dex = JSON.parse(fs.readFileSync(dexPath, 'utf8'));
const typesById = new Map(dex.species.map(s => [s.dex, s.types || []]));

// ---------- 组装 ----------
const out = {};
let withFlavor = 0, withZh = 0;
for (const s of species) {
  const id = Number(s.id);
  if (id < 1 || id > 1025) continue;
  const meta = nameById.get(id) || {};
  const types = typesById.get(id) || [];
  const hab = HABITAT[s.habitat_id]
    || TYPE_HABITAT[types.find(t => TYPE_HABITAT[t])]
    || (s.is_legendary === '1' || s.is_mythical === '1' ? ['秘境', '人迹罕至的地方'] : null);
  const f = flavorById.get(id);
  if (f) { withFlavor++; if (f.zh) withZh++; }
  const likeType = types.find(t => TYPE_LIKE[t]) || '一般';
  const dim = dimById.get(id) || {};

  out[id] = {
    genus: meta.genus || '',
    habitat: hab ? hab[0] : '',
    where: hab ? hab[1] : '',
    flavor: f ? f.text : '',
    h: dim.h || 0,
    w: dim.w || 0,
    likes: TYPE_LIKE[likeType],
    rare: s.is_mythical === '1' ? '幻兽' : s.is_legendary === '1' ? '传说' : ''
  };
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: Object.keys(out).length, lore: out }));
console.log(`写入 ${OUT}`);
console.log(`共 ${Object.keys(out).length} 只，有图鉴文字 ${withFlavor} 只（中文 ${withZh} 只）`);
console.log(`缺图鉴文字的：${Object.values(out).filter(x => !x.flavor).length} 只`);
