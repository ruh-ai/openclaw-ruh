# SPEC: Agent Builder Auth Gate

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[001-architecture]]

## Status

implemented

## Summary

`agent-builder-ui` currently ships authentication UI and token-refresh plumbing, but protected pages are still reachable anonymously because `middleware.ts` returns early and the session initializer fails open. This spec defines the bounded route-gating contract for the current browser-readable token model so page access fails closed now, while remaining compatible with the later [[SPEC-agent-builder-session-token-hardening]] migration.

## Related Notes

- [[008-agent-builder-ui]] — owns the middleware, session initializer, auth pages, and browser auth helpers that implement this gate
- [[001-architecture]] — documents the frontend trust boundary and the distinction between builder page auth and downstream gateway transport auth
- [[SPEC-agent-builder-session-token-hardening]] — follow-on hardening work that replaces the current browser-readable token model without changing the page-gating intent

## Specification

### Goals

1. Anonymous users cannot load protected builder routes such as `/agents`, `/agents/create`, or deployed-agent pages.
2. Redirects preserve the intended destination through `/authenticate?redirect_url=...`.
3. Session bootstrap fails closed when both auth cookies are missing or when user bootstrap returns an auth failure.
4. The auth page stays public, but users who already have session cookies should be sent back into the platform instead of staying stranded on the login screen.

### Non-goals

- This spec does not harden token storage; browser-readable cookies and persisted access-token metadata remain transitional and are covered by [[SPEC-agent-builder-session-token-hardening]].
- This spec does not authenticate the bridge API itself; that boundary belongs to the separate `/api/openclaw` auth task.
- This spec does not redesign the upstream login provider flow.

### Protected-route Contract

- `middleware.ts` runs on non-static, non-API routes.
- `/authenticate` remains public.
- Any other route without either `accessToken` or `refreshToken` cookies redirects to `/authenticate`.
- The redirect carries `redirect_url` equal to the requested path plus query string.
- The dashboard route `/` is also protected; it should redirect like other protected routes when no session cookies exist.

### Session-bootstrap Contract

- `SessionInitializationWrapper` must treat auth pages and protected pages differently.
- On protected routes:
  - if both auth cookies are missing after hydration, clear any persisted user state and redirect to `/authenticate` with `redirect_url`
  - if `/users/me` fails with `401` or `403`, clear session state and redirect the same way
- On auth routes:
  - missing cookies should not trigger a redirect loop
  - if a session already exists, redirect into the requested `redirect_url` or `/agents`

### Cookie and Logout Expectations

- Cookie set and clear helpers must use compatible path/domain/same-site/secure semantics so logout and refresh failure reliably remove both auth cookies.
- Refresh failure must clear auth cookies and persisted user state before leaving the session invalid.

## Implementation Notes

- Primary files:
  - `agent-builder-ui/middleware.ts`
  - `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx`
  - `agent-builder-ui/services/authCookies.ts`
  - `agent-builder-ui/services/axios.ts`
- Keep the logic narrow: route gating and fail-closed redirects now, token-hardening later.

## Test Plan

- `bun:test` coverage for `middleware.ts`:
  - unauthenticated protected route redirects to `/authenticate?redirect_url=...`
  - `/authenticate` stays public
  - authenticated requests continue through
- `bun:test` coverage for the session helper logic:
  - missing cookies on protected routes produce an auth redirect decision
  - auth-route requests with cookies produce a platform redirect decision
  - auth errors from user bootstrap clear session state and redirect
- Manual operator check:
  - visit `/agents` without cookies and confirm redirect
  - visit `/authenticate` with cookies and confirm return to the platform
