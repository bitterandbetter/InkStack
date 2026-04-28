#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-src-tauri/target/release/bundle/macos/InkStack.app}"
INFO_PLIST="$APP_PATH/Contents/Info.plist"

if [[ ! -d "$APP_PATH" ]]; then
  echo "InkStack bundle not found: $APP_PATH" >&2
  exit 1
fi

if [[ -f "$INFO_PLIST" ]]; then
  /usr/libexec/PlistBuddy -c "Delete :LSRequiresCarbon" "$INFO_PLIST" >/dev/null 2>&1 || true
fi

xattr -cr "$APP_PATH" || true
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
