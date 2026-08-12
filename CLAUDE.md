# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read AGENT.md first

`AGENT.md` (in Chinese) is the project's standing instruction file with hard constraints. Key non-negotiables from it:

- InkStack is a **local-first macOS desktop app** (Tauri 2), not a web app. Judge product/architecture decisions as a desktop app; React/Vite is only the UI layer.
- Markdown files stay native `.md`/`.markdown` — no private formats.
- AI must never overwrite document content directly: show preview/diff, require user confirmation. AI context is minimized by default (current doc or explicit selection only); never bulk-read the workspace without authorization.
- API keys never go in frontend source or plaintext persistence (dev builds use `sessionStorage`; desktop path is env vars / Rust backend).
- Preview rendering must be debounced; if `rehype-raw` is enabled it must be paired with sanitize.
- File saves check the `modifiedAt`/`size` baseline to detect external modification before writing.
- Directory scans skip hidden files, `node_modules`, build artifacts; large scans are async/lazy.
- UI copy is Chinese-first.
- On conflicts: user's current request > AGENT.md hard constraints > current code reality > old-project experience.

## Path quirk

The repo directory name contains Chinese characters (`inkstack-(墨栈)`). Absolute paths can fail in Read/Write/Edit tools due to Unicode normalization (NFC vs NFD) mismatch. If absolute-path file tools report "file does not exist" for files that clearly exist, fall back to Bash with **relative paths** from the working directory.

## Commands

```bash
npm run dev                          # Vite dev server (port 1420, browser-only)
npm run tauri:dev                    # Full desktop app (required for file system, AI, menus)
npm run lint                         # tsc --noEmit (type check)
npm run build                        # vite build
npm run test:markdown                # markdown pipeline regression script
npm run test:markdown:visual         # visual regression for markdown rendering
npm run tauri:build:mac              # release build + macOS bundle fixes
npm run tauri:build:mac:install      # build + move DMG to dist/installer/
```

Tests are in `scripts/` (e.g. `check_markdown_regression.ts` runs the preview pipeline against `tests/fixtures/InkStack功能测试.md`). Rust side: `cargo check` / `cargo build` inside `src-tauri/`.

Verification expectations (from AGENT.md): after changes run `npm run lint` and `npm run build`; desktop-capability changes must be verified via Tauri dev/build. If verification can't run, say so explicitly in the final reply.

## Architecture

Tauri 2 app: React 19 + TypeScript + Zustand frontend, Rust backend. The frontend never touches the file system or AI APIs directly — everything goes through Tauri commands.

### Frontend ↔ backend boundary

- `src/lib/tauriRuntime.ts` wraps `invoke`/`listen`/`getCurrentWindow` and throws outside the Tauri runtime. All other frontend code imports from here, never from `@tauri-apps/api` directly.
- Every Rust command is registered in the `invoke_handler` list in `src-tauri/src/lib.rs`. Frontend wrappers live in `src/lib/` (`fs.ts` for files/workspace/settings, `ai.ts` for AI generation/streaming, `knowledge.ts` for the knowledge index, `export.ts`, etc.). Adding a backend capability means: Rust command in the matching `src-tauri/src/*_commands.rs` module → register in `lib.rs` → typed wrapper in `src/lib/`.

### Rust backend (`src-tauri/src/`)

`AppState` in `lib.rs` is the core: `workspace_root` is the **trust boundary** for file-tree operations; `allowed_files` whitelists files opened via dialog/drag-drop/file-association outside the workspace; a `notify` watcher emits workspace-change events; `ai_streams` maps frontend request ids to cancellable curl processes; `workspace_index` holds the in-memory, rebuildable knowledge index. Modules are grouped by domain: `file_commands`, `save_commands` (external-modification conflict detection), `workspace_commands`/`workspace_search`, `workspace_index`/`workspace_index_store` (wiki links, backlinks, tags, graph), `ai_commands`/`ai_config`/`ai_providers` (OpenAI-compatible, Anthropic, Gemini, NVIDIA), `theme_commands`, `asset_commands` (image import/resolution).

### Frontend layering

- `src/components/` — UI and local interaction only; heavy logic belongs in `src/lib/` or a feature directory.
  - `src/components/aiPanel/` — AI panel hooks (9 hooks: useAiChat, useAiSettings, useCodeBlocks, etc.)
- `src/lib/` — framework-weak logic: parsers, Tauri wrappers, AI context, themes, paths.
  - `src/lib/ai/` — AI helpers and types (helpers.ts, types.ts)
  - `src/lib/editor/` — Editor utilities (find.ts, language.ts, actions.ts, types.ts)
  - `src/lib/hooks/` — Global hooks (useDesktopEvents.ts)
  - `src/lib/i18n/` — Internationalization strings
- `src/store.ts` — single Zustand store (~1250 lines): documents/tabs, save states, view modes, theme/reading settings, AI config, dialogs.
- `src/features/preview/` — markdown render pipeline and preview components.
- `src/App.tsx` — layout composition only.

### Event/command flow

Two distinct buses:
1. **Desktop events** (Rust → frontend): native menu items, file-watcher changes, startup file-association paths, drag-drop — all handled in `src/lib/hooks/useDesktopEvents.ts`. Startup paths are queued in Rust (`startup_markdown_paths`) and drained once by the frontend because events can fire before the WebView listener is ready.
2. **In-app commands**: `src/lib/appCommands.ts` defines `AppCommandId` (shared by menu, command palette, shortcuts); `src/lib/appEvents.ts` dispatches typed editor/AI-panel commands between components (e.g. toolbar → CodeMirror editor, selection → AI panel).

### AI flow

UI (AIPanel/inline AI) → context confirmation dialog (`AiContextDialog`, per AGENT.md constraint) → `src/lib/ai.ts` → Rust `generate_ai_text_stream` (streamed via events, cancellable by request id) → result rendered as a block-level diff (`aiDiff.tsx`) the user accepts/rejects per change block.
