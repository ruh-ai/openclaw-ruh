# LEARNING: Replay-safe webhook delivery needs a dedicated ledger boundary

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-webhook-trigger-runtime]]

## Context

The public `webhook-post` runtime already exposed a stable webhook URL and one-time shared secret, but the original route had no replay-safe delivery identity contract. The follow-on hardening package on 2026-03-27 added `x-openclaw-delivery-id`, duplicate suppression, and an explicit `64 KiB` payload limit.

## What Was Learned

The durable replay ledger should live in its own backend table instead of `agents.triggers`. Public webhook delivery ids are operator- or vendor-supplied identifiers, not stable agent metadata, so storing them alongside trigger config would leak replay-sensitive request history through normal agent reads and make trigger JSON grow without a clean retention boundary. A dedicated `webhook_delivery_dedupes` table lets the backend reserve `{ public_id, delivery_id }` atomically before sandbox invocation, update the outcome to `delivered` or `failed`, and prune old rows independently of the agent config model.

## Evidence

- `ruh-backend/src/app.ts` now requires `x-openclaw-delivery-id`, rejects oversized payloads before sandbox delivery, and reserves the `{ public_id, delivery_id }` pair before calling the sandbox gateway.
- `ruh-backend/src/webhookDeliveryStore.ts` implements atomic reserve/update behavior on `webhook_delivery_dedupes`.
- `ruh-backend/src/schemaMigrations.ts` migration `0012_webhook_delivery_dedupes` creates the bounded replay ledger table and indexes.
- `ruh-backend/tests/unit/agentWebhookApp.test.ts` now proves first-delivery success, duplicate rejection, missing delivery id rejection, and payload-size rejection.

## Implications For Future Agents

- Extend the public webhook contract by adding fields or headers around the existing secret-plus-delivery-id path instead of inventing a separate dedupe mechanism in `agents.triggers`.
- Keep replay state compact and backend-only; expose only safe last-delivery metadata on triggers unless there is a strong operator need for more.
- If webhook providers need longer retention windows or richer audit history later, add that explicitly to the dedicated ledger or audit layer rather than stuffing request history into agent config JSON.

## Links

- [[004-api-reference]]
- [[005-data-models]]
- [[011-key-flows]]
- [[SPEC-agent-webhook-trigger-runtime]]
- [Journal entry](../../journal/2026-03-27.md)
