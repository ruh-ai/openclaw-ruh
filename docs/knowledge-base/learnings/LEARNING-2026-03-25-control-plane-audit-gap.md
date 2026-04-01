# LEARNING: Control-Plane Mutations Need a Shared Audit Ledger

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[001-architecture]] | [[008-agent-builder-ui]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the existing active tasks for auth, ownership, secret handling, approval policy, release history, and provisioning were compared against the live mutation routes in `ruh-backend` and the architect bridge route in `agent-builder-ui`.

## What Was Learned

- The repo is already planning to authenticate callers, scope resources per user, redact secrets, and version agent releases, but it still does not define a shared durable audit trail for sensitive control-plane actions.
- `ruh-backend/src/app.ts` mutates high-value state through sandbox delete, configure-agent, LLM reconfigure, cron mutation, channel update/pairing approval, conversation deletion, and admin retrofit routes without persisting actor, target, or outcome metadata.
- `agent-builder-ui/app/api/openclaw/route.ts` is part of the same control plane because it brokers architect runs with server-held gateway credentials and will soon need to record approval allow/deny decisions, yet no current backlog item provides a common audit sink for those events.
- Release history is not a substitute for audit logging: it tracks config snapshots, not who performed secret reveals, destructive deletes, approval decisions, or other operator-sensitive actions.

## Evidence

- `ruh-backend/src/app.ts` defines destructive or sensitive routes such as:
  - `DELETE /api/sandboxes/:sandbox_id`
  - `POST /api/sandboxes/:sandbox_id/configure-agent`
  - `POST /api/sandboxes/:sandbox_id/reconfigure-llm`
  - `POST|PATCH|DELETE /api/sandboxes/:sandbox_id/crons*`
  - `PUT /api/sandboxes/:sandbox_id/channels/*`
  - `POST /api/admin/sandboxes/:sandbox_id/retrofit-shared-codex`
- `agent-builder-ui/app/api/openclaw/route.ts` still acts as a privileged bridge to the architect gateway and is the natural place where future approval decisions will need durable provenance.
- `TODOS.md` already contains:
  - TASK-2026-03-25-09, which mentions caller context for downstream handlers and audit logging
  - TASK-2026-03-25-18, which expects reveal/audit expectations for sandbox secrets
  - TASK-2026-03-25-14, which calls out the lack of an approval audit trail
  - TASK-2026-03-25-07, which adds release history but does not cover broader operator actions
- No existing task defines a shared audit-event schema, storage layer, or admin query surface across those actions.

## Implications For Future Agents

- Treat control-plane audit logging as its own security and operability boundary, not as an incidental side effect of auth or release history work.
- Do not ship secret reveal flows, architect approval decisions, or broader authenticated control-plane access without deciding where those actions are recorded and how secret-bearing payloads are redacted.
- Prefer one shared audit-event model that both `ruh-backend` and the architect bridge can write to instead of inventing per-feature history tables for approvals, reveals, or admin repairs.
- Use [[SPEC-control-plane-audit-log]] as the canonical contract before implementing route instrumentation or admin audit-history queries.

## Links

- [[001-architecture]]
- [[004-api-reference]]
- [[008-agent-builder-ui]]
- [[SPEC-control-plane-audit-log]]
- [[009-ruh-frontend]]
- [Journal entry](../../journal/2026-03-25.md)
