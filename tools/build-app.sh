#!/bin/bash
# 组装一个"自包含"的 app（把软链接换成真实文件），然后签名
# 开发时 ~/Applications/桌面宠物.app 里的 Resources/app 是软链接，方便改代码即时生效；
# 但软链接指向 bundle 之外，签名校验会报「invalid destination for symbolic link」，
# 所以发布版必须先组装成自包含结构。
#
# 用法：./tools/build-app.sh [输出目录]
set -euo pipefail

SRC="$HOME/Applications/桌面宠物.app"
SRC_ROOT="$HOME/Applications/桌宠"
OUT_DIR="${1:-$HOME/Applications/桌宠/release}"
OUT="$OUT_DIR/桌面宠物.app"

echo "源：$SRC"
echo "目标：$OUT"

# 先把抠图工具编出来（照片伙伴功能要用）
"$SRC_ROOT/tools/build-cutout.sh" || true
# 老 macOS（< 14）走本地 ONNX 模型，资源缺了自动补
"${NODE:-node}" "$SRC_ROOT/tools/fetch-ort.js"

rm -rf "$OUT"
mkdir -p "$OUT_DIR"
# 先整体复制（保留 framework 里的软链接，否则 codesign 认不出 bundle）
rsync -a --exclude 'Contents/Resources/app' "$SRC/" "$OUT/"
# 再把 Resources/app 这个软链接替换成真实目录（userdata 是运行时数据，跳过）
APP_REAL="$(cd "$SRC/Contents/Resources/app" && pwd -P)"
rsync -a --exclude userdata --exclude node_modules --exclude release \
  --exclude 'tools/bin/.build' --exclude 'tools/.cache' --exclude '.git' \
  --exclude 'promo/*.png' "$APP_REAL/" "$OUT/Contents/Resources/app/"
# 保证 Resources/app 是真实目录
test -d "$OUT/Contents/Resources/app" && ! test -L "$OUT/Contents/Resources/app" || {
  echo "❌ Resources/app 仍是软链接"; exit 1; }

# 换成自己的应用图标（Info.plist 里 CFBundleIconFile 指向 pokeball）
if [ -f "$SRC_ROOT/assets/app-icon.icns" ]; then
  cp "$SRC_ROOT/assets/app-icon.icns" "$OUT/Contents/Resources/pokeball.icns"
  echo "已替换应用图标"
fi

xattr -cr "$OUT" 2>/dev/null || true

IDENTITY="${DEVID:--}"
echo "签名身份：$IDENTITY"

# 抠图工具是 Resources 里的独立可执行文件，--deep 不会给它单独签名，
# 不签的话 strict 校验通不过，Gatekeeper 也可能拦。先单独签它。
CUTOUT="$OUT/Contents/Resources/app/tools/bin/cutout"
if [ -f "$CUTOUT" ]; then
  if [ "$IDENTITY" = "-" ]; then
    codesign --force --sign - "$CUTOUT" || true
  else
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$CUTOUT" || true
  fi
  echo "已签名 cutout"
fi

if [ "$IDENTITY" = "-" ]; then
  codesign --force --deep --sign - "$OUT"
else
  codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" "$OUT"
fi

codesign --verify --deep --strict --verbose=1 "$OUT"
echo "✅ 自包含 + 签名完成：$OUT"
du -sh "$OUT" | awk '{print "体积：" $1}'
