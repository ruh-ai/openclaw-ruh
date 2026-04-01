# SPEC: Conversation History Pagination

[[000-INDEX|← Index]] | [[007-conversation-store]]

## Status

implemented

## Summary

Conversation history reads must become bounded so larger persisted histories do not force either UI to fetch or render every conversation and message up front. This feature adds cursor-based pagination for sandbox conversations and per-conversation messages, with both frontends loading the newest page first and exposing explicit load-more affordances for older history.

## Related Notes

- [[004-api-reference]] — documents the new paginated response contract for conversation and message reads
- [[007-conversation-store]] — owns the keyset pagination helpers and message-window ordering semantics
- [[008-agent-builder-ui]] — deployed-agent chat/history now load the newest page first and fetch older history explicitly
- [[009-ruh-frontend]] — developer chat/history now use the same bounded load-more contract

## Specification

### Goals

- Bound the default payload size for `GET /api/sandboxes/:sandbox_id/conversations`
- Bound the default payload size for `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
- Preserve stable traversal while newer conversations or messages are appended
- Keep chronological message rendering in the clients even though the API pages newest records first

### Conversation list contract

`GET /api/sandboxes/:sandbox_id/conversations`

Query parameters:

- `limit` — optional positive integer, default `20`, maximum `100`
- `cursor` — optional opaque cursor representing the last item from the previous page

Response shape:

```json
{
  "items": [
    {
      "id": "conv-1",
      "sandbox_id": "sb-1",
      "name": "Debug chat",
      "model": "openclaw-default",
      "openclaw_session_key": "agent:main:conv-1",
      "created_at": "2026-03-25T10:00:00.000Z",
      "updated_at": "2026-03-25T10:05:00.000Z",
      "message_count": 4
    }
  ],
  "next_cursor": "2026-03-25T10:05:00.000Z|conv-1",
  "has_more": true
}
```

Ordering:

- Newest activity first using `(updated_at DESC, id DESC)`
- The cursor filters to strictly older rows than the last item of the previous page

### Message history contract

`GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`

Query parameters:

- `limit` — optional positive integer, default `50`, maximum `200`
- `before` — optional numeric message id cursor representing the oldest message currently rendered by the client

Response shape:

```json
{
  "messages": [
    { "id": 42, "role": "user", "content": "Hello", "created_at": "2026-03-25T10:00:00.000Z" },
    { "id": 43, "role": "assistant", "content": "Hi", "created_at": "2026-03-25T10:00:02.000Z" }
  ],
  "next_cursor": 42,
  "has_more": true
}
```

Ordering:

- Query newest-first for efficient bounded reads
- Reverse each page before returning it so each page is chronological for rendering
- `before` returns only messages with `id < before`

### Validation and failure mode

- Non-numeric, zero, negative, or malformed `limit` values return `400`
- Oversized `limit` values are clamped to the documented maximum
- Malformed conversation cursors or malformed `before` values return `400`
- Routes still fail closed with `404` when the sandbox or sandbox-owned conversation does not exist

### Client behavior

- Both UIs load only the newest conversation page on initial history mount
- Both chat views load only the newest message window when a conversation is opened
- Older pages are fetched only through explicit `Load more` UI actions
- Clients replace local history when the sandbox or selected conversation changes so older pages cannot leak across contexts

## Implementation Notes

- Backend work lives in `ruh-backend/src/conversationStore.ts` and `ruh-backend/src/app.ts`
- Conversation cursors encode `updated_at` plus `id` so ties are deterministic
- Message cursors use monotonic `messages.id`
- Frontend work spans:
  - `ruh-frontend/components/HistoryPanel.tsx`
  - `ruh-frontend/components/ChatPanel.tsx`
  - `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChats.tsx`
  - `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`

## Test Plan

- Backend unit tests for cursor parsing, default limits, clamp behavior, and query semantics
- Backend route tests for paginated response shape and invalid query handling
- Frontend component tests for newest-page initial load and explicit older-history fetches
- Operator verification:
  - Open chat history and confirm only a bounded first page loads
  - Open a conversation and confirm older messages appear only after `Load more`
