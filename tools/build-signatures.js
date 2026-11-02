#!/usr/bin/env node
/**
 * 生成 data/signatures.json —— 每只宝可梦的"专属动作"规格
 *
 * 三件事：
 * 1. 招式名：精选列表里手写（皮卡丘 → 十万伏特），其余按主属性给标准招式
 * 2. 特效种类（kind）：决定粒子形状，按属性定
 * 3. 粒子颜色：从这只自己的精灵图里取主色调 —— 所以同为水系，
 *    杰尼龟和鲤鱼王的特效颜色也不一样
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pokedex.json'), 'utf8'));
const species = Array.isArray(DEX) ? DEX : (DEX.species || Object.values(DEX).find(Array.isArray));

// ---------- 属性 → 特效种类 / 默认招式 / 基础色 ----------
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
  妖精: { kind: 'star',     move: '魔法闪耀', color: '#ee99ac', motion: 'hover'  }
};

// ---------- 精选：招式名 / 动作 / 特效覆盖 ----------
// [招式, 动作?, 特效?] —— 只写要覆盖的项
const CURATED = {
  1: ['藤鞭'], 2: ['飞叶快刀'], 3: ['花瓣舞', 'charge'], 6: ['喷射火焰', 'charge', 'ember'],
  9: ['加农水炮', 'stomp', 'bubble'], 12: ['麻痹粉', 'hover', 'dot'], 15: ['双针', 'dash', 'dot'],
  18: ['暴风', 'hover', 'wind'], 19: ['电光一闪', 'dash', 'star'], 20: ['必杀门牙', 'dash', 'star'],
  24: ['大蛇瞪眼', 'charge', 'slime'], 25: ['十万伏特', 'charge', 'spark'], 26: ['打雷', 'charge', 'spark'],
  28: ['挖洞', 'stomp', 'rock'], 31: ['泰山压顶', 'stomp', 'star'], 34: ['超级角击', 'dash', 'shock'],
  35: ['挥指', 'bounce', 'star'], 36: ['月亮之力', 'hover', 'ring'], 38: ['大字爆炎', 'charge', 'ember'],
  39: ['唱歌', 'bounce', 'star'], 42: ['吸血', 'dash', 'dark'], 45: ['花瓣舞', 'charge', 'leaf'],
  50: ['挖洞', 'stomp', 'rock'], 51: ['地震', 'stomp', 'rock'], 52: ['聚宝功', 'bounce', 'star'],
  54: ['念力', 'hover', 'ring'], 55: ['水炮', 'stomp', 'bubble'], 57: ['愤怒', 'stomp', 'shock'],
  59: ['神速', 'dash', 'ember'], 62: ['泡沫光线', 'bump', 'bubble'], 63: ['瞬间移动', 'bounce', 'ring'],
  65: ['精神强念', 'hover', 'ring'], 68: ['爆裂拳', 'stomp', 'shock'], 71: ['溶解液', 'charge', 'slime'],
  73: ['水炮', 'charge', 'bubble'], 76: ['地震', 'stomp', 'rock'], 78: ['闪焰冲锋', 'dash', 'ember'],
  79: ['哈欠', 'bounce', 'star'], 80: ['意念头锤', 'charge', 'ring'], 82: ['放电', 'charge', 'spark'],
  85: ['三重攻击', 'dash', 'dot'], 87: ['冰冻光束', 'charge', 'crystal'], 89: ['污泥攻击', 'bump', 'slime'],
  91: ['冰锥', 'dash', 'crystal'], 92: ['舔舌头', 'bounce', 'ghost'], 93: ['黑夜魔影', 'hover', 'ghost'],
  94: ['影子球', 'charge', 'ghost'], 95: ['岩崩', 'stomp', 'rock'], 97: ['食梦', 'hover', 'ring'],
  99: ['断头钳', 'stomp', 'shock'], 100: ['电磁炮', 'charge', 'spark'], 101: ['大爆炸', 'stomp', 'spark'],
  103: ['飞叶风暴', 'hover', 'leaf'], 105: ['骨棒乱打', 'dash', 'rock'], 107: ['音速拳', 'dash', 'shock'],
  110: ['污泥攻击', 'charge', 'slime'], 112: ['角钻', 'dash', 'rock'], 113: ['生蛋', 'bounce', 'star'],
  115: ['迷昏拳', 'dash', 'shock'], 121: ['水炮', 'charge', 'bubble'], 123: ['连斩', 'dash', 'dot'],
  124: ['暴风雪', 'charge', 'crystal'], 125: ['雷电拳', 'dash', 'spark'], 126: ['火焰拳', 'dash', 'ember'],
  127: ['夹紧', 'stomp', 'shock'], 128: ['舍身冲撞', 'dash', 'star'], 129: ['水溅跃', 'bounce', 'bubble'],
  130: ['破坏光线', 'charge', 'ring'], 131: ['冰冻光束', 'charge', 'crystal'], 132: ['变身', 'bounce', 'ring'],
  133: ['撞击', 'bump', 'star'], 134: ['水炮', 'charge', 'bubble'], 135: ['打雷', 'charge', 'spark'],
  136: ['喷射火焰', 'charge', 'ember'], 137: ['三重攻击', 'charge', 'dot'], 142: ['岩崩', 'hover', 'rock'],
  143: ['睡觉', 'bounce', 'star'], 144: ['暴风雪', 'hover', 'crystal'], 145: ['打雷', 'hover', 'spark'],
  146: ['热风', 'hover', 'ember'], 147: ['龙卷风', 'hover', 'spiral'], 148: ['龙之舞', 'hover', 'spiral'],
  149: ['逆鳞', 'charge', 'spiral'], 150: ['精神击破', 'hover', 'ring'], 151: ['变身', 'bounce', 'star'],
  // 第二代
  152: ['藤鞭'], 155: ['火花'], 158: ['水枪'], 160: ['水炮', 'stomp'], 169: ['空气斩', 'hover', 'wind'],
  175: ['挥指', 'bounce', 'star'], 181: ['电磁炮', 'charge', 'spark'], 183: ['水枪', 'bump', 'bubble'],
  196: ['精神强念', 'hover', 'ring'], 197: ['恶之波动', 'dash', 'dark'], 212: ['子弹拳', 'dash', 'flash'],
  214: ['超级角击', 'dash', 'shock'], 215: ['冰砾', 'dash', 'crystal'], 227: ['钢之翼', 'hover', 'flash'],
  230: ['龙之波动', 'charge', 'spiral'], 248: ['岩崩', 'stomp', 'rock'], 249: ['神鸟猛击', 'hover', 'wind'],
  250: ['神圣之火', 'hover', 'ember'], 251: ['时光咆哮', 'hover', 'star'],
  // 第三、四代
  254: ['飞叶风暴', 'charge', 'leaf'], 257: ['火焰踢', 'dash', 'ember'], 260: ['地震', 'stomp', 'rock'],
  282: ['月亮之力', 'hover', 'ring'], 302: ['黑夜魔影', 'hover', 'ghost'], 306: ['铁头', 'dash', 'flash'],
  330: ['龙息', 'hover', 'spiral'], 334: ['龙之波动', 'hover', 'spiral'], 350: ['水炮', 'charge', 'bubble'],
  359: ['暗袭要害', 'dash', 'dark'], 373: ['龙之俯冲', 'hover', 'spiral'], 376: ['彗星拳', 'charge', 'flash'],
  380: ['薄雾球', 'hover', 'ring'], 381: ['洁净光芒', 'hover', 'ring'], 384: ['画龙点睛', 'hover', 'spiral'],
  385: ['祈愿', 'hover', 'star'], 386: ['精神突进', 'charge', 'ring'],
  // 第五代以后
  445: ['龙之俯冲', 'dash', 'spiral'], 448: ['波导弹', 'dash', 'shock'], 450: ['地震', 'stomp', 'rock'],
  461: ['冰砾', 'dash', 'crystal'], 468: ['空气斩', 'hover', 'wind'], 471: ['冰冻光束', 'charge', 'crystal'],
  472: ['空气斩', 'hover', 'wind'], 483: ['时间咆哮', 'charge', 'spiral'], 484: ['亚空裂斩', 'charge', 'spiral'],
  487: ['暗影潜袭', 'hover', 'ghost'], 491: ['暗黑洞', 'hover', 'dark'], 493: ['制裁光砾', 'hover', 'ring'],
  494: ['火焰弹', 'bounce', 'ember'], 495: ['藤鞭'], 497: ['飞叶风暴', 'charge', 'leaf'],
  498: ['火花'], 500: ['火焰踢', 'dash', 'ember'], 501: ['水枪'], 503: ['贝壳刃', 'dash', 'bubble'],
  530: ['地震', 'stomp', 'rock'], 571: ['暗夜爆破', 'charge', 'dark'], 609: ['烈焰溅射', 'hover', 'ember'],
  612: ['龙之俯冲', 'dash', 'spiral'], 635: ['龙之波动', 'charge', 'spiral'], 637: ['火焰之舞', 'hover', 'ember'],
  643: ['青焰', 'charge', 'ember'], 644: ['雷击', 'charge', 'spark'], 646: ['冰封世界', 'charge', 'crystal'],
  649: ['科技爆破', 'charge', 'flash'], 655: ['魔法火焰', 'hover', 'ember'], 658: ['飞水手里剑', 'dash', 'bubble'],
  663: ['勇鸟猛攻', 'dash', 'wind'], 681: ['王者盾牌', 'charge', 'flash'], 700: ['月亮之力', 'hover', 'star'],
  715: ['爆音波', 'charge', 'wind'], 717: ['死亡之翼', 'hover', 'dark'], 718: ['千箭齐发', 'charge', 'ring'],
  719: ['钻石风暴', 'charge', 'crystal'], 745: ['岩崩', 'dash', 'rock'], 748: ['毒菱', 'charge', 'slime'],
  778: ['嬉闹', 'bounce', 'star'], 784: ['鳞片噪音', 'charge', 'ring'], 791: ['日光回旋', 'charge', 'flash'],
  792: ['月华飞坠', 'hover', 'ring'], 800: ['光子喷涌', 'charge', 'ring'], 807: ['等离子闪电拳', 'dash', 'spark'],
  815: ['火焰球', 'bounce', 'ember'], 818: ['狙击', 'charge', 'bubble'], 858: ['魔法闪耀', 'hover', 'star'],
  869: ['装饰', 'bounce', 'star'], 887: ['龙箭', 'dash', 'spiral'], 890: ['极巨炮', 'charge', 'ring'],
  898: ['星碎', 'hover', 'star'], 908: ['千变万花', 'dash', 'leaf'], 911: ['闪焰高歌', 'charge', 'ember'],
  914: ['流水旋舞', 'bounce', 'bubble'], 936: ['铠甲炮', 'charge', 'ember'], 937: ['悔念剑', 'dash', 'ghost'],
  1007: ['断崖之剑', 'dash', 'rock'], 1008: ['闪电猛冲', 'dash', 'spark']
};

const CAN_FLY = new Set(['飞行', '龙', '超能力', '幽灵', '妖精', '虫']);

// ---------- 取精灵主色 ----------
function dominantColor(dex) {
  const file = path.join(ROOT, 'assets', 'pokemon', dex + '.gif');
  if (!fs.existsSync(file)) return null;
  try {
    const py = [
      'import sys, colorsys',
      'from PIL import Image',
      'p = sys.argv[1]',
      'im = Image.open(p); im.seek(0); im = im.convert("RGBA")',
      'px = [(r, g, b) for r, g, b, a in im.getdata() if a > 160]',
      'if not px: print(""); raise SystemExit',
      'q = im.convert("RGB").quantize(colors=8, method=Image.MEDIANCUT)',
      'pal = q.getpalette()[:24]',
      'best, bestscore = None, -1',
      'for i in range(8):',
      '    r, g, b = pal[i*3:i*3+3]',
      '    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)',
      '    if v < 0.15 or v > 0.95: continue',
      '    score = s * 0.7 + (1 - abs(v - 0.6)) * 0.3',
      '    if score > bestscore: bestscore, best = score, (r, g, b)',
      'if best:',
      '    h, s, v = colorsys.rgb_to_hsv(*[c/255 for c in best])',
      '    s = min(1, max(0.55, s)); v = min(1, max(0.65, v))',
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
let curatedCount = 0, colorCount = 0;

for (const sp of species) {
  const dex = sp.dex || sp.id || sp.no;
  const types = sp.types || [];
  const primary = types[0] || '一般';
  const rule = TYPE_RULES[primary] || TYPE_RULES['一般'];
  const cur = CURATED[dex] || [];

  let move = cur[0] || rule.move;
  let motion = cur[1] || rule.motion;
  let kind = cur[2] || rule.kind;

  // 能飞的默认改成盘旋，除非手写过动作
  if (!cur[1] && CAN_FLY.has(primary) && motion !== 'hover') motion = 'hover';

  const sampled = dominantColor(dex);
  if (sampled) colorCount++;
  else if (cur[0]) curatedCount++;

  result[dex] = {
    move,
    kind,
    motion,
    color: sampled || rule.color,
    type: primary,
    name: sp.name || ''
  };
}

fs.writeFileSync(path.join(ROOT, 'data', 'signatures.json'),
  JSON.stringify(result), 'utf8');

const kinds = {};
Object.values(result).forEach(r => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
console.log(`✅ ${Object.keys(result).length} 只 · 手写招式 ${Object.keys(CURATED).length} 条 · 取到专属色 ${colorCount} 只`);
console.log('特效分布：' + Object.entries(kinds).sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${k} ${n}`).join(' · '));
