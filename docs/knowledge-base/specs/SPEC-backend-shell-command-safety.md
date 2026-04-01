# SPEC: Backend Shell Command Safety

[[000-INDEX|← Index]] | [[002-backend-overview]] | [[004-api-reference]]

## Status
`implemented`

## Summary
`ruh-backend` currently sends several user-influenced operations through `docker exec ... bash -c <string>`, which means route fields can become shell syntax if they are interpolated directly. This spec defines one shared command-construction contract so backend routes treat user-controlled values as literal data, not executable shell fragments, while keeping the first implementation slice bounded to `configure-agent` and cron mutation routes.

## Related Notes
- [[002-backend-overview]] — defines where backend routes should get their command-building helpers and how future endpoints must invoke Docker safely
- [[004-api-reference]] — must document which route fields are treated as literal args and any normalization or rejection rules that affect callers

## Specification

### Goals

1. Establish one backend-owned safe path for invoking shell-backed commands inside sandbox containers.
2. Eliminate ad hoc interpolation of user-controlled route fields into `bash -c` command strings for the first high-risk slice.
3. Keep ordinary agent-config and cron flows working while making malicious input stay literal.
4. Give future route work one documented contract that is safer than manual string concatenation.

### Non-goals

- Removing `bash -c` from every sandbox command in one pass
- Rewriting long-running provisioning scripts in [[003-sandbox-lifecycle]]
- Introducing a full command-policy engine or per-route allowlist beyond the bounded helper contract

### Shared shell-safety contract

#### Preferred invocation shape

- Backend code should prefer building a command from audited pieces instead of concatenating raw shell fragments inline in route handlers.
- When a command must still execute via `bash -c`, every opaque argument must pass through one shared quoting helper before it reaches the command string.
- Route handlers should assemble commands from literals plus quoted opaque values; they should not embed request fields directly inside shell syntax.

#### Opaque user-controlled inputs

The following values must be treated as opaque data and never as shell syntax:

- `skill.skill_id`
- `skill.name`
- `skill.description`
- `soul_content`
- cron `name`
- cron `schedule` fields
- cron `payload` text/message fields
- cron `job_id`
- `session_target`
- `wake_mode`
- other route fields derived from `req.body`, `req.params`, or `req.query`

#### Quoting rule

- The shared helper must emit a single shell-safe token for any arbitrary string, including `'`, `"`, backticks, `$()`, semicolons, ampersands, pipes, newlines, tabs, spaces, and glob characters.
- The helper must preserve literal semantics: when the shell receives the token, the target process sees the original string value.
- Route code may still append fixed redirections such as `2>&1`, but those shell operators must remain backend-authored literals outside quoted opaque values.

### Path handling contract

- `skill_id` is not only a command argument; it is also used as a directory segment under `~/.openclaw/workspace/skills/`.
- The first implementation slice must normalize `skill_id` into a bounded safe path segment before it is used in filesystem paths.
- Normalization should trim whitespace, reject empty output, collapse unsupported characters to `-`, and disallow path traversal or nested path separators.
- The API should still write the skill content using the normalized directory, and the response should report the effective identifier that was written when normalization changes it.

### First implementation slice

#### `POST /api/sandboxes/:sandbox_id/configure-agent`

The first slice must harden:

- SOUL file writes
- skill file writes
- cron registration during configure-agent

Contract details:

- SOUL and skill file content must be written through a helper that quotes the payload safely instead of route-local replacement logic.
- Skill directory creation must use the normalized `skill_id` path segment.
- Cron registration must quote cron names, schedules, and messages as literal arguments.
- The route must not return success for a skill or cron step that only succeeded because the shell reinterpreted malformed input.

#### Cron mutation routes

The first slice must harden:

- `POST /api/sandboxes/:sandbox_id/crons`
- `DELETE /api/sandboxes/:sandbox_id/crons/:job_id`
- `POST /api/sandboxes/:sandbox_id/crons/:job_id/toggle`
- `PATCH /api/sandboxes/:sandbox_id/crons/:job_id`
- `POST /api/sandboxes/:sandbox_id/crons/:job_id/run`
- `GET /api/sandboxes/:sandbox_id/crons/:job_id/runs`

Contract details:

- `job_id`, cron names, schedule values, payload text, `session_target`, `wake_mode`, and `description` must reach OpenClaw as literal args.
- Route code must keep shell-authored subcommands such as `disable` versus `enable` separate from opaque values.
- Mutating routes should continue to append `2>&1` as a backend-authored operator where needed, but must not concatenate quoted and unquoted user input into the same fragment.

### Helper API expectations

- The shared helper should live in `ruh-backend/src/docker.ts` or a dedicated helper module imported by it.
- The helper API should make safe construction easier than manual interpolation. A small API such as `shellQuote(value)` plus `joinShellArgs(args)` or a similar builder is sufficient for the first slice.
- Existing helpers such as `sandboxExec()` and direct `dockerExec()` callers should be able to adopt the safe path without broad signature churn.

### Future-route rule

- New or modified backend routes that call `dockerExec()` or `sandboxExec()` must use the shared safe-construction helper for every opaque value.
- If a future route cannot use the helper, the code must document why and add focused tests proving the alternate path is safe.

## Implementation Notes

- Primary code surface: `ruh-backend/src/docker.ts` and `ruh-backend/src/app.ts`
- `channelManager.ts` already carries route-adjacent escaping logic; future cleanup should move that area onto the same shared helper after the first route slice lands
- [[004-api-reference]] should document `skill_id` normalization and the literal-argument handling for cron mutations once implemented
- [[002-backend-overview]] should direct new endpoint work to the shared safe-construction helper instead of ad hoc string assembly

## Test Plan

- Add unit tests for the quoting helper covering quotes, command substitution syntax, semicolons, pipes, backticks, spaces, and newlines
- Add unit tests for `skill_id` normalization that reject or rewrite path traversal and nested separators
- Add focused security tests that capture the exact command string passed to the execution layer for `configure-agent` and representative cron mutations
- Verify at least one benign `configure-agent` / cron flow still emits the expected command shape after hardening
