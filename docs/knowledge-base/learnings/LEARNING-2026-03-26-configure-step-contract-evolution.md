# LEARNING: The configure-step package closed under a metadata-plus-credential split

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[004-api-reference]] | [[011-key-flows]] | [[SPEC-google-ads-agent-creation-loop]] | [[013-agent-learning-system]]

## Context

During the 2026-03-26 Worker-1 automation run, `TASK-2026-03-25-02` was still marked active even though later Google Ads creation-loop work had already shipped most of the underlying behavior. The remaining gap was not missing persistence primitives, but the lack of one canonical statement that the repo had intentionally moved away from the task's original "raw credentials inside `tool_connections`" sketch.

## What Was Learned

The durable configure-step contract is now split across two layers on purpose:
- `toolConnections[]` and `triggers[]` are the safe, persisted read model that Review, Improve Agent, and Deploy use for readiness and runtime truthfulness.
- Direct connector secrets are stored separately through the encrypted `GET/PUT/DELETE /api/agents/:id/credentials/:toolId` endpoints and are only consumed again during deploy/runtime config application.

That means future work should treat the task as completed even though the final shape differs from the original TODO prose. The important invariant is not "credentials round-trip in the same payload as connector metadata"; it is "operators can save truthful connector/trigger state without exposing secrets in normal reads, and deploy can still recover the secure values it needs."

## Evidence

- `agent-builder-ui/hooks/use-agents-store.ts` persists `toolConnections[]` and `triggers[]` through agent create/config patch calls, while `triggerLabel` is now a compatibility summary derived from structured trigger state.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` keeps pre-save `credentialDrafts` ephemeral, then commits them through `saveToolCredentials()` only after the agent has a real id.
- `ruh-backend/src/app.ts` exposes `GET/PUT/DELETE /api/agents/:id/credentials/:toolId` and returns only summary metadata from `GET /api/agents/:id/credentials`.
- `ruh-backend/src/app.ts` rehydrates saved credentials during `POST /api/sandboxes/:sandbox_id/configure-agent` to write runtime MCP config, while ordinary `GET /api/agents/:id` reads stay free of raw credential blobs.
- `ruh-backend/tests/integration/agentCrud.test.ts` now verifies the real API surface: structured tool/trigger metadata round-trips through `/api/agents`, credential summaries stay secret-free, and the config patch surface keeps the structured contract intact.

## Implications For Future Agents

- Do not add raw credential fields back onto `tool_connections`, `triggers`, or ordinary agent read responses just to make a later UI slice simpler.
- Extend new runtime work, including [[SPEC-agent-webhook-trigger-runtime]], from the persisted `triggers[]` contract rather than from `triggerLabel` or rule-text parsing.
- When closing old TODOs, prefer documenting how the shipped contract evolved instead of forcing the code back toward stale implementation sketches.

## Links

- [[008-agent-builder-ui]]
- [[004-api-reference]]
- [[011-key-flows]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
