# Admin Panel

[[000-INDEX|← Index]] | [[014-auth-system|Auth System]] | [[002-backend-overview|Backend Overview]]

## Status
<!-- implemented -->

## Summary

Next.js 15 admin control plane at `admin-ui/` (port 3002) for Ruh platform management. It is a fail-closed super-admin surface driven by backend session `appAccess.admin`, and now exposes both platform-operations and business-management visibility instead of a thin stats shell. The current implemented surface covers overview, people/access, organizations, org-detail consoles, agents, runtime reconciliation, audit history, marketplace health, and system health.

## Related Notes
- [[014-auth-system]] — Platform-admin auth, shared session middleware, and `appAccess.admin`
- [[004-api-reference]] — Admin API endpoints
- [[016-marketplace]] — Marketplace moderation queue
- [[SPEC-app-access-and-org-marketplace]] — defines the super-admin-only app-access contract and the broader org/marketplace program

## Pages

| Route | Purpose |
|-------|---------|
| `/login` | Admin login (validates `appAccess.admin` after auth) |
| `/dashboard` | Overview cockpit: platform counts, attention items, top orgs, runtime issues, audit activity, marketplace leaders |
| `/users` | People and access management with app-access and membership context |
| `/organizations` | Developer/customer org inventory with org creation, lifecycle quick actions, and member/agent/listing/install summaries |
| `/organizations/:id` | Organization console: tabbed workspace for overview, people, assets, runtime, and org-scoped audit |
| `/agents` | Global agent oversight with creator, org, and runtime attachment context |
| `/runtime` | Sandbox reconciliation view with safe repair actions for `db_only` / `container_only` drift |
| `/audit` | Filterable control-plane audit event viewer |
| `/marketplace` | Marketplace health view: listing lifecycle, recent listings, and top installs |
| `/system` | Backend health plus runtime-derived status summary |

## Backend Endpoints (admin role required)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/admin/overview | Control-plane overview payload for dashboard |
| GET | /api/admin/stats | Platform stats (counts) |
| GET | /api/admin/organizations | Organization summaries for super-admin visibility |
| POST | /api/admin/organizations | Create an org plus optional initial membership |
| GET | /api/admin/organizations/:id | Organization-console payload |
| PATCH | /api/admin/organizations/:id | Update org name, slug, plan, status |
| POST | /api/admin/organizations/:id/members | Add or upsert an org membership |
| PATCH | /api/admin/organizations/:id/members/:membershipId | Update an org membership |
| DELETE | /api/admin/organizations/:id/members/:membershipId | Remove an org membership |
| POST | /api/admin/organizations/:id/session-context/reset | Clear active-org selection for sessions pointed at this org |
| DELETE | /api/admin/organizations/:id/sessions | Revoke all org-pinned sessions |
| DELETE | /api/admin/organizations/:id/sessions/:sessionId | Revoke one org-pinned session |
| DELETE | /api/admin/organizations/:id | Delete an archived, empty org |
| GET | /api/admin/users | Paginated user list with filters |
| PATCH | /api/admin/users/:id | Update role or status |
| DELETE | /api/admin/users/:id | Delete user |
| GET | /api/admin/agents | Agent inventory with creator/org/runtime context |
| GET | /api/admin/runtime | Sandbox runtime + reconciliation report for JWT-admin sessions |
| GET | /api/admin/audit-events | Audit feed; now usable from either JWT-admin session or admin token |
| GET | /api/admin/marketplace | Marketplace summary, recent listings, and top installs |
| POST | /api/admin/sandboxes/:sandbox_id/reconcile/repair | Safe runtime repair for drift rows (`db_only`, `container_only`) |

## Key Files

| File | Purpose |
|------|---------|
| `admin-ui/app/(auth)/login/page.tsx` | Login page |
| `admin-ui/app/_components/AdminSessionGate.tsx` | Shared super-admin session bootstrap gate |
| `admin-ui/app/(admin)/layout.tsx` | Sidebar shell |
| `admin-ui/app/(admin)/dashboard/page.tsx` | Overview dashboard |
| `admin-ui/app/(admin)/users/page.tsx` | People and access management |
| `admin-ui/app/(admin)/organizations/page.tsx` | Organization inventory |
| `admin-ui/app/(admin)/organizations/[id]/page.tsx` | Per-organization console |
| `admin-ui/app/(admin)/agents/page.tsx` | Agent oversight |
| `admin-ui/app/(admin)/runtime/page.tsx` | Runtime reconciliation and repair |
| `admin-ui/app/(admin)/audit/page.tsx` | Audit feed |
| `admin-ui/middleware.ts` | Cookie-aware page-route guard for admin routes |
| `ruh-backend/src/app.ts` | Admin overview, organizations, runtime, marketplace, users, agents, and audit routes |

## Tech Stack

- Next.js 15, React 19, Tailwind v4
- lucide-react for icons
- Ruh-aligned control-plane palette and typography refreshed toward the agent-builder brand direction
- Port 3002

## Related Specs

- [[SPEC-app-access-and-org-marketplace]] — admin-ui becomes a fail-closed super-admin surface driven by shared backend session `appAccess.admin`
- [[SPEC-admin-control-plane]] — expands admin-ui into a real control plane across overview, people, organizations, org-console operations, runtime, audit, marketplace, and system visibility
- [[SPEC-admin-billing-control-plane]] — adds customer-org billing operations, Stripe-backed support visibility, and entitlement controls to the admin surface

## Billing control plane surfaces (2026-04-02)

Related: [[SPEC-admin-billing-control-plane]], [[004-api-reference]], [[005-data-models]]

- `admin-ui` now includes a top-level fleet billing queue at `/billing`.
- Each organization can now be operated through a dedicated billing console at `/organizations/:id/billing`.
- The billing console is intentionally split between:
  - Stripe-linked commercial identity and mirrored Stripe objects
  - Ruh-owned entitlement and support overrides
- Current admin billing actions include:
  - link/update a billing customer
  - mirror a subscription snapshot
  - mirror an invoice snapshot
  - create/update entitlements
  - pause entitlement access
  - resume entitlement access
  - grant temporary access
- The fleet billing page highlights customer orgs with missing customer linkage, past-due entitlements, blocked access, open invoices, override-driven access, and seat overages.
- This is the first implemented slice of [[SPEC-admin-billing-control-plane]]; Stripe webhook sync and entitlement-aware customer access gating still remain future work.

## Organization detail IA refresh (2026-04-02)

Related: [[SPEC-admin-control-plane]], [[SPEC-admin-billing-control-plane]]

- The org-detail route `/organizations/:id` was restructured from a single stacked report into a tabbed operator workspace.
- Tabs now separate:
  - `Overview`
  - `People`
  - `Assets`
  - `Runtime`
  - `Audit`
- The change follows the Ruh design principle of progressive revelation:
  - keep the org identity and headline metrics visible
  - move detailed operations into focused tabs
  - keep specialized workflows, especially billing, in their own dedicated console instead of mixing them back into the main page
