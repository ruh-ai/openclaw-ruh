# SPEC: Admin Control Plane

[[000-INDEX|← Index]] | [[015-admin-panel|Admin Panel]]

## Status

implemented

## Summary

Expand `admin-ui` from a thin stats shell into a real super-admin control plane for both platform operations and business-management visibility. The implemented slices now cover overview, people, organizations, agents, runtime, audit, marketplace, and system health, plus a deeper organization-console workflow with create, lifecycle, membership, and org-session operations so platform admins can actually govern the Ruh platform from one surface.

## Related Notes

- [[015-admin-panel]] — owns the admin UI information architecture and page behavior
- [[004-api-reference]] — documents the new admin API surfaces and richer response shapes
- [[014-auth-system]] — admin access still fails closed on backend-derived `appAccess.admin`
- [[005-data-models]] — organizations, memberships, users, agents, marketplace listings, and sandboxes back the new dashboards
- [[016-marketplace]] — marketplace health and moderation visibility now surface in admin-ui

## Specification

### New and expanded admin backend reads

Add or expand admin-role endpoints so `admin-ui` can render a real control plane:

- `GET /api/admin/overview`
  - returns user, org, agent, sandbox, and marketplace totals
  - includes runtime reconciliation summary
  - includes recent audit events
  - includes top org and listing snapshots
- `GET /api/admin/organizations`
  - returns developer/customer org summaries with member counts, agent counts, listing counts, and install counts
  - supports quick org-governance filtering by `kind`, `status`, and search
- `POST /api/admin/organizations`
  - creates a new org with `kind`, `plan`, `status`, and optional seeded membership for an existing platform user
- `GET /api/admin/organizations/:id`
  - returns the org console payload: org summary, members, agents, listings, installs, runtime rows, org-scoped audit, warnings, and active sessions pinned to that org
- `PATCH /api/admin/organizations/:id`
  - updates name, slug, plan, and org `status`
- `POST /api/admin/organizations/:id/members`
  - adds or upserts an org membership for an existing user
- `PATCH /api/admin/organizations/:id/members/:membershipId`
  - updates membership `role` and `status`, with last-owner protection
- `DELETE /api/admin/organizations/:id/members/:membershipId`
  - removes a membership, with last-owner protection
- `POST /api/admin/organizations/:id/session-context/reset`
  - clears `active_org_id` from sessions currently pointed at that org
- `DELETE /api/admin/organizations/:id/sessions`
  - revokes all refresh sessions currently pinned to that org
- `DELETE /api/admin/organizations/:id/sessions/:sessionId`
  - revokes one specific refresh session pinned to that org
- `DELETE /api/admin/organizations/:id`
  - deletes only archived, empty orgs
- `GET /api/admin/runtime`
  - returns sandbox inventory and reconciliation detail for runtime operations
- `GET /api/admin/marketplace`
  - returns listing status totals plus recent and top listing summaries
- `GET /api/admin/users`
  - now includes membership/org context useful for super-admin decisions
- `GET /api/admin/agents`
  - now includes creator/org/runtime context useful for super-admin decisions

Existing safe write actions remain:

- `PATCH /api/admin/users/:id`
- `DELETE /api/admin/users/:id`
- `POST /api/admin/sandboxes/:sandbox_id/reconcile/repair`

### Admin UI surfaces

`admin-ui` should expose:

- `/dashboard` — overview cockpit
- `/users` — people and access management
- `/organizations` — org inventory and health
- `/organizations/:id` — per-org console for lifecycle, memberships, sessions, assets, and audit
- `/agents` — global agent oversight
- `/runtime` — sandbox/runtime operations
- `/audit` — filterable audit-event viewer
- `/marketplace` — marketplace health and moderation visibility
- `/system` — health and system status drilldown

### UX requirements

- The panel must feel operationally dense, not placeholder-heavy.
- Every primary page should answer a real admin question without requiring raw API inspection.
- The organization surface must let an admin create a tenant, suspend/reactivate/archive it, manage memberships, and revoke org-scoped sessions without leaving admin-ui.
- Runtime repairs should be gated to the already-safe reconciliation actions only.
- Browser verification is required before calling the slice complete.

## Implementation Notes

- Keep the backend changes additive and centered in `ruh-backend/src/app.ts`.
- Reuse the existing sandbox reconciliation logic and audit store rather than duplicating runtime classification.
- Keep the admin UI within the established Ruh visual language, aligned closely with the agent-builder brand direction while raising the information density substantially.
- Organization `status` is now operational, not decorative: suspended/archived orgs should no longer grant builder or customer app access even if memberships remain active.
- Treat follow-on features observed during implementation as explicit future work, not scope creep for this slice.

## Test Plan

- Manual browser verification for login, navigation, filters, runtime view, audit view, and marketplace/system visibility
- Manual browser verification for org creation, org detail save, session revocation, and suspend/reactivate lifecycle actions
- Manual verification that user role/status mutations still work
- Manual verification that runtime repair actions succeed or fail cleanly against the reconciliation route
