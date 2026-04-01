# LEARNING: Long-running SSE routes need heartbeat keepalives before reconnect logic

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[003-sandbox-lifecycle]] | [[008-agent-builder-ui]] | [[010-deployment]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the two long-running SSE control-plane routes were compared against the checked-in proxy config and the existing backlog items for reconnectability, retry safety, and graceful shutdown.

## What Was Learned

- The repo currently treats long-running SSE disconnects mainly as a recovery problem, but there is also a preventive gap: healthy streams can go idle long enough for the proxy layer to close them.
- `ruh-backend/src/app.ts` only writes sandbox-create SSE bytes when `createOpenclawSandbox()` yields a real event, yet `ruh-backend/src/sandboxManager.ts` contains silent steps with 120s, 300s, and 600s budgets.
- `agent-builder-ui/app/api/openclaw/route.ts` only enqueues browser-facing SSE frames on lifecycle and final-result events; it has no keepalive output while gateway work is in progress.
- `nginx/nginx.conf` sets `/api/` `proxy_read_timeout` and `proxy_send_timeout` to 180s, so any of those routes can be disconnected by an otherwise healthy `>180s` quiet phase.
- Existing tasks already cover reconnect after disconnect (`TASK-2026-03-25-19`, `TASK-2026-03-25-32`), architect retry safety after transport loss (`TASK-2026-03-25-33`), and shutdown-time stream termination (`TASK-2026-03-25-55`), but none define a heartbeat/keepalive contract to stop those avoidable idle disconnects in the first place.

## Evidence

- `nginx/nginx.conf` contains:
  - `proxy_read_timeout 180s;`
  - `proxy_send_timeout 180s;`
  - `proxy_buffering off;`
- `ruh-backend/src/app.ts` writes sandbox-create SSE frames only through `sendEvent(event, data)` inside generator event handling; there is no timer or comment heartbeat path.
- `ruh-backend/src/sandboxManager.ts` runs:
  - `npm install -g openclaw@latest` with a 600s timeout
  - retry install with `--unsafe-perm` with a 600s timeout
  - `openclaw onboard ...` with a 120s timeout
  - a 300s device-approval polling window that emits only on approval or final timeout messaging
- `agent-builder-ui/app/api/openclaw/route.ts` only calls `controller.enqueue()` from the `send()` helper when lifecycle or result data is available; it defines no keepalive interval.

## Implications For Future Agents

- Treat SSE liveness as a first-class transport contract, not only a reconnect/retry concern after failure.
- When a route can spend minutes inside legitimate work with no semantic progress event, emit bounded keepalive bytes on an interval below the narrowest proxy idle timeout.
- Prefer SSE comments or another no-op frame that existing clients can ignore safely unless a spec explicitly changes the public event contract.
- Keep proxy timeout settings and heartbeat cadence documented together so deployment changes do not silently reintroduce this failure mode.

## Links

- [[003-sandbox-lifecycle]]
- [[008-agent-builder-ui]]
- [[010-deployment]]
- [Journal entry](../../journal/2026-03-25.md)
