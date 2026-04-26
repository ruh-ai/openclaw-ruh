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

### `POST /api/sandboxes/:sandbox_id/gateway/restart`
Kill and restart the OpenClaw gateway process inside the sandbox container, then health-check.

**Response:** `{ "restarted": true, "healthy": true }`
Returns `502` if the gateway health check fails after restart.

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
List persisted agents visible in the current active-org context.

Auth/ownership contract:
- requires auth
- with an active developer org, returns builder agents whose `created_by` matches the current user
- with an active customer org, returns installed runtime agents whose `created_by` matches the current user inside that tenant

### `POST /api/agents`
Create a persisted agent record for the authenticated developer user.

Auth/ownership contract:
- requires auth
- requires an active developer-org membership
- backend stamps `created_by` from the current user and `org_id` from the active developer org

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
Get one persisted agent owned by the authenticated developer user.

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
Patch agent metadata for an agent owned by the authenticated developer user.

Validation contract:
- Body must be an object containing at least one of `name`, `avatar`, `description`, `skills`, `triggerLabel`, or `status`
- Unknown top-level keys are rejected with `422`
- `name`, when present, must be a non-empty trimmed string
- `skills`, when present, must be an array of trimmed strings
- `status`, when present, may only be `active` or `draft`

### `PATCH /api/agents/:id/config`
Patch persisted config fields such as `skillGraph`, `workflow`, `agentRules`, `runtimeInputs`, `toolConnections`, `triggers`, `improvements`, `channels`, and `discoveryDocuments` for an agent owned by the authenticated developer user.

Validation contract:
- Body must be an object containing at least one of `skillGraph`, `workflow`, `agentRules`, `runtimeInputs`, `toolConnections`, `triggers`, `improvements`, `channels`, or `discoveryDocuments`
- Unknown top-level keys are rejected with `422`
- `agentRules`, when present, must be an array of trimmed strings
- `runtimeInputs`, `toolConnections`, `triggers`, `improvements`, `channels`, and `discoveryDocuments`, when present, must match the structured metadata schema used by the builder Configure step

Customer/runtime surfaces should not use this route. The safe mutation seam for installed runtime agents is `PATCH /api/agents/:id/customer-config`, which intentionally exposes only a smaller runtime-operable field set. See [[SPEC-ruh-app-chat-first-agent-config]] and [[LEARNING-2026-04-02-customer-safe-agent-config-seam]].

### `GET /api/agents/:id/customer-config`
Return the customer-safe runtime config snapshot for one installed/runtime agent under the caller's active customer org.

**Response:**
```json
{
  "agent": {
    "id": "agent-123",
    "name": "Google Ads Manager",
    "avatar": null,
    "description": "Optimizes ad spend and reporting.",
    "status": "active",
    "sandboxIds": ["sandbox-123"],
    "createdAt": "2026-04-02T08:00:00.000Z",
    "updatedAt": "2026-04-02T09:00:00.000Z"
  },
  "skills": ["Google Ads", "Reporting"],
  "agentRules": ["Always explain optimizations plainly"],
  "runtimeInputs": [
    {
      "key": "GOOGLE_ADS_CUSTOMER_ID",
      "label": "Customer ID",
      "description": "Primary Google Ads account identifier",
      "required": true,
      "source": "architect_requirement",
      "value": "123-456-7890"
    }
  ],
  "toolConnections": [],
  "triggers": [],
  "channels": [],
  "workspaceMemory": {
    "instructions": "Use the latest spend report first.",
    "continuitySummary": "Waiting on April spend targets.",
    "pinnedPaths": ["reports/april.md"],
    "updatedAt": "2026-04-02T08:00:00.000Z"
  },
  "creationSession": {
    "summary": "Created from the Google Ads template"
  }
}
```

This route is read-only and returns a redacted runtime snapshot suitable for the Flutter customer app's `Agent Config` tab. Tool/trigger/channel metadata is readable for context, but secrets and builder-only authoring structures remain unavailable.

### `PATCH /api/agents/:id/customer-config`
Patch the customer-safe editable runtime fields for one installed/runtime agent under the caller's active customer org.

**Body:**
```json
{
  "name": "Revenue Copilot",
  "description": "Keeps spend efficient and summaries tighter.",
  "agentRules": ["Always tie optimizations back to ROI"],
  "runtimeInputValues": [
    {
      "key": "GOOGLE_ADS_CUSTOMER_ID",
      "value": "123-456-7890"
    }
  ]
}
```

Validation contract:
- body must be an object containing at least one of `name`, `description`, `agentRules`, or `runtimeInputValues`
- unknown top-level keys are rejected with `422`
- `name` and `description`, when present, must be trimmed strings
- `agentRules`, when present, must be an array of trimmed strings
- `runtimeInputValues`, when present, must be an array of `{ key, value }` updates and only rewrites the `value` field on existing runtime inputs

This route intentionally excludes builder-owned fields such as `skillGraph`, `workflow`, tool-authoring metadata, or trigger/channel mutation. It exists so customer runtime surfaces can tune an installed agent without widening `PATCH /api/agents/:id` or `PATCH /api/agents/:id/config`.

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
It requires auth and the same creator ownership as the main builder agent routes.

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
It requires auth and the same creator ownership as the main builder agent routes.

### `DELETE /api/agents/:id/credentials/:toolId`
Delete one saved credential envelope for a persisted agent tool connection.

**Response:** `{ "ok": true, "toolId": "google-ads" }`

This route is paired with metadata updates so disconnect flows can remove both the secret material and the configured-state claim together.
It requires auth and the same creator ownership as the main builder agent routes.

### `GET /api/skills`
Read the current builder-visible skill registry.

**Query params:**
- `q` — optional search string; when present, returns fuzzy-matched results

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

### `GET /api/skills/stats`
Return aggregate statistics for the skill registry.

### `GET /api/skills/:skill_id`
Read one skill-registry entry by id.

Matching normalizes underscores and hyphens, so `/api/skills/slack_reader` and `/api/skills/slack-reader` resolve to the same entry. Returns `404` when the registry has no matching skill.

### `POST /api/skills`
Publish a skill to the registry. Requires auth.

**Body:**
```json
{
  "skill_id": "my-skill",
  "name": "My Skill",
  "description": "Does something useful",
  "tags": ["automation"],
  "skill_md": "---\nname: my-skill\n...",
  "agent_id": "optional-publishing-agent"
}
```

Returns `201` if newly added, `200` if already existed.

### `POST /api/agents/:id/eval-results`
Create a new evaluation result for an agent. Requires auth and creator ownership.

**Body:** `{ "sandbox_id", "mode", "tasks", "loop_state", "pass_rate", "avg_score", "total_tasks", "passed_tasks", "failed_tasks", "iterations", "stop_reason" }`

### `GET /api/agents/:id/eval-results`
List evaluation results for an agent. Requires auth and creator ownership.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

### `GET /api/agents/:id/eval-results/:evalId`
Get one evaluation result. Requires auth and creator ownership.

### `DELETE /api/agents/:id/eval-results/:evalId`
Delete one evaluation result. Requires auth and creator ownership.

### `POST /api/agents/:id/clone`
Clone/fork an agent into a new draft agent. Copies skills, config, triggers, and tool connections. Requires auth, active developer-org membership, and creator ownership.

**Response:** the new cloned `AgentRecord`

### `POST /api/agents/:id/infer-inputs`
AI-powered inference of sensible default values for runtime input variables. Uses the agent's name and description to generate suggestions. Requires auth and creator ownership.

**Body:** `{ "variables": [{ "key", "label", "description", "example?", "options?" }] }`
**Response:** `{ "values": { "KEY": "suggested-value" } }`

### `POST /api/infer-inputs`
Same as above but for agents that have not been saved yet (during creation flow). Requires auth.

**Body:** `{ "agentName", "agentDescription", "variables": [...] }`

### `POST /api/agents/:id/versions`
Create a snapshot of the agent's current config as a versioned checkpoint. Requires auth and creator ownership.

**Body:** `{ "message": "optional changelog text" }`

### `GET /api/agents/:id/versions`
List agent config version history. Requires auth and creator ownership.

**Query params:** `limit` (default 20, max 100)

### `GET /api/agents/:id/versions/:version`
Get one specific config version by version number. Requires auth and creator ownership.

### `POST /api/agents/:id/versions/:version/rollback`
Rollback the agent's config to a previous version. Requires auth and creator ownership. Emits an `agent.config.rollback` audit event.

### `GET /api/agents/:id/metrics`
Return agent monitoring metrics derived from control-plane audit events. Requires auth and creator ownership.

**Response:**
```json
{
  "total_conversations": 42,
  "total_messages": 180,
  "errors_last_24h": 2,
  "last_active": "2026-04-10T14:30:00.000Z",
  "tool_usage": { "web-search": 15, "code-exec": 8 }
}
```

### `GET /api/agents/:id/activity`
Return a chronological activity feed for one agent. Requires auth and creator ownership.

**Query params:** `limit` (default 50, max 200)

**Response:** array of `{ id, type, timestamp, summary, details }`

### `POST /api/agents/:id/sandbox`
Attach a sandbox to an existing agent.

**Body:** `{ "sandbox_id": "<sandbox-id>" }`

Validation contract:
- `sandbox_id` is required and must be a non-empty string
- Unknown top-level keys are rejected with `422`
- route requires auth and creator ownership of the target agent

### `DELETE /api/agents/:id/sandbox/:sandbox_id`
Detach a sandbox from an agent and best-effort remove the Docker container.

Successful responses return the updated redacted `AgentRecord`.
Route requires auth and creator ownership of the target agent.

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

The route requires auth plus an active developer-org membership and only deletes ids owned by the current creator.

### `DELETE /api/agents/:id`
Delete a persisted agent.

Route requires auth and creator ownership of the target agent.

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
Both workspace-memory routes require auth plus active-context ownership of the target agent:
- developer-active sessions may read/write creator-owned builder agents
- customer-active sessions may read/write customer-owned installed runtime agents

The route is shared because workspace memory is a runtime concept rather than a builder-authoring concept. Customer surfaces should pair it with `GET/PATCH /api/agents/:id/customer-config` instead of the builder-only config patch routes. See [[018-ruh-app]] and [[LEARNING-2026-04-02-customer-safe-agent-config-seam]].

### `POST /api/agents/:id/forge`
Start or reuse the per-agent forge sandbox flow.

Route requires auth, an active developer-org membership, and creator ownership of the target agent.

**Response:**
- `{ "forge_sandbox_id": "...", "status": "ready", "sandbox": SandboxRecord }` when a running forge sandbox already exists
- `{ "stream_id": "<uuid>" }` when a new forge sandbox is being provisioned through SSE

### `GET /api/agents/:id/forge/stream/:stream_id`
SSE stream for forge sandbox creation. Event contract matches sandbox creation (`log`, `result`, `approved`, `error`, `done`) and adds `forge_agent_id` on success events.

Route requires auth, an active developer-org membership, and creator ownership of the target agent.

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

### `GET /api/agents/:id/forge`
Get forge sandbox info for an agent.

**Response:** `{ "status": "ready" | "stopped" | "none" | "missing", "forge_sandbox_id", "sandbox" }`

### `PATCH /api/agents/:id/forge/stage`
Update the agent's forge lifecycle stage after the frontend's local stage gate is satisfied. This endpoint is the committed lifecycle authority; direct stepper inspection in the UI should not call it.

**Body:** `{ "stage": "reveal" | "think" | "plan" | "build" | "review" | "test" | "ship" | "reflect", "testOverride"?: true }`

Backend guards:
- `review` requires `.openclaw/build/build-report.json` with readiness `test-ready` or `ship-ready`
- `test` requires the same non-blocked build report readiness
- `ship` requires a passing eval result, or explicit `testOverride: true` outside production
- `complete` is rejected here; successful `POST /api/agents/:id/ship` owns marking `forge_stage=complete` and promoting the agent to `active`

At accepted stage transitions, the backend auto-commits and pushes the workspace for Agent-as-Code repos.

### `DELETE /api/agents/:id/forge`
Full discard: stops and removes the Docker container, cleans up sandbox records, and deletes the agent record. Emits an `agent.forge_delete` audit event.

Route requires auth and creator ownership of the target agent.

### `PATCH /api/agents/:id/mode`
Switch the agent's forge container between `building` (Architect SOUL.md restored) and `live` (agent's own SOUL.md active). Both modes restart the gateway.

**Body:** `{ "mode": "building" | "live" }`

Route requires auth and creator ownership plus a forge sandbox.

### `POST /api/agents/:id/forge/sync-workspace`
Sync workspace skills from the forge sandbox back into the agent record. Reads `SKILL.md` files from the sandbox `skills/` directory, parses frontmatter, and updates the agent's `skill_graph` and `skills` arrays.

**Response:** `{ "synced": 3, "skills": ["Web Search", "Reporting", "Analytics"] }`

### `POST /api/agents/reproduce`
Create a new agent from a GitHub repo template. Creates the agent record, provisions a container, and clones the repo workspace.

**Body:** `{ "name", "description?", "repo_url", "github_token?" }`
**Response:** `{ "agent_id", "stream_id" }` — stream SSE for progress.

Route requires auth and an active developer-org membership.

### `POST /api/agents/create`
Full agent creation flow: creates an agent record, provisions a forge sandbox, and begins the creation lifecycle. Returns `{ "agent_id", "stream_id" }` — stream SSE for progress.

Route requires auth and an active developer-org membership.

### `POST /api/agents/:id/forge/promote`
Promote the forge sandbox to the agent's active production sandbox, clear `forge_sandbox_id`, and mark the agent `active`.

Route requires auth, an active developer-org membership, and creator ownership of the target agent.

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

---

## Agent Templates

### `GET /api/templates`
List agent templates. No auth required.

**Query params:**
- `category` — optional category filter
- `q` — optional search string

List responses strip `architecturePlan` to keep payloads small. Fetch the full template via `GET /api/templates/:id`.

### `GET /api/templates/categories`
List available template categories. No auth required.

### `GET /api/templates/:id`
Get one template by id, including the full `architecturePlan`. No auth required.

---

## Workspace Write / Copilot

### `POST /api/sandboxes/:sandbox_id/workspace/write`
Write a single file to the sandbox workspace. Requires auth.

**Body:** `{ "path": "relative/path.md", "content": "file content" }`

### `POST /api/sandboxes/:sandbox_id/workspace/write-batch`
Write multiple files to the sandbox workspace in one request. Requires auth. Maximum 50 files per batch.

**Body:** `{ "files": [{ "path": "file1.md", "content": "..." }, ...] }`

### `GET /api/sandboxes/:sandbox_id/workspace/status`
Return workspace status summary (file counts, sizes). No auth required.

### `GET /api/sandboxes/:sandbox_id/workspace-copilot/file`
Read a file from the copilot workspace (the secondary workspace used during build). Requires auth.

**Query params:** `path` — required relative file path

### `POST /api/sandboxes/:sandbox_id/workspace/merge-copilot`
Merge the copilot workspace into the main workspace. Auto-commits and pushes for Agent-as-Code repos. Requires auth.

### `POST /api/sandboxes/:sandbox_id/workspace/git-push`
Push workspace directly to GitHub from inside the container. Auth via GitHub PAT in the request body.

**Body:** `{ "repo": "owner/repo", "githubToken?", "commitMessage?", "agentName?" }`

---

## Build / Ship / Branches

### `POST /api/sandboxes/:sandbox_id/setup`
Run agent setup after build: starts services (e.g., dev servers), waits for health checks, and persists discovered service ports on the agent record.

### `POST /api/sandboxes/:sandbox_id/validate`
Run deep post-build integration validation against the architecture plan.

**Body:** `{ "plan": { ... } }` (the architecture plan JSON)
**Response:** `{ "overallStatus", "passCount", "failCount", ... }`

### `POST /api/sandboxes/:sandbox_id/exec`
Execute an arbitrary command inside the sandbox container. Requires auth.

**Body:** `{ "command": "ls -la", "timeoutMs": 60000 }`
**Response:** `{ "ok": true, "output": "...", "exitCode": 0 }`

Timeout is capped at 300 seconds. Output is truncated to the last 5000 characters.

### `POST /api/agents/:id/build`
Start the server-side build pipeline for an agent. Reads the architecture plan from the workspace, then fires off a background build. Requires auth.

**Response:** `{ "stream_id", "agent_id" }`

### `GET /api/agents/:id/build/stream/:stream_id`
SSE stream for build progress. Emits structured build events. Requires auth.

Event types include `task_start`, `task_complete`, `task_failed`, `file_written`, `progress`, `status`, `setup_progress`, `build_report`, `build_complete`, and `error`. The `build_report` event carries the backend-authored readiness object:

```json
{
  "type": "build_report",
  "report": {
    "generatedAt": "2026-04-26T00:00:00.000Z",
    "readiness": "blocked | test-ready | ship-ready",
    "blockers": [],
    "warnings": [],
    "checks": []
  }
}
```

The same report is persisted to `.openclaw/build/build-report.json` in both the copilot and main workspaces.

### `POST /api/agents/:id/ship`
Ship an agent to GitHub: pushes the workspace, creates the repo if needed, and updates the agent record with repo metadata. Requires auth. Uses the stored GitHub OAuth token or a token from the request body.

**Body:** `{ "githubToken?", "commitMessage?", "repoName?" }`

### Agent Branches (Agent-as-Code feature workflow)

Feature branches enable iterative agent development with git-backed version control.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/agents/:id/branches` | Required | Create a feature branch |
| GET | `/api/agents/:id/branches` | Required | List branches (`?status=open\|merged\|closed`) |
| GET | `/api/agents/:id/branches/:branch` | Required | Get one branch |
| POST | `/api/agents/:id/branches/:branch/checkout` | Required | Checkout branch in sandbox |
| POST | `/api/agents/:id/branches/:branch/commit` | Required | Commit workspace changes |
| GET | `/api/agents/:id/branches/:branch/diff` | Required | Diff summary against base branch |
| GET | `/api/agents/:id/branches/:branch/session` | Required | Get feature session state |
| PATCH | `/api/agents/:id/branches/:branch/session` | Required | Update feature session state |
| POST | `/api/agents/:id/branches/:branch/pr` | Required | Create a GitHub PR |
| POST | `/api/agents/:id/branches/:branch/merge` | Required | Squash-merge the PR |
| DELETE | `/api/agents/:id/branches/:branch` | Required | Close/delete branch |

All branch routes require auth and creator ownership. Branches auto-commit before checkout and auto-push to remote when GitHub is connected.

Related: [[SPEC-agent-as-project]]

---

## Cost Tracking

Cost tracking routes are mounted at `/api/agents/:agentId/...`. Requires auth on all routes.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/agents/:agentId/cost-events` | Record a cost event |
| GET | `/api/agents/:agentId/cost-events` | List cost events (`?limit`, `?offset`, `?run_id`) |
| GET | `/api/agents/:agentId/cost-events/summary` | Monthly cost summary (`?month=YYYY-MM`) |
| PUT | `/api/agents/:agentId/budget-policy` | Create/update budget policy |
| GET | `/api/agents/:agentId/budget-policy` | Get budget policy (`?worker_id`) |
| GET | `/api/agents/:agentId/budget-status` | Get current budget status (`?worker_id`) |
| POST | `/api/agents/:agentId/execution-recordings` | Record an execution |
| GET | `/api/agents/:agentId/execution-recordings` | List execution recordings (`?limit`, `?offset`) |

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
  "model": "openai-codex/gpt-5.5"
}
```

`model` is optional and defaults to `OPENCLAW_SHARED_CODEX_MODEL`.

**Response:**
```json
{
  "ok": true,
  "sandboxId": "<sandbox_id>",
  "containerName": "openclaw-<sandbox_id>",
  "model": "openai-codex/gpt-5.5",
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
Query recent control-plane audit rows. Supports either a JWT-admin session or the backend `OPENCLAW_ADMIN_TOKEN`.

**Headers:**
```http
Authorization: Bearer <OPENCLAW_ADMIN_TOKEN>
```

JWT-backed `admin-ui` requests can also call this route with the normal `accessToken` cookie.

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

`container_running` comes from Docker runtime inspection of `openclaw-<sandbox_id>`, not from PostgreSQL row presence alone. When the gateway responds successfully, its `/health` payload is merged into the same response so callers can distinguish a healthy running sandbox from `gateway_unreachable` or `db_only` drift instead of receiving a plain DB fallback.

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
- if the live operator socket does not emit tool frames for the current run, replays `toolCall` / `toolResult` data from the latest OpenClaw session transcript for that same `sessionKey` before sending `[DONE]`

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

This route is specialized for the current `ruh-frontend` and `ruh_app` chat UIs and is not a drop-in OpenAI chat-completions proxy.

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

The backend checks both persisted `vnc_port` metadata and `pgrep -f x11vnc` inside the container. If the bridge is missing, it retries once after re-running the interactive-runtime service bootstrap (`Xvfb`, `x11vnc`, `websockify`) before returning `active: false`.

### `GET /api/sandboxes/:sandbox_id/browser/screenshot`
Return the current X11 framebuffer snapshot.

Behavior:
- captures `DISPLAY=:99` as JPEG when the browser display exists
- retries once after re-running the interactive browser services if the first capture fails
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

## Auth Endpoints

See [[014-auth-system]] for the full auth contract.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | Public | Create account |
| POST | `/api/auth/login` | Public | Login → tokens |
| POST | `/api/auth/refresh` | Public (cookie) | Rotate tokens |
| POST | `/api/auth/logout` | Required | Invalidate sessions |
| POST | `/api/auth/switch-org` | Required | Switch the active organization for the current refresh session |
| GET | `/api/auth/me` | Required | Current user |
| PATCH | `/api/auth/me` | Required | Update profile |
| GET | `/api/auth/me/export` | Required | GDPR data export (Art. 20 — right to portability) |
| DELETE | `/api/auth/me` | Required | GDPR data deletion (Art. 17 — right to be forgotten) |
| GET | `/api/auth/github/status` | Required | GitHub OAuth connection status |
| GET | `/api/auth/github` | Required | Start GitHub OAuth flow (returns URL or redirects) |
| GET | `/api/auth/github/callback` | Public | GitHub OAuth callback (exchanges code → token) |
| DELETE | `/api/auth/github` | Required | Disconnect GitHub OAuth |

Auth responses are now tenant-aware. `register`, `login`, `refresh`, `switch-org`, and `me` may include:
- `platformRole` — `platform_admin` or `user`
- `memberships[]` — tenant memberships with org metadata and membership role
- `activeMembership` — the membership matching the session's current active organization, or `null`
- `activeOrganization` — the current session org context
- `appAccess` — `{ admin, builder, customer }` booleans that define which first-party apps this session may enter

For routes protected by backend auth middleware, callers can authenticate with either:
- `Authorization: Bearer <access-token>`
- the `accessToken` httpOnly cookie

`POST /api/auth/register` also accepts optional local-bootstrap fields for development and testing:
- `organizationName`
- `organizationSlug`
- `organizationKind`
- `membershipRole`

---

## Admin Endpoints

See [[015-admin-panel]] for the full admin panel contract.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/overview` | Admin | Control-plane overview payload |
| GET | `/api/admin/stats` | Admin | Platform stats |
| GET | `/api/admin/organizations` | Admin | Organization summaries |
| POST | `/api/admin/organizations` | Admin | Create an org with optional seeded membership for an existing user |
| GET | `/api/admin/organizations/:id` | Admin | Organization-console payload (summary, members, assets, sessions, audit) |
| PATCH | `/api/admin/organizations/:id` | Admin | Update org core fields (`name`, `slug`, `plan`, `status`) |
| POST | `/api/admin/organizations/:id/members` | Admin | Add or upsert an org membership |
| PATCH | `/api/admin/organizations/:id/members/:membershipId` | Admin | Update org membership role/status |
| DELETE | `/api/admin/organizations/:id/members/:membershipId` | Admin | Remove an org membership |
| POST | `/api/admin/organizations/:id/session-context/reset` | Admin | Clear `active_org_id` for sessions currently pointed at the org |
| DELETE | `/api/admin/organizations/:id/sessions` | Admin | Revoke every refresh session currently pinned to the org |
| DELETE | `/api/admin/organizations/:id/sessions/:sessionId` | Admin | Revoke one specific refresh session pinned to the org |
| DELETE | `/api/admin/organizations/:id` | Admin | Delete an archived, empty org |
| GET | `/api/admin/users` | Admin | User list |
| PATCH | `/api/admin/users/:id` | Admin | Update user |
| DELETE | `/api/admin/users/:id` | Admin | Delete user |
| GET | `/api/admin/agents` | Admin | All agents with creator/org/runtime context |
| DELETE | `/api/admin/agents/:id` | Admin | Delete an agent with full sandbox cleanup |
| GET | `/api/admin/runtime` | Admin | Sandbox runtime + reconciliation view for the admin panel |
| GET | `/api/admin/audit-events` | Admin token or admin session | Filterable audit event feed |
| GET | `/api/admin/marketplace` | Admin | Marketplace summary, recent listings, and top installs |
| POST | `/api/admin/sandboxes/:sandbox_id/reconcile/repair` | Admin token or admin session | Safe runtime repair action for reconciliation drift |
| POST | `/api/admin/sandboxes/:sandbox_id/restart` | Admin | Restart sandbox container + gateway (starts stopped containers) |
| POST | `/api/admin/sandboxes/:sandbox_id/gateway/restart` | Admin | Restart only the gateway inside a running sandbox |

Organization admin contract notes:
- org `status` is now a control-plane field (`active`, `suspended`, `archived`)
- org-detail payloads include org-pinned refresh sessions so admin-ui can revoke tenant access directly
- membership writes fail closed on the last active owner: the backend rejects demotion, suspension, or removal when no other active owner remains

---

## Marketplace Endpoints

See [[016-marketplace]] for the full marketplace contract.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/marketplace/listings` | Public | Browse |
| GET | `/api/marketplace/listings/:slug` | Public | Detail |
| POST | `/api/marketplace/listings` | Developer org | Create |
| PATCH | `/api/marketplace/listings/:id` | Owner org | Update |
| POST | `/api/marketplace/listings/:id/submit` | Owner org | Submit for review |
| POST | `/api/marketplace/listings/:id/review` | Admin | Approve/reject |
| POST | `/api/marketplace/listings/auto-publish` | Auth (developer org) | One-step create + publish (used by Ship stage) |
| GET | `/api/marketplace/listings/:id/reviews` | Public | List reviews |
| POST | `/api/marketplace/listings/:id/reviews` | Auth | Add review |
| POST | `/api/marketplace/listings/:id/install` | Customer org | Install into a personal runtime agent for the active customer org/user |
| DELETE | `/api/marketplace/listings/:id/install` | Customer org | Remove the active customer-org/user runtime install |
| GET | `/api/marketplace/my/installs` | Customer org | My installed listing ids in the active customer org |
| GET | `/api/marketplace/my/installed-listings` | Customer org | Installed listing metadata plus runtime `agentId` for workspace handoff |
| GET | `/api/marketplace/my/listings` | Developer org | Listings owned by the active developer org |
| GET | `/api/marketplace/categories` | Public | Categories |

Current ownership contract:
- listing creation requires auth plus an active developer-org membership
- creation still requires the current user to be the creator of the referenced agent
- new listings are stamped with `ownerOrgId` from the active developer org
- update/submit/my-listings resolve ownership through `ownerOrgId`, with `publisherId` as a legacy fallback for older rows

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
- [[SPEC-multi-tenant-auth-foundation]] — expands auth endpoints with tenant-aware session context and org switching while preserving local login for testing
- [[SPEC-admin-control-plane]] — documents the admin overview, organization, runtime, audit, marketplace, and system API expansion
- [[SPEC-admin-billing-control-plane]] — extends admin APIs toward customer-org billing mirrors, entitlement reads, Stripe sync, and support actions
- [[SPEC-ruh-app-chat-first-agent-config]] — adds the customer-safe agent-config read/write contract used by the Flutter runtime config tab instead of widening builder-only patch routes
### `POST /api/agents/:id/launch`
Provision and configure a customer runtime agent's sandbox on first open.

Auth/ownership contract:
- requires auth
- requires an active customer-org membership
- only launches agents whose `created_by` matches the current user inside the active customer org
- returns the updated agent plus the provisioned `sandboxId`

## Admin billing routes (2026-04-02)

Related: [[SPEC-admin-billing-control-plane]], [[015-admin-panel]], [[005-data-models]]

- `GET /api/admin/billing/ops`
  - Returns the fleet-level billing queue for customer orgs.
  - Includes summary counts, per-org billing risk rows, and recent billing events.
- `GET /api/admin/organizations/:id/billing`
  - Returns the organization billing console payload.
  - Includes org identity, billing customer linkage, mirrored subscriptions, mirrored invoices, entitlements, override state, billing events, and computed attention items.
- `POST /api/admin/organizations/:id/billing/customer`
  - Upserts the billing-customer linkage for an organization.
- `POST /api/admin/organizations/:id/billing/subscriptions`
  - Upserts a mirrored subscription record for admin operations.
- `POST /api/admin/organizations/:id/billing/invoices`
  - Upserts a mirrored invoice record for admin operations.
- `POST /api/admin/organizations/:id/billing/entitlements`
  - Creates or upserts an org entitlement.
- `PATCH /api/admin/organizations/:id/billing/entitlements/:entitlementId`
  - Updates the billing/access state of an existing entitlement.
- `POST /api/admin/organizations/:id/billing/entitlements/:entitlementId/pause`
  - Creates a blocking `manual_suspend` override.
- `POST /api/admin/organizations/:id/billing/entitlements/:entitlementId/resume`
  - Deactivates blocking overrides and creates a `manual_resume` override.
- `POST /api/admin/organizations/:id/billing/entitlements/:entitlementId/grant-temporary-access`
  - Creates a time-bounded `temporary_access` override.
- `POST /api/admin/organizations/:id/billing/entitlements/:entitlementId/overrides`
  - Creates a generic entitlement override for admin support workflows.

All billing admin routes are `requireAuth` + `requireRole('admin')` and emit both audit events and billing-event records.
