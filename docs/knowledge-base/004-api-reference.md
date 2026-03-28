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

## System Events

### `GET /api/system/events`
Returns the newest durable backend-owned runtime events.

**Query params:**
- `limit` — optional positive integer, default `50`, maximum `100`
- `level`, `category`, `action`, `status`
- `request_id`, `trace_id`
- `sandbox_id`, `agent_id`, `conversation_id`
- `source`

**Response:**
```json
{
  "items": [
    {
      "event_id": "evt-1",
      "occurred_at": "2026-03-28T12:00:00.000Z",
      "level": "info",
      "category": "sandbox.lifecycle",
      "action": "sandbox.create.succeeded",
      "status": "success",
      "message": "Sandbox created successfully",
      "request_id": "req-123",
      "trace_id": null,
      "span_id": null,
      "sandbox_id": "sb-123",
      "agent_id": null,
      "conversation_id": null,
      "source": "ruh-backend:app",
      "details": {}
    }
  ],
  "has_more": false
}
```

### `GET /api/sandboxes/:sandbox_id/system-events`
Same response shape as the global route, but the backend forces `sandbox_id = :sandbox_id` regardless of query params.

### `GET /api/agents/:id/system-events`
Same response shape as the global route, but the backend forces `agent_id = :id` regardless of query params.

The first shipped emitters cover sandbox-create and forge lifecycle milestones (`sandbox.create.*`, `agent.forge.*`). `details` is redacted for agent consumption and should not be treated as a raw process log dump.

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

Under [[SPEC-sandbox-bootstrap-config-apply-contract]], `result` now means the required bootstrap config mutations were applied and verified, not merely that the gateway port opened. Required bootstrap failures surface as `error` and do not persist a sandbox row.
Optional browser/VNC setup may still degrade with warning logs while ordinary chat-capable sandbox creation succeeds.
If the SSE client disconnects after the stream starts, backend provisioning still continues in the background; reconnecting clients should recover via persisted agent/sandbox state rather than assuming the create job was cancelled.

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
    {
      "id": 42,
      "role": "assistant",
      "content": "Hi",
      "created_at": "2026-03-25T10:00:02.000Z",
      "workspace_state": {
        "version": 1,
        "browser": {
          "items": [],
          "previewUrl": "https://example.com",
          "takeover": null
        }
      }
    }
  ],
  "next_cursor": 41,
  "has_more": true
}
```

Each page is returned in chronological order even though the backend queries newest rows first for efficiency. Routes return `400` for malformed `limit` or `before` values.

`workspace_state` is optional and uses the versioned deployed-chat replay envelope from [[SPEC-deployed-chat-workspace-history]] plus [[SPEC-deployed-chat-task-and-terminal-history]].

### `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
Append one or more transcript rows to a conversation.

**Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Open the login page" },
    {
      "role": "assistant",
      "content": "I opened it.",
      "workspace_state": {
        "version": 1,
        "browser": {
          "items": [
            {
              "id": 0,
              "kind": "navigation",
              "label": "Login",
              "url": "https://example.com/login",
              "timestamp": 1711111111000
            }
          ],
          "previewUrl": "https://example.com/login",
          "takeover": null
        }
      }
    }
  ]
}
```

Validation rules:
- body allows only `messages`
- each message allows only `role`, `content`, and optional `workspace_state`
- `workspace_state.version` must be `1`
- malformed or oversized `workspace_state` payloads return `422`

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

Workspace file list/read payloads now also surface artifact-aware metadata:
- `artifact_type` — `webpage`, `document`, `data`, `code`, `image`, `archive`, or `other`
- `source_conversation_id` — inferred session id for files under `sessions/<conversation_id>/...`
- `source_conversation_turn` — optional turn identifier when session metadata is available
- `output_label` / `source_description` — optional bounded artifact metadata from `.openclaw-artifacts.json`

### `GET /api/sandboxes/:sandbox_id/workspace/handoff`
Return a bounded operator-facing handoff summary for the current workspace folder.

**Query params:**
- `path` — optional relative directory within the workspace root; deployed chat uses the active session folder when present

**Response:**
```json
{
  "summary": "2 code files ready for handoff",
  "file_count": 4,
  "code_file_count": 2,
  "total_bytes": 4096,
  "top_level_paths": ["app", "reports"],
  "suggested_paths": ["app/page.tsx", "reports/daily.md"],
  "archive": {
    "eligible": true,
    "reason": null,
    "file_count": 4,
    "total_bytes": 4096,
    "download_name": "sessions-conv-123-bundle.tar.gz"
  }
}
```

`archive.reason` is `workspace_empty`, `too_many_files`, or `archive_too_large` when export is unavailable.

### `GET /api/sandboxes/:sandbox_id/workspace/archive`
Stream a bounded `tar.gz` archive for the current workspace folder.

**Query params:**
- `path` — optional relative directory within the workspace root; deployed chat uses the active session folder when present

Successful responses use `Content-Disposition: attachment` and the backend-generated safe bundle filename.
Known unavailable states return `409`:
- workspace is empty
- workspace contains too many files for the bounded export budget
- workspace exceeds the bounded archive byte budget

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
  "agentRules": ["Be concise"],
  "runtimeInputs": [
    {
      "key": "GOOGLE_ADS_CUSTOMER_ID",
      "label": "Google Ads Customer ID",
      "description": "Customer ID for the target Google Ads account.",
      "required": true,
      "source": "architect_requirement",
      "value": "123-456-7890"
    }
  ],
  "toolConnections": [
    {
      "toolId": "google-ads",
      "name": "Google Ads",
      "description": "Inspect campaigns and pacing",
      "status": "configured",
      "authKind": "oauth",
      "connectorType": "mcp",
      "configSummary": ["Connected account: Acme Ads"]
    }
  ],
  "triggers": [
    {
      "id": "cron-schedule",
      "title": "Cron Schedule",
      "kind": "schedule",
      "status": "supported",
      "description": "Runs every weekday at 9 AM.",
      "schedule": "0 9 * * 1-5"
    }
  ],
  "channels": [
    {
      "kind": "slack",
      "status": "planned",
      "label": "Slack",
      "description": "Planned outbound delivery channel."
    }
  ]
}
```

---

## Related Specs

- [[SPEC-deployed-chat-workspace-history]] — message append/read routes now support the bounded `workspace_state` replay envelope
- [[SPEC-deployed-chat-task-and-terminal-history]] — message append/read routes now also support bounded task-plan and terminal replay
- [[SPEC-google-ads-agent-creation-loop]] — agent create/read/config routes now round-trip structured tool metadata and trigger definitions for the builder Configure step
- [[SPEC-agent-builder-channel-persistence]] — agent create/read/update routes now round-trip persisted `channels[]` metadata for builder-selected messaging plans
- [[SPEC-agent-discovery-doc-persistence]] — agent create/read/config routes now round-trip persisted approved `discoveryDocuments`
- [[SPEC-tool-integration-workspace]] — `/tools` and `/agents/create` reuse the saved-agent credential routes and preserve `connectorType` as `mcp`, `api`, or `cli`

Validation contract for the first shared-validation slice:
- `name` is required and must be a non-empty string
- Unknown top-level keys are rejected with `422`
- `status` may only be `active` or `draft`
- String arrays such as `skills` and `agentRules` are trimmed and validated before persistence
- `runtimeInputs`, `toolConnections`, `triggers`, and `channels`, when present, must match the structured metadata schema used by the builder Configure step
- `discoveryDocuments`, when present, must contain bounded `prd` and `trd` documents with `{ title, sections[] }`
- `runtimeInputs[].source` may currently be only `architect_requirement` or `skill_requirement`
- `runtimeInputs[].required` is boolean and required values may carry a blank `value` while still being persisted as blockers
- `toolConnections[].connectorType` may be `mcp`, `api`, or `cli`
- `toolConnections[].status` may be `available`, `configured`, `missing_secret`, or `unsupported`
- `toolConnections[]` currently accept only `toolId`, `name`, `description`, `status`, `authKind`, `connectorType`, and `configSummary`; the richer `researchPlan` object described in specs has not landed on the backend validator/store path yet

### `GET /api/agents/:id`
Get one persisted agent.

Agent payloads may also include `workspace_memory`:

```json
{
  "instructions": "Reusable project instructions",
  "continuity_summary": "Short continuity note",
  "pinned_paths": ["plans/launch.md"],
  "updated_at": "2026-03-25T17:30:00.000Z"
}
```

Tool-connection read paths are metadata-only in the current slice. This route must not echo raw credential material; it only returns safe fields such as connector status, auth kind, and summary text.
Runtime-input read paths are separate from credentials: ordinary agent reads may return saved non-secret values such as `GOOGLE_ADS_CUSTOMER_ID`, but OAuth secrets and API keys remain available only through the credential summary/write routes.

### `PATCH /api/agents/:id`
Patch agent metadata.

Validation contract:
- Body must be an object containing at least one of `name`, `avatar`, `description`, `skills`, `triggerLabel`, or `status`
- Unknown top-level keys are rejected with `422`
- `name`, when present, must be a non-empty trimmed string
- `skills`, when present, must be an array of trimmed strings
- `status`, when present, may only be `active` or `draft`

### `PATCH /api/agents/:id/config`
Patch persisted config fields such as `skillGraph`, `workflow`, `agentRules`, `runtimeInputs`, `toolConnections`, `triggers`, `improvements`, `channels`, and `discoveryDocuments`.

Validation contract:
- Body must be an object containing at least one of `skillGraph`, `workflow`, `agentRules`, `runtimeInputs`, `toolConnections`, `triggers`, `improvements`, `channels`, or `discoveryDocuments`
- Unknown top-level keys are rejected with `422`
- `agentRules`, when present, must be an array of trimmed strings
- `runtimeInputs`, `toolConnections`, `triggers`, `improvements`, `channels`, and `discoveryDocuments`, when present, must match the structured metadata schema used by the builder Configure step

### `GET /api/agents/:id/credentials`
Return saved credential summary for one persisted agent.

**Response:**
```json
[
  {
    "toolId": "google-ads",
    "hasCredentials": true,
    "createdAt": "2026-03-26T07:15:00.000Z"
  }
]
```

This route is summary-only. It exists so `/tools`, `/agents/create`, and Improve Agent can reconcile safe connector state without ever reading plaintext secrets back into the browser.

### `PUT /api/agents/:id/credentials/:toolId`
Store one encrypted credential envelope for a saved agent tool connection.

**Body:**
```json
{
  "credentials": {
    "GOOGLE_ADS_CLIENT_ID": "client-id",
    "GOOGLE_ADS_CLIENT_SECRET": "client-secret"
  }
}
```

Validation contract:
- `credentials` is required and must be a non-empty object
- every credential value must be a non-empty string
- the route encrypts the payload before persistence and returns only `{ ok, toolId }`

This route is used by the fail-closed connector handoff for saved agents and for the first post-create credential commit after a new agent receives its id.

### `DELETE /api/agents/:id/credentials/:toolId`
Delete one saved credential envelope for a persisted agent tool connection.

**Response:** `{ "ok": true, "toolId": "google-ads" }`

This route is paired with metadata updates so disconnect flows can remove both the secret material and the configured-state claim together.

### `GET /api/skills`
Read the current builder-visible skill registry.

**Response:**
```json
[
  {
    "skill_id": "slack-reader",
    "name": "Slack Reader",
    "description": "Reads channels, threads, and message context from Slack workspaces.",
    "tags": ["slack", "messaging", "collaboration"],
    "skill_md": "--- ..."
  }
]
```

The first slice is static/file-backed and exists so `/agents/create` can resolve generated skills to `registry_match` versus `needs_build` without pretending every architect-generated skill is already available.
The same registry is also reused during `configure-agent`: matched skills write the seeded `skill_md` content into the sandbox, while unmatched skills fall back to a stub that includes `# TODO: Implement this skill`.

### `GET /api/skills/:skill_id`
Read one skill-registry entry by id.

Matching normalizes underscores and hyphens, so `/api/skills/slack_reader` and `/api/skills/slack-reader` resolve to the same entry. Returns `404` when the registry has no matching skill.

### `POST /api/agents/:id/sandbox`
Attach a sandbox to an existing agent.

**Body:** `{ "sandbox_id": "<sandbox-id>" }`

Validation contract:
- `sandbox_id` is required and must be a non-empty string
- Unknown top-level keys are rejected with `422`

### `DELETE /api/agents/:id/sandbox/:sandbox_id`
Detach a sandbox from an agent and best-effort remove the Docker container.

Successful responses return the updated redacted `AgentRecord`.

### `POST /api/agents/bulk-delete`
Delete multiple agents in one request.

**Body:** `{ "ids": ["<agent-id-1>", "<agent-id-2>"] }`

**Response:**
```json
{
  "deleted": ["<agent-id-1>"],
  "failed": ["<agent-id-2>"],
  "sandboxesCleaned": 1
}
```

### `DELETE /api/agents/:id`
Delete a persisted agent.

### `GET /api/agents/:id/workspace-memory`
Get the normalized workspace-memory payload for one persisted agent.

**Response:**
```json
{
  "instructions": "Reusable project instructions",
  "continuity_summary": "Short continuity note",
  "pinned_paths": ["plans/launch.md"],
  "updated_at": "2026-03-25T17:30:00.000Z"
}
```

### `PATCH /api/agents/:id/workspace-memory`
Update bounded deployed-chat workspace memory for one agent.

**Body:**
```json
{
  "instructions": "Always summarize decisions first.",
  "continuitySummary": "Need to finish launch checklist review.",
  "pinnedPaths": ["plans/launch.md", "reports/q1-summary.md"]
}
```

Validation contract:
- body must be an object containing at least one of `instructions`, `continuitySummary`, or `pinnedPaths`
- unknown top-level keys are rejected with `422`
- `instructions` is trimmed and limited to `6000` characters
- `continuitySummary` is trimmed and limited to `2000` characters
- `pinnedPaths`, when present, must be an array of at most `8` safe relative workspace paths
- absolute paths, traversal, or malformed pinned paths are rejected with `422`

Successful deletes now emit an `agent.delete` control-plane audit event.

### `POST /api/agents/:id/forge`
Start or reuse the per-agent forge sandbox flow.

**Response:**
- `{ "forge_sandbox_id": "...", "status": "ready", "sandbox": SandboxRecord }` when a running forge sandbox already exists
- `{ "stream_id": "<uuid>" }` when a new forge sandbox is being provisioned through SSE

### `GET /api/agents/:id/forge/stream/:stream_id`
SSE stream for forge sandbox creation. Event contract matches sandbox creation (`log`, `result`, `approved`, `error`, `done`) and adds `forge_agent_id` on success events.

### `GET /api/agents/:id/forge/status`
Return forge sandbox status for one agent.

**Response:**
```json
{
  "active": true,
  "status": "ready",
  "forge_sandbox_id": "<sandbox-id>",
  "vnc_port": 6091,
  "gateway_port": 18789,
  "standard_url": "http://localhost:32770"
}
```

### `POST /api/agents/:id/forge/promote`
Promote the forge sandbox to the agent's active production sandbox, clear `forge_sandbox_id`, and mark the agent `active`.

---

## Agent Configuration

### `POST /api/sandboxes/:sandbox_id/configure-agent`
Push agent configuration (soul + skills + runtime env + cron jobs) into the running sandbox container. When the saved agent includes supported `webhook-post` triggers, this route also provisions stable public webhook handles and one-time shared secrets.

**Body:**
```json
{
  "system_name": "my-agent",
  "soul_content": "# SOUL.md content...",
  "skills": [
    { "skill_id": "web-search", "name": "Web Search", "description": "Search the web" }
  ],
  "runtime_inputs": [
    { "key": "GOOGLE_ADS_CUSTOMER_ID", "value": "123-456-7890" }
  ],
  "agent_id": "agent-123",
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
    { "kind": "runtime_env", "target": ".openclaw/.env", "ok": true, "message": "Runtime env written (1 values)" },
    { "kind": "skill", "target": "slack-reader", "ok": true, "message": "Skill slack-reader: registry match (slack-reader)" },
    { "kind": "webhook", "target": "webhook-post", "ok": true, "message": "Webhook Webhook POST provisioned at http://localhost:8000/api/triggers/webhooks/..." }
  ],
  "webhooks": [
    {
      "triggerId": "webhook-post",
      "title": "Webhook POST",
      "url": "http://localhost:8000/api/triggers/webhooks/public-id",
      "secret": "whsec_...",
      "secretLastFour": "1a2b"
    }
  ]
}
```

Skill step semantics:
- registry match: the backend writes the seeded registry `skill_md` content for the matched skill id
- stub fallback: unmatched skills still write a generated stub and append `# TODO: Implement this skill`

Runtime-input semantics:
- required runtime inputs are validated before config apply continues
- missing required values return non-2xx with a `runtime_env` step and a detail such as `Missing required runtime inputs: GOOGLE_ADS_CUSTOMER_ID`
- when present, the backend writes the saved key/value pairs into `~/.openclaw/.env`

MCP semantics when `agent_id` is provided:
- the backend loads the saved agent record and treats `toolConnections[]` / `tool_connections[]` as the runtime selector for MCP config
- only saved tool connections with `status: "configured"` and `connectorType: "mcp"` are materialized into `.openclaw/mcp.json`
- stale encrypted credentials for deselected tools are ignored and must not widen the runtime tool surface
- when zero MCP tools remain selected, the backend still rewrites `~/.openclaw/mcp.json` to `{ "mcpServers": {} }` so stale runtime config is cleared
- selected-tool MCP package lookup failures, missing saved credentials, decrypt failures, or `.openclaw/mcp.json` write failures return non-2xx with an `mcp` step failure

**Failure response:** returns non-2xx with:
```json
{
  "ok": false,
  "applied": false,
  "detail": "Missing required runtime inputs: GOOGLE_ADS_CUSTOMER_ID",
  "steps": [
    { "kind": "runtime_env", "target": ".openclaw/.env", "ok": false, "message": "Missing required runtime inputs: GOOGLE_ADS_CUSTOMER_ID" }
  ]
}
```

Files written inside container:
- SOUL.md → `~/.openclaw/workspace/SOUL.md`
- Runtime env → `~/.openclaw/.env`
- Skills → `~/.openclaw/workspace/skills/<skill_id>/SKILL.md`

Shell-safety contract:
- `skill_id` is normalized to one safe path segment before the skill directory is created
- SOUL content, skill content, cron names, schedules, and messages are passed to the shell as literal quoted args rather than interpolated shell syntax

Successful config pushes now emit a `sandbox.configure_agent` audit event containing safe counts and step metadata only; raw SOUL content, skill bodies, and cron payload text are not persisted in the audit ledger.
Failed config pushes emit the same audit action with `outcome: "failure"` plus the safe structured step that failed.

Related specs:
- [[SPEC-agent-config-apply-contract]] — structured success/failure contract for runtime apply
- [[SPEC-selected-tool-mcp-runtime-apply]] — selected configured MCP connectors are the runtime selector for `.openclaw/mcp.json`

### `PATCH /api/sandboxes/:sandbox_id/runtime-env`
Write only the runtime-input environment file for an already-deployed sandbox.

**Body:**
```json
{
  "runtime_inputs": [
    { "key": "GOOGLE_ADS_CUSTOMER_ID", "value": "123-456-7890" }
  ]
}
```

Behavior:
- requires a non-empty `runtime_inputs[]` array
- writes the normalized key/value pairs into `~/.openclaw/.env`
- does not rewrite SOUL, skills, MCP config, or cron jobs

**Success response:**
```json
{
  "ok": true,
  "message": "Runtime env written (1 values)"
}
```

**Failure response:**
```json
{
  "ok": false,
  "message": "Failed to write runtime env: ..."
}
```

Returns `400` when `runtime_inputs` is missing or empty, and `500` when the container file write fails.

Webhook runtime notes:
- normal agent reads redact the stored `webhookSecretHash`
- the config-apply `webhooks[]` payload is the only place the full secret is returned
- later agent reads expose only safe webhook metadata such as `webhookPublicId`, `webhookSecretLastFour`, `webhookSecretIssuedAt`, and delivery status

### `POST /api/triggers/webhooks/:public_id`
Deliver a signed inbound webhook event to a deployed agent.

Required header:
- `x-openclaw-webhook-secret: <one-time secret>`
- `x-openclaw-delivery-id: <caller delivery id>`

Behavior:
- validates the provided secret against the stored hash before any sandbox work runs
- requires a 1-200 character delivery id using URL-safe characters (`A-Z`, `a-z`, `0-9`, `.`, `_`, `:`, `-`)
- reserves `{ public_id, delivery_id }` in a bounded backend replay ledger before sandbox invocation so repeated deliveries fail closed
- rejects payloads larger than `64 KiB` with `413` before sandbox delivery
- resolves the target agent's active sandbox
- forwards the payload into `/v1/chat/completions` with the isolated session key `agent:trigger:<agent_id>:<trigger_id>`
- returns `202` on accepted delivery
- returns `400` on missing or malformed delivery ids
- returns `401` on missing or invalid secret
- returns `404` on unknown webhook
- returns `409` when the same delivery id is replayed for the same public webhook or when no active sandbox is available

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

### `GET /api/admin/sandboxes/reconcile`
List current sandbox runtime drift by joining saved sandbox rows with managed Docker containers. Admin token required.

**Headers:**
```http
Authorization: Bearer <OPENCLAW_ADMIN_TOKEN>
```

**Response:**
```json
{
  "summary": {
    "total": 3,
    "healthy": 1,
    "gateway_unreachable": 0,
    "db_only": 1,
    "container_only": 1,
    "missing": 0
  },
  "items": [
    {
      "sandbox_id": "sb-123",
      "sandbox_name": "Tracked Sandbox",
      "sandbox_exists": true,
      "container_exists": false,
      "container_name": null,
      "container_running": false,
      "container_state": null,
      "container_status": null,
      "gateway_reachable": false,
      "drift_state": "db_only",
      "created_at": "2026-03-28T10:00:00.000Z"
    }
  ]
}
```

Errors:
- `401` invalid admin token
- `503` admin token missing

### `POST /api/admin/sandboxes/:sandbox_id/reconcile/repair`
Run one safe admin repair against a drifted sandbox.

**Headers:**
```http
Authorization: Bearer <OPENCLAW_ADMIN_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "action": "delete_db_record"
}
```

Supported actions:
- `delete_db_record` — valid only for `db_only`
- `remove_orphan_container` — valid only for `container_only`

**Response:**
```json
{
  "ok": true,
  "sandbox_id": "sb-123",
  "action": "delete_db_record",
  "prior_drift_state": "db_only"
}
```

Errors:
- `400` invalid action
- `401` invalid admin token
- `404` sandbox not found in reconciliation report
- `409` repair action does not match the current drift state

### `GET /api/sandboxes/:sandbox_id/status`
Returns sandbox runtime status with explicit drift classification.

**Response fields always include:**
- `sandbox_id`
- `sandbox_name`
- `gateway_port`
- `approved`
- `created_at`
- `drift_state: "healthy" | "gateway_unreachable" | "db_only"`
- `gateway_reachable: boolean`
- `container_exists: boolean`
- `container_name: string | null`
- `container_running: boolean`
- `container_state: string | null`
- `container_status: string | null`

`container_running` comes from Docker runtime inspection of `openclaw-<sandbox_id>`, not from PostgreSQL row presence alone. When the gateway responds successfully, its payload is merged into the same response so callers can distinguish a healthy running sandbox from `gateway_unreachable` or `db_only` drift instead of receiving a plain DB fallback.

## Related Specs

- [[SPEC-agent-sandbox-health-surface]] — deployed-agent surfaces rely on explicit `container_running` plus gateway reachability from this endpoint
- [[SPEC-sandbox-runtime-reconciliation]] — defines drift states, admin reconcile reporting, and safe repair actions

### `POST /api/sandboxes/:sandbox_id/restart`
Restart the sandbox gateway process, starting a stopped container first when possible.

Behavior:
- verifies the sandbox row exists
- checks whether `openclaw-<sandbox_id>` is already running
- if the container exists but is stopped, runs `docker start`
- then restarts the gateway process inside the container

**Response:**
```json
{
  "restarted": true,
  "sandbox_id": "<sandbox-id>"
}
```

Returns `409` when the managed container does not exist or cannot be started and the operator must redeploy. Successful restarts emit a `sandbox.restart` audit event.

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
Non-streaming: returns gateway response as JSON after backend persistence succeeds.

When `stream` is enabled, the SSE body may include both ordinary OpenAI chat-completions frames and top-level browser-workspace frames shaped like `{ "browser": { ... } }` or `{ "browser_event": { ... } }`. The backend preserves those frames unchanged so the deployed-agent Browser tab can render structured browser activity, preview URLs, and takeover state.

When `conversation_id` is present and the gateway reply succeeds, the backend now persists the latest user turn plus the final assistant turn itself. For streamed replies, persistence waits for the upstream terminal `data: [DONE]` marker.

If `conversation_id` belongs to the same sandbox, the backend forwards
`x-openclaw-session-key: agent:main:<conv_id>`.

If `conversation_id` belongs to a different sandbox, the route returns:

```json
{ "detail": "Conversation not found" }
```

with HTTP `404` and does not call the gateway.

If `conversation_id` is unknown, the route currently preserves the legacy fallback and derives
`agent:main:<conversation_id>` without a stored conversation row.

If non-stream persistence fails after a successful gateway reply, the route fails closed with HTTP `500` and `detail` containing `chat_exchange_persistence_failed`.

If streamed persistence fails after content was already emitted, the backend sends:

```text
event: persistence_error
data: {"code":"chat_exchange_persistence_failed","message":"..."}
data: [DONE]
```

This is the lower-level HTTP chat-completions proxy used by deployed-agent/operator surfaces. The `ruh-frontend` developer chat uses the WebSocket-backed route below so it can surface structured tool/lifecycle events.

### `POST /api/sandboxes/:sandbox_id/chat/ws`
Bridge the sandbox gateway's operator WebSocket into SSE for developer chat.

**Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Open the app and inspect the logs" }
  ],
  "conversation_id": "<uuid>"
}
```

Behavior:
- resolves the sandbox record and opens `ws://localhost:<gateway_port>`
- authenticates with the sandbox's `gateway_token`
- sends one `chat.send` request using the sandbox conversation session key when `conversation_id` is provided
- prefixes the concatenated user content with the same session-workspace rule used by the HTTP chat proxy
- auto-allows `exec.approval.requested` frames and converts them into structured SSE tool events

SSE events emitted by this route:
- `event: status` with `{ phase, message? }`
- `event: error` with `{ message }`
- `event: persistence_error` with `{ code, message }`
- unnamed `data:` frames carrying:
  - OpenAI-compatible text deltas: `{ "choices": [{ "delta": { "content": "..." } }] }`
  - tool start frames: `{ "tool": "<name>", "input": "<summary>" }`
  - tool completion frames: `{ "result": "Completed: <name>" }`
  - terminal marker: `[DONE]`

Persistence behavior:
- when `conversation_id` is present, the backend appends the latest user turn plus the final assistant text on lifecycle `phase: "end"`
- if persistence fails after content has already streamed, the route emits `event: persistence_error` before `[DONE]`

This route is specialized for the current `ruh-frontend` chat UI and is not a drop-in OpenAI chat-completions proxy.

## Browser / Preview

### `GET /api/sandboxes/:sandbox_id/browser/status`
Return whether the optional X11/VNC browser stack is active for a sandbox.

**Response when VNC was not provisioned:**
```json
{
  "active": false,
  "reason": "VNC not provisioned for this sandbox"
}
```

**Response when provisioned:**
```json
{
  "active": true,
  "vnc_port": 6091
}
```

The backend checks both persisted `vnc_port` metadata and `pgrep -f x11vnc` inside the container.

### `GET /api/sandboxes/:sandbox_id/browser/screenshot`
Return the current X11 framebuffer snapshot.

Behavior:
- captures `DISPLAY=:99` as JPEG when the browser display exists
- returns a 1x1 transparent PNG fallback when display capture is unavailable
- sets `Cache-Control: no-store`

### `GET /api/sandboxes/:sandbox_id/preview/ports`
Discover preview/dev-server ports that are both mapped by Docker and actively listening inside the container.

Allowed preview ports are currently: `3000`, `3001`, `3002`, `4173`, `5173`, `5174`, `8000`, `8080`.

**Response:**
```json
{
  "ports": {
    "3000": 32770,
    "8080": 32771
  },
  "active": [3000]
}
```

`ports` maps container ports to host ports. `active` lists the container ports that responded to the backend's loopback probe.

### `ALL /api/sandboxes/:sandbox_id/preview/proxy/:port/*`
Reverse-proxy one allowed preview port from inside the sandbox to the caller.

Behavior:
- validates `:port` against the allowed preview-port list
- resolves the mapped host port from Docker
- forwards the incoming method, headers, query string, and non-GET/HEAD body
- strips problematic transfer headers and removes frame-blocking headers so previews can render inside the product UI

Returns `400` for a disallowed preview port and `502` when Docker has no mapped port or the proxied request fails.

---

## Conversations

### `GET /api/sandboxes/:sandbox_id/conversations`
List conversations for a sandbox with bounded pagination.

**Query params:**
- `limit` — optional positive integer, default `20`, maximum `100`
- `cursor` — optional `<updated_at>|<conversation_id>` cursor from the previous page

### `POST /api/sandboxes/:sandbox_id/conversations`
Create a new conversation.

**Body:** `{ "model": "openclaw-default", "name": "New Conversation" }`

Shared-Codex sandboxes should keep using `openclaw-default` so the gateway resolves to its locked shared model.

**Response:** `ConversationRecord`

### `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
List one conversation transcript with bounded pagination.

**Query params:**
- `limit` — optional positive integer, default `50`, maximum `200`
- `before` — optional numeric message-id cursor for older history

Returns `404` if the sandbox record no longer exists, even when a stale conversation row or ID is still known.

**Response:** `{ messages, next_cursor, has_more }`

### `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
Append messages to a conversation.

This remains available for explicit/manual transcript writes, but ordinary live chat UIs no longer need a second follow-up append call after successful `POST /chat` or `POST /chat/ws`.

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
- [[LEARNING-2026-03-25-conversation-history-pagination-gap]] — captures the earlier unbounded history-read gap that led to the current cursor-based pagination contract
- [[LEARNING-2026-03-25-sandbox-runtime-drift]] — the current sandbox status and CRUD APIs can return stale DB-backed success signals when Docker runtime state has already drifted
- [[LEARNING-2026-03-25-sandbox-provisioning-job-persistence]] — the sandbox-create API currently exposes only a process-local `stream_id`, so restart-safe provisioning needs a persisted job/read model in addition to SSE
- [[LEARNING-2026-03-25-control-plane-rate-limit-gap]] — the API reference currently documents no `429` or `Retry-After` contract for expensive create/chat/architect flows even though the implementation exposes them without throttling
- [[LEARNING-2026-03-27-webhook-delivery-hardening-gap]] — the public webhook runtime is live, but replay suppression and delivery-hardening remain follow-on work on the same route

---

## Related Specs

- [[SPEC-chat-conversation-boundaries]] — documents the sandbox-ownership contract for `conversation_id` on the chat proxy
- [[SPEC-atomic-chat-persistence]] — documents the backend-owned transcript durability contract for successful sandbox chat exchanges
- [[SPEC-backend-shell-command-safety]] — defines the literal-argument contract and `skill_id` normalization for Docker-backed route commands
- [[SPEC-backend-request-validation]] — planned request-schema contract for high-risk write/proxy routes and deterministic validation failures
- [[SPEC-agent-model-settings]] — documents the user-facing provider reconfigure flow for non-shared sandboxes
- [[SPEC-shared-codex-retrofit]] — documents the admin retrofit endpoint, sandbox metadata, and `409` lockout behavior for shared-Codex sandboxes
- [[SPEC-deployed-chat-browser-workspace]] — streamed sandbox chat may carry structured browser-workspace frames for deployed-agent operator UI
- [[SPEC-gateway-tool-events]] — structured tool events are the contract that lets chat UIs react to live sandbox tool execution
- [[SPEC-control-plane-audit-log]] — defines the shared audit-event schema and future admin query contract for sensitive control-plane actions
- [[SPEC-agent-readable-system-events]] — defines the new system-event read routes and the event-emission contract for backend lifecycle/runtime history
- [[SPEC-agent-builder-gated-skill-tool-flow]] — documents the read-only `/api/skills` registry surface and the builder-facing skill-availability contract
- [[SPEC-agent-webhook-trigger-runtime]] — signed inbound webhook runtime now provisions safe trigger metadata during config apply and exposes the public delivery route
