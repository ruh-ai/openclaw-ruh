# SPEC: Web Security Headers

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[010-deployment]]

## Status

implemented

## Summary

The browser-facing surfaces currently ship without a consistent response-security-header contract. This spec defines a first-pass policy for `agent-builder-ui`, `ruh-frontend`, and the edge proxy: emit baseline anti-framing, referrer, nosniff, and permissions headers everywhere; add a documented CSP from the Next.js apps; remove the builder's app-authored inline theme script; and keep HSTS as an HTTPS-only edge concern.

Because the current Next.js guidance makes strict nonce-based CSP a dynamic-rendering tradeoff, the first pass chooses static `next.config` header emission with explicit, documented allowances for framework-required inline/runtime behavior. A stricter nonce or SRI path can be revisited later, but the repo should stop shipping with no browser-enforced boundary at all.

## Related Notes

- [[001-architecture]] — defines the browser, Next.js, and nginx trust boundaries this policy hardens.
- [[008-agent-builder-ui]] — owns the builder layout, markdown renderer, auth/session surface, and remote-image hosts.
- [[009-ruh-frontend]] — owns the developer UI that still renders sandbox connection details and browser-visible backend fetches.
- [[010-deployment]] — owns nginx behavior, TLS/HSTS rollout, and environment-specific deployment guidance.
- [[SPEC-agent-builder-session-token-hardening]] — cookie/session hardening composes with this browser-enforced header boundary.
- [[LEARNING-2026-03-25-web-security-headers-gap]] — captures the repo-state evidence that motivated this spec.

## Specification

### Goals

1. Every browser-facing app response should emit a consistent baseline security-header set instead of relying on framework or proxy defaults.
2. The first pass must materially improve clickjacking, MIME-sniffing, referrer, and browser-feature exposure, even before the repo fully hardens auth and secret storage.
3. CSP should be explicit and testable rather than implied, but it must fit the current Next.js rendering model without forcing an accidental full-dynamic rollout.
4. The builder should stop adding its own inline script for light-theme forcing so the remaining inline allowances are limited to framework/runtime requirements, not app-authored code.

### Non-goals

- This spec does not solve all XSS risk on its own; it complements [[SPEC-agent-builder-session-token-hardening]], backend auth, and secret-redaction work.
- This spec does not require a strict nonce-based CSP in the first pass.
- This spec does not move browser backend calls onto same-origin BFF routes; that remains separate auth/session work.

### Chosen First-Pass Approach

The first pass uses **static Next.js response headers** from each app's `next.config.ts` plus **edge-only HSTS** in nginx or the real TLS terminator.

Rationale:

- The repo currently has no browser-enforced policy at all, so a static header pass is a meaningful improvement.
- The current Next.js guidance makes strict nonce-based CSP a rendering/infra decision because nonces require per-request generation and dynamic rendering behavior.
- `agent-builder-ui` already has an app-authored inline theme script that should be removed regardless of which CSP style is chosen.

Implications:

- `script-src` and `style-src` may need explicit allowances for framework/runtime behavior in this first pass.
- Any such allowances must be documented in code/tests and kept as narrow as the current framework behavior permits.
- If the team later wants a stricter CSP, it should be a deliberate follow-up that evaluates nonce-based rendering costs rather than an accidental config tweak.

### Header Set

#### Headers emitted by both Next.js apps

Both `agent-builder-ui` and `ruh-frontend` must emit:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`

The CSP must include at least:

- `default-src 'self'`
- `base-uri 'self'`
- `form-action 'self'`
- `frame-ancestors 'none'`
- `object-src 'none'`
- `img-src` limited to `self`, `data:`, `blob:`, and the already-approved remote image hosts each app uses
- `connect-src` limited to `self` plus the configured browser-visible API/auth origins each app actually calls

#### CSP allowances in the first pass

The first pass may use documented framework allowances where required:

- `style-src 'self' 'unsafe-inline'` if needed for current Next.js/Tailwind runtime output
- `script-src 'self' 'unsafe-inline'` only for the framework/runtime allowance that remains after the builder's app-authored inline script is removed
- dev-only `unsafe-eval` may be allowed in development builds if the active Next.js version requires it for local tooling/HMR

These allowances must be:

- absent when not required
- omitted from production where dev-only
- covered by tests that make the chosen distinction explicit

### Surface-specific rules

#### `agent-builder-ui`

- Remove the inline theme-forcing script from `app/layout.tsx`.
- Keep the existing light-only theme behavior by static class/default configuration instead of client-side inline JS.
- `connect-src` must cover:
  - same-origin `/api/openclaw`
  - `NEXT_PUBLIC_API_URL` when browser code still calls the Ruh backend directly
  - `NEXT_PUBLIC_AUTH_URL` if browser auth/login flows still navigate or post to that origin

#### `ruh-frontend`

- `connect-src` must cover same-origin and `NEXT_PUBLIC_API_URL`, because the developer UI directly calls the Ruh backend from the browser.
- The policy must not block SSE to `/api/sandboxes/stream/:stream_id` or existing browser fetch flows.

#### `nginx` / edge

- Nginx should not overwrite the app-owned CSP by default.
- HSTS belongs only on an HTTPS-terminated edge surface. It must not be enabled for plain-HTTP local development.
- If nginx is the TLS terminator in a deployed environment, it should add:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  only when the deployment is actually HTTPS-only.

### Testing and verification contract

- Each app should expose its header policy through a small helper so tests can assert the exact emitted values.
- App tests must verify:
  - the expected header keys are present
  - CSP contains required directives
  - dev-only allowances are absent from production mode
- Manual or browser-based verification must confirm:
  - builder create flow still renders markdown, code blocks, and remote images
  - ruh-frontend still loads and performs sandbox create/chat/channel flows
  - browser consoles do not show blocked-resource errors on the supported path

## Implementation Notes

- Primary files for the first pass:
  - `agent-builder-ui/next.config.ts`
  - `agent-builder-ui/lib/security-headers.ts`
  - `agent-builder-ui/app/layout.tsx`
  - `agent-builder-ui/lib/providers/Providers.tsx`
  - `ruh-frontend/next.config.ts`
  - `ruh-frontend/lib/security-headers.ts`
  - `nginx/nginx.conf`
- Prefer small header-builder helpers plus tests over embedding long CSP strings inline in `next.config.ts`.
- The implemented builder slice removed both the app-authored light-theme script and the unused `next-themes` wrapper, because `next-themes` injects its own boot script even for forced/light-only setups.
- The checked-in `nginx/nginx.conf` remains unchanged because it is the plain-HTTP local proxy in this repo. HSTS stays an HTTPS-terminator concern instead of being forced into local development config.
- Revisit the stricter nonce-based path only if the team explicitly accepts the dynamic-rendering tradeoff for the affected routes/app.

## Test Plan

- Agent Builder unit tests for the header helper prove:
  - required headers are emitted
  - CSP includes the expected directives
  - development-only allowances do not leak into production
- Ruh frontend Jest tests prove the same for its header helper/config.
- Manual/browser verification covers:
  - `/agents/create`
  - deployed-agent chat page
  - ruh-frontend sandbox list/create/chat flows
  - remote images / icons still rendering correctly
