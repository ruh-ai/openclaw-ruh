# LEARNING: Local Builder Bridge Auth Gap

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agent-builder-auth-gate]] | [[SPEC-agent-builder-bridge-auth]] | [[013-agent-learning-system]]

## Context

A live local bring-up of the repo services first verified that `ruh-backend`, `ruh-frontend`, and `agent-builder-ui` all start successfully on localhost, but the builder's shared architect bridge was not locally runnable end to end against the repo backend alone. Later the same day, the bridge contract was updated so localhost-only development can bypass backend `/users/me` validation while preserving the production fail-closed behavior.

## Original Failure

- `ruh-backend` starts on `http://localhost:8000` and serves normal API routes such as `/api/agents` and `/api/sandboxes`.
- `ruh-frontend` starts on `http://localhost:3000`.
- `agent-builder-ui` starts on `http://localhost:3001`, and the `/agents/create` page renders in development mode.
- `POST /api/openclaw` returns `401 unauthorized` without an `accessToken` cookie.
- `POST /api/openclaw` returns `503 auth_unavailable` with an `accessToken` cookie because `requireAuthenticatedBridgeSession()` calls backend `GET /users/me`, and the local backend currently responds `404` for that path.

## Resolution

- `lib/openclaw/bridge-auth.ts` now allows a development-only bypass when `NODE_ENV=development`, the request origin is localhost-only, and the configured backend URL is also localhost-only.
- Same-origin validation still runs first, so the dev bypass does not relax the cross-site boundary.
- `/api/openclaw` now reaches the traced bridge path in repo-only local runs, and completed bridge runs explicitly flush the Langfuse span processor before returning so successful or terminal local runs do not depend on background export timing.
- After this change, an empty local Langfuse project is no longer explained by the builder bridge auth gate; it points instead to the self-hosted Langfuse stack, worker, or UI state.

## Why It Matters

- The original gap made local builder chat look healthy at the page level while the shared architect route was unusable.
- It also made local Langfuse debugging misleading, because no bridge trace could exist until auth succeeded.
- Future agents should treat this gap as resolved in the builder code and avoid re-introducing a broader bypass on non-local hosts.
- If local Langfuse is still empty now, investigate the Langfuse deployment rather than reworking bridge auth again.

## Reuse Guidance

- Keep the builder bridge bypass constrained to localhost-only development plus a localhost backend target.
- Do not widen the exception to preview URLs, LAN hosts, or deployed non-production environments without a separate spec review.
- If a future local run fails after the bridge enters the traced path, inspect gateway reachability or the self-hosted Langfuse stack before revisiting bridge auth.

## Related Notes

- [[008-agent-builder-ui]] — canonical builder architecture and current auth/runtime behavior
- [[SPEC-agent-builder-auth-gate]] — page-route auth behavior that already has a development bypass
- [[SPEC-agent-builder-bridge-auth]] — bridge-side session validation contract that causes the local run failure
