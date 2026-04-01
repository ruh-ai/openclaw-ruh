# SPEC: Agent-Readable System Events

[[000-INDEX|← Index]] | [[002-backend-overview]] | [[001-architecture]]

## Status
implemented

## Summary

The repo currently emits critical runtime history through scattered `console.*` output, ephemeral SSE strings, and a narrow control-plane audit ledger. This spec adds one backend-owned structured system-event stream that agents can query directly to understand what happened across sandbox lifecycle, backend control-plane work, and architect bridge activity, while using Langfuse/OpenTelemetry only as an additive tracing layer for LLM-centric flows.

## Related Notes

- [[001-architecture]] — defines the cross-service observability boundary and where backend-vs-bridge responsibilities live
- [[002-backend-overview]] — owns the backend modules, startup contract, and the new persistence/read API surface
- [[003-sandbox-lifecycle]] — sandbox create/retrofit/restart flows must emit durable lifecycle events instead of only transient SSE text
- [[004-api-reference]] — documents the new read API and the existing routes that emit system events
- [[005-data-models]] — defines the `system_events` table and record shape
- [[008-agent-builder-ui]] — the Next.js architect bridge will attach request correlation and optional Langfuse tracing metadata
- [[010-deployment]] — introduces Langfuse and system-event retention environment/config requirements
- [[SPEC-control-plane-audit-log]] — remains the sensitive mutation audit ledger; this spec adds broader runtime/system observability instead of replacing it

## Specification

### Goals

1. Give agents one durable, queryable event history they can read to reconstruct recent system behavior.
2. Replace high-value ad hoc runtime logs with typed, structured backend-owned events.
3. Correlate backend system events, control-plane audit rows, and Langfuse traces with stable request/session identifiers.
4. Keep the event stream safe for agent consumption by redacting secrets and constraining payload shapes.

### Non-goals

- Building a human log viewer UI in this slice
- Replacing the existing `control_plane_audit_events` ledger for sensitive admin/audit questions
- Capturing arbitrary raw stdout/stderr from every process or sandbox command
- Making Langfuse the sole system log source

### System Event Model

Persist durable rows in a backend-owned `system_events` table.

Each event must include:

- `event_id` — server-generated unique identifier
- `occurred_at` — UTC timestamp
- `level` — bounded severity enum such as `debug`, `info`, `warn`, `error`
- `category` — bounded area such as `sandbox.lifecycle`, `sandbox.runtime`, `backend.request`, `bridge.architect`, `channel.config`
- `action` — normalized event verb such as `sandbox.create.started`, `sandbox.create.succeeded`, `sandbox.create.failed`, `bridge.run.accepted`, `bridge.run.failed`
- `status` — bounded lifecycle/result enum such as `started`, `progress`, `success`, `failure`, `timeout`, `degraded`
- `message` — short bounded summary safe for direct agent consumption
- `request_id` — stable request identifier when available
- `trace_id` — OTel/Langfuse trace correlation id when available
- `span_id` — optional span correlation id when available
- `sandbox_id` — optional sandbox scope
- `agent_id` — optional agent scope
- `conversation_id` — optional conversation scope
- `source` — emitting service/module identifier such as `ruh-backend:sandboxManager` or `agent-builder-ui:openclaw-route`
- `details` — redacted structured metadata with bounded keys and values

### Redaction Rules

System events must never store:

- gateway tokens
- preview tokens
- API keys
- raw OAuth secrets
- cookies
- full prompt bodies
- raw tool credentials
- full command outputs when they may include secrets or large unbounded noise

Rules for `details`:

- prefer identifiers, booleans, counts, durations, reason codes, and safe snippets
- truncate bounded diagnostic text
- store command/tool classifications instead of secret-bearing full payloads
- allow safe operator-facing summaries such as `bootstrap_step="gateway.start"` or `tool_name="exec"`

### Emission Contract

The backend becomes the canonical writer for durable system events.

Initial first-pass emitters:

- sandbox creation SSE lifecycle in `createOpenclawSandbox()`
- forge sandbox creation lifecycle
- architect bridge request lifecycle summaries exposed through Langfuse/OpenTelemetry traces

The first pass does not need every route. It should prioritize flows where operators or agents currently lose critical context after the request ends.

### Read API Contract

Expose bounded backend read endpoints for agent consumption.

The first pass must support:

- newest-first ordering
- limit with a documented maximum
- optional filters by `level`, `category`, `action`, `sandbox_id`, `agent_id`, `request_id`, `trace_id`
- optional filters by `status`, `conversation_id`, and `source`

Time-window filters remain future work.

Suggested route surface:

- `GET /api/system/events`
- `GET /api/sandboxes/:sandbox_id/system-events`
- `GET /api/agents/:agent_id/system-events`

The global route may remain admin-gated if needed, but scoped sandbox/agent routes should be usable by product/runtime agents without requiring a separate human UI.

### Langfuse / OpenTelemetry Contract

Langfuse is additive and focused on LLM/bridge observability, not the full system log.

First-pass Langfuse usage:

- instrument `agent-builder-ui/app/api/openclaw/route.ts`
- create one trace per architect request
- attach `request_id`, session key, agent mode, sandbox resolution metadata, and bounded failure reason codes
- record important bridge lifecycle milestones such as accepted run, pre-accept retry, post-accept disconnect, approval deny, and final outcome

The Bun backend should not depend on Langfuse-specific runtime helpers in the first pass if compatibility is unclear. Instead it should accept propagated `trace_id`/`request_id` values and persist them into `system_events`.

### Relationship To Existing Audit Log

`control_plane_audit_events` remains the source for high-risk mutation accountability.

`system_events` is different:

- broader runtime coverage
- agent-readable summaries
- includes non-mutating operational events
- can reference an audit event indirectly through shared `request_id` or action naming

Future work may add explicit joins or cross-links, but the first pass only requires correlation fields.

## Implementation Notes

- Add a new backend store module such as `ruh-backend/src/systemEventStore.ts`.
- Add a new ordered migration in `ruh-backend/src/schemaMigrations.ts`.
- Introduce one helper for writing safe system events from routes and orchestration modules.
- Prefer emitting structured events at the decision boundary rather than re-parsing free-form console output later.
- Add optional Langfuse dependencies only to `agent-builder-ui`, where official Node.js support is clear.
- The shipped first pass exposes `GET /api/system/events`, `GET /api/sandboxes/:sandbox_id/system-events`, and `GET /api/agents/:id/system-events`.
- The shipped first-pass backend emitters persist `sandbox.create.*` and `agent.forge.*` lifecycle rows from `ruh-backend/src/app.ts`.
- The shipped bridge tracing helper lives in `agent-builder-ui/lib/openclaw/langfuse.ts`; `agent-builder-ui/app/api/openclaw/route.ts` records architect request lifecycle milestones there and returns `trace_id` in the terminal SSE `result` payload when tracing is enabled.

## Test Plan

- Unit tests for system-event redaction, serialization, and filter query construction
- Route tests for the new read API and scoped sandbox/agent filters
- Lifecycle tests proving sandbox-create emits durable `started`/`success`/`failure` events with request correlation
- Bridge tests proving architect request correlation metadata is generated and forwarded safely when Langfuse config is enabled or absent
- Regression coverage that secret-bearing values are absent from stored `details`

Implemented verification:

- `cd ruh-backend && bun test tests/unit/systemEventStore.test.ts tests/unit/systemEventsApp.test.ts`
- `cd agent-builder-ui && bun test app/api/openclaw/route.test.ts lib/openclaw/langfuse.test.ts`
- `cd agent-builder-ui && npm run typecheck`
- `cd agent-builder-ui && npm run build`
