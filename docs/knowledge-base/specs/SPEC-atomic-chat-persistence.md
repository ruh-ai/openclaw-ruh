# SPEC: Atomic Chat Persistence

[[000-INDEX|← Index]] | [[007-conversation-store]] | [[004-api-reference]]

## Status

implemented

## Summary

Sandbox chat delivery and conversation-history persistence now share one backend-owned contract. When `POST /api/sandboxes/:sandbox_id/chat` receives a valid `conversation_id`, the backend persists the delivered user/assistant exchange itself instead of depending on a second best-effort frontend `POST .../messages` call.

## Related Notes

- [[007-conversation-store]] — owns the conversation/message storage model and the end-to-end chat flow
- [[004-api-reference]] — documents the chat proxy and manual message-append routes
- [[011-key-flows]] — describes the operator-visible sandbox chat journey

## Specification

### Backend-owned persistence trigger

- `POST /api/sandboxes/:sandbox_id/chat` becomes the source of truth for ordinary chat persistence when the request includes `conversation_id`.
- The backend persists exactly one user message and one assistant message per successful chat exchange.
- The persisted user message is the latest request message whose role is `user`; injected system messages are never written as transcript rows.

### Non-streaming contract

- After a successful gateway response, the backend extracts the assistant reply from the OpenAI-compatible response body and appends both transcript rows before returning `200`.
- If persistence fails after the gateway reply but before the HTTP response is sent, the route fails closed with HTTP `500` and `detail` containing `chat_exchange_persistence_failed`.
- Frontends must treat that response as an error and must not attempt a fallback `/messages` write for the same exchange.

### Streaming contract

- The backend still relays ordinary OpenAI SSE frames and structured browser-workspace frames to the client.
- The backend buffers the assistant text deltas and browser-workspace replay envelope while streaming.
- The backend does not commit transcript rows until it observes the terminal `data: [DONE]` marker from the gateway stream.
- After a successful persistence commit, the backend emits the terminal `data: [DONE]` event to the client.
- If persistence fails after the gateway already streamed content, the backend emits:
  - `event: persistence_error`
  - `data: {"code":"chat_exchange_persistence_failed","message":"..."}`
  - followed by `data: [DONE]`
- Browser-workspace replay state remains persisted on the assistant row via the existing versioned `workspace_state` browser envelope.

### Frontend contract

- Ordinary sandbox chat UIs no longer make a second best-effort `POST /conversations/:conv_id/messages` call after successful chat delivery.
- On non-streaming `500 chat_exchange_persistence_failed`, or streamed `persistence_error`, the UI surfaces an explicit failure instead of pretending the reply is durably saved.
- The manual `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages` route remains available for explicit imports, historical repair, and bounded tool-owned transcript writes, but it is no longer the normal live-chat persistence path.

## Implementation Notes

- Added `ruh-backend/src/chatPersistence.ts` to isolate user-message extraction, non-stream assistant extraction, and streaming SSE finalization/persistence collection.
- Updated `ruh-backend/src/app.ts` so chat proxy persistence is committed inside the backend route rather than delegated to the frontends.
- Removed the post-chat `/messages` dependency from `ruh-frontend/components/ChatPanel.tsx` and `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts`.
- `agent-builder-ui/lib/openclaw/ag-ui/sandbox-agent.ts` now turns streamed `persistence_error` events into AG-UI `RUN_ERROR` events so the deployed-agent UI can fail closed visibly.

## Test Plan

- `cd ruh-backend && bun test ./tests/unit/chatPersistence.test.ts`
- `cd agent-builder-ui && bun test ./lib/openclaw/ag-ui/__tests__/sandbox-agent.test.ts`
- `cd ruh-frontend && npm test -- --config /tmp/ruh-frontend-jest.config.cjs --watchman=false --runInBand -t "does not rely on a follow-up messages write after chat succeeds" ChatPanel.test.tsx`
- Known repo limitation: the older `ruh-backend` `supertest` harness for route-level chat verification still fails before request execution with `app.address().port`, so the new persistence contract is currently locked by helper/unit coverage plus the focused frontend regression above rather than route-e2e evidence in this environment.
