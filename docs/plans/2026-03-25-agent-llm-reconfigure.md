# Agent LLM Reconfigure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the highest-priority Settings task by adding backend sandbox LLM reconfiguration and wiring the Settings tab to submit provider credentials with an apply-and-restart flow.

**Architecture:** Extend the existing Settings feature in place. The backend will expose a new `/reconfigure-llm` endpoint and reuse the sandbox/container mutation pattern already used in `sandboxManager.ts` and `channelManager.ts`. The frontend will keep secrets ephemeral in component state, call the new endpoint, and keep the selected model coherent with the configured provider.

**Tech Stack:** Bun + Express backend tests, Next.js client UI, Playwright e2e, knowledge-base spec updates

---

### Task 1: Add the failing backend tests

**Files:**
- Modify: `ruh-backend/tests/e2e/chatProxy.test.ts`
- Modify: `ruh-backend/tests/unit/sandboxManager.test.ts`

**Step 1: Add endpoint tests**

Cover `POST /api/sandboxes/:sandbox_id/reconfigure-llm` success, validation failure, and masked response behavior.

**Step 2: Add sandbox helper tests**

Cover provider validation, gateway restart, and env/auth-profile rewrite behavior for the helper that will reconfigure a running sandbox.

**Step 3: Run the targeted backend tests**

Run: `cd ruh-backend && bun test tests/e2e/chatProxy.test.ts tests/unit/sandboxManager.test.ts`
Expected: FAIL because the new endpoint/helper do not exist yet.

### Task 2: Implement the backend

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Modify: `ruh-backend/src/sandboxManager.ts`

**Step 1: Add a reconfiguration helper**

Implement an in-place helper that updates sandbox LLM config, rewrites auth profiles and `.env`, reapplies provider-specific compat patches, restarts the gateway, and returns masked logs.

**Step 2: Add the endpoint**

Expose `POST /api/sandboxes/:sandbox_id/reconfigure-llm` using `asyncHandler`, `getRecord`, and the repo’s `{ "detail": "..." }` error contract.

**Step 3: Run the targeted backend tests**

Run: `cd ruh-backend && bun test tests/e2e/chatProxy.test.ts tests/unit/sandboxManager.test.ts`
Expected: PASS

### Task 3: Add the failing frontend tests

**Files:**
- Modify: `agent-builder-ui/e2e/tab-settings-model.spec.ts`

**Step 1: Add Settings-tab reconfiguration coverage**

Verify provider input, submit behavior, request payload, and model coherence after a successful apply.

**Step 2: Run the targeted Playwright test**

Run: `cd agent-builder-ui && npx playwright test e2e/tab-settings-model.spec.ts`
Expected: FAIL before the UI implementation exists.

### Task 4: Implement the Settings tab flow

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabSettings.tsx`
- Modify: `agent-builder-ui/hooks/use-agents-store.ts` (if model/provider coordination needs store support)

**Step 1: Add provider configuration UI**

Keep API keys ephemeral, add apply/restart state, and call the new backend endpoint.

**Step 2: Keep model selection coherent**

After successful provider config, switch to the provider’s recommended model if the current selection belongs to another provider.

**Step 3: Run the targeted Playwright test**

Run: `cd agent-builder-ui && npx playwright test e2e/tab-settings-model.spec.ts`
Expected: PASS

### Task 5: Update docs and task tracking

**Files:**
- Modify: `docs/knowledge-base/specs/SPEC-agent-model-settings.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `TODOS.md`

**Step 1: Update the spec**

Remove the stale “no backend changes” framing and describe the new provider reconfiguration behavior.

**Step 2: Update API docs**

Document the new endpoint contract.

**Step 3: Update task tracking**

Mark the active TODO entry as completed and leave the next actionable item visible.
