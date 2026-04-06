# SPEC: Hermes Runner Readiness And Mission Control Dashboard

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-hermes-selectable-runner]]

## Status

implemented

## Summary

Hermes must make blocked orchestration state explicit instead of looking "live" while agent subprocess spawning is broken. The backend now resolves the Claude CLI path more robustly for launchd-style environments, exposes runner readiness to Mission Control, and the dashboard foregrounds active goals, blocked-state diagnosis, and effective queue pressure.

## Related Notes

- [[012-automation-architecture]] — Hermes automations and recurring goal sweeps depend on a working agent runner and visible operator feedback
- [[SPEC-hermes-selectable-runner]] — extends runner readiness into explicit runner choice, per-runner validation, and Mission Control switching

## Specification

- Hermes backend must not rely solely on a shell-provided `PATH` entry for `claude`; it should resolve the configured runner path, then fallback to common absolute install locations for the current user before declaring the runner unavailable
- Queue and dashboard health responses must expose runner readiness with enough detail for operators to distinguish "workers are up" from "workers can actually spawn agents"
- Mission Control dashboard must foreground:
  - active goals and their progress
  - runner/Redis/worker readiness
  - a blocked banner when orchestration is degraded
  - effective queue pressure instead of stale "active" counts
- Queue/job listings and aggregate stats should derive an effective status from linked task outcomes so auto-cleaned or already-failed work is not still presented as active

## Implementation Notes

- Hermes backend resolves runner readiness in a dedicated helper and returns that signal through queue health
- Mission Control consumes the new readiness signal and renders a hybrid "living control room" dashboard with a stronger shell, operator hero, active-goal focus, and richer status cards
- Queue status calculations now derive from queue-job plus task-log state to avoid stale active counts in the UI

## Test Plan

- Unit tests cover runner-path resolution fallback behavior and effective queue-job status derivation
- Manual verification:
  - restart Hermes backend under launchd-style environment conditions
  - confirm `/api/queue/health` reports runner readiness truthfully
  - confirm active goals appear on the dashboard
  - confirm blocked-state banner appears when runner resolution fails and clears when it succeeds
