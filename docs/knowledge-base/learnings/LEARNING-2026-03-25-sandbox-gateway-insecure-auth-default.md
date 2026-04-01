# LEARNING: New sandboxes currently enable insecure gateway control-UI auth by default

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[003-sandbox-lifecycle]] | [[010-deployment]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the sandbox creation path and the low-level sandbox connection UX were inspected after ruling out already-tracked auth, secret-redaction, audit, rate-limit, and lifecycle gaps.

## What Was Learned

- New sandbox bootstrap currently enables a security-sensitive gateway control-UI mode by default rather than through an explicit operator or local-dev contract.
- `ruh-backend/src/sandboxManager.ts` always sets `gateway.bind lan`, broad control-UI origins/proxies, and `gateway.controlUi.allowInsecureAuth true` before starting the gateway.
- The low-level developer UI still instructs users to open the sandbox dashboard URL in a browser and paste the gateway token manually, so this downstream browser-facing access path is part of the current product workflow.
- Existing backlog items protect repo-owned surfaces such as the backend API, token exposure in normal read paths, and future audit logging, but none currently define the intended security posture of the sandbox-local gateway once a sandbox exists.

## Evidence

- `ruh-backend/src/sandboxManager.ts` contains:
  - `openclaw config set gateway.bind lan`
  - `openclaw config set gateway.controlUi.allowedOrigins '["http://localhost","http://localhost:3000","http://localhost:3001","http://localhost:80"]'`
  - `openclaw config set gateway.trustedProxies '["127.0.0.1","172.0.0.0/8","10.0.0.0/8"]'`
  - `openclaw config set gateway.controlUi.allowInsecureAuth true`
- `docs/knowledge-base/003-sandbox-lifecycle.md` documents that `allowInsecureAuth true` step as part of the standard create flow.
- [`ruh-frontend/components/SandboxResult.tsx`](../../../ruh-frontend/components/SandboxResult.tsx) tells users to open the dashboard URL, paste the gateway token, and click Connect.
- `TODOS.md` already tracks backend auth, sandbox secret redaction, and control-plane audit, but there was no task for the sandbox gateway access policy itself.

## Implications For Future Agents

- Treat the sandbox gateway access model as its own security boundary, not as a side effect hidden inside backend auth or secret-redaction work.
- Do not assume that hiding tokens from normal list/detail APIs is sufficient if newly created sandboxes still boot with permissive browser-facing gateway auth defaults.
- When changing sandbox bootstrap or direct dashboard flows, define whether direct browser access is actually required in production, and make any insecure/dev-only override explicit, documented, and auditable.

## Links

- [[003-sandbox-lifecycle]]
- [[010-deployment]]
- [[001-architecture]]
- [Journal entry](../../journal/2026-03-25.md)
