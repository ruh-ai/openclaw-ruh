# LEARNING: Backend request validation is still ad hoc

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[002-backend-overview]] | [[004-api-reference]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the backend HTTP boundary was inspected after ruling out already-tracked auth, provisioning, secret-handling, and shell-safety gaps.

## What Was Learned

- `ruh-backend` does not yet have a shared runtime request-schema layer even though it exposes high-risk mutation and proxy routes.
- `ruh-backend/src/app.ts` mounts plain `express.json()` and then several routes either forward `req.body` directly to stores or destructure request fields with only partial checks.
- Existing security coverage focuses on preventing crashes or obvious injection, but it does not establish a consistent fail-fast contract for malformed, unknown, or oversized payloads.
- This is distinct from the existing shell-safety task: even if shell interpolation is fixed, the backend still needs a typed request boundary before persistence, gateway proxying, and future tool/trigger payload work expand the accepted surface.

## Evidence

- `POST /api/agents` calls `agentStore.saveAgent(req.body)` after checking only that `name` exists.
- `PATCH /api/agents/:id/config` forwards `req.body` directly into `updateAgentConfig()` with no schema enforcement for workflow/skill graph shapes.
- `POST /api/sandboxes/:sandbox_id/configure-agent` assumes `skills` and `cron_jobs` arrays have the expected object shape before writing files or cron registrations into the container.
- `POST /api/sandboxes/:sandbox_id/chat` forwards an almost-arbitrary body to the gateway after removing only `conversation_id`.
- `ruh-backend/tests/security/injection.test.ts` explicitly treats many malformed-input cases as acceptable as long as they do not produce a `500`, which is weaker than a deterministic validation contract.

## Implications For Future Agents

- Treat backend request validation as its own boundary, not as a side effect of auth, shell-escaping, or downstream provider behavior.
- Prefer shared schemas and explicit 4xx failures before adding more persisted agent fields, tool payloads, or trigger endpoints.
- When documenting or adding endpoints, specify unknown-field policy and payload-size limits so API docs match runtime behavior.

## Links

- [[002-backend-overview]]
- [[004-api-reference]]
- [[SPEC-backend-request-validation]]
- [Journal entry](../../journal/2026-03-25.md)
