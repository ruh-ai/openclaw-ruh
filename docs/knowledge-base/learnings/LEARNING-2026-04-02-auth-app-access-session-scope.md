# LEARNING: Auth `appAccess` for customer surfaces must be scoped to the active org

[[000-INDEX|← Index]] | [[014-auth-system]] | [[018-ruh-app]]

## Date
- 2026-04-02

## Context
- While verifying the Flutter customer app in Chrome with `prasanjit@ruh.ai`, the Installed Agents workspace mounted successfully but immediately failed with `Could not load installed agents` / `Not authorized.` even though the sidebar still showed an authenticated session.

## What Happened
- The browser session called `GET /api/auth/me` and received:
  - `activeOrganization = Acme Developer Studio`
  - `appAccess.customer = true`
- That combination is invalid for customer surfaces. The user had both:
  - an active developer-org membership (`acme-dev`)
  - a customer-org membership (`globex`)
- `ruh_app` trusted `appAccess.customer` and mounted the customer workspace, but the next call to `GET /api/marketplace/my/installed-listings` correctly enforced the JWT/session org and returned `403 Customer access requires an active customer organization`.

## Durable Insight
- Auth payloads for `/api/auth/login`, `/api/auth/me`, and `/api/auth/switch-org` must derive `appAccess` from the current active membership/session org, not from the union of all memberships.
- `memberships[]` is the cross-org recovery list. `appAccess` is the active-session gate.
- If those two concepts are mixed, customer apps can enter a half-authenticated state: the shell renders, but customer-only APIs fail later with org-scoped `403`s.

## Fix
- Added `deriveSessionAppAccess()` in `ruh-backend/src/auth/appAccess.ts`.
- Updated `ruh-backend/src/authRoutes.ts` so auth responses use session-scoped access derivation while the existing aggregate helper remains available for broader read-model summaries.
- Added regression coverage in:
  - `ruh-backend/tests/unit/auth-app-access.test.ts`
  - `ruh-backend/tests/contract/authEndpoints.test.ts`

## Verification
- `cd ruh-backend && JWT_ACCESS_SECRET=test-access-secret JWT_REFRESH_SECRET=test-refresh-secret NODE_ENV=test bun test tests/unit/auth-app-access.test.ts`
- `cd ruh-backend && JWT_ACCESS_SECRET=test-access-secret JWT_REFRESH_SECRET=test-refresh-secret NODE_ENV=test bun test tests/contract/authEndpoints.test.ts -t 'scopes customer access|does not advertise customer access'`
- `cd ruh-backend && bun run typecheck`
- Live local verification on 2026-04-02:
  - `POST /api/auth/login` for `prasanjit@ruh.ai` now returns `activeOrganization.kind = developer` with `appAccess.customer = false`
  - `POST /api/auth/switch-org` to `globex` returns `activeOrganization.kind = customer` with `appAccess.customer = true`
  - `GET /api/marketplace/my/installed-listings` with the switched access token returns `200`
  - Reloading the old browser session now fails closed back to `/login` instead of mounting the customer workspace against the developer org

## Follow-up
- If any customer surface renders an authenticated shell but customer-only APIs return `403 Customer access requires an active customer organization`, compare `activeOrganization.kind` and `appAccess.customer` first before debugging UI state.
