# Releasing InkStack

InkStack is currently a preview application. Releases should be created only from a clean, reviewed `main` branch.

## Release checklist

1. Confirm the version matches in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Move relevant entries from `Unreleased` in `CHANGELOG.md` into a dated version section.
3. Run `npm run check`.
4. Run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`.
5. Run `cargo check --manifest-path src-tauri/Cargo.toml --locked`.
6. Run `npm audit --omit=dev` and review Rust dependencies with an available Rust advisory scanner.
7. Manually test opening, editing, saving, conflict handling, Markdown preview, and an AI request with redacted test content.
8. Build the desktop bundle with `npm run tauri:build`.
9. Sign and notarize distributed macOS artifacts. Do not publish unsigned artifacts as a stable release.
10. Create an annotated `vX.Y.Z` tag and a GitHub release containing release notes, checksums, supported platforms, and known limitations.

Signing credentials and provider API keys must be supplied through protected CI secrets or the local release environment and must never be committed.
