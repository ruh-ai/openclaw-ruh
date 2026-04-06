# SPEC: Hermes Resettable Task State

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-hermes-goal-task-board]] | [[SPEC-hermes-runner-readiness-and-dashboard]]

## Status

implemented

## Summary

Hermes operators need a way to clear the current task and goal slate without the system auto-recreating fresh goals on the next backend restart. Built-in strategist and analyst timers now honor the persisted `scheduled_tasks.enabled` flag, which makes a blank-slate reset stable while keeping the worker pool and runner healthy for fresh manual work.

## Related Notes

- [[012-automation-architecture]] — Hermes scheduled behavior and operator controls live here
- [[SPEC-hermes-goal-task-board]] — resetting work state must clear both goals and board tasks cleanly
- [[SPEC-hermes-runner-readiness-and-dashboard]] — queue health is the operator proof that Hermes still runs after reset

## Specification

- Built-in schedules `strategist-assessment` and `analyst-sweep` must read `scheduled_tasks.enabled` before each timed run.
- If a built-in schedule row is missing, Hermes defaults that schedule to enabled so startup behavior fails open instead of silently disabling autonomy.
- A stable operator reset follows this order:
  - disable `strategist-assessment` and `analyst-sweep`
  - stop Hermes backend cleanly so active subprocesses drain or are killed through the normal shutdown path
  - clear task/goal operational tables: `goals`, `board_tasks`, `task_logs`, `queue_jobs`, `sessions`, `agent_scores`, `evolution_reports`, `refinements`, `worker_status`
  - reset agent task counters and circuit-breaker state
  - reset scheduled-task run counters/timestamps
  - clear Hermes BullMQ Redis keys (`bull:*`)
  - restart Hermes backend
  - verify `/api/goals/board`, `/api/board/tasks`, and `/api/tasks` are empty after the normal 10s/30s bootstrap window
- Reset preserves:
  - `agents`
  - `worker_pool_config`
  - runner selection/default runner configuration
  - scheduled task definitions themselves
  - `memories` unless the operator explicitly asks for a deeper memory wipe
- After reset, `/api/queue/health` must still show:
  - Redis connected
  - workers running
  - zero active subprocesses
  - an available selected runner

## Implementation Notes

- Added `getScheduledTaskByName()` to `scheduledTaskStore.ts`
- Added `shouldRunBuiltInSchedule()` to `workerManager.ts`
- Analyst sweep and strategist timers now skip when their persisted built-in schedule row is disabled
- Live operator reset used the existing `/api/schedules/:id` API for disabling planner schedules, then `launchctl`, `docker exec ... psql`, and `redis-cli` for the state wipe

## Test Plan

- Unit test:
  - `bun test ./.claude/hermes-backend/src/workers/workerManager.test.ts`
- Typecheck:
  - `cd .claude/hermes-backend && bun run typecheck`
- Live verification:
  - disable `strategist-assessment` and `analyst-sweep`
  - restart Hermes backend
  - wait past the 10s/30s bootstrap timers
  - confirm `/api/goals/board`, `/api/board/tasks`, and `/api/tasks` stay empty
  - confirm `/api/queue/health` reports a healthy pool
  - run one bounded smoke task through the queue, confirm completion, then remove that verification artifact so the blank slate remains blank
