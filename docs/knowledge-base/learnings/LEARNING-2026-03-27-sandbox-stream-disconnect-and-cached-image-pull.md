# LEARNING: Sandbox Create Must Survive Stream Disconnects And Respect Cached Base Images

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-sandbox-bootstrap-config-apply-contract]]

## Context

While retrying the real `Simple Helper Agent` deploy on `http://localhost:3001`, the earlier bootstrap-verification fix worked, but the live deploy still failed in two different ways before the sandbox could attach.

## What Was Learned

- The sandbox-create SSE routes in `ruh-backend/src/app.ts` were still treating the client socket as part of the provisioning control path. A dropped browser stream caused `res.write(...)` to throw, which unwound the `for await` loop consuming `createOpenclawSandbox()` and left a partially built container with no persisted sandbox record.
- Repeated local deploys should not force `docker pull node:22-bookworm` when the base image is already cached. On this host, fresh retries got stuck in multiple long-running `docker pull` subprocesses even though `node:22-bookworm` was already present locally.

## Evidence

- The failed live retry left a running container with OpenClaw and the browser stack installed but no `~/.openclaw` onboarding state and no row in `GET /api/sandboxes`, which is the signature of the stream consumer aborting before `result`.
- `ruh-backend/tests/e2e/sandboxCreate.test.ts` now has a regression that disconnects the SSE client after the first `log` chunk and still verifies `saveSandbox()` runs and the stream entry reaches `done`.
- `ruh-backend/tests/unit/sandboxManager.test.ts` now proves cached local images skip the `pull` call while a missing image still triggers it.
- After both fixes, a real browser deploy succeeded and attached sandbox `6434ea68-44bb-4d77-a2a1-abe2aebdd396` to agent `3d72095d-8077-46e6-9085-354dcec75ab5`.

## Implications For Future Agents

- Treat sandbox-create SSE as a transport layer only. Provisioning must keep running after a client disconnect so UI recovery logic can find the sandbox record later.
- When debugging deploys on local hosts, check whether the base Docker image is already cached before assuming a `docker pull` step is necessary or healthy.
- The repo still has a broader timeout debt in `dockerSpawn()` / `dockerExec()`; this fix avoids the common cached-image stall but does not replace true timeout enforcement. See [[LEARNING-2026-03-25-docker-timeouts-not-enforced]].

## Links

- [[003-sandbox-lifecycle]]
- [[004-api-reference]]
- [[SPEC-sandbox-bootstrap-config-apply-contract]]
- [[LEARNING-2026-03-25-docker-timeouts-not-enforced]]
- [Journal entry](../../journal/2026-03-27.md)
