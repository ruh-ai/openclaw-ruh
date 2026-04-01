# SPEC: Local Demo Marketplace Seeding

[[000-INDEX|← Index]] | [[016-marketplace]] | [[014-auth-system]] | [[005-data-models]]

## Status

implemented

## Summary

Local development needs real marketplace listings backed by actual `agents` rows instead of an empty catalog or ad hoc manual inserts. This spec defines an idempotent backend seed path that creates developer-owned demo agents and publishes their listings so builder, customer web, and Flutter surfaces all have stable real data to exercise.

## Related Notes

- [[016-marketplace]] — published listings should come from the same backend listing model the product uses
- [[014-auth-system]] — demo listings depend on the seeded developer/customer fixture accounts
- [[005-data-models]] — the seed touches `agents`, `marketplace_listings`, and optionally review/install tables
- [[SPEC-local-test-user-seeding]] — provides the prerequisite seeded users and organizations

## Specification

### Goals

1. Provide repeatable local demo data for the marketplace using real `agents` and `marketplace_listings` rows.
2. Ensure seeded listings are owned by seeded developer-org accounts and visible in the builder for those developers.
3. Publish seeded listings so customer surfaces can browse them without manual moderation steps.
4. Keep the seed idempotent so reruns update or preserve the same logical demo records instead of creating duplicates.

### Non-goals

- This does not implement Stripe checkout, org entitlements, or seat assignment.
- This does not replace the need for the full builder publish UI.
- This does not provision real sandboxes or deploy the seeded demo agents.

### Seed Contract

- The seed command requires the local QA users/orgs from [[SPEC-local-test-user-seeding]] to exist first.
- It creates at least one real agent owned by a seeded developer account.
- It creates a matching marketplace listing for that agent with status `published`.
- It may create multiple demo agents/listings when helpful for category coverage.
- Optional demo reviews and installs may be added to make the catalog look populated, but listings must remain real `agentId`-backed rows.

### Idempotency Rules

- Agent identity is stable by owner + demo seed slug/name.
- Listing identity is stable by agent.
- Reruns update metadata and republish the same logical listing instead of creating another listing for the same demo agent.

## Implementation Notes

- Prefer a dedicated backend seed module/script rather than hiding marketplace data creation inside auth-only seed logic.
- Expose a runnable script in `ruh-backend/package.json`.
- Integration coverage should prove:
  - demo agents exist
  - published listings exist
  - each listing references a real agent row
  - reruns stay idempotent
- Implemented as:
  - `ruh-backend/src/demoMarketplaceSeed.ts`
  - `ruh-backend/scripts/seed-demo-marketplace.ts`
  - `bun run seed:demo-marketplace`
- The current seeded demo catalog is:
  - `Inventory Alert Bot` owned by `dev-owner@acme-dev.test` / `acme-dev`
  - `Google Ads Optimizer` owned by `dev-owner@nova-labs.test` / `nova-labs`
- Both listings are published immediately for local QA and include one demo install plus one review so the marketplace UI shows non-zero installs and ratings.

## Test Plan

- Backend integration test for initial seed creation
- Backend integration test for rerun idempotency
- Local manual verification:
  - developer account sees the seeded agent in builder
  - customer marketplace surfaces list the published demo agent
