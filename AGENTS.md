# AGENTS.md

## Project

- Electron desktop app for AWS profile management, EC2 discovery, SSM shell access, and tunnel sessions.
- Main process lives in `src/main`, preload in `src/preload`, renderer in `src/renderer/src`, shared contracts in `src/shared`.

## Core Commands

- Install: `pnpm install`
- Dev: `pnpm dev`
- Dev with remote debugging: `pnpm dev:mcp`
- Test: `pnpm test`
- Build: `pnpm build`
- Local macOS DMG: `pnpm dist:mac`

## Coding Rules

- Prefer `rg` for search.
- Use `apply_patch` for manual file edits.
- Do not revert unrelated user changes.
- Keep renderer APIs behind preload only.
- Keep Electron security defaults intact:
  - `contextIsolation: true`
  - `nodeIntegration: false`

## Terminal / SSM Notes

- Interactive SSM sessions use `node-pty`.
- Treat PTY sizing and renderer resize handling as user-facing correctness issues.
- Avoid shell-string execution for AWS CLI paths; pass executable + args directly.

## Security Notes

- Validate high-risk IPC inputs in main before use.
- Do not broaden CSP for remote content.
- Do not enable remote debugging in packaged builds.

## Assets

- App icon assets live in `assets/`.
- If the icon source changes, regenerate:
  - `assets/aws-cloud.png`
  - `assets/aws-cloud.iconset/*`
  - `assets/aws-cloud.icns`

## Release Policy

- GitHub workflow-based release automation is currently removed.
- Release work is local/manual until automation is reintroduced.
- Keep this file short; detailed release steps belong in:
  - `docs/relase_guide.md`

## Release Reference

- Before releasing, read `docs/relase_guide.md`.
- That document is the source of truth for:
  - version bump flow
  - merge-to-main flow
  - DMG creation
  - ad-hoc signing workaround
  - GitHub release creation

## When Updating Docs

- Put long operational procedures in `docs/`.
- Keep `AGENTS.md` as the quick-start guide only.
