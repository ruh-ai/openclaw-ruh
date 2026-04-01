# LEARNING: Browser-only replay leaves a task-plan and terminal continuity gap

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[013-agent-learning-system]]

## Context

The active `docs/project-focus.md` still prioritizes Manus-style deployed-agent workspace parity and durable task continuity on `/agents/[id]/chat`. After TASK-2026-03-26-91 and TASK-2026-03-26-92 shipped, the repo needed another pass to see whether the new workspace surfaces actually survive refresh and historical reopen or whether browser replay was the only persisted slice.

## What Was Learned

The highest-value remaining focus-aligned gap is not another new workspace tab. It is continuity for the task-mode and terminal/process surfaces that already exist live.

Current repo evidence:

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx:mapPersistedMessageToChatMessage()` only extracts `browserState` from persisted `workspace_state`.
- The same file's `ComputerView` renders historical terminal rows from `messages.flatMap(m => m.steps ?? [])` and task progress from `message.taskPlan`, but those fields are never hydrated from backend conversation reads.
- TASK-2026-03-26-92 added visible task-plan parsing, progress UI, and code/file breadcrumbs during live runs, yet that operator context still disappears after reload because only the browser slice was added to persistence.
- [[SPEC-deployed-chat-workspace-history]] explicitly scoped the first shipped replay contract to browser history and left terminal/process replay out of scope.

## Evidence

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`
- `docs/project-focus.md`
- [[SPEC-deployed-chat-workspace-history]]
- TASK-2026-03-26-91 and TASK-2026-03-26-92 in `TODOS.md`

## Implications For Future Agents

- Treat the next continuity package as replay for already-shipped task-plan and terminal/process surfaces, not as a duplicate of the live process-state task and not as another new workspace category.
- Extend the existing versioned `workspace_state` envelope instead of inventing a second persistence store for task replay.
- Keep the first slice bounded: task-plan state, terminal/process history, and minimal file-open breadcrumbs are in scope; unbounded raw tool logs, full research bundles, and product analytics replay are not.
- Preserve backward compatibility with browser-only persisted history so older conversation rows keep loading cleanly while new runs capture richer continuity.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-deployed-chat-workspace-history]]
- [[SPEC-analyst-project-focus]]
- [[SPEC-feature-at-a-time-automation-contract]]
- [Journal entry](../../journal/2026-03-26.md)
