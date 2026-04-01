# Auth System

[[000-INDEX|← Index]] | [[002-backend-overview|Backend Overview]] | [[004-api-reference|API Reference]]

## Status
<!-- implemented -->

## Summary

Custom JWT-based authentication with three user tiers: **admin**, **developer**, **end_user**. Access tokens (15min JWT) + refresh tokens (raw UUID, 7 day). Passwords hashed with bcrypt (12 rounds). httpOnly cookies for both tokens.

## Related Notes
- [[002-backend-overview]] — Auth middleware integrates with all backend routes
- [[004-api-reference]] — Auth endpoints: register, login, refresh, logout, me
- [[005-data-models]] — users, organizations, sessions, api_keys tables
- [[015-admin-panel]] — Admin role required for platform management
- [[016-marketplace]] — Developer role required for publishing

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
| plan | TEXT | free (default) |

### sessions
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT FK → users | CASCADE delete |
| refresh_token | TEXT UNIQUE | Raw UUID |
| expires_at | TIMESTAMPTZ | 7 days from creation |

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
| GET | /api/auth/me | Required | Current user profile |
| PATCH | /api/auth/me | Required | Update displayName, avatarUrl |

## Middleware

| Middleware | Effect |
|-----------|--------|
| `requireAuth` | Validates Bearer JWT, sets req.user, rejects 401 |
| `optionalAuth` | Same but doesn't reject — req.user may be undefined |
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

- Refresh tokens are raw UUIDs (not JWT-signed) stored in the sessions table
- Access tokens are JWTs containing userId, email, role, orgId
- Both tokens set as httpOnly cookies + returned in response body
- Config: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` env vars (dev defaults provided)
- Ownership columns (`created_by`, `org_id`) added to agents and sandboxes tables
