# Backend Overview

[[000-INDEX|← Index]] | [[001-architecture|Architecture]] | [[003-sandbox-lifecycle|Sandbox Lifecycle →]]

---

## Location

```
ruh-backend/
  src/
    index.ts           — entry point: loads env and delegates startup orchestration
    app.ts             — Express app: all routes + middleware (no startup side-effects)
    startup.ts         — startup orchestration: init DB, mark readiness, then listen
    backendReadiness.ts — process-local readiness state for `/ready`
    db.ts              — PostgreSQL connection pool (pg library)
    docker.ts          — Docker exec/spawn helpers plus shared shell-quoting/path-normalization utilities
    store.ts           — sandboxes table CRUD
    agentStore.ts      — agents table CRUD
    conversationStore.ts — conversations + messages tables CRUD
    auditStore.ts      — control-plane audit-event table init, redaction, and admin-query helpers
    sandboxManager.ts  — Docker container management, OpenClaw installation
    channelManager.ts  — Telegram/Slack config via docker exec
    utils.ts           — pure helpers: httpError, gatewayUrlAndHeaders, parseJsonOutput, syntheticModels
    validation.ts      — shared request validators for strict write-route parsing
  tests/
    unit/              — unit tests for each module
    integration/       — CRUD integration tests (real DB)
    contract/          — OpenAI API contract tests
    e2e/               — end-to-end flow tests
    security/          — auth, CORS, injection tests
    smoke/             — smoke test
    helpers/           — shared fixtures, mock Daytona, env setup
```

---

## Startup Sequence (`index.ts`)

1. Load `.env` via `dotenv`
2. Mark backend readiness as `not_ready`
3. Call `initPool()` — creates PostgreSQL connection pool (requires `DATABASE_URL`)
4. Call `store.initDb()` — creates `sandboxes` table if not exists
5. Call `conversationStore.initDb()` — creates `conversations` + `messages` tables if not exists
6. Call `agentStore.initDb()` — creates `agents` table if not exists
7. Call `auditStore.initDb()` — creates `control_plane_audit_events` table if not exists
8. Start Express HTTP server on `PORT` (default: 8000)
9. Mark backend readiness as `ready`

**Readiness contract:** startup now fails fast if required DB initialization fails. The process should not start serving traffic until the DB-backed stores are initialized successfully.

---

## Module Responsibilities

### `app.ts` — Express Routes
- Sets up CORS from `ALLOWED_ORIGINS` env var (default: `http://localhost:3000`)
- Applies `express.json({ limit: '256kb' })` before route handling
- Maintains an in-memory `_streams` Map for active sandbox creation SSE streams
- Exposes `/health` as a liveness check and `/ready` as the DB-readiness check
- All routes use `asyncHandler()` wrapper to convert async errors to Express `next(err)`
- Error middleware at the bottom: returns `{ detail: message }` with status code

### `db.ts` — Connection Pool
- Singleton `Pool` initialized via `initPool()`
- `withConn(fn)` — acquires connection, runs `BEGIN`/`COMMIT`/`ROLLBACK` automatically
- Pool config: min=2, max=10 connections

### `store.ts` — Sandbox CRUD
- `saveSandbox()` — upsert by `sandbox_id`
- `markApproved()` — sets `approved=TRUE` after device pairing
- `listSandboxes()` — ordered by `created_at DESC`
- `getSandbox()`, `deleteSandbox()`
- See [[005-data-models]] for the `SandboxRecord` interface

### `conversationStore.ts` — Conversation CRUD
- Creates `conversations` and `messages` tables with CASCADE delete
- Session key format: `agent:main:<uuid>` — sent to OpenClaw as `x-openclaw-session-key`
- `appendMessages()` also increments `message_count` and updates `updated_at`
- See [[007-conversation-store]] for full details

### `auditStore.ts` — Control-Plane Audit Ledger
- Creates the `control_plane_audit_events` table plus ordering/filter indexes
- Redacts secret-bearing detail fields before persistence
- Provides `writeAuditEvent()` for backend route instrumentation and `listAuditEvents()` for the admin query surface
- See [[005-data-models]] for the audit-event schema and [[SPEC-control-plane-audit-log]] for the contract

### `conversationAccess.ts` — Conversation Route Guards
- Resolves direct conversation access only when both the sandbox record still exists and the conversation belongs to that sandbox
- Lets direct message/rename/delete routes fail closed with `404` after sandbox deletion instead of serving orphaned history by stale IDs
- See [[SPEC-sandbox-conversation-cleanup]] for the current contract

### `sandboxManager.ts` — Docker
- `createOpenclawSandbox()` — async generator that yields `SandboxEvent` tuples
- `dockerExec()` — runs `docker exec <container> bash -c <cmd>`
- `getContainerName()` — returns `openclaw-<sandbox_id>`
- Route handlers that assemble shell-backed commands should use the shared helpers in `docker.ts` instead of ad hoc interpolation
- See [[003-sandbox-lifecycle]] for full creation flow

### `channelManager.ts` — Channels
- Reads/writes OpenClaw config inside the container via `docker exec`
- Restarts gateway after config changes
- See [[006-channel-manager]] for full details

### `utils.ts` — Helpers
- `httpError(status, detail)` — creates Error with `.status` property (used by error middleware)
- `gatewayUrlAndHeaders(record, path)` — builds URL and auth headers for gateway proxy calls
- `parseJsonOutput(output)` — finds first JSON line in CLI output (used for cron commands)
- `syntheticModels()` — fallback model list when gateway is unreachable

### `validation.ts` — Shared Request Validation
- Owns strict object parsing for covered write routes
- Distinguishes structural failures (`400`) from schema-constraint failures (`422`)
- Current implemented slices cover `POST /api/agents`, `PATCH /api/agents/:id`, `PATCH /api/agents/:id/config`, and `POST /api/agents/:id/sandbox` with unknown-key rejection plus bounded string/array parsing for the documented fields

---

## Adding a New Endpoint

1. Add route handler in `app.ts` using `asyncHandler(async (req, res) => { ... })`
2. Use `getRecord(sandbox_id)` to validate sandbox exists (throws 404 if not)
3. Use `sandboxExec(sandbox_id, cmd, timeoutSec)` to run commands in the container
4. For JSON output from CLI: use `parseJsonOutput(output)`
5. For write routes, prefer `validation.ts` helpers before reading `req.body` directly
6. Throw `httpError(status, message)` for expected errors
7. Add unit/integration tests in `tests/`

## Related Learnings

- [[LEARNING-2026-03-25-backend-request-validation-gap]] — the backend currently relies on scattered ad hoc checks instead of a shared request-schema boundary, so malformed write/proxy payloads can reach persistence or downstream services without a consistent fail-fast contract
- [[LEARNING-2026-03-25-backend-error-diagnostic-exposure]] — several backend routes still echo raw gateway or CLI diagnostics straight to clients, so the API lacks a client-safe error boundary
- [[LEARNING-2026-03-25-control-plane-rate-limit-gap]] — the backend currently exposes expensive create/chat/mutation routes without a documented throttling or overload contract
- [[LEARNING-2026-03-25-docker-daemon-readiness-gap]] — backend startup and readiness currently ignore Docker availability even though the core control plane depends on Docker-backed operations
- [[LEARNING-2026-03-25-docker-timeouts-not-enforced]] — backend Docker helper timeouts are currently advisory only, so hung Docker/OpenClaw subprocesses can wedge otherwise bounded backend flows indefinitely
- [[LEARNING-2026-03-25-deployed-chat-cancellation-gap]] — deployed sandbox chat currently has no client-disconnect cancellation boundary, so abandoned chat requests can keep consuming upstream gateway/model work

## Related Specs

- [[SPEC-backend-request-validation]] — defines the shared validator contract and first-pass route coverage for backend request parsing
- [[SPEC-backend-shell-command-safety]] — defines the shared shell-quoting and path-normalization contract for Docker-backed backend mutations
- [[SPEC-sandbox-conversation-cleanup]] — defines sandbox-owned conversation cleanup plus fail-closed direct conversation-route guards
- [[SPEC-graceful-shutdown]] — defines the process-lifecycle contract for signal handling, request draining, SSE termination, and DB-pool shutdown
