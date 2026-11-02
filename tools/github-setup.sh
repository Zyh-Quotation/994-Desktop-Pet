#!/bin/bash
# 一次性：把项目推上 GitHub，并把更新源指向 Release 的 latest 地址
# 用法：./tools/github-setup.sh [仓库名]   默认 pokepet
set -euo pipefail
cd "$(dirname "$0")/.."

command -v gh >/dev/null 2>&1 || { echo "❌ 先安装：brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ 先登录：gh auth login"; exit 1; }

NAME="${1:-pokepet}"
OWNER=$(gh api user -q .login)
echo "账号：$OWNER"
echo "仓库：$NAME"

if gh repo view "$OWNER/$NAME" >/dev/null 2>&1; then
  echo "仓库已存在，直接推送"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$NAME.git"
  git push -u origin HEAD 2>&1 | tail -3
else
  gh repo create "$NAME" --public --source=. --remote=origin --push 2>&1 | tail -3
fi

BASE="https://github.com/$OWNER/$NAME/releases/latest/download/"
bash tools/set-update-source.sh "$BASE"

git add update-config.json package.json 2>/dev/null || true
git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" \
  commit -q -m "设置更新源为 GitHub Releases" 2>/dev/null || true
git push -q 2>/dev/null || true

echo ""
echo "✅ 仓库：https://github.com/$OWNER/$NAME"
echo "✅ 更新源：$BASE"
echo ""
echo "下一步发版："
echo "  GH_RELEASE=1 ./tools/publish.sh patch \"说明\""
