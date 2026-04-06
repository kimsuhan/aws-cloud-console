# AGENTS.md

## Project

- Electron desktop app for AWS profile management, EC2 discovery, SSM shell access, and tunnel sessions.
- Main process lives in `src/main`, preload in `src/preload`, renderer in `src/renderer/src`, shared contracts in `src/shared`.
- IPC shapes and channel names live in `src/shared/contracts.ts`; keep main, preload, and renderer in sync when they change.
- Visible app naming comes from `package.json` (`productName`, `build.productName`); update both when rebranding.

## Core Commands

- Install: `pnpm install`
- Dev: `pnpm dev`
- Dev with remote debugging: `pnpm dev:mcp` (sets `ELECTRON_REMOTE_DEBUGGING_PORT=9222` for attachable devtools/MCP tooling)
- Electron MCP server: `pnpm mcp:electron` (runs `npx -y @ohah/electron-mcp-server`)
- Test: `pnpm test` (matches `src/**/*.test.ts` and `src/**/*.test.tsx`)
- Build: `pnpm build`
- Preview production build locally: `pnpm preview`
- Local macOS DMG: `pnpm dist:mac`

## Stack (reference)

- TypeScript + React renderer, Electron main/preload, bundled with `electron-vite` (`pnpm` is the supported package manager).
- `node-pty` is native; after Node or Electron upgrades, re-check that SSM terminals still spawn and resize correctly.

## Visual verification (Electron MCP)

- When automated tests are insufficient, **run the real app and validate on screen**—including layout, focus, animations, and PTY/resize behavior.
- Use `@ohah/electron-mcp-server` when you need an agent to **drive the live Electron UI** (open windows, click, capture state) instead of guessing from code alone.
- Recommended flow:
  - Terminal A: `pnpm dev:mcp` so the app exposes the debugging port expected by MCP helpers.
  - Terminal B (or Cursor MCP): `pnpm mcp:electron` so tools can attach to the running app.
- Treat failures reproduced only in the real UI as **blocking** until understood; add or extend tests when the root cause is clear.
- This path is **dev-only**; never widen security settings or enable remote debugging for packaged release builds.
- Wire MCP in the IDE using the project’s MCP config (e.g. `.cursor/mcp.json`) when the environment should attach automatically; otherwise the two-terminal flow above is enough.

## i18n & copy

- Add or tweak user-visible copy through the existing i18n patterns (`src/renderer/src/i18n.tsx`) so Korean and English stay in sync.

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
- Keep this file at **100 lines** (including section spacing); move long checklists to `docs/` and link from here:
  - `docs/release_guide.md`

## Release Reference

- Before releasing, read `docs/release_guide.md`.
- That document is the source of truth for:
  - version bump flow
  - merge-to-main flow
  - DMG creation
  - ad-hoc signing workaround
  - GitHub release creation

## When updating docs

- Put long operational procedures in `docs/`.
- Prefer updating `AGENTS.md` only when a rule affects day-to-day implementation or verification (including MCP-driven UI checks).

## Before claiming work is complete

- Run `pnpm test`. If `tsx` fails with `EPERM` on an IPC pipe inside a sandboxed agent, re-run tests with full permissions or on the host machine.
- For UI or interaction-heavy changes, back up tests with a quick `pnpm dev` **or** MCP-driven UI verification when uncertainty remains.
- After IPC or security-sensitive edits, grep for all channel users and update `contracts`, handlers, and tests together.
- Run `pnpm build` when you touch `electron.vite.config.ts`, preload wiring, or main window/session bootstrap so packaged output still resolves.
- Live AWS behavior depends on the user’s profiles and network; UI or CLI checks still need human context for real account data.
- Use `docs/superpowers/plans/` for long architecture write-ups—summarize here only when it changes everyday agent workflow.
