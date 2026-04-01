# Agent-Readable Logging Design

## Summary

The current repo mixes three weak logging patterns: console output that disappears, SSE status strings that are only useful while a page is open, and a control-plane audit ledger that is intentionally too narrow to explain ordinary runtime behavior. The fix is a hybrid observability model: the backend owns a durable `system_events` history that agents can query directly, while the architect bridge adds Langfuse/OpenTelemetry traces for LLM-centric debugging and correlation.

## Goals

- Give agents one durable source of truth for recent system behavior.
- Make sandbox lifecycle and backend orchestration understandable after the original request is gone.
- Correlate bridge/LLM traces with backend system events through shared request and trace identifiers.
- Keep the logged payloads safe, bounded, and redacted.

## Recommended Architecture

### 1. Backend-owned system event ledger

- Add a PostgreSQL `system_events` table with typed severity, category, action, status, scope ids, and redacted JSON details.
- Write system events from the backend at the orchestration boundary rather than scraping console output.
- Start with the highest-value paths:
  - sandbox create / forge create
  - startup readiness / failure
  - bridge lifecycle summaries
  - selected mutation/runtime failures that currently disappear into `console.error`

### 2. Agent-readable read API

- Add bounded read endpoints so agents can fetch recent history by sandbox, agent, request, or category.
- Return newest-first results with strict limits and explicit filters.
- Keep the payload readable enough for agents without post-processing a raw log stream.

### 3. Langfuse on the architect bridge

- Instrument `agent-builder-ui/app/api/openclaw/route.ts` with optional Langfuse tracing.
- Create one trace per architect request with `request_id`, session key, mode, retry behavior, approval outcomes, and final result code.
- Propagate correlation ids into backend system events so the backend timeline and Langfuse trace refer to the same run.

## Why not Langfuse only?

- Langfuse is strong for LLM and tool-execution tracing.
- It is not the right canonical store for backend sandbox lifecycle, Docker orchestration, or general control-plane/system state.
- Agents need domain-shaped events like `sandbox.create.failed` more than raw span trees.

## Initial Slice

- Backend:
  - migration + store
  - write helper
  - global/scoped read routes
  - sandbox-create lifecycle emission
- Bridge:
  - optional Langfuse initialization
  - request/trace correlation
  - bounded lifecycle instrumentation

## Risks

- Bun backend compatibility with Langfuse’s Node-specific helpers is uncertain, so Langfuse must stay bridge-scoped in the first pass.
- Event overproduction will make the stream noisy; the first slice should prefer milestone events over step-by-step debug spam.
- Secret-bearing payloads already exist in some route bodies, so redaction tests are mandatory.
