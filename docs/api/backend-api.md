# Backend API Reference

Base URL: `http://localhost:8000` (local) or `/api` (via nginx)

All endpoints return JSON unless noted. Errors return `{ error: string, details?: any }`.

---

## Health

### `GET /health`
Returns `{ status: "ok" }`. Used by Docker and Kubernetes probes.

---

## Sandboxes

### `POST /api/sandboxes/create`
Start async sandbox creation. Returns a stream ID to track progress.

**Response:**
```json
{ "stream_id": "uuid" }
```

---

### `GET /api/sandboxes/stream/:stream_id`
SSE stream for sandbox creation progress. Connect and listen for events.

**Event types:**
| Event | Payload | Description |
|---|---|---|
| `log` | `{ message: string }` | Installation/setup progress |
| `approved` | `{ sandbox_id: string }` | Device pairing approved |
| `result` | Sandbox metadata object | Sandbox ready |
| `done` | — | Stream complete |
| `error` | `{ message: string }` | Creation failed |

**Sandbox metadata (on `result`):**
```json
{
  "sandbox_id": "string",
  "dashboard_url": "string",
  "gateway_token": "string",
  "ssh_command": "string",
  "signed_url": "string",
  "standard_url": "string"
}
```

---

### `GET /api/sandboxes`
List all sandboxes, sorted by `created_at` descending.

---

### `GET /api/sandboxes/:sandbox_id`
Get a single sandbox by ID.

---

### `DELETE /api/sandboxes/:sandbox_id`
Delete a sandbox and remove it from the database.

---

### `GET /api/sandboxes/:sandbox_id/models`
Fetch available LLM models from the sandbox gateway. Falls back to a synthetic model list if the gateway is unreachable.

---

### `GET /api/sandboxes/:sandbox_id/status`
Get the current runtime status of a sandbox.

---

### `POST /api/sandboxes/:sandbox_id/chat`
Proxy a chat completion request to the sandbox gateway.

**Request body:** OpenAI-compatible chat completion request
```json
{
  "model": "string",
  "messages": [{ "role": "user", "content": "string" }],
  "stream": true
}
```

**Headers set by backend:**
- `x-openclaw-session-key`: Conversation session key for context continuity

Supports both streaming (SSE) and non-streaming responses.

---

## Conversations

### `GET /api/sandboxes/:sandbox_id/conversations`
List all conversations in a sandbox.

---

### `POST /api/sandboxes/:sandbox_id/conversations`
Create a new conversation.

**Request body:**
```json
{
  "name": "string",
  "model": "string"
}
```

---

### `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
Get all messages in a conversation.

---

### `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
Append messages to a conversation.

**Request body:**
```json
{
  "messages": [{ "role": "user|assistant", "content": "string" }]
}
```

---

### `PATCH /api/sandboxes/:sandbox_id/conversations/:conv_id`
Rename a conversation.

**Request body:**
```json
{ "name": "string" }
```

---

### `DELETE /api/sandboxes/:sandbox_id/conversations/:conv_id`
Delete a conversation and all its messages (cascade).

---

## Cron Jobs

All cron operations delegate to the `openclaw cron` CLI inside the sandbox.

### `GET /api/sandboxes/:sandbox_id/crons`
List all cron jobs (`openclaw cron list --json`).

---

### `POST /api/sandboxes/:sandbox_id/crons`
Create a cron job.

**Request body:**
```json
{
  "scheduleType": "cron | every | at",
  "schedule": "string",
  "payloadType": "agentTurn | systemEvent",
  "payload": "string"
}
```

---

### `PATCH /api/sandboxes/:sandbox_id/crons/:job_id`
Edit an existing cron job.

---

### `DELETE /api/sandboxes/:sandbox_id/crons/:job_id`
Delete a cron job.

---

### `POST /api/sandboxes/:sandbox_id/crons/:job_id/toggle`
Enable or disable a cron job.

---

### `POST /api/sandboxes/:sandbox_id/crons/:job_id/run`
Manually trigger a cron job.

---

### `GET /api/sandboxes/:sandbox_id/crons/:job_id/runs`
Get run history for a cron job.

---

## Channels

### `GET /api/sandboxes/:sandbox_id/channels`
Get Telegram and Slack configuration. Sensitive tokens are masked (first 4 + last 4 chars only).

---

### `PUT /api/sandboxes/:sandbox_id/channels/telegram`
Configure Telegram integration.

**Request body:**
```json
{
  "botToken": "string",
  "dmPolicy": "string"
}
```

---

### `PUT /api/sandboxes/:sandbox_id/channels/slack`
Configure Slack integration.

**Request body:**
```json
{
  "appToken": "string",
  "botToken": "string",
  "signingSecret": "string",
  "mode": "string",
  "dmPolicy": "string"
}
```

Restarts the gateway after config changes.

---

### `GET /api/sandboxes/:sandbox_id/channels/:channel/status`
Probe live status of `telegram` or `slack` channel.

---

### `GET /api/sandboxes/:sandbox_id/channels/:channel/pairing`
List active pairing requests.

---

### `POST /api/sandboxes/:sandbox_id/channels/:channel/pairing/approve`
Approve a pairing code.

**Request body:**
```json
{ "code": "string" }
```
