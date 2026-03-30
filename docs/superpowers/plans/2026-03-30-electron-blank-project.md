# Electron Blank Project Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the current directory into a minimal Electron project using `pnpm`, `electron-vite`, and TypeScript.

**Architecture:** The project is split into Electron main, preload, and renderer entry points. `electron-vite` handles the development server and build orchestration, while the renderer stays framework-free and intentionally minimal.

**Tech Stack:** `pnpm`, `electron`, `electron-vite`, `vite`, `typescript`

---

## Chunk 1: Project Bootstrap

### Task 1: Create or reconcile package and tool configuration

**Files:**
- Create or update: `package.json`
- Create or update: `tsconfig.json`
- Create or update: `electron.vite.config.ts`

- [ ] **Step 1: Define package scripts and dependencies**

Add `dev`, `build`, and `preview` scripts plus the Electron runtime and the minimal build-time dependencies, using mutually compatible versions rather than unconstrained latest majors.

- [ ] **Step 2: Define TypeScript configuration**

Create a general TS config suitable for Electron and renderer code.

- [ ] **Step 3: Define electron-vite configuration**

Wire `main`, `preload`, and `renderer` entries with the standard config helper.

## Chunk 2: Runtime Source Files

### Task 2: Add or reconcile main, preload, and renderer entries

**Files:**
- Create or update: `src/main/index.ts`
- Create or update: `src/preload/index.ts`
- Create or update: `src/renderer/index.html`
- Create or update: `src/renderer/src/main.ts`
- Create or update: `src/renderer/src/style.css`

- [ ] **Step 1: Add Electron main process entry**

Create the app lifecycle code and open one `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, preload wiring, and explicit dev/build renderer loading behavior.

- [ ] **Step 2: Add preload entry**

Keep the preload boundary minimal and safe for later extension by exposing an empty API through `contextBridge`.

- [ ] **Step 3: Add renderer shell**

Create a placeholder UI with minimal styling and a TypeScript bootstrap file.

## Chunk 3: Verification

### Task 3: Install and validate

**Files:**
- Create or update: `pnpm-lock.yaml`

- [ ] **Step 1: Install dependencies**

Run: `pnpm install`

- [ ] **Step 2: Verify production build**

Run: `pnpm build`
Expected: build completes without TypeScript or bundling errors

- [ ] **Step 3: Verify development startup contract**

Run: `pnpm dev`
Expected: terminal output shows main and preload development builds succeeding, then a renderer dev server URL. If GUI launch is blocked by the environment, those startup logs are still acceptable evidence once Electron binary installation has been confirmed.
