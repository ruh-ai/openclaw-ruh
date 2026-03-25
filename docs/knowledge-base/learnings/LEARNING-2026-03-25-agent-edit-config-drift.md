# LEARNING: Improve Agent currently drops architect config persistence

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agent-persistence]] | [[SPEC-agent-edit-config-persistence]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the existing-agent save path in `agent-builder-ui` was inspected against the backend agent-persistence contract.

## What Was Learned

- The product already has a split persistence contract for agents: `PATCH /api/agents/:id` updates display metadata, while `PATCH /api/agents/:id/config` updates `skillGraph`, `workflow`, and `agentRules`.
- The Improve Agent flow does not honor that split contract today. It builds an updated architect snapshot in memory and then calls only `updateAgent()`, which drops the config fields before sending the request.
- Because the frontend then replaces local state with the backend response from the metadata-only patch, the edited agent can immediately fall back to the old persisted skill graph/rules after navigation or refresh even if a hot-push just used the transient in-memory snapshot.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` constructs `updatedFields` with `skillGraph`, `workflow`, and `agentRules`, but the existing-agent branch only calls `updateAgent(existingAgent.id, updatedFields)`.
- `agent-builder-ui/hooks/use-agents-store.ts` implements `updateAgent()` as a PATCH to `/api/agents/:id` that sends only `name`, `avatar`, `description`, `skills`, `triggerLabel`, and `status`.
- The same store file already exposes `updateAgentConfig()` for `/api/agents/:id/config`, and `ruh-backend/src/app.ts` plus `ruh-backend/src/agentStore.ts` implement that route specifically for architect-output persistence.
- `agent-builder-ui/lib/openclaw/agent-config.ts` builds SOUL content, skill payloads, and cron jobs from `skillGraph` and `agentRules`, so stale persistence directly affects future deploy/hot-push behavior.

## Implications For Future Agents

- This drift was fixed by [[SPEC-agent-edit-config-persistence]]. The saved-agent source of truth now comes from sequential metadata + config persistence before any hot-push.
- If this area regresses, inspect the combined store helper and the existing-agent completion path before assuming the backend routes are missing.
- When adding release history, deploy snapshots, or new configure-step payloads, make sure the saved agent snapshot is the source of truth and not an unsaved client-only object.
- Prefer one explicit contract for editing an existing agent: either atomically persist metadata + config together or make the two-step sequence fail closed and visible.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agent-persistence]]
- [[SPEC-agent-edit-config-persistence]]
- [Journal entry](../../journal/2026-03-25.md)
