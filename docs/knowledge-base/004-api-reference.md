# API Reference

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle|Sandbox Lifecycle]] | [[005-data-models|Data Models →]]

Base URL: `http://localhost:8000` (dev) | `http://localhost/api` (via nginx)

All endpoints return JSON. Errors return `{ "detail": "message" }` with appropriate HTTP status.
JSON request bodies are limited to `256kb`.

For routes covered by the shared validator:
- `400` = malformed JSON/object shape or a missing required field
- `422` = schema constraint failure such as unknown fields, enum violations, or size-limit violations

---

## Health

### `GET /health`
Returns `{ "status": "ok" }`. No auth required.

### `GET /ready`
Returns backend readiness state. No auth required.

Ready response:
```json
{ "status": "ready", "ready": true, "reason": null }
```

Not-ready response:
```json
{ "status": "not_ready", "ready": false, "reason": "Waiting for database initialization" }
```

HTTP status is `200` when ready and `503` when not ready.

---

## Sandboxes

### `POST /api/sandboxes/create`
Start sandbox creation. Returns immediately with a stream ID.

**Body:**
```json
{ "sandbox_name": "my-agent" }
```
**Response:** `{ "stream_id": "<uuid>" }`

---

### `GET /api/sandboxes/stream/:stream_id`
SSE stream for sandbox creation progress. Connect after receiving `stream_id`.

**SSE Events:**
| Event | Shape | Notes |
|---|---|---|
| `log` | `{ message }` | Progress text |
| `result` | `SandboxRecord` | Container ready |
| `approved` | `{ message }` | Device paired |
| `error` | `{ message }` | Fatal, container cleaned up |
| `done` | `{ stream_id }` | Complete |

Errors: 404 if stream_id unknown, 409 if already consumed.

---

### `GET /api/sandboxes`
List all saved sandboxes, ordered by `created_at DESC`.

**Response:** `SandboxRecord[]`

Sandbox records now include shared-Codex metadata:
- `shared_codex_enabled: boolean`
- `shared_codex_model: string | null`

---

### `GET /api/sandboxes/:sandbox_id`
Get a single sandbox. Also works with a `stream_id` to check creation status.

**Response:** `SandboxRecord` or `{ status, result? }` for stream IDs.

---

### `DELETE /api/sandboxes/:sandbox_id`
Delete sandbox record + stop Docker container (best-effort).

Before the sandbox row is removed, the backend also deletes any conversations whose `sandbox_id` matches the deleted sandbox. Message rows then disappear via the existing conversation-to-message cascade.
Successful deletes now emit a `sandbox.delete` control-plane audit event.

**Response:** `{ "deleted": "<sandbox_id>" }`

### `GET /api/sandboxes/:sandbox_id/conversations`
List conversations for one sandbox with bounded pagination.

**Query params:**
- `limit` — optional positive integer, default `20`, maximum `100`
- `cursor` — optional `<updated_at>|<conversation_id>` cursor from the previous page

**Response:**
```json
{
  "items": [ConversationRecord],
  "next_cursor": "2026-03-25T10:05:00.000Z|conv-1",
  "has_more": true
}
```

Routes return `400` for malformed `limit` or `cursor` values.

### `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
List one conversation transcript with bounded pagination.

**Query params:**
- `limit` — optional positive integer, default `50`, maximum `200`
- `before` — optional numeric message-id cursor for older history

**Response:**
```json
{
  "messages": [
    { "id": 41, "role": "user", "content": "Hello", "created_at": "2026-03-25T10:00:00.000Z" },
    { "id": 42, "role": "assistant", "content": "Hi", "created_at": "2026-03-25T10:00:02.000Z" }
  ],
  "next_cursor": 41,
  "has_more": true
}
```

Each page is returned in chronological order even though the backend queries newest rows first for efficiency. Routes return `400` for malformed `limit` or `before` values.

### `GET /api/sandboxes/:sandbox_id/workspace/files`
List recent files under the sandbox workspace root (`~/.openclaw/workspace`).

**Query params:**
- `path` — optional relative directory within the workspace root, default root
- `depth` — optional positive integer, default `2`, maximum `5`
- `limit` — optional positive integer, default `200`, maximum `500`

**Response:**
```json
{
  "root": "",
  "items": [
    {
      "path": "reports/daily.md",
      "name": "daily.md",
      "type": "file",
      "size": 128,
      "modified_at": "2026-03-25T15:30:00.000Z",
      "mime_type": "text/markdown",
      "preview_kind": "text"
    }
  ]
}
```

Only files are returned in the first slice. Paths must stay within the workspace root; traversal or absolute paths return `400`.

### `GET /api/sandboxes/:sandbox_id/workspace/file`
Read one workspace file's metadata plus inline-safe preview content when supported.

**Query params:**
- `path` — required relative file path within the workspace root

**Response:**
```json
{
  "path": "reports/daily.md",
  "name": "daily.md",
  "size": 128,
  "modified_at": "2026-03-25T15:30:00.000Z",
  "mime_type": "text/markdown",
  "preview_kind": "text",
  "content": "# Daily report\nReady",
  "truncated": false,
  "download_name": "daily.md"
}
```

Preview kinds:
- `text` — inline content returned for safe text formats up to the bounded preview limit
- `image` — metadata only; clients should use the download route for rendering
- `pdf` — metadata only in the first slice
- `binary` — metadata only

Traversal, absolute paths, or missing `path` return `400`.

### `GET /api/sandboxes/:sandbox_id/workspace/file/download`
Stream the raw file bytes for one workspace file.

**Query params:**
- `path` — required relative file path within the workspace root

Successful responses use the detected `Content-Type` and an inline `Content-Disposition` filename so the browser UI can either preview or download the asset.

---

## Agents

### `GET /api/agents`
List persisted agents.

### `POST /api/agents`
Create a persisted agent record.

**Body:**
```json
{
  "name": "Research Agent",
  "avatar": "R",
  "description": "Summarizes customer signals",
  "skills": ["web-search"],
  "triggerLabel": "research",
  "status": "draft",
  "skillGraph": { "nodes": [] },
  "workflow": { "steps": [] },
  "agentRules": ["Be concise"]
}
```

Validation contract for the first shared-validation slice:
- `name` is required and must be a non-empty string
- Unknown top-level keys are rejected with `422`
- `status` may only be `active` or `draft`
- String arrays such as `skills` and `agentRules` are trimmed and validated before persistence

### `GET /api/agents/:id`
Get one persisted agent.

### `PATCH /api/agents/:id`
Patch agent metadata.

Validation contract:
- Body must be an object containing at least one of `name`, `avatar`, `description`, `skills`, `triggerLabel`, or `status`
- Unknown top-level keys are rejected with `422`
- `name`, when present, must be a non-empty trimmed string
- `skills`, when present, must be an array of trimmed strings
- `status`, when present, may only be `active` or `draft`

### `PATCH /api/agents/:id/config`
Patch persisted config fields such as `skillGraph`, `workflow`, and `agentRules`.

Validation contract:
- Body must be an object containing at least one of `skillGraph`, `workflow`, or `agentRules`
- Unknown top-level keys are rejected with `422`
- `agentRules`, when present, must be an array of trimmed strings

### `POST /api/agents/:id/sandbox`
Attach a sandbox to an existing agent.

**Body:** `{ "sandbox_id": "<sandbox-id>" }`

Validation contract:
- `sandbox_id` is required and must be a non-empty string
- Unknown top-level keys are rejected with `422`

### `DELETE /api/agents/:id`
Delete a persisted agent.

Successful deletes now emit an `agent.delete` control-plane audit event.

---

## Agent Configuration

### `POST /api/sandboxes/:sandbox_id/configure-agent`
Push agent configuration (soul + skills + cron jobs) into the running sandbox container.

**Body:**
```json
{
  "system_name": "my-agent",
  "soul_content": "# SOUL.md content...",
  "skills": [
    { "skill_id": "web-search", "name": "Web Search", "description": "Search the web" }
  ],
  "cron_jobs": [
    { "name": "daily-report", "schedule": "0 9 * * *", "message": "Generate daily report" }
  ]
}
```
**Success response:**
```json
{
  "ok": true,
  "applied": true,
  "steps": [
    { "kind": "soul", "target": "SOUL.md", "ok": true, "message": "SOUL.md written" },
    { "kind": "skill", "target": "web-search", "ok": true, "message": "Skill web-search written" }
  ]
}
```

**Failure response:** returns non-2xx with:
```json
{
  "ok": false,
  "applied": false,
  "detail": "Agent config apply failed",
  "steps": [
    { "kind": "soul", "target": "SOUL.md", "ok": true, "message": "SOUL.md written" },
    { "kind": "cron", "target": "daily-report", "ok": false, "message": "Cron daily-report failed: permission denied" }
  ]
}
```

Files written inside container:
- SOUL.md → `~/.openclaw/workspace/SOUL.md`
- Skills → `~/.openclaw/workspace/skills/<skill_id>/SKILL.md`

Shell-safety contract:
- `skill_id` is normalized to one safe path segment before the skill directory is created
- SOUL content, skill content, cron names, schedules, and messages are passed to the shell as literal quoted args rather than interpolated shell syntax

Successful config pushes now emit a `sandbox.configure_agent` audit event containing safe counts and step metadata only; raw SOUL content, skill bodies, and cron payload text are not persisted in the audit ledger.
Failed config pushes emit the same audit action with `outcome: "failure"` plus the safe structured step that failed.

## Related Specs

- [[SPEC-agent-config-apply-contract]] — config apply must become a fail-closed route contract with structured step outcomes
- [[SPEC-conversation-history-pagination]] — conversation list and message-history reads now use bounded cursor pagination instead of full-history arrays
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — bounded workspace list/read/download routes now power the deployed-agent Files tab

---

## Gateway Proxy

These endpoints proxy to the OpenClaw gateway running inside the sandbox.

### `GET /api/sandboxes/:sandbox_id/models`
Returns available models. Falls back to synthetic model list if gateway unreachable.

### `POST /api/sandboxes/:sandbox_id/reconfigure-llm`
Reconfigure a running sandbox's LLM provider in place and restart the gateway.

**Body:**
```json
{
  "provider": "anthropic | openai | gemini | openrouter | ollama",
  "apiKey": "required for cloud providers",
  "model": "optional model id for that provider",
  "ollamaBaseUrl": "optional, ollama only",
  "ollamaModel": "optional, ollama only"
}
```

**Response:**
```json
{
  "ok": true,
  "provider": "openai",
  "model": "gpt-4o",
  "logs": ["Config updated", "Auth profiles written", "Gateway restarted"],
  "configured": {
    "apiKey": "sk-12***cdef",
    "envVar": "OPENAI_API_KEY",
    "baseUrl": "https://api.openai.com/v1"
  }
}
```

Errors preserve the standard backend shape: `{ "detail": "..." }`

If the sandbox has already been retrofitted to shared Codex auth, this endpoint returns:

```json
{ "detail": "This sandbox is locked to shared Codex auth" }
```

with HTTP `409`.

Successful provider changes now emit a `sandbox.reconfigure_llm` audit event with provider/model metadata only.

### `POST /api/admin/sandboxes/:sandbox_id/retrofit-shared-codex`
Retrofit an existing DB-tracked sandbox in place to the shared Codex/OpenClaw auth model.

**Headers:**
```http
Authorization: Bearer <OPENCLAW_ADMIN_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "model": "openai-codex/gpt-5.4"
}
```

`model` is optional and defaults to `OPENCLAW_SHARED_CODEX_MODEL`.

**Response:**
```json
{
  "ok": true,
  "sandboxId": "<sandbox_id>",
  "containerName": "openclaw-<sandbox_id>",
  "model": "openai-codex/gpt-5.4",
  "homeDir": "/root",
  "authSource": "Codex CLI auth",
  "logs": ["Shared auth ready", "Default model set", "Gateway restarted"]
}
```

Errors:
- `401` invalid admin token
- `503` admin token missing or retrofit health/probe failure
- `404` sandbox not found

Successful retrofits now emit a `sandbox.retrofit_shared_codex` audit event and are queryable via the admin audit API below.

### `GET /api/admin/audit-events`
Query recent control-plane audit rows. Admin token required.

**Headers:**
```http
Authorization: Bearer <OPENCLAW_ADMIN_TOKEN>
```

**Query params:**
- `action_type`
- `target_type`
- `target_id`
- `actor_type`
- `actor_id`
- `outcome`
- `limit` — optional positive integer, default `50`, maximum `100`

**Response:**
```json
{
  "items": [
    {
      "event_id": "evt-1",
      "occurred_at": "2026-03-25T12:00:00.000Z",
      "request_id": "req-1",
      "action_type": "sandbox.delete",
      "target_type": "sandbox",
      "target_id": "sb-123",
      "outcome": "success",
      "actor_type": "admin_token",
      "actor_id": "openclaw_admin_token",
      "origin": "iphash:abcd1234ef56",
      "details": { "deleted": true }
    }
  ],
  "has_more": false
}
```

Errors:
- `401` invalid admin token
- `503` admin token missing

### `GET /api/sandboxes/:sandbox_id/status`
Returns gateway status. Falls back to persisted sandbox metadata if gateway unreachable.

**Response fields always include:**
- `sandbox_id`
- `sandbox_name`
- `gateway_port`
- `approved`
- `created_at`
- `container_running: boolean`

`container_running` comes from Docker runtime inspection of `openclaw-<sandbox_id>`, not from PostgreSQL row presence alone. When the gateway responds successfully, its payload is merged into the same response so callers can distinguish a healthy running sandbox from a container that exists but whose gateway is unreachable.

## Related Specs

- [[SPEC-agent-sandbox-health-surface]] — deployed-agent surfaces rely on explicit `container_running` plus gateway reachability from this endpoint

### `POST /api/sandboxes/:sandbox_id/chat`
Proxy chat completion to the sandbox's OpenClaw gateway.

**Body:** Standard OpenAI chat completions body, plus:
```json
{
  "conversation_id": "<uuid>",   // optional — attaches session key
  "stream": true                 // optional — enables SSE streaming
}
```
Streaming: pipes gateway response directly to client.
Non-streaming: returns gateway response as JSON.

When `stream` is enabled, the SSE body may include both ordinary OpenAI chat-completions frames and top-level browser-workspace frames shaped like `{ "browser": { ... } }` or `{ "browser_event": { ... } }`. The backend preserves those frames unchanged so the deployed-agent Browser tab can render structured browser activity, preview URLs, and takeover state.

If `conversation_id` belongs to the same sandbox, the backend forwards
`x-openclaw-session-key: agent:main:<conv_id>`.

If `conversation_id` belongs to a different sandbox, the route returns:

```json
{ "detail": "Conversation not found" }
```

with HTTP `404` and does not call the gateway.

If `conversation_id` is unknown, the route currently preserves the legacy fallback and derives
`agent:main:<conversation_id>` without a stored conversation row.

---

## Conversations

### `GET /api/sandboxes/:sandbox_id/conversations`
List conversations for a sandbox, ordered by `updated_at DESC`.

### `POST /api/sandboxes/:sandbox_id/conversations`
Create a new conversation.

**Body:** `{ "model": "openclaw-default", "name": "New Conversation" }`

Shared-Codex sandboxes should keep using `openclaw-default` so the gateway resolves to its locked shared model.

**Response:** `ConversationRecord`

### `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
Get all messages for a conversation, ordered by insertion.

Returns `404` if the sandbox record no longer exists, even when a stale conversation row or ID is still known.

**Response:** `MessageRecord[]` — `{ role, content }[]`

### `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
Append messages to a conversation.

Returns `404` if the sandbox record no longer exists, even when a stale conversation row or ID is still known.

**Body:** `{ "messages": [{ "role": "user", "content": "..." }] }`

### `PATCH /api/sandboxes/:sandbox_id/conversations/:conv_id`
Rename a conversation.

Returns `404` if the sandbox record no longer exists, even when a stale conversation row or ID is still known.

**Body:** `{ "name": "New Name" }`

### `DELETE /api/sandboxes/:sandbox_id/conversations/:conv_id`
Delete conversation + all its messages (cascade).

Returns `404` if the sandbox record no longer exists, even when a stale conversation row or ID is still known.

---

## Cron Jobs

All cron operations run `openclaw cron` CLI commands inside the sandbox container.

### `GET /api/sandboxes/:sandbox_id/crons`
Lists all cron jobs. Runs `openclaw cron list --json`.

### `POST /api/sandboxes/:sandbox_id/crons`
Create a cron job.

**Body:**
```json
{
  "name": "daily-report",
  "schedule": {
    "kind": "cron",      // "cron" | "every" | "at"
    "expr": "0 9 * * *", // for kind=cron
    "tz": "America/New_York",
    "everyMs": 1800000,  // for kind=every (ms → converted to minutes)
    "at": "2026-04-01T09:00:00Z" // for kind=at
  },
  "payload": {
    "kind": "agentTurn", // "agentTurn" | "systemEvent"
    "message": "Generate daily report"
  },
  "session_target": "isolated",  // default
  "wake_mode": "now",            // default
  "delete_after_run": false,
  "enabled": true,
  "description": ""
}
```

Shell-safety contract:
- `name`, schedule values, payload text, `session_target`, `wake_mode`, `description`, and `job_id`-style route values are treated as literal args when the backend invokes `openclaw cron`
- the backend still appends its own `2>&1` shell redirection, but user-controlled fields no longer become unquoted shell fragments

Successful cron writes now emit control-plane audit events: `cron.create`, `cron.edit`, `cron.delete`, `cron.toggle`, and `cron.run`.

### `DELETE /api/sandboxes/:sandbox_id/crons/:job_id`
Delete a cron job. Runs `openclaw cron rm <job_id>`.

### `POST /api/sandboxes/:sandbox_id/crons/:job_id/toggle`
Enable/disable a cron job. Reads current state then runs `openclaw cron enable/disable`.

### `PATCH /api/sandboxes/:sandbox_id/crons/:job_id`
Edit a cron job. Supports name, schedule, payload, session_target, wake_mode, description.

### `POST /api/sandboxes/:sandbox_id/crons/:job_id/run`
Run a cron job immediately. Runs `openclaw cron run <job_id>`.

### `GET /api/sandboxes/:sandbox_id/crons/:job_id/runs`
Get run history. Query param: `?limit=50` (default).

---

## Channels

### `GET /api/sandboxes/:sandbox_id/channels`
Get current Telegram and Slack config (tokens masked).

### `PUT /api/sandboxes/:sandbox_id/channels/telegram`
Set Telegram config. Body: `{ enabled, botToken, dmPolicy }`. Restarts gateway.
Successful writes emit `channel.telegram.update` audit events with safe config-shape metadata only.

### `PUT /api/sandboxes/:sandbox_id/channels/slack`
Set Slack config. Body: `{ enabled, mode, appToken, botToken, signingSecret, dmPolicy }`. Restarts gateway.
Successful writes emit `channel.slack.update` audit events with safe config-shape metadata only.

### `GET /api/sandboxes/:sandbox_id/channels/:channel/status`
Probe channel status. `channel` = `telegram` | `slack`.

### `GET /api/sandboxes/:sandbox_id/channels/:channel/pairing`
List pending pairing requests. Returns `{ codes: string[] }`.

### `POST /api/sandboxes/:sandbox_id/channels/:channel/pairing/approve`
Approve a pairing request. Body: `{ "code": "ABCD1234" }`.
Successful approvals emit `channel.telegram.pairing_approve` or `channel.slack.pairing_approve` audit events without persisting the raw pairing code.

---

## Related Learnings

- [[LEARNING-2026-03-25-backend-error-diagnostic-exposure]] — the current API still echoes raw gateway and CLI diagnostics on some failure paths, so client-visible error payloads need an explicit redaction contract
- [[LEARNING-2026-03-25-backend-request-validation-gap]] — several write/proxy routes are documented here, but the backend does not yet enforce a shared request-schema contract for malformed or oversized payloads
- [[LEARNING-2026-03-25-conversation-history-pagination-gap]] — conversation list and message-history endpoints currently return unbounded result sets, so the API needs a bounded pagination contract before larger persisted histories become normal
- [[LEARNING-2026-03-25-sandbox-runtime-drift]] — the current sandbox status and CRUD APIs can return stale DB-backed success signals when Docker runtime state has already drifted
- [[LEARNING-2026-03-25-sandbox-provisioning-job-persistence]] — the sandbox-create API currently exposes only a process-local `stream_id`, so restart-safe provisioning needs a persisted job/read model in addition to SSE
- [[LEARNING-2026-03-25-control-plane-rate-limit-gap]] — the API reference currently documents no `429` or `Retry-After` contract for expensive create/chat/architect flows even though the implementation exposes them without throttling

---

## Related Specs

- [[SPEC-chat-conversation-boundaries]] — documents the sandbox-ownership contract for `conversation_id` on the chat proxy
- [[SPEC-backend-shell-command-safety]] — defines the literal-argument contract and `skill_id` normalization for Docker-backed route commands
- [[SPEC-backend-request-validation]] — planned request-schema contract for high-risk write/proxy routes and deterministic validation failures
- [[SPEC-agent-model-settings]] — documents the user-facing provider reconfigure flow for non-shared sandboxes
- [[SPEC-shared-codex-retrofit]] — documents the admin retrofit endpoint, sandbox metadata, and `409` lockout behavior for shared-Codex sandboxes
- [[SPEC-deployed-chat-browser-workspace]] — streamed sandbox chat may carry structured browser-workspace frames for deployed-agent operator UI
- [[SPEC-control-plane-audit-log]] — defines the shared audit-event schema and future admin query contract for sensitive control-plane actions
