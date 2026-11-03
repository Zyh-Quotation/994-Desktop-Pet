#!/usr/bin/env bash
# 构建 Linux x64 版：下载官方 electron 运行时 → 塞进 app → 打成 tar.gz
# 注意：这个脚本没有在 Linux 上实机验证过，首次使用请自行确认托盘与透明窗口
set -euo pipefail
cd "$(dirname "$0")/.."

VER=$(node -p "require('./package.json').version")
EVER=$(node -p "require('./node_modules/electron/package.json').version")
CACHE=".cache/electron-linux"
OUT="release/linux"

mkdir -p "$CACHE"
if [ ! -f "$CACHE/electron.zip" ]; then
  echo "▶ 下载 electron v$EVER (linux-x64)…"
  curl -fL --retry 3 -o "$CACHE/electron.zip" \
    "https://github.com/electron/electron/releases/download/v$EVER/electron-v$EVER-linux-x64.zip"
fi

echo "▶ 组装…"
rm -rf "$OUT" && mkdir -p "$OUT"
unzip -q -o "$CACHE/electron.zip" -d "$OUT"
chmod +x "$OUT/electron"

APP="$OUT/resources/app"
rm -rf "$APP" && mkdir -p "$APP"
cp -R main.js preload.js settings-preload.js renderer assets package.json "$APP"/
cp docs/使用说明.txt "$APP/README.txt" 2>/dev/null || true

echo "▶ 打包…"
tar -czf "release/pokepet-$VER-linux-x64.tar.gz" -C "$OUT" .
echo "✅ release/pokepet-$VER-linux-x64.tar.gz"
echo "   运行：tar xzf pokepet-$VER-linux-x64.tar.gz && ./electron"
