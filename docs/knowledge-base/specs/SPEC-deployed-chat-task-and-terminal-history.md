# SPEC: Deployed Chat Task And Terminal History

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[004-api-reference]]

## Status

implemented

## Summary

Deployed-agent conversations already persist bounded browser workspace history, but the task-progress and terminal panels still reset on refresh or historical reopen because that continuity never enters `workspace_state`. This slice extends the existing versioned workspace envelope so completed assistant turns can also round-trip bounded task-plan metadata and structured terminal/process history without inventing a second history store.

## Related Notes

- [[004-api-reference]] — message append/read routes now document the extended `workspace_state.task` contract
- [[005-data-models]] — `messages.workspace_state` remains the shared replay envelope and now carries task/terminal history too
- [[008-agent-builder-ui]] — `/agents/[id]/chat` hydrates historical task-progress and terminal rows from persisted state
- [[011-key-flows]] — deployed-chat refresh/reopen flow now preserves task/terminal continuity alongside browser history
- [[SPEC-deployed-chat-workspace-history]] — this slice extends the existing versioned workspace envelope instead of replacing it

## Specification

### Stored Envelope

- `workspace_state.version` remains `1`.
- `workspace_state.browser` remains unchanged and backward compatible with the first shipped browser-history slice.
- `workspace_state.task` is a new optional sibling object with this bounded shape:

```json
{
  "version": 1,
  "browser": {
    "items": [],
    "previewUrl": "https://example.com",
    "takeover": null
  },
  "task": {
    "plan": {
      "items": [
        { "id": 1, "label": "Inspect account structure", "status": "done" },
        { "id": 2, "label": "Draft optimization notes", "status": "active" }
      ],
      "currentTaskIndex": 1,
      "totalTasks": 2
    },
    "steps": [
      {
        "id": 0,
        "kind": "tool",
        "label": "bash",
        "detail": "ls -la",
        "toolName": "bash",
        "status": "done",
        "startedAt": 1711111111000,
        "elapsedMs": 320
      }
    ]
  }
}
```

### Validation Rules

- `workspace_state` may contain `browser`, `task`, or both, but must contain at least one supported surface.
- `task.plan.items` reuses the existing task-plan semantics: bounded labels, supported statuses (`pending`, `active`, `done`), and optional one-level children.
- `task.steps` stores bounded structured step history only:
  - `kind`: `thinking`, `tool`, or `writing`
  - `status`: `active` or `done`
  - integer `id`, `startedAt`, and optional `elapsedMs`
  - bounded `label`, optional bounded `detail`, optional bounded `toolName`
- Oversized or malformed task/terminal payloads fail closed with `422` just like malformed browser replay.
- The existing serialized `workspace_state` size cap remains in force for the full envelope, so task/terminal replay must stay bounded rather than storing raw unbounded tool output.

### Persistence Contract

- Backend transcript persistence extends the existing `workspace_state` envelope instead of adding new message columns or a separate replay table.
- Streaming chat persistence derives bounded `task.plan` and `task.steps` from the same successful assistant turn that already produces browser replay state.
- Existing browser-only rows remain valid and readable without migration or rewrite.

### UI Replay Contract

- Historical conversation loads hydrate `taskPlan` and `steps` from `workspace_state.task` before rendering the Agent's Computer panel.
- Task-progress panels and terminal history therefore survive refresh and reopen for completed runs that emitted task/terminal state.
- Conversations without `workspace_state.task` continue to render the documented empty state instead of leaking replay state from another run.

### Out Of Scope For This Slice

- Persisting code-editor tabs, file previews, research workspace state, or productization metadata
- Unbounded stdout/stderr archival or full raw tool transcripts
- Cross-conversation replay aggregation
- Reconstructing task/terminal replay for historical rows that predate this contract

## Implementation Notes

- Extend `ruh-backend/src/validation.ts` and `ruh-backend/src/chatPersistence.ts` for the new `task` envelope branch.
- Keep `ruh-backend/src/conversationStore.ts` as a pass-through for the versioned JSONB payload.
- Update `agent-builder-ui/lib/openclaw/browser-workspace.ts` and `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts` so persisted history hydrates `taskPlan` and `steps` from the shared envelope.
- Do not broaden this slice into new deployed-chat tabs or storage primitives; it is continuity for already-shipped task/terminal UI.

## Test Plan

- Backend unit: `bun test ruh-backend/tests/unit/validation.test.ts ruh-backend/tests/unit/chatPersistence.test.ts ruh-backend/tests/unit/conversationStore.test.ts`
- Frontend unit: `bun test agent-builder-ui/lib/openclaw/browser-workspace.test.ts`
- Operator verification:
  - Run a deployed-agent task that emits a plan plus tool activity, refresh `/agents/[id]/chat`, and confirm the same task-progress and terminal history still render
  - Reopen the same conversation later and confirm the replay remains scoped to that conversation
