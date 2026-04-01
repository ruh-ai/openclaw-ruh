# LEARNING: Deployed chat persistent workspace memory gap

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]]

## Context

`docs/project-focus.md` keeps `/agents/[id]/chat` as the active Manus-style parity target and explicitly sequences `Persistent project/workspace memory polish` after the productization/operator slice. This run re-checked that focus order against current TODO coverage, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `agent-builder-ui/hooks/use-agents-store.ts`, `ruh-backend/src/agentStore.ts`, `ruh-backend/src/app.ts`, `docs/knowledge-base/004-api-reference.md`, and `docs/knowledge-base/005-data-models.md`.

## What Was Learned

Once the productization slice is represented in `TODOS.md`, the next credible focus-aligned gap is durable workspace memory on the deployed-agent chat page. The repo still has no operator-facing place to save reusable project instructions, no continuity summary that survives the current chat session, and no bounded model for pinned workspace references or durable context that can be applied to the next deployed-agent conversation.

Today the product behaves like a conversation log plus operational panels, not like a persistent project workspace:

- `page.tsx` only loads the active agent, its sandboxes, and tab state.
- `TabChat.tsx` can create/resume conversations and show workspace activity, but it has no memory surface or carry-forward context contract.
- `TabMissionControl.tsx` shows status/ops metadata only; it is not a durable project-memory surface.
- `agentStore.ts` persists metadata, `skill_graph`, `workflow`, `agent_rules`, and `sandbox_ids`, but nothing for project memory or pinned references.
- `app.ts`, `004-api-reference.md`, and `005-data-models.md` expose no backend contract for reading/updating deployed-agent workspace memory.

## Evidence

- `docs/project-focus.md` explicitly orders `Persistent project/workspace memory polish` after `Publish/auth/analytics/data operator surfaces`.
- `TODOS.md` already represents browser, files/artifacts, terminal/process, research, and productization parity slices, but no active or deferred entry describes persistent workspace memory.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx` still exposes only the existing chat/chats/mission/settings operator surfaces.
- `agent-builder-ui/hooks/use-agents-store.ts` models saved agents without any reusable-instructions or project-memory field.
- `ruh-backend/src/agentStore.ts` has no persisted project-memory columns or JSON field, and `ruh-backend/src/app.ts` has no read/write route for such state.

## Implications For Future Agents

- Treat persistent workspace memory as the next focus-ordered deployed-chat parity package once productization work is represented; do not regress to unrelated polish or backend-only groundwork.
- Keep the first slice bounded: reusable instructions, continuity summary, and safe pinned references are a better starting contract than a sprawling knowledge-management system.
- Make the memory visible and explicitly applied from `/agents/[id]/chat` so operators can tell when a new conversation is using saved workspace context.
- Reuse the existing persisted agent model when possible, but do not overload conversation history alone as a substitute for durable project memory.

## Links

- [[008-agent-builder-ui]]
- [[005-data-models]]
- [Journal entry](../../journal/2026-03-25.md)
