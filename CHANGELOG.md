# Changelog

All notable changes to InkStack will be documented in this file. The project follows Keep a Changelog conventions and Semantic Versioning.

## [Unreleased]

### Added

- GPL-3.0-only licensing and open-source project governance documentation.
- Continuous integration for frontend, Markdown regression, WYSIWYG performance, and Rust checks.
- Automated npm, Cargo, and GitHub Actions dependency updates.
- A manual Windows installer workflow that uploads artifacts to an existing release.

## [1.1.0] - 2026-08-15

### Added

- Typora-style WYSIWYG Markdown editing mode alongside source editing, split editing/reading, reading, and code modes.
- A 62-theme Markdown rendering system with paired light and dark variants.
- Comprehensive Markdown visual fixtures and WYSIWYG performance checks.

### Fixed

- Draft autosave behavior for newly created Markdown documents.
- Repeated document opening, tab-state updates, and related desktop window controls.

## [0.1.0] - 2026-07-31

Initial public preview release of the local-first InkStack desktop Markdown editor.

### Changed

- Replaced project-specific AI proxy defaults with official provider endpoints while preserving custom endpoint support through environment variables.
- Updated Mermaid to a version containing upstream security fixes.
