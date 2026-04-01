# SPEC: Improve Agent Config Persistence

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agent-persistence]]

## Status

implemented

## Summary

Improving an existing agent must persist both display metadata and architect output before the UI hot-pushes config or navigates away. This removes the current drift where the page updates a transient in-memory snapshot while the backend-backed agent record keeps stale `skill_graph`, `workflow`, and `agent_rules`.

## Related Notes

- [[008-agent-builder-ui]] — the Improve Agent flow lives in `agents/create/page.tsx` and uses the persisted agent store
- [[SPEC-agent-persistence]] — the existing `/api/agents/:id` and `/api/agents/:id/config` contracts remain the source of truth
- [[011-key-flows]] — deploy and hot-push flows depend on a trustworthy saved agent snapshot

## Specification

### Save Contract

When editing an existing agent, the frontend must:

1. Persist metadata fields through `PATCH /api/agents/:id`
2. Persist architect output through `PATCH /api/agents/:id/config`
3. Merge both responses into one saved agent snapshot
4. Use that saved snapshot for any hot-push to running sandboxes
5. Only navigate away after the persistence sequence finishes

This keeps the change bounded to the existing backend API surface and avoids introducing a new combined backend route.

### Failure Semantics

- If the metadata patch fails, the Improve Agent flow stays on the page and must not attempt hot-push
- If the config patch fails, the flow stays on the page and must not attempt hot-push
- If persistence succeeds but hot-push fails for one or more running sandboxes, the saved agent record remains the source of truth and the UI may surface a runtime warning without rolling back persistence

### Client-State Rules

- The merged saved agent snapshot must preserve client-only fields such as `model`
- The merged snapshot must keep the backend-returned `sandbox_ids`, timestamps, and persisted config fields aligned in local state
- Future deploys and hot-pushes must derive config from the merged saved snapshot instead of a transient pre-save object

## Implementation Notes

- Add a store helper that sequences `updateAgent()` and `updateAgentConfig()` and returns the merged saved `SavedAgent`
- Update `CreateAgentPage.handleComplete()` to await that helper before calling `pushAgentConfig()`
- Keep the backend route contract unchanged for this bounded fix

## Test Plan

- Bun unit test for the store helper proving it calls metadata persistence first, then config persistence
- The same test should prove the final saved snapshot preserves `skillGraph`, `workflow`, `agentRules`, and client-only `model`
- Manual or higher-level flow verification can build on this later, but the bounded run only requires the store-layer regression
