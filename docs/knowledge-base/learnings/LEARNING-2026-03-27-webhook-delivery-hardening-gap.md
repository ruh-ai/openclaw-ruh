# LEARNING: Public webhook runtime is secret-checked but not replay-safe

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-webhook-trigger-runtime]]

## Context

The repo shipped `webhook-post` as a real runtime-backed trigger on 2026-03-27. The deploy flow now provisions a stable public webhook id plus one-time secret, and `POST /api/triggers/webhooks/:public_id` forwards signed requests into the active sandbox.

## What Was Learned

The shipped v1 route is authenticated by shared secret, but it is not yet hardened against duplicate or replayed signed deliveries. The handler in `ruh-backend/src/app.ts` validates `x-openclaw-webhook-secret`, resolves the target trigger, and immediately forwards `req.body` into the sandbox session with no delivery id, dedupe ledger, or explicit webhook-specific payload-size guard. Future work should extend the shipped contract rather than replacing it ad hoc: keep the existing secret-based route, add a bounded delivery-identity and replay-suppression layer, and document the resulting caller contract clearly.

## Evidence

- `ruh-backend/src/app.ts` `POST /api/triggers/webhooks/:public_id` validates the secret and forwards the request body directly into the sandbox, but does not inspect any delivery id or recent-delivery state before invocation.
- [[SPEC-agent-webhook-trigger-runtime]] documents the shipped v1 shared-secret route and notes that future hardening should extend this contract.
- Current unit coverage in `ruh-backend/tests/unit/agentWebhookApp.test.ts` exercises valid-delivery, invalid-secret, and no-sandbox cases, but not duplicate/replayed delivery or payload-size rejection.

## Implications For Future Agents

- Treat the current webhook runtime as `secret-validated`, not `replay-safe`.
- If you touch the public webhook route, prefer adding delivery-id dedupe, bounded retention, and payload-size limits to the existing endpoint instead of inventing a separate webhook transport.
- Keep the persisted metadata compact and secret-safe: no raw webhook secret, no unbounded payload archive, and no duplicate sandbox invocation for the same external delivery.

## Links
- [[004-api-reference]]
- [[005-data-models]]
- [[SPEC-agent-webhook-trigger-runtime]]
- [Journal entry](../../journal/2026-03-27.md)
