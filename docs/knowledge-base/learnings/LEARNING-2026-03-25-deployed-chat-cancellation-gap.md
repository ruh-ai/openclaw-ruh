# LEARNING: Deployed sandbox chat lacks a cancellation boundary

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[007-conversation-store]] | [[011-key-flows]]

## Context

This review looked for the highest-leverage missing reliability or security improvement that was not already captured in `TODOS.md`. The relevant shipped path is the deployed sandbox chat route used by both `ruh-frontend` and the deployed-agent chat screen in `agent-builder-ui`.

## What Was Learned

The deployed sandbox chat route currently has no end-to-end cancellation contract. Both chat UIs start streamed `POST /api/sandboxes/:sandbox_id/chat` requests with plain `fetch()` and no `AbortController`, and the backend proxy forwards the gateway request without wiring client disconnects back into upstream cancellation. As a result, abandoned chats can keep running inside the sandbox gateway and model provider after the browser is already gone.

## Evidence

- `ruh-frontend/components/ChatPanel.tsx` starts streamed chat with `fetch(.../chat)` and reads `res.body.getReader()` without any abort controller or unmount cleanup.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` follows the same pattern for deployed-agent chat.
- `ruh-backend/src/app.ts` handles the streaming proxy path with `axios.post(... responseType: 'stream')` and `resp.data.pipe(res)` but does not register request-close listeners or abort the upstream request when the client disconnects.
- Existing backlog items already cover adjacent concerns:
  - [[LEARNING-2026-03-25-chat-persistence-split-contract]] / `TASK-2026-03-25-38` for backend-owned chat persistence
  - `TASK-2026-03-25-33` for architect-route retry and cancellation
  - [[LEARNING-2026-03-25-control-plane-rate-limit-gap]] / `TASK-2026-03-25-42` for abuse throttling
  None of those currently stop wasted deployed-chat work after a browser disconnect.

## Implications For Future Agents

- Treat deployed sandbox chat cancellation as a separate resource-lifecycle problem from chat persistence, architect cancellation, or rate limiting.
- When implementing the fix, cover both streaming and non-streaming chat because both currently lack abort propagation.
- Keep the final contract compatible with backend-owned persistence so canceled runs do not silently commit partial assistant output after the user has left.

## Links

- [[002-backend-overview]]
- [[007-conversation-store]]
- [[011-key-flows]]
- [Journal entry](../../journal/2026-03-25.md)
