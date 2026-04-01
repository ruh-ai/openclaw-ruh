# SPEC: Marketplace Store Parity

[[000-INDEX|← Index]] | [[016-marketplace]] | [[018-ruh-app]] | [[009-ruh-frontend]] | [[SPEC-app-access-and-org-marketplace]]

## Status

draft

## Summary

`ruh_app` currently ships a marketplace design prototype with hard-coded cards, while `ruh-frontend` only exposes a minimal browse page backed by the legacy `/api/marketplace/listings` contract. Live-reference research on 2026-03-31 against [store.ruh.ai](https://store.ruh.ai/agents) and Sarah Assistant showed that real parity requires a typed public catalog, detail pages, and an authenticated conversion flow that leads into actual product usage. This spec defines that parity for Ruh's platform while staying aligned with the approved org-owned entitlement program in [[SPEC-app-access-and-org-marketplace]] instead of copying the reference store's raw payloads or legacy user-centric install semantics.

## Related Notes

- [[016-marketplace]] — current marketplace implementation, routes, and shared package
- [[018-ruh-app]] — Flutter customer surface that currently renders a dummy marketplace
- [[009-ruh-frontend]] — customer web surface that currently has browse-only marketplace UI
- [[014-auth-system]] — active-org session state and `appAccess.customer` gating
- [[005-data-models]] — current marketplace tables and the future schema work this parity requires
- [[LEARNING-2026-03-31-store-marketplace-reference-contract]] — durable observations from the live `store.ruh.ai` contract

## Specification

### Reference Contract Observed On 2026-03-31

Reference sources:

- [store.ruh.ai agents catalog](https://store.ruh.ai/agents)
- [Sarah Assistant detail page](https://store.ruh.ai/agents/d15e3c9d-64e2-4bbc-8244-36a7948f201d)
- [Marketplace agents API](https://api.ruh.ai/api/v1/marketplace/agents?page=1&page_size=24&sort_by=MOST_POPULAR)
- [Sarah Assistant API detail](https://api.ruh.ai/api/v1/marketplace/agents/d15e3c9d-64e2-4bbc-8244-36a7948f201d)

Observed user-facing contract:

- the store has separate typed surfaces for `agents`, `mcps`, and `workflows`
- item detail pages exist per type
- public catalog reads support search, category selection, sort order, and pagination
- card data includes identity, marketing copy, owner, popularity, and paid/free state
- Sarah-style detail pages include related workflows and MCP servers plus a conversion CTA
- the conversion action is authenticated; unauthenticated `POST /use-agent` returns `403 Not authenticated`

Observed implementation caveat:

- the live Sarah detail payload exposes far more than the marketplace UI needs, including runtime system prompt text and MCP tool schemas
- Ruh should match the user-facing browse/detail/use behavior, not copy that backend payload overexposure into its own public API

### Current Repo State

Current repo behavior falls short of that contract in four separate layers:

1. Flutter is a pure mock.
   - `ruh_app/lib/screens/marketplace/marketplace_screen.dart` is hard-coded demo content with a TODO comment to replace it with `/api/marketplace/listings`
2. Customer web is browse-only.
   - `ruh-frontend/app/marketplace/page.tsx` loads `/api/marketplace/listings`, but there is no `/marketplace/[slug]` detail route and no purchase/use flow
3. Shared marketplace code is still legacy-install based.
   - `packages/marketplace-ui` only models agent listings plus install/uninstall state
4. Backend marketplace and customer inventory are structurally incomplete.
   - `ruh-backend/src/marketplaceRoutes.ts` and `ruh-backend/src/marketplaceStore.ts` only support agent listings and per-user installs
   - customer surfaces currently rely on `GET /api/agents`, but that backend route requires builder context and only returns creator-owned agents, so it cannot become the truthful post-purchase inventory for customer orgs

### Product Contract To Implement

Parity on this platform means the following end-to-end contract:

1. A customer can browse a real marketplace catalog on web and Flutter with truthful data.
2. A customer org owner/admin can acquire an item for the active customer org.
3. Free and paid items both resolve into org-owned access, not per-user installs.
4. Customer org owners/admins can use purchased items immediately.
5. Customer org employees only see and use items that have been explicitly assigned to them.
6. Acquired items appear in the actual customer-facing agent inventory so the user can launch the experience, not just view a receipt or badge.

### Backend And Data Contract

#### 1. Introduce typed marketplace items

The current `marketplace_listings` table is agent-only because it stores `agent_id` as the canonical source object. To reach store parity, Ruh needs either:

- a unified typed marketplace item record with `item_type` plus `source_id`, or
- separate typed publish records with a normalized public catalog read layer

Either approach must support at least:

- `agent`
- `workflow`
- `mcp`

Required public fields:

- `id`
- `slug`
- `item_type`
- `title`
- `summary`
- `description`
- `category`
- `tags`
- `icon_url` or `avatar_url`
- `screenshots`
- `owner_org_id`
- `owner_display_name`
- `status`
- `version_label`
- `use_count`
- `avg_rating`
- `is_paid`
- `billing_model`
- `price_label`
- `access_action`
- `related_item_ids`

Required internal fields:

- source object reference
- entitlement defaults
- publish workflow metadata
- Stripe product/price references once checkout lands

#### 2. Separate public marketplace DTOs from runtime config DTOs

Do not expose builder/runtime internals such as:

- raw system prompts
- secret connector metadata
- full MCP tool schemas
- private operational URLs

The public detail API should return only the metadata needed to render the catalog and decide the next user action.

#### 3. Replace installs with org entitlements and assignments

This work must implement the approved direction from [[SPEC-app-access-and-org-marketplace]]:

- customer-org-owned entitlements
- org-admin immediate access
- employee seat assignment
- Stripe-backed lifecycle for paid items

That means `marketplace_installs` can no longer be the source of truth for customer usage. It becomes either:

- a deprecated legacy table for backfill/migration only, or
- an operational event log separate from access control

#### 4. Add truthful customer inventory APIs

Customer surfaces need a post-acquisition inventory that is derived from entitlements and assignments, not from builder-owned `/api/agents`.

Minimum API surface:

- `GET /api/marketplace/catalog`
- `GET /api/marketplace/catalog/:slugOrId`
- `POST /api/marketplace/catalog/:id/checkout`
- `GET /api/marketplace/my/entitlements`
- `GET /api/marketplace/my/assigned-items`
- `POST /api/marketplace/entitlements/:id/assignments`
- `DELETE /api/marketplace/entitlements/:id/assignments/:userId`
- `POST /api/marketplace/catalog/:id/use`

Catalog query support should include:

- `item_type`
- `category`
- `search`
- `tags`
- `sort_by`
- `page`
- `page_size`

#### 5. Define the "use item" handoff

Store parity is incomplete unless clicking the CTA leads into a usable agent experience.

For Ruh, `use` must resolve through one of these explicit contracts:

- create or reveal a customer-org-visible deployed agent instance tied to the entitlement
- open an existing assigned agent instance for that org/member
- reject with a truthful access-state response when purchase or assignment is missing

The repo should not continue sending customer users into builder-owned `/api/agents` reads.

### Client Surface Contract

#### `ruh-frontend`

- replace the current list-only page with a real catalog experience
- add `/marketplace/[slug]` detail routes
- show price/paid badges, owner, usage, rating, and CTA state
- support login redirects into detail or checkout
- show customer-org entitlement state after login

#### `ruh_app`

- replace the hard-coded `MarketplaceScreen` mock with real providers/services/models
- add detail navigation for Sarah-style pages
- support search, type/category filters, loading/error/empty states, and pagination
- render post-login CTA states such as `Use`, `Buy`, `Assigned`, `Unavailable`, or `Request access`
- surface acquired items in the main customer inventory after purchase or assignment

#### Shared package boundary

`packages/marketplace-ui` can continue owning shared web React primitives, but Flutter needs its own Dart models and service layer. The important reuse target is the HTTP contract and state machine, not the component code.

### Delivery Slices

#### Slice 1: real agent marketplace parity

- keep scope to `agent` items first
- ship truthful catalog list + detail + CTA states on both web and Flutter
- add auth-gated `use` preconditions and entitlement-aware responses

2026-04-01 progress:

- implemented the first half of this slice on the current legacy backend contract:
  - `ruh-frontend` now ships `/marketplace/[slug]` detail plus install CTA state driven by `/api/marketplace/my/installs`
  - `ruh_app` now uses real marketplace models/services/providers, a `/marketplace/:slug` detail route, and the live install endpoint
- implemented the first truthful post-install bridge on top of that legacy contract:
  - `ruh-backend` now exposes `GET /api/marketplace/my/installed-listings`, joining legacy install rows with listing metadata for customer surfaces
  - `ruh_app` root workspace screen now uses that endpoint instead of builder-only `/api/agents`, so installed marketplace agents actually appear in the customer app and the detail CTA can hand off there
- still open inside Slice 1:
  - replace the legacy per-user install CTA with entitlement-aware `use`/assignment state
  - replace the installed-listings bridge with real org entitlement + launch semantics instead of a listing-detail handoff

2026-04-01 approved next slice:

- marketplace install for agent listings should create a real customer runtime agent instead of only a `marketplace_installs` row
- the runtime agent should be scoped to the active customer org and current user, so each installed agent gets a private gateway without weakening org gating
- the backend should persist a runnable published snapshot in `agent_versions.snapshot` and use that snapshot when creating installed runtime agents
- the customer app should open chat against that installed runtime agent, provisioning a sandbox/gateway on first open instead of treating the listing itself as runnable
- the temporary `my/installed-listings` bridge should be retired once the customer workspace uses these real runtime agents

#### Slice 2: checkout and entitlement lifecycle

- add Stripe checkout session creation
- add webhook-driven entitlement activation
- add customer-org entitlement reads

#### Slice 3: assigned inventory and launch

- show purchased/assigned agents in customer inventory
- let admins launch immediately
- enforce employee assignment before launch

#### Slice 4: workflows and MCP catalog types

- expand catalog typing beyond agents without changing the public read contract

### Implementation Notes

Expected backend work areas:

- `ruh-backend/src/marketplaceRoutes.ts`
- `ruh-backend/src/marketplaceStore.ts`
- `ruh-backend/src/schemaMigrations.ts`
- new entitlement/assignment store modules
- auth/session helpers that resolve active customer org context during checkout and use

Expected frontend work areas:

- `packages/marketplace-ui/src/types/index.ts`
- `packages/marketplace-ui/src/hooks/useMarketplace.ts`
- new `ruh-frontend/app/marketplace/[slug]/page.tsx`

Expected Flutter work areas:

- new marketplace models, services, and providers under `ruh_app/lib/`
- `ruh_app/lib/screens/marketplace/marketplace_screen.dart`
- new detail screen and navigation wiring
- customer inventory integration with the existing agent list/dashboard flow

## Test Plan

- Backend unit tests for entitlement math, CTA state resolution, and assignment rules
- Backend contract tests for catalog list/detail, checkout, entitlement, assignment, and use endpoints
- Backend integration tests for Stripe-webhook lifecycle and org-scoped access decisions
- `packages/marketplace-ui` tests covering typed DTO parsing, filter state, and CTA behavior
- `ruh-frontend` route/component tests for catalog page, detail page, and login-to-CTA transitions
- `ruh_app` widget/service/integration tests for marketplace list, detail, purchase/use states, and acquired-agent inventory refresh
