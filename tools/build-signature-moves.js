#!/usr/bin/env node
/**
 * 生成 tools/signature-moves.json —— 1025 只宝可梦的专属招式
 *
 * 数据来自 PokeAPI 的 CSV 数据集（首次运行自动下载到 tools/.cache/）：
 *   - moves.csv / move_names.csv      招式属性、威力、中文名
 *   - pokemon_moves.csv               每只宝可梦能学哪些招（含学习方式与等级）
 *
 * 挑选规则（对每只宝可梦）：
 *   1. 候选按等级分堆：本系升级招 → 本系招 → 任意攻击招 → 本系变化招 → 任意变化招
 *   2. 只取有视觉表现的攻击招（物理/特殊、威力 ≥ 40），除非这只根本没有
 *   3. 威力上限跟着进化阶段走：幼年 60 / 中间 95 / 最终 150
 *      —— 所以妙蛙种子是藤鞭，水箭龟才是加农水炮
 *   4. 同分时看：主属性 > 升级学会 > 威力 > 全局未使用过
 *   5. 最后做一轮去重，把撞车的换成同档里没被用过的招
 *
 * 人工精修写在 MANUAL 里（直接覆盖），改完重跑即可。
 *
 * 用法：node tools/build-signature-moves.js [--force]
 *   默认不覆盖已有文件（避免冲掉手工调整），加 --force 强制重算。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const OUT = path.join(__dirname, 'signature-moves.json');
const FORCE = process.argv.includes('--force');

if (fs.existsSync(OUT) && !FORCE) {
  console.log('signature-moves.json 已存在，跳过。要重算请加 --force');
  process.exit(0);
}

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const FILES = ['moves', 'move_names', 'pokemon_moves', 'type_names'];

function download(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name + '.csv');
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const go = url => https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return go(res.headers.location);
      if (res.statusCode !== 200) return reject(new Error(name + ' HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { fs.writeFileSync(file, Buffer.concat(chunks)); resolve(); });
    }).on('error', reject);
    go(BASE + name + '.csv');
  }).then(() => console.log('  ↓ ' + name + '.csv'));
}

const lines = f => fs.readFileSync(path.join(CACHE, f + '.csv'), 'utf8').split('\n').filter(Boolean);
const rows = f => {
  const l = lines(f), h = l[0].split(',');
  return l.slice(1).map(s => { const c = s.split(','); const o = {}; h.forEach((k, i) => o[k] = c[i]); return o; });
};

// 历代精修：dex → 招牌招式（原作手写的那批，优先于算法）
const CURATED = {
  1: "藤鞭",
  2: "飞叶快刀",
  3: "花瓣舞",
  6: "喷射火焰",
  9: "加农水炮",
  12: "麻痹粉",
  15: "双针",
  18: "暴风",
  19: "电光一闪",
  20: "必杀门牙",
  24: "大蛇瞪眼",
  25: "十万伏特",
  26: "打雷",
  28: "挖洞",
  31: "泰山压顶",
  34: "超级角击",
  35: "挥指",
  36: "月亮之力",
  38: "大字爆炎",
  39: "唱歌",
  42: "吸血",
  45: "花瓣舞",
  50: "挖洞",
  51: "地震",
  52: "聚宝功",
  54: "念力",
  55: "水炮",
  57: "愤怒",
  59: "神速",
  62: "泡沫光线",
  63: "瞬间移动",
  65: "精神强念",
  68: "爆裂拳",
  71: "溶解液",
  73: "水炮",
  76: "地震",
  78: "闪焰冲锋",
  79: "哈欠",
  80: "意念头锤",
  82: "放电",
  85: "三重攻击",
  87: "冰冻光束",
  89: "污泥攻击",
  91: "冰锥",
  92: "舔舌头",
  93: "黑夜魔影",
  94: "影子球",
  95: "岩崩",
  97: "食梦",
  99: "断头钳",
  100: "电磁炮",
  101: "大爆炸",
  103: "飞叶风暴",
  105: "骨棒乱打",
  107: "音速拳",
  110: "污泥攻击",
  112: "角钻",
  113: "生蛋",
  115: "迷昏拳",
  121: "水炮",
  123: "连斩",
  124: "暴风雪",
  125: "雷电拳",
  126: "火焰拳",
  127: "夹紧",
  128: "舍身冲撞",
  129: "水溅跃",
  130: "破坏光线",
  131: "冰冻光束",
  132: "变身",
  133: "撞击",
  134: "水炮",
  135: "打雷",
  136: "喷射火焰",
  137: "三重攻击",
  142: "岩崩",
  143: "睡觉",
  144: "暴风雪",
  145: "打雷",
  146: "热风",
  147: "龙卷风",
  148: "龙之舞",
  149: "逆鳞",
  150: "精神击破",
  151: "变身",
  152: "藤鞭",
  155: "火花",
  158: "水枪",
  160: "水炮",
  169: "空气斩",
  175: "挥指",
  181: "电磁炮",
  183: "水枪",
  196: "精神强念",
  197: "恶之波动",
  212: "子弹拳",
  214: "超级角击",
  215: "冰砾",
  227: "钢之翼",
  230: "龙之波动",
  248: "岩崩",
  249: "神鸟猛击",
  250: "神圣之火",
  251: "时光咆哮",
  254: "飞叶风暴",
  257: "火焰踢",
  260: "地震",
  282: "月亮之力",
  302: "黑夜魔影",
  306: "铁头",
  330: "龙息",
  334: "龙之波动",
  350: "水炮",
  359: "暗袭要害",
  373: "龙之俯冲",
  376: "彗星拳",
  380: "薄雾球",
  381: "洁净光芒",
  384: "画龙点睛",
  385: "祈愿",
  386: "精神突进",
  445: "龙之俯冲",
  448: "波导弹",
  450: "地震",
  461: "冰砾",
  468: "空气斩",
  471: "冰冻光束",
  472: "空气斩",
  483: "时间咆哮",
  484: "亚空裂斩",
  487: "暗影潜袭",
  491: "暗黑洞",
  493: "制裁光砾",
  494: "火焰弹",
  495: "藤鞭",
  497: "飞叶风暴",
  498: "火花",
  500: "火焰踢",
  501: "水枪",
  503: "贝壳刃",
  530: "地震",
  571: "暗夜爆破",
  609: "烈焰溅射",
  612: "龙之俯冲",
  635: "龙之波动",
  637: "火焰之舞",
  643: "青焰",
  644: "雷击",
  646: "冰封世界",
  649: "科技爆破",
  655: "魔法火焰",
  658: "飞水手里剑",
  663: "勇鸟猛攻",
  681: "王者盾牌",
  700: "月亮之力",
  715: "爆音波",
  717: "死亡之翼",
  718: "千箭齐发",
  719: "钻石风暴",
  745: "岩崩",
  748: "毒菱",
  778: "嬉闹",
  784: "鳞片噪音",
  791: "日光回旋",
  792: "月华飞坠",
  800: "光子喷涌",
  807: "等离子闪电拳",
  815: "火焰球",
  818: "狙击",
  858: "魔法闪耀",
  869: "装饰",
  887: "龙箭",
  890: "极巨炮",
  898: "星碎",
  908: "千变万花",
  911: "闪焰高歌",
  914: "流水旋舞",
  936: "铠甲炮",
  937: "悔念剑",
  1007: "断崖之剑",
  1008: "闪电猛冲"
};

// 人工精修：dex → 招式中文名
const MANUAL = {
  10: '吐丝', 11: '变硬', 13: '毒针', 14: '铁壁', 204: '自爆',
  265: '吐丝', 266: '变硬', 268: '铁壁', 664: '吐丝', 251: '预知未来'
};
// 旧译名 → 官方译名
const ALIAS = {
  '舔舌头': '舌舔', '影子球': '暗影球', '夹紧': '夹住', '水溅跃': '跃起',
  '钢之翼': '钢翼', '时间咆哮': '时光咆哮', '暗夜爆破': '暗黑爆破',
  '火焰之舞': '火之舞', '科技爆破': '高科技光炮', '日光回旋': '流星闪冲',
  '月华飞坠': '暗影之光', '铠甲炮': '铠农炮'
};

(async () => {
  for (const f of FILES) await download(f);

  const moves = new Map(rows('moves').map(r => [+r.id, r]));
  const zh = new Map(rows('move_names').filter(r => r.local_language_id === '12').map(r => [+r.move_id, r.name]));
  const zhToId = new Map();
  for (const [id, n] of zh) if (!zhToId.has(n)) zhToId.set(n, id);
  const ty = new Map(rows('type_names').filter(r => r.local_language_id === '12').map(r => [+r.type_id, r.name]));

  const dexJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pokedex.json'), 'utf8'));
  const species = dexJson.species;
  const typesOf = new Map(species.map(s => [s.dex, s.types]));
  const chainPos = new Map();
  dexJson.chains.forEach(c => c.stages.forEach((st, i) => chainPos.set(st[0], { i, n: c.stages.length })));

  // pokemon → move → { lv, methods }
  const pm = new Map();
  for (const r of rows('pokemon_moves')) {
    const p = +r.pokemon_id;
    if (p < 1 || p > 1025) continue;
    if (!pm.has(p)) pm.set(p, new Map());
    const m = +r.move_id, lv = +r.level || 0;
    const e = pm.get(p).get(m) || { lv: 0, methods: new Set() };
    e.lv = Math.max(e.lv, lv);
    e.methods.add(+r.pokemon_move_method_id);
    pm.get(p).set(m, e);
  }
  const users = new Map();
  for (const r of rows('pokemon_moves')) {
    const m = +r.move_id, p = +r.pokemon_id;
    if (!users.has(m)) users.set(m, new Set());
    users.get(m).add(p);
  }
  const scarcity = m => users.has(m) ? users.get(m).size : 999;

  function build(dex) {
    const ent = pm.get(dex) || new Map();
    const tys = typesOf.get(dex) || [];
    const primary = (tys[0] === '一般' && tys[1]) ? tys[1] : (tys[0] || '一般');
    const pos = chainPos.get(dex) || { i: 0, n: 1 };
    const cap = pos.n === 1 ? 150 : (pos.i === pos.n - 1 ? 150 : (pos.i === 0 ? 60 : 95));
    const T = { ownLv: [], own: [], anyAtk: [], ownStat: [], anyStat: [] };
    for (const [m, e] of ent) {
      const mv = moves.get(m);
      if (!mv || !zh.has(m)) continue;
      const dc = +mv.damage_class_id, pw = +mv.power || 0;
      const mt = ty.get(+mv.type_id);
      const own = tys.includes(mt);
      const o = { m, pw, mt, dc, lv: e.lv, own, lvUp: e.methods.has(1), sc: scarcity(m), main: mt === primary };
      if (dc === 2 || dc === 3) {
        if (pw < 40) continue;
        if (own && o.lvUp) T.ownLv.push(o);
        else if (own) T.own.push(o);
        else T.anyAtk.push(o);
      } else {
        (own ? T.ownStat : T.anyStat).push(o);
      }
    }
    for (const k of Object.keys(T)) {
      T[k].sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || b.pw - a.pw || a.sc - b.sc || b.lv - a.lv);
    }
    return { T, cap };
  }

  const dexList = [...pm.keys()].filter(d => d <= 1025).sort((a, b) => a - b);
  const C = new Map();
  dexList.forEach(d => C.set(d, build(d)));
  const poolOf = dex => {
    const { T, cap } = C.get(dex);
    for (const k of ['ownLv', 'own', 'anyAtk', 'ownStat', 'anyStat']) {
      const all = T[k];
      if (!all.length) continue;
      const ok = all.filter(o => o.pw <= cap + 10);
      return ok.length ? ok : all;
    }
    return [];
  };

  const alloc = new Map(), used = new Map();
  // 1) 历代精修先占位
  for (const [d, name] of Object.entries(CURATED)) {
    const dex = +d, mid = zhToId.get(ALIAS[name] || name);
    if (!mid) { console.warn('⚠ 精修招式名查不到：' + dex + ' ' + name); continue; }
    alloc.set(dex, mid); used.set(mid, (used.get(mid) || 0) + 1);
  }
  const order = dexList.filter(d => !alloc.has(d)).sort((a, b) => poolOf(a).length - poolOf(b).length || a - b);
  for (const dex of order) {
    const pool = poolOf(dex);
    if (!pool.length) continue;
    let best = pool[0], bs = -1e9;
    for (const o of pool) {
      const over = Math.max(0, o.pw - C.get(dex).cap);
      const s = (o.main ? 2.5 : 0) + (o.lvUp ? 0.8 : 0) + o.pw / 120 * 1.1 + o.lv / 55 * 0.4
        + 0.9 * Math.max(0, 1 - Math.log(o.sc) / Math.log(300))
        - 1.7 * Math.max(0, (used.get(o.m) || 0) - 1) - 0.12 * over;
      if (s > bs) { bs = s; best = o; }
    }
    alloc.set(dex, best.m);
    used.set(best.m, (used.get(best.m) || 0) + 1);
  }

  // 去重：撞车的换成同档里还剩的空位
  for (let round = 0; round < 40; round++) {
    let changed = 0;
    const groups = new Map();
    for (const [d, m] of alloc) (groups.get(m) || groups.set(m, []).get(m)).push(d);
    for (const [m, list] of [...groups]) {
      if (list.length < 2) continue;
      for (const dex of list.slice(1)) {
        const { T } = C.get(dex);
        const tier = ['ownLv', 'own', 'anyAtk', 'ownStat', 'anyStat'].map(k => T[k]).find(x => x.length) || [];
        const p = tier.find(o => o.m !== m && !(used.get(o.m) > 0));
        if (!p) continue;
        const old = alloc.get(dex);
        used.set(old, used.get(old) - 1);
        used.set(p.m, (used.get(p.m) || 0) + 1);
        alloc.set(dex, p.m);
        changed++;
      }
    }
    if (!changed) break;
  }

  // 人工精修覆盖
  for (const [d, name] of Object.entries(MANUAL)) {
    const dex = +d, mid = zhToId.get(ALIAS[name] || name);
    if (!mid) { console.warn('⚠ 人工招式名查不到：' + d + ' ' + name); continue; }
    const old = alloc.get(dex);
    if (old) used.set(old, Math.max(0, used.get(old) - 1));
    alloc.set(dex, mid);
    used.set(mid, (used.get(mid) || 0) + 1);
  }

  const out = {};
  for (const dex of dexList) {
    const m = alloc.get(dex);
    const mv = m ? moves.get(m) : null;
    out[dex] = { move: mv ? zh.get(m) : '撞击', type: mv ? ty.get(+mv.type_id) : '一般' };
  }
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');

  const uniq = new Set(Object.values(out).map(o => o.move)).size;
  const cnt = {};
  Object.values(out).forEach(o => cnt[o.move] = (cnt[o.move] || 0) + 1);
  const maxDup = Math.max(...Object.values(cnt));
  console.log(`✅ ${dexList.length} 只 · 招式 ${uniq} 种 · 单招最多复用 ${maxDup} 次`);
  console.log('   → ' + path.relative(ROOT, OUT));
})().catch(e => { console.error('失败：' + e.message); process.exit(1); });
