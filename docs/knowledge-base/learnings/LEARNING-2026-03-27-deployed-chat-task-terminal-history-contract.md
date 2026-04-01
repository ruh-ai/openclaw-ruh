# LEARNING: Deployed-chat task and terminal replay should extend the shared workspace envelope

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-deployed-chat-workspace-history]] | [[SPEC-deployed-chat-task-and-terminal-history]]

## Context

The first deployed-chat history slice persisted only browser replay in `messages.workspace_state`. Once the task-progress and terminal panels shipped, historical conversations still reopened with an empty Agent's Computer because that continuity never joined the same stored envelope.

## What changed in my understanding

- The right extension point was the existing versioned `workspace_state` message payload, not a second replay table or another message column.
- Backend-owned chat persistence already sees enough successful streamed state to derive bounded task continuity: task plans from assistant plan text and terminal/process history from structured tool lifecycle events.
- Frontend historical hydration should restore `taskPlan` and `steps` from the same persisted message envelope that already restores browser state, so replay stays scoped per conversation and sandbox automatically.

## Why it matters

Future deployed-chat workspace continuity work should keep extending one bounded per-message replay envelope. Splitting browser, task, files, research, or productization history into separate persistence mechanisms would make refresh/reopen behavior inconsistent and increase the risk of stale cross-run state leaking between conversations.

## Guidance for future agents

- Extend `workspace_state` with versioned sibling surfaces instead of inventing new per-tab history stores.
- Keep replay payloads bounded and structured. Persist summaries that restore operator context, not raw unbounded tool output.
- Treat backend-owned streaming persistence and frontend historical hydration as one contract: if a new workspace surface cannot round-trip through both, the continuity slice is incomplete.

## Related Notes

- [[SPEC-deployed-chat-workspace-history]] — defines the shared versioned workspace replay envelope
- [[SPEC-deployed-chat-task-and-terminal-history]] — first follow-on slice beyond browser replay
- [[008-agent-builder-ui]] — `/agents/[id]/chat` now rehydrates browser, task-plan, and terminal continuity from persisted message state
