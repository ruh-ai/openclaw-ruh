# Marketplace Customer Runtime Install Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make marketplace install create a real customer runtime agent and allow the Flutter app to launch it with its own sandbox/gateway.

**Architecture:** Persist a reusable published runtime snapshot for source agents, create a per-user installed runtime agent in the active customer org, and provision/configure its sandbox lazily on first open. Reuse the existing `agents` table and chat stack wherever possible while keeping builder-only behavior isolated behind the active org kind.

**Tech Stack:** Bun, Express, PostgreSQL, Flutter, Riverpod

---

### Task 1: Document and gate the new marketplace runtime contract

**Files:**
- Modify: `docs/knowledge-base/specs/SPEC-marketplace-store-parity.md`
- Modify: `docs/knowledge-base/016-marketplace.md`
- Modify: `TODOS.md`

**Step 1: Record the approved contract**

- Add the customer-runtime agent model and first-open launch flow to the marketplace spec.

**Step 2: Record the active implementation task**

- Add an active TODO entry so future agents can continue the slice cleanly.

### Task 2: Add backend snapshot and runtime-install storage

**Files:**
- Create: `ruh-backend/src/agentVersionStore.ts`
- Create: `ruh-backend/src/auth/customerAccess.ts`
- Modify: `ruh-backend/src/schemaMigrations.ts`
- Modify: `ruh-backend/src/marketplaceStore.ts`
- Modify: `ruh-backend/src/agentStore.ts`
- Test: `ruh-backend/tests/unit/marketplaceStore.test.ts`
- Test: `ruh-backend/tests/integration/marketplaceCrud.test.ts`

**Step 1: Write failing backend tests**

- Add tests for customer-runtime install rows scoped by `(listing, org, user)` and published snapshot persistence.

**Step 2: Implement minimal storage**

- Add agent-version snapshot helpers and a marketplace runtime-install table/store contract.

### Task 3: Make install create a real customer runtime agent

**Files:**
- Modify: `ruh-backend/src/marketplaceRoutes.ts`
- Modify: `ruh-backend/src/app.ts`
- Modify: `ruh-backend/src/marketplaceStore.ts`
- Modify: `ruh-backend/src/agentStore.ts`
- Test: `ruh-backend/tests/contract/marketplaceListings.test.ts`

**Step 1: Write failing route tests**

- Assert install requires active customer org context and returns a runtime-linked install response.

**Step 2: Implement install flow**

- Ensure a published snapshot exists.
- Create or reuse a customer-installed `agents` row.
- Create or reuse the scoped marketplace runtime-install row.
- Return truthful installed state for the active customer org.

### Task 4: Add first-open launch provisioning

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Modify: `ruh-backend/src/sandboxManager.ts` if needed
- Test: `ruh-backend/tests/contract/marketplaceListings.test.ts`

**Step 1: Write failing launch coverage**

- Add coverage for launching an installed runtime agent into a configured sandbox.

**Step 2: Implement launch flow**

- Reuse sandbox creation/configuration helpers.
- Provision a sandbox only when the installed runtime has none yet.
- Return the updated runtime agent with sandbox info.

### Task 5: Switch Flutter to real installed runtime agents

**Files:**
- Modify: `ruh_app/lib/models/marketplace_listing.dart`
- Modify: `ruh_app/lib/services/marketplace_service.dart`
- Modify: `ruh_app/lib/services/agent_service.dart`
- Modify: `ruh_app/lib/providers/marketplace_provider.dart`
- Modify: `ruh_app/lib/providers/agent_provider.dart`
- Modify: `ruh_app/lib/screens/agents/agent_list_screen.dart`
- Modify: `ruh_app/lib/screens/marketplace/marketplace_detail_screen.dart`
- Test: `ruh_app/test/services/marketplace_service_test.dart`
- Test: `ruh_app/test/screens/agent_list_screen_test.dart`

**Step 1: Write failing Flutter tests**

- Add coverage for installed runtime parsing and the install/open flow.

**Step 2: Implement client changes**

- Show installed runtime agents in the workspace.
- Replace detail-page dead-end CTA with open/launch behavior.
- Route chat into the installed runtime agent’s sandbox.

### Task 6: Verify and record the slice

**Files:**
- Modify: `docs/journal/2026-04-01.md`
- Modify: `docs/knowledge-base/018-ruh-app.md`

**Step 1: Run focused verification**

- Backend unit, contract, integration, and typecheck
- Flutter tests and analyze

**Step 2: Record what shipped**

- Update the journal and affected KB notes with the real runtime install behavior.
