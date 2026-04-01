# SPEC: Agent Builder Bridge Auth

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[001-architecture]]

## Status

implemented

## Summary

`/api/openclaw` is a privileged backend-for-frontend bridge that opens architect-gateway sessions with the server-held `OPENCLAW_GATEWAY_TOKEN`. The route must reject anonymous or cross-site callers before any WebSocket handshake begins, while reusing the existing builder session cookies and backend user validation contract instead of inventing another auth model.

## Related Notes

- [[001-architecture]] — documents the builder bridge as an authenticated BFF boundary distinct from gateway transport auth
- [[008-agent-builder-ui]] — defines the route, client behavior, and the current transitional cookie/session model
- [[SPEC-agent-builder-auth-gate]] — page-route redirects and bootstrap remain a separate layer from bridge-route auth
- [[SPEC-agent-builder-session-token-hardening]] — future `HttpOnly` token hardening must preserve the same server-owned bridge validation flow

## Specification

### Caller identity contract

- `POST /api/openclaw` requires an authenticated builder session before any downstream gateway connection is attempted.
- The route reads the current builder auth cookies on the server and validates the access token by calling the backend `GET /users/me` endpoint with `Authorization: Bearer <access token>`.
- Requests without an access token fail with `401`.
- Requests with an access token that the backend rejects fail with `401`.
- If the bridge cannot validate the caller because required auth configuration is missing, it fails closed with `503` rather than opening an unauthenticated gateway session.

### Local development exception

- Local repo development may bypass backend `GET /users/me` validation only when all of these are true:
- the route is running with `NODE_ENV=development`
- the request URL resolves to a localhost-style origin (`localhost`, `127.0.0.1`, `::1`, or `0.0.0.0`)
- the configured backend URL is also localhost-only
- same-origin validation still runs first, so cross-site requests remain blocked even in development
- This exception exists only so the shared bridge stays usable in repo-only local runs where page auth is already development-bypassed and the local backend does not implement the production `/users/me` contract.

### Request-integrity contract

- Browser callers must satisfy a same-origin policy check before the bridge touches the architect gateway.
- If the request includes an `Origin` header, it must match the request origin exactly.
- Requests with a mismatched `Origin` fail with `403`.
- Non-browser requests that omit `Origin` are tolerated so local test harnesses and controlled server-side callers can still exercise the route, but they must still pass the authenticated session check.

### Error contract

- Auth failures return JSON instead of SSE so the client can distinguish them from gateway outages:
  - `401 { "error": "unauthorized", "detail": "..." }`
  - `403 { "error": "forbidden_origin", "detail": "..." }`
  - `503 { "error": "auth_unavailable", "detail": "..." }`
- Gateway failures after authentication keep the existing SSE status/result contract.

### Client expectations

- `sendToArchitectStreaming()` must preserve the happy-path SSE behavior for authenticated requests.
- Non-2xx JSON auth responses must surface as bridge-auth/session failures, not generic gateway failures, so the UI can redirect to login or clear stale session state deterministically.

## Implementation Notes

- Keep this package scoped to `/api/openclaw`; do not fold in the separate browser-token hardening work from [[SPEC-agent-builder-session-token-hardening]].
- Reuse the existing cookie-backed builder session and backend `/users/me` validation path instead of adding a second session cache.
- Perform request validation before constructing the WebSocket client or entering the retry loop.
- Keep the development bypass explicit and localhost-only; do not allow it on non-local hosts, preview URLs, or production/staging deployments.

## Test Plan

- Route tests proving unauthenticated requests return `401` and never construct a WebSocket client
- Route tests proving bad `Origin` headers return `403` before gateway handshake
- Route tests proving authenticated same-origin requests still stream successfully
- Helper tests proving the localhost-only development bypass skips backend validation only for local request + local backend + `NODE_ENV=development`
- Client tests proving bridge auth failures surface as auth/session errors rather than generic gateway outages
