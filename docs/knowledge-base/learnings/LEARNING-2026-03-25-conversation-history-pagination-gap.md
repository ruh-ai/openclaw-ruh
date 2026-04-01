# LEARNING: Conversation history needs bounded pagination before chat history scales

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[007-conversation-store]] | [[004-api-reference]] | [[008-agent-builder-ui]] | [[009-ruh-frontend]]

## Context

This analyst run reviewed the inactive `docs/project-focus.md`, current `TODOS.md`, the backend conversation read paths, and the two shipped deployed-chat UIs to identify the single highest-value missing requirement that was not already tracked.

## What Was Learned

- The read side of persisted chat history still has no bounded contract.
- `ruh-backend/src/conversationStore.ts:listConversations()` returns every conversation for a sandbox, and `getMessages()` returns the full transcript for a conversation, with no limit, cursor, or pagination metadata.
- `ruh-frontend/components/HistoryPanel.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChats.tsx` both eagerly fetch the full conversation list.
- `ruh-frontend/components/ChatPanel.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` both eagerly fetch the full message history for the selected conversation.
- As chat persistence becomes more reliable under `TASK-2026-03-25-38`, these unbounded reads will hit complete histories more often, so the missing pagination contract is a scaling and UX risk, not just a theoretical cleanup item.

## Evidence

- `ruh-backend/src/conversationStore.ts` uses unbounded `SELECT * FROM conversations WHERE sandbox_id = $1 ORDER BY updated_at DESC` and `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY id`.
- `ruh-backend/src/app.ts` exposes those reads directly through `GET /api/sandboxes/:sandbox_id/conversations` and `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages` without query params or page metadata.
- `docs/knowledge-base/004-api-reference.md` documents the message route as "Get all messages for a conversation".
- The current backlog already covers chat persistence, cancellation, validation, and conversation-boundary correctness, but it did not yet capture the bounded-read/history-pagination requirement.

## Implications For Future Agents

- Treat conversation-history pagination as a distinct read-path contract, not as a side effect of chat persistence or request validation work.
- Prefer keyset/cursor pagination for both conversations and messages so larger histories do not degrade into offset-scan behavior.
- Update both frontends together with the backend contract; fixing only the backend or only one UI still leaves one shipped history surface unbounded.
- Keep the newest-window-first UX while making older history explicit through load-more or incremental fetch behavior.

## Links
- [[004-api-reference]]
- [[007-conversation-store]]
- [[008-agent-builder-ui]]
- [[009-ruh-frontend]]
- [Journal entry](../../journal/2026-03-25.md)
