# OpenClaw Codex Task Loop

## Purpose

This document defines the production path for a single-worker autonomous development loop that runs on a GCP VM, polls Linear every 5 minutes through OpenClaw cron, executes coding work locally with Codex using GPT-5.4, pushes commits, opens pull requests, and updates Linear issue state as work progresses.

## Scope

- One GCP VM hosts the automation runtime.
- One OpenClaw workflow owns the schedule.
- One active Linear issue may be worked at a time.
- Only issues labeled `codex` are eligible for automated pickup.
- The worker may move issues through `Started`, `In Review`, and `Done`.

## Systems Of Record

- Linear is the system of record for work state.
- GitHub is the system of record for branches, commits, pull requests, and merge status.
- The VM keeps only local execution state needed for recovery.

## Scheduling Model

- OpenClaw cron triggers the dispatcher every 5 minutes.
- The dispatcher checks for an active lease first.
- If a lease exists, the dispatcher resumes or finalizes the leased task.
- If no lease exists, the dispatcher selects the next eligible issue.

## Eligibility Rules

An issue is eligible only when all of the following are true:

- It belongs to the `openclaw-ruh` project.
- It has the `codex` label.
- Its state is `Todo` or `Backlog`.
- It is not already leased by the worker.
- It is not blocked by known unresolved dependencies.

## Runtime Flow

1. Query Linear for eligible `codex` issues.
2. Select the highest-priority unblocked issue.
3. Move the issue to `Started`.
4. Record a lease locally and add a Linear comment with run metadata.
5. Create or reuse the issue branch.
6. Run Codex locally against the repo checkout with GPT-5.4.
7. Run required verification commands.
8. Commit and push changes.
9. Create or update a GitHub pull request.
10. Move the issue to `In Review`.
11. On later polls, detect merge completion and move the issue to `Done`.

## Lease Rules

- Exactly one active lease exists in v1.
- Lease metadata includes issue id, branch name, run id, timestamps, hostname, and retry count.
- The lease must be renewed during long-running execution.
- If the lease becomes stale and no active worker process is present, the next cron tick may reclaim it.

## Recovery Rules

- If the VM restarts mid-run, the next tick inspects local state, branch state, PR state, and Linear comments.
- If the state is consistent, the worker resumes the task.
- If the state is inconsistent, the worker marks the issue `Blocked` with a concrete operator note.

## Status Transition Rules

- `Todo` or `Backlog` to `Started` on successful pickup.
- `Started` to `In Review` after verification passes and a PR exists.
- `In Review` to `Done` after merge is confirmed.
- Any active state to `Blocked` when a non-recoverable prerequisite or repeated failure prevents progress.

## Credentials

The VM must have access to:

- Linear credentials or API token
- GitHub token for push and pull request operations
- Provider credentials for Codex GPT-5.4 execution
- OpenClaw service configuration and secrets

Store secrets outside the repo. Use a VM-owned env file or GCP Secret Manager integration.

## Operator Expectations

- Keep the repo checkout clean between tasks.
- Use task-specific branches.
- Prefer exact blocker comments instead of silent retries when a task cannot move forward.
- Keep OpenClaw admin surfaces private behind trusted access controls.

## Minimum Verification

Every task run must report:

- selected issue id
- branch name
- verification commands executed
- verification result
- commit SHA if changes were committed
- PR URL if a PR was created or updated

## Deployment Assets

The repo includes starter GCP host assets for this loop:

- `ops/gcp/openclaw-codex-loop.env.example`
- `ops/gcp/openclaw-codex-loop.config.example.jsonc`
- `ops/gcp/openclaw-codex-loop.service`
- `ops/gcp/openclaw-codex-loop.timer`
- `ops/gcp/openclaw-codex-loop-openclaw.md`

## Future Extensions

- Parallel workers with isolated worktrees
- Queue-backed scheduling instead of cron polling
- Per-task verification profiles
- Slack notifications for blocked or completed runs
