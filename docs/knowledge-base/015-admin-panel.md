# Admin Panel

[[000-INDEX|← Index]] | [[014-auth-system|Auth System]] | [[002-backend-overview|Backend Overview]]

## Status
<!-- implemented -->

## Summary

Next.js 15 admin dashboard at `admin-ui/` (port 3002) for Ruh platform management. It is now a fail-closed super-admin surface driven by backend session `appAccess.admin`, not just a loose frontend role check. Covers user management, agent oversight, marketplace moderation, and system health.

## Related Notes
- [[014-auth-system]] — Platform-admin auth, shared session middleware, and `appAccess.admin`
- [[004-api-reference]] — Admin API endpoints
- [[016-marketplace]] — Marketplace moderation queue
- [[SPEC-app-access-and-org-marketplace]] — defines the super-admin-only app-access contract and the broader org/marketplace program

## Pages

| Route | Purpose |
|-------|---------|
| `/login` | Admin login (validates `appAccess.admin` after auth) |
| `/dashboard` | Stats cards: users, agents, sandboxes, marketplace |
| `/users` | User table with search, role filter, activate/suspend |
| `/agents` | All agents across all users |
| `/marketplace` | Moderation queue (Phase 3 integration) |
| `/system` | Backend health check |

## Backend Endpoints (admin role required)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/admin/stats | Platform stats (counts) |
| GET | /api/admin/users | Paginated user list with filters |
| PATCH | /api/admin/users/:id | Update role or status |
| DELETE | /api/admin/users/:id | Delete user |
| GET | /api/admin/agents | All agents (no user scoping) |

## Key Files

| File | Purpose |
|------|---------|
| `admin-ui/app/(auth)/login/page.tsx` | Login page |
| `admin-ui/app/_components/AdminSessionGate.tsx` | Shared super-admin session bootstrap gate |
| `admin-ui/app/(admin)/layout.tsx` | Sidebar shell |
| `admin-ui/app/(admin)/dashboard/page.tsx` | Stats dashboard |
| `admin-ui/app/(admin)/users/page.tsx` | User management |
| `admin-ui/app/(admin)/agents/page.tsx` | Agent oversight |
| `admin-ui/middleware.ts` | Cookie-aware page-route guard for admin routes |

## Tech Stack

- Next.js 15, React 19, Tailwind v4
- lucide-react for icons
- Brand colors from DESIGN.md (#ae00d0 primary)
- Port 3002

## Related Specs

- [[SPEC-app-access-and-org-marketplace]] — admin-ui becomes a fail-closed super-admin surface driven by shared backend session `appAccess.admin`
