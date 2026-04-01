# SPEC: Agent Webhook Trigger Runtime

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[004-api-reference]]

## Status

implemented

## Summary

Signed inbound webhook triggers are now a real runtime path for agents created through `/agents/create`. The builder can persist and deploy `webhook-post`, config apply provisions a one-time shared secret plus stable public webhook handle, normal agent reads expose only safe webhook metadata, and `POST /api/triggers/webhooks/:public_id` now requires both the shared secret and a caller-supplied delivery id so replayed deliveries fail closed before sandbox invocation.

## Related Notes

- [[008-agent-builder-ui]] — create/deploy surfaces now treat `webhook-post` as a supported trigger and show one-time provisioning details during deploy
- [[004-api-reference]] — documents webhook provisioning/read-model expectations and the public signed delivery endpoint
- [[011-key-flows]] — create/deploy flow now includes webhook provisioning plus external delivery into the active sandbox
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving case now uses the same runtime-backed `webhook-post` contract rather than manual-plan-only metadata

## Specification

### Goal

Ship one signed inbound webhook runtime path that extends the existing persisted `triggers[]` contract instead of creating a parallel trigger model.

### Shipped v1 contract

- `webhook-post` is now a deployable trigger in the shared trigger catalog alongside `cron-schedule`.
- Persisted `triggers[]` entries keep the stable id `webhook-post` with `kind: "webhook"` and `status: "supported"`.
- During `POST /api/sandboxes/:sandbox_id/configure-agent`, the backend provisions a stable public webhook handle plus a one-time shared secret for every supported webhook trigger that does not already have one.
- The config-apply response may include one-time webhook reveal data `{ triggerId, title, url, secret, secretLastFour }`; the full secret is never returned again by normal agent read routes.
- Normal agent reads redact `webhookSecretHash` and expose only safe fields such as `webhookPublicId`, `webhookSecretLastFour`, `webhookSecretIssuedAt`, and the latest delivery status/timestamp.
- `POST /api/triggers/webhooks/:public_id` requires both `x-openclaw-webhook-secret` and `x-openclaw-delivery-id`. The delivery id must be 1-200 URL-safe characters and is reserved in a bounded backend replay ledger before any sandbox call.
- The public route rejects payloads above `64 KiB` with `413` before sandbox delivery. This hardening sits below the global `256 KiB` JSON parser cap and applies specifically to public webhook traffic.
- Verified first-time deliveries resolve the agent's active sandbox and forward the payload into the sandbox gateway using the session key `agent:trigger:<agent_id>:<trigger_id>`.
- Repeating the same `{ public_id, delivery_id }` pair returns a deterministic duplicate/replay response and never invokes the sandbox a second time, regardless of whether the first attempt ended `delivered` or `failed`.
- Successful deliveries return `202 accepted`; missing/malformed delivery ids fail with `400`; unsigned/invalid deliveries fail with `401`; unknown webhook ids fail with `404`; duplicate/replayed deliveries and no-active-sandbox cases fail closed with `409`.

### API and backend expectations

- Config apply owns webhook provisioning so deploy/hot-push flows do not need a second webhook-specific mutation route.
- The persisted verifier is stored as a one-way hash on the trigger record. Public agent reads must redact that hash.
- Delivery failures update safe last-delivery metadata on the trigger record so operators can tell whether the endpoint is merely provisioned or has recently failed.
- Replay suppression state lives in a dedicated `webhook_delivery_dedupes` table rather than inside `agents.triggers`, so caller delivery ids stay out of normal agent read responses while the backend still has durable duplicate suppression.

### Builder expectations

- Configure uses one shared trigger catalog where `webhook-post` and `cron-schedule` are both supported.
- Review and deploy surfaces must read the same persisted trigger status instead of inferring support from prose.
- Existing legacy webhook-style selections (for example generic `webhook`) still normalize fail-closed on reopen until they match the shipped `webhook-post` contract.

## Implementation Notes

- Keep the persisted trigger identity stable (`webhook-post`) so older metadata-only saves upgrade cleanly into the runtime-backed path.
- Reuse the saved `triggers[]` contract already documented in [[SPEC-google-ads-agent-creation-loop]].
- The runtime now uses a shared-secret header (`x-openclaw-webhook-secret`) plus a caller-supplied delivery id header (`x-openclaw-delivery-id`) rather than a broader HMAC/event-bus design. Future hardening should extend this contract rather than replacing it ad hoc.
- Do not broaden this package into arbitrary event buses or message queues before the single signed POST path works end to end.
- See [[LEARNING-2026-03-27-webhook-trigger-secret-redaction]] for the durable deploy-time-secret versus public-read-model split.
- See [[LEARNING-2026-03-27-webhook-replay-ledger-boundary]] for the durable reason replay ids live in a dedicated table instead of agent trigger JSON.

## Test Plan

- Backend unit coverage for public-read redaction, webhook provisioning, signature validation, duplicate replay rejection, payload-size rejection, and fail-closed delivery behavior
- Builder coverage proving the shared trigger catalog and config-apply client now treat `webhook-post` as deployable and surface one-time reveal data correctly
- End-to-end verification for create → deploy → signed webhook delivery using the persisted trigger contract when a browser-capable host plus backend runtime are available
