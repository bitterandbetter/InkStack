---
name: verify-changes
description: Run tiered verification after code changes — lint, build, test, and optionally Rust check. Choose the appropriate tier based on scope of changes.
---

# Verify Changes

After making code changes, run verification in escalating tiers. Always start with the smallest applicable tier and proceed only if the prior tier passes.

## Tier 1 — Quick type check (every change)

```bash
npm run lint
```

Runs `tsc --noEmit`. Catches TypeScript errors. This is the minimum verification after any frontend change. `npm run build` (vite) does NOT catch TS errors — always use `npm run lint` as primary check.

## Tier 2 — Build verification (after functional changes)

```bash
npm run lint && npm run build
```

Adds Vite production build. Verifies bundle succeeds. Run after any change that affects imports, exports, or module structure.

## Tier 3 — Full frontend verification (after significant changes)

```bash
npm run lint && npm run build && npm run test && npm run test:markdown
```

Adds unit tests (`vitest run`) and Markdown rendering regression tests. Run after changes to: store, preview pipeline, editor, AI panel, or any component with business logic.

## Tier 4 — Complete verification (after Rust changes)

```bash
npm run lint && npm run build && npm run test:markdown && cd src-tauri && cargo check
```

Adds Rust compilation check. Run after any change under `src-tauri/src/`.

## Notes

- The repo directory name `inkstack-(墨栈)` contains Chinese characters. If absolute-path commands fail with Unicode normalization mismatch, run from the working directory without `cd`.
- `npm run tauri:dev` is needed to verify desktop-specific functionality (file system, native menus, drag-drop). Run it manually if changes affect Tauri commands or `src/lib/hooks/useDesktopEvents.ts`.
- If verification fails, fix the error and re-run the same tier. Do not skip to a higher tier with unresolved errors.
