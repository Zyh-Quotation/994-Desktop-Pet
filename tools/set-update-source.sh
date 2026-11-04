#!/bin/bash
# 配置更新源（只需一次）。之后 publish.sh 打包时会自动把这个地址写进 app。
# 用法：./tools/set-update-source.sh https://你的地址/pokepet/
#       ./tools/set-update-source.sh ""     # 清空（关闭自动更新检查）
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:-}"
if [ -z "$BASE" ]; then
  printf '{\n  "manifest": ""\n}\n' > update-config.json
  echo "已清空更新源"
  exit 0
fi

BASE="${BASE%/}/"
node -e '
const fs = require("fs");
const base = process.argv[1];
fs.writeFileSync("update-config.json", JSON.stringify({ manifest: base + "update.json" }, null, 2) + "\n");
' "$BASE"

echo "更新源已设置："
cat update-config.json

if [[ "$BASE" == *"example.com"* ]]; then
  echo "⚠️  这还是示例地址，换成真实能访问的地址再发布"
fi
