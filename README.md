# 神奇宝贝桌宠

<img src="promo/demo.gif" width="660" alt="桌宠演示：散步、点击互动、飞一飞、收进精灵球">

把宝可梦养在桌面上。1025 只全国图鉴，会走会飞，能摸能扔，饿了会抱怨。

Electron 写的，免费开源，**macOS / Windows 都能装**。

**[⬇️ 下载（自动识别你的系统）](https://zyh-quotation.github.io/994-Desktop-Pet/)** ·
[所有版本](https://github.com/Zyh-Quotation/994-Desktop-Pet/releases) ·
[更新日志](https://github.com/Zyh-Quotation/994-Desktop-Pet/releases)

---

## 它是什么

不是会动的贴纸，是一个有状态的宠物：饱食度、心情、作息都在跑，关掉再打开还在。

窗口即宠物 —— 一个紧贴精灵的透明置顶窗口，空白处点击穿透，不影响你操作桌面上的任何东西。

| | |
|---|---|
| ![](promo/01-封面.png) | ![](promo/02-玩法.png) |
| ![](promo/03-图鉴.png) | ![](promo/04-故事卡.png) |

## 怎么玩

- **异色**：1025 只全都有异色版。托盘 →「异色 ✨」可以选「自动（1/128 彩蛋）」
  「总是异色」或「始终正常」；自动模式下每只的结果是固定的，不会切来切去就变
- **专属动作**：每只宝可梦都有自己的招式。点击菜单栏图标 →「专属动作 ✨」，或者等它发呆时自己放（会冒招式名，配自己的叫声）
  - 1025 只全覆盖：从各世代的升级招式表里挑本系招，威力跟着进化阶段走 —— 妙蛙种子是藤鞭、水箭龟才是加农水炮、皮卡丘是十万伏特
  - 428 种不同招式：粒子形状跟着**招式属性**走，颜色从这只自己的精灵图里取 —— 同为水系，杰尼龟和鲤鱼王的特效也不一样


| 操作 | 反应 |
|---|---|
| 轻点一下 | 冒爱心，心情 +3 |
| 在它身上来回蹭 | 摸头：压扁弹回、冒爱心、持续涨心情 |
| 1.5 秒内连点三下 | 生气，转身背对你 |
| 按住拖动 → 甩出去 | 抓起来挣扎、重力坠落、撞屏幕边缘弹三下，摔狠了会生气 |
| 托盘 → 收进球 | 变成精灵球晃三晃，点一下「噗」地出来 |
| 托盘 → 飞一飞 | 会飞的宝可梦升到半空漂一圈，落地有缓冲 |
| 托盘 → 喂食 / 玩耍 / 打盹 | 饱食度 +35 / 心情 +25 / 强制睡觉 |
| 托盘 → 随机一只 | 从 1025 只里随机换，不会抽到当前这只 |

自己会做的事：散步（往左走就朝左看）、偶尔跟着鼠标跑、跨屏走到另一块显示器、
深夜打盹、下雨懒得动、饿了冒话、发呆时打哈欠抓痒、飞行时影子随高度缩小变淡。

## 图鉴

设置页里按 **属性（18 种）/ 世代（一～九）/ 名字 / 编号** 搜索，按 540 条进化链展示，
点进化链上任意一只就能换。换的时候旁边弹一张故事卡：分类、身高体重、栖息地、图鉴原文、喜好。

- 1025 只全收录，其中 **94 只传说与幻兽**，金色徽章标注
- 每只都有 **异色版本**，每次启动有 **1/128** 概率刷出
- 1025 条图鉴原文 + 真实叫声（默认关闭）

## 装哪个

| 系统 | 文件 | 怎么装 |
|---|---|---|
| macOS（Apple 芯片） | `pokepet-x.y.z.zip` | 解开，把「神奇宝贝.app」拖进「应用程序」 |
| macOS（Intel 芯片） | `pokepet-x.y.z-mac-x64.zip` | 同上，装 Intel 专用包（解开后同样叫「神奇宝贝」） |
| Windows 10/11 64 位 | `pokepet-x.y.z-win-x64.zip` | 解压到固定文件夹，双击 `TogepiPet.exe` |

- Mac 版没买苹果开发者签名（ad-hoc 签名），首次打开会被系统拦下。
  **macOS 15 以后「右键 → 打开」已经不给按钮了**，要去「系统设置 → 隐私与安全性」点「仍要打开」，
  或者直接执行 `xattr -dr com.apple.quarantine /Applications/神奇宝贝.app` 再双击
- 下载页会自己判断你是 Apple 芯片还是 Intel，不用手选；认不出来时会同时给出 Intel 版链接
- 安装包体积大（Mac 约 200MB / Win 约 227MB），因为 1025 只精灵图和叫声都在里面

装好之后：托盘点「检查更新 ⟳」，或启动 8 秒后自动查、之后每 6 小时一次。
Mac 版会原地升级并保留存档；Windows 版会打开下载页，手动覆盖。

## 开发

```bash
npm install
npm start                 # 开发模式，改动即时生效
```

### 单独打包

```bash
./tools/build-app.sh      # Mac：组装 release/神奇宝贝.app 并签名
bash tools/build-win.sh   # Windows：release/pokepet-<版本>-win-x64.zip
```

### 目录

```
main.js              主进程：窗口、托盘、状态机、物理（33ms 一帧）、更新
preload.js           宠物窗口的安全桥
settings-preload.js  设置窗口的安全桥
renderer/            显示层：宠物窗口 + 设置页 + 故事卡
data/pokedex.json    1025 只：中文名、属性、世代、进化链
data/lore.json       1025 条：分类、栖息地、图鉴原文、身高体重
data/signatures.json 1025 只的专属动作：招式名 + 粒子形状 + 动作 + 配色
assets/pokemon/      2050 张精灵图（普通 + 异色，121MB，不进仓库）
assets/cries/        1025 条叫声（16MB，不进仓库）
docs/                GitHub Pages 下载页
tools/               打包、素材抓取脚本
tools/signature-moves.json  招式名数据源（可手工改，改完重跑 build-signatures）
promo/               宣传图和文案
```

素材不进 git。新机器拉下来后补一次：

```bash
node tools/fetch-sprites.js     # 下载精灵图
node tools/fetch-cries.js       # 下载叫声
npm install                     # Electron
```

## 技术笔记

- **点击穿透**：`setIgnoreMouseEvents(true, { forward: true })` + 渲染层命中测试，
  指针在精灵上时关掉穿透，移到外面再打开
- **物理**：主进程 33ms tick，重力 1900，抛掷继承拖动速度，撞屏幕边缘按系数反弹
- **飞行**：用 `--alt` 变量驱动精灵上浮、影子缩小变淡，不是换一张图
- **朝向**：`scaleX(-1)` 镜像
- **多屏**：判断宠物落在哪块屏，走到边界时切到相邻屏继续
- **天气**：wttr.in 每 30 分钟拉一次，失败就静默跳过
- **更新清单**：`releases/latest/download/update.json`，含版本、sha256、下载地址；
  请求加时间戳绕开 CDN 一分钟缓存

## 素材与版权

精灵图和叫声来自 [PokeAPI](https://github.com/PokeAPI)，宝可梦版权属于任天堂 / Game Freak / Creatures。
**仅供个人使用，请勿商用。**

图鉴数据由 `tools/build-pokedex.js` 从 PokeAPI 数据集生成，故事文本由 `tools/build-lore.js` 生成，
专属招式由 `tools/build-signature-moves.js` 从各世代升级招式表挑选（首次运行自动下载数据到 `tools/.cache/`）。
