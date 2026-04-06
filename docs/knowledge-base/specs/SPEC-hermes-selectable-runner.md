# SPEC: Hermes Selectable Runner

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-hermes-runner-readiness-and-dashboard]]

## Status

implemented

## Summary

Hermes must be able to run agent work through either Claude Code or Codex instead of assuming a single CLI forever. The backend needs an explicit runner selection model, runner-specific subprocess invocation, truthful readiness reporting per runner, and Mission Control controls that let operators switch runners intentionally.

## Related Notes

- [[012-automation-architecture]] — Hermes automation depends on a truthful, operator-controlled execution runner
- [[SPEC-hermes-runner-readiness-and-dashboard]] — existing runner-readiness work is extended so readiness covers both selection and spawn behavior

## Specification

- Hermes supports two execution runners: `claude` and `codex`
- Hermes chooses a selected runner from:
  - a runtime override set through the API
  - otherwise `HERMES_AGENT_RUNNER`
  - otherwise the default `claude`
- Hermes may use a dedicated Codex home via `HERMES_CODEX_HOME` so Codex subprocesses can run with a Hermes-specific `~/.codex` config/auth bundle instead of the operator's primary Codex config
- Runner readiness must be reported for both supported runners, not only the selected one
- The selected runner health must include:
  - selected runner kind
  - resolved binary path
  - resolution source
  - availability/error state
- Runner selection must be visible in Mission Control and switchable without editing source code
- Claude Code and Codex must use separate subprocess adapters:
  - Claude continues to use `--agent`, `--print`, and structured output mode
  - Codex runs non-interactively with `codex exec` and receives the target agent contract embedded into the prompt because it does not support Claude's `--agent` flag
- Codex readiness must fail closed when its local configuration is known-bad for execution startup, so operators do not switch into a runner that cannot start

## Implementation Notes

- Backend runner selection now lives in a dedicated runner helper instead of the general config object
- `PATCH /api/queue/runner` sets the runtime runner override and rejects unavailable targets fail-closed
- Queue health now returns the selected runner plus availability for both supported runners so Mission Control can render a truthful switcher
- Codex execution uses a dedicated adapter that wraps the target agent file into the prompt and runs `codex exec` with captured final-message output
- Runtime selection is currently process-local; restart-time defaults still come from `HERMES_AGENT_RUNNER`
- Codex subprocesses now inherit `HOME=$HERMES_CODEX_HOME` when that variable is set, which allows a minimal Hermes-safe Codex config without mutating the user's primary `~/.codex/config.toml`

## Test Plan

- Unit tests cover runner selection precedence and runner-specific validation
- Unit tests cover Claude and Codex subprocess command construction
- Manual verification covers:
  - switching between Claude Code and Codex in Mission Control
  - queue health reflecting the selected runner and per-runner availability
  - Hermes execution using the selected runner for new tasks
