# LEARNING: AG-UI cutover is partially landed but not yet the live contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

`docs/project-focus.md` puts [[SPEC-agui-protocol-adoption]] first in the current delivery order, but the repo did not have a matching worker-ready feature package in `TODOS.md`. This run reviewed the live builder and deployed-chat code paths to determine whether AG-UI adoption was already effectively complete.

## What Was Learned

The AG-UI migration is only partially landed. The repo already contains AG-UI dependencies and concrete AG-UI agents/hooks under `agent-builder-ui/lib/openclaw/ag-ui/`, and `TabChat.tsx` now consumes `useAgentChat()`. But the live builder entry point still creates the legacy builder transport and builder-state store, the AG-UI hook still exposes builder mode through the old `BuilderState` type, and `TabChat.tsx` still contains stale pre-hook transport/state code below the new path. Future create-flow work should treat finishing the AG-UI cutover as foundation work, not assume the migration is already done.

## Evidence

- `agent-builder-ui/package.json` already includes `@ag-ui/client` and `@ag-ui/core`.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts`, `sandbox-agent.ts`, and `use-agent-chat.ts` implement AG-UI adapters and streaming state helpers.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` still imports `createBuilderChatTransport` and `useBuilderState`, then passes a legacy `transport` prop into `TabChat`.
- `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts` still imports `BuilderState` from `../builder-state`.
- `agent-builder-ui/lib/openclaw/chat-transport.ts`, `builder-chat-transport.ts`, `agent-chat-transport.ts`, and `builder-state.ts` still exist even though [[SPEC-agui-protocol-adoption]] marks them as replacement targets.

## Implications For Future Agents

- Treat AG-UI as an in-progress migration, not a completed platform primitive.
- When working on the create flow, improve-agent chat, or deployed-agent chat, prefer extending the AG-UI path and removing legacy seams rather than adding new behavior to both abstractions.
- Keep `TODOS.md`, [[008-agent-builder-ui]], and [[SPEC-agui-protocol-adoption]] aligned so the project-focus steering and the implementation backlog do not drift apart again.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agui-protocol-adoption]]
- [Journal entry](../../journal/2026-03-26.md)
