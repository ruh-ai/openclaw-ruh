# Employee Marketplace

[[000-INDEX|← Index]] | [[014-auth-system|Auth System]] | [[015-admin-panel|Admin Panel]]

## Status
<!-- implemented -->

## Summary

Agent marketplace where developers publish agents and end users browse/install them. Shared UI package (`@ruh/marketplace-ui`) consumed by agent-builder-ui (publish), ruh-frontend (browse/install), and admin-ui (moderate).

## Related Notes
- [[014-auth-system]] — Developer role for publishing, auth for installs/reviews
- [[015-admin-panel]] — Marketplace moderation queue
- [[005-data-models]] — marketplace_listings, marketplace_reviews, marketplace_installs, agent_versions tables

## Database Tables

### marketplace_listings
Agent submissions to the marketplace. Status flow: draft → pending_review → published/rejected → archived.

### marketplace_reviews
User ratings (1-5) and reviews. One review per user per listing (UNIQUE constraint).

### marketplace_installs
Tracks which users installed which listings. One install per user per listing.

### agent_versions
Frozen snapshots of agent config at each published version.

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/marketplace/listings | Public | Browse published listings |
| GET | /api/marketplace/listings/:slug | Public | Listing detail |
| POST | /api/marketplace/listings | Developer | Create listing |
| PATCH | /api/marketplace/listings/:id | Owner | Update metadata |
| POST | /api/marketplace/listings/:id/submit | Owner | Submit for review |
| POST | /api/marketplace/listings/:id/review | Admin | Approve/reject |
| GET | /api/marketplace/listings/:id/reviews | Public | List reviews |
| POST | /api/marketplace/listings/:id/reviews | Auth | Add review |
| POST | /api/marketplace/listings/:id/install | Auth | Install |
| DELETE | /api/marketplace/listings/:id/install | Auth | Uninstall |
| GET | /api/marketplace/my/installs | Auth | User's installs |
| GET | /api/marketplace/my/listings | Developer | Developer's listings |
| GET | /api/marketplace/categories | Public | Category list |

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
| `packages/marketplace-ui/src/` | Shared React components |
| `ruh-frontend/app/marketplace/page.tsx` | End user browse page |
