# InkStack

InkStack（墨栈）is a local-first desktop Markdown workspace for writing, reading, and optional AI-assisted editing. It uses React, TypeScript, CodeMirror 6, and Tauri 2 while keeping documents as ordinary `.md` and `.markdown` files.

> **Project status:** early preview. Core workflows are implemented, but the project has not yet published signed desktop binaries or completed an independent security audit.

## Highlights

- Open local Markdown files and workspace folders.
- Edit with CodeMirror and preview GFM, tables, task lists, math, highlighted code, Mermaid diagrams, and relative images.
- Use tabs, an outline, search, themes, layout modes, export, recent workspaces, and native desktop menus.
- Detect external file changes before saving to reduce accidental overwrites.
- Use optional OpenAI-compatible, Anthropic, or Gemini APIs with explicit context selection and review-before-apply AI editing.

## Privacy and AI

Normal file editing is local. InkStack sends data over the network only when an AI feature is invoked. An AI request can include the prompt and the current document or context selected in the confirmation interface.

Provider API keys are read by the Tauri backend from process environment variables; they are not stored in the repository or persisted by the frontend. The selected provider or custom base URL receives the authentication header, prompt, and selected context. Review [SECURITY.md](SECURITY.md) before using AI features with sensitive material.

## Requirements

- Node.js 20 or newer
- npm
- Rust stable
- Tauri 2 platform prerequisites

The desktop application currently targets macOS as its primary platform. Other desktop platforms have not been release-qualified.

## Run the desktop app

```bash
git clone https://github.com/bitterandbetter/InkStack.git
cd InkStack
npm ci
npm run tauri:dev
```

For browser-only interface development:

```bash
npm run dev
```

The browser view does not provide the complete local file-system or backend AI behavior.

## Configure an AI provider

AI is optional. Export one provider's variables before starting the Tauri process. The values in `.env.example` document supported names, but `.env` files are not loaded automatically.

OpenAI-compatible:

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-4.1"
# Optional for a compatible provider:
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

Anthropic:

```bash
export ANTHROPIC_API_KEY="..."
export ANTHROPIC_MODEL="claude-sonnet-4-20250514"
export ANTHROPIC_BASE_URL="https://api.anthropic.com/v1"
```

Gemini:

```bash
export GEMINI_API_KEY="..."
export GEMINI_MODEL="gemini-2.5-pro"
export GEMINI_BASE_URL="https://generativelanguage.googleapis.com"
```

Never commit real keys. If a key is accidentally committed, revoke it immediately and follow the incident guidance in [SECURITY.md](SECURITY.md).

## Validate a change

```bash
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

## Project structure

```text
src/                    React interface, editor, preview, and application state
src-tauri/              Tauri configuration and Rust desktop backend
scripts/                Maintainer utilities
assets/                 Repository test assets
.github/                CI, dependency updates, and contribution templates
```

## Contributing and releases

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security reports must follow [SECURITY.md](SECURITY.md), not a public issue. Repository owners can track the remaining publication work in the [open-source checklist](docs/OPEN_SOURCE_CHECKLIST.md), and release maintainers should use [docs/RELEASING.md](docs/RELEASING.md).

## License

Copyright © 2026 bitterandbetter.

InkStack is free software licensed under the [GNU General Public License, version 3 only](LICENSE) (`GPL-3.0-only`). If you distribute InkStack or a modified version, the GPL's source-code and license obligations apply.
