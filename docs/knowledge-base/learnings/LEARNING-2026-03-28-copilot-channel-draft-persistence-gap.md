# LEARNING: Co-Pilot draft autosave still drops channel selections

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agent-builder-channel-persistence]]

## Context

During the 2026-03-28 `Analyst-1` backlog-curation run, the active focus still centered on the default `/agents/create` proving case and truthful persisted configuration. The repo was re-checked against `TODOS.md`, `docs/project-focus.md`, and the live create-flow code to find one high-value missing feature package that was not already represented.

## What Was Learned

- The backend/store contract already supports `channels[]` on draft saves and config patches, but the AG-UI draft autosave normalizer does not include `channels` in its payload.
- `buildNormalizedDraftPayload()` in `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` persists skills, tool connections, triggers, improvements, and discovery docs, but omits `channels`.
- `saveAgentDraft()` in `agent-builder-ui/hooks/use-agents-store.ts` is ready to persist `draft.channels`, and the backend `agentStore` already round-trips `channels[]`, so the remaining gap is on the frontend autosave caller rather than the persistence layer.
- `agents/create/page.tsx` already mirrors `runtimeInputs` and `discoveryDocuments` into `updateAgentConfig()` for draft truthfulness, but there is no equivalent sync for `coPilotStore.channels`.
- As a result, a user can select channels in the default Co-Pilot flow, see `Draft saved`, refresh or leave, and reopen a draft that no longer reflects the latest planned channel selections unless they had already completed a final save or deploy handoff.

## Evidence

- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` `buildNormalizedDraftPayload()` does not set `channels`.
- `agent-builder-ui/hooks/use-agents-store.ts` `SaveAgentDraftInput` and `saveAgentDraft()` both support `channels?: AgentChannelSelection[]`.
- `ruh-backend/src/agentStore.ts` persists `channels` on create, metadata patch, and config patch.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` has draft-sync effects for `runtimeInputs` and `discoveryDocuments`, but not for `channels`.

## Implications For Future Agents

- Treat channel persistence as split into two layers: the saved-agent contract is shipped, but the pre-completion Co-Pilot draft contract is not yet truthful for live channel edits.
- Do not assume `Draft saved` in `/agents/create` already covers selected channels just because `channels[]` round-trips after final save or Improve Agent reopen.
- When touching Co-Pilot autosave or draft recovery, include `channels[]` alongside other non-secret configure metadata so the default create flow does not keep overstating its draft safety.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agent-builder-channel-persistence]]
- [Journal entry](../../journal/2026-03-28.md)
