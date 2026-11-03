#!/bin/bash
# 从清单安装更新：./tools/update.sh <update.json 的 URL 或本地路径>
# 校验 sha256 → 备份旧 app → 替换 → 重启
set -euo pipefail

MANIFEST="${1:-}"
APP="${APP:-$HOME/Applications/神奇宝贝.app}"

if [ -z "$MANIFEST" ]; then
  echo "用法: ./tools/update.sh <update.json 地址>"
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "$MANIFEST" == http* ]]; then
  curl -fsSL --max-time 30 "$MANIFEST" -o "$TMP/update.json"
else
  cp "$MANIFEST" "$TMP/update.json"
fi

VER=$(node -p "require('$TMP/update.json').version")
# Intel 和 Apple 芯片的包不一样，按本机架构挑对应的下载地址
ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && ARCH=x64 || ARCH=arm64
URL=$(node -p "const m=require('$TMP/update.json'); (m.builds && m.builds['$ARCH'] && m.builds['$ARCH'].url) || m.url")
SHA=$(node -p "const m=require('$TMP/update.json'); (m.builds && m.builds['$ARCH'] && m.builds['$ARCH'].sha256) || m.sha256")
echo "目标版本：$VER（$ARCH）"

curl -fsSL --max-time 300 "$URL" -o "$TMP/update.zip"
ACTUAL=$(shasum -a 256 "$TMP/update.zip" | awk '{print $1}')
[ "$ACTUAL" = "$SHA" ] || { echo "❌ 校验失败"; exit 1; }
echo "✅ 校验通过"

ditto -x -k "$TMP/update.zip" "$TMP/unpack"
NEW_APP=$(find "$TMP/unpack" -maxdepth 2 -name '*.app' -type d | head -1)
[ -n "$NEW_APP" ] || { echo "❌ 压缩包里没有 .app"; exit 1; }

# 保留存档：把旧 userdata 搬进新包
USERDATA="$HOME/Applications/桌宠/userdata"
rm -rf "$APP.bak"
mv "$APP" "$APP.bak"
cp -R "$NEW_APP" "$APP"
[ -d "$USERDATA" ] && [ -d "$APP/Contents/Resources/app" ] && {
  rm -rf "$APP/Contents/Resources/app/userdata"
  ln -s "$USERDATA" "$APP/Contents/Resources/app/userdata" || true
}

pkill -f '神奇宝贝.app/Contents/MacOS/Electron' 2>/dev/null || true
sleep 1
open "$APP"
echo "✅ 已更新到 $VER（旧版本备份在 $APP.bak）"
