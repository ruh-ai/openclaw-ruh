# LEARNING: Persist deployed-chat workspace replay as a versioned per-message envelope

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[013-agent-learning-system]]

## Context

The deployed-agent chat page already had live browser workspace state in client memory, but historical conversation loads only persisted `role` and `content`. The first replay slice needed a persistence model that solved the immediate browser-refresh gap without locking future terminal, files, research, or productization panels into separate ad hoc stores.

## What Was Learned

The least-coupled first slice is a bounded versioned `workspace_state` envelope stored on assistant message rows.

Why this shape worked:

- It preserves replay alongside the transcript turn that produced it, so operators reopening a conversation get the same conversation-scoped workspace narrative without reconstructing global state.
- It keeps the first shipped consumer small: browser timeline, preview URL, and takeover state fit naturally into one `workspace_state.browser` object.
- It leaves a clean extension path for later workspace surfaces to add sibling keys (`files`, `terminal`, `research`, `productization`) under the same versioned envelope instead of creating one persistence contract per tab.
- It avoids broadening the first slice into a conversation-level aggregate table or cross-run registry before those broader requirements are proven.

## Evidence

- `ruh-backend/src/schemaMigrations.ts` adds `messages.workspace_state JSONB` in migration `0006_messages_workspace_state`.
- `ruh-backend/src/validation.ts` validates a strict `workspace_state.version === 1` envelope with bounded browser fields and serialized-size limits.
- `agent-builder-ui/lib/openclaw/browser-workspace.ts` serializes live browser state into that envelope and hydrates historical browser replay from it.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` now persists the final assistant turn with optional `workspace_state` and rehydrates history from API rows.

## Implications For Future Agents

- Extend `workspace_state` by adding version-compatible sibling surfaces before introducing new persistence stores.
- Keep replay data conversation-scoped and bounded; do not turn this envelope into an unbounded artifact index or analytics feed.
- Validate new surfaces in the backend before persistence so malformed workspace payloads fail closed instead of silently polluting transcripts.
- Prefer turn-scoped snapshots for operator replay and handoff; add conversation-level rollups only when a new feature truly needs aggregate history.

## Links

- [[SPEC-deployed-chat-workspace-history]]
- [[SPEC-deployed-chat-browser-workspace]]
- [[004-api-reference]]
- [[005-data-models]]
- [Journal entry](../../journal/2026-03-26.md)
