# SPEC: Multi-Tenant Auth Foundation

[[000-INDEX|← Index]] | [[014-auth-system]] | [[005-data-models]]

## Status

implemented

## Summary

Ruh needs to support four operating contexts: platform admins, developer organizations that build agents, customer organizations that buy agents, and employees inside those customer organizations who use assigned agents. This spec introduces the first foundation slice for that model: tenant memberships, active-organization session context, and a non-SSO local email/password path that remains available for development and testing while real SSO is added later.

## Related Notes

- [[014-auth-system]] — current JWT auth and session model that this feature extends
- [[005-data-models]] — adds tenant membership, identity, and active-org session records
- [[004-api-reference]] — adds auth session context and org-switch endpoints
- [[008-agent-builder-ui]] — builder auth page gets a local login/register fallback when no external auth provider is configured
- [[016-marketplace]] — future customer-org entitlements and employee assignment build on this auth foundation

## Specification

### Goals

1. Keep local email/password login available so operators can test the product without configuring a real SSO provider.
2. Add first-class organization membership so one user can belong to multiple organizations.
3. Add active-organization session context so the backend can answer “who is this user in this tenant right now?”
4. Keep the existing auth API working for current callers while expanding the response contract for newer multi-tenant clients.
5. Leave room for later external IdP / SSO integration without redoing tenant authorization.

### Non-goals

- This slice does not deliver enterprise SSO yet.
- This slice does not migrate every frontend to the final multi-tenant UX in one pass.
- This slice does not yet move marketplace installs or employee assignments to org-level entitlement tables; that comes after the auth foundation is in place.

### Target Identity Model

- `users` remain the human identity record.
- Global platform authority remains narrow:
  - `admin` continues to represent the platform admin role for now.
  - non-admin users are authorized primarily through organization membership, not a global role.
- `organizations.kind` distinguishes `developer` and `customer` tenants.
- `organization_memberships` attach users to organizations with tenant-scoped roles:
  - `owner`
  - `admin`
  - `developer`
  - `employee`
- `auth_identities` records external identity-provider linkage for future SSO. Local email/password users also get a `provider = "local"` identity row so the future model stays consistent.

### Session Model

- The existing JWT access token and refresh-session model remains in place.
- `sessions` gains `active_org_id`.
- On login / registration:
  - if the user has exactly one active membership, `active_org_id` defaults to that org
  - if the user has no memberships, `active_org_id` is null
- Auth routes expose richer session context:
  - current user
  - tenant memberships
  - active organization
  - a backward-compatible legacy role field for existing clients
- New `POST /api/auth/switch-org` updates the current session's `active_org_id` after membership validation.

### Local Login / Bootstrap Contract

- `POST /api/auth/register` remains the local email/password entry point.
- The request may optionally include:
  - `organizationName`
  - `organizationSlug`
  - `organizationKind`
  - `membershipRole`
- When those fields are present, register:
  - creates the organization
  - creates the membership
  - sets the new session's `active_org_id`
  - creates a `local` auth-identity mapping
- This path is intentionally suitable for development, demos, seed data, and non-SSO testing.

### Builder Auth Fallback

- `agent-builder-ui` keeps the existing external-auth redirect path when a real auth provider URL is configured.
- When no external auth provider is configured, `/authenticate` must render a local email/password login/register form backed by Ruh backend auth endpoints.
- The fallback form supports:
  - login
  - registration
  - optional org bootstrap for developer testing
- The form is a transitional testing path, not the final polished identity UX.

## Implementation Notes

- Backend first:
  - add ordered migrations for `organizations.kind`, `organization_memberships`, `auth_identities`, and `sessions.active_org_id`
  - add store helpers for memberships and identity rows
  - extend auth routes and auth test coverage
- Frontend second:
  - keep current cookie/session semantics for now
  - add builder local auth fallback without blocking later session-token hardening work
- Preserve compatibility:
  - do not break current admin login
  - do not remove existing `role` / `org_id` fields yet; treat them as transitional compatibility fields
- Implemented in this slice:
  - `POST /api/auth/register` can bootstrap an organization and owner membership for local testing
  - auth responses now include `memberships`, `activeOrganization`, and `platformRole`
  - `POST /api/auth/switch-org` updates the current session's `active_org_id`
  - `agent-builder-ui/app/(auth)/authenticate/page.tsx` falls back to a local login/register form when `NEXT_PUBLIC_AUTH_URL` is unset

## Test Plan

- Backend contract tests:
  - register with org bootstrap returns session context including memberships and active org
  - login returns memberships and active org when the user belongs to an org
  - switch-org rejects non-members and accepts valid memberships
- Backend integration tests:
  - creating org + membership through auth routes persists correct rows
  - session `active_org_id` changes when switching orgs
  - local identity rows are created for registered users
- Builder tests:
  - `/authenticate` renders external redirect mode when `NEXT_PUBLIC_AUTH_URL` is configured
  - `/authenticate` renders local login/register fallback when it is not configured
  - successful local login routes back into the requested builder page
