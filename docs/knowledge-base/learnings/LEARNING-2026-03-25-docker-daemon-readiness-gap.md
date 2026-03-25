# LEARNING: Backend readiness currently ignores the Docker daemon dependency

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[002-backend-overview]] | [[003-sandbox-lifecycle]] | [[010-deployment]]

## Context

While reviewing the repo for the next highest-leverage missing backlog item, the backend startup/readiness code was compared against the live Docker-backed control-plane routes and the deployment documentation after ruling out already-tracked auth, logging, timeout, and sandbox-hardening gaps.

## What Was Learned

- The backend's current readiness contract is database-only even though the product's core control-plane behavior depends on Docker.
- `ruh-backend/src/startup.ts` initializes Postgres-backed stores and starts listening without probing whether Docker is installed, reachable, or permissioned correctly.
- `ruh-backend/src/app.ts` serves `GET /health` as unconditional success and `GET /ready` from a process-local boolean, so both endpoints can report a healthy backend while Docker-backed routes are already guaranteed to fail.
- Sandbox creation, cleanup, retrofit, LLM reconfiguration, configure-agent, cron routes, channel routes, and pairing approval all depend on `dockerSpawn()` or `dockerExec()`.
- Existing backlog items cover DB readiness, Docker timeout enforcement, structured logging, and sandbox runtime drift, but none make Docker availability part of startup or readiness semantics.

## Evidence

- [`ruh-backend/src/startup.ts`](../../../ruh-backend/src/startup.ts) calls `initPool()`, store init functions, and `listen()` with no Docker probe.
- [`ruh-backend/src/app.ts`](../../../ruh-backend/src/app.ts) exposes:
  - `GET /health` → `{ status: 'ok' }`
  - `GET /ready` → current `backendReadiness` state only
- [`ruh-backend/src/sandboxManager.ts`](../../../ruh-backend/src/sandboxManager.ts) uses Docker for sandbox create, cleanup, shared-Codex retrofit, and LLM reconfigure.
- [`ruh-backend/src/app.ts`](../../../ruh-backend/src/app.ts) routes configure-agent, cron management, channels, and pairing approval through Docker-backed helpers.
- [`docs/knowledge-base/010-deployment.md`](../010-deployment.md) lists Docker as a prerequisite but documents runtime checks only in terms of `/health` and DB-backed `/ready`.

## Implications For Future Agents

- Treat Docker as a first-class backend dependency, not just an implementation detail of sandbox routes.
- Do not assume "backend ready" means the control plane can actually create or manage sandboxes until Docker is part of the readiness contract.
- Keep Docker dependency-health work separate from logging/timeout work: observability can report dependency status, but it does not define when startup or routes should fail closed.

## Links

- [[002-backend-overview]]
- [[003-sandbox-lifecycle]]
- [[010-deployment]]
- [Journal entry](../../journal/2026-03-25.md)
