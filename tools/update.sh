#!/bin/bash
# 从主进程传来的更新信息安装更新：./tools/update.sh <zip 地址> <sha256> <版本号>
# 下载 → 校验 sha256 → 备份旧 app → 替换 → 重启
# 只需要 curl / shasum / ditto，不依赖 node（用户机器上不一定装）
set -euo pipefail

URL="${1:-}"
SHA="${2:-}"
VER="${3:-unknown}"

if [ -z "$URL" ] || [ -z "$SHA" ]; then
  echo "用法: ./tools/update.sh <zip 地址> <sha256> [版本号]"
  exit 1
fi

# 优先用 ~/Applications，没有就找 /Applications
APP="${APP:-}"
if [ -z "$APP" ]; then
  for p in "$HOME/Applications/桌面宠物.app" "/Applications/桌面宠物.app" "$HOME/Applications/神奇宝贝.app"; do
    if [ -d "$p" ]; then APP="$p"; break; fi
  done
fi
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "❌ 找不到已安装的「桌面宠物.app」"
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "目标版本：$VER"
curl -fsSL --max-time 300 "$URL" -o "$TMP/update.zip"
ACTUAL=$(shasum -a 256 "$TMP/update.zip" | awk '{print $1}')
if [ "$ACTUAL" != "$SHA" ]; then
  echo "❌ 校验失败：期望 $SHA，实际 $ACTUAL"
  exit 1
fi
echo "✅ 校验通过"

ditto -x -k "$TMP/update.zip" "$TMP/unpack"
NEW_APP=$(find "$TMP/unpack" -maxdepth 2 -name '*.app' -type d -print -quit)
[ -n "$NEW_APP" ] || { echo "❌ 压缩包里没有 .app"; exit 1; }

# 存档位置取决于旧包形态：
#   自包含正式包 → ~/Library/Application Support/桌面宠物（旧版为「神奇宝贝」）
#   开发链接版（Resources/app 软链到 ~/Applications/桌宠）→ 项目目录的 userdata/
# 覆盖成自包含新包后存档位置会切换，这里把旧存档搬过去，避免"更新完数据没了"。
NEW_SUPPORT="$HOME/Library/Application Support/桌面宠物"
DEV_SAVE_DIR="$HOME/Applications/桌宠/userdata"
migrate_save() {
  mkdir -p "$NEW_SUPPORT"
  for f in pet-state.json pet-state.json.bak pet-state.json.bak2; do
    [ -f "$DEV_SAVE_DIR/$f" ] && cp "$DEV_SAVE_DIR/$f" "$NEW_SUPPORT/$f"
  done
  echo "✅ 已把开发版存档迁移到 $NEW_SUPPORT"
  return 0
}
if [ -f "$DEV_SAVE_DIR/pet-state.json" ]; then
  if [ ! -f "$NEW_SUPPORT/pet-state.json" ]; then
    migrate_save
  elif [ "$(stat -f %m "$DEV_SAVE_DIR/pet-state.json")" -gt "$(stat -f %m "$NEW_SUPPORT/pet-state.json")" ]; then
    # 两边都有：开发版的修改时间较新才覆盖
    migrate_save
  fi
fi

pkill -f "$APP/Contents/MacOS/" 2>/dev/null || true
rm -rf "$APP.bak"
mv "$APP" "$APP.bak"
# 保留签名/权限/扩展属性；cp -R 可能破坏代码签名
if ! ditto "$NEW_APP" "$APP"; then
  rm -rf "$APP"
  mv "$APP.bak" "$APP"
  echo "❌ 解压失败，已回滚到旧版本"
  exit 1
fi

pkill -f "$APP/Contents/MacOS/" 2>/dev/null || true
sleep 1
open "$APP"
echo "✅ 已更新到 ${VER}（旧版本备份在 ${APP}.bak）"
