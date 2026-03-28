# LEARNING: Agent Builder Test Bucketing And Auth Fixtures

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agent-builder-auth-gate]] | [[SPEC-agent-builder-bridge-auth]] | [[LEARNING-2026-03-28-repo-testability-audit]] | [[013-agent-learning-system]]

## Context

While landing the first bounded refactor from the repo-wide testability audit, the shared builder bridge was split into helper seams for session auth, approval policy, and gateway-response parsing, then verified through Bun unit tests, a production Next build, and mocked Playwright create-flow runs.

## What Changed

### 1. Bridge-only auth, policy, and parser rules should live outside `app/api/openclaw/route.ts`

- `lib/openclaw/bridge-auth.ts` now owns cookie parsing, same-origin validation, and backend `GET /users/me` session verification.
- `lib/openclaw/approval-policy.ts` now owns builder/copilot/agent approval classification.
- `lib/openclaw/gateway-response.ts` now owns final architect payload parsing and normalization.
- This keeps the route focused on WebSocket/SSE orchestration and lets unit tests cover auth failures, approval decisions, and parser edge cases without booting the full bridge transport.

### 2. `agent-builder-ui` Bun suites need isolated buckets when they use `mock.module(...)`

- Bun module mocks are process-global in this package.
- Running every builder test in one `bun test` process causes suites that mock shared modules such as `@/lib/openclaw/api` to leak into each other.
- The supported package contract is now `npm test`, which fans out into isolated `test:unit:*` buckets for API, store, AG-UI, and the remaining core tests.

### 3. Auth-gated Playwright specs must seed a session before visiting platform routes

- `middleware.ts` and `SessionInitializationWrapper.tsx` now fail closed outside local development.
- Browser tests that go straight to `/agents/create` or other platform routes must set `accessToken` and `refreshToken` cookies and mock `GET /users/me` before `page.goto(...)`.
- Without that setup, the page will legitimately redirect to `/authenticate` or remain in the bootstrap loading state, which can look like a product regression even when the app is enforcing the intended auth contract.

## Reuse Guidance

- If a new builder test only needs session validation, approval classification, or payload parsing, add it next to the helper module instead of extending `route.test.ts`.
- If a Bun suite needs `mock.module(...)`, keep it in an isolated package script or add a new isolated bucket instead of widening `test:unit:core`.
- For Playwright coverage on authenticated builder routes, seed cookies and mock `/users/me` first, then navigate.

## Related Notes

- [[008-agent-builder-ui]] — canonical builder architecture and bridge documentation
- [[SPEC-agent-builder-auth-gate]] — page-route auth behavior that Playwright fixtures must satisfy
- [[SPEC-agent-builder-bridge-auth]] — server-side bridge session validation contract
- [[LEARNING-2026-03-28-repo-testability-audit]] — broader audit that motivated this bounded refactor
