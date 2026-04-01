# LEARNING: Expensive control-plane routes need a shared rate-limit boundary

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[001-architecture]] | [[002-backend-overview]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the existing active tasks for auth, request validation, sandbox-create admission control, architect isolation, and bridge auth were compared against the live expensive routes in `ruh-backend` and `agent-builder-ui`.

## What Was Learned

- The repo still has no shared abuse-control layer for expensive backend or architect control-plane requests.
- `ruh-backend/src/app.ts` exposes sandbox creation, gateway chat proxying, config pushes, cron mutation, and channel mutation without any route-level rate limiting, in-flight concurrency cap, or documented `429` backoff contract.
- `agent-builder-ui/app/api/openclaw/route.ts` retries privileged architect runs against a shared gateway but does not throttle callers or cap concurrent runs per browser session or user.
- Existing backlog items cover auth, ownership, request validation, sandbox-create quotas, and architect isolation, but none define the general throttling contract that keeps one buggy client or malicious caller from consuming disproportionate Docker or provider capacity.

## Evidence

- `ruh-backend/src/app.ts` applies `express.json()` and CORS globally, then registers high-cost routes such as:
  - `POST /api/sandboxes/create`
  - `POST /api/sandboxes/:sandbox_id/chat`
  - `POST /api/sandboxes/:sandbox_id/configure-agent`
  - `POST|PATCH|DELETE /api/sandboxes/:sandbox_id/crons*`
- `agent-builder-ui/app/api/openclaw/route.ts` accepts arbitrary POST calls with `session_id` and `message`, then opens a privileged WebSocket connection and retries failed attempts up to three times.
- `docs/knowledge-base/004-api-reference.md` documents no `429` outcomes or `Retry-After` expectations for these expensive routes.
- `TODOS.md` already tracks sandbox-create quotas (`TASK-2026-03-25-19`), backend auth (`TASK-2026-03-25-09`), and architect bridge auth (`TASK-2026-03-25-24`), but no task defines a broader route-throttling contract across backend and builder control-plane paths.

## Implications For Future Agents

- Treat rate limiting and overload backoff as a first-class reliability and abuse-prevention boundary, not as an implementation detail hidden inside auth or create-admission tasks.
- Keep sandbox-create quotas and general request throttling distinct: quotas govern provisioning admission, while route throttles protect shared control-plane capacity and upstream provider spend.
- When hardening the architect bridge, make retry behavior respect the throttle policy so local retries do not become upstream load amplification.

## Links

- [[001-architecture]]
- [[002-backend-overview]]
- [[004-api-reference]]
- [[008-agent-builder-ui]]
- [Journal entry](../../journal/2026-03-25.md)
