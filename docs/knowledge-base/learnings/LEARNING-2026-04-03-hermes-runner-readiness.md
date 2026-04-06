# LEARNING: Hermes Runner Readiness Must Not Depend On Shell PATH

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-hermes-runner-readiness-and-dashboard]]

## Context

While investigating why Hermes looked idle even though active goals existed, the live backend showed that the analyst sweep was firing and active goals were being enqueued. The actual failure was deeper: the launchd-hosted Hermes backend repeatedly failed to spawn its worker subprocesses because it could not resolve the hardcoded `claude` executable from its environment.

## What Happened

- `/tmp/hermes-backend.err` showed repeated `Executable not found in $PATH: "claude"` errors for analyst, strategist, factory, and evolution jobs
- `WorkerManager._registerAnalystSweep()` was still running, so goals were not "missing" from the system
- Mission Control looked superficially live because Redis and workers were up, but it did not surface runner readiness, so operators saw an apparently healthy orchestrator that was in fact blocked at the subprocess boundary
- Queue counts were also misleading because `queue_jobs` could remain marked `active` even after linked task logs had already failed or been auto-cleaned

## Durable Insight

- Hermes runner resolution must not rely only on `PATH` when the backend runs under launchd or similar non-shell environments
- The backend should resolve `CLAUDE_CLI_PATH` first, then fallback to common absolute user-local install paths before declaring the runner unavailable
- Mission Control should always surface runner readiness as a first-class operator signal so "workers are alive" is not confused with "agents can actually execute"
- Queue/dashboard views should derive effective queue state from linked task outcomes so stale execution rows do not inflate the appearance of live work

## Applied Fix

- Added backend runner-resolution logic that falls back to user-local absolute `claude` paths and exposes the resolved runner state through `/api/queue/health`
- Updated Mission Control to foreground blocked-state diagnosis, active goals, and effective queue pressure
- Updated queue-job status derivation so stale active rows are presented as failed/completed when the linked task log has already terminated

## Reuse

- If Hermes appears idle but goals exist, check `/api/queue/health` and `/tmp/hermes-backend.err` before assuming the sweeps are broken
- Treat `agentRunner.available=false` as a hard orchestration blocker even if Redis and workers still show healthy
