# Contributing to InkStack

Thank you for helping improve InkStack.

## Before you start

- Search existing issues before opening a new one.
- For substantial features or architecture changes, open a discussion or issue first.
- Never include API keys, private documents, personal paths, or other sensitive data in an issue, commit, screenshot, or test fixture.
- Read `AGENTS.md` for the project's product and architecture constraints.

## Local setup

Prerequisites:

- Node.js 20 or newer
- npm
- Rust stable
- The platform prerequisites listed in the Tauri 2 documentation

```bash
npm ci
npm run tauri:dev
```

The browser-only Vite view is useful for interface work, but file-system and AI-provider features require the Tauri app:

```bash
npm run dev
```

## Before opening a pull request

Run:

```bash
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

Keep pull requests focused. Describe the user-visible behavior, testing performed, security or privacy impact, and screenshots for interface changes.

## Reporting security issues

Do not open a public issue for a suspected vulnerability. Follow `SECURITY.md`.
