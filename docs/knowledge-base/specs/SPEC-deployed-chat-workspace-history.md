# SPEC: Deployed Chat Workspace History

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[004-api-reference]]

## Status

implemented

## Summary

Deployed-agent conversations now persist a bounded structured `workspace_state` envelope alongside assistant message text so workspace history survives refreshes and reopening older chats. The first shipped consumer is the Browser tab, which can replay timeline items, preview URL, and takeover state from persisted conversation data instead of depending on live client memory only.

## Related Notes

- [[004-api-reference]] — documents the message append/read contract that now carries `workspace_state`
- [[005-data-models]] — records the `messages.workspace_state` JSONB column and message shape
- [[008-agent-builder-ui]] — owns the deployed-agent chat replay wiring on `/agents/[id]/chat`
- [[011-key-flows]] — describes how workspace history survives refresh and historical conversation reopen
- [[SPEC-deployed-chat-browser-workspace]] — browser workspace remains the first structured surface and now plugs into the persisted envelope
- [[SPEC-deployed-chat-task-and-terminal-history]] — follow-on slice that adds bounded task-plan and terminal replay to the same envelope

## Specification

### Stored Envelope

- Conversation messages may include an optional `workspace_state` object alongside `role` and `content`.
- The first persisted envelope shape is:

```json
{
  "version": 1,
  "browser": {
    "items": [
      {
        "id": 0,
        "kind": "navigation",
        "label": "Example",
        "url": "https://example.com",
        "detail": "optional",
        "timestamp": 1711111111000
      }
    ],
    "previewUrl": "https://example.com",
    "takeover": {
      "status": "requested",
      "reason": "Login required",
      "actionLabel": "Resume agent run",
      "updatedAt": 1711111112000
    }
  }
}
```

- `version` is required and currently must be `1`.
- The envelope is intentionally versioned so future files, terminal, research, and productization slices can add sibling keys without replacing the whole persistence model.

### First-Slice Validation Rules

- `POST /api/sandboxes/:sandbox_id/conversations/:conv_id/messages` validates message payloads before persistence.
- The append body allows only `messages`, and each message allows only `role`, `content`, and optional `workspace_state`.
- `workspace_state.browser.items` must be an array of bounded browser timeline entries with non-negative integer `id`/`timestamp`, one of the supported `kind` values (`navigation`, `action`, `screenshot`, `preview`), and bounded string fields.
- `workspace_state.browser.takeover` is optional, but when present must include `status` (`requested` or `resumed`), `reason`, `actionLabel`, and `updatedAt`.
- Empty or malformed workspace envelopes fail closed with `422` instead of being silently stored.
- Serialized `workspace_state` is capped at `32768` bytes per message to keep transcript rows bounded.

### Storage Contract

- Backend schema migration `0006_messages_workspace_state` adds nullable JSONB column `messages.workspace_state`.
- Reads from `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages` return `workspace_state` unchanged when present.
- Existing pagination stays ordered and cursor semantics do not change when some rows include structured workspace data.

### UI Replay Contract

- `TabChat.tsx` persists the final assistant turn's browser snapshot in `workspace_state` whenever browser history exists for that turn.
- Historical conversation loads hydrate browser workspace state from persisted `workspace_state` instead of rebuilding it from transcript text.
- Conversations that predate this contract still render normally; they simply have no replayable workspace state.
- Workspace replay remains scoped to the active conversation and sandbox so one run's browser history does not leak into another.

### Out Of Scope For This Slice

- Persisting terminal/process, files/artifacts, research, or productization state beyond the shared envelope contract
- Cross-conversation run registries or workspace analytics
- Reconstructing old conversations that were saved before `workspace_state` existed
- Full browser video/archive replay

## Implementation Notes

- Added strict backend validation in `ruh-backend/src/validation.ts` for message append payloads and the `workspace_state` v1 envelope.
- Added migration `0006_messages_workspace_state` in `ruh-backend/src/schemaMigrations.ts`.
- Extended `ruh-backend/src/conversationStore.ts` to round-trip `workspace_state`.
- Added frontend helpers in `agent-builder-ui/lib/openclaw/browser-workspace.ts` to serialize and hydrate persisted browser workspace state.
- Updated `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` so persisted history rehydrates browser replay data on reload/open.

## Test Plan

- Backend unit: `bun test tests/unit/conversationStore.test.ts tests/unit/validation.test.ts tests/unit/schemaMigrations.test.ts`
- Frontend unit: `bun test lib/openclaw/browser-workspace.test.ts`
- Operator verification:
  - On `/agents/<id>/chat`, trigger browser activity, refresh, and confirm Browser tab history still renders
  - Reopen the same conversation from All Chats and confirm preview/takeover state replays without a new stream
