# LEARNING: Browser security headers are currently absent across the web surfaces

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the browser-facing surfaces were inspected across `agent-builder-ui`, `ruh-frontend`, and the checked-in nginx reverse proxy config after ruling out already-tracked auth, session-storage, secret-redaction, bridge-auth, and sandbox-gateway-policy tasks.

## What Was Learned

- Neither `agent-builder-ui/next.config.ts` nor `ruh-frontend/next.config.ts` defines a `headers()` policy or another response-header hardening path.
- `nginx/nginx.conf` currently sets proxying, buffering, websocket upgrade, and timeout behavior only; it adds no HSTS or browser security headers at the edge.
- `agent-builder-ui/app/layout.tsx` includes an inline `dangerouslySetInnerHTML` script to force the light theme, so a real CSP rollout will need an explicit plan for that script instead of bolting CSP on later.
- `agent-builder-ui/app/(platform)/agents/create/_components/MessageContent.tsx` renders architect-produced markdown, and `ruh-frontend/components/SandboxResult.tsx` still renders sandbox connection secrets pending the separate redaction task.
- Existing active tasks already cover page auth, bridge auth + same-origin enforcement, session-token hardening, secret redaction, and sandbox gateway access policy, but none define a browser-enforced defense layer like CSP / anti-framing / nosniff / referrer-policy across the web surfaces themselves.

## Update After First-Pass Implementation

- `agent-builder-ui/next.config.ts` and `ruh-frontend/next.config.ts` now emit a shared baseline header set through small helper modules and app-wide `headers()` config.
- `agent-builder-ui` no longer uses its extra light-theme inline script, and the light-only app no longer wraps the tree in `next-themes`.
- The most reusable implementation detail is that `next-themes` injects its own boot script even for a forced/light-only setup, so a light-only app should drop the wrapper entirely if the goal is to avoid unnecessary inline-script CSP exceptions.
- The checked-in `nginx/nginx.conf` still should not receive HSTS by default because it is the repo's plain-HTTP local proxy. HSTS belongs on the real HTTPS terminator only.

## Evidence

- `agent-builder-ui/next.config.ts` contains image remote patterns and build flags, but no `headers()` function or response-header policy.
- `ruh-frontend/next.config.ts` sets `output: "standalone"` only.
- `nginx/nginx.conf` adds proxy headers and streaming timeouts, but no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, or anti-framing headers.
- `agent-builder-ui/app/layout.tsx` injects inline JS:
  - `dangerouslySetInnerHTML`
  - `localStorage.setItem('theme', 'light')`
- `agent-builder-ui/app/(platform)/agents/create/_components/MessageContent.tsx` renders markdown from architect responses and opens outbound links with `target="_blank"`.
- `ruh-frontend/components/SandboxResult.tsx` renders `Preview Token` and `Gateway Token`, increasing the value of any browser-side compromise until the redaction task lands.

## Implications For Future Agents

- Treat browser security headers as a separate security boundary from auth and secret storage. Even after cookies become `HttpOnly` and secrets are redacted from normal reads, the web surfaces still need CSP / anti-framing / nosniff / referrer controls.
- Do not reintroduce CSP-hostile theme boot scripts to the builder. If the app stays light-only, keep theme selection static instead of bringing back `next-themes` or another client boot script unnecessarily.
- When implementing the header policy, preserve documented allowances for remote images, streaming/SSE paths, and local-development websocket workflows instead of falling back to broad wildcard directives.

## Links
- [[008-agent-builder-ui]]
- [[009-ruh-frontend]]
- [[010-deployment]]
- [[SPEC-web-security-headers]]
- [[SPEC-agent-builder-session-token-hardening]]
- [Journal entry](../../journal/2026-03-25.md)
