# LEARNING: Streamed chat persistence needs an explicit terminal failure event

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[007-conversation-store]] | [[SPEC-atomic-chat-persistence]]

## Context

While implementing [[SPEC-atomic-chat-persistence]], the repo needed one contract that covered both ordinary JSON chat replies and streamed SSE chat replies without falling back to a second frontend-owned `/messages` write.

## What Was Learned

- Non-streaming chat can fail closed naturally because the backend can persist before returning the final JSON response.
- Streaming chat cannot change the HTTP status after assistant content has already been emitted, so backend-owned durability needs a terminal SSE event instead of pretending the exchange is safely saved.
- The practical first-slice contract is: buffer assistant deltas plus browser-workspace replay state during the stream, wait for the upstream `data: [DONE]`, attempt one persistence commit, then either emit the backend-owned `data: [DONE]` or append `event: persistence_error` followed by that terminal marker.
- AG-UI/deployed-chat consumers can convert `persistence_error` into a visible run failure without restoring the old split-brain `/messages` dependency.

## Evidence

- `ruh-backend/src/app.ts` now owns persistence for `POST /api/sandboxes/:sandbox_id/chat` when `conversation_id` is present and emits `event: persistence_error` on streamed commit failure.
- `ruh-backend/src/chatPersistence.ts` isolates the streamed assistant/browser replay collector so the terminalization rule is covered independently from the older route harness.
- `agent-builder-ui/lib/openclaw/ag-ui/sandbox-agent.ts` now maps `persistence_error` into AG-UI `RUN_ERROR`, and `ruh-frontend/components/ChatPanel.tsx` no longer performs a follow-up `/messages` write.

## Implications For Future Agents

- Any future streamed-chat durability work should preserve an explicit terminal persistence signal; do not reintroduce silent best-effort frontend cleanup.
- If the repo later adds retry or idempotency for streamed persistence, build it around the same terminal event contract instead of hiding failures behind a green `200` stream.
- Route-level `supertest` chat verification remains useful but is currently secondary to helper/unit coverage until the repo’s `app.address().port` harness issue is repaired.

## Links

- [[007-conversation-store]]
- [[004-api-reference]]
- [[011-key-flows]]
- [[SPEC-atomic-chat-persistence]]
- [Journal entry](../../journal/2026-03-26.md)
