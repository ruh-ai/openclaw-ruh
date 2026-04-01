# SPEC: App Access And Org Marketplace

[[000-INDEX|← Index]] | [[014-auth-system]] | [[015-admin-panel]] | [[016-marketplace]] | [[008-agent-builder-ui]] | [[009-ruh-frontend]] | [[018-ruh-app]]

## Status

approved

## Summary

Ruh needs one operating contract across four product surfaces: platform super-admins in `admin-ui`, developer organizations in `agent-builder-ui`, and customer-org admins/members in both `ruh-frontend` and `ruh_app`. This spec defines the end-state program for that contract: org-scoped app access, developer-org-owned marketplace listings, Stripe-backed customer-org purchases, and seat-based member assignment where org admins get initial access and members only gain access after direct assignment.

## Related Notes

- [[014-auth-system]] — tenant-aware session state, app-access decisions, invitations, and org switching all extend the auth foundation
- [[015-admin-panel]] — becomes the super-admin-only control plane for org creation, moderation, and marketplace oversight
- [[016-marketplace]] — moves from user installs to developer-org-owned listings and customer-org-owned purchases/entitlements
- [[008-agent-builder-ui]] — builder access must fail closed to developer-org memberships instead of the current local bypass
- [[009-ruh-frontend]] — customer web becomes an authenticated org-admin/member product, not an open sandbox tool
- [[018-ruh-app]] — Flutter mobile app uses the same customer-org contract as the web client
- [[SPEC-marketplace-store-parity]] — turns the approved org-entitlement program into a concrete store.ruh.ai-style catalog/detail/use rollout across customer surfaces
- [[SPEC-multi-tenant-auth-foundation]] — prerequisite auth/session slice already implemented

## Specification

### Goals

1. Enforce one truthful role-and-tenant access contract across admin, builder, customer web, and Flutter surfaces.
2. Make developer organizations the owners of marketplace listings and publishing actions.
3. Make customer organizations the owners of purchases, subscriptions, seat inventory, and assignments.
4. Support both customer onboarding paths:
   - self-serve org signup
   - platform-admin-created org plus invitation acceptance
5. Support real Stripe Checkout in test and production modes for both listing billing types:
   - one-time
   - subscription
6. Keep payouts manual in phase one.
7. Keep member access fail closed: org admins can use a purchased agent immediately; members require direct seat assignment.

### Non-goals

- Stripe Connect or automated developer payouts are out of scope for this phase.
- Team, department, or SCIM-based seat assignment is out of scope for this phase.
- A single listing offering multiple billing models simultaneously is out of scope; one listing chooses one billing model.
- Enterprise SSO may be added later, but local/testing login must remain available during this program.

### Identity And Organization Model

- `users` remain the human identity record.
- `platformRole` remains narrow:
  - `platform_admin`
  - `user`
- Organization context drives almost all authorization.
- `organizations.kind` is authoritative:
  - `developer`
  - `customer`
- Membership roles:
  - developer org: `owner`, `developer`
  - customer org: `owner`, `admin`, `employee`
- A user can belong to multiple organizations and switch active org.

### Shared Session And App-Access Contract

Every authenticated client surface must derive access from one shared backend session contract. Auth responses and `GET /api/auth/me` must expose:

- `platformRole`
- `memberships`
- `activeOrganization`
- `activeMembership`
- `appAccess`

`appAccess` is the fail-closed product-surface decision object:

- `admin`
  - `true` only for platform super-admins
- `builder`
  - `true` when the active organization is `developer` and the active membership role is `owner` or `developer`
- `customer`
  - `true` when the active organization is `customer` and the active membership role is `owner`, `admin`, or `employee`

Surface rules:

- `admin-ui`
  - requires `appAccess.admin`
- `agent-builder-ui`
  - requires `appAccess.builder`
- `ruh-frontend`
  - requires `appAccess.customer`
- `ruh_app`
  - requires `appAccess.customer`

### Onboarding And Invitations

Support both paths:

1. Self-serve customer onboarding
   - create account
   - create customer org
   - become org owner/admin
   - proceed to marketplace and checkout

2. Platform-admin-provisioned onboarding
   - platform admin creates org
   - platform admin invites org admin
   - org admin accepts invite and activates account

Invitations are required for:

- customer org admins inviting employees
- developer org owners inviting developers
- platform admins inviting bootstrap org admins after admin-created org setup

### Marketplace Ownership

Listings are developer-org assets:

- listing owner is `owner_org_id`
- publishing rights require active developer-org membership
- moderation rights require platform super-admin access

Purchases are customer-org assets:

- checkout is initiated by a customer org admin/owner
- billing ownership is stored at the org entitlement layer
- an individual user never “owns” a purchased listing

### Billing And Entitlements

Per-listing billing model:

- `one_time`
- `subscription`

Stripe contract:

- Checkout uses real Stripe Checkout Sessions
- webhook processing is authoritative for entitlement activation and lifecycle updates
- phase one uses the platform Stripe account only
- developer payouts are recorded operationally/manual, not automated

Entitlement model:

- each successful purchase creates an org entitlement
- each entitlement tracks:
  - org id
  - listing id
  - billing model
  - purchase/subscription status
  - seat capacity
  - seat usage
  - Stripe object references
- org admins/owners can access purchased agents immediately
- employees require direct seat assignment

### Seat Assignment

- direct assignment only, no teams
- assigning a member consumes one seat
- revoking frees one seat
- reassignment must be explicit
- assignment is blocked when no seats remain
- member access is revoked when:
  - assignment is removed
  - entitlement is canceled/expired/unpaid and the grace rules end

### Program Slices

1. Shared session contract and app gating
2. Org onboarding, invitations, acceptance, org switching
3. Developer-org marketplace publishing and admin moderation
4. Stripe checkout and org entitlement lifecycle
5. Seat assignment and member-only access enforcement
6. Customer parity across `ruh-frontend` and `ruh_app`

## Exhaustive Test Matrix

### Backend Auth And Session

- register bootstrap developer org returns `appAccess.builder = true`
- register bootstrap customer org returns `appAccess.customer = true`
- platform admin login returns `appAccess.admin = true`
- login with multiple memberships returns the correct `activeOrganization`, `activeMembership`, and `appAccess`
- switching to developer org flips `appAccess.builder` on and `customer` off
- switching to customer org flips `appAccess.customer` on and `builder` off
- inactive memberships are excluded from app access
- cookie-backed and bearer-backed `requireAuth` both resolve the same user/session

### Admin UI Access

- anonymous request to `/dashboard` redirects to `/login`
- authenticated non-admin request is redirected/denied after session bootstrap
- platform admin request can load admin routes
- logout clears session state and returns to `/login`

### Builder Access

- anonymous request to `/agents` redirects to `/authenticate`
- customer-org user cannot remain in builder after bootstrap
- developer-org owner can load `/agents`
- developer-org developer can load `/agents`
- platform admin without active developer membership cannot use builder

### Customer Web And Flutter Access

- anonymous request opens login/onboarding
- customer org admin can sign in and load customer app
- customer org employee can sign in and load customer app
- developer-only user is denied from customer surfaces
- active-org switching to a developer org removes customer app access until switched back

### Invitations

- platform-admin-created org can invite first org admin
- invited org admin can accept and gain customer access
- customer org admin can invite employee
- developer org owner can invite developer
- expired/invalid invite tokens fail closed

### Publishing

- developer org owner can create listing draft
- developer org developer can create/submit listing draft
- customer org admin cannot publish
- platform admin can approve/reject submitted listing

### Checkout And Entitlements

- one-time listing checkout success creates active org entitlement
- subscription listing checkout success creates active subscription entitlement
- webhook failure does not silently grant access
- canceled or unpaid subscription transitions entitlement state correctly

### Seats And Member Access

- org admin can access purchased agent before member assignment
- employee without assignment cannot access purchased agent
- assigning a seat grants member access
- removing a seat revokes member access
- assigning past capacity fails closed

### Cross-Surface Parity

- the same org/member can sign in on web and Flutter and see the same purchased/assigned agents
- revoked assignment disappears from both surfaces
- org switch changes visible agent inventory consistently across surfaces

## Implementation Notes

- Build this program as one coordinated initiative, but land it in strict vertical slices with passing tests at each slice boundary.
- Prefer pure authorization helpers in the backend so app-access decisions and entitlement math can be tested outside UI code.
- Avoid adding new auth bypasses for local development; seeded users and local login already exist for testing.
- Slice progress as of 2026-03-31:
  - backend, `admin-ui`, `agent-builder-ui`, `ruh-frontend`, and `ruh_app` all now enforce the shared `appAccess` contract
  - `ruh_app` ships a native login/bootstrap/logout flow backed by bearer-token session restore through `/api/auth/me`
  - the next open slice is org lifecycle: onboarding, invitations, acceptance, and active-org switching

## Test Plan

- Backend:
  - unit tests for app-access helpers, invite policy, entitlement math, seat assignment rules, Stripe webhook handlers
  - contract tests for auth/session, publish, checkout, entitlement, assignment endpoints
  - integration tests for org creation, membership, invites, purchases, assignments, cancellations
- Web:
  - Bun/Jest tests for session bootstrap and route gating
  - Playwright tests for admin, builder, customer-web flows
- Flutter:
  - widget/service tests for login, org switching, entitlement visibility, and assigned-agent access
  - native `integration_test` coverage for live desktop login against the seeded local backend fixtures so macOS login regressions are caught without manual window automation
- Payments:
  - Stripe test-mode Checkout plus webhook fixture coverage
