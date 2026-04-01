# Multi-Tenant Auth Foundation Design

**Problem**

Ruh needs one auth model that supports:
- platform admins
- developer organizations that build and publish agents
- customer organizations that buy and assign agents
- employees inside those customer organizations

The repo already has local JWT auth, but it is still mostly a single-user/global-role model. It does not yet express multi-org membership, active tenant context, or a testing-friendly fallback path that still aligns with future SSO.

**Recommendation**

Build the system in two layers at once:
- external IdP / SSO ready identity model
- local email/password fallback for development and testing

That means the platform owns authorization and tenancy, while authentication can later come from either local credentials or a real IdP.

## Approach Options

### Option 1: Expand the existing `users.role` and `users.org_id`

This is the fastest short-term path, but it hard-codes business rules into one user row and breaks down quickly for:
- multi-org users
- org switching
- developer org versus customer org separation
- future enterprise SSO

### Option 2: Add tenant memberships and active-org sessions while keeping local login

This is the recommended path.

Benefits:
- supports local testing immediately
- supports external IdP later without redoing authorization
- keeps platform admin separate from tenant-scoped roles
- allows one user to belong to multiple orgs

### Option 3: Start with external IdP only

This is too early. It blocks testing and local development, and it still does not solve organization authorization on its own.

## Chosen Design

### Identity

- `users` stays the canonical human record.
- `auth_identities` links a user to `provider + subject`.
- `provider = "local"` is used for current email/password login.
- future providers can include Google, Okta, Azure AD, or other SAML/OIDC integrations.

### Platform authority

- keep the existing global `admin` concept for platform administration
- move day-to-day access control into tenant memberships

### Tenants

- `organizations.kind` distinguishes:
  - `developer`
  - `customer`
- users join organizations through `organization_memberships`
- membership roles:
  - `owner`
  - `admin`
  - `developer`
  - `employee`

### Session context

- `sessions.active_org_id` stores which tenant the user is acting in
- auth responses return:
  - user profile
  - active organization
  - memberships
  - compatibility legacy fields

### Local testing path

- local email/password login remains supported
- registration can optionally bootstrap an org and initial membership
- builder auth page renders a local fallback form when no external auth URL is configured

## First Slice

The first slice is intentionally narrow:
- schema and store support for organizations, memberships, identities, and active-org sessions
- auth route expansion for richer session context and org switching
- builder local login/register fallback

Not in the first slice:
- enterprise SSO handshakes
- org-level marketplace entitlements
- employee assignment UI
- full tenant-aware frontend rewrites across all apps

## Success Criteria

- a tester can register/login locally without any SSO setup
- that local user can optionally bootstrap a developer or customer org
- auth session responses include active org and memberships
- a logged-in session can switch organizations safely
- builder `/authenticate` works in local fallback mode without relying on an external auth product
