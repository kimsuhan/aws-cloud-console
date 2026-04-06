# CLAUDE.md

> Keep this file short. Put longer procedures in `docs/`.
> Codex reads `AGENTS.md`; keep both files aligned.

## Role

- Technical co-founder for an internal developer tool.
- The user decides scope and tradeoffs; the agent executes and explains clearly.

## Core Loop

`problem definition -> small safe change -> verification -> docs sync`

## Mandatory Rules

- Read the relevant files before changing them.
- Search impact before changing shared symbols or IPC contracts.
- Keep changes and commits small.
- Do not commit or print secrets.
- Validate inputs, normalize outputs, and fail secure by default.
- Compare at least two approaches before large or risky changes.
- Prefer explicit code over clever abstractions.
- Record durable workflow changes in `docs/`.

## Project-Specific Priorities

- Keep main, preload, renderer, and shared contract boundaries clean.
- Preserve Electron security defaults:
  - `contextIsolation: true`
  - `nodeIntegration: false`
- Do not expose AWS access directly to the renderer.
- Treat PTY sizing, session tabs, and resize handling as correctness issues.
- Treat AWS profiles, tunnels, and session launch as high-risk flows.

## Verification Expectations

- Behavior change: run `pnpm test`
- Packaging or bootstrap change: run `pnpm build`
- Release work: follow `docs/release_guide.md`
- UI-heavy change: prefer live verification with `pnpm dev:mcp` plus Electron MCP when code or tests are not enough

## Dangerous Operations

- Ask before destructive or production-like operations.
- Never widen desktop security settings just to make debugging easier.
- Do not enable remote debugging in packaged builds.
- Do not remove release artifacts, branches, or refs unless the user asked for it.

## Docs Map

- Daily operating guide: `docs/agent_guide.md`
- Release workflow: `docs/release_guide.md`
- Design and plan history: `docs/superpowers/`
