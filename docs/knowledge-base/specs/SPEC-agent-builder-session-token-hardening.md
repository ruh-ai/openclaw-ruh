# SPEC: Agent Builder Session Token Hardening

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[001-architecture]]

## Status

draft

## Summary

`agent-builder-ui` currently exposes both access and refresh tokens to browser JavaScript and persists the access token into localStorage-backed Zustand state. This spec defines a hardened session contract where auth cookies become `HttpOnly`, browser code never reads raw bearer tokens, and authenticated browser requests flow through same-origin server-owned boundaries instead of a JS token cache.

## Related Notes

- [[008-agent-builder-ui]] — owns the current middleware, auth bootstrap, axios client, and architect bridge that depend on the browser session model
- [[001-architecture]] — describes the frontend trust boundaries and how builder auth differs from downstream gateway auth
- [[SPEC-agent-builder-gateway-error-reporting]] — the bridge remains a server boundary with typed error behavior after auth is hardened
- [[LEARNING-2026-03-25-agent-builder-session-token-exposure]] — captures the code-level evidence that the current session model is browser-readable

## Specification

### Goals

1. Browser JavaScript must not be able to read the builder's access token or refresh token.
2. No auth token may be persisted into Zustand, localStorage, or any other client-managed durable state.
3. Page auth, bridge auth, and future backend auth changes must compose with one session contract instead of adding a second token cache.
4. Logout and refresh-failure paths must remove the same cookies that login/refresh create.

### Non-goals

- This spec does not define the backend control-plane bearer-token validation contract; that belongs to the backend auth task.
- This spec does not replace `OPENCLAW_GATEWAY_TOKEN`, which remains server-only transport auth from the builder bridge to the architect gateway.
- This spec does not require a full auth-provider redesign; it hardens how the existing builder app stores and forwards session state.

### Session Contract

The builder app keeps two browser cookies:

- `accessToken`
- `refreshToken`

Both cookies must be:

- `HttpOnly=true`
- `Secure=true`
- scoped to the narrowest domain/path that still supports the deployed builder app
- emitted and cleared with identical attribute sets so removal is reliable

`SameSite` must default to the narrowest policy that works for the deployed login flow:

- Prefer `Lax` when the builder and its auth callback operate on the same site.
- Use `None` only if the production login or refresh flow demonstrably requires cross-site cookie delivery.
- If `None` is required, document the exact cross-site dependency in deployment docs and keep all authenticated mutation routes protected by same-origin/CSRF checks.

### Browser-State Rules

- `useUserStore` may persist profile metadata only; it must not contain `accessToken`, `refreshToken`, or any other bearer credential.
- `SessionInitializationWrapper` must determine whether a session exists without reading token values in browser JavaScript.
- Token refresh must not write the refreshed bearer token into client state after the server updates cookies.

### Request/Refresh Flow

Authenticated browser requests from `agent-builder-ui` must move to a same-origin BFF pattern:

1. Browser components call same-origin Next.js route handlers or server actions.
2. Those server-owned boundaries read `HttpOnly` cookies and attach bearer tokens only on the server side when calling the Ruh backend.
3. Refresh flow happens inside a server-owned path that can read the `refreshToken` cookie without exposing it to browser JavaScript.
4. Browser code receives success/failure results and profile data, not raw bearer tokens.

This means the current client-side axios interceptor pattern is transitional and should be removed or reduced to same-origin calls that do not need browser-managed `Authorization` headers.

### Middleware and Route Expectations

- `middleware.ts` should treat the presence of the hardened session cookies as the browser-facing signal for page gating, but it must not assume that browser JS can inspect those cookies.
- `app/api/openclaw/route.ts` and any future authenticated route handlers must validate the current session on the server before opening downstream connections.
- Any route relying on cookie-backed auth must enforce same-origin expectations and reject cross-site misuse explicitly.

### Failure Handling

- Missing or invalid session cookies must fail closed: protected pages redirect to `/authenticate`, and protected API routes return an auth/session error without attempting downstream work.
- Refresh failure must clear both auth cookies and any derived user/profile cache before redirecting or returning an auth error.
- User bootstrap should tolerate an expired or missing session without leaving the create flow in an indeterminate loading state.

### Relationship To Other Tasks

- `TASK-2026-03-25-08` should implement page gating against this hardened cookie contract, not against JS-readable tokens.
- `TASK-2026-03-25-24` should treat `/api/openclaw` as a cookie-backed authenticated BFF endpoint and validate session server-side before opening the gateway socket.
- `TASK-2026-03-25-09` can continue to require bearer validation in the backend, but the builder should obtain and forward those bearer tokens only from server-owned code paths.

## Implementation Notes

- Current code paths that must change are concentrated in:
  - `agent-builder-ui/services/authCookies.ts`
  - `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx`
  - `agent-builder-ui/hooks/use-user.ts`
  - `agent-builder-ui/services/axios.ts`
  - `agent-builder-ui/app/api/auth.ts`
  - `agent-builder-ui/middleware.ts`
- The safest migration path is:
  1. Remove token fields from persisted client state.
  2. Harden cookie attributes and clear-path parity.
  3. Introduce server-owned request helpers / route handlers for authenticated backend calls.
  4. Move page auth and bridge auth onto that server-owned contract.

## Test Plan

- Unit tests for cookie helpers assert hardened attributes and clear-path parity.
- Unit or integration coverage for session bootstrap confirms no token is written into persisted Zustand state.
- Route tests for authenticated same-origin handlers confirm the server reads cookies and browser code no longer sets bearer headers directly.
- Middleware and `/api/openclaw` tests cover unauthenticated, expired-session, and authenticated-success cases under the hardened contract.
