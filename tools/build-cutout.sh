#!/bin/bash
# 编译前景抠图工具（用 macOS Vision.framework 的 VNGenerateForegroundInstanceMaskRequest）
# 产物：tools/bin/cutout（通用二进制：arm64 + x86_64，两种 mac 都能跑）
# 用法：./tools/build-cutout.sh [--force]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/tools/cutout.swift"
OUTDIR="$ROOT/tools/bin"
OUT="$OUTDIR/cutout"
mkdir -p "$OUTDIR"

if [ -f "$OUT" ] && [ "$OUT" -nt "$SRC" ] && [ "${1:-}" != "--force" ]; then
  echo "cutout 已是最新：$OUT"
  exit 0
fi

if ! command -v swiftc >/dev/null 2>&1; then
  echo "⚠️  没有 swiftc（需要 Xcode Command Line Tools）：xcode-select --install"
  echo "    跳过抠图工具编译，照片伙伴功能将不可用（其它功能不受影响）"
  exit 0
fi

DEPLOY="14.0"
TMP="$OUTDIR/.build"
mkdir -p "$TMP"
echo "▶ 编译 cutout（arm64）…"
swiftc -O -target "arm64-apple-macos${DEPLOY}" -o "$TMP/cutout-arm64" "$SRC" \
  -framework Vision -framework CoreImage -framework AppKit
echo "▶ 编译 cutout（x86_64）…"
swiftc -O -target "x86_64-apple-macos${DEPLOY}" -o "$TMP/cutout-x64" "$SRC" \
  -framework Vision -framework CoreImage -framework AppKit
echo "▶ 合并为通用二进制…"
lipo -create "$TMP/cutout-arm64" "$TMP/cutout-x64" -output "$OUT"
rm -rf "$TMP"
chmod +x "$OUT"
echo "✅ $OUT"
file "$OUT" | sed 's/^/   /'
