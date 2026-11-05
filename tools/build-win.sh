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

echo "▶ 准备抠图运行时（照片伙伴要用，缺了自动下载）…"
"$NODE" tools/fetch-ort.js

echo "▶ 复制应用文件…"
rsync -a ./ "$APP/resources/app/" \
  --exclude '.git' --exclude '.*' \
  --exclude node_modules --exclude userdata --exclude release \
  --exclude 'tools/.cache' --exclude 'tools/bin/.build' \
  --exclude 'tools/bin/cutout' \
  --exclude promo --exclude '*.log' \
  --exclude 'capture.png' --exclude 'settings-capture.png' --exclude 'shot-*.png' \
  --exclude '*.md' --exclude '*.zip' --exclude '安装说明.txt' \
  --exclude '双击启动.command'

# 说明文件用 ASCII 文件名（Windows 解压中文名容易乱码），内容用统一的那份
if [ -f docs/使用说明.txt ]; then
  cp docs/使用说明.txt "$APP/README.txt"
fi

echo "▶ 打包…"
rm -f "$DEST"
( cd "$OUT" && zip -qry "../$(basename "$DEST")" "TogepiPet" )
echo "✅ $DEST  ($(du -h "$DEST" | cut -f1))"
