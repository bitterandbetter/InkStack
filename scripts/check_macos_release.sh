#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-src-tauri/target/release/bundle/macos/InkStack.app}"
DMG_GLOB="${2:-src-tauri/target/release/bundle/dmg/*.dmg}"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
APP_EXECUTABLE="$APP_PATH/Contents/MacOS/InkStack"
APP_ICON="$APP_PATH/Contents/Resources/icon.icns"
INSTALLED_APP="/Applications/InkStack.app"
TAURI_CONFIG="src-tauri/tauri.conf.json"

if [[ ! -d "$APP_PATH" ]]; then
  echo "FAIL app bundle missing: $APP_PATH" >&2
  exit 1
fi

if [[ ! -f "$INFO_PLIST" ]]; then
  echo "FAIL Info.plist missing: $INFO_PLIST" >&2
  exit 1
fi

echo "PASS app bundle exists: $APP_PATH"

if [[ -f "$TAURI_CONFIG" ]]; then
  echo "PASS Tauri config exists: $TAURI_CONFIG"
  if grep -q '"targets": \["app", "dmg"\]' "$TAURI_CONFIG"; then
    echo "PASS Tauri bundle targets include app and dmg"
  else
    echo "FAIL Tauri bundle targets should include app and dmg" >&2
    exit 1
  fi
  if grep -q '"ext": \["md", "markdown"\]' "$TAURI_CONFIG"; then
    echo "PASS Tauri config declares md and markdown file associations"
  else
    echo "FAIL Tauri config is missing md/markdown file associations" >&2
    exit 1
  fi
else
  echo "WARN Tauri config not found from current directory: $TAURI_CONFIG"
fi

bundle_id=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$INFO_PLIST")
bundle_name=$(/usr/libexec/PlistBuddy -c "Print :CFBundleName" "$INFO_PLIST")
document_extensions=$(/usr/libexec/PlistBuddy -c "Print :CFBundleDocumentTypes:0:CFBundleTypeExtensions" "$INFO_PLIST" || true)

if [[ "$bundle_name" == "InkStack" ]]; then
  echo "PASS bundle name: $bundle_name"
else
  echo "FAIL unexpected bundle name: $bundle_name" >&2
  exit 1
fi

if [[ "$bundle_id" == "com.inkstack.desktop" ]]; then
  echo "PASS bundle identifier: $bundle_id"
else
  echo "FAIL unexpected bundle identifier: $bundle_id" >&2
  exit 1
fi

if echo "$document_extensions" | grep -Eq "md" && echo "$document_extensions" | grep -Eq "markdown"; then
  echo "PASS Markdown file association includes md and markdown"
else
  echo "FAIL Markdown file association missing" >&2
  exit 1
fi

if [[ -x "$APP_EXECUTABLE" ]]; then
  echo "PASS app executable exists: $APP_EXECUTABLE"
else
  echo "FAIL app executable missing: $APP_EXECUTABLE" >&2
  exit 1
fi

if [[ -f "$APP_ICON" ]]; then
  echo "PASS app icon exists: $APP_ICON"
else
  echo "FAIL app icon missing: $APP_ICON" >&2
  exit 1
fi

if codesign --verify --deep --strict "$APP_PATH" >/dev/null 2>&1; then
  echo "PASS app bundle signature verifies"
else
  echo "FAIL app bundle signature verification failed" >&2
  exit 1
fi

signature_authority=$(codesign -dv "$APP_PATH" 2>&1 | grep -E "^Authority=" || true)
if echo "$signature_authority" | grep -q "Developer ID Application"; then
  echo "PASS Developer ID signature detected"
else
  echo "WARN Developer ID signature not detected. Local ad-hoc signing is OK for development; release distribution still needs Developer ID signing."
fi

if spctl --assess --type execute "$APP_PATH" >/dev/null 2>&1; then
  echo "PASS Gatekeeper assessment accepts the app"
else
  echo "WARN Gatekeeper assessment did not accept the app. This is expected before notarization or with ad-hoc signing."
fi

if xcrun stapler validate "$APP_PATH" >/dev/null 2>&1; then
  echo "PASS notarization ticket is stapled to the app"
else
  echo "WARN notarization ticket not detected. Public distribution needs notarization and stapling."
fi

if xattr -p com.apple.quarantine "$APP_PATH" >/dev/null 2>&1; then
  echo "WARN app bundle has quarantine attribute. Remove it only for local development after verifying source."
else
  echo "PASS app bundle has no quarantine attribute"
fi

if [[ -d "$INSTALLED_APP" ]]; then
  echo "PASS installed app exists: $INSTALLED_APP"
else
  echo "WARN app is not installed in /Applications. Install there before final Finder/default-editor validation."
fi

shopt -s nullglob
dmg_files=($DMG_GLOB)
if (( ${#dmg_files[@]} > 0 )); then
  echo "PASS DMG exists: ${dmg_files[0]}"
  if hdiutil imageinfo "${dmg_files[0]}" >/dev/null 2>&1; then
    echo "PASS DMG imageinfo verifies"
  else
    echo "FAIL DMG imageinfo failed" >&2
    exit 1
  fi
else
  echo "WARN DMG not found. Run npm run tauri:build:mac after enabling the dmg target."
fi

cat <<'CHECKLIST'
Manual release checklist:
- Install InkStack.app into /Applications.
- Double-click a .md file in Finder and confirm InkStack opens it.
- Drag a .md file onto the Dock icon and confirm it opens as a tab.
- Use Finder "Get Info" to set InkStack as the default editor for .md/.markdown.
- For public distribution, sign with Developer ID, notarize, staple, then re-run this script.
CHECKLIST

echo "macOS release checks completed"
