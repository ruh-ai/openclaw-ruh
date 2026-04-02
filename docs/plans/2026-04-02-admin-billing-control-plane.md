# Admin Billing Control Plane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first billing-control-plane slice so admins can inspect customer-org billing state, sync Stripe-backed data, and manage bounded entitlement overrides from the org console.

**Architecture:** Stripe remains the financial source of truth, while Ruh mirrors the minimum billing state needed for operations and keeps entitlement/access decisions locally. The first slice adds billing mirror tables, Stripe sync/webhook projection, org billing admin routes, and an admin billing tab inside the organization console.

**Tech Stack:** Bun, Express, PostgreSQL, Next.js 15, React 19, Stripe API/webhooks, existing admin-ui control-plane primitives

---

### Task 1: Add the billing schema

**Files:**
- Modify: `ruh-backend/src/schemaMigrations.ts`
- Modify: `docs/knowledge-base/005-data-models.md`
- Test: `ruh-backend/tests/integration/` (new billing-schema integration test)

**Step 1: Write the failing test**

Add an integration test that expects the new tables to exist:

- `billing_customers`
- `billing_subscriptions`
- `billing_invoices`
- `org_entitlements`
- `org_entitlement_overrides`
- `billing_events`

**Step 2: Run test to verify it fails**

Run: `cd ruh-backend && NODE_ENV=test bun test tests/integration/<billing-schema-test>.test.ts`

Expected: FAIL because the relations do not exist.

**Step 3: Write minimal implementation**

Add a new ordered migration in `ruh-backend/src/schemaMigrations.ts` that creates the billing mirror, entitlement, override, and event tables with indexes on `org_id`, Stripe ids, and status fields.

**Step 4: Run test to verify it passes**

Run: `cd ruh-backend && NODE_ENV=test bun test tests/integration/<billing-schema-test>.test.ts`

Expected: PASS.

### Task 2: Create the billing store layer

**Files:**
- Create: `ruh-backend/src/billingStore.ts`
- Test: `ruh-backend/tests/unit/billingStore.test.ts`

**Step 1: Write the failing test**

Cover:

- create/get billing customer by `org_id`
- upsert subscription mirror by Stripe subscription id
- upsert invoice mirror by Stripe invoice id
- create/update org entitlement
- create entitlement override
- list org billing summary

**Step 2: Run test to verify it fails**

Run: `cd ruh-backend && bun test tests/unit/billingStore.test.ts`

Expected: FAIL because the store does not exist.

**Step 3: Write minimal implementation**

Create `billingStore.ts` with focused CRUD helpers and summary readers.

**Step 4: Run test to verify it passes**

Run: `cd ruh-backend && bun test tests/unit/billingStore.test.ts`

Expected: PASS.

### Task 3: Add entitlement-state resolution helpers

**Files:**
- Create: `ruh-backend/src/billing/entitlementState.ts`
- Test: `ruh-backend/tests/unit/entitlementState.test.ts`
- Modify: `ruh-backend/src/auth/appAccess.ts`

**Step 1: Write the failing test**

Cover:

- `active` entitlement grants access
- `past_due` billing with future `grace_ends_at` resolves to `grace_period` access
- `revoked` entitlement blocks access
- active override can temporarily re-enable access

**Step 2: Run test to verify it fails**

Run: `cd ruh-backend && bun test tests/unit/entitlementState.test.ts`

Expected: FAIL because the helper does not exist.

**Step 3: Write minimal implementation**

Add a pure helper that projects billing mirror + overrides into one entitlement decision.

**Step 4: Run test to verify it passes**

Run: `cd ruh-backend && bun test tests/unit/entitlementState.test.ts`

Expected: PASS.

### Task 4: Add Stripe projection and sync plumbing

**Files:**
- Create: `ruh-backend/src/stripeClient.ts`
- Create: `ruh-backend/src/billingSync.ts`
- Test: `ruh-backend/tests/unit/billingSync.test.ts`

**Step 1: Write the failing test**

Cover:

- Stripe customer/subscription/invoice payload projection into local mirror rows
- sync creates/updates local mirror rows
- sync updates linked entitlements

**Step 2: Run test to verify it fails**

Run: `cd ruh-backend && bun test tests/unit/billingSync.test.ts`

Expected: FAIL because the sync layer does not exist.

**Step 3: Write minimal implementation**

Add a small Stripe wrapper plus `billingSync.ts`.

**Step 4: Run test to verify it passes**

Run: `cd ruh-backend && bun test tests/unit/billingSync.test.ts`

Expected: PASS.

### Task 5: Add Stripe webhook ingestion

**Files:**
- Create: `ruh-backend/src/billingWebhookHandler.ts`
- Modify: `ruh-backend/src/app.ts`
- Test: `ruh-backend/tests/contract/adminBillingWebhook.test.ts`

**Step 1: Write the failing test**

Cover:

- accepted webhook signature → local sync runs
- bad signature → request rejected
- supported event updates billing mirror and entitlement

**Step 2: Run test to verify it fails**

Run: `cd ruh-backend && bun test tests/contract/adminBillingWebhook.test.ts`

Expected: FAIL because the route/handler do not exist.

**Step 3: Write minimal implementation**

Add the webhook handler plus the route in `app.ts`.

**Step 4: Run test to verify it passes**

Run: `cd ruh-backend && bun test tests/contract/adminBillingWebhook.test.ts`

Expected: PASS.

### Task 6: Add admin billing read routes

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Test: `ruh-backend/tests/contract/adminBillingRoutes.test.ts`
- Modify: `docs/knowledge-base/004-api-reference.md`

**Step 1: Write the failing test**

Cover:

- `GET /api/admin/organizations/:id/billing`
- read includes billing customer, subscriptions, invoices, entitlements, overrides, and recent billing events
- non-admin access fails closed

**Step 2: Run test to verify it fails**

Run: `cd ruh-backend && bun test tests/contract/adminBillingRoutes.test.ts`

Expected: FAIL because the route does not exist.

**Step 3: Write minimal implementation**

Add one org billing read route to `app.ts` that composes the first-slice billing payload.

**Step 4: Run test to verify it passes**

Run: `cd ruh-backend && bun test tests/contract/adminBillingRoutes.test.ts`

Expected: PASS.

### Task 7: Add bounded admin billing actions

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Test: `ruh-backend/tests/contract/adminBillingActions.test.ts`

**Step 1: Write the failing test**

Cover:

- `POST /api/admin/organizations/:id/billing/sync`
- `POST /api/admin/organizations/:id/billing/entitlements/:id/pause`
- `POST /api/admin/organizations/:id/billing/entitlements/:id/resume`
- `POST /api/admin/organizations/:id/billing/entitlements/:id/override`
- audit event written for each action

**Step 2: Run test to verify it fails**

Run: `cd ruh-backend && bun test tests/contract/adminBillingActions.test.ts`

Expected: FAIL because the routes do not exist.

**Step 3: Write minimal implementation**

Add only the bounded support actions for the first slice.

**Step 4: Run test to verify it passes**

Run: `cd ruh-backend && bun test tests/contract/adminBillingActions.test.ts`

Expected: PASS.

### Task 8: Add the admin billing UI tab

**Files:**
- Modify: `admin-ui/app/(admin)/organizations/[id]/page.tsx`
- Modify: `admin-ui/lib/admin-api.ts`
- Modify: `admin-ui/app/(admin)/_components/AdminPrimitives.tsx` if new display primitives are needed
- Test: `admin-ui` page/component test for org billing rendering

**Step 1: Write the failing test**

Cover:

- billing section renders billing summary from the org billing route
- subscriptions and invoices render
- sync and pause/resume/override actions call the correct endpoints

**Step 2: Run test to verify it fails**

Run: `cd admin-ui && bun test <billing-ui-test>`

Expected: FAIL because the UI does not exist.

**Step 3: Write minimal implementation**

Add a billing section to the org console using the existing admin control-plane primitives.

**Step 4: Run test to verify it passes**

Run: `cd admin-ui && bun test <billing-ui-test>`

Expected: PASS.

### Task 9: Browser-verify the billing slice

**Files:**
- Modify: `docs/journal/2026-04-02.md`
- Modify: `docs/knowledge-base/015-admin-panel.md`
- Modify: `docs/knowledge-base/016-marketplace.md`

**Step 1: Write the verification script**

Create a small Playwright verification script that:

- logs into `admin-ui`
- opens a seeded customer org
- loads the billing tab
- exercises `sync`
- exercises one bounded entitlement action on disposable test data

**Step 2: Run verification**

Run the script against the local stack.

Expected: admin billing surface renders and actions complete cleanly.

**Step 3: Fix the first real issue found**

Implement only the minimal fix required by the verification result.

**Step 4: Re-run verification**

Expected: PASS.

Plan complete and saved to `docs/plans/2026-04-02-admin-billing-control-plane.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
