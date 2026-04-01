# SPEC: Agent Backend Persistence

[[000-INDEX|← Index]] | [[004-api-reference]] | [[005-data-models]] | [[008-agent-builder-ui]]

## Status

implemented

## Summary

Adds a PostgreSQL `agents` table and full REST CRUD API so that agents are persisted on the backend instead of browser localStorage only. The agent-builder-ui frontend syncs with the backend API, fixing the "Agent not found" error on direct URL navigation and enabling cross-browser/device access.

## Related Notes

- [[004-api-reference]] — 7 new API endpoints added under `/api/agents`
- [[005-data-models]] — new `agents` table schema and `AgentRecord` interface
- [[002-backend-overview]] — new `agentStore.ts` module added to backend
- [[008-agent-builder-ui]] — `use-agents-store.ts` updated from localStorage-only to backend-synced
- [[011-key-flows]] — agent creation and chat flows now persist to DB

## Specification

### New API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/agents` | List all agents, ordered by `created_at DESC` |
| `POST` | `/api/agents` | Create agent (name required) |
| `GET` | `/api/agents/:id` | Get single agent by ID |
| `PATCH` | `/api/agents/:id` | Update agent fields (name, avatar, description, skills, status, triggerLabel) |
| `DELETE` | `/api/agents/:id` | Delete agent |
| `POST` | `/api/agents/:id/sandbox` | Associate a sandbox with the agent |
| `PATCH` | `/api/agents/:id/config` | Update architect output (skillGraph, workflow, agentRules) |

### Database Table

```sql
CREATE TABLE agents (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  avatar          TEXT        NOT NULL DEFAULT '',
  description     TEXT        NOT NULL DEFAULT '',
  skills          JSONB       NOT NULL DEFAULT '[]',
  trigger_label   TEXT        NOT NULL DEFAULT '',
  status          TEXT        NOT NULL DEFAULT 'draft',
  sandbox_ids     JSONB       NOT NULL DEFAULT '[]',
  skill_graph     JSONB,
  workflow        JSONB,
  agent_rules     JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agents_status ON agents (status);
```

### Frontend Changes

- `use-agents-store.ts` — all operations now POST/PATCH/DELETE to backend, then update local Zustand state. `fromBackend()` maps snake_case → camelCase.
- `agents/page.tsx` — calls `fetchAgents()` on mount to sync from backend.
- `agents/[id]/chat/page.tsx` — if agent not in local store, calls `fetchAgent(id)` from backend before showing "Agent not found."

## Implementation Notes

- **New file:** `ruh-backend/src/agentStore.ts` — follows `store.ts` pattern exactly (withConn, serialize, asyncHandler)
- **Modified:** `ruh-backend/src/index.ts` — added `agentStore.initDb()` to startup
- **Modified:** `ruh-backend/src/app.ts` — 7 routes added between sandbox CRUD and agent config push sections
- JSONB columns (`skills`, `sandbox_ids`, `skill_graph`, `workflow`, `agent_rules`) store complex data without schema migration overhead
- `addSandboxToAgent` uses PostgreSQL JSONB `||` operator with `@>` check for deduplication

## Test Plan

- Backend CRUD verified via curl: create, get, list, patch, config update, add sandbox, delete
- Frontend: agents list page fetches from backend on mount
- Frontend: direct URL navigation to `/agents/:id/chat` fetches from backend if not in localStorage

## Related Learnings

- [[LEARNING-2026-03-25-agent-edit-config-drift]] — the current Improve Agent flow bypasses the existing `/api/agents/:id/config` contract, so architect-output persistence must stay coordinated with the metadata patch path
- [[LEARNING-2026-03-25-agent-sandbox-deployment-integrity-gap]] — the current `sandbox_ids` JSONB association is not a durable deployment relation and should not become the long-term lifecycle model

## Related Specs

- [[SPEC-agent-edit-config-persistence]] — defines the Improve Agent save contract that sequences metadata and architect-config persistence before hot-push
