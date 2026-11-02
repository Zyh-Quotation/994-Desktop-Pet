#!/bin/bash
# 给「神奇宝贝.app」签名
#   ./tools/sign-app.sh                 # ad-hoc 签名（本机用，无需证书）
#   DEVID="Developer ID Application: 你的名字 (TEAMID)" ./tools/sign-app.sh   # 真机分发签名
set -euo pipefail

APP="${APP:-$HOME/Applications/神奇宝贝.app}"
IDENTITY="${DEVID:--}"

echo "应用：$APP"
echo "身份：$IDENTITY"

xattr -cr "$APP" 2>/dev/null || true

if [ "$IDENTITY" = "-" ]; then
  codesign --force --deep --sign - "$APP"
else
  codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" "$APP"
fi

codesign --verify --deep --strict --verbose=2 "$APP"
echo
codesign -dv "$APP" 2>&1 | sed -n '1,6p'
echo "✅ 签名完成"
