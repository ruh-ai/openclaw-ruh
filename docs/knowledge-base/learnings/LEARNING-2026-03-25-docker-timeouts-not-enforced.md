# LEARNING: Backend Docker timeout budgets are currently advisory only

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[002-backend-overview]] | [[003-sandbox-lifecycle]] | [[006-channel-manager]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the backend's documented timeout-bearing Docker helpers were compared against their live implementation and the routes/lifecycle flows that depend on them.

## What Was Learned

- The backend passes explicit timeout budgets through many Docker-backed flows, but the low-level helper layer never enforces them.
- `ruh-backend/src/docker.ts` defines `_timeoutMs` parameters on both `dockerSpawn()` and `dockerExec()`, yet both functions simply wait for `proc.exited` after reading stdout/stderr and never start a timer, abort the subprocess, or return a timeout-specific error.
- Because `sandboxExec()` in `ruh-backend/src/app.ts` and the `run()` helper in `ruh-backend/src/sandboxManager.ts` rely on those helpers, hung Docker/OpenClaw subprocesses can wedge sandbox creation, config apply, cron mutation, channel operations, retrofit, and cleanup flows indefinitely.
- The KB currently describes those operations as if the helper timeouts are real, so there is a non-obvious mismatch between the documented runtime contract and the actual code.

## Evidence

- `ruh-backend/src/docker.ts`
  - `dockerSpawn(args, _timeoutMs = 60_000)` ignores `_timeoutMs`
  - `dockerExec(containerName, cmd, _timeoutMs = 60_000)` ignores `_timeoutMs`
- `ruh-backend/src/app.ts`
  - `sandboxExec(sandboxId, cmd, timeoutSec)` passes timeout budgets into `dockerExec()` for `configure-agent`, cron routes, pairing approval, and channel routes.
- `ruh-backend/src/sandboxManager.ts`
  - The sandbox lifecycle passes explicit budgets such as 10s, 15s, 30s, 120s, and 600s into Docker operations during create, restart, retrofit, probe, and cleanup paths.
- `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/003-sandbox-lifecycle.md`, and `docs/knowledge-base/006-channel-manager.md`
  - These notes all describe Docker-backed operations in terms of timeout-aware helpers, even though the current helper implementation does not honor those deadlines.
- `TODOS.md`
  - Existing active tasks cover readiness, provisioning durability, runtime drift, shell safety, truthful apply semantics, auth, and rate limiting, but there was no task for the missing Docker timeout enforcement itself.

## Implications For Future Agents

- Treat every current Docker timeout in the backend as aspirational until the helper layer is fixed; route-level or lifecycle-level time budgets are not meaningful today.
- Fix timeout behavior once in `ruh-backend/src/docker.ts` instead of scattering ad hoc timers across each route or lifecycle helper.
- When designing recovery for sandbox create, cleanup, channel saves, or cron mutations, account for timed-out subprocesses explicitly rather than assuming a non-zero exit code will arrive.

## Links

- [[002-backend-overview]]
- [[003-sandbox-lifecycle]]
- [[006-channel-manager]]
- [Journal entry](../../journal/2026-03-25.md)
