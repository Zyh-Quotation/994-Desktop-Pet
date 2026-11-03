/* 极简 i18n：中文原文当 key，字典直接替换文本节点。
   好处是不用给每个 HTML 元素加 data-i18n，动态渲染出来的文案也能翻。
   原文会缓存到节点上，切回中文时能原样还原。 */
(function () {
  const EN = {
    // ── 通用 ──
    '设置': 'Settings', '神奇宝贝': 'PokéPal', '神奇宝贝桌宠': 'PokéPal',
    '神奇宝贝 · 设置': 'PokéPal · Settings', '完成': 'Done', '关闭': 'Close',
    '取消': 'Cancel', '保存中…': 'Saving…', '设置…': 'Settings…',
    '退出': 'Quit', '未知': 'Unknown', '无': 'None', '本地': 'local',
    '天': 'days', '小时': 'h', '米': 'm', '秒': 's', '只': '', '颗': '',
    '第一代': 'Gen 1', '第二代': 'Gen 2', '第三代': 'Gen 3', '第四代': 'Gen 4',
    '第五代': 'Gen 5', '第六代': 'Gen 6', '第七代': 'Gen 7', '第八代': 'Gen 8',
    '第九代': 'Gen 9', '全部世代': 'All gens',

    // ── 标签页 ──
    '图鉴': 'Dex', '成就': 'Badges', '背包': 'Bag',

    // ── 图鉴 ──
    '全国图鉴 001–1025，按属性 / 世代挑选，点进化链上任意一只即可切换':
      'National Dex 001–1025 · filter by type or generation · click any stage to switch',
    '搜索宝可梦 / 编号 / 属性，例如 皮卡丘、25、火':
      'Search by name, number or type — e.g. Pikachu, 25, Fire',
    '全部': 'All', '收藏': 'Favorites', '已解锁': 'Owned', '传说': 'Legendary',
    '♥ 收藏': '♥ Favorites', '点任意一只即可切换': 'Click any Pokémon to switch to it',
    '金色是已解锁，灰色是还没达成': 'Gold = unlocked, grey = not yet',
    '进化石和蛋都在这里': 'Evolution stones and eggs live here',
    '改完立刻生效': 'Changes apply instantly',
    '还没有解锁': 'not unlocked yet',
    '还没解锁 —— 孵蛋或者进化才能遇到它': 'not unlocked yet — hatch an egg or evolve to meet it',
    '没有匹配的宝可梦：换个关键词，或点「全部」取消属性/世代筛选':
      'No match — try another keyword, or tap All to clear filters',
    '全部免费开源，没有广告也没有内购。': 'Free and open source. No ads, no in-app purchases.',
    '数据都存在你的电脑上': 'All data stays on your computer',
    '1025 只宝可梦、1025 套专属招式、成对的异色版……':
      '1025 Pokémon, 1025 signature moves, shiny variants and more…',
    '· 1025 只全国图鉴': '· 1025 national dex entries',
    '只 · 含幻兽': 'entries · incl. mythicals',

    // ── 属性 ──
    '一般': 'Normal', '火': 'Fire', '水': 'Water', '电': 'Electric', '草': 'Grass',
    '冰': 'Ice', '格斗': 'Fighting', '毒': 'Poison', '地面': 'Ground',
    '飞行': 'Flying', '超能力': 'Psychic', '虫': 'Bug', '岩石': 'Rock',
    '幽灵': 'Ghost', '龙': 'Dragon', '恶': 'Dark', '钢': 'Steel', '妖精': 'Fairy',
    '云': 'Cloud', '雨': 'Rain', '雪': 'Snow', '雷': 'Storm', '晴': 'Clear',

    // ── 背包 ──
    '进化石': 'Stones', '蛋': 'Egg', '累计孵出': 'Hatched', '每日打卡': 'Daily check-in',
    '今日签到': 'Check in today', '今天已签到': 'Checked in today',
    '领取 +50 经验': 'Claim +50 EXP', '领取 +50 经验 +1 进化石': 'Claim +50 EXP +1 stone',
    '还没有蛋，先让它走走': 'No egg yet — let it walk around',
    '还没有进化石，每日签到或孵蛋会给': 'No stones yet — check in daily or hatch eggs',
    '已经孵出 0 只': 'Hatched 0 so far',
    '每天签到 +1，每次孵出宝可梦 +1': 'Check in daily +1, and +1 per hatch',
    '火之石': 'Fire Stone', '水之石': 'Water Stone', '雷之石': 'Thunder Stone',
    '叶之石': 'Leaf Stone', '月之石': 'Moon Stone', '日之石': 'Sun Stone',
    '光之石': 'Shiny Stone', '暗之石': 'Dusk Stone', '冰之石': 'Ice Stone',
    '觉醒石': 'Dawn Stone',

    // ── 设置项 ──
    '大小': 'Size', '小': 'S', '中': 'M', '大': 'L',
    '外观': 'Appearance', '跟随系统': 'System', '浅色': 'Light', '深色': 'Dark',
    '异色': 'Shiny', '自动 1/128': 'Auto 1/128', '总是': 'Always', '从不': 'Never',
    '自动换一只': 'Auto rotate', '每 5 分钟': 'Every 5 min', '每 15 分钟': 'Every 15 min',
    '每 30 分钟': 'Every 30 min', '每 1 小时': 'Every hour', '每 3 小时': 'Every 3 hours',
    '不自动切换了': 'Rotation off',
    '语言 / Language': 'Language', '中文': '中文', 'English': 'English',
    '叫声': 'Cries', '开机自启': 'Launch at login', '串门的宝可梦': 'Visitors',
    '专注模式（不跑不吵）': 'Focus mode (stay quiet)',
    '番茄钟': 'Pomodoro', '25 分钟': '25 min', '45 分钟': '45 min', '停止': 'Stop',
    '性格': 'Nature', '等级': 'Level', '遇见': 'Seen',

    // ── 性格 ──
    '开朗': 'Jolly', '贪吃': 'Gluttony', '傲娇': 'Tsundere', '胆小': 'Timid',
    '慵懒': 'Lazy', '爱睡': 'Sleepy',

    // ── 进化 / 孵蛋 ──
    '孵蛋': 'Egg', '孵化中…': 'Hatching…', '已经孵出': 'Hatched',
    '可以孵了': 'Ready to hatch', '现在孵化': 'Hatch now', '马上就有': 'Almost there',
    '还没有蛋': 'No egg yet', '下一颗蛋': 'Next egg', '蛋已经捡到了': 'Egg found',
    '已经有蛋了，去点它': 'You already have an egg — click it',
    '屏幕上有一颗，点它孵化': 'There is an egg on screen — click it to hatch',
    '它走着走着就会捡到一颗': 'It picks one up while walking',
    '走走就能捡到': 'Walk around to find one',
    '就已走': 'walked', '还差': 'left',
    '进化石和蛋都在这里 ': 'Stones and eggs are here ',
    '孵化': 'Hatch', '它就快可以孵了': 'Almost ready to hatch',
    '待孵化': 'Incubating', '进度': 'Progress',
    '用了': 'Used', '！': '!',
    '无进化': 'No evolution', '它已经进化到头了': 'It has reached its final form',
    '可进化到': 'Can evolve into', '进化': 'Evolve',

    // ── 成就 ──
    '初出茅庐': 'First Steps', '初次见面': 'Nice to Meet You', '收藏家': 'Collector',
    '博物学家': 'Naturalist', '图鉴全开': 'Dex Complete', '见多识广': 'Well Travelled',
    '异色猎人': 'Shiny Hunter', '异色收藏家': 'Shiny Collector',
    '饲养员': 'Caregiver', '摸头狂魔': 'Headpat Master', '投掷训练': 'Throw Training',
    '招式大师': 'Move Master', '专属动作': 'Signature move', '连续陪伴': 'Streak',
    '遇见第一只宝可梦': 'Meet your first Pokémon', '遇见 10 只': 'Meet 10 Pokémon',
    '遇见 50 只': 'Meet 50 Pokémon', '遇见 200 只': 'Meet 200 Pokémon',
    '遇见全部 1025 只': 'Meet all 1025 Pokémon', '见过一只异色': 'See one shiny',
    '见齐 8 只原生异色': 'Collect 8 shinies', '喂食 50 次': 'Feed 50 times',
    '摸头 500 次': 'Pet 500 times', '把宠物扔出去 10 次': 'Throw 10 times',
    '发动 10 次专属动作': 'Use signature move 10 times',
    '发动 100 次专属动作': 'Use signature move 100 times',
    '连续陪伴 7 天': 'Stay 7 days in a row', '连续签到 7 天': 'Check in 7 days in a row',
    '第二只': 'Second one', '老朋友': 'Old friend',

    // ── 报告 ──
    '陪伴报告': 'Companion Report', '累计在线': 'Total time', '走过': 'Walked',
    '已经陪你': 'Together for', '连续陪伴 ': 'Streak ',
    '当日': 'Today', '汇总': 'Summary',

    // ── 按钮 / 提示 ──
    '再来一局': 'Play again', '开始': 'Start', '再来一次!': 'One more!',
    '接球小游戏': 'Catch Game', '接住': 'Caught', '漏掉': 'Missed', '漏了': 'Miss',
    '剩余': 'Left', '准备好了吗？': 'Ready?', '接住 ': 'Catch ',
    '它会自己跑过去接，你看着就行': 'It runs over by itself — just watch',
    '它在接了…': 'It is catching…', '它正在脚边轻轻晃': 'It is swaying by your feet',
    '拍照分享': 'Share card', '保存图鉴卡': 'Save dex card',
    '保存成图片': 'Save as image', '保存失败': 'Save failed', '已保存到桌面': 'Saved to Desktop',
    '图鉴卡存好啦': 'Dex card saved', '图鉴卡生成失败…': 'Failed to build dex card…',
    '去点 Star': 'Star on GitHub', '以后再说': 'Maybe later',
    '喜欢这只小东西吗？': 'Enjoying this little one?',
    '去 GitHub 点个 Star ⭐ 就是最大的支持。': 'A GitHub Star ⭐ is the best support.',
    '看介绍': 'Read intro', '打开孵蛋页': 'Open egg page', '随机一只': 'Random',
    '检查更新': 'Check updates', '检查中…': 'Checking…', '正在检查…': 'Checking…',
    '已是最新': 'Up to date', '检查失败': 'Check failed', '新版已在浏览器打开，下载后解压覆盖': 'Opened in browser — unzip over the old version',
    '更新失败，请手动下载': 'Update failed — please download manually',
    '连不上更新源': 'Cannot reach update source', '未配置更新源': 'No update source configured',
    '还没配置更新源': 'No update source configured',

    // ── 带 emoji 的按钮 ──
    '打开孵蛋页 🐣': 'Open egg page 🐣', '随机一只 🎲': 'Random 🎲',
    '接球小游戏 🎮': 'Catch game 🎮', '陪伴报告 📊': 'Report 📊',
    '拍照分享 📸': 'Share card 📸', '喂食 🍞': 'Feed 🍞', '玩耍 🎾': 'Play 🎾',
    '看介绍 📖': 'Read intro 📖', '飞一飞 🕊️': 'Fly 🕊️', '专属动作 ✨': 'Signature ✨',
    '收进球 ⚪': 'Back in ball ⚪', '放出来 ⚪': 'Come out ⚪',
    '现在孵化 🐣': 'Hatch now 🐣', '先去 GitHub 点个 Star ⭐': 'Star on GitHub ⭐',
    '孵化': 'Hatch', '孵蛋': 'Egg',

    // ── 主进程气泡 ──
    '在呢～': "I'm here~", '波皮～': 'Toge~', '早上好～': 'Good morning~',
    '上午好～': 'Good morning~', '中午好～': 'Good afternoon~',
    '下午好～': 'Good afternoon~', '晚上好～': 'Good evening~',
    '这么晚还没睡…': "It's late…", '我回来啦': "I'm back", '我在这儿呢～': "I'm right here~",
    '肚子饿…波皮…': 'Hungry…', '饿得没力气了…': 'Too hungry to move…',
    '陪我玩嘛…': 'Play with me…', '等等我～': 'Wait for me~',
    '出来啦!': 'Here I am!', '收进球': 'Back in the ball', '放出来': 'Come out',
    '扔出去': 'Throw', '摸头': 'Pet', '喂食': 'Feed', '玩耍': 'Play',
    '起飞!': 'Taking off!', '爬上去咯': 'Climbing up', '贴在边上': 'Hanging on the edge',
    '这里视野好': 'Nice view up here', '跟着你!': 'Following you!', '晃啊晃…': 'Swinging…',
    '咕~': 'Gurgle~', '呼——': 'Phew—', '咻~': 'Whoosh~', '噗!': 'Pfft!',
    '嗯?': 'Huh?', '嗯…': 'Hmm…', '哎哟!': 'Ouch!', '哼!': 'Hmph!', '啊!': 'Ah!',
    '美味♪': 'Yum~', '波克波克♪': 'Toge-toge~', '打盹': 'Napping', '累了…': 'Tired…',
    '有点卡…': 'A bit stuck…', '电脑好烫…': 'Laptop is hot…', '好晕…': 'Dizzy…',
    '好冷…': 'So cold…', '吓一跳': 'Startled', '闪退': 'Crashed', '双击没反应': 'Double-click did nothing',
    '只剩声音，找不到宝可梦': 'Sound only, no sprite found',
    '外面在下雨…': 'Raining outside…', '打雷了…': 'Thunder…', '打雷了，好可怕…': 'Thunder, scary…',
    '下雪了!': 'Snowing!', '下雪啦!': 'Snowing!', '天晴了!': 'Sunny!', '云散开了…': 'Clouds cleared…',
    '外面下雨了…': 'Raining outside…',
    '坐挺久了吧？起来动一动': 'Been sitting a while — time to move',
    '时间到！起来动一动': "Time's up — stand up and stretch",
    '该喝口水啦': 'Time for water', '神奇宝贝，休息一下～': 'PokéPal says take a break~',
    '休息结束，继续加油': 'Break over — back to it',
    '好啊，专注 ': 'Focusing for ', '分钟': ' min',
    '专注中…': 'Focused…', '专注模式，我不吵你': 'Focus mode — I will stay quiet',
    '番茄钟停啦': 'Pomodoro stopped', '时间到！': "Time's up!",
    '新年快乐！': 'Happy New Year!', '圣诞快乐！': 'Merry Christmas!',
    '情人节快乐': 'Happy Valentine\'s', '国庆快乐！': 'Happy National Day!',
    '劳动节快乐': 'Happy Labour Day', '今晚跨年！': 'New Year countdown tonight!',
    '今天是我来你桌面的第一年！': 'One year on your desktop today!',
    '今天是你的生日': 'It is your birthday',
    '来啦!': 'Here!', '跑过来串门了': 'came to visit',
    '只解锁了这一只，先孵颗蛋或进化吧': 'Only this one is unlocked — hatch an egg or evolve first',
    '换成中文啦': 'Switched to Chinese', 'Switched to English': 'Switched to English',
    '已是最新': 'Up to date',
    '还没有蛋，先让它走走': 'No egg yet — let it walk around',

    // ── 介绍页 ──
    '身高': 'Height', '体重': 'Weight', '专属招式': 'Signature move',
    '常在': 'Often found in', '出没': 'habitat', '种子宝可梦': 'Seed Pokémon',
    '妙蛙种子': 'Bulbasaur', '通信': 'Trade', '亲密度': 'Friendship',
    '学会特定招式': 'Level up knowing a move', '特殊条件': 'Special condition',
    '使用': 'Use'
  };

  // 带变量的句子用规则翻译
  const RULES = [
    [/^Lv\.(\d+) · 经验 (\d+)\/(\d+)$/, 'Lv.$1 · EXP $2/$3'],
    [/^遇见 (\d+)\/(\d+) · 异色 (\d+)$/, 'Seen $1/$2 · Shiny $3'],
    [/^已解锁 (\d+) \/ (\d+)$/, 'Owned $1 / $2'],
    [/^找到 (\d+) 只$/, '$1 found'],
    [/^共 (\d+) 只$/, '$1 total'],
    [/^共 (\d+) 只$/, '$1 total'],
    [/^(\d+) 只 · 含幻兽$/, '$1 entries · incl. mythicals'],
    [/^每 (\d+) 分钟换一只新的$/, 'New one every $1 min'],
    [/^今天已签到（连续 (\d+) 天）$/, 'Checked in today (streak $1)'],
    [/^今日签到 \+50 经验（连续 (\d+) 天）$/, 'Check-in +50 EXP (streak $1)'],
    [/^已经孵出 (\d+) 只 · 进化石 (\d+) 颗$/, 'Hatched $1 · Stones $2'],
    [/^进度 (\d+)% · 已走 (\d+) \/ (\d+) 米$/, 'Progress $1% · walked $2 / $3 m'],
    [/^已走 (\d+) \/ (\d+) 米$/, 'walked $1 / $2 m'],
    [/^约 (.+)$/, 'about $1'],
    [/^(\d+) 分 (\d+) 秒$/, '$1m $2s'],
    [/^(\d+) 小时 (\d+) 分$/, '$1h $2m'],
    [/^(\d+) 秒$/, '$1s'],
    [/^(\d+) 天$/, '$1 days'],
    [/^第(.+)代$/, 'Gen $1'],
    [/^孵出 (.+)$/, 'Hatched $1'],
    [/^(.+) 还没解锁 —— 孵蛋或者进化才能遇到它$/, '$1 is locked — hatch or evolve to meet it'],
    [/^(.+) · 还没解锁$/, '$1 · locked'],
    [/^(.+) 跑过来串门了$/, '$1 came to visit'],
    [/^(.+)，来啦!$/, '$1 is here!'],
    [/^(.+) 进化成 (.+)！$/, '$1 evolved into $2!'],
    [/^🏆 成就解锁：(.+)$/, '🏆 Badge unlocked: $1'],
    [/^✨ 异色 (.+)$/, '✨ Shiny $1'],
    [/^✨ (.+) 进化成 (.+)！$/, '✨ $1 evolved into $2!'],
    [/^接住 (\d+) 个！经验 \+(\d+)$/, 'Caught $1! EXP +$2'],
    [/^用了(.+)！$/, 'Used $1!'],
    [/^用(.+)进化 ✨ \((\d+)\)$/, 'Evolve with $1 ✨ ($2)'],
    [/^从 (.+) 到今天 · Lv\.(\d+)$/, 'Since $1 · Lv.$2'],
    [/^陪伴报告-(.+)\.png$/, 'companion-report-$1.png'],
    [/^神奇宝贝-(.+)\.png$/, 'pokepal-$1.png'],
    [/^(.+) 岁生日！$/, '$1th birthday!'],
    [/^🏠 常在(.+)出没$/, '🏠 Often found in $1'],
    [/^🏠 (.+)$/, '🏠 $1'],
    [/^解锁 (.+)$/, 'Unlocked $1'],
    [/^(\d+)%（走够就有一颗）$/, '$1% (walk to get one)'],
    [/^(\d+)%$/, '$1%']
  ];

  const lang = (typeof window !== 'undefined' && window.PET_LANG === 'en') ? 'en' : 'zh';
  const NODES = new WeakMap();
  const ATTRS = new WeakMap();

  function translate(text) {
    if (lang !== 'en') return text;
    const t = text.trim();
    if (!t || !/[\u4e00-\u9fa5]/.test(t)) return text;
    if (Object.prototype.hasOwnProperty.call(EN, t)) return text.replace(t, EN[t]);
    for (const [re, rep] of RULES) {
      if (re.test(t)) return text.replace(t, t.replace(re, rep));
    }
    return text;
  }

  function walkNode(node) {
    if (node.nodeType === 3) {
      const src = NODES.has(node) ? NODES.get(node) : node.nodeValue;
      if (!NODES.has(node)) NODES.set(node, src);
      const next = translate(src);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    // placeholder / title
    for (const a of ['placeholder', 'title']) {
      if (node.hasAttribute && node.hasAttribute(a)) {
        let cache = ATTRS.get(node);
        if (!cache) { cache = {}; ATTRS.set(node, cache); }
        if (cache[a] === undefined) cache[a] = node.getAttribute(a);
        const next = translate(cache[a]);
        if (node.getAttribute(a) !== next) node.setAttribute(a, next);
      }
    }
    for (const child of node.childNodes) walkNode(child);
  }

  function apply(root) {
    walkNode(root || document.body);
  }

  function start() {
    apply(document.body);
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) walkNode(n);
        if (m.type === 'characterData') walkNode(m.target);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.I18N = { lang, apply, translate, EN, RULES };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
