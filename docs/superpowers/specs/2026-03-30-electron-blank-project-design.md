# Electron Blank Project Design

## Goal

Normalize the current directory into a minimal Electron project that runs locally with `pnpm`, uses TypeScript, and follows a common modern structure suitable for later expansion.

## Chosen Approach

Use `electron-vite` with TypeScript and pin the project to versions that are mutually compatible today.

This gives a standard split between Electron main, preload, and renderer code, plus a straightforward local development flow with `pnpm dev` and production build flow with `pnpm build`.

## Scope

Included:

- `pnpm`-based project initialization and normalization of the files now present in this directory
- Electron runtime dependency and standard build tooling
- TypeScript setup for main, preload, and renderer
- Single `BrowserWindow` boot flow
- Minimal renderer page with placeholder text
- Basic scripts for development, preview, and build

Excluded:

- React, Vue, or other UI framework
- State management
- Testing framework setup
- Packaging customization beyond the default electron-vite path
- IPC APIs beyond the preload boundary placeholder

## File Structure

- `package.json`: scripts, metadata, dependencies
- `tsconfig.json`: base TypeScript configuration
- `electron.vite.config.ts`: electron-vite configuration
- `src/main/index.ts`: Electron app lifecycle, secure window creation, dev/build URL switching
- `src/preload/index.ts`: minimal preload entry point with `contextBridge`
- `src/renderer/index.html`: renderer HTML shell
- `src/renderer/src/main.ts`: renderer bootstrap
- `src/renderer/src/style.css`: minimal renderer styling

## Runtime Behavior

On `pnpm dev`, the renderer dev server starts and Electron launches a single window against the dev URL.

On `pnpm build`, the main process loads the built renderer HTML from disk.

The browser window uses:

- `contextIsolation: true`
- `nodeIntegration: false`
- preload wiring through `../preload/index.js`

The renderer shows a minimal placeholder screen indicating the project is running. No extra business logic or IPC behavior is introduced.

## Verification

Success means:

- dependencies install cleanly with `pnpm`
- `pnpm build` completes
- `pnpm dev` at minimum starts the Vite renderer server and builds main/preload successfully
- source layout is ready for future feature work

## Risks

- Dependency installation requires network access
- GUI runtime validation may be limited by the current shell environment, so shell-visible startup logs are an acceptable dev-mode proof when a window cannot be observed directly
