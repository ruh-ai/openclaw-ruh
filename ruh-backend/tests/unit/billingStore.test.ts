import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({
  rows: [],
  rowCount: 0,
}));
const mockClient = { query: mockQuery };

mock.module('../../src/db', () => ({
  withConn: async (fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

mock.module('uuid', () => ({
  v4: () => 'billing-test-uuid',
}));

import * as billingStore from '../../src/billingStore';

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('upsertBillingCustomer', () => {
  test('inserts or updates a billing customer by org', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'billing-test-uuid',
        org_id: 'org-1',
        stripe_customer_id: 'cus_123',
        billing_email: 'billing@example.com',
        company_name: 'Acme Corp',
        tax_country: 'IN',
        tax_id: 'TAX123',
        default_payment_method_brand: 'visa',
        default_payment_method_last4: '4242',
        created_at: '2026-04-02T00:00:00Z',
        updated_at: '2026-04-02T00:00:00Z',
      }],
      rowCount: 1,
    });

    const customer = await billingStore.upsertBillingCustomer({
      orgId: 'org-1',
      stripeCustomerId: 'cus_123',
      billingEmail: 'billing@example.com',
      companyName: 'Acme Corp',
    });

    expect(customer.orgId).toBe('org-1');
    expect(customer.stripeCustomerId).toBe('cus_123');
    expect(customer.billingEmail).toBe('billing@example.com');
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('INSERT INTO billing_customers');
    expect(sql).toContain('ON CONFLICT (org_id) DO UPDATE');
  });
});

describe('getBillingCustomerByOrgId', () => {
  test('returns null when a billing customer is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await billingStore.getBillingCustomerByOrgId('org-missing');

    expect(result).toBeNull();
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['org-missing']);
  });
});

describe('upsertBillingSubscription', () => {
  test('upserts a billing subscription by stripe subscription id', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'billing-test-uuid',
        org_id: 'org-1',
        listing_id: 'listing-1',
        entitlement_id: 'ent-1',
        stripe_subscription_id: 'sub_123',
        stripe_price_id: 'price_123',
        stripe_product_id: 'prod_123',
        status: 'active',
        quantity: 5,
        cancel_at_period_end: false,
        current_period_start: '2026-04-01T00:00:00Z',
        current_period_end: '2026-05-01T00:00:00Z',
        trial_ends_at: null,
        grace_ends_at: null,
        last_synced_at: '2026-04-02T00:00:00Z',
        created_at: '2026-04-02T00:00:00Z',
        updated_at: '2026-04-02T00:00:00Z',
      }],
      rowCount: 1,
    });

    const subscription = await billingStore.upsertBillingSubscription({
      orgId: 'org-1',
      listingId: 'listing-1',
      entitlementId: 'ent-1',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
      quantity: 5,
    });

    expect(subscription.stripeSubscriptionId).toBe('sub_123');
    expect(subscription.quantity).toBe(5);
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('INSERT INTO billing_subscriptions');
    expect(sql).toContain('ON CONFLICT (stripe_subscription_id) DO UPDATE');
  });
});

describe('upsertBillingInvoice', () => {
  test('upserts a billing invoice by stripe invoice id', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'billing-test-uuid',
        org_id: 'org-1',
        entitlement_id: 'ent-1',
        billing_subscription_id: 'sub-local-1',
        stripe_invoice_id: 'in_123',
        stripe_subscription_id: 'sub_123',
        status: 'open',
        currency: 'usd',
        amount_due: 10000,
        amount_paid: 0,
        amount_remaining: 10000,
        hosted_invoice_url: 'https://invoice',
        invoice_pdf_url: 'https://invoice.pdf',
        due_at: '2026-04-10T00:00:00Z',
        paid_at: null,
        last_synced_at: '2026-04-02T00:00:00Z',
        created_at: '2026-04-02T00:00:00Z',
        updated_at: '2026-04-02T00:00:00Z',
      }],
      rowCount: 1,
    });

    const invoice = await billingStore.upsertBillingInvoice({
      orgId: 'org-1',
      stripeInvoiceId: 'in_123',
      status: 'open',
      amountDue: 10000,
    });

    expect(invoice.stripeInvoiceId).toBe('in_123');
    expect(invoice.amountDue).toBe(10000);
    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('INSERT INTO billing_invoices');
    expect(sql).toContain('ON CONFLICT (stripe_invoice_id) DO UPDATE');
  });
});

describe('upsertOrgEntitlement', () => {
  test('inserts a new org entitlement when no existing row matches', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'billing-test-uuid',
          org_id: 'org-1',
          listing_id: 'listing-1',
          billing_customer_id: 'bc-1',
          billing_subscription_id: 'bs-1',
          billing_model: 'subscription',
          billing_status: 'active',
          entitlement_status: 'active',
          seat_capacity: 10,
          seat_in_use: 2,
          grace_ends_at: null,
          access_starts_at: '2026-04-02T00:00:00Z',
          access_ends_at: null,
          created_at: '2026-04-02T00:00:00Z',
          updated_at: '2026-04-02T00:00:00Z',
        }],
        rowCount: 1,
      });

    const entitlement = await billingStore.upsertOrgEntitlement({
      orgId: 'org-1',
      listingId: 'listing-1',
      billingCustomerId: 'bc-1',
      billingSubscriptionId: 'bs-1',
      billingModel: 'subscription',
      seatCapacity: 10,
      seatInUse: 2,
    });

    expect(entitlement.billingModel).toBe('subscription');
    expect(entitlement.seatCapacity).toBe(10);
    expect((mockQuery.mock.calls[1]?.[0] as string)).toContain('INSERT INTO org_entitlements');
  });
});

describe('createOrgEntitlementOverride', () => {
  test('creates an entitlement override row', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'billing-test-uuid',
        entitlement_id: 'ent-1',
        kind: 'temporary_access',
        status: 'active',
        reason: 'Support extension',
        effective_starts_at: '2026-04-02T00:00:00Z',
        effective_ends_at: '2026-04-09T00:00:00Z',
        created_by: 'user-1',
        created_at: '2026-04-02T00:00:00Z',
      }],
      rowCount: 1,
    });

    const override = await billingStore.createOrgEntitlementOverride({
      entitlementId: 'ent-1',
      kind: 'temporary_access',
      reason: 'Support extension',
      createdBy: 'user-1',
    });

    expect(override.entitlementId).toBe('ent-1');
    expect(override.kind).toBe('temporary_access');
    expect((mockQuery.mock.calls[0]?.[0] as string)).toContain('INSERT INTO org_entitlement_overrides');
  });
});

describe('listOrgBillingSummary', () => {
  test('returns the composed billing summary for an org', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'customer-1',
          org_id: 'org-1',
          stripe_customer_id: 'cus_123',
          billing_email: 'billing@example.com',
          company_name: null,
          tax_country: null,
          tax_id: null,
          default_payment_method_brand: null,
          default_payment_method_last4: null,
          created_at: '2026-04-02T00:00:00Z',
          updated_at: '2026-04-02T00:00:00Z',
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const summary = await billingStore.listOrgBillingSummary('org-1');

    expect(summary.customer?.stripeCustomerId).toBe('cus_123');
    expect(summary.subscriptions).toEqual([]);
    expect(summary.invoices).toEqual([]);
    expect(summary.entitlements).toEqual([]);
    expect(summary.overrides).toEqual([]);
    expect(summary.events).toEqual([]);
  });
});
