# LEARNING: Deployed-chat workspace history still disappears after refresh

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[013-agent-learning-system]]

## Context

The active `docs/project-focus.md` keeps Manus-style deployed-agent workspace parity centered on `/agents/[id]/chat`, and the backlog already represents the major surface areas: browser, local-browser handoff, files/artifacts, terminal/process, research, productization, code-control, editor iteration, and workspace memory. The next analyst pass therefore needed to inspect whether the highest-value remaining gap was another new surface or a missing cross-cutting contract inside those existing surfaces.

## What Was Learned

The strongest remaining deployed-chat parity gap is durable structured workspace history, not another standalone UI pane.

Current local evidence:

- `ruh-backend/src/conversationStore.ts` stores conversation messages as `role` plus `content` only, so there is no persisted slot for browser timeline items, takeover state, process cards, artifact metadata, or future research/productization workspace state.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` reloads historical conversations by mapping API rows back into plain `{ role, content }` messages, which drops any previously captured `browserState` and guarantees that structured workspace history vanishes after refresh.
- `docs/knowledge-base/specs/SPEC-deployed-chat-browser-workspace.md` explicitly lists backend persistence of browser workspace snapshots as out of scope for the shipped first slice, confirming this is known unfinished product work rather than an accidental regression.
- The current session-folder approach preserves raw files under `~/.openclaw/workspace/sessions/<conversation_id>`, but it does not preserve the structured operator narrative of what happened in the Browser tab or future workspace panels.

## Evidence

- `docs/project-focus.md` explicitly calls for browser history/action visibility and durable outputs that survive page refreshes and handoffs.
- `ruh-backend/src/conversationStore.ts` documents `messages` as `role, content` rows and `appendMessages()` writes only those two fields today.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` persists assistant turns with text content only and reloads history as plain text messages.
- `docs/knowledge-base/specs/SPEC-deployed-chat-browser-workspace.md` leaves `Persisting browser workspace snapshots through the backend conversation store` out of scope for the current shipped browser slice.

## Implications For Future Agents

- Treat the next deployed-chat parity package as a bounded workspace-history persistence and replay contract layered onto the existing conversation store.
- Make browser history replay the required first consumer, because browser workspace state already exists today and the project focus explicitly values history/action visibility there.
- Use one bounded `workspace_state` envelope that later terminal, artifact, research, and productization slices can extend instead of creating one persistence store per workspace panel.
- Do not broaden the first slice into a cross-conversation analytics warehouse or global artifact registry; the immediate gap is truthful per-conversation replay after refresh and reopen.

## Links

- [[004-api-reference]]
- [[005-data-models]]
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-deployed-chat-browser-workspace]]
- [Journal entry](../../journal/2026-03-26.md)
