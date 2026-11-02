#!/bin/bash
# 组装 Windows 便携版（免安装，解压即用）
# 目录和 exe 全部用 ASCII 名，避免 Windows 解压 zip 时中文变乱码
set -euo pipefail
cd "$(dirname "$0")/.."

NODE="${NODE:-node}"
VER=$("$NODE" -p "require('./package.json').version")
EL=$(cat node_modules/electron/dist/version 2>/dev/null || echo 38.8.6)
CACHE="${HOME}/.cache/pokepet"
ZIP="$CACHE/electron-v${EL}-win32-x64.zip"
OUT="release/win"
APP="$OUT/TogepiPet"
DEST="release/pokepet-${VER}-win-x64.zip"

mkdir -p "$CACHE"
if [ ! -s "$ZIP" ]; then
  echo "▶ 下载 Electron ${EL} (win32-x64)…"
  curl -fL --retry 3 --connect-timeout 20 -o "$ZIP" \
    "https://npmmirror.com/mirrors/electron/${EL}/electron-v${EL}-win32-x64.zip"
fi

echo "▶ 解压 Electron…"
rm -rf "$OUT"; mkdir -p "$APP"
unzip -q "$ZIP" -d "$APP"
rm -f "$APP/default_app.asar" "$APP/resources/default_app.asar"
mv "$APP/electron.exe" "$APP/TogepiPet.exe"

echo "▶ 复制应用文件…"
rsync -a ./ "$APP/resources/app/" \
  --exclude '.git' --exclude '.*' \
  --exclude node_modules --exclude userdata --exclude release \
  --exclude promo --exclude '*.log' \
  --exclude 'capture.png' --exclude 'settings-capture.png' --exclude 'shot-*.png' \
  --exclude '*.md' --exclude '*.zip' --exclude '安装说明.txt' \
  --exclude '双击启动.command'

# 说明文件用 ASCII 文件名 + UTF-8 BOM，记事本打开不乱码
printf '\xEF\xBB\xBF' > "$APP/README.txt"
cat >> "$APP/README.txt" <<'TXT'
神奇宝贝桌宠 · Windows 便携版
================================

怎么用：
1. 先把整个 TogepiPet 文件夹放到一个固定位置（比如 D:\TogepiPet）。
   不要直接在压缩包里双击，也不要放桌面——放桌面容易误删。
2. 双击 TogepiPet.exe。
3. 想开机自启：右键托盘上的精灵球 →「设置…」→ 打开「开机自启」。

数据在哪：
  %APPDATA%\神奇宝贝

遇到问题：
· 双击没反应：右键 TogepiPet.exe → 属性 → 兼容性 →
  勾选「以兼容模式运行这个程序」，选 Windows 10，再试。
· 杀毒软件报毒：这是未签名的 Electron 程序，属正常，加到信任即可。
· 桌面不显示：检查是不是被多显示器或全屏应用挡住了，按一下 Win 键看看。

版本和更新：
  托盘精灵球 →「检查更新 ⟳」
TXT

echo "▶ 打包…"
rm -f "$DEST"
( cd "$OUT" && zip -qry "../$(basename "$DEST")" "TogepiPet" )
echo "✅ $DEST  ($(du -h "$DEST" | cut -f1))"
