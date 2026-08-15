# Security Policy

## Supported versions

InkStack is preview software. Security fixes are applied to the latest code on the `main` branch and to the latest published release when practical.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository. If that feature is unavailable, contact the repository owner privately through their GitHub profile. Do not disclose the issue publicly until a fix is available.

Include:

- affected version or commit;
- impact and reproduction steps;
- a minimal proof of concept with secrets and personal documents removed;
- any suggested mitigation.

You can expect an acknowledgement within seven days. Timelines for a fix or coordinated disclosure depend on severity and complexity.

## Security boundaries

- Markdown files remain local unless the user explicitly invokes an AI feature.
- AI requests can include the current document or selected context and are sent to the configured provider.
- Provider API keys are read by the Tauri backend from process environment variables. They must never be committed.
- Custom AI base URLs should be treated as trusted services because they receive the request, authentication header, prompt, and selected context.
- Raw HTML in Markdown is parsed and sanitized before display. Mermaid diagrams are rendered from document content and should be kept on an up-to-date dependency version.

This project has not undergone an independent security audit.
