# Agent-Readable Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a backend-owned structured system-event ledger and agent-readable read API, then correlate architect-bridge traces through optional Langfuse instrumentation.

**Architecture:** `ruh-backend` becomes the canonical source for durable system history through a new `system_events` table, store, writer helper, and read routes. `agent-builder-ui` adds optional Langfuse tracing only on the Node-based architect bridge and forwards shared request/trace correlation so agents can connect backend event history with LLM/bridge traces.

**Tech Stack:** Bun, TypeScript, Express, PostgreSQL 16, Bun test, Next.js 15 route handlers, Langfuse JS/TS SDK, OpenTelemetry

---

### Task 1: Lock the observability contract in docs

**Files:**
- Create: `docs/knowledge-base/specs/SPEC-agent-readable-system-events.md`
- Create: `docs/plans/2026-03-28-agent-readable-logging-design.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/001-architecture.md`
- Modify: `docs/knowledge-base/002-backend-overview.md`
- Modify: `docs/knowledge-base/003-sandbox-lifecycle.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/005-data-models.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/010-deployment.md`

**Step 1: Capture the split responsibility**

- Document that `system_events` is the canonical agent-readable runtime history and Langfuse is additive for bridge/LLM tracing.

**Step 2: Add KB backlinks**

- Link the new spec from every affected KB note and the index.

### Task 2: Write the failing backend tests

**Files:**
- Create: `ruh-backend/tests/unit/systemEventStore.test.ts`
- Create: `ruh-backend/tests/unit/systemEventsApp.test.ts`
- Modify: `ruh-backend/tests/helpers/db.ts`
- Modify: `ruh-backend/tests/unit/startup.test.ts`
- Modify: `ruh-backend/tests/unit/sandboxManager.test.ts` or a focused app route test as needed

**Step 1: Write store tests**

- Assert redaction, default serialization, and filter query behavior for the new event store.

**Step 2: Write route tests**

- Assert `GET /api/system/events` and the scoped sandbox/agent read routes return filtered newest-first results with bounded limits.

**Step 3: Write lifecycle emission tests**

- Assert sandbox-create success/failure writes durable system events with request correlation.

**Step 4: Verify RED**

Run: `cd ruh-backend && bun test tests/unit/systemEventStore.test.ts tests/unit/systemEventsApp.test.ts`

Expected: failures because the store, routes, and event emission do not exist yet.

### Task 3: Implement the backend event ledger

**Files:**
- Create: `ruh-backend/src/systemEventStore.ts`
- Modify: `ruh-backend/src/schemaMigrations.ts`
- Modify: `ruh-backend/src/app.ts`
- Modify: `ruh-backend/src/startup.ts`
- Modify: `ruh-backend/src/sandboxManager.ts`

**Step 1: Add the migration**

- Create the `system_events` table and indexes in a new ordered migration.

**Step 2: Add the store**

- Implement write helpers, safe-detail redaction, and bounded query filters.

**Step 3: Add a write helper in the backend**

- Centralize request correlation (`request_id`, optional `trace_id`) and safe event emission for routes/orchestration code.

**Step 4: Emit first-pass lifecycle events**

- Add startup and sandbox-create milestone events that replace today’s disappearing console/SSE-only history.

### Task 4: Add the read API

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Modify: `ruh-backend/tests/unit/systemEventsApp.test.ts`

**Step 1: Add global/system route**

- Implement `GET /api/system/events` with bounded filters and deterministic ordering.

**Step 2: Add scoped routes**

- Implement sandbox- and agent-scoped event reads so product/runtime agents can ask “what happened to this resource?”

### Task 5: Add optional Langfuse bridge correlation

**Files:**
- Create: `agent-builder-ui/lib/openclaw/langfuse.ts`
- Modify: `agent-builder-ui/app/api/openclaw/route.ts`
- Modify: `agent-builder-ui/package.json`
- Modify: `agent-builder-ui/app/api/openclaw/route.test.ts`

**Step 1: Add optional initialization**

- Initialize Langfuse only when the required environment variables are present.

**Step 2: Instrument bridge lifecycle**

- Create a trace/span per architect request and record accepted-run, retry, deny, disconnect, and final-outcome milestones.

**Step 3: Forward correlation**

- Include shared `request_id` and safe trace identifiers in backend-bound summaries/events.

### Task 6: Verify and document the shipped slice

**Files:**
- Modify: `TODOS.md`
- Modify: `docs/journal/2026-03-28.md`
- Create or modify: `docs/knowledge-base/learnings/LEARNING-2026-03-28-agent-readable-system-events.md`

**Step 1: Run focused verification**

Run: `cd ruh-backend && bun test tests/unit/systemEventStore.test.ts tests/unit/systemEventsApp.test.ts`

Run: `cd ruh-backend && bun test tests/unit/startup.test.ts`

Run: `cd agent-builder-ui && yarn test agent-builder-ui/app/api/openclaw/route.test.ts`

Expected: PASS for the focused suites that cover the shipped slice.

**Step 2: Update repo handoff artifacts**

- Record the shipped contract, the exact routes/events added, and the remaining follow-on gaps such as wider event coverage or deeper Langfuse rollout.
