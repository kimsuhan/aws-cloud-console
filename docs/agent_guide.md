# Agent Guide

This repository is an internal developer Electron app for AWS-managed workflows. The primary agent references are:

- `AGENTS.md`: Codex-first working rules
- `CLAUDE.md`: shared agent operating rules
- `.mcp.json` and `.cursor/mcp.json`: local Electron MCP setup
- `docs/release_guide.md`: release workflow

## What agents should optimize for

- Safe feature work across `src/main`, `src/preload`, `src/renderer/src`, and `src/shared`
- Live Electron validation when tests do not fully prove UI behavior
- AWS-sensitive correctness for profiles, tunnels, session launch, and secrets handling
- Small, reviewable changes with docs updated when workflows change

## Recommended operating flow

1. Read the relevant files and trace shared contracts before editing.
2. Prefer the smallest change that preserves Electron security boundaries.
3. Run `pnpm test` after behavior changes.
4. Run `pnpm build` after bootstrap, preload, packaging, or config changes.
5. For UI-heavy or terminal-heavy work, verify in the live app with Electron MCP when uncertainty remains.
6. Update docs when release, security, or MCP setup expectations change.

## Electron MCP workflow

Start the app with remote debugging in development only:

```bash
pnpm dev:mcp
```

Start the MCP server in another terminal:

```bash
pnpm mcp:electron
```

Then attach using the repository-local config from `.mcp.json` or `.cursor/mcp.json`.

Use this path when agents need to inspect:

- layout and responsive behavior
- focus handling
- loading, empty, and error states
- SSM terminal rendering and resize behavior
- multi-tab or multi-workspace transitions

## AWS and security reminders

- Validate high-risk IPC input in the main process.
- Keep renderer access behind preload only.
- Never log secrets, tokens, or private tunnel/session details.
- Use executable plus argument arrays for AWS CLI invocations, not shell strings.
- Keep `contextIsolation: true` and `nodeIntegration: false`.

## Release reminders

Before release work, read `docs/release_guide.md`.

Minimum release verification:

```bash
pnpm test
pnpm build
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/AWS Cloud Console.app"
hdiutil imageinfo "release/AWS Cloud Console-<version>-arm64.dmg"
```
