# LEARNING: Agent Builder Bridge Auth Contract

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agent-builder-bridge-auth]]

## Context

`agent-builder-ui/app/api/openclaw/route.ts` already acted as a privileged backend-for-frontend bridge because it opened architect gateway sessions with the server-held `OPENCLAW_GATEWAY_TOKEN`, but page-route auth alone did not protect it. The bridge needed its own route boundary that reuses the builder session instead of trusting page reachability or inventing a second token model.

## What Changed

- The bridge now validates the caller on the server by reading the `accessToken` cookie and calling backend `GET /users/me` before opening any WebSocket connection.
- Browser requests with an `Origin` header must match the request origin exactly; mismatched origins fail before the gateway handshake.
- Auth failures return structured JSON errors (`unauthorized`, `forbidden_origin`, `auth_unavailable`) instead of the SSE gateway stream so the client can classify session problems separately from architect/gateway failures.
- `sendToArchitectStreaming()` now throws a typed `BridgeApiError` for those responses, which gives the UI a stable place to branch on session expiry later.

## Durable Takeaway

Treat `/api/openclaw` as a separate security boundary from page middleware. Any future bridge route that spends server-held gateway credentials should do its own server-side session validation first and should keep auth failures out of the normal gateway-stream error channel.

## Related Notes

- [[008-agent-builder-ui]] — documents the authenticated bridge route and client error contract
- [[001-architecture]] — distinguishes bridge-route auth from page-route auth and gateway transport auth
- [[SPEC-agent-builder-auth-gate]] — page redirects remain a separate layer from route auth
- [[SPEC-agent-builder-session-token-hardening]] — future `HttpOnly` token work must preserve this server-owned validation pattern
