# Employee Marketplace

[[000-INDEX|← Index]] | [[014-auth-system|Auth System]] | [[015-admin-panel|Admin Panel]]

## Status
<!-- implemented -->

## Summary

Agent marketplace where developers publish agents and end users browse/install them. Shared UI package (`@ruh/marketplace-ui`) is consumed by agent-builder-ui (publish), ruh-frontend (browse/install), and admin-ui (moderate). The current backend is still transitional: listing creation is creator-authorized, listing management is now developer-org-owned via `owner_org_id`, and paid checkout / org entitlements are still open. Local QA/demo environments can now populate the catalog with real agent-backed published listings via `bun run seed:demo-marketplace` instead of relying on empty state or ad hoc manual inserts. As of 2026-04-01, the customer launch path is no longer a dead-end: marketplace install now creates a per-user runtime agent scoped to the active customer org, persists or reuses a runnable published snapshot in `agent_versions`, and exposes that installed runtime through `GET /api/marketplace/my/installed-listings` plus customer-aware `GET /api/agents` / `GET /api/agents/:id` reads. The Flutter customer app now opens those installed runtime agents and provisions their sandbox/gateway through `POST /api/agents/:id/launch` on first chat open. The remaining gap to `store.ruh.ai` is checkout, org entitlements, seat assignment, and richer post-purchase admin controls beyond this per-user runtime slice.
Agent marketplace where developers publish agents and end users browse/install them. Shared UI package (`@ruh/marketplace-ui`) is consumed by agent-builder-ui (publish), ruh-frontend (browse/install), and admin-ui (moderate). The current backend is still transitional: listing creation is creator-authorized, listing management is now developer-org-owned via `owner_org_id`, and paid checkout / org entitlements are still open. Local QA/demo environments can now populate the catalog with real agent-backed published listings via `bun run seed:demo-marketplace` instead of relying on empty state or ad hoc manual inserts. As of 2026-04-01, the customer launch path is no longer a dead-end: marketplace install now creates a per-user runtime agent scoped to the active customer org, persists or reuses a runnable published snapshot in `agent_versions`, and exposes that installed runtime through `GET /api/marketplace/my/installed-listings` plus customer-aware `GET /api/agents` / `GET /api/agents/:id` reads. The Flutter customer app now opens those installed runtime agents and provisions their sandbox/gateway through `POST /api/agents/:id/launch` on first chat open. A same-day UI pass under [[SPEC-ruh-app-customer-surface-redesign]] also removed prototype-style copy from the Flutter marketplace screens and made install/use states read as customer workspace actions instead of implementation scaffolding. The remaining gap to `store.ruh.ai` is checkout, org entitlements, seat assignment, and richer post-purchase admin controls beyond this per-user runtime slice.

## Related Notes
- [[014-auth-system]] — Developer role for publishing, auth for installs/reviews
- [[015-admin-panel]] — Marketplace moderation queue
- [[005-data-models]] — marketplace_listings, marketplace_installs, marketplace_runtime_installs, and agent_versions tables
- [[018-ruh-app]] — Flutter customer app will surface org-owned purchases and member-visible assigned agents

## Database Tables

### marketplace_listings
Agent submissions to the marketplace. Status flow: draft → pending_review → published/rejected → archived.

New rows now stamp `owner_org_id` from the active developer org so teammates in the same developer org can see and manage the listing even though creation still requires the publishing user to own the referenced agent.

### marketplace_reviews
User ratings (1-5) and reviews. One review per user per listing (UNIQUE constraint).

### marketplace_installs
Tracks which users installed which listings. One install per user per listing.

This table is now explicitly legacy. The long-term replacement is customer-org entitlements plus seat assignments from [[SPEC-app-access-and-org-marketplace]].

### marketplace_runtime_installs
Tracks the real installed customer runtime for the current slice. Each row binds one published listing to one active customer-org/user pair and points at the installed `agents` row that the customer app can actually open and launch.

### agent_versions
Frozen snapshots of agent config at each published version. Marketplace publish/approve now relies on `agent_versions.snapshot` as the reusable source package for creating installed customer runtime agents.

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/marketplace/listings | Public | Browse published listings |
| GET | /api/marketplace/listings/:slug | Public | Listing detail |
| POST | /api/marketplace/listings | Developer org | Create listing for a creator-owned agent |
| PATCH | /api/marketplace/listings/:id | Owner org | Update metadata |
| POST | /api/marketplace/listings/:id/submit | Owner org | Submit for review |
| POST | /api/marketplace/listings/:id/review | Admin | Approve/reject |
| GET | /api/marketplace/listings/:id/reviews | Public | List reviews |
| POST | /api/marketplace/listings/:id/reviews | Auth | Add review |
| POST | /api/marketplace/listings/:id/install | Customer org | Create or reuse the current user's installed runtime agent |
| DELETE | /api/marketplace/listings/:id/install | Customer org | Remove the current user's installed runtime agent |
| GET | /api/marketplace/my/installs | Customer org | Installed listing ids for the active customer org/user |
| GET | /api/marketplace/my/installed-listings | Customer org | Installed marketplace inventory joined with listing metadata and installed runtime agent ids |
| GET | /api/marketplace/my/listings | Developer org | Listings owned by the active developer org |
| GET | /api/marketplace/categories | Public | Category list |

Current ownership contract:
- publish/create routes require auth plus an active developer-org membership
- listing creation rejects any agent not owned by the current creator
- new listings stamp `owner_org_id` from the active developer org
- update/submit/my-listings now resolve ownership through `owner_org_id`, with legacy `publisher_id` fallback for pre-migration rows
- install/uninstall now require an active customer org and create a per-user runtime agent in that tenant instead of only writing a legacy install badge
- the new runtime rows live in `marketplace_runtime_installs`, while `marketplace_installs` remains legacy/backfill-only
- `my/installed-listings` now joins listing metadata with the installed runtime agent id so the customer app can open the real agent detail/chat flow

## Categories

general, marketing, sales, support, engineering, data, finance, hr, operations, custom

## Shared UI Package

Location: `packages/marketplace-ui/` (`@ruh/marketplace-ui`)

### Components
- `AgentCard` — Listing card for catalog grid
- `CategoryFilter` — Category pill selector
- `SearchBar` — Search input
- `RatingStars` — Star rating display/input
- `InstallButton` — Install/uninstall toggle

### Hooks
- `useMarketplace` — Fetch listings, install/uninstall

This shared package still reflects the legacy install/uninstall contract. It does not yet model typed catalog items, detail CTA states, checkout, entitlements, or seat assignment; see [[SPEC-marketplace-store-parity]].

### Integration
- `agent-builder-ui`: Developer publishes at `/marketplace`
- `ruh-frontend`: End user browses at `/marketplace`
- `admin-ui`: Moderates at `/marketplace`
- Linked via `file:../packages/marketplace-ui`

## Key Files

| File | Purpose |
|------|---------|
| `ruh-backend/src/marketplaceStore.ts` | Listing CRUD |
| `ruh-backend/src/marketplaceRoutes.ts` | API routes |
| `ruh-backend/src/demoMarketplaceSeed.ts` | Idempotent local demo agent/listing seed |
| `ruh-backend/scripts/seed-demo-marketplace.ts` | Runnable local marketplace seed command |
| `packages/marketplace-ui/src/` | Shared React components |
| `ruh-frontend/app/marketplace/page.tsx` | End user browse page |
| `ruh-frontend/app/marketplace/[slug]/page.tsx` | Customer-web agent detail route |
| `ruh_app/lib/screens/marketplace/marketplace_screen.dart` | Flutter marketplace list backed by the live backend catalog |
| `ruh_app/lib/screens/marketplace/marketplace_detail_screen.dart` | Flutter marketplace detail + install action |
| `ruh_app/lib/screens/agents/agent_list_screen.dart` | Flutter customer workspace inventory backed by installed marketplace listings plus runtime agent ids |
| `ruh_app/lib/services/marketplace_service.dart` | Flutter marketplace API client |
| `ruh_app/lib/services/agent_service.dart` | Flutter customer runtime launch via `POST /api/agents/:id/launch` |
| `ruh_app/lib/providers/marketplace_provider.dart` | Flutter marketplace provider layer |

## Local Demo Seed

For a repeatable local catalog with real agent/listing rows:

```bash
cd ruh-backend
bun run seed:demo-marketplace
```

The current seed publishes:

- `Inventory Alert Bot` — developer owner `dev-owner@acme-dev.test`, org `acme-dev`, category `operations`
- `Google Ads Optimizer` — developer owner `dev-owner@nova-labs.test`, org `nova-labs`, category `marketing`

Those demo listings are backed by real `agents` rows, appear in `/api/marketplace/listings`, and are visible to the matching developer owner through `/api/agents` and `/api/marketplace/my/listings`.

## Related Specs

- [[SPEC-app-access-and-org-marketplace]] — moves marketplace ownership from user installs to developer-org listings, customer-org purchases, Stripe checkout, and seat-based assignment
- [[SPEC-marketplace-store-parity]] — defines the store.ruh.ai-style catalog/detail/use parity rollout across backend, web, and Flutter while preserving org-owned entitlements
- [[SPEC-admin-billing-control-plane]] — defines the admin/operator billing layer over Stripe plus Ruh org entitlements for customer-org purchases
- [[SPEC-ruh-app-customer-surface-redesign]] — customer-facing Flutter marketplace redesign that removes internal/demo copy and clarifies install/use hierarchy
- [[SPEC-local-demo-marketplace-seeding]] — repeatable local seed for real agent-backed published listings used in marketplace QA/demo environments

## Related Learnings

- [[LEARNING-2026-03-31-store-marketplace-reference-contract]] — live `store.ruh.ai` research showed that marketplace parity requires typed catalog APIs, auth-gated conversion, and a truthful post-purchase usage handoff
