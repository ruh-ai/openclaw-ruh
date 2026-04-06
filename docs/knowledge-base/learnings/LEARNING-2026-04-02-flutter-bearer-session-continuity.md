# LEARNING: Flutter bearer sessions need active-org continuity without cookie assumptions

[[000-INDEX|← Index]] | [[014-auth-system]] | [[018-ruh-app]]

## Date
- 2026-04-02

## Context
- The live macOS `ruh_app` login flow was still failing even though the focused auth unit tests passed.
- The user-visible symptom was the native app surfacing backend auth failures immediately after login or during restored-session bootstrap.

## What Happened
- `ruh_app` writes tokens to platform storage, then reads them back on the next authenticated request.
- In practice, that makes the immediate post-login request path depend on secure-storage readback timing and platform storage availability.
- At the same time, backend `GET /api/auth/me` reconstructed active-org context from the refresh-token cookie only.
- Browser clients supply that cookie, but native bearer-token clients do not, so `/api/auth/me` could lose the real active organization even when the access token already carried the correct `orgId`.

## Durable Insight
- Native bearer clients must not depend on browser cookies to recover active-org session context.
- If the access token already encodes the active org, `GET /api/auth/me` should honor that bearer-token `orgId` when no refresh cookie exists.
- Platform storage should not sit on the critical path for the very next authenticated request after login or refresh. Keep an in-process token cache so a successful login can immediately authenticate follow-up calls even if secure storage is slow or temporarily unavailable.

## Fix
- Updated `ruh-backend/src/authRoutes.ts` so `GET /api/auth/me` falls back to `req.user.orgId` when there is no refresh-token cookie.
- Updated `ruh_app/lib/services/access_token_store.dart` to cache access + refresh tokens in memory for the current process and keep the active session usable even if persistence fails.
- Updated `ruh_app/lib/services/auth_service.dart` so restored native sessions surface the stored refresh token back into `AuthSession`.
- Updated `ruh_app/integration_test/login_flow_test.dart` to clear both stored tokens before boot and assert against the current customer shell (`Workspace`) instead of the obsolete builder-only control.

## Verification
- `cd ruh-backend && bun test tests/unit/authRoutes.test.ts`
- `cd ruh_app && flutter test test/services/access_token_store_test.dart`
- `cd ruh_app && flutter test test/services/auth_service_test.dart`
- `cd ruh_app && flutter test`
- `cd ruh_app && flutter test integration_test/login_flow_test.dart -d macos`

## Follow-up
- If a future native client adds another bearer-only bootstrap path, verify that every backend session-summary endpoint can reconstruct active-org truth without cookie-only assumptions.
- Keep the live native integration test aligned with the current authenticated shell so it fails only on real auth regressions, not on expected product-surface changes.
