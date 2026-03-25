# Data Models

[[000-INDEX|← Index]] | [[004-api-reference|API Reference]] | [[006-channel-manager|Channel Manager →]]

---

## PostgreSQL Tables

### `sandboxes`

```sql
CREATE TABLE sandboxes (
  sandbox_id     TEXT        PRIMARY KEY,
  sandbox_name   TEXT        NOT NULL DEFAULT 'openclaw-gateway',
  sandbox_state  TEXT        NOT NULL DEFAULT '',
  dashboard_url  TEXT,
  signed_url     TEXT,
  standard_url   TEXT,
  preview_token  TEXT,
  gateway_token  TEXT,
  gateway_port   INTEGER     NOT NULL DEFAULT 18789,
  ssh_command    TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved       BOOLEAN     NOT NULL DEFAULT FALSE,
  shared_codex_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  shared_codex_model   TEXT
);
```

**Key fields:**
- `sandbox_id` — uuid v4, matches Docker container `openclaw-<sandbox_id>`
- `gateway_token` — Bearer token for `Authorization` header when proxying to gateway
- `gateway_port` — random host port Docker assigned to the container's 18789
- `approved` — set to TRUE after `openclaw devices approve --latest` succeeds
- `standard_url` / `signed_url` — gateway base URLs; `signed_url` takes priority if set
- `shared_codex_enabled` — set to TRUE when a sandbox is created with shared auth or retrofitted later
- `shared_codex_model` — the pinned shared Codex model, usually `openai-codex/gpt-5.4`

---

### `conversations`

```sql
CREATE TABLE conversations (
  id                   TEXT        PRIMARY KEY,        -- uuid v4
  sandbox_id           TEXT        NOT NULL,           -- logical sandbox reference; not DB-enforced today
  name                 TEXT        NOT NULL DEFAULT 'New Conversation',
  model                TEXT        NOT NULL DEFAULT 'openclaw-default',
  openclaw_session_key TEXT        NOT NULL,           -- "agent:main:<id>"
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count        INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX idx_conversations_sandbox_id ON conversations (sandbox_id);
```

Today `conversations.sandbox_id` is indexed but not declared as `REFERENCES sandboxes(sandbox_id)`, so sandbox deletion does not automatically cascade to conversation rows.
The backend compensates for that gap by deleting sandbox-owned conversations before deleting the sandbox row itself.

---

### `messages`

```sql
CREATE TABLE messages (
  id              SERIAL      PRIMARY KEY,
  conversation_id TEXT        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL,      -- "user" | "assistant" | "system"
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conv_id ON messages (conversation_id);
```

Messages cascade-delete when parent conversation is deleted.

---

### `control_plane_audit_events`

```sql
CREATE TABLE control_plane_audit_events (
  event_id     TEXT        PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id   TEXT,
  action_type  TEXT        NOT NULL,
  target_type  TEXT        NOT NULL,
  target_id    TEXT        NOT NULL,
  outcome      TEXT        NOT NULL,
  actor_type   TEXT        NOT NULL,
  actor_id     TEXT        NOT NULL,
  origin       TEXT,
  details      JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX control_plane_audit_events_occurred_at_idx
  ON control_plane_audit_events (occurred_at DESC);
```

**Key fields:**
- `action_type` — normalized audit verb such as `sandbox.delete`, `sandbox.reconfigure_llm`, or `cron.create`
- `target_type` / `target_id` — resource category and identifier for the affected object
- `actor_type` / `actor_id` — current backend slice uses `anonymous` or `admin_token` labels until broader auth lands
- `origin` — hashed caller origin metadata; the backend stores `iphash:<sha256-prefix>` instead of raw IPs
- `details` — redacted structured metadata only; secret-bearing keys like tokens, secrets, and API keys are dropped before persistence

---

## TypeScript Interfaces

### `SandboxRecord` (`store.ts`)

```typescript
interface SandboxRecord {
  sandbox_id: string;
  sandbox_name: string;
  sandbox_state: string;
  dashboard_url: string | null;
  signed_url: string | null;
  standard_url: string | null;
  preview_token: string | null;
  gateway_token: string | null;
  gateway_port: number;
  ssh_command: string;
  created_at: string;   // ISO 8601
  approved: boolean;
  shared_codex_enabled: boolean;
  shared_codex_model: string | null;
}
```

### `ConversationRecord` (`conversationStore.ts`)

```typescript
interface ConversationRecord {
  id: string;
  sandbox_id: string;
  name: string;
  model: string;
  openclaw_session_key: string;  // "agent:main:<uuid>"
  created_at: string;
  updated_at: string;
  message_count: number;
}
```

### `MessageRecord` (`conversationStore.ts`)

```typescript
interface MessageRecord {
  role: string;
  content: string;
}
```

### `StreamEntry` (`app.ts`)

In-memory only (not persisted). Lives in `_streams` Map.

```typescript
interface StreamEntry {
  status: 'pending' | 'running' | 'done' | 'error';
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}
```

### `AuditEventRecord` (`auditStore.ts`)

```typescript
interface AuditEventRecord {
  event_id: string;
  occurred_at: string;
  request_id: string | null;
  action_type: string;
  target_type: string;
  target_id: string;
  outcome: string;
  actor_type: string;
  actor_id: string;
  origin: string | null;
  details: Record<string, unknown>;
}
```

---

## Agent Builder Types (`agent-builder-ui/lib/openclaw/types.ts`)

These are frontend-only types used in the agent builder UI.

### `ArchitectResponse`
The parsed response from the OpenClaw architect agent. Key `type` values:
- `"clarification"` — agent needs more info, has `questions[]`
- `"ready_for_review"` — agent produced a `skill_graph`
- `"agent_response"` — plain text response
- `"deploy_complete"` — deployment finished
- `"error"` — something failed

### `SkillGraphNode`
```typescript
interface SkillGraphNode {
  skill_id: string;
  name: string;
  source: "clawhub" | "skills_sh" | "custom" | "data_ingestion" | "native_tool" | "existing";
  status: "found" | "generating" | "generated" | "approved" | "rejected" | "always_included" | "pending_approval";
  depends_on: string[];
  description?: string;
}
```

### `ChatMessage`
```typescript
interface ChatMessage {
  id: string;
  role: "user" | "architect";
  content: string;
  timestamp: string;
  responseType?: ArchitectResponse["type"];
  questions?: ClarificationQuestion[];
}
```

---

## Gateway URL Resolution

`utils.ts:gatewayUrlAndHeaders()` resolves the gateway URL in priority order:
1. `signed_url` (highest — no extra auth header needed)
2. `standard_url`
3. `dashboard_url` (fallback)

If `preview_token` is set and `signed_url` is not, adds `X-Daytona-Preview-Token` header.
Always adds `Authorization: Bearer <gateway_token>` if token is set.

---

## Related Specs

- [[SPEC-agent-builder-architect-protocol-normalization]] — defines the stable `ArchitectResponse` shape the builder consumes despite newer architect payload variants
- [[SPEC-agent-persistence]] — adds a separate persisted agents table and agent records
- [[SPEC-control-plane-audit-log]] — defines the control-plane audit-event schema, redaction rules, and admin query surface
- [[SPEC-shared-codex-retrofit]] — documents the shared-Codex sandbox fields and how retrofit writes them for existing running sandboxes
- [[SPEC-sandbox-conversation-cleanup]] — documents the backend-owned delete-by-sandbox cleanup path while the schema still lacks a sandbox foreign key

## Related Learnings

- [[LEARNING-2026-03-25-sandbox-delete-conversation-orphans]] — the current schema lets sandbox delete leave orphaned conversation history because `conversations.sandbox_id` is not enforced as a real foreign key
- [[LEARNING-2026-03-25-agent-sandbox-deployment-integrity-gap]] — agent deployment state currently lives in a JSONB sandbox-id array with no referential integrity or lifecycle metadata, so deploy/undeploy work needs a normalized relation
