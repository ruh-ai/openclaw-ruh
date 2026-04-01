# LEARNING: Sandbox Delete Leaves Orphan Conversation History

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[003-sandbox-lifecycle]] | [[007-conversation-store]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the sandbox delete flow in `ruh-backend/src/app.ts` was compared against the conversation schema and route guards in `ruh-backend/src/conversationStore.ts` and the surrounding KB notes.

## What Was Learned

- Deleting a sandbox currently removes only the `sandboxes` row and best-effort Docker container state; it does not remove conversations or messages that belong to that sandbox.
- `conversations.sandbox_id` is stored as plain text with an index but no database foreign key back to `sandboxes`, so the DB itself does not enforce cleanup on sandbox deletion.
- The direct conversation-message routes in `ruh-backend/src/app.ts` check `conv.sandbox_id === req.params.sandbox_id`, but they do not verify that the sandbox still exists. If a caller still knows the deleted `sandbox_id` and `conv_id`, those routes can continue to expose or mutate orphaned chat history.
- This gap is separate from the existing backlog items for undeploy cleanup, cross-sandbox chat boundaries, migration tooling, and runtime drift.

## Evidence

- `ruh-backend/src/app.ts` handles `DELETE /api/sandboxes/:sandbox_id` by calling `store.deleteSandbox()` and then `stopAndRemoveContainer(...).catch(() => {})`; there is no conversation cleanup in that route.
- `ruh-backend/src/conversationStore.ts` creates `conversations` with `sandbox_id TEXT NOT NULL` plus `idx_conversations_sandbox_id`, but no `REFERENCES sandboxes(sandbox_id) ON DELETE CASCADE`.
- `GET|POST|PATCH|DELETE /api/sandboxes/:sandbox_id/conversations/:conv_id*` routes look up the conversation and compare its `sandbox_id` to the path param, but they do not call `getRecord(sandbox_id)` before serving existing conversation state.
- `docs/knowledge-base/005-data-models.md` previously described `conversations.sandbox_id` as an FK even though the live schema does not enforce that relationship.
- Existing active tasks in `TODOS.md` cover adjacent problems:
  - TASK-2026-03-25-12 for agent-to-sandbox undeploy cleanup
  - TASK-2026-03-25-22 for cross-sandbox chat conversation boundaries
  - TASK-2026-03-25-23 for real backend schema migrations
  - TASK-2026-03-25-31 for sandbox runtime drift and repair
  None of them explicitly clean up sandbox-owned conversation data or fail conversation routes closed after sandbox deletion.

## Implications For Future Agents

- Treat conversation history as sandbox-owned lifecycle data unless a spec explicitly introduces a different retention model.
- Do not assume `conversations.sandbox_id` is DB-enforced today; any cleanup or route safety currently has to be implemented in backend code until a real migration adds the constraint.
- When hardening sandbox delete, cover both dependent data cleanup and post-delete route behavior. Cleaning rows without tightening route guards, or tightening routes without cleaning rows, still leaves part of the integrity/privacy problem unresolved.

## Links

- [[003-sandbox-lifecycle]]
- [[005-data-models]]
- [[007-conversation-store]]
- [[004-api-reference]]
- [Journal entry](../../journal/2026-03-25.md)
