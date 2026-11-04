/* 极简 i18n：中文原文当 key，字典直接替换文本节点。
   好处是不用给每个 HTML 元素加 data-i18n，动态渲染出来的文案也能翻。
   原文会缓存到节点上，切回中文时能原样还原。 */
(function () {
  const EN = {
    // ── 通用 ──
    '设置': 'Settings', '神奇宝贝': 'PokéPal', '神奇宝贝桌宠': 'PokéPal',
    '桌面宠物': 'Desktop Pet', '桌面宠物桌宠': 'Desktop Pet',
    '神奇宝贝 · 设置': 'PokéPal · Settings', '桌面宠物 · 设置': 'Desktop Pet · Settings', '完成': 'Done', '关闭': 'Close',
    '取消': 'Cancel', '保存中…': 'Saving…', '设置…': 'Settings…',
    '退出': 'Quit', '未知': 'Unknown', '无': 'None', '本地': 'local',
    '天': 'days', '小时': 'h', '米': 'm', '秒': 's', '只': '', '颗': '',
    '第一代': 'Gen 1', '第二代': 'Gen 2', '第三代': 'Gen 3', '第四代': 'Gen 4',
    '第五代': 'Gen 5', '第六代': 'Gen 6', '第七代': 'Gen 7', '第八代': 'Gen 8',
    '第九代': 'Gen 9', '全部世代': 'All gens',

    // ── 标签页 ──
    '图鉴': 'Dex', '成就': 'Badges', '背包': 'Bag', '伙伴': 'Team', '任务': 'Tasks', '通知': 'Alerts',
    '帽子': 'Hat', '围巾': 'Scarf', '不戴': 'None', '鸭舌帽': 'Cap', '礼帽': 'Top hat', '王冠': 'Crown',
    '红色': 'Red', '蓝色': 'Blue', '绿色': 'Green', '改名': 'Rename',
    '给它起个名字（最多 12 个字）': 'Give it a name (max 12 characters)',
    '我的伙伴': 'My team', '当前': 'Active', '切换': 'Switch', '移除': 'Remove',
    '战斗形态': 'Battle form', '超级进化': 'Mega Evolution', '超极巨化': 'Gigantamax',
    '变回原样': 'Revert', '可以变身': 'Ready',
    '超级进化 / 超极巨化是临时形态，持续时间结束后会自动变回来；冷却已取消，随时可以再次变身。每个形态都有专属招式。':
      'Mega Evolution and Gigantamax are temporary and revert when time is up. Cooldown is gone — transform again anytime. Every form has its own move.',
    '形态专属招式': 'Form move',
    '在图鉴里点任意一只就会切换并加入队伍，最多 12 只。':
      'Pick any Pokémon in the Dex to switch and add it to your team (max 12).',
    '最多 12 只伙伴，点切换即可换到它': 'Up to 12 companions — switch anytime',
    '每周任务': 'Weekly tasks', '距刷新': 'resets in',
    '领取': 'Claim', '已领取': 'Claimed', '暂无任务': 'No tasks',
    '每日 0 点、每周一刷新；完成后点「领取」': 'Daily resets at midnight, weekly on Monday; tap Claim when done',
    '全部已读': 'Mark all read', '清空': 'Clear', '同时发系统通知': 'Also send system notifications',
    '还没有通知。签到、孵蛋、任务和提醒都会出现在这里。':
      'No notifications yet. Check-ins, eggs, tasks and reminders will show up here.',
    '签到、孵蛋、任务和提醒都会记录在这里': 'Check-ins, eggs, tasks and reminders are kept here',
    '连续签到': 'Streak', '累计签到': 'Total check-ins', '陪伴天数': 'Days together', '成就墙': 'Badge wall',
    '最近一年 · 签到 / 互动': 'Last year · check-ins / activity', '多': 'more',
    '皮肤': 'Theme', '经典': 'Classic', '樱花': 'Sakura', '海洋': 'Ocean', '森林': 'Forest', '节日': 'Festival',
    '节日自动换肤': 'Auto festival skin',
    '辅助功能': 'Accessibility', '减少动态效果': 'Reduce motion', '高对比度': 'High contrast',
    '界面缩放': 'UI scale', '叫声音量': 'Cry volume', '喝水提醒': 'Water reminder', '久坐提醒': 'Sit reminder',
    '不提醒': 'Off', '不自动换': 'Off', '每 45 分钟': 'Every 45 min', '每 60 分钟': 'Every 60 min', '每 90 分钟': 'Every 90 min', '每 2 小时': 'Every 2 hours',
    '按编号': 'By number', '按名称': 'By name', '按属性': 'By type', '按世代': 'By generation',
    '传说优先': 'Legendary first', '进化链': 'Evolution chains', '平铺': 'All Pokémon',
    '虚拟滚动 · 只渲染可见卡片': 'Virtual scroll · visible cards only',
    '点任意一只即可切换': 'Click any Pokémon to switch',
    '每日任务': 'Daily tasks',

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

    '亲密无间': 'Reach friendship 90',
    '大胃王': 'Feed 50 times',
    '游戏高手': 'Catch 20 in the mini-game',
    '进化之光': 'Evolve once',
    '完全体': 'Reach level 50',
    '常驻嘉宾': 'Keep it open for 7 days',
    '摸鱼达人': 'Pet 500 times',
    '金色传说': 'Unlock 20 badges',
    '十级伙伴': 'Reach level 10',
    '形影不离': 'Reach level 25',
    '传说训练家': 'Reach level 50',
    '破壳而出': 'Hatch your first egg',
    '孵化专家': 'Hatch 10 eggs',
    '万里长征': 'Walk 10 km in total',
    '半部图鉴': 'Meet 500 Pokémon',
    '闪光收藏': 'See 3 shinies',
    '大厨': 'Feed 200 times',
    '摸头宗师': 'Pet 1000 times',
    '招式宗师': 'Use 500 signature moves',
    '投掷高手': 'Throw the pet 50 times',
    '月度全勤': 'Check in 30 days in a row',
    '室友': 'Stay together 30 days',
    '任务达人': 'Claim 10 daily task rewards',
    '每周全勤': 'Claim 4 weekly task rewards',
    // ── 设置项 ──
    '大小': 'Size', '小': 'S', '中': 'M', '大': 'L',
    '外观': 'Appearance', '跟随系统': 'System', '浅色': 'Light', '深色': 'Dark',
    '异色': 'Shiny', '自动 1/128': 'Auto 1/128', '总是': 'Always', '从不': 'Never',
    '自动换一只': 'Auto rotate', '每 5 分钟': 'Every 5 min', '每 15 分钟': 'Every 15 min',
    '每 30 分钟': 'Every 30 min', '每 1 小时': 'Every hour', '每 3 小时': 'Every 3 hours',
    '不自动切换了': 'Rotation off',
    '语言 / Language': 'Language', '中文': '中文', 'English': 'English',
    '叫声': 'Cries', '开机自启': 'Launch at login', '串门的宝可梦': 'Visitors',
    '同屏放养伙伴': 'Roaming teammates', '只养当前一只': 'Just the active one',
    '再多放 1 只': '+ 1 roaming', '再多放 2 只': '+ 2 roaming', '再多放 3 只': '+ 3 roaming',
    '专注模式（不跑不吵）': 'Focus mode (stay quiet)',
    '番茄钟': 'Pomodoro', '25 分钟': '25 min', '45 分钟': '45 min', '停止': 'Stop',
    '性格': 'Nature', '等级': 'Level', '遇见': 'Seen',

    // ── 自定义提醒 ──
    '提醒': 'Reminders', '提醒内容，例如 喝水、开会、站起来': 'Reminder text, e.g. Water, Meeting, Stand up',
    '重复': 'Repeat', '不选 = 每天': 'none = every day', '已选 ': 'selected ',
    ' 天': ' days', ' 还没有提醒，添加一个吧': 'No reminders yet — add one',
    '删除': 'Delete', '提醒事项': 'Reminder', '到点会让桌宠冒气泡提醒你，同时记进通知中心。专注模式下不打扰。':
      'At the set time the pet will bubble a reminder and log it to Notifications. Muted in Focus mode.',
    '提醒内容': 'Reminder', '喝水、开会、站起来': 'Water, Meeting, Stand up',
    // ── 健康曲线 ──
    '健康': 'Health', '当前心情': 'Current mood', '当前饱食度': 'Current hunger',
    '平均心情（近一年）': 'Avg mood (last year)', '平均饱食度（近一年）': 'Avg hunger (last year)',
    '近 30 天心情 / 饱食度曲线': 'Last 30 days · mood / hunger',
    '已记录 ': 'logged ', ' 天': ' days', '还没有数据，养几天就有了': 'No data yet — come back in a few days',
    '每 30 秒采样一次，攒成当天的均值。养得越用心，曲线越好看。':
      'Sampled every 30s into a daily average. The more you care, the nicer the curve.',
    // ── 照片伙伴 ──
    '照片伙伴': 'Photo pets', '导入照片 📷': 'Import photo 📷', '显示在桌面': 'Show on desktop',
    '上传一张猫狗（或其他动物）的照片，本地抠图后它就会出现在桌面上陪你。照片不会上传到任何服务器。':
      'Upload a photo of a cat, dog or other animal — it is cut out locally and appears on your desktop. Photos never leave your computer.',
    '还没有照片伙伴，点上面「导入照片」试试': 'No photo pets yet — tap Import photo above',
    ' 只': '', '只': '',

    // ── 性格 ──
    '开朗': 'Jolly', '贪吃': 'Gluttony', '傲娇': 'Tsundere', '胆小': 'Timid',
    '慵懒': 'Lazy', '爱睡': 'Sleepy',

    // ── 进化 / 孵蛋 ──
    '孵蛋': 'Egg', '孵化中…': 'Hatching…', '已经孵出': 'Hatched', '孵出': 'Hatched',
    '没有蛋可以孵': 'No egg to hatch', '不想出去': "Don't want to go out", '这只飞不起来呀…': "This one can't fly…",
    '点下面的按钮': 'tap the button below', '就差一点': 'almost there', '串门儿': 'Visitor',
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
    '版本 v': 'Version v', '无进化': 'No evolution', '它已经进化到头了': 'It has reached its final form',
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
    '该喝口水啦': 'Time for water', '神奇宝贝，休息一下～': 'PokéPal says take a break~', '桌面宠物，休息一下～': 'Desktop Pet says take a break~',
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
    '身高': 'Height', '体重': 'Weight', '专属招式': 'Signature move', '点一下收起': 'Click to close',
    '常在': 'Often found in', '出没': 'habitat', '种子宝可梦': 'Seed Pokémon',
    '妙蛙种子': 'Bulbasaur', '通信': 'Trade', '亲密度': 'Friendship',
    '学会特定招式': 'Level up knowing a move', '特殊条件': 'Special condition',
    '使用': 'Use'
  };

  const JA = (typeof window !== 'undefined' && window.I18N_JA) || {};
  const KO = (typeof window !== 'undefined' && window.I18N_KO) || {};

  // 带变量的句子用规则翻译
  const RULES = [
    [/^Lv\.(\d+) · 经验 (\d+)\/(\d+)$/, 'Lv.$1 · EXP $2/$3'],
    [/^遇见 (\d+)\/(\d+) · 异色 (\d+)$/, 'Seen $1/$2 · Shiny $3'],
    [/^已解锁 (\d+) \/ (\d+)$/, 'Owned $1 / $2'],
    [/^已是最新 v(.+)$/, 'Up to date v$1'],
    [/^发现 v(.+)，正在更新…$/, 'Found v$1, updating…'],
    [/^发现 v(.+)，请在弹出的窗口确认更新$/, 'Found v$1 — confirm in the update window'],
    [/^(.+) 条 · (\d+) 条未读$/, '$1 total · $2 unread'],
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
    [/^约 (\d+) 小时 (\d+) 分$/, 'about $1h $2m'],
    [/^约 (\d+) 分 (\d+) 秒$/, 'about $1m $2s'],
    [/^约 (\d+) 秒$/, 'about $1s'],
    [/^约 (.+)$/, 'about $1'],
    [/^图鉴 (\d+)\/(\d+) · 异色 (\d+)$/, 'Dex $1/$2 · Shiny $3'],
    [/^(\d+) 分 (\d+) 秒$/, '$1m $2s'],
    [/^(\d+) 小时 (\d+) 分$/, '$1h $2m'],
    [/^(\d+) 秒$/, '$1s'],
    [/^(\d+) 天$/, (m, n) => `${n} day${n === '1' ? '' : 's'}`],
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
    [/^桌面宠物-(.+)\.png$/, 'desktop-pet-$1.png'],
    [/^(.+) 岁生日！$/, '$1th birthday!'],
    [/^身高 (.+) m$/, 'Height $1 m'],
    [/^体重 (.+) kg$/, 'Weight $1 kg'],
    [/^🏠 常在(.+)出没$/, '🏠 Often found in $1'],
    [/^🏠 (.+)$/, '🏠 $1'],
    [/^解锁 (.+)$/, 'Unlocked $1'],
    [/^(\d+)%（走够就有一颗）$/, '$1% (walk to get one)'],
    [/^♥ 收藏 (\d+)$/, '♥ Favorites $1'],
    [/^进度 (\d+)%$/, 'Progress $1%'],
    [/^(\d+)%$/, '$1%']
  ];

  const pickLang = v => (v === 'en' || v === 'ja' || v === 'ko') ? v : 'zh';
  let lang = pickLang(typeof window !== 'undefined' ? window.PET_LANG : 'zh');
  const DICTS = { en: EN, ja: JA, ko: KO };
  const NODES = new WeakMap();
  const ATTRS = new WeakMap();

  function translate(text) {
    if (lang === 'zh') return text;
    const t = text.trim();
    if (!t || !/[\u3400-\u9fff]/.test(t)) return text;
    const dict = DICTS[lang] || EN;
    if (Object.prototype.hasOwnProperty.call(dict, t)) return text.replace(t, dict[t]);
    // 日文 / 韩文没有单独翻译的条目，退回英文，至少不会留中文
    if (lang !== 'en' && Object.prototype.hasOwnProperty.call(EN, t)) return text.replace(t, EN[t]);
    // 复合属性「电·龙」：拆开逐段翻（图鉴卡、故事卡里都是这种一整个字符串）
    if (t.includes('·')) {
      const parts = t.split('·').map(x => translate(x.trim()));
      const merged = parts.join(' · ');
      if (merged !== t) return text.replace(t, merged);
    }
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

  // 运行时切换语言：缓存的原文都还在 NODES 里，重新走一遍就能整页换掉
  function setLang(next) {
    const v = pickLang(next);
    if (v === lang) return;
    lang = v;
    // window.PET_LANG 是 preload 通过 contextBridge 暴露的只读属性，改不动；
    // 运行时语言以 I18N.lang 为准
    apply(document.body);
  }

  window.I18N = {
    get lang() { return lang; },
    setLang, apply, translate, EN, JA, KO, RULES
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
