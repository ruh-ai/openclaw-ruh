# Backend Overview

[[000-INDEX|← Index]] | [[001-architecture|Architecture]] | [[003-sandbox-lifecycle|Sandbox Lifecycle →]]

---

## Location

```
ruh-backend/
  src/
    index.ts           — entry point: loads env and delegates startup orchestration
    config.ts          — centralized env parsing, defaults, and typed runtime config access
    app.ts             — Express app: all routes + middleware (no startup side-effects)
    startup.ts         — startup orchestration: init DB, mark readiness, then listen
    schemaMigrations.ts — ordered PostgreSQL migration ledger + startup runner
    backendReadiness.ts — process-local readiness state for `/ready`
    db.ts              — PostgreSQL connection pool (pg library)
    docker.ts          — Docker exec/spawn helpers plus shared shell-quoting/path-normalization utilities
    store.ts           — sandboxes table CRUD
    agentStore.ts      — agents table CRUD
    conversationStore.ts — conversations + messages tables CRUD
    chatPersistence.ts — derives persisted chat exchanges and workspace replay state from gateway payloads
    auditStore.ts      — control-plane audit-event redaction and admin-query helpers
    credentials.ts     — AES-256-GCM agent credential encryption/decryption helpers
    sandboxManager.ts  — Docker container management, OpenClaw installation
    sandboxRuntime.ts  — DB-vs-Docker runtime reconciliation and drift classification
    channelManager.ts  — Telegram/Slack config via docker exec
    webhookDeliveryStore.ts — replay-sensitive webhook delivery reservation/status ledger
    workspaceFiles.ts  — workspace path validation, artifact classification, and file/archive command builders
    vncProxy.ts        — HTTP upgrade handler for `/api/sandboxes/:sandbox_id/vnc`
    utils.ts           — pure helpers: httpError, gatewayUrlAndHeaders, parseJsonOutput, syntheticModels
    validation.ts      — shared request validators for strict write-route parsing
    skillRegistry.ts   — seeded builder skill registry surfaced through `/api/skills`
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
2. Parse env through `config.ts` — aggregates malformed/missing required config before startup continues
3. Mark backend readiness as `not_ready`
4. Run startup preflight checks (Docker availability plus provider warning path)
5. Call `initPool()` — creates PostgreSQL connection pool using the validated `DATABASE_URL`
6. Call `runSchemaMigrations()` — ensures the `schema_migrations` ledger exists and applies any pending ordered migrations before serving traffic
7. Start Express HTTP server on the validated `PORT` (default: 8000)
8. Attach `handleVncUpgrade` so `/api/sandboxes/:sandbox_id/vnc` can proxy noVNC WebSocket upgrades
9. Mark backend readiness as `ready`

**Readiness contract:** startup now fails fast if required config, DB initialization, or migrations fail. The process should not start serving traffic until the database schema is current and the env contract is valid.

---

## Module Responsibilities

### `config.ts` — Backend Runtime Config
- Owns the canonical backend env contract
- Parses required, defaulted, and optional env vars into a frozen typed object
- Aggregates startup-facing validation failures instead of failing one variable at a time
- Provides tolerant runtime lookup for modules that only need optional fields during isolated tests or non-startup flows

### `app.ts` — Express Routes
- Sets up CORS from `config.ts` `allowedOrigins`
- Applies `express.json({ limit: '256kb' })` before route handling
- Maintains an in-memory `_streams` Map for active sandbox creation SSE streams
- Exposes `/health` as a liveness check and `/ready` as the DB-readiness check
- Exposes agent-readable system-event routes at `GET /api/system/events`, `GET /api/sandboxes/:sandbox_id/system-events`, and `GET /api/agents/:id/system-events`
- All routes use `asyncHandler()` wrapper to convert async errors to Express `next(err)`
- Error middleware at the bottom: returns `{ detail: message }` with status code

### `db.ts` — Connection Pool
- Singleton `Pool` initialized via `initPool()` using the validated config DSN
- `withConn(fn)` — acquires connection, runs `BEGIN`/`COMMIT`/`ROLLBACK` automatically
- Pool config: min=2, max=10 connections

### `schemaMigrations.ts` — Ordered Schema Evolution
- Owns the canonical ordered migration list for `ruh-backend`
- Creates and reads the `schema_migrations` ledger
- Applies pending migrations in ascending ID order before startup completes
- Future schema changes should add a new migration here instead of adding store-local `initDb()` side effects

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
- Redacts secret-bearing detail fields before persistence
- Provides `writeAuditEvent()` for backend route instrumentation and `listAuditEvents()` for the admin query surface
- See [[005-data-models]] for the audit-event schema and [[SPEC-control-plane-audit-log]] for the contract

### `systemEventStore.ts` — Agent-Readable Runtime Event Ledger
- Persists redacted `system_events` rows for product/runtime history that agents can query directly
- Provides `writeSystemEvent()` and `listSystemEvents()` with bounded filters by level, category, action, request, trace, sandbox, agent, conversation, and source
- Keeps `details` safe for agent consumption by dropping secret-bearing keys and truncating long diagnostic strings before persistence
- See [[005-data-models]] for the table shape and [[SPEC-agent-readable-system-events]] for the observability contract

### `chatPersistence.ts` — Chat Durability Helpers
- Extracts the persisted user turn from request payloads and the assistant turn from gateway responses or streamed SSE completion state
- Normalizes browser/task replay data into the bounded `workspace_state` envelope used by conversation history
- Keeps the ordinary chat routes smaller by centralizing persistence-specific parsing rules

### `credentials.ts` — Agent Credential Encryption
- Encrypts per-tool credential envelopes with AES-256-GCM when `AGENT_CREDENTIALS_KEY` is configured
- Falls back to base64 plaintext storage only when the key is absent, which is explicitly a development-only compromise
- Supports the saved-agent credential routes without ever returning decrypted secrets to ordinary agent reads

### `conversationAccess.ts` — Conversation Route Guards
- Resolves direct conversation access only when both the sandbox record still exists and the conversation belongs to that sandbox
- Lets direct message/rename/delete routes fail closed with `404` after sandbox deletion instead of serving orphaned history by stale IDs
- See [[SPEC-sandbox-conversation-cleanup]] for the current contract

### `sandboxManager.ts` — Docker
- `createOpenclawSandbox()` — async generator that yields `SandboxEvent` tuples
- `dockerExec()` — runs `docker exec <container> bash -c <cmd>`
- `getContainerName()` — returns `openclaw-<sandbox_id>`
- Shared auth path and shared Codex model fallbacks now come from `config.ts` instead of direct env reads
- Route handlers that assemble shell-backed commands should use the shared helpers in `docker.ts` instead of ad hoc interpolation
- See [[003-sandbox-lifecycle]] for full creation flow

### `sandboxRuntime.ts` — Runtime Reconciliation
- Classifies sandbox runtime state as `healthy`, `gateway_unreachable`, `db_only`, `container_only`, or `missing`
- Powers `GET /api/sandboxes/:sandbox_id/status` plus the admin reconciliation report/repair routes
- Keeps Docker-truth and Postgres-truth comparison logic out of the main route file

### `channelManager.ts` — Channels
- Reads/writes OpenClaw config inside the container via `docker exec`
- Restarts gateway after config changes
- See [[006-channel-manager]] for full details

### `webhookDeliveryStore.ts` — Webhook Replay Ledger
- Reserves `{ public_id, delivery_id }` pairs before sandbox invocation
- Stores `pending`, `delivered`, or `failed` delivery status with bounded retention
- Lets webhook routes fail closed on replay without putting delivery ids on normal agent reads

### `workspaceFiles.ts` — Workspace File Surface
- Normalizes safe relative workspace paths and rejects traversal/absolute paths
- Classifies preview kind (`text`, `image`, `pdf`, `binary`) and artifact type (`webpage`, `document`, `data`, `code`, `image`, `archive`, `other`)
- Generates the Node-based list/read/download/handoff/archive commands executed inside sandboxes

### `vncProxy.ts` — Browser/VNC Upgrade Path
- Handles HTTP upgrade requests for `/api/sandboxes/:sandbox_id/vnc`
- Proxies noVNC/websockify frames between the frontend and the sandbox's exposed VNC websocket port
- Depends on `store.ts` `vnc_port` metadata rather than direct caller-supplied host/port values

### Auth Module (`src/auth/`)

| File | Purpose |
|------|---------|
| `auth/passwords.ts` | bcrypt hash + verify (12 salt rounds) |
| `auth/tokens.ts` | JWT sign/verify for access tokens |
| `auth/middleware.ts` | `requireAuth`, `optionalAuth`, `requireRole` Express middleware |
| `authRoutes.ts` | `/api/auth/*` — register, login, refresh, logout, me |
| `userStore.ts` | User CRUD with pagination and filtering |
| `sessionStore.ts` | Session/refresh token management |
| `orgStore.ts` | Organization CRUD |

See [[014-auth-system]] for the full auth contract.

### Marketplace Module

| File | Purpose |
|------|---------|
| `marketplaceStore.ts` | Listing, review, install CRUD with pagination |
| `marketplaceRoutes.ts` | `/api/marketplace/*` — 12 endpoints for browse, publish, review, install |

See [[016-marketplace]] for the full marketplace contract.

### `utils.ts` — Helpers
- `httpError(status, detail)` — creates Error with `.status` property (used by error middleware)
- `gatewayUrlAndHeaders(record, path)` — builds URL and auth headers for gateway proxy calls
- `parseJsonOutput(output)` — finds first JSON line in CLI output (used for cron commands)
- `syntheticModels()` — fallback model list when gateway is unreachable

### `validation.ts` — Shared Request Validation
- Owns strict object parsing for covered write routes
- Distinguishes structural failures (`400`) from schema-constraint failures (`422`)
- Current implemented slices cover `POST /api/agents`, `PATCH /api/agents/:id`, `PATCH /api/agents/:id/config`, and `POST /api/agents/:id/sandbox` with unknown-key rejection plus bounded string/array parsing for the documented fields

### `skillRegistry.ts` — Builder Skill Registry
- Owns the first read-only seeded skill-registry entries exposed through `GET /api/skills` and `GET /api/skills/:skill_id`
- Normalizes underscore/hyphen variants for lookup
- Gives `/agents/create` a truthful way to distinguish registry-backed skills from `needs_build` custom drafts
- `configure-agent` reuses the same registry at deploy time so matched skills write real seeded `SKILL.md` content into the sandbox instead of the generic fallback stub

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

- [[LEARNING-2026-03-28-repo-testability-audit]] — backend testability is currently constrained more by monolithic route/orchestration boundaries and singleton dependencies than by missing assertions
- [[LEARNING-2026-04-03-backend-coverage-metrics]] — Bun's printed `All files` coverage is a simple file-average, while the packaged backend gate is driven by weighted LCOV totals; large files dominate the true threshold
- [[LEARNING-2026-03-28-agent-readable-system-events]] — durable product/runtime observability should land in the backend `system_events` ledger first, with external tracing used only as additive correlation
- [[LEARNING-2026-03-25-backend-request-validation-gap]] — the backend currently relies on scattered ad hoc checks instead of a shared request-schema boundary, so malformed write/proxy payloads can reach persistence or downstream services without a consistent fail-fast contract
- [[LEARNING-2026-03-25-backend-error-diagnostic-exposure]] — several backend routes still echo raw gateway or CLI diagnostics straight to clients, so the API lacks a client-safe error boundary
- [[LEARNING-2026-03-25-control-plane-rate-limit-gap]] — the backend currently exposes expensive create/chat/mutation routes without a documented throttling or overload contract
- [[LEARNING-2026-03-26-backend-config-runtime-split]] — centralized env parsing should stay strict for startup but tolerant for optional runtime helpers so shared config access does not pull unrelated required vars into isolated module flows
- [[LEARNING-2026-03-25-docker-daemon-readiness-gap]] — backend startup and readiness currently ignore Docker availability even though the core control plane depends on Docker-backed operations
- [[LEARNING-2026-03-25-docker-timeouts-not-enforced]] — backend Docker helper timeouts are currently advisory only, so hung Docker/OpenClaw subprocesses can wedge otherwise bounded backend flows indefinitely
- [[LEARNING-2026-03-25-deployed-chat-cancellation-gap]] — deployed sandbox chat currently has no client-disconnect cancellation boundary, so abandoned chat requests can keep consuming upstream gateway/model work

## Related Specs

- [[SPEC-backend-config-schema]] — defines the centralized typed config module and startup env-validation contract for backend runtime modules
- [[SPEC-backend-request-validation]] — defines the shared validator contract and first-pass route coverage for backend request parsing
- [[SPEC-backend-schema-migrations]] — defines the ordered migration ledger, startup runner, and future schema-change contract
- [[SPEC-backend-shell-command-safety]] — defines the shared shell-quoting and path-normalization contract for Docker-backed backend mutations
- [[SPEC-agent-readable-system-events]] — defines the backend-owned `system_events` ledger, read API, and event-emission contract for agent-readable observability
- [[SPEC-sandbox-conversation-cleanup]] — defines sandbox-owned conversation cleanup plus fail-closed direct conversation-route guards
- [[SPEC-graceful-shutdown]] — defines the process-lifecycle contract for signal handling, request draining, SSE termination, and DB-pool shutdown
- [[SPEC-agent-builder-gated-skill-tool-flow]] — adds the read-only skill-registry route surface used by the gated Co-Pilot builder

## Related Reviews

- [[REVIEW-paperclip-openspace-architecture]] — reviews fire-and-forget Paperclip/OpenSpace hooks in `app.ts`, shell injection risk, double-provisioning race, and post-chat DB read overhead
