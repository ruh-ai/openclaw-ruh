# LEARNING: Hermes Runner Choice Needs Real Per-Runner Validation

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-hermes-selectable-runner]] | [[SPEC-hermes-runner-readiness-and-dashboard]]

## Context

After restoring Hermes from the launchd `claude` path failure, the next operator need was explicit runner choice between Claude Code and Codex. The critical discovery was that this could not be implemented as a simple "swap the binary path" feature because the two CLIs expose different execution contracts and different failure modes.

## What Happened

- Claude Code runs Hermes cleanly through `--agent`, `-p`, and `--output-format json`
- Codex does not support Claude's `--agent` contract, so Hermes has to wrap the target agent `.md` file into the execution prompt and use `codex exec`
- A local `codex --help` check looked healthy, but real `codex exec` startup still failed because `~/.codex/config.toml` contained remote MCP entries (`figma`, `linear`) without a `command`, which this Codex CLI build rejects at execution time
- That means "binary exists on disk" is not enough to claim that Codex is ready for Hermes

## Durable Insight

- Hermes runner selection must be modeled as runner-specific adapters, not as one generic CLI contract with a different executable path
- Mission Control should surface both the selected runner and per-runner readiness so operators can see why a candidate runner is disabled before they switch
- Codex readiness should fail closed when its local config is known-incompatible with execution startup, otherwise Hermes will look operator-configurable while still failing the moment work is dispatched
- Runtime switching should apply only to new subprocesses; in-flight work should continue under the runner that launched it
- If the operator's main `~/.codex/config.toml` is incompatible with Hermes, the safer fix is a Hermes-specific Codex home plus copied auth state, not a global mutation of the user's primary Codex setup

## Applied Fix

- Added explicit Hermes runner selection with a process-local runtime override and `HERMES_AGENT_RUNNER` as the restart-time default
- Added per-runner health reporting and a Mission Control runner switcher on Dashboard and Queue
- Added a Codex-specific adapter that embeds the selected agent file into the prompt and captures the final message via `--output-last-message`
- Added Codex config validation that blocks selection when MCP server entries are missing `command`
- Added support for `HERMES_CODEX_HOME` so Codex subprocesses can run against a minimal Hermes-owned `.codex` directory with copied auth and a stripped-down config

## Reuse

- If a runner appears installed but Hermes still cannot use it, check whether the failure happens at config-load time rather than path resolution time
- Treat `agentRunner.options[*].available=false` as authoritative for switchability in Mission Control
- If Codex support changes upstream to accept remote `url` MCP entries directly, revisit the Codex validation rule before removing the fail-closed guard
