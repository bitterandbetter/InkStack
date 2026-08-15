# Open-source release checklist

This checklist separates repository preparation from actions that require repository-owner or signing access.

## Completed in the release-preparation change

- [x] Add the GPL-3.0-only license, confirmed by the copyright holder.
- [x] Document setup, validation, privacy boundaries, and project status.
- [x] Add contribution, conduct, and security policies.
- [x] Add issue forms and a pull request template.
- [x] Add frontend and Rust continuous integration.
- [x] Add automated npm, Cargo, and GitHub Actions dependency updates.
- [x] Align source version numbers at `1.1.0`.
- [x] Remove project-specific AI proxy defaults and personal filesystem paths.
- [x] Upgrade the vulnerable Mermaid dependency and verify production npm dependencies.
- [x] Add a changelog and maintainer release procedure.

## Repository-owner actions

- [x] Confirm GPL-3.0-only as the intended license and `bitterandbetter` as the copyright holder.
- [ ] Review the entire commit history for ownership, third-party code, private documents, and confidential information.
- [ ] Enable GitHub private vulnerability reporting.
- [ ] Add a concise repository description, topics, and website URL if applicable.
- [x] Protect `main`: require pull requests, passing CI, resolved conversations, and no force pushes.
- [ ] Enable secret scanning and push protection where available.
- [ ] Decide which merge strategies to allow and enable automatic deletion of merged branches.
- [x] Make the repository public.

## Before publishing a stable binary release

- [ ] Replace the external `curl` AI transport with an in-process HTTP client so API keys are not placed in child-process arguments.
- [ ] Add automated tests for file-path authorization, save-conflict handling, Markdown sanitization, and AI context boundaries.
- [ ] Complete manual desktop regression testing on each supported platform.
- [ ] Add complete application icons and confirm the bundle identifier.
- [ ] Configure macOS code signing and notarization through protected release credentials.
- [ ] Generate checksums and a software bill of materials for release artifacts.
- [ ] Document supported operating-system versions and known limitations.
- [ ] Complete a focused security review; an independent audit is recommended before handling sensitive documents.

## Known non-blocking development issue

The full npm audit currently reports a low-severity advisory in the development-only `tsx` dependency's `esbuild` version. Production-only audit is clean. Recheck before release and update `tsx` when its dependency range contains the patched `esbuild` version.
