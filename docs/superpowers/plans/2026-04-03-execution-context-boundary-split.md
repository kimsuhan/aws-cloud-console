# Execution Context Boundary Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current mixed runtime context into separate API and CLI execution contexts without changing user-visible behavior.

**Architecture:** Introduce one context builder for SDK-backed AWS calls and one context builder for CLI-backed SSM session flows. Migrate existing callers away from the old mixed context so the main process stops treating `aws-cli` as a prerequisite for SDK-only operations at the code boundary level.

**Tech Stack:** Electron, TypeScript, Node.js test runner via `tsx --test`, AWS SDK v3, `node-pty`

---

## Scope

This sub-plan covers only execution context separation.

Included:
- create `AwsApiContext`
- create `SessionCliContext`
- migrate current callers from the old mixed context
- keep behavior unchanged for session open flows
- preserve existing tests and add focused coverage

Excluded:
- IPC handler extraction
- `src/main/index.ts` bootstrap slimming beyond the minimum required call-site updates
- PTY runtime extraction
- readiness gating changes in renderer
- profile-store credential model redesign

## File Structure

**Create:**
- `src/main/aws-api-context.ts` — API-only execution context with region and credentials for SDK clients.
- `src/main/session-cli-context.ts` — CLI-only execution context with resolved binary paths and AWS env for SSM/tunnel flows.
- `src/main/aws-api-context.test.ts`
- `src/main/session-cli-context.test.ts`

**Modify:**
- `src/main/runtime-context.ts` — remove, narrow to compatibility wrapper, or leave as deprecated shim during migration.
- `src/main/index.ts` — replace mixed-context usage with explicit API vs CLI builders.
- `src/main/quick-access-launcher.ts` — switch dependencies from generic execution context to explicit CLI/API context providers if needed.
- `src/main/ec2-client.ts` — only if a new API context helper is used directly.
- `src/main/tunnel-targets.ts` — only if a new API context helper is used directly.
- `src/main/runtime-context.test.ts`
- any tests that assume the old mixed context shape

## Intended End State

After this work:
- SDK callers can depend on `region + credentials` only.
- SSM/tunnel callers depend on `awsCliPath + sessionManagerPluginPath + env`.
- there is no production code path that asks for a single “do everything” execution context.
- readiness and UI behavior remain unchanged for now.

## Chunk 1: Define the New Context Types

### Task 1: Add failing tests for the two new context builders

**Files:**
- Create: `src/main/aws-api-context.test.ts`
- Create: `src/main/session-cli-context.test.ts`
- Reference: `src/main/runtime-context.test.ts`

- [ ] **Step 1: Write the failing API context test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAwsApiContext } from './aws-api-context'

test('buildAwsApiContext returns profile, region, and credentials without dependency status checks', () => {
  const context = buildAwsApiContext({
    profile: { id: 'p1', name: 'prod', region: 'ap-northeast-2', createdAt: '', updatedAt: '', hasSessionToken: false, isDefault: true },
    credentials: { accessKeyId: 'AKIA...', secretAccessKey: 'secret' }
  })

  assert.equal(context.profile.name, 'prod')
  assert.equal(context.region, 'ap-northeast-2')
  assert.equal(context.credentials.accessKeyId, 'AKIA...')
})
```

- [ ] **Step 2: Run the API context test to verify it fails**

Run: `pnpm test -- src/main/aws-api-context.test.ts`
Expected: FAIL with module-not-found or missing export

- [ ] **Step 3: Write the failing CLI context test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSessionCliContext } from './session-cli-context'

test('buildSessionCliContext fails closed when aws CLI is missing', () => {
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
Expected: FAIL with module-not-found or missing export

- [ ] **Step 5: Commit**

```bash
git add src/main/aws-api-context.test.ts src/main/session-cli-context.test.ts
git commit -m "test(main): define split execution contexts"
```

### Task 2: Implement the new context builders

**Files:**
- Create: `src/main/aws-api-context.ts`
- Create: `src/main/session-cli-context.ts`
- Modify: `src/main/runtime-context.ts`
- Test: `src/main/aws-api-context.test.ts`
- Test: `src/main/session-cli-context.test.ts`
- Test: `src/main/runtime-context.test.ts`

- [ ] **Step 1: Implement `AwsApiContext`**

Recommended shape:

```ts
export interface AwsApiContext {
  profile: AppProfileRecord
  region: string
  credentials: AppProfileCredentials
}
```

- [ ] **Step 2: Implement `SessionCliContext`**

Recommended shape:

```ts
export interface SessionCliContext {
  profile: AppProfileRecord
  awsCliPath: string
  sessionManagerPluginPath: string
  env: Record<string, string>
}
```

- [ ] **Step 3: Decide how to handle `runtime-context.ts`**

Choose one:
- delete it after migrating all callers
- keep it as a deprecated wrapper that composes the two new builders temporarily

Recommendation: keep a thin temporary wrapper only if it reduces churn in the first pass, then delete it in a follow-up cleanup commit.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test -- src/main/aws-api-context.test.ts src/main/session-cli-context.test.ts src/main/runtime-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/aws-api-context.ts src/main/session-cli-context.ts src/main/runtime-context.ts src/main/aws-api-context.test.ts src/main/session-cli-context.test.ts src/main/runtime-context.test.ts
git commit -m "refactor(main): add api and cli execution context builders"
```

## Chunk 2: Migrate Production Call Sites

### Task 3: Replace mixed-context usage in main-process flows

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/quick-access-launcher.ts`
- Reference: `src/main/ec2-client.ts`
- Reference: `src/main/tunnel-targets.ts`

- [ ] **Step 1: Identify all production callers of the old mixed context**

Search:

```bash
rg -n "buildExecutionContext|requireExecutionContext|awsCliPath|sessionManagerPluginPath" src/main
```

Expected result: a small set of callers concentrated in `index.ts`, session open flows, and shortcut launching.

- [ ] **Step 2: Introduce explicit helpers in `index.ts`**

Recommended split:

```ts
async function requireAwsApiContext() { ... }
async function requireSessionCliContext() { ... }
```

- [ ] **Step 3: Update SDK-backed call paths to use API context only where beneficial**

Use the new API context directly only if it improves clarity. Do not force extra churn into `ec2-client.ts` or `tunnel-targets.ts` unless it clearly simplifies the call sites.

- [ ] **Step 4: Update SSM and tunnel session open flows to use CLI context explicitly**

Expected result:
- `openSsmSession` uses `requireSessionCliContext()`
- `openTunnelSession` uses `requireSessionCliContext()`
- shortcut launch paths receive the explicit CLI context for session launches

- [ ] **Step 5: Run focused regression tests**

Run: `pnpm test -- src/main/quick-access-launcher.test.ts src/main/ec2-client.test.ts src/main/tunnel-targets.test.ts src/main/ssm-session-manager.test.ts src/main/tunnel-session-manager.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/quick-access-launcher.ts src/main/ec2-client.ts src/main/tunnel-targets.ts
git commit -m "refactor(main): migrate callers to split execution contexts"
```

## Chunk 3: Remove Ambiguity and Verify Stability

### Task 4: Eliminate the old mixed-context dependency from production code

**Files:**
- Modify: `src/main/runtime-context.ts`
- Modify: any remaining main-process callers
- Test: related runtime-context and integration-style unit tests

- [ ] **Step 1: Confirm production code no longer depends on the old mixed context**

Run:

```bash
rg -n "buildExecutionContext|ExecutionContext" src/main
```

Expected: only compatibility shim references remain, or no matches in production files.

- [ ] **Step 2: Remove or clearly deprecate the old mixed context**

Preferred outcome: no ambiguity about which context to use for new code.

- [ ] **Step 3: Run the full main-process test sweep**

Run: `pnpm test -- src/main/*.test.ts`
Expected: PASS

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Run the build**

Run: `pnpm build`
Expected: successful build with no type errors

- [ ] **Step 6: Commit**

```bash
git add src/main
git commit -m "refactor(main): remove mixed execution context ambiguity"
```

## Notes for the Implementer

- Keep the refactor narrow. This plan is about boundaries, not architecture cleanup.
- Do not change renderer behavior unless a test or type dependency forces a tiny compatibility update.
- Do not fold readiness gating changes into this work.
- Do not redesign credential storage yet. The new API context should still consume the current `ActiveProfileWithCredentials` model.
- Keep commits small and mechanical so regressions are easy to isolate.
