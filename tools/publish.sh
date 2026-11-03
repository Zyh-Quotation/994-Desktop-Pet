#!/bin/bash
# 一条命令发新版：升版本号 → 组装签名 → 打包 → 生成清单 →（可选）上传 GitHub Release
#
# 用法：
#   ./tools/publish.sh patch "修了什么"          # 0.2.0 → 0.2.1
#   ./tools/publish.sh minor "新增了什么"        # 0.2.0 → 0.3.0
#   ./tools/publish.sh 1.0.0 "大版本说明"
#
# 想让朋友能"自动更新"，先配一次更新源：
#   ./tools/set-update-source.sh https://你的地址/神奇宝贝/
# 之后每次发布都会自动带上这个地址。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUMP="${1:-patch}"
NOTES="${2:-}"
NODE="${NODE:-$(command -v node)}"

# ---------- 1. 算新版本号 ----------
NEW_VER=$("$NODE" -e '
const fs = require("fs");
const bump = process.argv[1];
const cur = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const [maj, min, pat] = cur.split(".").map(Number);
let next;
if (/^\d+\.\d+\.\d+$/.test(bump)) next = bump;
else if (bump === "major") next = `${maj + 1}.0.0`;
else if (bump === "minor") next = `${maj}.${min + 1}.0`;
else if (bump === "patch") next = `${maj}.${min}.${pat + 1}`;
else { console.error("版本参数只能是 patch / minor / major / x.y.z"); process.exit(1); }
console.log(next);
' "$BUMP")

echo "版本：$BUMP → $NEW_VER"
[ -n "$NOTES" ] && echo "说明：$NOTES"

# ---------- 2. 更新源 ----------
MANIFEST=$(node -p '
try { require("./update-config.json").manifest || "" } catch (e) { "" }')
if [ -z "$MANIFEST" ]; then
  echo "⚠️  还没配更新源（update-config.json 是空的）"
  echo "    这版仍然能打包，但朋友那边不会自动检查更新，只能手动下新包"
  echo "    想开自动更新：./tools/set-update-source.sh https://你的地址/"
fi

# ---------- 3. 改版本号 ----------
"$NODE" -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
p.version = process.argv[1];
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
' "$NEW_VER"

# ---------- 4. 组装 + 签名 ----------
echo ""
echo "▶ 组装并签名…"
bash tools/build-app.sh 2>&1 | tail -4

# ---------- 4.5 Mac Intel 版（可选，SKIP_INTEL=1 跳过） ----------
if [ -z "${SKIP_INTEL:-}" ]; then
  echo ""
  echo "▶ 构建 Mac Intel 版…"
  bash tools/build-app-intel.sh 2>&1 | tail -3 || echo "⚠️  Intel 构建失败，继续只发 Apple 芯片版"
fi

# ---------- 5. 打包 + 清单 ----------
echo ""
echo "▶ 打包…"
if [ -n "$MANIFEST" ]; then
  BASE="${MANIFEST%update.json}"
else
  BASE="${BASE_URL:-https://example.com/pokepet/}"
fi
RELEASE_URL="${BASE}pokepet-${NEW_VER}.zip" \
RELEASE_NOTES="$NOTES" \
  "$NODE" tools/make-release.js 2>&1 | tail -5

rm -rf release/神奇宝贝.app

# ---------- 5.5 Windows 版（可选，SKIP_WIN=1 跳过） ----------
WINZIP=""
if [ -z "${SKIP_WIN:-}" ]; then
  echo ""
  echo "▶ 构建 Windows 版…"
  if NODE="$NODE" bash tools/build-win.sh 2>&1 | tail -2; then
    WINZIP="release/pokepet-${NEW_VER}-win-x64.zip"
  else
    echo "⚠️  Windows 构建失败，继续只发 Mac 版"
  fi
fi

# ---------- 6. 上传 GitHub Release（有 gh 且已登录时才做） ----------
ZIP="release/pokepet-${NEW_VER}.zip"
ASSETS=("$ZIP" "release/update.json")
INTELZIP="release/pokepet-${NEW_VER}-mac-x64.zip"
[ -f "$INTELZIP" ] && ASSETS+=("$INTELZIP")
[ -n "$WINZIP" ] && [ -f "$WINZIP" ] && ASSETS+=("$WINZIP")
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && [ -n "${GH_RELEASE:-}" ]; then
  echo ""
  echo "▶ 上传到 GitHub Release v${NEW_VER}…"
  gh release create "v$NEW_VER" "${ASSETS[@]}" \
    --title "v$NEW_VER" --notes "${NOTES:-v$NEW_VER}" || \
    gh release upload "v$NEW_VER" "${ASSETS[@]}" --clobber
  echo "✅ 已上传：${#ASSETS[@]} 个文件"
fi

# ---------- 7. 收尾提示 ----------
echo ""
echo "────────────────────────────────────"
echo "✅ v${NEW_VER} 已打包：$ZIP"
[ -n "$MANIFEST" ] && echo "   清单：release/update.json"
echo ""
echo "接下来："
if [ -n "$MANIFEST" ]; then
  echo "   1) 把 zip 和 update.json 传到 $BASE"
  echo "   2) Mac 用户托盘 →「检查更新 ⟳」就会升到 v${NEW_VER}
   3) Windows 用户从下载页拿 win-x64.zip"
else
  echo "   1) 把 zip 发给朋友，他们重新装一次"
  echo "   2) 或者先配更新源，以后就能自动更新"
fi
echo "────────────────────────────────────"
