# Admin Billing Control Plane Design

## Goal

Give `admin-ui` a real customer billing support surface without turning Ruh into a shadow accounting system. Stripe remains the financial source of truth, while Ruh owns entitlement, seat, and access decisions for customer organizations.

## Current Problem

The admin panel can now govern organizations operationally, but it still cannot answer the commercial questions that matter in production:

- Which customer orgs are paying, trialing, past due, or manually overridden?
- What subscription or invoice problem is blocking access?
- Which seats are available or consumed for a purchased listing?
- When should support pause, resume, comp, or extend access?
- How do operators reconcile Stripe truth with product access truth?

Today the repo points to this future in [[SPEC-app-access-and-org-marketplace]] and [[SPEC-marketplace-store-parity]], but the actual admin surface and backend objects do not exist yet.

## Recommended Approach

Build the billing-control plane as a support console over Stripe plus Ruh entitlements:

- Stripe owns money state.
- Ruh owns product-access state.
- `admin-ui` lets operators inspect both and take bounded support actions.

## Core Model

### Stripe truth

Authoritative for:

- customers
- subscriptions
- invoices
- payment success/failure
- refunds/credits
- checkout state

### Ruh truth

Authoritative for:

- which customer org owns the commercial relationship in product terms
- which marketplace listing the org is entitled to use
- how many seats exist and are in use
- which users are assigned
- whether support has temporarily overridden access

## Data Model Direction

Add a minimal but durable billing layer:

- `billing_customers`
- `billing_subscriptions`
- `billing_invoices`
- `org_entitlements`
- `org_entitlement_overrides`
- `billing_events`

The crucial separation is:

- `billing_status` = financial status
- `entitlement_status` = current access status

That allows real-world states like `past_due` billing with `grace_period` access.

## Admin UX Direction

### Organization console

Add a `Billing` tab to each customer-org console with:

- summary cards
- subscriptions table
- invoices table
- entitlement state panel
- seat summary
- support actions
- billing timeline

### Fleet ops

Add a future top-level `Billing Ops` view for:

- past due
- unpaid
- expiring trial
- override active
- sync drift
- failed invoices

## Operator Actions

Allowed:

- sync from Stripe
- retry billing reconciliation
- pause entitlement
- resume entitlement
- revoke entitlement
- grant temporary access
- comp seats temporarily
- cancel at period end through Stripe-backed action

Not allowed:

- mark invoice paid locally
- fake subscription changes only in Ruh
- refund outside Stripe

## Recommended Rollout

### Slice 1

Read-heavy support foundation:

- billing mirror tables
- webhook ingestion + Stripe sync
- org billing read route
- org billing tab in admin
- support actions:
  - sync
  - temporary override
  - pause/resume entitlement

### Slice 2

Commercial lifecycle:

- subscription cancel/update support
- invoice drilldowns
- customer-org billing timeline and failure surfacing

### Slice 3

Customer self-serve:

- Checkout session creation
- billing portal handoff
- org-admin self-serve seat and billing management

## Risks

- Entitlement logic can become incoherent if billing and access state are not modeled separately.
- Support overrides can become invisible debt unless they are explicit rows with start/end windows and audit.
- Stripe webhook drift will happen in practice; admin sync/reconcile must exist from the start.

## Verification Standard

The first slice should be considered complete only when an admin can:

- open a customer org billing tab
- see local billing mirror + entitlement truth
- sync the org from Stripe
- apply a bounded access override
- see the action reflected in admin audit/history
