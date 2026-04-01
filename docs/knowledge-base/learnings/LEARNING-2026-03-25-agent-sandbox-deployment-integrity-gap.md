# LEARNING: Agent-sandbox deployment integrity gap

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-persistence]]

## Context

While reviewing the repo for the single highest-value missing requirement not already captured in `TODOS.md`, the current agent deployment path was inspected across the backend attach route, the agent store, and the builder deploy/chat consumers.

## What Was Learned

The repo does not have a first-class deployment relation between agents and sandboxes. Deployment state is currently represented by `agents.sandbox_ids`, a JSONB array of strings on the `agents` row, and the attach route persists that association without validating that the sandbox exists first.

That means the database cannot enforce referential integrity, lifecycle status, attach/detach timestamps, or cleanup semantics for deployments. Several already-planned features are therefore building on a weak persistence boundary: undeploy cleanup, config-apply verification, create idempotency, restart recovery, runtime drift repair, and future ownership scoping.

## Evidence

- `ruh-backend/src/app.ts` handles `POST /api/agents/:id/sandbox` by checking only `getAgentRecord()` plus body validation, then calls `agentStore.addSandboxToAgent()` without a sandbox lookup.
- `ruh-backend/src/agentStore.ts` stores deployment state in `sandbox_ids JSONB` and appends sandbox IDs with JSONB concatenation instead of inserting into a normalized deployment table.
- `agent-builder-ui/hooks/use-agents-store.ts` maps `sandbox_ids` directly into client state, so stale or nonexistent associations become part of the UI contract immediately.
- Existing TODOs cover undeploy cleanup, config-apply fail-closed behavior, runtime drift, and ownership scoping, but none replace the underlying deployment-state model itself.

## Implications For Future Agents

- Treat `agents.sandbox_ids` as a transitional association field, not as the final deployment lifecycle model.
- Before expanding deploy/undeploy semantics further, define one normalized deployment relation with explicit lifecycle state and referential integrity.
- Future deploy, undeploy, ownership, and recovery work should reuse that relation instead of adding more business rules around ad hoc array edits.

## Links

- [[005-data-models]]
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-agent-persistence]]
- [Journal entry](../../journal/2026-03-25.md)
