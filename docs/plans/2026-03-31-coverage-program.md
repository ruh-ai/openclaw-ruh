# Coverage Program Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the repo’s current ad hoc coverage state into a trustworthy, continuously enforced testing program that gets every service green, then pushes the highest-risk modules toward near-full coverage.

**Architecture:** The work starts by making the measurement pipeline deterministic, because the repo currently mixes real failures with harness failures. After that, the plan climbs the stack in order of risk and payoff: backend control-plane code first, builder transport/state second, ruh-frontend panels third, and threshold ratchets last.

**Tech Stack:** Bun test, Jest, Playwright, supertest, Next.js, React Testing Library, happy-dom, Express, LCOV

---

### Task 1: Make coverage commands deterministic

**Files:**
- Modify: `package.json`
- Modify: `agent-builder-ui/package.json`
- Create: `agent-builder-ui/bunfig.toml`
- Modify: `admin-ui/package.json`
- Modify: `admin-ui/bunfig.toml`
- Modify: `ruh-frontend/jest.config.ts`

**Step 1: Split unit coverage from browser specs**

Add explicit coverage commands in `agent-builder-ui/package.json` and `admin-ui/package.json` that ignore `e2e/**`, `test-results/**`, and any Playwright spec files during Bun coverage runs.

**Step 2: Make Bun test discovery predictable**

Create `agent-builder-ui/bunfig.toml` and extend `admin-ui/bunfig.toml` so the preload/setup path is explicit and coverage output always lands in `coverage/`.

**Step 3: Make root reporting trustworthy**

Update `package.json` so `coverage:report` prints service summaries from the real unit-coverage commands instead of short-circuiting on the first failing grep pipeline.

**Step 4: Verify the deterministic harness**

Run:

```bash
npm run coverage:agent-builder
npm run coverage:admin
npm run coverage:report
```

Expected:
- Bun coverage no longer crashes on Playwright `test.describe()` calls
- The root summary prints all service results even when one service is below threshold

**Step 5: Commit**

```bash
git add package.json agent-builder-ui/package.json agent-builder-ui/bunfig.toml admin-ui/package.json admin-ui/bunfig.toml ruh-frontend/jest.config.ts
git commit -m "test: stabilize coverage command boundaries"
```

### Task 2: Repair the current red backend coverage blockers

**Files:**
- Modify: `ruh-backend/src/agentStore.ts`
- Modify: `ruh-backend/src/backendReadiness.ts`
- Modify: `ruh-backend/src/credentials.ts`
- Modify: `ruh-backend/src/db.ts`
- Test: `ruh-backend/tests/unit/agentForge.test.ts`
- Test: `ruh-backend/tests/unit/startup.test.ts`
- Test: `ruh-backend/tests/unit/agentCredentialsApp.test.ts`
- Test: `ruh-backend/tests/unit/db.test.ts`

**Step 1: Fix forge lifecycle API parity**

Run:

```bash
cd ruh-backend && bun test tests/unit/agentForge.test.ts
```

Expected: failures around missing `setForgeSandbox`, `promoteForgeSandbox`, and `clearForgeSandbox`.

Implement or re-export the missing agent-store functions so the forge tests reflect real supported behavior.

**Step 2: Fix backend readiness exports**

Run:

```bash
cd ruh-backend && bun test tests/unit/startup.test.ts
```

Expected: missing `markBackendNotReady` export.

Restore the readiness export contract in `src/backendReadiness.ts` or update the startup path so the existing test contract is truthful.

**Step 3: Fix credential route helpers**

Run:

```bash
cd ruh-backend && bun test tests/unit/agentCredentialsApp.test.ts
```

Expected: missing credential summary/encryption helpers.

Repair the helper exports in `src/agentStore.ts` and `src/credentials.ts`, then keep the route tests green without weakening assertions.

**Step 4: Fix DB helper contract drift**

Run:

```bash
cd ruh-backend && bun test tests/unit/db.test.ts
```

Expected: pool config and transaction behavior mismatches.

Align `src/db.ts` and the tests so transaction begin/commit/rollback behavior is deterministic and accurately asserted.

**Step 5: Verify the backend blocker bundle**

Run:

```bash
cd ruh-backend && bun test tests/unit/agentForge.test.ts tests/unit/startup.test.ts tests/unit/agentCredentialsApp.test.ts tests/unit/db.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add ruh-backend/src/agentStore.ts ruh-backend/src/backendReadiness.ts ruh-backend/src/credentials.ts ruh-backend/src/db.ts ruh-backend/tests/unit/agentForge.test.ts ruh-backend/tests/unit/startup.test.ts ruh-backend/tests/unit/agentCredentialsApp.test.ts ruh-backend/tests/unit/db.test.ts
git commit -m "test: unblock backend coverage suites"
```

### Task 3: Repair the current red builder and frontend blockers

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/api.test.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_config/generate-skills.test.ts`
- Modify: `ruh-frontend/jest.setup.ts`
- Modify: `ruh-frontend/__tests__/pages/HomePage.test.tsx`
- Modify: `ruh-frontend/components/ChatPanel.tsx`

**Step 1: Fix builder SSE parsing regressions**

Run:

```bash
cd agent-builder-ui && bun test lib/openclaw/api.test.ts
```

Expected: failures around direct JSON responses, fragmented SSE chunks, approval events, and timeout/partial-response behavior.

Repair either the tests or `lib/openclaw/api.ts` so the test file matches the supported streaming contract.

**Step 2: Fix the build-prompt assertion drift**

Run:

```bash
cd agent-builder-ui && bun test 'app/(platform)/agents/create/_config/generate-skills.test.ts'
```

Expected: one assertion mismatch around the exact build prompt wording.

Update the test to assert the current intentional contract, or update the prompt string if the newer wording regressed an intended requirement.

**Step 3: Fix jsdom-specific ruh-frontend failures**

Run:

```bash
cd ruh-frontend && npx jest --runInBand __tests__/pages/HomePage.test.tsx
```

Expected: `scrollTo` and interaction-state failures.

Add the missing `scrollTo` test shim in `jest.setup.ts` and adjust the page test to query the current UI labels rather than stale strings.

**Step 4: Verify the blocker bundle**

Run:

```bash
cd agent-builder-ui && bun test lib/openclaw/api.test.ts 'app/(platform)/agents/create/_config/generate-skills.test.ts'
cd ruh-frontend && npx jest --runInBand __tests__/pages/HomePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add agent-builder-ui/lib/openclaw/api.test.ts 'agent-builder-ui/app/(platform)/agents/create/_config/generate-skills.test.ts' ruh-frontend/jest.setup.ts ruh-frontend/__tests__/pages/HomePage.test.tsx ruh-frontend/components/ChatPanel.tsx
git commit -m "test: unblock builder and frontend coverage suites"
```

### Task 4: Lift backend store and pure-helper coverage to 90-100%

**Files:**
- Modify: `ruh-backend/src/agentStore.ts`
- Modify: `ruh-backend/tests/unit/agentStore.test.ts`
- Modify: `ruh-backend/src/docker.ts`
- Modify: `ruh-backend/tests/unit/docker.test.ts`
- Create: `ruh-backend/tests/unit/sessionStore.test.ts`
- Create: `ruh-backend/tests/unit/userStore.test.ts`
- Create: `ruh-backend/tests/unit/webhookDeliveryStore.test.ts`
- Create: `ruh-backend/tests/unit/openspaceClient.test.ts`
- Create: `ruh-backend/tests/unit/paperclipClient.test.ts`

**Step 1: Expand existing store tests before creating new harnesses**

Add missing branch coverage to `agentStore.test.ts` and `docker.test.ts` first, because those files already exist and cover the main seams.

**Step 2: Add missing unit coverage for untested stores**

Write focused tests for `sessionStore.ts`, `userStore.ts`, and `webhookDeliveryStore.ts` using the same query-mocking pattern already used by neighboring store tests.

**Step 3: Add client-level behavior tests**

Create unit tests for `openspaceClient.ts` and `paperclipClient.ts` that validate request shaping, error behavior, and response normalization without talking to real services.

**Step 4: Verify the helper tranche**

Run:

```bash
cd ruh-backend && bun test tests/unit/agentStore.test.ts tests/unit/docker.test.ts tests/unit/sessionStore.test.ts tests/unit/userStore.test.ts tests/unit/webhookDeliveryStore.test.ts tests/unit/openspaceClient.test.ts tests/unit/paperclipClient.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add ruh-backend/src/agentStore.ts ruh-backend/tests/unit/agentStore.test.ts ruh-backend/src/docker.ts ruh-backend/tests/unit/docker.test.ts ruh-backend/tests/unit/sessionStore.test.ts ruh-backend/tests/unit/userStore.test.ts ruh-backend/tests/unit/webhookDeliveryStore.test.ts ruh-backend/tests/unit/openspaceClient.test.ts ruh-backend/tests/unit/paperclipClient.test.ts
git commit -m "test: raise backend store and helper coverage"
```

### Task 5: Lift backend route and app coverage into the 90s

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Modify: `ruh-backend/src/authRoutes.ts`
- Modify: `ruh-backend/src/costRoutes.ts`
- Modify: `ruh-backend/src/marketplaceRoutes.ts`
- Modify: `ruh-backend/tests/contract/authEndpoints.test.ts`
- Modify: `ruh-backend/tests/contract/costEndpoints.test.ts`
- Modify: `ruh-backend/tests/contract/marketplaceListings.test.ts`
- Modify: `ruh-backend/tests/unit/agentCreateEndpoints.test.ts`
- Modify: `ruh-backend/tests/unit/systemEventsApp.test.ts`
- Create: `ruh-backend/tests/unit/authRoutes.test.ts`
- Create: `ruh-backend/tests/unit/costRoutes.test.ts`
- Create: `ruh-backend/tests/unit/marketplaceRoutes.test.ts`

**Step 1: Prefer route-local tests over monolithic app-only assertions**

Add new focused tests for `authRoutes.ts`, `costRoutes.ts`, and `marketplaceRoutes.ts` so `app.ts` does not remain the only path to cover route behavior.

**Step 2: Backfill missing contract/error branches**

Expand the existing contract tests to cover validation failures, 404s, auth failures, and serialization edges that currently leave large route sections uncovered.

**Step 3: Trim `app.ts` into testable seams only where required**

If route behavior is still trapped inside `app.ts`, extract the smallest possible router/helper seam instead of piling more assertions into one giant test file.

**Step 4: Verify the route tranche**

Run:

```bash
cd ruh-backend && bun test tests/unit/authRoutes.test.ts tests/unit/costRoutes.test.ts tests/unit/marketplaceRoutes.test.ts tests/contract/authEndpoints.test.ts tests/contract/costEndpoints.test.ts tests/contract/marketplaceListings.test.ts tests/unit/agentCreateEndpoints.test.ts tests/unit/systemEventsApp.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add ruh-backend/src/app.ts ruh-backend/src/authRoutes.ts ruh-backend/src/costRoutes.ts ruh-backend/src/marketplaceRoutes.ts ruh-backend/tests/contract/authEndpoints.test.ts ruh-backend/tests/contract/costEndpoints.test.ts ruh-backend/tests/contract/marketplaceListings.test.ts ruh-backend/tests/unit/agentCreateEndpoints.test.ts ruh-backend/tests/unit/systemEventsApp.test.ts ruh-backend/tests/unit/authRoutes.test.ts ruh-backend/tests/unit/costRoutes.test.ts ruh-backend/tests/unit/marketplaceRoutes.test.ts
git commit -m "test: expand backend route coverage"
```

### Task 6: Lift backend runtime and orchestration coverage

**Files:**
- Modify: `ruh-backend/src/sandboxManager.ts`
- Modify: `ruh-backend/tests/unit/sandboxManager.test.ts`
- Modify: `ruh-backend/src/paperclipOrchestrator.ts`
- Create: `ruh-backend/tests/unit/paperclipOrchestrator.test.ts`
- Modify: `ruh-backend/src/workspaceFiles.ts`
- Modify: `ruh-backend/tests/unit/workspaceFiles.test.ts`
- Modify: `ruh-backend/src/sandboxRuntime.ts`
- Modify: `ruh-backend/tests/unit/sandboxRuntime.test.ts`

**Step 1: Finish the missing sandboxManager branches**

Use the existing test file to cover provider fallback, bootstrap verification, failure cleanup, and runtime-reconciliation branches that remain uncovered.

**Step 2: Add isolated orchestrator coverage**

Create `paperclipOrchestrator.test.ts` that covers the no-op, success, and failure paths without involving live Paperclip.

**Step 3: Cover workspace and runtime error branches**

Expand `workspaceFiles.test.ts` and `sandboxRuntime.test.ts` for traversal rejection, preview fallback, bounded archive behavior, and stopped/unreachable runtime branches.

**Step 4: Verify the orchestration tranche**

Run:

```bash
cd ruh-backend && bun test tests/unit/sandboxManager.test.ts tests/unit/paperclipOrchestrator.test.ts tests/unit/workspaceFiles.test.ts tests/unit/sandboxRuntime.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add ruh-backend/src/sandboxManager.ts ruh-backend/tests/unit/sandboxManager.test.ts ruh-backend/src/paperclipOrchestrator.ts ruh-backend/tests/unit/paperclipOrchestrator.test.ts ruh-backend/src/workspaceFiles.ts ruh-backend/tests/unit/workspaceFiles.test.ts ruh-backend/src/sandboxRuntime.ts ruh-backend/tests/unit/sandboxRuntime.test.ts
git commit -m "test: cover backend runtime orchestration"
```

### Task 7: Raise builder transport and protocol coverage

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/api.ts`
- Modify: `agent-builder-ui/lib/openclaw/api.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/gateway-response.ts`
- Modify: `agent-builder-ui/lib/openclaw/gateway-response.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/response-normalization.ts`
- Modify: `agent-builder-ui/lib/openclaw/response-normalization.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/event-consumer-map.ts`
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/__tests__/sandbox-agent.test.ts`

**Step 1: Finish SSE and partial-result correctness**

Expand `api.test.ts` until it covers direct JSON, fragmented SSE chunks, multi-line `data:` payloads, auth errors, and partial-response fallback without skipped branches.

**Step 2: Finish protocol normalization edges**

Backfill builder tests for `gateway-response` and `response-normalization` around unsupported payload shapes, alias fields, approval events, and structured-config handoff.

**Step 3: Finish AG-UI event dispatch edges**

Expand `event-consumer-map.test.ts` and `sandbox-agent.test.ts` to cover dropped events, stale callbacks, persistence-error surfacing, and multi-surface state updates.

**Step 4: Verify the builder protocol tranche**

Run:

```bash
cd agent-builder-ui && bun test lib/openclaw/api.test.ts lib/openclaw/gateway-response.test.ts lib/openclaw/response-normalization.test.ts lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts lib/openclaw/ag-ui/__tests__/sandbox-agent.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add agent-builder-ui/lib/openclaw/api.ts agent-builder-ui/lib/openclaw/api.test.ts agent-builder-ui/lib/openclaw/gateway-response.ts agent-builder-ui/lib/openclaw/gateway-response.test.ts agent-builder-ui/lib/openclaw/response-normalization.ts agent-builder-ui/lib/openclaw/response-normalization.test.ts agent-builder-ui/lib/openclaw/ag-ui/event-consumer-map.ts agent-builder-ui/lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts agent-builder-ui/lib/openclaw/ag-ui/__tests__/sandbox-agent.test.ts
git commit -m "test: expand builder transport coverage"
```

### Task 8: Raise builder create-flow state and UI coverage

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts`
- Create: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/__tests__/copilot-layout.test.tsx`
- Create: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-step-renderer.test.tsx`
- Modify: `agent-builder-ui/hooks/use-agents-store.test.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.test.ts`

**Step 1: Cover the lifecycle surface as UI, not only as pure helpers**

Add component tests for `CoPilotLayout` and `LifecycleStepRenderer` that verify loading/disabled/error/success states for Think, Plan, Build, Test, Ship, and Reflect.

**Step 2: Cover persisted create-flow state**

Expand `use-agents-store.test.ts` and `ReviewAgent.test.ts` for resume, reopen, approved configuration, runtime-input warnings, and review snapshot rendering.

**Step 3: Keep production changes minimal**

If the components are hard to test, extract only the smallest render helpers or prop mappers necessary to stabilize the tests.

**Step 4: Verify the create-flow tranche**

Run:

```bash
cd agent-builder-ui && bun test 'app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts' 'app/(platform)/agents/create/_components/copilot/__tests__/copilot-layout.test.tsx' 'app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-step-renderer.test.tsx' hooks/use-agents-store.test.ts 'app/(platform)/agents/create/_components/review/ReviewAgent.test.ts'
```

Expected: PASS

**Step 5: Commit**

```bash
git add 'agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx' 'agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx' 'agent-builder-ui/app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts' 'agent-builder-ui/app/(platform)/agents/create/_components/copilot/__tests__/copilot-layout.test.tsx' 'agent-builder-ui/app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-step-renderer.test.tsx' agent-builder-ui/hooks/use-agents-store.test.ts 'agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.test.ts'
git commit -m "test: expand builder create-flow coverage"
```

### Task 9: Raise ruh-frontend component and page coverage

**Files:**
- Modify: `ruh-frontend/components/ChatPanel.tsx`
- Modify: `ruh-frontend/__tests__/components/ChatPanel.test.tsx`
- Modify: `ruh-frontend/components/CronsPanel.tsx`
- Modify: `ruh-frontend/__tests__/components/CronsPanel.test.tsx`
- Modify: `ruh-frontend/components/HistoryPanel.tsx`
- Modify: `ruh-frontend/__tests__/components/HistoryPanel.test.tsx`
- Create: `ruh-frontend/__tests__/components/MissionControlPanel.test.tsx`
- Modify: `ruh-frontend/__tests__/pages/HomePage.test.tsx`

**Step 1: Cover the currently weakest component**

Create `MissionControlPanel.test.tsx` to cover the currently near-empty function/line coverage surface in `MissionControlPanel.tsx`.

**Step 2: Finish panel interaction coverage**

Expand the existing component tests to cover error states, empty states, filtering, disabled actions, optimistic UI, and callback behavior in `ChatPanel`, `CronsPanel`, and `HistoryPanel`.

**Step 3: Finish page-level integration**

Expand `HomePage.test.tsx` so it validates sidebar refresh, empty-state CTA behavior, tab switching, and chat initialization against the current UI contract.

**Step 4: Verify the ruh-frontend tranche**

Run:

```bash
cd ruh-frontend && npx jest --runInBand __tests__/components/ChatPanel.test.tsx __tests__/components/CronsPanel.test.tsx __tests__/components/HistoryPanel.test.tsx __tests__/components/MissionControlPanel.test.tsx __tests__/pages/HomePage.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add ruh-frontend/components/ChatPanel.tsx ruh-frontend/__tests__/components/ChatPanel.test.tsx ruh-frontend/components/CronsPanel.tsx ruh-frontend/__tests__/components/CronsPanel.test.tsx ruh-frontend/components/HistoryPanel.tsx ruh-frontend/__tests__/components/HistoryPanel.test.tsx ruh-frontend/__tests__/components/MissionControlPanel.test.tsx ruh-frontend/__tests__/pages/HomePage.test.tsx
git commit -m "test: raise ruh frontend panel coverage"
```

### Task 10: Keep admin-ui and marketplace-ui clean while finishing the climb

**Files:**
- Modify: `admin-ui/package.json`
- Modify: `admin-ui/bunfig.toml`
- Modify: `admin-ui/__tests__/dashboard.test.tsx`
- Modify: `admin-ui/__tests__/agents.test.tsx`
- Modify: `admin-ui/__tests__/users.test.tsx`
- Modify: `packages/marketplace-ui/src/components/__tests__/AgentCard.test.tsx`
- Modify: `packages/marketplace-ui/src/hooks/__tests__/useMarketplace.test.ts`

**Step 1: Lock admin-ui coverage to unit tests only**

Make sure the admin coverage command stays isolated from Playwright and keeps the current healthy thresholds meaningful.

**Step 2: Remove act-noise and cover missed admin branches**

Expand the existing admin tests to cover async fetch failure, empty data, and filter edge cases while wrapping stateful flows correctly.

**Step 3: Treat marketplace as a high-signal canary**

Only add marketplace tests where they cover untested behavior introduced by adjacent changes; do not churn its already-healthy suite for cosmetic reasons.

**Step 4: Verify the admin/marketplace tranche**

Run:

```bash
cd admin-ui && bun test
cd packages/marketplace-ui && bun test
```

Expected: PASS

**Step 5: Commit**

```bash
git add admin-ui/package.json admin-ui/bunfig.toml admin-ui/__tests__/dashboard.test.tsx admin-ui/__tests__/agents.test.tsx admin-ui/__tests__/users.test.tsx packages/marketplace-ui/src/components/__tests__/AgentCard.test.tsx packages/marketplace-ui/src/hooks/__tests__/useMarketplace.test.ts
git commit -m "test: stabilize admin and marketplace coverage"
```

### Task 11: Ratchet thresholds and automate the maintenance loop

**Files:**
- Modify: `TESTING.md`
- Modify: `ruh-backend/scripts/check-coverage.ts`
- Modify: `agent-builder-ui/scripts/check-coverage.ts`
- Modify: `admin-ui/scripts/check-coverage.ts`
- Modify: `ruh-frontend/jest.config.ts`
- Modify: `docs/knowledge-base/012-automation-architecture.md`
- Modify: `docs/knowledge-base/specs/SPEC-test-coverage-automation.md`
- Modify: `TODOS.md`

**Step 1: Raise thresholds only after green evidence exists**

Increase thresholds one service at a time only after the service can pass its new bar locally and in CI.

**Step 2: Update docs to match the new bars**

Reflect the new thresholds and the “touch it, improve it” policy in `TESTING.md`.

**Step 3: Feed the long journey into the existing automation contract**

Update `TODOS.md` and the automation docs so `Tester-1` keeps picking one bounded next improvement after the large tranche work is done.

**Step 4: Verify the full program gate**

Run:

```bash
npm run coverage:all
npm run typecheck:all
```

Expected:
- All services pass their current ratcheted thresholds
- Repo coverage is now a meaningful release gate

**Step 5: Commit**

```bash
git add TESTING.md ruh-backend/scripts/check-coverage.ts agent-builder-ui/scripts/check-coverage.ts admin-ui/scripts/check-coverage.ts ruh-frontend/jest.config.ts docs/knowledge-base/012-automation-architecture.md docs/knowledge-base/specs/SPEC-test-coverage-automation.md TODOS.md
git commit -m "test: ratchet repo coverage thresholds"
```
