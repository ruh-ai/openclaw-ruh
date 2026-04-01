# LEARNING: Chat delivery and history persistence are split

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[007-conversation-store]] | [[011-key-flows]]

## Context

While reviewing the current repo state for the highest-leverage missing backlog item that was not already captured in `TODOS.md`, the chat flow was inspected across the backend proxy route, the conversation store, and both frontend chat surfaces.

## What Was Learned

- A successful chat response does not currently mean the exchange was saved to conversation history.
- `ruh-backend/src/app.ts` proxies `POST /api/sandboxes/:sandbox_id/chat` to the gateway and returns the result, but it never writes messages to the conversation store even when `conversation_id` is present.
- Both frontends separately issue `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages` after the reply finishes, and both treat that write as best-effort rather than part of the delivery contract.
- This creates a split-brain user experience where the UI can show a successful assistant reply that disappears after refresh because the follow-up history write failed or never happened.

## Evidence

- `docs/knowledge-base/007-conversation-store.md` explicitly says the backend does not auto-persist messages and the frontend is responsible for the append call after each exchange.
- `ruh-frontend/components/ChatPanel.tsx` calls `saveMessages()` only after the chat request completes and ignores failures with `.catch(() => null)`.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` calls `persistMessages()` only after the streamed reply is finalized and treats failures as non-critical.
- `ruh-backend/src/app.ts` already resolves `conversation_id` into an `openclaw_session_key`, so the backend has the context needed to own persistence but currently stops at gateway proxying.

## Implications For Future Agents

- Treat chat-history durability as its own product contract, not as a side effect left to optimistic frontend cleanup.
- Do not assume a visible assistant reply has been persisted unless the backend-owned contract makes that true.
- When changing chat proxy behavior, reason about streamed replies, client disconnects, and duplicate persistence so history and `message_count` stay consistent.

## Links

- [[007-conversation-store]]
- [[004-api-reference]]
- [[011-key-flows]]
- [Journal entry](../../journal/2026-03-25.md)
