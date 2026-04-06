# SPEC: Hermes Goal Task Board

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-hermes-runner-readiness-and-dashboard]] | [[SPEC-competitive-intelligence-learnings]] | [[SPEC-hermes-resettable-task-state]]

## Status

implemented

## Summary

Hermes Mission Control now treats goals as parent initiatives and board tasks as the actual managed work items. A dedicated goal-task board model sits above execution `task_logs`, so operators can see planned work, board status, and which agent actually executed or completed each task instead of confusing raw execution rows with task management.

## Related Notes

- [[012-automation-architecture]] — Hermes analyst/evolution behavior now decomposes goals into board tasks, not just queued execution rows
- [[SPEC-hermes-runner-readiness-and-dashboard]] — the Mission Control shell now extends beyond health/pressure into real goal-board management
- [[SPEC-competitive-intelligence-learnings]] — this ships the first concrete task-board-style planning surface for Hermes, aligned with the earlier multi-worker planning direction
- [[SPEC-hermes-resettable-task-state]] — blank-slate resets must clear goals and board tasks without strategist/analyst repopulating the board on restart

## Specification

- Hermes goals remain the top-level planning object with title, description, acceptance criteria, and goal status
- Hermes now has a dedicated `board_tasks` table with:
  - required `goal_id`
  - board status: `todo`, `in_progress`, `blocked`, `done`
  - priority: `critical`, `high`, `normal`, `low`
  - planned agent, last execution agent, completed-by agent
  - current/latest execution `task_log` linkage
  - blocked reason, source, run count, timestamps
- `task_logs` gain an optional `board_task_id` foreign key so execution runs attach back to the managed board card
- Existing historical `task_logs` that were already linked to goals are backfilled into `board_tasks` as `legacy-*` cards so current goals render on the board immediately after migration
- Goal progress and dashboard summaries should use board-task counts when board tasks exist, with raw execution-task fallback only for older goals with no board cards

### API

- `GET /api/goals/board`
  - Returns goal lanes with nested board tasks and per-lane stats
- `GET /api/goals/:id/board`
  - Returns one goal lane plus its board tasks
- `GET /api/board/tasks`
  - Lists board tasks with filtering by goal/status/agent
- `POST /api/board/tasks`
  - Creates a new board task; `goalId` is required
- `PATCH /api/board/tasks/:id`
  - Updates board task planning/status fields
- `GET /api/board/tasks/:id/logs`
  - Lists execution `task_logs` attached to that board task
- `POST /api/board/tasks/:id/run`
  - Queues a new Hermes execution run from the board task and links the resulting `task_log` back to the card

### Queue And Analyst Integration

- Analyst decomposition now creates goal-linked board tasks first
- Newly created analyst tasks are then queued with `metadata.boardTaskId` so ingestion can attach the execution run to the correct board card
- Duplicate analyst decomposition should reuse an open board task rather than spraying duplicate active work
- Ingestion attaches `task_logs` to board tasks and moves the board card to `in_progress`
- Execution completion synchronizes the board card:
  - `completed` execution -> `done`
  - `failed` execution -> `blocked`
  - `running/pending` execution -> `in_progress`

### Mission Control UI

- `/goals` becomes a Linear-style board surface:
  - one lane per goal
  - columns for `Todo`, `In Progress`, `Blocked`, `Done`
  - inline goal progress, lane pressure, and acceptance-criteria context
  - inline board-task creation per goal
  - run / block / unblock / done / reopen actions on task cards
  - planned agent and completed-by/last-run agent shown on each card
- `/goals/:id` shows board tasks as the goal’s task model and execution runs as supporting evidence/history

## Implementation Notes

- Added `boardTaskState.ts` for canonical board-status mapping and analyst/task fingerprint normalization
- Added `boardTaskStore.ts` plus `boardTaskRoutes.ts`
- Extended `goalRoutes.ts`, `goalStore.ts`, `taskStore.ts`, `sessionStore.ts`, `queueRoutes.ts`, `ingestionWorker.ts`, `executionWorker.ts`, and `analystWorker.ts`
- Updated Mission Control API types and replaced the old goals list/detail UI with the new board-first surfaces

## Test Plan

- Unit test:
  - `bun test ./.claude/hermes-backend/src/boardTaskState.test.ts`
- Backend regression slice:
  - `bun test ./.claude/hermes-backend/src/agentRunner.test.ts ./.claude/hermes-backend/src/queueJobState.test.ts ./.claude/hermes-backend/src/boardTaskState.test.ts ./.claude/hermes-backend/src/workers/subprocess.test.ts`
- Type/build verification:
  - `cd .claude/hermes-backend && bun run typecheck`
  - `cd .claude/hermes-mission-control && npm run build`
- Live verification:
  - restart Hermes backend + Mission Control
  - confirm `GET /api/goals/board`
  - confirm `GET /api/board/tasks`
  - confirm `GET /api/goals/:id/board`
