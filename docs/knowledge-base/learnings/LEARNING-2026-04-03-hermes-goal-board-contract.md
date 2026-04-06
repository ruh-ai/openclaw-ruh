# LEARNING: Hermes Goals Need A Task Board Layer Above Execution Logs

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-hermes-goal-task-board]]

## Context

Mission Control already had goals and execution `task_logs`, but it was still using execution rows as if they were task management. That made the goals surface look like a dashboard of past/running work instead of a planning board that could move a project forward.

## What Happened

- Goals had `goal_id` linkage into `task_logs`, but there was no first-class task object for planning, assignment, or board status
- Analyst decomposition created queued execution work directly, so repeated analysis could only reason about raw logs instead of a stable task board
- The UI could show goal progress and linked execution rows, but it could not clearly answer:
  - what is the planned task inventory for this goal?
  - which tasks are blocked vs merely failed once?
  - which agent was expected to handle the task?
  - which agent actually completed it?

## Durable Insight

- Execution logs are evidence, not the task model
- Hermes needs a dedicated goal-task board layer so goals become parent initiatives and task cards become the managed work unit
- The right relationship is:
  - goal -> board task(s)
  - board task -> execution run(s)
- Analyst decomposition should create board tasks first and only then queue execution runs from those cards

## Applied Fix

- Added `board_tasks` plus `task_logs.board_task_id`
- Backfilled existing goal-linked execution rows into legacy board cards so current goals render immediately
- Updated analyst, ingestion, and execution flows so board-task status and agent attribution stay synchronized with real runs
- Replaced the Mission Control goals list with a lane-based goal board and updated goal detail to separate board tasks from execution history

## Reuse

- If a Hermes planning surface needs to answer "what should happen next?", use board tasks, not raw `task_logs`
- If a Hermes audit surface needs to answer "what actually ran?", use `task_logs` linked to `board_task_id`
- For future worker/evolution work, preserve the separation between planning cards and execution evidence instead of collapsing them back together
