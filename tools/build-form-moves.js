/*
 * 生成 data/form-moves.json：每个超级进化 / 超极巨化形态的专属招式。
 *
 * 用法：node tools/build-form-moves.js
 *
 * 超级进化优先用下方逐只的招式表；没有单独写的按属性生成「超级<属性>爆裂」。
 * 超极巨化使用该属性的 G-Max（超极巨）招式；同属性共用是官方规则。
 * 日文 / 韩文没有逐条维护时留空，界面会退回英文招式名；
 * 已生成的文件里若已有同名招式的日/韩文，会保留下来，避免重跑时丢翻译。
 */
const fs = require('fs');
const path = require('path');
const FORMS = require('../data/forms.json');

const TYPE = {
  一般: { en: 'Normal', ja: 'ノーマル', ko: '노말', kind: 'star', motion: 'bump', color: '#b8b8a0' },
  火:   { en: 'Fire', ja: 'ほのお', ko: '불꽃', kind: 'ember', motion: 'charge', color: '#ef8428' },
  水:   { en: 'Water', ja: 'みず', ko: '물', kind: 'bubble', motion: 'stomp', color: '#4e85ce' },
  草:   { en: 'Grass', ja: 'くさ', ko: '풀', kind: 'leaf', motion: 'charge', color: '#24c6ab' },
  电:   { en: 'Electric', ja: 'でんき', ko: '전기', kind: 'spark', motion: 'charge', color: '#f7d13c' },
  冰:   { en: 'Ice', ja: 'こおり', ko: '얼음', kind: 'crystal', motion: 'charge', color: '#78d7e8' },
  格斗: { en: 'Fighting', ja: 'かくとう', ko: '격투', kind: 'shock', motion: 'dash', color: '#d05248' },
  毒:   { en: 'Poison', ja: 'どく', ko: '독', kind: 'slime', motion: 'stomp', color: '#a85ac0' },
  地面: { en: 'Ground', ja: 'じめん', ko: '땅', kind: 'rock', motion: 'stomp', color: '#c8a860' },
  飞行: { en: 'Flying', ja: 'ひこう', ko: '비행', kind: 'wind', motion: 'hover', color: '#a8a0e0' },
  超能力: { en: 'Psychic', ja: 'エスパー', ko: '에스퍼', kind: 'ring', motion: 'hover', color: '#e070b0' },
  虫:   { en: 'Bug', ja: 'むし', ko: '벌레', kind: 'leaf', motion: 'dash', color: '#a8b820' },
  岩石: { en: 'Rock', ja: 'いわ', ko: '바위', kind: 'rock', motion: 'stomp', color: '#b8a038' },
  幽灵: { en: 'Ghost', ja: 'ゴースト', ko: '고스트', kind: 'ghost', motion: 'hover', color: '#8058a8' },
  龙:   { en: 'Dragon', ja: 'ドラゴン', ko: '드래곤', kind: 'ember', motion: 'charge', color: '#7048d8' },
  恶:   { en: 'Dark', ja: 'あく', ko: '악', kind: 'dark', motion: 'dash', color: '#705848' },
  钢:   { en: 'Steel', ja: 'はがね', ko: '강철', kind: 'spark', motion: 'bump', color: '#a8b8c8' },
  妖精: { en: 'Fairy', ja: 'フェアリー', ko: '페어리', kind: 'star', motion: 'hover', color: '#e898c8' }
};

// 逐只的超级进化招式：[中文, 英文, 招式属性(可选，默认形态第一属性)]
const MEGA = {
  3: ['终极吸取', 'Giga Drain'],
  9: ['加农光炮', 'Flash Cannon'],
  15: ['毒击', 'Poison Jab'],
  18: ['暴风', 'Hurricane'],
  26: ['伏特攻击', 'Volt Tackle'],
  36: ['月亮之力', 'Moonblast'],
  65: ['精神强念', 'Psychic'],
  71: ['飞叶风暴', 'Leaf Storm'],
  80: ['热水', 'Scald'],
  94: ['暗影球', 'Shadow Ball'],
  115: ['增强拳', 'Power-Up Punch'],
  121: ['水炮', 'Hydro Pump'],
  127: ['断头钳', 'Guillotine', '虫'],
  130: ['咬碎', 'Crunch'],
  142: ['岩崩', 'Rock Slide'],
  149: ['龙之俯冲', 'Dragon Rush'],
  154: ['花瓣舞', 'Petal Dance'],
  160: ['水流裂破', 'Liquidation'],
  181: ['龙之波动', 'Dragon Pulse'],
  208: ['铁尾', 'Iron Tail'],
  212: ['子弹拳', 'Bullet Punch'],
  214: ['飞弹针', 'Pin Missile'],
  227: ['钢翼', 'Steel Wing'],
  229: ['恶之波动', 'Dark Pulse'],
  248: ['尖石攻击', 'Stone Edge'],
  254: ['叶刃', 'Leaf Blade'],
  257: ['闪焰冲锋', 'Flare Blitz'],
  260: ['水流裂破', 'Waterfall'],
  282: ['魔法闪耀', 'Dazzling Gleam'],
  302: ['暗影爪', 'Shadow Claw'],
  303: ['嬉闹', 'Play Rough'],
  306: ['重磅冲撞', 'Heavy Slam'],
  308: ['飞膝踢', 'High Jump Kick'],
  310: ['十万伏特', 'Thunderbolt'],
  319: ['咬碎', 'Crunch'],
  323: ['喷火', 'Eruption'],
  334: ['月亮之力', 'Moonblast'],
  354: ['暗影爪', 'Shadow Claw'],
  358: ['精神强念', 'Psychic'],
  359: ['暗袭要害', 'Night Slash'],
  362: ['冰冻光束', 'Ice Beam'],
  373: ['舍身冲撞', 'Double-Edge'],
  376: ['彗星拳', 'Meteor Mash'],
  380: ['薄雾球', 'Mist Ball'],
  381: ['洁净光芒', 'Luster Purge'],
  384: ['画龙点睛', 'Dragon Ascent'],
  398: ['近身战', 'Close Combat'],
  428: ['飞膝踢', 'High Jump Kick'],
  445: ['地震', 'Earthquake'],
  448: ['波导弹', 'Aura Sphere'],
  460: ['暴风雪', 'Blizzard'],
  475: ['近身战', 'Close Combat'],
  478: ['暗影球', 'Shadow Ball'],
  485: ['熔岩风暴', 'Magma Storm'],
  491: ['恶之波动', 'Dark Pulse'],
  500: ['闪焰冲锋', 'Flare Blitz'],
  530: ['直冲钻', 'Drill Run'],
  531: ['巨声', 'Hyper Voice'],
  545: ['超级角击', 'Megahorn'],
  560: ['咬碎', 'Crunch'],
  604: ['疯狂伏特', 'Wild Charge'],
  609: ['暗影球', 'Shadow Ball'],
  623: ['地震', 'Earthquake'],
  652: ['木槌', 'Wood Hammer'],
  655: ['魔法火焰', 'Mystical Fire'],
  658: ['飞水手里剑', 'Water Shuriken'],
  668: ['巨声', 'Hyper Voice'],
  670: ['月亮之力', 'Moonblast'],
  678: ['精神强念', 'Psychic'],
  687: ['蛮力', 'Superpower'],
  689: ['尖石攻击', 'Stone Edge'],
  691: ['污泥波', 'Sludge Wave'],
  701: ['飞身重压', 'Flying Press'],
  718: ['千箭齐发', 'Thousand Arrows'],
  719: ['钻石风暴', 'Diamond Storm'],
  740: ['冰锤', 'Ice Hammer'],
  768: ['迎头一击', 'First Impression'],
  780: ['龙之波动', 'Dragon Pulse'],
  801: ['加农光炮', 'Flash Cannon'],
  807: ['等离子闪电拳', 'Plasma Fists'],
  870: ['不倒翁', 'No Retreat'],
  952: ['过热', 'Overheat'],
  970: ['力量宝石', 'Power Gem'],
  978: ['龙之波动', 'Dragon Pulse'],
  998: ['巨剑突击', 'Glaive Rush']
};

// 同一只的多个形态需要不同招式时，按 file 覆盖
const FILE = {
  '6-mega-x': ['龙爪', 'Dragon Claw', '龙'],
  '6-mega-y': ['大字爆炎', 'Fire Blast', '火'],
  '26-mega-x': ['等离子闪电拳', 'Plasma Fists', '电'],
  '26-mega-y': ['精神强念', 'Psychic', '超能力'],
  '150-mega-x': ['意念头锤', 'Zen Headbutt', '超能力'],
  '150-mega-y': ['精神击破', 'Psystrike', '超能力'],
  '359-mega-z': ['暗影爪', 'Shadow Claw', '幽灵'],
  '445-mega-z': ['龙之俯冲', 'Dragon Rush', '龙'],
  '448-mega-z': ['暗影球', 'Shadow Ball', '幽灵'],
  '678-meowstic-female-mega': ['魔法闪耀', 'Dazzling Gleam', '妖精'],
  '689-mega': ['尖石攻击', 'Stone Edge', '岩石'],
  '801-original-mega': ['花朵加农炮', 'Fleur Cannon', '妖精'],
  '978-tatsugiri-droopy-mega': ['热水', 'Scald', '水'],
  '978-tatsugiri-stretchy-mega': ['龙之波动', 'Dragon Pulse', '龙']
};

// 超极巨化招式：按属性。官方同一属性可以共用一个 G-Max 招式。
const GMAX = {
  一般: ['超极巨金币连击', 'G-Max Gold Rush', 'キョダイコインラッシュ', '거대맥스코인러시'],
  火:   ['超极巨地狱灭焰', 'G-Max Wildfire', 'キョダイゴクエン', '거대맥스지옥불꽃'],
  水:   ['超极巨水泡爆裂', 'G-Max Foam Burst', 'キョダイホウマツ', '거대맥스거품폭발'],
  草:   ['超极巨狂擂乱打', 'G-Max Drum Solo', 'キョダイコランダ', '거대맥스드럼솔로'],
  电:   ['超极巨万雷轰顶', 'G-Max Volt Crash', 'キョダイバンライ', '거대맥스전격충돌'],
  冰:   ['超极巨冰霜世界', 'G-Max Resonance', 'キョダイヒョウガ', '거대맥스공명'],
  格斗: ['超极巨会心一击', 'G-Max Chi Strike', 'キョダイシンゲキ', '거대맥스기공격'],
  毒:   ['超极巨臭气冲天', 'G-Max Malodor', 'キョダイシュウキ', '거대맥스악취'],
  地面: ['超极巨沙尘漫天', 'G-Max Sandblast', 'キョダイサジン', '거대맥스모래폭풍'],
  飞行: ['超极巨暴风狂啸', 'G-Max Wind Rage', 'キョダイフウゲキ', '거대맥스폭풍'],
  超能力: ['超极巨超重力', 'G-Max Gravitas', 'キョダイジュウリョク', '거대맥스중력'],
  虫:   ['超极巨虫惑', 'G-Max Befuddle', 'キョダイコンワク', '거대맥스혼란'],
  岩石: ['超极巨炎石喷发', 'G-Max Volcalith', 'キョダイガンセキ', '거대맥스암석분출'],
  幽灵: ['超极巨幽魂', 'G-Max Terror', 'キョダイゲンエイ', '거대맥스공포'],
  龙:   ['超极巨龙之衰', 'G-Max Depletion', 'キョダイリュウスイ', '거대맥스드래곤쇠퇴'],
  恶:   ['超极巨晚安', 'G-Max Snooze', 'キョダイスイミン', '거대맥스잠듦'],
  钢:   ['超极巨金属溶解', 'G-Max Meltdown', 'キョダイヨウカイ', '거대맥스금속용해'],
  妖精: ['超极巨天谴', 'G-Max Smite', 'キョダイテンバツ', '거대맥스천벌']
};

// 重跑时保留已有的日 / 韩招式名（同 file 且同英文招式才复用）
let previous = {};
const dest = path.join(__dirname, '..', 'data', 'form-moves.json');
try { previous = JSON.parse(fs.readFileSync(dest, 'utf8')).moves || {}; } catch (_) {}
const out = {};
let count = 0;
for (const [dex, v] of Object.entries(FORMS.forms)) {
  for (const kind of ['mega', 'gmax']) {
    for (const e of v[kind] || []) {
      const type = (e.types && e.types[0]) || '一般';
      const fx = TYPE[type] || TYPE['一般'];
      let move, moveEn, moveJa = '', moveKo = '';
      if (kind === 'gmax') {
        const g = GMAX[type] || GMAX['一般'];
        [move, moveEn, moveJa, moveKo] = g;
      } else {
        const m = FILE[e.file] || MEGA[Number(dex)] || [`超级${type}爆裂`, `Mega ${fx.en} Blast`];
        move = m[0]; moveEn = m[1];
        const prev = previous[e.file];
        if (prev && prev.moveEn === moveEn) { moveJa = prev.moveJa || ''; moveKo = prev.moveKo || ''; }
        if (m[2]) {
          const tfx = TYPE[m[2]] || fx;
          out[e.file] = { file: e.file, move, moveEn, moveJa, moveKo, type: m[2], kind: tfx.kind, motion: tfx.motion, color: tfx.color };
          count++;
          continue;
        }
      }
      if (kind === 'mega' && !moveJa) {
        const prev = previous[e.file];
        if (prev && prev.moveEn === moveEn) { moveJa = prev.moveJa || ''; moveKo = prev.moveKo || ''; }
      }
      out[e.file] = { file: e.file, move, moveEn, moveJa, moveKo, type, kind: fx.kind, motion: fx.motion, color: fx.color };
      count++;
    }
  }
}

const sorted = {};
for (const k of Object.keys(out).sort()) sorted[k] = out[k];
fs.writeFileSync(dest, JSON.stringify({ generatedAt: new Date().toISOString(), count, moves: sorted }, null, 0));
console.log(`✅ ${count} 个形态招式 → ${dest}`);
