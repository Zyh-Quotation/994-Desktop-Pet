#!/bin/bash
# 组装 Intel（x86_64）版 app —— 给还在用 Intel 芯片 Mac 的用户
#
# 和 build-app.sh 的区别：那个用的是 node_modules 里本机架构的 Electron，
# 这个下载官方 x64 版 Electron 当壳，再把同一份项目代码塞进去。
#
# 用法：./tools/build-app-intel.sh [输出目录]
#
# 产物：release/intel/神奇宝贝.app（zip 里就是这个名，用户看到的是「神奇宝贝」）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${1:-$ROOT/release}"
OUT="$OUT_DIR/intel/神奇宝贝.app"
CACHE="$ROOT/tools/.cache/electron-x64"
VER=$(node -p "require('./package.json').version")

# ---------- 1. 准备 x64 版 Electron（只下第一次） ----------
# 以本机 dist 里的实际版本为准（package.json 的 ^38 与 node_modules 里装的版本可能不一致）
ELECTRON_VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  node_modules/electron/dist/Electron.app/Contents/Info.plist 2>/dev/null || echo "")
[ -n "$ELECTRON_VER" ] || { echo "❌ 找不到 electron 版本，先 npm install"; exit 1; }

if [ ! -d "$CACHE/Electron.app" ]; then
  echo "▶ 下载 Electron v$ELECTRON_VER (darwin-x64)…"
  mkdir -p "$CACHE"
  ZIP="$CACHE/electron.zip"
  curl -fsSL -o "$ZIP" \
    "https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/electron-v${ELECTRON_VER}-darwin-x64.zip"
  unzip -q -o "$ZIP" -d "$CACHE"
  rm -f "$ZIP"
fi

# ---------- 2. 复制壳 + 改 Info.plist ----------
echo "▶ 组装 $OUT"
rm -rf "$OUT"
mkdir -p "$OUT_DIR/intel"
cp -R "$CACHE/Electron.app" "$OUT"

PLIST="$OUT/Contents/Info.plist"
/usr/libexec/PlistBuddy \
  -c "Set :CFBundleName 神奇宝贝" \
  -c "Set :CFBundleDisplayName 神奇宝贝" \
  -c "Set :CFBundleIdentifier local.togepi.pet" \
  -c "Set :CFBundleShortVersionString $VER" \
  -c "Set :CFBundleVersion $VER" \
  "$PLIST"

# ---------- 3. 塞入项目代码 ----------
# 注意：不能删 Resources/default_app.asar —— Info.plist 里的 ElectronAsarIntegrity
# 会对它做哈希校验，缺了 Electron 会静默退出。
# 也不能排除 *.png —— assets/tray*.png 是托盘图标，缺了托盘就是空白。
rsync -a \
  --exclude userdata --exclude node_modules --exclude release \
  --exclude '.git' --exclude 'tools/.cache' --exclude 'promo/*.png' \
  "$ROOT/" "$OUT/Contents/Resources/app/"

xattr -cr "$OUT" 2>/dev/null || true

# ---------- 4. 签名 ----------
IDENTITY="${DEVID:--}"
echo "签名身份：$IDENTITY"
if [ "$IDENTITY" = "-" ]; then
  codesign --force --deep --sign - "$OUT"
else
  codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" "$OUT"
fi
codesign --verify --deep --strict "$OUT" 2>&1 | tail -2

echo "✅ Intel 版完成：$OUT"
file "$OUT/Contents/MacOS/Electron" | sed 's/^/   架构：/'
du -sh "$OUT" | awk '{print "   体积：" $1}'

# ---------- 5. 打成发布用的 zip ----------
ZIP="$OUT_DIR/pokepet-${VER}-mac-x64.zip"
rm -f "$ZIP"
ditto -c -k --norsrc --keepParent "$OUT" "$ZIP"
echo "📦 $ZIP"
ls -lh "$ZIP" | awk '{print "   体积：" $5}'
