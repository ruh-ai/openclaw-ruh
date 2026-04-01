# LEARNING: Webhook trigger provisioning must separate deploy-time reveal from public read models

[[000-INDEX|← Index]] | [[004-api-reference]] | [[005-data-models]] | [[008-agent-builder-ui]] | [[SPEC-agent-webhook-trigger-runtime]] | [[013-agent-learning-system]]

## Context

Worker-1 completed the v1 signed webhook trigger runtime for deployed agents. The repo already had persisted `triggers[]` plus a truthful trigger catalog, but it did not yet have a secure way to provision webhook secrets without leaking them back through normal agent reads.

## What changed

- `POST /api/sandboxes/:sandbox_id/configure-agent` now provisions supported `webhook-post` triggers with a stable public webhook id and a one-time shared secret.
- The persisted trigger record keeps only safe public metadata plus a hashed verifier: `webhookPublicId`, `webhookSecretLastFour`, `webhookSecretIssuedAt`, and last-delivery fields are public; `webhookSecretHash` stays backend-only.
- `POST /api/triggers/webhooks/:public_id` validates `x-openclaw-webhook-secret` against that stored hash before forwarding the payload into the active sandbox.

## Why it matters

- Deploy needs one place to reveal the full secret so operators can wire external systems immediately.
- Later reads of `/api/agents` and `/api/agents/:id` must stay safe for normal browser use and must not echo verifier material.
- Keeping both concerns in the same `triggers[]` contract avoids inventing a parallel webhook table or a second frontend trigger model for v1.

## Reusable guidance

- Treat deploy-time secret reveal as an ephemeral config-apply response, not as ordinary saved agent state.
- If future work adds HMAC signatures, secret rotation, or delivery history, extend the same trigger record/read-model split instead of bypassing it with ad hoc fields elsewhere.
- Any route that returns persisted agent records must continue to redact backend-only webhook verifier fields.

## Related Notes

- [[SPEC-agent-webhook-trigger-runtime]]
- [[004-api-reference]]
- [[005-data-models]]
- [[008-agent-builder-ui]]
