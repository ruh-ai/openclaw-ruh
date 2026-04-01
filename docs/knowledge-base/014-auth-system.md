# Auth System

[[000-INDEX|← Index]] | [[002-backend-overview|Backend Overview]] | [[004-api-reference|API Reference]]

## Status
<!-- implemented -->

## Summary

Custom JWT-based authentication with transitional multi-tenant foundations plus explicit app-access derivation. Access tokens (15min JWT) + refresh tokens (raw UUID, 7 day) remain in place, while organization memberships and session-level active-organization context now let one user belong to multiple developer or customer orgs. Auth responses and middleware now expose fail-closed `appAccess` decisions for admin, builder, and customer surfaces, and local email/password auth remains available for testing until real SSO lands.

## Related Notes
- [[002-backend-overview]] — Auth middleware integrates with all backend routes
- [[004-api-reference]] — Auth endpoints: register, login, refresh, logout, me
- [[005-data-models]] — users, organizations, sessions, api_keys tables
- [[015-admin-panel]] — Admin role required for platform management
- [[016-marketplace]] — Developer role required for publishing
- [[018-ruh-app]] — Flutter customer sessions need the same tenant-aware auth contract

## Database Tables

### users
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| email | TEXT UNIQUE | Login identifier |
| password_hash | TEXT | bcrypt hash |
| display_name | TEXT | User-facing name |
| avatar_url | TEXT | Optional |
| role | TEXT | admin, developer, end_user |
| org_id | TEXT FK → organizations | Optional org membership |
| status | TEXT | active, suspended, pending |
| email_verified | BOOLEAN | Default false |

### organizations
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT | Display name |
| slug | TEXT UNIQUE | URL-safe identifier |
| kind | TEXT | developer, customer |
| plan | TEXT | free (default) |

### sessions
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT FK → users | CASCADE delete |
| refresh_token | TEXT UNIQUE | Raw UUID |
| active_org_id | TEXT FK → organizations | Current tenant context for the refresh session |
| expires_at | TIMESTAMPTZ | 7 days from creation |

### organization_memberships
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| org_id | TEXT FK → organizations | CASCADE delete |
| user_id | TEXT FK → users | CASCADE delete |
| role | TEXT | owner, admin, developer, employee |
| status | TEXT | active by default |

### auth_identities
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT FK → users | CASCADE delete |
| provider | TEXT | local now, SSO providers later |
| subject | TEXT | provider-scoped user identifier |

### api_keys
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT FK → users | CASCADE delete |
| key_hash | TEXT UNIQUE | SHA-256 hash of key |
| key_prefix | TEXT | First 8 chars for display |

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/auth/register | Public | Create account (email, password, displayName, role) |
| POST | /api/auth/login | Public | Authenticate → access + refresh tokens |
| POST | /api/auth/refresh | Public | Rotate refresh token → new token pair |
| POST | /api/auth/logout | Required | Delete all user sessions |
| POST | /api/auth/switch-org | Required | Change active org for the current refresh session |
| GET | /api/auth/me | Required | Current user profile |
| PATCH | /api/auth/me | Required | Update displayName, avatarUrl |

## Middleware

| Middleware | Effect |
|-----------|--------|
| `requireAuth` | Validates an access token from either `Authorization: Bearer ...` or the `accessToken` cookie, sets `req.user`, rejects 401 |
| `optionalAuth` | Same token sources but doesn't reject — `req.user` may be undefined |
| `requireRole(...roles)` | Checks req.user.role against allowed list, rejects 403 |

## Key Files

| File | Purpose |
|------|---------|
| `ruh-backend/src/auth/passwords.ts` | bcrypt hash + verify |
| `ruh-backend/src/auth/tokens.ts` | JWT sign/verify |
| `ruh-backend/src/auth/middleware.ts` | Express middleware |
| `ruh-backend/src/authRoutes.ts` | Auth API routes |
| `ruh-backend/src/userStore.ts` | User CRUD |
| `ruh-backend/src/sessionStore.ts` | Session management |
| `ruh-backend/src/orgStore.ts` | Organization CRUD |

## Implementation Notes

- Refresh tokens are raw UUIDs (not JWT-signed) stored in the `sessions` table
- Access tokens are JWTs containing `userId`, `email`, `role`, and the session's active `orgId`
- Both tokens are set as httpOnly cookies and returned in the response body
- Auth cookies are `Secure` only in production; local `http://localhost` development keeps them non-secure so browser-based login flows can persist sessions during cross-port testing
- `POST /api/auth/register` can now optionally bootstrap an organization plus owner membership for local testing
- Auth responses now include `memberships`, `activeMembership`, `activeOrganization`, `platformRole`, and derived `appAccess` so frontends can render tenant-aware session state and enforce app entry without extra join endpoints
- The shared contract is intentionally two-layered: `memberships[]` is the full org list for the person, while `appAccess` is derived only from the current session's active org. Frontends should use `memberships[]` plus `POST /api/auth/switch-org` to recover into the right surface when a valid multi-org user lands on the wrong tenant.
- `requireActiveDeveloperOrg` is now the builder-specific authz seam for creator-owned agent routes: it rejects customer sessions and developer sessions without an active developer-org membership before any builder mutation logic runs
- Backend builder routes now stamp `created_by` plus the active developer `org_id` on new agents and scope `/api/agents*` reads/mutations to the current creator instead of exposing a global builder-visible agent list
- Marketplace listing creation now stamps `owner_org_id` from the active developer-org session and listing management (`PATCH`, `submit`, `my/listings`) resolves through that org ownership, while creation still rejects attempts to publish an agent not owned by the current creator
- The local test-user seed path currently uses the shared QA password `RuhTest123` by default so manual testing across admin, builder, web customer, and Flutter customer surfaces does not depend on punctuation-heavy credentials
- The seeded local matrix now includes `prasanjit@ruh.ai` as a practical cross-surface operator fixture: platform admin, `acme-dev` owner, and `globex` admin.
- `ruh-frontend` and `ruh_app` now both enforce `appAccess.customer`, but they transport sessions differently:
  - `ruh-frontend` uses cookie-backed browser auth with `credentials: include`
  - `ruh_app` uses the bearer-token path by persisting the returned access token in `FlutterSecureStorage`, restoring the session through `GET /api/auth/me`, and clearing the token on logout or rejected bootstrap
- `ruh-frontend` and `agent-builder-ui` now both auto-switch recoverable multi-org sessions during login/bootstrap instead of failing immediately when the initial active org belongs to the wrong surface. `ruh-frontend` also exposes a lightweight customer-org switcher overlay, while `agent-builder-ui` exposes developer-org switching from the existing user-profile dropdown.
- `ruh_app` now has a native login route, auth-loading bootstrap route, Riverpod auth controller, and guarded GoRouter redirect helper, so the Flutter customer surface fails closed the same way as the customer web app
- `ruh_app` now also auto-switches to a customer org during login when a multi-org user initially lands on a developer org, and Settings exposes customer-org switching while the current session still has its refresh token in memory.
- Under [[SPEC-ruh-app-login-convenience]], the Flutter login form now adds a password visibility toggle and opt-in remembered email, but it still does not store raw passwords locally. Only the existing access token remains persisted for session restore.
- The builder browser transport currently sends `ngrok-skip-browser-warning: true` on API requests, so backend CORS must allow that header or `/api/auth/me` preflights will fail and the builder auth gate will sit on its loading state
- Local builder fallback auth only renders when `agent-builder-ui` runs with `NEXT_PUBLIC_AUTH_URL` blank; if local env points that value at another app, `/authenticate` switches to external-redirect mode instead of showing the seeded email/password form. `NEXT_PUBLIC_APP_URL` should match the live builder origin when testing redirects locally
- Builder auth redirect targets are now sanitized before existing sessions are bounced off `/authenticate`: invalid or self-referential `redirect_url` values fail closed to `/agents` instead of looping between the login page and missing builder routes
- Config: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` env vars (dev defaults provided)
- When those JWT env vars are omitted in development or test, the backend now generates one fallback access secret and one fallback refresh secret per process and reuses them for the lifetime of that server. Recomputing them per `getConfig()` call breaks every login by making newly minted tokens unverifiable on the next request. See [[LEARNING-2026-03-31-dev-jwt-secret-instability]].
- Ownership columns (`created_by`, `org_id`) added to agents and sandboxes tables

## Related Specs

- [[SPEC-multi-tenant-auth-foundation]] — expands auth from single-org/global-role assumptions into tenant memberships, active-org session context, and local login fallback before real SSO lands
- [[SPEC-local-test-user-seeding]] — adds an idempotent local QA seed path for platform, developer-org, customer-org, and cross-org login fixtures
- [[SPEC-local-demo-marketplace-seeding]] — layers real developer-owned demo agents and published listings on top of the seeded local account matrix
- [[SPEC-app-access-and-org-marketplace]] — extends auth into explicit app-access decisions for admin, builder, and customer surfaces, plus later org-owned checkout and seat assignment
- [[SPEC-marketplace-store-parity]] — depends on active customer-org session truth for catalog CTA state, checkout ownership, assignment, and post-purchase launch
- [[SPEC-ruh-app-login-convenience]] — defines the native login UX improvement that remembers only email on-device while leaving auth/session semantics unchanged

## Related Learnings

- [[LEARNING-2026-03-31-dev-jwt-secret-instability]] — local admin login initially failed even after successful `POST /api/auth/login` because missing JWT env vars caused `getConfig()` to mint a new fallback signing secret on every call
