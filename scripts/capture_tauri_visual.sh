#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_PATH="${1:-$ROOT_DIR/InkStack功能测试.md}"
OUTPUT_DIR="${2:-$ROOT_DIR/tmp/tauri-visual-baseline}"
SCREENSHOT_PATH="$OUTPUT_DIR/inkstack-tauri-window.png"
AI_SCREENSHOT_PATH="$OUTPUT_DIR/inkstack-tauri-window-ai-open.png"
THUMBNAIL_PATH="$OUTPUT_DIR/inkstack-tauri-window-thumb.png"
AI_THUMBNAIL_PATH="$OUTPUT_DIR/inkstack-tauri-window-ai-open-thumb.png"
REPORT_PATH="$OUTPUT_DIR/README.md"
LOG_PATH="$OUTPUT_DIR/tauri-dev.log"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "FAIL Tauri visual capture currently supports macOS only." >&2
  exit 1
fi

if [[ ! -f "$FIXTURE_PATH" ]]; then
  echo "FAIL fixture not found: $FIXTURE_PATH" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$SCREENSHOT_PATH" "$AI_SCREENSHOT_PATH" "$THUMBNAIL_PATH" "$AI_THUMBNAIL_PATH" "$REPORT_PATH" "$LOG_PATH"

cd "$ROOT_DIR"

cleanup() {
  if [[ -n "${TAURI_PID:-}" ]] && kill -0 "$TAURI_PID" >/dev/null 2>&1; then
    kill "$TAURI_PID" >/dev/null 2>&1 || true
    wait "$TAURI_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

detect_inkstack_process() {
  osascript <<'APPLESCRIPT' 2>/dev/null
tell application "System Events"
  repeat with processName in {"InkStack", "inkstack"}
    set candidateName to contents of processName
    if exists process candidateName then
      tell process candidateName
        if exists window 1 then return candidateName
      end tell
    end if
  end repeat
end tell
APPLESCRIPT
}

echo "INFO launching Tauri with fixture: $FIXTURE_PATH"
TAURI_DEV_ARGS=(dev --no-watch)
if curl -fsS "http://127.0.0.1:1420" >/dev/null 2>&1; then
  echo "INFO detected existing Vite dev server on 127.0.0.1:1420; reusing it"
  TAURI_DEV_ARGS+=(--no-dev-server-wait --config '{"build":{"beforeDevCommand":null}}')
fi

npx tauri "${TAURI_DEV_ARGS[@]}" -- -- "$FIXTURE_PATH" >"$LOG_PATH" 2>&1 &
TAURI_PID=$!

echo "INFO waiting for InkStack window"
PROCESS_NAME=""
for _ in {1..90}; do
  PROCESS_NAME="$(detect_inkstack_process || true)"
  if [[ -n "$PROCESS_NAME" ]]; then
    break
  fi
  if ! kill -0 "$TAURI_PID" >/dev/null 2>&1; then
    echo "FAIL Tauri dev process exited before the window appeared. See $LOG_PATH" >&2
    tail -80 "$LOG_PATH" >&2 || true
    exit 1
  fi
  sleep 1
done

if [[ -z "$PROCESS_NAME" ]]; then
  echo "FAIL InkStack process did not appear. See $LOG_PATH" >&2
  tail -80 "$LOG_PATH" >&2 || true
  exit 1
fi

echo "INFO detected process: $PROCESS_NAME"
osascript <<APPLESCRIPT >/dev/null 2>&1 || true
tell application "System Events"
  tell process "$PROCESS_NAME"
    set frontmost to true
  end tell
end tell
delay 1
tell application "System Events"
  tell process "$PROCESS_NAME"
    if exists window 1 then
      set frontmost to true
      set position of window 1 to {80, 80}
      set size of window 1 to {1280, 820}
    end if
  end tell
end tell
APPLESCRIPT

sleep 5

WINDOW_RECT="$(osascript <<APPLESCRIPT 2>/dev/null || true
tell application "System Events"
  tell process "$PROCESS_NAME"
    if exists window 1 then
      set windowPosition to position of window 1
      set windowSize to size of window 1
      return (item 1 of windowPosition as text) & "," & (item 2 of windowPosition as text) & "," & (item 1 of windowSize as text) & "," & (item 2 of windowSize as text)
    end if
  end tell
end tell
APPLESCRIPT
)"

if [[ ! "$WINDOW_RECT" =~ ^[0-9]+,[0-9]+,[0-9]+,[0-9]+$ ]]; then
  echo "FAIL could not resolve InkStack window bounds. Refusing to capture the whole screen as a baseline." >&2
  tail -80 "$LOG_PATH" >&2 || true
  exit 1
fi

echo "INFO capturing InkStack window rect: $WINDOW_RECT"
screencapture -x -R"$WINDOW_RECT" "$SCREENSHOT_PATH"

if [[ ! -s "$SCREENSHOT_PATH" ]]; then
  echo "FAIL screenshot was not created: $SCREENSHOT_PATH" >&2
  exit 1
fi

sips -Z 640 "$SCREENSHOT_PATH" --out "$THUMBNAIL_PATH" >/dev/null

echo "INFO opening AI panel for visual check"
osascript <<APPLESCRIPT >/dev/null 2>&1 || true
tell application "System Events"
  tell process "$PROCESS_NAME"
    set frontmost to true
  end tell
end tell
delay 0.3
tell application "System Events"
  keystroke "a" using {command down, shift down}
end tell
APPLESCRIPT

sleep 1

echo "INFO capturing InkStack window with AI panel open"
screencapture -x -R"$WINDOW_RECT" "$AI_SCREENSHOT_PATH"

if [[ ! -s "$AI_SCREENSHOT_PATH" ]]; then
  echo "FAIL AI-open screenshot was not created: $AI_SCREENSHOT_PATH" >&2
  exit 1
fi

sips -Z 640 "$AI_SCREENSHOT_PATH" --out "$AI_THUMBNAIL_PATH" >/dev/null

cat >"$REPORT_PATH" <<REPORT
# InkStack Tauri Visual Baseline

- Captured at: $(date '+%Y-%m-%d %H:%M:%S %z')
- Fixture: \`$FIXTURE_PATH\`
- Screenshot: \`$SCREENSHOT_PATH\`
- Thumbnail: \`$THUMBNAIL_PATH\`
- AI open screenshot: \`$AI_SCREENSHOT_PATH\`
- AI open thumbnail: \`$AI_THUMBNAIL_PATH\`
- Log: \`$LOG_PATH\`

## Manual Checks

- The app opens inside a real Tauri desktop window, not a browser fallback page.
- The test Markdown document is loaded as an editable Markdown file.
- Mermaid, table, code block, missing-image warning and typography are visible after switching to split/read views.
- Light/dark theme switching does not make code blocks or secondary text unreadable.
- View shortcuts remain aligned: Cmd/Ctrl+1 edit, 2 split, 3 read, 4 code.
- AI panel can open without blocking the editor.
- Opening the AI panel does not shrink the app upward or expose a blank area below the status bar.
REPORT

echo "PASS Tauri screenshot written: $SCREENSHOT_PATH"
echo "PASS Tauri visual report written: $REPORT_PATH"
