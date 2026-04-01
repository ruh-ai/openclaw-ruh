# SPEC: Deployed Chat Workspace Memory

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[005-data-models]]

## Status

implemented

## Summary

The deployed-agent chat page gains a bounded Workspace Memory layer so operators can save reusable instructions, a short continuity summary, and safe pinned workspace-path references per agent. The first slice persists that memory on the backend agent record, exposes dedicated read/update routes, adds an editable Mission Control surface, and makes new deployed-agent chats explicitly apply the saved memory without mutating old transcripts.

## Related Notes

- [[004-api-reference]] — documents the read/update workspace-memory routes and payload limits
- [[005-data-models]] — documents the persisted `workspace_memory` shape on agent records
- [[008-agent-builder-ui]] — owns the Mission Control editor and new-chat memory-application affordance
- [[011-key-flows]] — explains how operators save memory and start a new chat with that context

## Specification

### Persisted Memory Shape

Each persisted agent can store one bounded `workspace_memory` object:

```json
{
  "instructions": "Reusable project instructions",
  "continuity_summary": "Short handoff or continuity note",
  "pinned_paths": ["plans/launch.md", "reports/q1-summary.md"],
  "updated_at": "2026-03-25T17:30:00.000Z"
}
```

Rules:

- `instructions` is optional text up to `6000` characters
- `continuity_summary` is optional text up to `2000` characters
- `pinned_paths` is an optional array of at most `8` relative workspace paths
- `updated_at` is backend-owned metadata
- empty/whitespace-only values normalize to empty strings

### Safety Rules

- pinned paths are always relative to the sandbox workspace root and must pass the same no-traversal / no-absolute-path checks as the workspace-files contract
- malformed or unsafe pinned paths fail the update request with a deterministic `422`
- the backend never stores raw host paths, secrets, or arbitrary JSON in workspace memory

### API Contract

- `GET /api/agents/:id/workspace-memory`
  - returns the bounded normalized workspace-memory object for one agent
- `PATCH /api/agents/:id/workspace-memory`
  - accepts `instructions`, `continuitySummary`, and `pinnedPaths`
  - rejects unknown fields
  - returns the updated normalized memory payload

The generic agent read/list routes may still include `workspace_memory` for convenience, but the dedicated read/update contract is the stable operator path for this feature.

### UI Contract

- `TabMissionControl.tsx` exposes a Workspace Memory section on `/agents/[id]/chat`
- operators can edit reusable instructions and the continuity summary inline
- operators can manage a bounded list of pinned relative workspace paths
- the UI renders explicit empty states when no memory or pinned paths exist yet
- save status is visible so operators know whether the latest edits persisted

### New-Chat Application Contract

- saved workspace memory is only applied when a brand-new conversation is created
- the deployed chat request prepends one bounded system-context message derived from the saved memory
- existing conversation transcripts are never rewritten or backfilled
- the chat UI shows an explicit “workspace memory will be applied” / “workspace memory applied” affordance so operators can tell when durable context is active

## Implementation Notes

- persist the first slice on the existing `agents` table as a JSONB column rather than creating a separate table
- keep frontend memory state on the saved-agent model so page reloads and targeted refreshes stay consistent
- prefer Mission Control for editing to avoid overloading the streaming chat surface

## Test Plan

- backend unit: validation rejects unsafe pinned paths and unknown fields
- backend route/unit: agent workspace-memory read/update routes return normalized payloads
- frontend unit: saved-agent mapping and workspace-memory update actions preserve existing client-only fields
- frontend e2e: Mission Control renders saved memory, persists edits, and new chat shows the memory-application affordance
