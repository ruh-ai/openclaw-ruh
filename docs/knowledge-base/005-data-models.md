# Data Models

[[000-INDEX|← Index]] | [[004-api-reference|API Reference]] | [[006-channel-manager|Channel Manager →]]

---

## PostgreSQL Tables

Schema ownership rule:
- The current database shape is bootstrapped through `ruh-backend/src/schemaMigrations.ts`.
- Future schema changes should land as new ordered migrations plus KB/spec updates, not as store-local startup `CREATE TABLE IF NOT EXISTS` or ad hoc `ALTER TABLE` side effects.

### `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  id         TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This ledger records which ordered backend migrations have been applied successfully. Startup creates this table first, then applies any pending migrations before the backend listens for traffic.

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
  vnc_port       INTEGER,
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
- `vnc_port` — optional host port for the sandbox's browser/VNC websocket bridge
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
  workspace_state JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conv_id ON messages (conversation_id);
```

Messages cascade-delete when parent conversation is deleted.
`workspace_state` is nullable and stores the versioned deployed-chat workspace replay envelope defined in [[SPEC-deployed-chat-workspace-history]]. The shared envelope now covers browser replay plus bounded task/terminal history per [[SPEC-deployed-chat-task-and-terminal-history]].

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

### `system_events`

```sql
CREATE TABLE system_events (
  event_id         TEXT        PRIMARY KEY,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level            TEXT        NOT NULL,
  category         TEXT        NOT NULL,
  action           TEXT        NOT NULL,
  status           TEXT        NOT NULL,
  message          TEXT        NOT NULL,
  request_id       TEXT,
  trace_id         TEXT,
  span_id          TEXT,
  sandbox_id       TEXT,
  agent_id         TEXT,
  conversation_id  TEXT,
  source           TEXT        NOT NULL,
  details          JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX system_events_occurred_at_idx
  ON system_events (occurred_at DESC);
CREATE INDEX system_events_sandbox_idx
  ON system_events (sandbox_id, occurred_at DESC);
CREATE INDEX system_events_agent_idx
  ON system_events (agent_id, occurred_at DESC);
CREATE INDEX system_events_action_idx
  ON system_events (action, occurred_at DESC);
CREATE INDEX system_events_request_idx
  ON system_events (request_id, occurred_at DESC);
CREATE INDEX system_events_trace_idx
  ON system_events (trace_id, occurred_at DESC);
```

**Key fields:**
- `category` — bounded event area such as `sandbox.lifecycle` or `agent.forge`
- `action` — normalized event verb such as `sandbox.create.started` or `agent.forge.failed`
- `status` — bounded lifecycle/result marker such as `started`, `success`, or `failure`
- `request_id` / `trace_id` / `span_id` — correlation fields used to join runtime history with bridge traces
- `source` — emitting module identifier such as `ruh-backend:app`
- `details` — redacted structured metadata only; secret-bearing keys are removed and long strings are truncated before persistence

`system_events` was added by migration `0015_system_events`. The first shipped write paths cover sandbox-create and forge lifecycle milestones, and the read surface is documented in [[004-api-reference]].

---

### `agents`

```sql
CREATE TABLE agents (
  id               TEXT        PRIMARY KEY,
  name             TEXT        NOT NULL,
  avatar           TEXT        NOT NULL DEFAULT '',
  description      TEXT        NOT NULL DEFAULT '',
  skills           JSONB       NOT NULL DEFAULT '[]',
  trigger_label    TEXT        NOT NULL DEFAULT '',
  status           TEXT        NOT NULL DEFAULT 'draft',
  sandbox_ids      JSONB       NOT NULL DEFAULT '[]',
  skill_graph      JSONB,
  workflow         JSONB,
  agent_rules      JSONB       NOT NULL DEFAULT '[]',
  workspace_memory JSONB       NOT NULL DEFAULT '{}'::jsonb,
  forge_sandbox_id TEXT,
  runtime_inputs   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tool_connections JSONB       NOT NULL DEFAULT '[]'::jsonb,
  triggers         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  improvements     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  channels         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  discovery_documents JSONB,
  agent_credentials JSONB      NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key fields:**
- `trigger_label` — compatibility summary string still used by list/detail cards
- `forge_sandbox_id` — optional per-agent builder sandbox used by the forge flow before promotion
- `runtime_inputs` — persisted non-secret runtime env requirements plus saved values; the current live source enum is `architect_requirement | skill_requirement`
- `tool_connections` — metadata-only connector state for the builder Configure step; normal reads must not store or return raw credentials here
- `triggers` — structured trigger definitions used for builder reloads and deploy-time config generation
- `improvements` — metadata-only builder recommendations plus operator decision state for review/reopen/deploy continuity
- `channels` — saved builder-selected channel plan (`planned`, `configured`, or `unsupported`), distinct from sandbox runtime channel config
- `discovery_documents` — approved PRD/TRD discovery docs that preserve the builder requirements context through autosave, save, reopen, and Improve Agent
- `agent_credentials` — encrypted per-tool credential envelopes for direct connector setup; normal agent reads do not expose the stored values
- `workspace_memory` — per-agent continuity and instruction payload edited from Mission Control

`runtime_inputs` was added by migration `0011_agent_runtime_inputs`. Older rows read as an empty array and are normalized through the store layer.
`channels` was added by migration `0013_agent_channels`. Older rows read as an empty array and are normalized through the store layer.
`discovery_documents` was added by migration `0014_agent_discovery_documents`. Older rows read as `null` until new discovery docs are approved and saved.

### `webhook_delivery_dedupes`

```sql
CREATE TABLE webhook_delivery_dedupes (
  public_id   TEXT        NOT NULL,
  delivery_id TEXT        NOT NULL,
  agent_id    TEXT        NOT NULL,
  trigger_id  TEXT        NOT NULL,
  status      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (public_id, delivery_id)
);

CREATE INDEX webhook_delivery_dedupes_public_id_updated_idx
  ON webhook_delivery_dedupes (public_id, updated_at DESC);
```

This bounded ledger records replay-sensitive public webhook deliveries without putting caller delivery ids into `agents.triggers` or normal agent read responses. The backend reserves each `{ public_id, delivery_id }` pair before sandbox invocation, updates `status` to `delivered` or `failed` after the attempt finishes, and prunes old rows after the retention window so duplicate suppression stays durable but bounded.

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
  vnc_port: number | null;
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
  workspace_state?: Record<string, unknown>;
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

### `AgentWorkspaceMemory` (`agentStore.ts`)

```typescript
interface AgentWorkspaceMemory {
  instructions: string;
  continuity_summary: string;
  pinned_paths: string[];
  updated_at: string | null;
}
```

### `AgentRecord` (`agentStore.ts`)

```typescript
interface AgentRecord {
  id: string;
  name: string;
  avatar: string;
  description: string;
  skills: string[];
  trigger_label: string;
  status: "active" | "draft" | "forging";
  sandbox_ids: string[];
  forge_sandbox_id: string | null;
  skill_graph: unknown | null;
  workflow: unknown | null;
  agent_rules: string[];
  runtime_inputs: AgentRuntimeInputRecord[];
  tool_connections: AgentToolConnectionRecord[];
  triggers: AgentTriggerRecord[];
  improvements: AgentImprovementRecord[];
  channels: AgentChannelRecord[];
  discovery_documents: AgentDiscoveryDocumentsRecord | null;
  workspace_memory: AgentWorkspaceMemory;
  created_at: string;
  updated_at: string;
}
```

### `AgentRuntimeInputRecord` (`agentStore.ts`)

```typescript
interface AgentRuntimeInputRecord {
  key: string;
  label: string;
  description: string;
  required: boolean;
  source: "architect_requirement" | "skill_requirement";
  value: string;
}
```

### `AgentToolConnectionRecord` (`agentStore.ts`)

```typescript
interface AgentToolConnectionRecord {
  toolId: string;
  name: string;
  description: string;
  status: "available" | "configured" | "missing_secret" | "unsupported";
  authKind: "oauth" | "api_key" | "service_account" | "none";
  connectorType: "mcp" | "api" | "cli";
  configSummary: string[];
}
```

### `AgentCredentialSummary` (`agentStore.ts`)

```typescript
interface AgentCredentialSummary {
  toolId: string;
  hasCredentials: boolean;
  createdAt: string;
}
```

### `AgentChannelRecord` (`agentStore.ts`)

```typescript
interface AgentChannelRecord {
  kind: "telegram" | "slack" | "discord";
  status: "planned" | "configured" | "unsupported";
  label: string;
  description: string;
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

### `SkillRegistryEntry` (`ruh-backend/src/skillRegistry.ts`)
```typescript
interface SkillRegistryEntry {
  skill_id: string;
  name: string;
  description: string;
  tags: string[];
  skill_md: string;
}
```

The first builder-facing registry slice is read-only and seeded in-process. It is not persisted in PostgreSQL yet, but it defines the canonical shape returned by `GET /api/skills` and `GET /api/skills/:skill_id` for [[SPEC-agent-builder-gated-skill-tool-flow]].

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

---

## Related Specs

- [[SPEC-deployed-chat-workspace-history]] — adds `messages.workspace_state` for persisted Browser workspace replay
- [[SPEC-deployed-chat-task-and-terminal-history]] — extends `messages.workspace_state` with bounded task-plan and terminal replay

If `preview_token` is set and `signed_url` is not, adds `X-Daytona-Preview-Token` header.
Always adds `Authorization: Bearer <gateway_token>` if token is set.

---

## Related Specs

- [[SPEC-agent-builder-architect-protocol-normalization]] — defines the stable `ArchitectResponse` shape the builder consumes despite newer architect payload variants
- [[SPEC-agent-persistence]] — adds a separate persisted agents table and agent records
- [[SPEC-backend-schema-migrations]] — defines the ordered schema ledger and the rule that future DB changes land as migrations
- [[SPEC-control-plane-audit-log]] — defines the control-plane audit-event schema, redaction rules, and admin query surface
- [[SPEC-agent-readable-system-events]] — defines the `system_events` schema, redaction rules, and agent-readable query contract
- [[SPEC-google-ads-agent-creation-loop]] — adds `agents.tool_connections` and `agents.triggers` as the persisted builder Configure contract
- [[SPEC-agent-discovery-doc-persistence]] — adds `agents.discovery_documents` as the persisted approved-requirements contract
- [[SPEC-agent-builder-channel-persistence]] — adds `agents.channels` as the persisted builder-selected messaging-channel contract
- [[SPEC-agent-webhook-trigger-runtime]] — supported webhook triggers now persist safe webhook metadata (`webhookPublicId`, masked secret suffix, issued/delivery timestamps) while the hashed verifier remains backend-only
- [[LEARNING-2026-03-27-webhook-replay-ledger-boundary]] — replay-safe public webhook delivery uses a dedicated dedupe table so caller ids do not leak into normal agent reads
- [[SPEC-agent-improvement-persistence]] — adds `agents.improvements` as the persisted builder recommendation and operator-decision contract
- [[SPEC-tool-integration-workspace]] — adds fail-closed credential summary/readback rules and broadens `tool_connections[].connectorType` to `mcp`, `api`, or `cli`
- [[SPEC-agent-builder-gated-skill-tool-flow]] — defines the builder-visible read-only `SkillRegistryEntry` contract and the `native` / `registry_match` / `needs_build` / `custom_built` availability model
- [[SPEC-shared-codex-retrofit]] — documents the shared-Codex sandbox fields and how retrofit writes them for existing running sandboxes
- [[SPEC-sandbox-runtime-reconciliation]] — clarifies that `sandboxes` rows are persisted metadata and must be reconciled with Docker runtime state for truthful health
- [[SPEC-sandbox-conversation-cleanup]] — documents the backend-owned delete-by-sandbox cleanup path while the schema still lacks a sandbox foreign key
- [[SPEC-deployed-chat-workspace-memory]] — defines the persisted agent-level workspace-memory JSON shape used by deployed chat

## Related Learnings

- [[LEARNING-2026-03-26-backend-schema-migrations]] — future schema work should extend `schemaMigrations.ts` instead of reintroducing startup DDL in store modules
- [[LEARNING-2026-03-25-sandbox-delete-conversation-orphans]] — the current schema lets sandbox delete leave orphaned conversation history because `conversations.sandbox_id` is not enforced as a real foreign key
- [[LEARNING-2026-03-25-agent-sandbox-deployment-integrity-gap]] — agent deployment state currently lives in a JSONB sandbox-id array with no referential integrity or lifecycle metadata, so deploy/undeploy work needs a normalized relation
