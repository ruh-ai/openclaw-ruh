# App Access And Org Marketplace Design

**Problem**

Ruh currently has pieces of the target model, but not the product contract:

- backend auth already knows about organizations, memberships, and active-org sessions
- builder still bypasses auth in local development
- admin-ui still assumes a raw global admin token
- ruh-frontend is still the old sandbox-management surface
- marketplace is still user-install based instead of developer-org-owned and customer-org-owned
- ruh_app has no real session/bootstrap model yet

That means the platform cannot yet be tested as a real marketplace with super-admins, developers, customer org admins, and customer members.

## Recommendation

Treat this as one coordinated program, but execute it as strict vertical slices against one shared contract:

1. shared session and app-access contract
2. onboarding + invitations + org switching
3. developer publishing + moderation
4. Stripe checkout + org entitlements
5. seat assignment + member access
6. customer parity across web and Flutter

This avoids the main failure mode here: shipping multiple partial auth systems that disagree about who can enter which app and who owns a purchase.

## Chosen Operating Model

### Platform

- `platform_admin` is the only global power role
- platform admins use `admin-ui`

### Developers

- developers act through developer organizations
- developer org owners/developers use `agent-builder-ui`
- marketplace listings belong to developer orgs, not users

### Customers

- customer org owners/admins buy agents for the org
- customer org owners/admins can use purchased agents immediately
- customer org employees only gain access after direct seat assignment
- both `ruh-frontend` and `ruh_app` implement the same customer contract

### Marketplace And Billing

- one listing, one billing model
- support both `one_time` and `subscription` listings overall
- Stripe Checkout is real from day one
- payouts remain manual
- seat-based access is enforced

## First Implementation Slice

The first slice should not try to publish or charge yet. It should instead make access truthful across surfaces.

Deliverables:

- backend auth responses include `activeMembership` and `appAccess`
- backend auth middleware accepts bearer token and session cookie access token
- builder local-development auth bypasses are removed
- `admin-ui` fails closed to platform super-admin access
- `agent-builder-ui` fails closed to developer-org access
- `ruh-frontend` gets a real login/bootstrap shell and fails closed to customer access
- `ruh_app` gets an auth/session bootstrap foundation and a login gate

Non-deliverables for slice 1:

- invites
- org creation UI beyond current local register/bootstrap
- publishing
- Stripe checkout
- entitlements
- seat assignment

## Why Start Here

Every later slice depends on correct app entry boundaries. If the wrong user can enter the wrong app, later marketplace, checkout, and seat tests become noisy and untrustworthy.

The cleanest first move is to make every client ask the same backend question:

- who is the user
- what organization is active
- what membership is active
- which app surfaces are allowed right now

That creates one reusable contract that later slices can extend instead of replace.
