# SPEC: Admin Billing Control Plane

[[000-INDEX|← Index]] | [[015-admin-panel]] | [[016-marketplace]] | [[014-auth-system]]

## Status

approved

## Summary

Build a proper customer-org billing control plane in `admin-ui` with Stripe as the financial source of truth and Ruh org entitlements as the product-access source of truth. The admin panel should become a billing support and governance console: operators can inspect subscriptions, invoices, payment failures, entitlement status, seat capacity, and manual overrides, while all actual money movement continues through Stripe.

## Related Notes

- [[015-admin-panel]] — admin-ui becomes the support surface for billing and customer-org commercial operations
- [[016-marketplace]] — customer-org purchases, entitlements, and seat assignment live on top of marketplace listings
- [[014-auth-system]] — entitlement and org lifecycle status affect app-access decisions for customer orgs
- [[005-data-models]] — requires new billing mirror, entitlement, override, and event tables
- [[004-api-reference]] — needs admin billing reads and support-action routes
- [[SPEC-app-access-and-org-marketplace]] — approved end-state program for Stripe-backed customer-org purchases and seat-based access
- [[SPEC-marketplace-store-parity]] — concrete marketplace rollout that depends on billing, entitlement, and assignment truth

## Specification

### Goals

1. Let platform admins manage customer-org billing from `admin-ui` without building a fake internal accounting system.
2. Keep Stripe authoritative for financial state: customers, subscriptions, invoices, payment intents, refunds, and checkout state.
3. Keep Ruh authoritative for product state: org entitlements, seat capacity, seat usage, assignments, and support overrides.
4. Make billing operations auditable, supportable, and safe for live customer-org incidents.
5. Support future self-serve customer billing while giving super-admins the operator tooling first.

### Non-goals

- Replacing Stripe with internal invoice or subscription state
- Allowing admins to mark invoices paid or mutate payment outcomes only inside Ruh
- Automated developer payouts or Stripe Connect
- SCIM/team-based seat assignment in the first phase

### Sources Of Truth

#### Stripe

Stripe remains authoritative for:

- customer identity in the billing system
- subscription lifecycle
- invoice lifecycle
- payment success/failure
- refunds and credit notes
- checkout completion

#### Ruh

Ruh remains authoritative for:

- mapping a customer org to a Stripe customer
- mapping a listing purchase to an org entitlement
- seat capacity and seat usage
- org-member assignments
- support overrides, temporary access, and manual comp actions
- billing-support audit events

### Data Model

#### `billing_customers`

Maps a Ruh customer org to Stripe billing identity.

#### `billing_subscriptions`

Mirror of active or historical Stripe subscriptions relevant to org access.

#### `billing_invoices`

Snapshot mirror for admin visibility and support workflows.

#### `org_entitlements`

The core Ruh access record.

Fields should include:

- `org_id`
- `listing_id`
- `billing_model`
- `billing_status`
- `entitlement_status`
- `seat_capacity`
- `seat_in_use`
- Stripe object references where applicable

#### `org_entitlement_overrides`

Manual support interventions that intentionally diverge access from normal billing-derived state.

#### `billing_events`

Normalized event trail for Stripe syncs and admin-side billing actions.

### Access State Model

Billing state and product access state must remain separate.

- `billing_status` answers: what is true financially?
- `entitlement_status` answers: what access should the product grant right now?

Example:

- Stripe subscription is `past_due`
- Ruh entitlement can still be `grace_period`
- Customer access remains allowed until `grace_ends_at`

### Stripe Contract

Webhook processing is authoritative for billing lifecycle changes.

Relevant events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.created`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.finalized`
- `charge.refunded`

Webhook processing must:

1. verify signature
2. write a normalized billing event
3. sync local billing mirror rows
4. update the linked Ruh entitlement
5. emit audit/system events on failure or intervention

### Admin UI Contract

#### Organization billing tab

Every customer-org console should gain a `Billing` tab with:

- summary cards
- subscriptions table
- invoices table
- entitlement panel
- seat summary
- support actions
- billing timeline

#### Future billing ops fleet page

Add a future top-level fleet view for:

- past-due orgs
- unpaid orgs
- expiring trials
- active overrides
- webhook drift/failures
- invoice failures in the last 7/30 days

### Allowed Admin Actions

Allowed:

- sync org billing state from Stripe
- pause entitlement access
- resume entitlement access
- revoke entitlement access
- grant temporary access override
- comp seats temporarily
- cancel subscription at period end
- inspect invoice/subscription/customer links

Disallowed:

- directly marking invoices paid in Ruh
- directly editing Stripe-owned subscription state without Stripe API
- changing payment outcomes only in local DB
- issuing refunds outside Stripe

### First Implementation Slice

Build the first slice in this order:

1. billing mirror tables and store layer
2. Stripe sync/webhook ingestion
3. admin org billing read route
4. admin billing tab in org console
5. bounded support actions:
   - sync
   - temporary access override
   - pause/resume entitlement

Do not start with checkout UI. Operator visibility and support controls must land first so later checkout failures can be debugged safely.

## Implementation Notes

- Keep money truth in Stripe and access truth in Ruh.
- Reuse the existing admin control-plane patterns: summary + detail + action buttons + audit visibility.
- Keep billing actions fail closed and heavily audited.
- Mirror enough Stripe state locally for operations and UI speed, but do not build a second accounting system.
- First implemented slice on `2026-04-02`:
  - backend schema and store for `billing_customers`, `billing_subscriptions`, `billing_invoices`, `org_entitlements`, `org_entitlement_overrides`, and `billing_events`
  - admin billing routes in `ruh-backend/src/app.ts` for fleet ops, org billing detail, customer linkage, mirrored subscriptions/invoices, and entitlement support actions
  - branded admin surfaces in `admin-ui`:
    - `/billing`
    - `/organizations/:id/billing`
- Stripe webhook sync and entitlement-aware customer app gating remain the next implementation slice.

## Test Plan

- Backend unit tests for entitlement-state resolution and override precedence
- Backend unit tests for Stripe-event to local-state projection
- Backend contract tests for admin billing read and support-action routes
- Backend integration tests for webhook ingestion and reconciliation
- Admin-ui browser verification for billing rendering, sync, and support actions
