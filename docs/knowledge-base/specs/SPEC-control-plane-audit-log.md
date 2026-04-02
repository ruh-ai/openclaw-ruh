# SPEC: Control-Plane Audit Log

[[000-INDEX|← Index]] | [[001-architecture]] | [[004-api-reference]]

## Status
`draft`

## Summary
The repo is adding stronger auth, secret handling, and approval guardrails, but it still lacks a shared durable audit trail for sensitive control-plane actions. This spec defines one audit-event model for backend mutations and architect-bridge approval activity so operators can answer who did what, to which target, when, and with what outcome without storing raw secret material.

## Related Notes
- [[001-architecture]] — defines the shared control-plane boundary across `ruh-backend` and the builder bridge
- [[004-api-reference]] — must document which routes create audit events and how admins can query them
- [[008-agent-builder-ui]] — owns the architect bridge path that will emit approval and policy audit events
- [[LEARNING-2026-03-25-control-plane-audit-gap]] — captures the route-level evidence motivating this spec

## Specification

### Goals

1. Persist one structured audit event for each high-risk control-plane action or policy-relevant denial.
2. Capture actor, target, request, and outcome metadata in a format that both backend routes and the architect bridge can share.
3. Redact or omit secrets, tokens, prompt bodies, and other sensitive payload fields before persistence.
4. Provide one admin-only query surface so future features reuse the same history store instead of inventing route-local logs.

### Non-goals

- Replacing normal application logs, tracing, or metrics for low-risk read traffic
- Solving full end-user identity on its own; this spec must work with partial actor context until `TODOS.md` task `TASK-2026-03-25-09` lands
- Capturing full request or response bodies for chat, prompts, secrets, or tool payloads
- Shipping a full frontend audit viewer in the first pass

### Audit Event Model

Persist audit rows in one backend-owned store such as `control_plane_audit_events`.

Each event must include:

- `event_id` — server-generated unique identifier
- `occurred_at` — server timestamp in UTC
- `request_id` — stable request/run identifier when available
- `action_type` — normalized verb such as `sandbox.delete`, `sandbox.configure_agent`, `cron.create`, `channel.telegram.update`, `architect.approval.allow`
- `target_type` — normalized resource category such as `sandbox`, `agent`, `conversation`, `channel_pairing`, `architect_run`
- `target_id` — primary identifier for the affected resource
- `outcome` — one of `success`, `failure`, `denied`, `timeout`, or another documented bounded enum
- `actor_type` — `user`, `admin_token`, `service`, `anonymous`, or future documented values
- `actor_id` — validated caller identifier when available, otherwise a bounded fallback label
- `origin` — safe request-origin metadata such as IP hash, session id, or bridge session identifier as allowed by the redaction rules
- `details` — safe structured metadata with bounded keys and values

### Redaction Rules

Audit events must never persist:

- gateway bearer tokens
- preview tokens
- provider API keys
- raw tool credentials
- cookie values
- raw prompt bodies, SOUL content, or full tool-exec payloads unless a future spec explicitly allows a redacted subset

Rules for `details`:

- Prefer identifiers, enum values, counts, and boolean flags over free-form payload text.
- If a field may contain a secret, either drop it entirely or replace it with a masked summary such as `configured=true`.
- Store approval/tool metadata as safe summaries like command category, allowlist classification, or tool name, not the full secret-bearing arguments.
- Truncate any free-form error string or CLI output to a short sanitized summary before persistence.

### Event Taxonomy

The first implementation pass must cover these action groups:

- Sandbox lifecycle mutations: delete, explicit cleanup after failed create, shared-Codex retrofit
- Sandbox runtime mutations: configure-agent, reconfigure-llm
- Cron mutations: create, edit, delete, toggle, run
- Channel mutations: telegram/slack config updates and pairing approvals
- Conversation destructive actions: rename and delete when the action is operator-visible
- Agent destructive actions: delete and future undeploy/redeploy mutations
- Architect approval events once `TODOS.md` task `TASK-2026-03-25-14` lands: auto-allow, manual allow, deny, timeout

For each action type, the spec-selected event payload must answer:

- who initiated the action
- what resource was targeted
- whether the action succeeded, failed, or was denied
- what safe reason or classification explains the outcome

### Write Path Contract

- Audit writes must be attempted from the same server-side boundary that owns the mutation decision.
- Failure to write an audit event must be observable to operators, but the spec should avoid making every mutation permanently unavailable because the audit store is temporarily degraded. The implementation may choose either:
  - fail closed for the highest-risk routes, or
  - return success to the caller while surfacing an explicit degraded audit-write error to logs/health signals.
- The chosen policy must be documented route-by-route during implementation; until then, the default planning assumption is fail closed for secret reveal and approval decisions, and fail open with explicit operator noise for lower-risk mutations.

### Actor Mapping

- When backend bearer auth exists, use the validated caller identity from the auth middleware.
- For current admin-token routes, record `actor_type=admin_token` plus a stable configured label rather than treating the call as anonymous.
- For bridge-generated approval or system events, use `actor_type=service` with the relevant builder session or architect run identifier in safe metadata.
- If a route is unauthenticated today, record the best available fallback actor/origin shape rather than skipping audit emission entirely.

### Admin Query Contract

Expose one admin-only query endpoint such as `GET /api/admin/audit-events`.

The first query surface must support bounded filters for:

- `action_type`
- `target_type`
- `target_id`
- `actor_type`
- `actor_id`
- `outcome`
- time range

The endpoint must define pagination, deterministic ordering by newest first, and a documented retention policy or placeholder retention rule if storage pruning is deferred.

### Relationship To Other Tasks

- `TASK-2026-03-25-09` supplies stronger caller identity; this spec defines how that identity is stored once available.
- `TASK-2026-03-25-18` should use this shared audit model for explicit secret-reveal events rather than inventing a second reveal-history table.
- `TASK-2026-03-25-14` should emit architect approval allow/deny/timeout events through this ledger.
- `TASK-2026-03-25-07` remains release/config history, not a replacement for action-level auditing.

## Implementation Notes

- Primary backend surfaces are likely `ruh-backend/src/app.ts`, auth helpers, and a new audit store/helper module under `ruh-backend/src/`.
- The architect bridge at `agent-builder-ui/app/api/openclaw/route.ts` should not write directly to a separate frontend store; it should call the shared backend-owned audit path or module contract.
- API docs should identify the routes that emit audit rows and the admin query surface once implemented.
- Future high-risk routes should add an `action_type` mapping as part of their route definition instead of bolting on route-local history later.

### 2026-03-25 backend slice

The first implemented backend slice now exists in `ruh-backend/src/auditStore.ts`, `ruh-backend/src/app.ts`, and `ruh-backend/src/startup.ts`.

- Added a durable PostgreSQL-backed `control_plane_audit_events` ledger with redacted JSONB details and basic ordering/filter indexes.
- Startup now initializes the audit table before the backend marks itself ready.
- `ruh-backend` writes representative audit events for sandbox delete, agent delete, configure-agent, LLM reconfigure, shared-Codex retrofit, cron create/edit/delete/toggle/run, channel config changes, and pairing approvals.
- `GET /api/admin/audit-events` provides the first admin-only query surface with bounded filters and limit handling.
- Remaining follow-up: architect-bridge approval/deny/timeout emission is still intentionally deferred to the future bridge-specific implementation.

## Test Plan

- Unit tests for event serialization and redaction, especially for secret-bearing route inputs
- Unit or integration coverage for actor-context normalization across bearer-auth, admin-token, and bridge/service events
- Route or integration tests proving representative mutations emit persisted audit rows with the expected safe metadata
- Security tests proving raw secrets and tokens are absent from stored audit payloads
- Admin-route tests for auth enforcement, pagination, and filter behavior on the audit query endpoint
