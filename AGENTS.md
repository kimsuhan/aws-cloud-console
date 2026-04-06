# AGENTS.md

## Project

- Internal developer desktop app for AWS-managed workflows.
- Main process: `src/main`
- Preload bridge: `src/preload`
- Renderer: `src/renderer/src`
- Shared IPC contracts: `src/shared/contracts.ts`

## Core Loop

- Define the problem before editing code.
- Make small, reversible changes.
- Verify with tests, build, and live UI checks when needed.
- Keep docs in sync with behavior changes.

## Daily Commands

- Install: `pnpm install`
- Dev: `pnpm dev`
- Dev with remote debugging: `pnpm dev:mcp`
- Electron MCP server: `pnpm mcp:electron`
- Test: `pnpm test`
- Build: `pnpm build`
- Preview packaged renderer: `pnpm preview`
- Local macOS release: `pnpm dist:mac`

## Project Rules

- Read related files before editing them.
- Use `rg` for search.
- Use `apply_patch` for manual edits.
- Do not revert unrelated user changes.
- Keep renderer access behind preload only.
- Keep IPC handlers, preload APIs, and `src/shared/contracts.ts` aligned.
- Add or update tests for behavior changes when practical.
- Keep long procedures in `docs/`; keep this file short.

## Electron Boundaries

- Preserve `contextIsolation: true`.
- Preserve `nodeIntegration: false`.
- Do not bypass preload to expose Node or AWS access in the renderer.
- Validate high-risk IPC input in the main process before using it.
- Do not broaden CSP for remote content.
- Do not enable remote debugging in packaged builds.

## AWS / Session Safety

- Treat profile selection, session launch, and tunnel setup as security-sensitive flows.
- Avoid shell-string execution for AWS CLI paths; pass executable and args separately.
- Treat PTY sizing and renderer resize handling as user-facing correctness issues.
- Fail closed when required AWS dependencies or runtime settings are missing.
- Never log secrets, session tokens, or private connection details.

## UI Verification

- For UI-heavy work, do not rely on code inspection alone when behavior is uncertain.
- Preferred live path:
  - Start app: `pnpm dev:mcp`
  - Start MCP server: `pnpm mcp:electron`
  - Attach through `.mcp.json` or `.cursor/mcp.json`
- Validate layout, focus, loading states, empty states, session tabs, and terminal resize behavior in the real app when tests are insufficient.

## Release Rules

- Read `docs/release_guide.md` before release work.
- Release version source is `package.json`.
- Release branch source of truth is `main`.
- For release changes, verify:
  - `pnpm test`
  - `pnpm build`
  - `codesign --verify --deep --strict --verbose=2 "release/mac-arm64/AWS Cloud Console.app"`
  - `hdiutil imageinfo "release/AWS Cloud Console-<version>-arm64.dmg"`

## Documentation

- Update docs when workflows, security assumptions, release steps, or MCP setup change.
- Agent operations guide: `docs/agent_guide.md`
- Release guide: `docs/release_guide.md`
