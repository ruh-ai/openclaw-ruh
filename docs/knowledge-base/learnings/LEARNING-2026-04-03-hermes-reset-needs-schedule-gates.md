# LEARNING: Hermes Reset Needs Built-In Schedule Gates

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-hermes-resettable-task-state]]

## Context

While resetting Hermes for a completely new focus area, clearing the database alone was not enough. Hermes restarts its built-in analyst and strategist timers on boot, so a restart-based reset could look empty for a few seconds and then silently repopulate itself with fresh goals.

## What Happened

- Hermes already stored built-in schedule rows with an `enabled` flag in `scheduled_tasks`
- Mission Control could show those rows as disabled, but `WorkerManager._registerAnalystSweep()` and `_registerStrategist()` ignored that persisted flag entirely
- That meant the operator-visible control was truthful for user-defined BullMQ schedules but not for the in-process strategist/analyst timers that matter most for a blank-slate reset

## Durable Insight

- A persisted schedule toggle is only real if every execution path that can fire the schedule consults it
- Stable Hermes resets require disabling the planner schedules before the backend restart, otherwise the restart itself can recreate goals
- Verification has to cross the real bootstrap window, not just the first successful health check

## Applied Fix

- Added `scheduledTaskStore.getScheduledTaskByName()`
- Added `workerManager.shouldRunBuiltInSchedule()`
- Made analyst sweep and strategist timers skip when their built-in schedule row is disabled
- Performed a live reset by disabling those two schedules, unloading Hermes, clearing task/goal operational tables plus BullMQ keys, restarting Hermes, waiting more than 40 seconds, running one smoke task to prove the pool still worked, and then deleting the smoke artifact so the slate stayed empty

## Reuse

- Before claiming Hermes is reset, confirm all three are empty after the bootstrap window:
  - `/api/goals/board`
  - `/api/board/tasks`
  - `/api/tasks`
- If the operator wants a manual fresh start, leave `strategist-assessment` and `analyst-sweep` disabled until they intentionally re-enable autonomy
- Use `/api/queue/health` plus a bounded smoke task as the proof that the pool is healthy after reset, then remove the smoke record if a truly empty slate is required
