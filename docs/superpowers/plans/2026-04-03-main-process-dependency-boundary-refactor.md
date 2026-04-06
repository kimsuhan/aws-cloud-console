# Main Process Dependency Boundary Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple SDK-backed AWS operations from CLI-only session flows, shrink `src/main/index.ts` into a bootstrap file, and extract shared PTY session runtime without changing user-visible behavior.

**Architecture:** Split the current execution path into two explicit boundaries: an API context for SDK calls and a CLI session context for `aws ssm start-session` flows. Move readiness orchestration and IPC registration behind focused services/modules, then extract a shared PTY runner that both SSM shell sessions and tunnel sessions compose around.

**Tech Stack:** Electron, TypeScript, Node.js test runner via `tsx --test`, `node-pty`, AWS SDK v3

---

## Scope

This plan intentionally covers one cohesive subsystem: main-process dependency boundaries and session orchestration. Do not fold credential-source redesign or store-layer decomposition into this implementation. Those are follow-on plans after this refactor lands cleanly.

## File Structure

**Create:**
- `src/main/readiness-service.ts` — builds app readiness state and isolates dependency detection plus legacy profile discovery.
- `src/main/session-cli-context.ts` — constructs CLI-only execution context with resolved binary paths and injected AWS env.
- `src/main/aws-api-context.ts` — constructs SDK/API execution context with region and credentials only.
- `src/main/ipc/register-profile-handlers.ts` — registers profile/settings/import/reset IPC handlers.
- `src/main/ipc/register-session-handlers.ts` — registers EC2 listing, tunnel target listing, session open/close, and terminal resize/input handlers.
- `src/main/ipc/register-quick-access-handlers.ts` — registers quick access and shortcut launch handlers.
- `src/main/pty-session-runtime.ts` — shared PTY process lifecycle helper for start/exit/log/resize handling.
- `src/main/readiness-service.test.ts`
- `src/main/session-cli-context.test.ts`
- `src/main/aws-api-context.test.ts`
- `src/main/pty-session-runtime.test.ts`

**Modify:**
- `src/main/index.ts` — reduce to bootstrap, dependency wiring, and window lifecycle.
- `src/main/runtime-context.ts` — either delete after migration or narrow to compatibility wrapper during the transition.
- `src/main/app-readiness.ts` — update readiness inputs if dependency gating semantics change.
- `src/main/ssm-session-manager.ts` — compose shared PTY runtime and depend only on CLI context input.
- `src/main/tunnel-session-manager.ts` — compose shared PTY runtime and depend only on CLI context input.
- `src/main/quick-access-launcher.ts` — switch from generic execution context to explicit API/CLI context provider where needed.
- `src/shared/contracts.ts` — only if readiness/session contract changes are strictly necessary.
- `src/renderer/src/App.tsx` — only if readiness UX must stop blocking SDK-backed listing actions when CLI dependencies are missing.
- Existing tests that assert old runtime-context behavior or session manager internals.

**Keep Out of Scope:**
- `src/main/profile-store.ts` credential model redesign
- `src/main/quick-access-store.ts` persistence redesign
- `src/shared/contracts.ts` domain split into multiple files

## Chunk 1: Split Execution Context Boundaries

### Task 1: Add failing tests for API vs CLI context separation

**Files:**
- Create: `src/main/aws-api-context.test.ts`
- Create: `src/main/session-cli-context.test.ts`
- Reference: `src/main/runtime-context.test.ts`

- [ ] **Step 1: Write the failing API context test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAwsApiContext } from './aws-api-context'

test('buildAwsApiContext returns region and credentials without CLI dependency requirements', () => {
  const context = buildAwsApiContext({
    profile: { id: 'p1', name: 'prod', region: 'ap-northeast-2', createdAt: '', updatedAt: '', hasSessionToken: false, isDefault: true },
    credentials: { accessKeyId: 'AKIA...', secretAccessKey: 'secret' }
  })

  assert.equal(context.region, 'ap-northeast-2')
  assert.equal(context.credentials.accessKeyId, 'AKIA...')
})
```

- [ ] **Step 2: Run the API context test to verify it fails**

Run: `pnpm test -- src/main/aws-api-context.test.ts`
Expected: FAIL with module-not-found or missing export for `buildAwsApiContext`

- [ ] **Step 3: Write the failing CLI context test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSessionCliContext } from './session-cli-context'

test('buildSessionCliContext requires aws CLI and session-manager-plugin paths', () => {
  assert.throws(() =>
    buildSessionCliContext(activeProfile, {
      awsCli: { installed: false, resolvedPath: null, source: 'missing', error: 'Unable to locate aws CLI.' },
      sessionManagerPlugin: { installed: true, resolvedPath: '/usr/local/bin/session-manager-plugin', source: 'path', error: null }
    })
  )
})
```

- [ ] **Step 4: Run the CLI context test to verify it fails**

Run: `pnpm test -- src/main/session-cli-context.test.ts`
Expected: FAIL with module-not-found or missing export for `buildSessionCliContext`

- [ ] **Step 5: Commit**

```bash
git add src/main/aws-api-context.test.ts src/main/session-cli-context.test.ts
git commit -m "test(main): define api and cli execution context boundaries"
```

### Task 2: Implement separate execution context builders

**Files:**
- Create: `src/main/aws-api-context.ts`
- Create: `src/main/session-cli-context.ts`
- Modify: `src/main/runtime-context.ts`
- Test: `src/main/aws-api-context.test.ts`
- Test: `src/main/session-cli-context.test.ts`
- Test: `src/main/runtime-context.test.ts`

- [ ] **Step 1: Implement `buildAwsApiContext` with region plus credentials only**

```ts
export interface AwsApiContext {
  profile: AppProfileRecord
  region: string
  credentials: AppProfileCredentials
}
```

- [ ] **Step 2: Implement `buildSessionCliContext` with `awsCliPath`, `sessionManagerPluginPath`, and env injection**

```ts
export interface SessionCliContext {
  profile: AppProfileRecord
  awsCliPath: string
  sessionManagerPluginPath: string
  env: Record<string, string>
}
```

- [ ] **Step 3: Reduce `runtime-context.ts` to a temporary compatibility wrapper or remove its callers**

Expected result: no remaining production import needs the old mixed context shape.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm test -- src/main/aws-api-context.test.ts src/main/session-cli-context.test.ts src/main/runtime-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/aws-api-context.ts src/main/session-cli-context.ts src/main/runtime-context.ts src/main/aws-api-context.test.ts src/main/session-cli-context.test.ts src/main/runtime-context.test.ts
git commit -m "refactor(main): split api and cli execution contexts"
```

### Task 3: Move readiness assembly into a dedicated service

**Files:**
- Create: `src/main/readiness-service.ts`
- Create: `src/main/readiness-service.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/app-readiness.ts`
- Reference: `src/main/dependencies.ts`

- [ ] **Step 1: Write a failing readiness service test covering profile setup, legacy import, and dependency state**

```ts
test('getAppReadiness combines stored profiles, runtime settings, and dependency status', async () => {
  const readiness = await createReadinessService(deps).getAppReadiness()
  assert.equal(readiness.needsProfileSetup, false)
  assert.equal(readiness.dependencyStatus.awsCli.installed, true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/main/readiness-service.test.ts`
Expected: FAIL with missing module or missing service method

- [ ] **Step 3: Implement `readiness-service.ts` and update `index.ts` to use it**

Expected result: `index.ts` no longer owns `awsFilePath`, `readOptionalFile`, `hasLegacyProfiles`, or `getAppReadiness`.

- [ ] **Step 4: Run focused readiness tests**

Run: `pnpm test -- src/main/readiness-service.test.ts src/main/app-readiness.test.ts src/main/dependencies.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/readiness-service.ts src/main/readiness-service.test.ts src/main/index.ts src/main/app-readiness.ts
git commit -m "refactor(main): extract readiness service"
```

## Chunk 2: Decompose IPC Registration and Main Bootstrap

### Task 4: Extract profile and settings IPC handlers

**Files:**
- Create: `src/main/ipc/register-profile-handlers.ts`
- Modify: `src/main/index.ts`
- Test: existing profile/settings tests plus new module-level tests if needed

- [ ] **Step 1: Copy the current profile/settings/import/reset handlers into a dedicated registration module**

Included channels:
- `getAppReadiness`
- `updateAppSettings`
- `listProfiles`
- `createProfile`
- `updateProfile`
- `deleteProfile`
- `selectActiveProfile`
- `setDefaultProfile`
- `getRuntimeConfig`
- `updateRuntimePaths`
- `importLegacyProfiles`
- `dismissLegacyImport`
- `acknowledgeKeychainAccessNotice`
- `resetAppData`

- [ ] **Step 2: Replace the inline code in `index.ts` with one registration call**

Expected result: `registerIpcHandlers()` disappears or becomes orchestration-only.

- [ ] **Step 3: Run related tests**

Run: `pnpm test -- src/main/profile-store.test.ts src/main/app-readiness.test.ts src/main/security.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/register-profile-handlers.ts src/main/index.ts
git commit -m "refactor(main): extract profile and settings ipc handlers"
```

### Task 5: Extract session and quick-access IPC handlers

**Files:**
- Create: `src/main/ipc/register-session-handlers.ts`
- Create: `src/main/ipc/register-quick-access-handlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/quick-access-launcher.ts`
- Test: `src/main/quick-access-launcher.test.ts`
- Test: `src/main/ssm-session-manager.test.ts`
- Test: `src/main/tunnel-session-manager.test.ts`

- [ ] **Step 1: Move EC2/tunnel target/session handlers into `register-session-handlers.ts`**

Included channels:
- `listEc2Instances`
- `listTunnelTargets`
- `openTunnelSession`
- `closeTunnelSession`
- `openSsmSession`
- `sendSessionInput`
- `resizeSession`
- `closeSession`

- [ ] **Step 2: Move quick-access handlers into `register-quick-access-handlers.ts`**

Included channels:
- `getQuickAccess`
- `createSavedShortcut`
- `deleteSavedShortcut`
- `launchShortcut`

- [ ] **Step 3: Make `QuickAccessLauncher` depend on explicit API/CLI context providers**

Expected result: no caller asks for a generic mixed execution context.

- [ ] **Step 4: Run related tests**

Run: `pnpm test -- src/main/quick-access-launcher.test.ts src/main/ec2-client.test.ts src/main/tunnel-targets.test.ts src/main/ssm-session-manager.test.ts src/main/tunnel-session-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/register-session-handlers.ts src/main/ipc/register-quick-access-handlers.ts src/main/quick-access-launcher.ts src/main/index.ts
git commit -m "refactor(main): extract session and quick access ipc handlers"
```

### Task 6: Clean up `index.ts` into bootstrap-only composition root

**Files:**
- Modify: `src/main/index.ts`
- Test: smoke coverage through focused main-process tests

- [ ] **Step 1: Delete dead helper functions left behind by extraction**

Expected result: `index.ts` owns only app wiring, store construction, event relay, window creation, and lifecycle hooks.

- [ ] **Step 2: Verify imports reflect composition-root responsibilities only**

Expected result: no AWS file IO helpers, no quick-access business logic, no profile mutation logic remain in `index.ts`.

- [ ] **Step 3: Run a focused regression sweep**

Run: `pnpm test -- src/main/*.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "refactor(main): reduce index bootstrap surface"
```

## Chunk 3: Extract Shared PTY Session Runtime

### Task 7: Add failing tests for shared PTY lifecycle helper

**Files:**
- Create: `src/main/pty-session-runtime.test.ts`
- Reference: `src/main/ssm-session-manager.test.ts`
- Reference: `src/main/tunnel-session-manager.test.ts`

- [ ] **Step 1: Write a failing test for spawn/start/data/exit propagation**

```ts
test('PtySessionRuntime forwards output and exit events from the spawned process', async () => {
  const runtime = new PtySessionRuntime(fakeSpawner)
  const record = runtime.start({ file: '/bin/aws', args: ['ssm', 'start-session'], env: {} })
  fakeProcess.emitData('connected')
  fakeProcess.emitExit(0)
  assert.deepEqual(events, ['connected', 0])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/main/pty-session-runtime.test.ts`
Expected: FAIL with module-not-found or missing class

- [ ] **Step 3: Commit**

```bash
git add src/main/pty-session-runtime.test.ts
git commit -m "test(main): define shared pty runtime behavior"
```

### Task 8: Implement shared PTY runtime and migrate SSM session manager

**Files:**
- Create: `src/main/pty-session-runtime.ts`
- Modify: `src/main/ssm-session-manager.ts`
- Modify: `src/main/ssm-session-manager.test.ts`
- Test: `src/main/pty-session-runtime.test.ts`

- [ ] **Step 1: Implement the shared runtime with injectable spawner and process hooks**

Core responsibilities:
- spawn with file + args + env
- bind `onData` and `onExit`
- expose `resize`, `write`, and `kill`
- avoid embedding SSM- or tunnel-specific command construction

- [ ] **Step 2: Rewrite `SsmSessionManager` to use the shared runtime**

Expected result: SSM-specific file only owns session metadata, command building, and event translation.

- [ ] **Step 3: Add or fix explicit error-event coverage**

Expected result: emitted session events match the channels registered in `index.ts`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test -- src/main/pty-session-runtime.test.ts src/main/ssm-session-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/pty-session-runtime.ts src/main/ssm-session-manager.ts src/main/ssm-session-manager.test.ts src/main/pty-session-runtime.test.ts
git commit -m "refactor(main): share pty runtime for ssm sessions"
```

### Task 9: Migrate tunnel session manager to the shared PTY runtime

**Files:**
- Modify: `src/main/tunnel-session-manager.ts`
- Modify: `src/main/tunnel-session-manager.test.ts`
- Test: `src/main/pty-session-runtime.test.ts`

- [ ] **Step 1: Replace direct `node-pty` orchestration with the shared runtime**

Expected result: tunnel manager keeps reconnect scheduling and tunnel-specific logging, but no longer owns low-level spawn plumbing.

- [ ] **Step 2: Preserve reconnect semantics and local log messages**

Expected result: clean exit still triggers reconnect, user stop still closes immediately, non-zero exit still raises an error event.

- [ ] **Step 3: Run focused tests**

Run: `pnpm test -- src/main/tunnel-session-manager.test.ts src/main/pty-session-runtime.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/tunnel-session-manager.ts src/main/tunnel-session-manager.test.ts
git commit -m "refactor(main): share pty runtime for tunnel sessions"
```

## Chunk 4: Optional Renderer Gate Adjustment

### Task 10: Stop blocking SDK-backed actions on missing CLI dependencies

**Files:**
- Modify: `src/main/app-readiness.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/renderer/src/App.tsx`
- Test: `src/main/readiness-service.test.ts`
- Test: renderer tests that rely on readiness gating

- [ ] **Step 1: Decide whether readiness should expose separate flags**

Recommended shape:

```ts
needsApiSetup: boolean
needsCliSetup: boolean
```

- [ ] **Step 2: Update renderer gating only if the UI currently blocks SDK-safe listing flows**

Expected result: profile setup remains mandatory, but missing `aws-cli` does not unnecessarily hide SDK-backed discovery.

- [ ] **Step 3: Run focused tests**

Run: `pnpm test -- src/main/readiness-service.test.ts src/main/app-readiness.test.ts src/renderer/src/*.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/app-readiness.ts src/shared/contracts.ts src/renderer/src/App.tsx src/main/readiness-service.test.ts src/main/app-readiness.test.ts
git commit -m "refactor(renderer): separate api and cli readiness gating"
```

## Final Verification

### Task 11: Full regression pass and cleanup

**Files:**
- Modify: any touched files for cleanup only

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS across `src/main` and `src/renderer/src` tests

- [ ] **Step 2: Run the production build**

Run: `pnpm build`
Expected: successful Electron/Vite build with no type errors

- [ ] **Step 3: Manually smoke test core flows**

Manual checklist:
- create/select/delete profile
- list EC2 instances
- list tunnel targets
- open/resize/close SSM shell session
- open/close tunnel session
- launch a saved shortcut

- [ ] **Step 4: Commit the final cleanup**

```bash
git add src/main src/shared src/renderer/src
git commit -m "refactor(main): complete dependency boundary cleanup"
```

## Follow-On Plans

These are intentionally deferred until this plan lands:

1. Credential source abstraction in `profile-store` to support SSO, assume-role, and external credential providers.
2. `ProfileStore` split into profile metadata, secrets vault, and runtime/settings stores.
3. `src/shared/contracts.ts` decomposition by domain after handler boundaries stabilize.
