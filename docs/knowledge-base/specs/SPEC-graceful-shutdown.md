# SPEC: Graceful Shutdown

[[000-INDEX|← Index]] | [[002-backend-overview]] | [[003-sandbox-lifecycle]] | [[010-deployment]]

## Status
`draft`

## Summary
`ruh-backend` currently starts serving traffic and long-lived SSE sandbox-create streams without a documented shutdown contract. This spec defines how the backend should react to `SIGTERM` and `SIGINT` so deploys and restarts stop accepting new traffic, drain bounded in-flight work, notify active SSE clients, cleanly release the PostgreSQL pool, and exit with a deterministic operator-visible outcome.

## Related Notes
- [[002-backend-overview]] — defines the backend startup/runtime modules that own signal handling, listener shutdown, and DB-pool teardown
- [[003-sandbox-lifecycle]] — covers the sandbox-create SSE stream and in-progress provisioning behavior that shutdown must terminate truthfully
- [[010-deployment]] — documents the Docker Compose and Kubernetes grace-period expectations that the backend must fit inside

## Specification

### Goals

- Stop accepting new HTTP connections promptly after `SIGTERM` or `SIGINT`
- Give active HTTP requests a bounded drain window instead of dropping them immediately
- Close sandbox-create SSE streams with a terminal backend-generated error event so the UI does not hang indefinitely
- Release the PostgreSQL pool before process exit
- Leave operators with deterministic logs and exit codes during Docker restarts, local interrupts, and Kubernetes rollouts

### Non-goals

- Making sandbox provisioning durable across backend restarts
- Performing deep Docker/container cleanup during process shutdown
- Adding a new distributed coordination system for in-flight backend work

### Shutdown trigger and budget

- `ruh-backend/src/index.ts` should register one shutdown entrypoint for both `SIGTERM` and `SIGINT`.
- The shutdown flow should be idempotent: repeated signals after the first one should not restart the sequence.
- The backend should read a configurable grace-period budget from `SHUTDOWN_GRACE_MS`, defaulting to `25000`.
- The configured backend grace period must fit inside the external runtime grace period:
  - Docker Compose service stop window
  - Kubernetes `terminationGracePeriodSeconds`
- If shutdown work exceeds the backend grace period, the process should log that the deadline was exceeded and exit non-zero as a last-resort safety path.

### HTTP listener behavior

- On shutdown start, the backend should mark itself as not ready before or at the same time it begins draining.
- The HTTP server must stop accepting new connections by calling `server.close()`.
- In-flight non-streaming requests may complete during the drain window.
- Requests that arrive after shutdown starts should not begin normal work. The implementation may reject them through listener close semantics or an explicit temporary-unavailable response, but the behavior must be deterministic and documented.

### SSE sandbox-create behavior

- Active `GET /api/sandboxes/stream/:stream_id` connections must receive one terminal `error` event describing that backend shutdown interrupted provisioning, followed by stream close.
- SSE stream bookkeeping must remove closed streams whether they end normally, the client disconnects, or shutdown forces termination.
- Shutdown must not leave the frontend in a perpetual pending state because the TCP connection disappeared without a terminal event.

### In-progress sandbox provisioning behavior

- Sandbox-create work already running in `createOpenclawSandbox()` should observe cooperative shutdown state and stop yielding normal progress after shutdown starts.
- Any sandbox record or stream state that still reflects `creating` must be transitioned into a failed or terminally interrupted outcome visible to clients after reconnect.
- Shutdown should not attempt best-effort container cleanup beyond the bounded logic already owned by create/timeout/reconciliation flows. The contract is to fail truthfully, not to invent a second cleanup subsystem at process-exit time.

### Database pool behavior

- `ruh-backend/src/db.ts` should expose a shutdown helper that awaits `pool.end()` only when the pool was initialized successfully.
- Pool shutdown should happen after the listener stops accepting new work and after active request draining has been given its bounded window.
- Pool-shutdown errors should be logged and should cause the overall shutdown result to be treated as unsuccessful.

### Logging and operator contract

- The backend should emit structured operator-visible logs for:
  - shutdown start
  - received signal
  - configured grace-period budget
  - listener close/drain completion
  - SSE stream termination count
  - DB pool shutdown result
  - final exit path
- Successful graceful shutdown should exit `0`.
- Deadline-forced or teardown-error shutdown should exit non-zero.

### Deployment alignment

- `ruh-backend/.env.example` should document `SHUTDOWN_GRACE_MS`.
- Docker Compose should set `stop_grace_period` at or above the backend grace period.
- Kubernetes backend deployment should set `terminationGracePeriodSeconds` at or above the backend grace period and should rely on readiness failing quickly once shutdown begins.

## Implementation Notes

- Primary implementation surface:
  - `ruh-backend/src/index.ts` for signal wiring and shutdown orchestration
  - `ruh-backend/src/db.ts` for pool teardown
  - `ruh-backend/src/app.ts` for active SSE stream tracking and termination
  - `ruh-backend/src/sandboxManager.ts` for cooperative create-flow interruption hooks
- This spec intentionally precedes code changes because the working tree already contains unrelated backend edits; the shutdown contract should land before implementation merges with that in-flight work.
- Related but separate concerns remain tracked elsewhere:
  - restart-safe provisioning durability
  - Docker helper timeout enforcement
  - runtime drift reconciliation

## Test Plan

- Add backend unit coverage for:
  - signal-triggered shutdown orchestration
  - idempotent repeated-signal handling
  - pool shutdown when initialized vs uninitialized
  - SSE terminal error emission during shutdown
  - deadline-forced exit path
- Add focused integration coverage for:
  - one in-flight request completing during shutdown
  - listener refusing or closing new work after shutdown starts
  - shutdown leaving no live DB pool connections behind
- Run the narrowest relevant verification command for each slice:
  - spec/docs-only slice: KB link/reference verification and diff hygiene
  - implementation slice: targeted Bun tests for the touched shutdown modules
