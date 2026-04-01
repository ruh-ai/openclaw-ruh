# LEARNING: Dev JWT fallback secrets must be stable for the full backend process

[[000-INDEX|← Index]] | [[014-auth-system]] | [[015-admin-panel]]

## Date
- 2026-03-31

## Context
- While verifying the seeded platform admin login at `http://localhost:3002/login`, `POST /api/auth/login` kept returning `200`, but the admin app immediately bounced back to `/login` because every follow-up `GET /api/auth/me` returned `401`.

## What Happened
- The backend local `.env` did not define `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET`.
- `parseBackendConfig()` treated missing JWT secrets as a development convenience and generated fallback secrets on the fly.
- `getConfig()` reparses the environment on every call instead of caching a single config object.
- That meant `signAccessToken()` and `verifyAccessToken()` were often using different randomly generated secrets inside the same backend process.
- The result was catastrophic but subtle: the backend would mint a token successfully during login, then reject that same token as `Invalid or expired access token` on the very next request.

## Durable Insight
- Any dev/test fallback secret for signing tokens must be stable for the lifetime of the running process.
- Generating fallback JWT secrets inside a per-call config function is functionally equivalent to rotating signing keys on every request.
- This failure mode can masquerade as a cookie or CORS problem because the UI sees `login 200` followed immediately by auth bootstrap `401`.

## Fix
- Updated `ruh-backend/src/config.ts` so dev fallback JWT secrets are generated once at module load and reused for every later `getConfig()` call.
- Updated `ruh-backend/src/authRoutes.ts` so auth cookies are `Secure` only in production, keeping local browser login flows viable on `http://localhost`.
- Added regression coverage in:
  - `ruh-backend/tests/unit/config.test.ts`
  - `ruh-backend/tests/contract/authEndpoints.test.ts`

## Verification
- `cd ruh-backend && bun test tests/unit/config.test.ts`
- `cd ruh-backend && bun test tests/contract/authEndpoints.test.ts`
- `cd ruh-backend && bun run typecheck`
- Real browser verification on 2026-03-31:
  - `admin-ui` login with `admin@ruh.test` / the current seeded shared QA password
  - landed on `/dashboard`
  - `GET /api/auth/me` returned `200`
  - `GET /api/admin/stats` returned `200`

## Follow-up
- If any other frontend still shows `login 200` followed by auth bootstrap `401`, check for secret rotation or token-source mismatches before assuming the problem is only CORS or cookie flags.
