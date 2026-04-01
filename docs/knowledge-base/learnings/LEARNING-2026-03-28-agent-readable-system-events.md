# LEARNING: Agent-Readable Observability Needs A Hybrid Boundary

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[001-architecture]] | [[002-backend-overview]] | [[008-agent-builder-ui]] | [[SPEC-agent-readable-system-events]]

## Context

While rebuilding the repo's low-quality logging, the implementation had to decide whether Langfuse/OpenTelemetry could replace product-runtime logging entirely or whether the backend still needed its own durable event ledger.

## What Was Learned

- Langfuse is a good fit for architect-request tracing on the Node-based `agent-builder-ui` bridge, but it is not a sufficient replacement for product/runtime logs that agents need to query directly.
- The backend still needs a first-class durable `system_events` table because sandbox lifecycle, forge, and control-plane/runtime outcomes must remain queryable even when no external tracing backend is configured.
- Stable correlation only works if the same logical request identity is reused across layers. The backend now reuses inbound `x-request-id` values for `system_events`, and the bridge reuses `request_id` as the gateway `chat.send.idempotencyKey`.
- The safe boundary is: PostgreSQL-backed `system_events` for canonical agent-readable runtime history, Langfuse/OpenTelemetry for additive bridge trace correlation, and shared `request_id` / `trace_id` fields to connect the two.

## Evidence

- `ruh-backend/src/systemEventStore.ts` adds redacted persistence plus bounded filter reads for `system_events`.
- `ruh-backend/src/schemaMigrations.ts` adds migration `0015_system_events`.
- `ruh-backend/src/app.ts` exposes `GET /api/system/events`, `GET /api/sandboxes/:sandbox_id/system-events`, and `GET /api/agents/:id/system-events`, and writes `sandbox.create.*` / `agent.forge.*` events with stable request correlation.
- `agent-builder-ui/lib/openclaw/langfuse.ts` initializes a Node OpenTelemetry SDK with `LangfuseSpanProcessor` only when Langfuse env vars are present.
- `agent-builder-ui/app/api/openclaw/route.ts` records bounded architect-bridge milestones and returns `trace_id` in the terminal result payload when tracing is enabled.

## Implications For Future Agents

- New product/runtime observability should start with a backend `system_events` emission point, not a Langfuse-only trace.
- Use Langfuse for LLM/bridge milestones, retries, approvals, and transport diagnosis, but do not make core runtime understanding depend on external trace availability.
- Preserve `request_id`, `trace_id`, and resource scoping fields (`sandbox_id`, `agent_id`, `conversation_id`) whenever adding new event emitters so future readers can reconstruct one logical flow across services.
- Keep `details` agent-safe: store identifiers, counts, reason codes, and bounded summaries rather than raw prompts, credentials, or unbounded command output.

## Follow-Up Implementation

- The shipped first pass writes backend-owned system events for sandbox-create and forge lifecycle flows and exposes bounded read APIs.
- The shipped bridge tracing layer is optional and backend-independent; local development stays functional with Langfuse disabled.
- The next logical expansion is to add more backend emitters for other high-value runtime/control-plane flows rather than widening the bridge trace payloads first.

## Links

- [[001-architecture]]
- [[002-backend-overview]]
- [[004-api-reference]]
- [[005-data-models]]
- [[008-agent-builder-ui]]
- [[010-deployment]]
- [[SPEC-agent-readable-system-events]]
- [Journal entry](../../journal/2026-03-28.md)
