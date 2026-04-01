# LEARNING: `store.ruh.ai` parity is a full-stack catalog, entitlement, and usage problem

[[000-INDEX|← Index]] | [[016-marketplace]] | [[SPEC-marketplace-store-parity]]

## Date
- 2026-03-31

## Context
- A research pass compared the Flutter marketplace in `ruh_app` against the live `store.ruh.ai` experience using Sarah Assistant as the reference item.

## What Happened
- The live reference store exposes typed public browse surfaces for agents, MCPs, and workflows.
- Sarah's catalog card and detail endpoints include pricing state, owner, popularity, and related-item references.
- The live "use agent" action is authenticated; unauthenticated attempts return `403 Not authenticated`.
- The current repo is structurally different:
  - `ruh_app` marketplace is mock data
  - `ruh-frontend` is browse-only
  - `packages/marketplace-ui` is built around install/uninstall
  - `ruh-backend` marketplace is still agent-only plus per-user installs
  - customer-facing inventory still points at builder-owned `/api/agents`

## Durable Insight
- Matching the live store is not a Flutter reskin. It requires a truthful catalog API, detail routes, CTA state machine, auth-aware conversion flow, and post-purchase usage handoff.
- The current `/api/agents` route cannot become customer inventory because it requires builder context and returns creator-owned agents only.
- Ruh should not copy the live Sarah detail payload verbatim. The reference API exposes system prompts and MCP tool schemas that are unnecessary and risky for a public marketplace API.
- The right target architecture remains [[SPEC-app-access-and-org-marketplace]]: customer-org entitlements plus assignment, not legacy per-user installs.

## Evidence
- [store.ruh.ai agents catalog](https://store.ruh.ai/agents)
- [Sarah Assistant page](https://store.ruh.ai/agents/d15e3c9d-64e2-4bbc-8244-36a7948f201d)
- [Marketplace agents API](https://api.ruh.ai/api/v1/marketplace/agents?page=1&page_size=24&sort_by=MOST_POPULAR)
- [Sarah Assistant API detail](https://api.ruh.ai/api/v1/marketplace/agents/d15e3c9d-64e2-4bbc-8244-36a7948f201d)

## Follow-up
- Build against [[SPEC-marketplace-store-parity]] in vertical slices: real agent catalog parity first, then checkout/entitlements, then assigned-inventory launch, then workflow/MCP expansion.
