# Conversation Store

[[000-INDEX|← Index]] | [[006-channel-manager|Channel Manager]] | [[008-agent-builder-ui|Agent Builder UI →]]

---

## Overview

Manages conversations (named sessions) and their messages for a sandbox. Conversations maintain a persistent session key that is forwarded to the OpenClaw gateway to preserve agent context.

The current schema indexes `sandbox_id` for lookup but does not enforce a database foreign key back to `sandboxes`, so sandbox deletion does not automatically remove conversation rows today.
The backend now compensates by deleting all conversations for a sandbox before deleting the sandbox row, and direct conversation routes first verify that the sandbox record still exists.

**File:** `ruh-backend/src/conversationStore.ts`

---

## Session Key Format

Every conversation gets an `openclaw_session_key` on creation:

```
agent:main:<conversation_uuid>
```

This key is sent as the `x-openclaw-session-key` header when proxying chat completions (in `app.ts`). The OpenClaw gateway uses this to maintain memory and context across messages in the same conversation.

---

## Key Functions

### `createConversation(sandboxId, model, name)`

- Generates `convId` (uuid v4)
- Sets `sessionKey = "agent:main:" + convId`
- Inserts into `conversations` table
- Returns `ConversationRecord`

### `listConversations(sandboxId)`

- Legacy unbounded helper used before [[SPEC-conversation-history-pagination]]

### `listConversationsPage(sandboxId, options)`

- Returns a bounded page of conversations for a sandbox, ordered by `updated_at DESC, id DESC`
- Uses a cursor derived from `(updated_at, id)` so older-page traversal stays stable as new conversations arrive

### `getConversation(convId)`

- Returns single `ConversationRecord` or `null`

### `getMessages(convId)`

- Legacy unbounded helper used before [[SPEC-conversation-history-pagination]]

### `getMessagesPage(convId, options)`

- Returns the newest bounded message window for a conversation
- Uses the monotonic message `id` as the `before` cursor when loading older transcript pages
- Reverses each page before returning it so each window remains chronological for rendering

### `appendMessages(convId, messages)`

- Inserts each message into `messages` table
- Updates `message_count += messages.length` and `updated_at = NOW()` on the conversation

### `renameConversation(convId, name)`

- Updates `name` and `updated_at`

### `deleteConversation(convId)`

- Deletes conversation row; messages cascade-delete via FK

### Sandbox-owned cleanup

- Sandbox deletion now removes all conversations for that sandbox before deleting the sandbox row
- Direct message/rename/delete routes must resolve both sandbox existence and conversation ownership before serving or mutating data

---

## How Chat Works End-to-End

```
1. Client: POST /api/sandboxes/:id/conversations  → create conversation, get conv_id
2. Client: POST /api/sandboxes/:id/chat
   Body: { conversation_id: conv_id, messages: [...], model: "..." }

3. Backend:
   a. getConversation(conv_id) → gets openclaw_session_key
   b. Verifies conv.sandbox_id matches the `:sandbox_id` route param
   c. Removes conversation_id from body (not sent to gateway)
   d. Adds x-openclaw-session-key header
   e. Forwards to gateway POST /v1/chat/completions

4. If the conversation belongs to a different sandbox:
   - backend returns `404 Conversation not found`
   - no gateway request is sent

5. Backend (after response):
   Client separately calls POST .../messages to persist the exchange
```

Note: The backend does NOT auto-persist messages — the frontend is responsible for calling the append endpoint after each exchange.

---

## Database Indexes

- `idx_conversations_sandbox_id` on `conversations(sandbox_id)` — fast lookup by sandbox
- `idx_messages_conv_id` on `messages(conversation_id)` — fast message retrieval

---

## Message Roles

Standard OpenAI roles: `"user"`, `"assistant"`, `"system"`. The store accepts any string.

## Related Learnings

- [[LEARNING-2026-03-25-chat-persistence-split-contract]] — chat delivery currently succeeds independently from message-history persistence, so successful replies can vanish on refresh when the frontend-owned follow-up `/messages` write fails
- [[LEARNING-2026-03-25-conversation-history-pagination-gap]] — conversation lists and message reads are still full-history fetches with no bounded windowing contract, which turns growing persisted history into a read-path scaling risk
- [[LEARNING-2026-03-25-deployed-chat-cancellation-gap]] — deployed sandbox chat currently lacks end-to-end cancelation, so a browser disconnect can still leave gateway/model work running after the user is gone
- [[LEARNING-2026-03-25-sandbox-delete-conversation-orphans]] — sandbox deletion currently leaves conversation history behind because the conversation store has no enforced cleanup path tied to sandbox lifecycle
- [[LEARNING-2026-03-25-session-backed-chat-history-replay]] — the two deployed chat clients currently disagree about whether a `conversation_id` request should replay full transcript history or rely on the gateway session key alone

## Related Specs

- [[SPEC-chat-conversation-boundaries]] — defines the same-sandbox ownership rule for chat-session reuse
- [[SPEC-sandbox-conversation-cleanup]] — defines the backend-owned cleanup path and fail-closed direct conversation-route contract
- [[SPEC-conversation-history-pagination]] — defines the bounded cursor-based contract for conversation lists and transcript windows
