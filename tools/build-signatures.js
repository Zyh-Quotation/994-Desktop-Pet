#!/usr/bin/env node
/**
 * 生成 data/signatures.json —— 每只宝可梦的"专属动作"规格
 *
 * 三件事：
 * 1. 招式名：读 tools/signature-moves.json（1025 只，来自各世代升级招式表，
 *    按"本系 + 升级学会 + 进化阶段威力上限"挑选，人工精修优先）
 * 2. 特效种类（kind）/ 动作（motion）：按**招式自身属性**决定
 * 3. 粒子颜色：从这只自己的精灵图里取主色调 —— 所以同为水系，
 *    杰尼龟和鲤鱼王的特效颜色也不一样
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pokedex.json'), 'utf8'));
const species = Array.isArray(DEX) ? DEX : (DEX.species || Object.values(DEX).find(Array.isArray));

// 每只的专属招式（tools/build-signature-moves.js 生成，可人工修改）
const PICKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'signature-moves.json'), 'utf8'));

// ---------- 招式属性 → 特效种类 / 动作 / 基础色 ----------
const TYPE_RULES = {
  一般: { kind: 'star',    move: '撞击',     color: '#c8c2b0', motion: 'bump'   },
  火:   { kind: 'ember',   move: '火花',     color: '#f08030', motion: 'charge' },
  水:   { kind: 'bubble',  move: '水枪',     color: '#6890f0', motion: 'bump'   },
  电:   { kind: 'spark',   move: '电击',     color: '#f8d030', motion: 'charge' },
  草:   { kind: 'leaf',    move: '藤鞭',     color: '#78c850', motion: 'bump'   },
  冰:   { kind: 'crystal', move: '冰冻光束', color: '#98d8d8', motion: 'charge' },
  格斗: { kind: 'shock',   move: '空手劈',   color: '#c03028', motion: 'stomp'  },
  毒:   { kind: 'slime',   move: '污泥攻击', color: '#a040a0', motion: 'bump'   },
  地面: { kind: 'rock',    move: '挖洞',     color: '#e0c068', motion: 'stomp'  },
  飞行: { kind: 'wind',    move: '起风',     color: '#a890f0', motion: 'hover'  },
  超能力:{ kind: 'ring',   move: '念力',     color: '#f85888', motion: 'hover'  },
  虫:   { kind: 'dot',     move: '连斩',     color: '#a8b820', motion: 'bump'   },
  岩石: { kind: 'rock',    move: '落石',     color: '#b8a038', motion: 'stomp'  },
  幽灵: { kind: 'ghost',   move: '黑夜魔影', color: '#705898', motion: 'hover'  },
  龙:   { kind: 'spiral',  move: '龙之怒',   color: '#7038f8', motion: 'hover'  },
  恶:   { kind: 'dark',    move: '咬碎',     color: '#705848', motion: 'dash'   },
  钢:   { kind: 'flash',   move: '金属爪',   color: '#b8b8d0', motion: 'stomp'  },
  妖精: { kind: 'star',    move: '魔法闪耀', color: '#ee99ac', motion: 'hover'  }
};

// ---------- 手工微调动作 / 特效 ----------
// [动作, 特效] —— 只写要覆盖的项；不写则按招式属性取
const OVERRIDES = {"3":["charge"],"6":["charge","ember"],"9":["stomp","bubble"],"12":["hover","dot"],"15":["dash","dot"],"18":["hover","wind"],"19":["dash","star"],"20":["dash","star"],"24":["charge","slime"],"25":["charge","spark"],"26":["charge","spark"],"28":["stomp","rock"],"31":["stomp","star"],"34":["dash","shock"],"35":["bounce","star"],"36":["hover","ring"],"38":["charge","ember"],"39":["bounce","star"],"42":["dash","dark"],"45":["charge","leaf"],"50":["stomp","rock"],"51":["stomp","rock"],"52":["bounce","star"],"54":["hover","ring"],"55":["stomp","bubble"],"57":["stomp","shock"],"59":["dash","ember"],"62":["bump","bubble"],"63":["bounce","ring"],"65":["hover","ring"],"68":["stomp","shock"],"71":["charge","slime"],"73":["charge","bubble"],"76":["stomp","rock"],"78":["dash","ember"],"79":["bounce","star"],"80":["charge","ring"],"82":["charge","spark"],"85":["dash","dot"],"87":["charge","crystal"],"89":["bump","slime"],"91":["dash","crystal"],"92":["bounce","ghost"],"93":["hover","ghost"],"94":["charge","ghost"],"95":["stomp","rock"],"97":["hover","ring"],"99":["stomp","shock"],"100":["charge","spark"],"101":["stomp","spark"],"103":["hover","leaf"],"105":["dash","rock"],"107":["dash","shock"],"110":["charge","slime"],"112":["dash","rock"],"113":["bounce","star"],"115":["dash","shock"],"121":["charge","bubble"],"123":["dash","dot"],"124":["charge","crystal"],"125":["dash","spark"],"126":["dash","ember"],"127":["stomp","shock"],"128":["dash","star"],"129":["bounce","bubble"],"130":["charge","ring"],"131":["charge","crystal"],"132":["bounce","ring"],"133":["bump","star"],"134":["charge","bubble"],"135":["charge","spark"],"136":["charge","ember"],"137":["charge","dot"],"142":["hover","rock"],"143":["bounce","star"],"144":["hover","crystal"],"145":["hover","spark"],"146":["hover","ember"],"147":["hover","spiral"],"148":["hover","spiral"],"149":["charge","spiral"],"150":["hover","ring"],"151":["bounce","star"],"160":["stomp"],"169":["hover","wind"],"175":["bounce","star"],"181":["charge","spark"],"183":["bump","bubble"],"196":["hover","ring"],"197":["dash","dark"],"212":["dash","flash"],"214":["dash","shock"],"215":["dash","crystal"],"227":["hover","flash"],"230":["charge","spiral"],"248":["stomp","rock"],"249":["hover","wind"],"250":["hover","ember"],"251":["hover","star"],"254":["charge","leaf"],"257":["dash","ember"],"260":["stomp","rock"],"282":["hover","ring"],"302":["hover","ghost"],"306":["dash","flash"],"330":["hover","spiral"],"334":["hover","spiral"],"350":["charge","bubble"],"359":["dash","dark"],"373":["hover","spiral"],"376":["charge","flash"],"380":["hover","ring"],"381":["hover","ring"],"384":["hover","spiral"],"385":["hover","star"],"386":["charge","ring"],"445":["dash","spiral"],"448":["dash","shock"],"450":["stomp","rock"],"461":["dash","crystal"],"468":["hover","wind"],"471":["charge","crystal"],"472":["hover","wind"],"483":["charge","spiral"],"484":["charge","spiral"],"487":["hover","ghost"],"491":["hover","dark"],"493":["hover","ring"],"494":["bounce","ember"],"497":["charge","leaf"],"500":["dash","ember"],"503":["dash","bubble"],"530":["stomp","rock"],"571":["charge","dark"],"609":["hover","ember"],"612":["dash","spiral"],"635":["charge","spiral"],"637":["hover","ember"],"643":["charge","ember"],"644":["charge","spark"],"646":["charge","crystal"],"649":["charge","flash"],"655":["hover","ember"],"658":["dash","bubble"],"663":["dash","wind"],"681":["charge","flash"],"700":["hover","star"],"715":["charge","wind"],"717":["hover","dark"],"718":["charge","ring"],"719":["charge","crystal"],"745":["dash","rock"],"748":["charge","slime"],"778":["bounce","star"],"784":["charge","ring"],"791":["charge","flash"],"792":["hover","ring"],"800":["charge","ring"],"807":["dash","spark"],"815":["bounce","ember"],"818":["charge","bubble"],"858":["hover","star"],"869":["bounce","star"],"887":["dash","spiral"],"890":["charge","ring"],"898":["hover","star"],"908":["dash","leaf"],"911":["charge","ember"],"914":["bounce","bubble"],"936":["charge","ember"],"937":["dash","ghost"],"1007":["dash","rock"],"1008":["dash","spark"]};

const CAN_FLY = new Set(['飞行', '龙', '超能力', '幽灵', '妖精', '虫']);

// ---------- 取精灵主色 ----------
function dominantColor(dex) {
  const file = path.join(ROOT, 'assets', 'pokemon', dex + '.gif');
  if (!fs.existsSync(file)) return null;
  try {
    const py = [
      'import sys, colorsys',
      'from PIL import Image',
      'im = Image.open(sys.argv[1]); im.seek(0); im = im.convert("RGBA")',
      'px = [(r, g, b) for r, g, b, a in im.getdata() if a > 150]',
      'if not px: print(""); raise SystemExit',
      'strip = Image.new("RGB", (len(px), 1)); strip.putdata(px)',
      'q = strip.quantize(colors=12, method=Image.MEDIANCUT)',
      'pal = q.getpalette()[:36]',
      'best, bestn = None, -1',
      'for n, idx in q.getcolors():',
      '    r, g, b = pal[idx*3:idx*3+3]',
      '    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)',
      '    if s < 0.25 or v < 0.35: continue',
      '    score = n * (0.55 + s)',
      '    if score > bestn: bestn, best = score, (r, g, b)',
      'if best:',
      '    h, s, v = colorsys.rgb_to_hsv(*[c/255 for c in best])',
      '    s = min(1, max(0.62, s)); v = min(1, max(0.78, v))',
      '    r, g, b = colorsys.hsv_to_rgb(h, s, v)',
      '    print("#%02x%02x%02x" % (int(r*255), int(g*255), int(b*255)))'
    ].join('\n');
    const out = execFileSync(PYTHON, ['-c', py, file], { encoding: 'utf8', timeout: 20000 });
    const hex = out.trim();
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex : null;
  } catch (_) { return null; }
}

const PYTHON = process.env.PYTHON || 'python3';

// ---------- 主流程 ----------
const result = {};
let colorCount = 0, picked = 0, fallback = 0;

for (const sp of species) {
  const dex = sp.dex || sp.id || sp.no;
  const types = sp.types || [];
  // 主属性是"一般"而还有第二属性时，用第二属性出招更有个性
  const primary = (types[0] === '一般' && types[1]) ? types[1] : (types[0] || '一般');
  const pick = PICKS[dex];
  const moveType = (pick && TYPE_RULES[pick.type]) ? pick.type : primary;
  const rule = TYPE_RULES[moveType] || TYPE_RULES['一般'];
  const ov = OVERRIDES[dex] || [];

  let move = pick ? pick.move : rule.move;
  let motion = ov[0] || rule.motion;
  let kind = ov[1] || rule.kind;

  // 能飞的默认改成盘旋，除非手写过动作
  if (!ov[0] && CAN_FLY.has(primary) && motion !== 'hover') motion = 'hover';

  const sampled = dominantColor(dex);
  if (sampled) colorCount++;
  if (pick) picked++; else fallback++;

  result[dex] = {
    move,
    kind,
    motion,
    color: sampled || rule.color,
    type: moveType,
    name: sp.name || ''
  };
}

fs.writeFileSync(path.join(ROOT, 'data', 'signatures.json'),
  JSON.stringify(result), 'utf8');

const kinds = {};
Object.values(result).forEach(r => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
const moves = new Set(Object.values(result).map(r => r.move));
console.log(`✅ ${Object.keys(result).length} 只 · 专属招式 ${moves.size} 种 · 取到专属色 ${colorCount} 只` + (fallback ? ` · 回退 ${fallback} 只` : ''));
console.log('特效分布：' + Object.entries(kinds).sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${k} ${n}`).join(' · '));
