#!/usr/bin/env bash
set -euo pipefail

# 固定安装包输出位置
DMG_SRC="src-tauri/target/release/bundle/dmg"
DMG_DST="dist/installer"

# 创建输出目录
mkdir -p "$DMG_DST"

# 移动 DMG 文件
if [[ -d "$DMG_SRC" ]]; then
  find "$DMG_SRC" -name "*.dmg" -exec mv {} "$DMG_DST/" \;
  echo "DMG files moved to: $DMG_DST"
  ls -la "$DMG_DST"/*.dmg 2>/dev/null || echo "No DMG files found"
else
  echo "DMG source directory not found: $DMG_SRC"
fi
