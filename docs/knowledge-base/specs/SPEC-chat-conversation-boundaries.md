# SPEC: Chat Conversation Boundaries

[[000-INDEX|← Index]] | [[004-api-reference]] | [[007-conversation-store]]

## Status

implemented

## Summary

`POST /api/sandboxes/:sandbox_id/chat` must only reuse a stored conversation session key when the supplied `conversation_id` belongs to the sandbox in the request path. Cross-sandbox conversation reuse fails closed with `404` so chat follows the same ownership rule already enforced by the conversation message, rename, and delete routes.

## Related Notes

- [[004-api-reference]] — documents the chat endpoint request and error contract
- [[007-conversation-store]] — defines conversation ownership and session-key lookup
- [[011-key-flows]] — describes the end-to-end sandbox chat flow that consumes `conversation_id`

## Specification

### Route contract

For `POST /api/sandboxes/:sandbox_id/chat`:

- If `conversation_id` is omitted, the route behaves exactly as it does today and proxies the request without a persisted conversation lookup.
- If `conversation_id` is present and belongs to `:sandbox_id`, the backend reuses that conversation's `openclaw_session_key` and forwards it to the gateway in `x-openclaw-session-key`.
- If `conversation_id` is present but belongs to a different sandbox, the backend returns `404 { "detail": "Conversation not found" }` and does not contact the gateway.
- If `conversation_id` is present but no stored conversation exists, the backend preserves the current fallback behavior and derives `agent:main:<conversation_id>` so callers that create their own deterministic conversation IDs do not break in this slice.

### Ownership rule

The chat proxy must enforce the same sandbox boundary used by:

- `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
- `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
- `PATCH /api/sandboxes/:sandbox_id/conversations/:conv_id`
- `DELETE /api/sandboxes/:sandbox_id/conversations/:conv_id`

This keeps chat-session lookup aligned with the rest of the conversation API and prevents cross-sandbox memory bleed.

## Implementation Notes

- Add a shared helper in `ruh-backend/src/app.ts` or `ruh-backend/src/conversationStore.ts` that returns the conversation only when both `id` and `sandbox_id` match.
- Use that helper in the chat proxy before deriving the forwarded session key.
- Keep the unknown-conversation fallback explicit in code and docs so future hardening can change it deliberately instead of accidentally.

## Test Plan

- Add an E2E route regression showing a `conversation_id` from sandbox A is rejected when posted to sandbox B.
- Preserve the existing positive-path test that a same-sandbox conversation still forwards `x-openclaw-session-key`.
- Verify the focused backend test file covering `/api/sandboxes/:sandbox_id/chat`.
