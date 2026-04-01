# LEARNING: Sandbox provisioning needs restart-safe job persistence

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[003-sandbox-lifecycle]] | [[004-api-reference]]

## Context

While reviewing the current sandbox-create flow against `TODOS.md`, the backend implementation, and the existing "durable provisioning streams" task, the remaining reliability gap was backend restart during provisioning. The flow is long-running enough that restart during create is realistic, especially during local deploys or process churn.

## What Was Learned

The current sandbox provisioning contract is only durable within one backend process. `ruh-backend/src/app.ts` stores create state in the in-memory `_streams` map, `POST /api/sandboxes/create` only returns a generated `stream_id`, and `GET /api/sandboxes/stream/:stream_id` depends on that same process-local entry to expose progress or result. If the backend restarts during provisioning, the job state disappears even though Docker work may already have started or partially completed.

The existing backlog item `TASK-2026-03-25-19: Durable Sandbox Provisioning Streams` improves reconnectability and moves work start closer to `POST`, but its current implementation outline still describes a process-local job object and bounded in-memory replay buffer. That means it solves transient disconnect inside one process, not restart-safe recovery across backend crashes or deploys.

## Evidence

- `ruh-backend/src/app.ts` defines `_streams` as `new Map<string, StreamEntry>()` and uses it as the only create-job store.
- `POST /api/sandboxes/create` records only `{ status: 'pending', request }` in `_streams`; there is no persisted create-job row.
- `GET /api/sandboxes/stream/:stream_id` returns `404` when `_streams` does not contain the key and otherwise depends on the map entry for progress/result.
- `ruh-frontend/components/SandboxForm.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` each assume one uninterrupted EventSource and currently surface stream loss as failure.

## Implications For Future Agents

- Treat "durable provisioning" as insufficient unless the design survives backend restart, not just browser reconnect.
- Prefer a persisted provisioning-job ledger or equivalent restart-recoverable state before building more UI around `stream_id`.
- Keep the restart-recovery design aligned with `TASK-2026-03-25-19` so the repo does not end up with separate transient-reconnect and crash-recovery implementations.
- When touching sandbox lifecycle docs or APIs, document whether recovery is process-local or restart-safe; do not label the flow "durable" unless restart semantics are explicit.

## Links

- [[003-sandbox-lifecycle]]
- [[004-api-reference]]
- [Journal entry](../../journal/2026-03-25.md)
