# LEARNING: Deployed chat workspace memory contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]]

## Context

`TASK-2026-03-25-85` implemented the first persistent workspace-memory slice for `/agents/[id]/chat` across `ruh-backend/src/agentStore.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/validation.ts`, `agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/lib/openclaw/workspace-memory.ts`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, and `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`.

## What Was Learned

The cleanest first slice is to persist workspace memory on the existing agent record rather than inventing a conversation-side or sandbox-side store. That keeps the memory stable across refreshes, sandbox swaps, and new conversation creation while avoiding transcript rewrites.

Two implementation boundaries matter:

- edit and persistence belong in Mission Control, not in the streaming chat pane
- application belongs only to brand-new conversations, where one bounded system-context message can carry the saved instructions, continuity summary, and safe pinned paths without mutating older chats

## Implications For Future Agents

- Extend the existing `workspace_memory` JSON contract before creating a second persistence layer for long-lived project context.
- Keep pinned references workspace-relative and validation-backed; do not relax into arbitrary host or secret-bearing paths.
- Preserve the “apply only on new conversation” rule unless there is an explicit transcript-migration design, because silently changing old conversations breaks operator expectations.

## Links

- [[SPEC-deployed-chat-workspace-memory]]
- [[005-data-models]]
- [[011-key-flows]]
- [Journal entry](../../journal/2026-03-25.md)
