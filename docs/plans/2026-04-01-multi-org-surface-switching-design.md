# Multi-Org Surface Switching Design

## Summary

`prasanjit@ruh.ai` needs one local account that can enter admin, builder, and customer surfaces without weakening the org gate. The user should keep a full memberships array across orgs, while each surface continues to operate against one active organization at a time.

## Problem

The backend already returns `memberships[]`, `activeOrganization`, `activeMembership`, and `appAccess`, and it already exposes `POST /api/auth/switch-org`. The gap is that the current clients fail closed when the active organization does not match the surface, even when the session already contains another eligible membership.

## Options

### Option 1: Remove the active-org gate

Reject. This breaks org-owned data boundaries for listing ownership, purchases, entitlements, and audit trails.

### Option 2: Change backend login to accept a surface hint

Viable, but broader than necessary. It adds a new login contract even though the existing session payload already contains enough information to resolve the correct org client-side.

### Option 3: Keep the backend contract and switch tenants client-side

Recommended. Use the existing `memberships[]` array plus `POST /api/auth/switch-org` to:

- seed `prasanjit@ruh.ai` with platform-admin, developer-org, and customer-org access
- auto-switch customer surfaces to a valid customer org when the current session is on a developer org
- auto-switch builder surfaces to a valid developer org when the current session is on a customer org
- expose explicit org switching in surfaces that already have an account/settings affordance

## Design

### Auth Contract

- Keep `appAccess` derived from the active org only
- Keep `memberships[]` as the complete org list
- Keep `sessions.active_org_id` as the single tenant context for the session
- Do not add a new backend login parameter in this slice

### Surface Behavior

- `ruh-frontend`
  - On login: if the login response lacks customer access but includes an eligible customer membership, call `POST /api/auth/switch-org` and continue with the switched response.
  - On session bootstrap: if `/api/auth/me` shows a wrong-surface session but the user has an eligible customer membership, auto-switch before redirecting to `/login`.
- `agent-builder-ui`
  - Apply the same pattern for developer-org access in the local auth path and session bootstrap.
  - Add manual org switching to the existing user-profile dropdown so builders can change developer org without logging out.
- `ruh_app`
  - On login and restore: if the current session lacks customer access but has an eligible customer membership, switch automatically.
  - Add manual org switching to Settings, where account context already exists.

## Testing

- backend seed integration confirms `prasanjit@ruh.ai` has the intended membership matrix
- customer-web login/session-gate tests cover auto-switch instead of access failure
- builder auth tests cover auto-switch to a developer org
- Flutter auth service/provider/widget tests cover auto-switch and manual switching

