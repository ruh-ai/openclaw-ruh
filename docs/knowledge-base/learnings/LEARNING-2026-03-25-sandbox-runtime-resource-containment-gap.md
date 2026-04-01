# LEARNING: Sandbox runtime containment needs explicit Docker resource and hardening defaults

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[003-sandbox-lifecycle]] | [[010-deployment]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the sandbox creation path, deployment notes, and existing backlog were compared after ruling out already-tracked auth, gateway-access, rate-limit, quota, timeout, and lifecycle gaps.

## What Was Learned

- Newly created sandboxes currently inherit near-default Docker runtime settings instead of a documented containment profile.
- `ruh-backend/src/sandboxManager.ts` launches `node:22-bookworm` with `docker run -d --name ... -p 18789 ... tail -f /dev/null` but no CPU, memory, swap, or PID limits.
- The same create path does not add baseline hardening flags such as capability drops, `no-new-privileges`, or a deliberate writable-filesystem contract.
- Existing backlog items protect admission (`TASK-2026-03-25-19`), request volume (`TASK-2026-03-25-42`), timeout enforcement (`TASK-2026-03-25-53`), and downstream gateway auth (`TASK-2026-03-25-49`), but none reduce the blast radius once a sandbox is already running.

## Evidence

- [`ruh-backend/src/sandboxManager.ts`](../../../ruh-backend/src/sandboxManager.ts) creates containers with:
  - `docker run -d`
  - `--name openclaw-<sandbox_id>`
  - `-p 18789`
  - optional env forwarding
  - `node:22-bookworm tail -f /dev/null`
- The checked-in create command includes none of the following classes of guards: `--memory`, `--memory-swap`, `--cpus`, `--pids-limit`, `--cap-drop`, `--security-opt no-new-privileges`, or a documented read-only/tmpfs strategy.
- `docs/knowledge-base/003-sandbox-lifecycle.md` documents the create flow without any resource-budget or privilege-reduction step.
- `docs/knowledge-base/010-deployment.md` documents backend/runtime deployment and sandbox creation prerequisites without a sandbox runtime budget or hardening contract.
- `TODOS.md` already tracks create quotas, rate limiting, Docker timeout enforcement, and gateway hardening, but had no task for per-sandbox runtime containment.

## Implications For Future Agents

- Treat sandbox runtime containment as a separate host-safety boundary from admission quotas or request throttling.
- Do not assume "few containers" is enough protection; even one admitted sandbox can still exhaust host memory, processes, or disk churn without per-container guards.
- When hardening the create path, define the minimum writable directories and privileges OpenClaw actually needs rather than keeping the fully writable default filesystem by accident.

## Links

- [[003-sandbox-lifecycle]]
- [[010-deployment]]
- [[001-architecture]]
- [Journal entry](../../journal/2026-03-25.md)
