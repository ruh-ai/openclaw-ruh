# SPEC: Sandbox Conversation Cleanup

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle]] | [[007-conversation-store]]

## Status

implemented

## Summary

Sandbox-owned conversation history must be treated as dependent lifecycle data rather than an independent record set. Deleting a sandbox should purge its conversations and message rows before the request succeeds, and direct conversation endpoints must return `404` once the sandbox no longer exists even if a caller still knows the old sandbox and conversation IDs.

## Related Notes

- [[003-sandbox-lifecycle]] — defines the sandbox delete contract and what happens before the API returns success
- [[004-api-reference]] — documents the delete and conversation-route behavior after sandbox removal
- [[005-data-models]] — captures the current schema gap and the backend-owned cleanup contract
- [[007-conversation-store]] — owns conversation/message persistence behavior and the delete-by-sandbox helper

## Specification

### Ownership model

- `conversations.sandbox_id` remains a logical reference for this slice; no new DB foreign key or migration is introduced here.
- Conversation history is sandbox-owned data. When a sandbox is deleted, its conversations must be deleted in the same backend-owned cleanup flow.
- Message rows continue to delete via the existing `messages.conversation_id REFERENCES conversations(id) ON DELETE CASCADE` contract.

### Delete contract

`DELETE /api/sandboxes/:sandbox_id` must:

1. Return `404` when the sandbox record does not exist.
2. Delete all conversations whose `sandbox_id` matches the sandbox being deleted.
3. Allow message cleanup to happen via the existing conversation-to-message cascade.
4. Delete the sandbox row only after dependent conversation cleanup has run.
5. Continue to remove the Docker container best-effort after the database cleanup succeeds.

The API still returns:

```json
{ "deleted": "<sandbox_id>" }
```

### Post-delete route behavior

The following direct conversation routes must fail closed with `404` when the sandbox no longer exists, regardless of whether a matching conversation row is still present:

- `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
- `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages`
- `PATCH /api/sandboxes/:sandbox_id/conversations/:conv_id`
- `DELETE /api/sandboxes/:sandbox_id/conversations/:conv_id`

Those routes must also continue to return `404` when the conversation belongs to a different sandbox.

### Non-goals for this slice

- Adding a schema migration or DB-level `REFERENCES sandboxes(sandbox_id) ON DELETE CASCADE`
- Changing retention rules beyond sandbox delete
- Changing frontend-owned message persistence behavior after chat delivery

## Implementation Notes

- Add a store-layer delete path that removes sandbox-owned conversations before deleting the sandbox row.
- Reuse a shared app helper that verifies both sandbox existence and conversation ownership for the direct conversation routes.
- Keep the route contract complementary to the broader chat-boundary and migration backlog items already tracked in `TODOS.md`.

## Test Plan

- Backend integration test: deleting a sandbox removes its conversation rows and cascaded message rows.
- Backend e2e route test: direct conversation-message routes return `404` when the sandbox record is missing, even if the conversation lookup still returns a matching record.
