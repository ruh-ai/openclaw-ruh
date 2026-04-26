# SPEC: Agent Create Session Resume

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-copilot-config-workspace]]

## Status

implemented

## Summary

`/agents/create` must survive a browser refresh without dropping the saved agent draft, forge sandbox identity, or in-progress safe builder metadata. Route entry now re-fetches the backend agent record for authoritative persisted state and merges it with a local safe create-session cache keyed by `agentId`, so refresh/reopen resumes the same build instead of reopening blank or disconnected.

## Related Notes

- [[008-agent-builder-ui]] — owns the builder route, draft autosave loop, and Co-Pilot hydration behavior
- [[011-key-flows]] — documents the operator-visible create/reopen flow
- [[SPEC-copilot-config-workspace]] — the unified Co-Pilot workspace needs truthful resume behavior after reload

## Specification

### Goal

When the operator loads `/agents/create?agentId=<id>`:
- the page must fetch the latest backend agent record on mount instead of trusting only the persisted Zustand list
- safe in-progress create-session state must survive refresh while generation is happening
- forge sandbox identity must recover from the persisted agent contract so the builder can reconnect to the same per-agent workspace
- unsafe secrets such as connector credential drafts must remain excluded from any browser-visible resume cache

### Persisted Sources of Truth

`/agents/create` resume uses two layers:

1. **Backend agent record**
   - authoritative for saved agent metadata and config already written through the backend
   - includes fields such as `name`, `description`, `skillGraph`, `workflow`, `agentRules`, `runtimeInputs`, `toolConnections`, `triggers`, `improvements`, `channels`, `discoveryDocuments`, `status`, `sandbox_ids`, and `forge_sandbox_id`

2. **Local safe create-session cache**
   - keyed by `agentId`
   - stores only safe builder/co-pilot state needed to survive a refresh before every field has been durably saved
   - may include `devStage`, selected skills, build progress, PRD/TRD edits, runtime-input selections, builder hints, and non-secret draft save metadata
   - must not store raw connector secrets or other sensitive credential drafts

### Route Entry Resume Contract

- On mount, the create page must call `fetchAgent(agentId)` even if the agent already exists in local Zustand state.
- While that fetch is in flight, the page may temporarily recover from the local safe create-session cache.
- Once the backend agent record arrives, route hydration merges:
  - backend agent snapshot as the persisted baseline
  - local safe create-session cache as the overlay for in-progress non-secret work
- If no saved agent record exists but a local safe cache does, the page may recover from that cache alone for the same `agentId`.
- `forge_stage` is only a lifecycle hint. Resume must not trust `plan` unless PRD/TRD discovery documents already exist, and must not treat `review`, `test`, `ship`, or `reflect` as completed unless persisted build artifacts already exist for that agent.
- If `forge_stage` points at `plan` but the agent still has no persisted PRD/TRD, the page must fail closed to Think so the operator can regenerate or approve artifact-backed discovery output.
- If `forge_stage` points at `review` or later but the agent still has no persisted `skillGraph` or saved co-pilot snapshot, the page must fail closed to the artifact-backed state instead of reopening with green completed stages.
- When the page must infer a viewed stage from persisted agent data alone, completion badges must still come from explicit saved lifecycle statuses rather than from the inferred stage position itself. Older active agents may reopen on `review` for inspection without automatically marking Think/Plan/Build complete.
- Existing-agent improve flows must not treat already-saved workspace files or baseline `skillGraph` data as proof that a new improvement build already ran. Workspace reconciliation may fast-forward only brand-new or truly in-progress create sessions, not prebuilt agents reopened for edits.
- `skill_graph_ready` or equivalent ready-for-review events may only mark Build complete when the lifecycle is already in `build`. The UI must not jump from `think` or `plan` to completed Build just because the architect emitted a graph-shaped payload early.

### Draft Autosave Contract

- Builder autosave must not fail simply because the in-memory agent list is cold after refresh.
- If `saveAgentDraft({ agentId })` is called and that agent is missing locally, the store must fetch the backend agent first before persisting the new safe draft metadata.
- Existing saved status and forge linkage must be preserved when resuming autosave for a saved draft.
- Metadata persistence must accept the truthful persisted forge lifecycle state (`status: forging`) when autosave is editing a forge-backed create draft instead of forcing the client to spoof `draft` or `active`.

### Cache Lifecycle

- The create page must keep writing the safe create-session cache while the user works.
- The old lighter lifecycle cache may remain as a backward-compatible fallback.
- On successful completion, deploy handoff, promote-to-reflect, or discard/delete, the create-session cache and lifecycle cache for that `agentId` must be cleared.

### Forge Stage Persistence Contract

- `forge_stage=plan` may only be written after the approved PRD/TRD have been saved into the agent workspace.
- `forge_stage` updates may remain immediate for `think` and `build`, because those are in-progress lifecycle markers after their predecessor artifacts exist.
- `review` and later must not be written back to `forge_stage` until the matching persisted build artifacts exist, so refresh/reopen cannot observe a stage marker that outran the saved skill graph/session data.

## Implementation Notes

- Frontend route hydration lives in `agent-builder-ui/app/(platform)/agents/create/page.tsx`.
- The safe local cache is implemented in `agent-builder-ui/lib/openclaw/create-session-cache.ts`.
- Lifecycle fallback and forge-stage truthiness checks live in `agent-builder-ui/lib/openclaw/copilot-flow.ts`.
- Cold-store autosave fallback lives in `agent-builder-ui/hooks/use-agents-store.ts`.
- Backend metadata validation for forge-backed draft autosave lives in `ruh-backend/src/validation.ts`.
- Focused regressions cover the cache merge behavior and the cold-store `saveAgentDraft()` path.

## Test Plan

- `agent-builder-ui/lib/openclaw/create-session-cache.test.ts`
- `agent-builder-ui/lib/openclaw/copilot-flow.test.ts`
- `agent-builder-ui/hooks/use-agents-store.test.ts`
- `ruh-backend/tests/unit/validation.test.ts`
- Manual browser verification:
  - open `/agents/create?agentId=<saved-draft>`
  - confirm the page rehydrates the saved draft after a hard refresh
  - confirm PRD/TRD or other safe builder progress remains visible
  - confirm the route reconnects to the same forge-backed builder state when a forge sandbox exists
