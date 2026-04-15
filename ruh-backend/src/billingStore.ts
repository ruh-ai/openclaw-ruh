// @kb: 016-marketplace 005-data-models
import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export type BillingStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete';

export type EntitlementStatus =
  | 'active'
  | 'grace_period'
  | 'suspended'
  | 'revoked'
  | 'override_active';

export interface BillingCustomerRecord {
  id: string;
  orgId: string;
  stripeCustomerId: string;
  billingEmail: string | null;
  companyName: string | null;
  taxCountry: string | null;
  taxId: string | null;
  defaultPaymentMethodBrand: string | null;
  defaultPaymentMethodLast4: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingSubscriptionRecord {
  id: string;
  orgId: string;
  listingId: string | null;
  entitlementId: string | null;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  stripeProductId: string | null;
  status: string;
  quantity: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingInvoiceRecord {
  id: string;
  orgId: string;
  entitlementId: string | null;
  billingSubscriptionId: string | null;
  stripeInvoiceId: string;
  stripeSubscriptionId: string | null;
  status: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  dueAt: string | null;
  paidAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgEntitlementRecord {
  id: string;
  orgId: string;
  listingId: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  billingModel: string;
  billingStatus: BillingStatus;
  entitlementStatus: EntitlementStatus;
  seatCapacity: number;
  seatInUse: number;
  graceEndsAt: string | null;
  accessStartsAt: string;
  accessEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgEntitlementOverrideRecord {
  id: string;
  entitlementId: string;
  kind: string;
  status: string;
  reason: string;
  effectiveStartsAt: string;
  effectiveEndsAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface BillingEventRecord {
  id: string;
  orgId: string;
  entitlementId: string | null;
  source: string;
  eventType: string;
  status: string;
  stripeEventId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface OrgBillingSummary {
  customer: BillingCustomerRecord | null;
  subscriptions: BillingSubscriptionRecord[];
  invoices: BillingInvoiceRecord[];
  entitlements: OrgEntitlementRecord[];
  overrides: OrgEntitlementOverrideRecord[];
  events: BillingEventRecord[];
}

function serializeBillingCustomerRow(row: Record<string, unknown>): BillingCustomerRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    stripeCustomerId: String(row.stripe_customer_id),
    billingEmail: row.billing_email ? String(row.billing_email) : null,
    companyName: row.company_name ? String(row.company_name) : null,
    taxCountry: row.tax_country ? String(row.tax_country) : null,
    taxId: row.tax_id ? String(row.tax_id) : null,
    defaultPaymentMethodBrand: row.default_payment_method_brand ? String(row.default_payment_method_brand) : null,
    defaultPaymentMethodLast4: row.default_payment_method_last4 ? String(row.default_payment_method_last4) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function serializeBillingSubscriptionRow(row: Record<string, unknown>): BillingSubscriptionRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    listingId: row.listing_id ? String(row.listing_id) : null,
    entitlementId: row.entitlement_id ? String(row.entitlement_id) : null,
    stripeSubscriptionId: String(row.stripe_subscription_id),
    stripePriceId: row.stripe_price_id ? String(row.stripe_price_id) : null,
    stripeProductId: row.stripe_product_id ? String(row.stripe_product_id) : null,
    status: String(row.status),
    quantity: Number(row.quantity ?? 1),
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    currentPeriodStart: row.current_period_start ? String(row.current_period_start) : null,
    currentPeriodEnd: row.current_period_end ? String(row.current_period_end) : null,
    trialEndsAt: row.trial_ends_at ? String(row.trial_ends_at) : null,
    graceEndsAt: row.grace_ends_at ? String(row.grace_ends_at) : null,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function serializeBillingInvoiceRow(row: Record<string, unknown>): BillingInvoiceRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    entitlementId: row.entitlement_id ? String(row.entitlement_id) : null,
    billingSubscriptionId: row.billing_subscription_id ? String(row.billing_subscription_id) : null,
    stripeInvoiceId: String(row.stripe_invoice_id),
    stripeSubscriptionId: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
    status: String(row.status),
    currency: String(row.currency ?? 'usd'),
    amountDue: Number(row.amount_due ?? 0),
    amountPaid: Number(row.amount_paid ?? 0),
    amountRemaining: Number(row.amount_remaining ?? 0),
    hostedInvoiceUrl: row.hosted_invoice_url ? String(row.hosted_invoice_url) : null,
    invoicePdfUrl: row.invoice_pdf_url ? String(row.invoice_pdf_url) : null,
    dueAt: row.due_at ? String(row.due_at) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function serializeOrgEntitlementRow(row: Record<string, unknown>): OrgEntitlementRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    listingId: row.listing_id ? String(row.listing_id) : null,
    billingCustomerId: row.billing_customer_id ? String(row.billing_customer_id) : null,
    billingSubscriptionId: row.billing_subscription_id ? String(row.billing_subscription_id) : null,
    billingModel: String(row.billing_model),
    billingStatus: String(row.billing_status) as BillingStatus,
    entitlementStatus: String(row.entitlement_status) as EntitlementStatus,
    seatCapacity: Number(row.seat_capacity ?? 0),
    seatInUse: Number(row.seat_in_use ?? 0),
    graceEndsAt: row.grace_ends_at ? String(row.grace_ends_at) : null,
    accessStartsAt: String(row.access_starts_at),
    accessEndsAt: row.access_ends_at ? String(row.access_ends_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function serializeOrgEntitlementOverrideRow(row: Record<string, unknown>): OrgEntitlementOverrideRecord {
  return {
    id: String(row.id),
    entitlementId: String(row.entitlement_id),
    kind: String(row.kind),
    status: String(row.status),
    reason: String(row.reason ?? ''),
    effectiveStartsAt: String(row.effective_starts_at),
    effectiveEndsAt: row.effective_ends_at ? String(row.effective_ends_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
}

function serializeBillingEventRow(row: Record<string, unknown>): BillingEventRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    entitlementId: row.entitlement_id ? String(row.entitlement_id) : null,
    source: String(row.source),
    eventType: String(row.event_type),
    status: String(row.status),
    stripeEventId: row.stripe_event_id ? String(row.stripe_event_id) : null,
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
  };
}

export async function getBillingCustomerByOrgId(orgId: string): Promise<BillingCustomerRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      'SELECT * FROM billing_customers WHERE org_id = $1 LIMIT 1',
      [orgId],
    );
    return result.rows[0] ? serializeBillingCustomerRow(result.rows[0]) : null;
  });
}

export async function upsertBillingCustomer(input: {
  orgId: string;
  stripeCustomerId: string;
  billingEmail?: string | null;
  companyName?: string | null;
  taxCountry?: string | null;
  taxId?: string | null;
  defaultPaymentMethodBrand?: string | null;
  defaultPaymentMethodLast4?: string | null;
}): Promise<BillingCustomerRecord> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      INSERT INTO billing_customers (
        id,
        org_id,
        stripe_customer_id,
        billing_email,
        company_name,
        tax_country,
        tax_id,
        default_payment_method_brand,
        default_payment_method_last4
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (org_id) DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        billing_email = EXCLUDED.billing_email,
        company_name = EXCLUDED.company_name,
        tax_country = EXCLUDED.tax_country,
        tax_id = EXCLUDED.tax_id,
        default_payment_method_brand = EXCLUDED.default_payment_method_brand,
        default_payment_method_last4 = EXCLUDED.default_payment_method_last4,
        updated_at = NOW()
      RETURNING *
      `,
      [
        uuidv4(),
        input.orgId,
        input.stripeCustomerId,
        input.billingEmail ?? null,
        input.companyName ?? null,
        input.taxCountry ?? null,
        input.taxId ?? null,
        input.defaultPaymentMethodBrand ?? null,
        input.defaultPaymentMethodLast4 ?? null,
      ],
    );
    return serializeBillingCustomerRow(result.rows[0]);
  });
}

export async function upsertBillingSubscription(input: {
  orgId: string;
  listingId?: string | null;
  entitlementId?: string | null;
  stripeSubscriptionId: string;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  status: string;
  quantity?: number;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  graceEndsAt?: string | null;
  lastSyncedAt?: string | null;
}): Promise<BillingSubscriptionRecord> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      INSERT INTO billing_subscriptions (
        id,
        org_id,
        listing_id,
        entitlement_id,
        stripe_subscription_id,
        stripe_price_id,
        stripe_product_id,
        status,
        quantity,
        cancel_at_period_end,
        current_period_start,
        current_period_end,
        trial_ends_at,
        grace_ends_at,
        last_synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (stripe_subscription_id) DO UPDATE SET
        org_id = EXCLUDED.org_id,
        listing_id = EXCLUDED.listing_id,
        entitlement_id = EXCLUDED.entitlement_id,
        stripe_price_id = EXCLUDED.stripe_price_id,
        stripe_product_id = EXCLUDED.stripe_product_id,
        status = EXCLUDED.status,
        quantity = EXCLUDED.quantity,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        trial_ends_at = EXCLUDED.trial_ends_at,
        grace_ends_at = EXCLUDED.grace_ends_at,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at = NOW()
      RETURNING *
      `,
      [
        uuidv4(),
        input.orgId,
        input.listingId ?? null,
        input.entitlementId ?? null,
        input.stripeSubscriptionId,
        input.stripePriceId ?? null,
        input.stripeProductId ?? null,
        input.status,
        input.quantity ?? 1,
        input.cancelAtPeriodEnd ?? false,
        input.currentPeriodStart ?? null,
        input.currentPeriodEnd ?? null,
        input.trialEndsAt ?? null,
        input.graceEndsAt ?? null,
        input.lastSyncedAt ?? null,
      ],
    );
    return serializeBillingSubscriptionRow(result.rows[0]);
  });
}

export async function upsertBillingInvoice(input: {
  orgId: string;
  entitlementId?: string | null;
  billingSubscriptionId?: string | null;
  stripeInvoiceId: string;
  stripeSubscriptionId?: string | null;
  status: string;
  currency?: string;
  amountDue?: number;
  amountPaid?: number;
  amountRemaining?: number;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  lastSyncedAt?: string | null;
}): Promise<BillingInvoiceRecord> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      INSERT INTO billing_invoices (
        id,
        org_id,
        entitlement_id,
        billing_subscription_id,
        stripe_invoice_id,
        stripe_subscription_id,
        status,
        currency,
        amount_due,
        amount_paid,
        amount_remaining,
        hosted_invoice_url,
        invoice_pdf_url,
        due_at,
        paid_at,
        last_synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (stripe_invoice_id) DO UPDATE SET
        org_id = EXCLUDED.org_id,
        entitlement_id = EXCLUDED.entitlement_id,
        billing_subscription_id = EXCLUDED.billing_subscription_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        status = EXCLUDED.status,
        currency = EXCLUDED.currency,
        amount_due = EXCLUDED.amount_due,
        amount_paid = EXCLUDED.amount_paid,
        amount_remaining = EXCLUDED.amount_remaining,
        hosted_invoice_url = EXCLUDED.hosted_invoice_url,
        invoice_pdf_url = EXCLUDED.invoice_pdf_url,
        due_at = EXCLUDED.due_at,
        paid_at = EXCLUDED.paid_at,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at = NOW()
      RETURNING *
      `,
      [
        uuidv4(),
        input.orgId,
        input.entitlementId ?? null,
        input.billingSubscriptionId ?? null,
        input.stripeInvoiceId,
        input.stripeSubscriptionId ?? null,
        input.status,
        input.currency ?? 'usd',
        input.amountDue ?? 0,
        input.amountPaid ?? 0,
        input.amountRemaining ?? 0,
        input.hostedInvoiceUrl ?? null,
        input.invoicePdfUrl ?? null,
        input.dueAt ?? null,
        input.paidAt ?? null,
        input.lastSyncedAt ?? null,
      ],
    );
    return serializeBillingInvoiceRow(result.rows[0]);
  });
}

export async function upsertOrgEntitlement(input: {
  id?: string;
  orgId: string;
  listingId?: string | null;
  billingCustomerId?: string | null;
  billingSubscriptionId?: string | null;
  billingModel: string;
  billingStatus?: BillingStatus;
  entitlementStatus?: EntitlementStatus;
  seatCapacity?: number;
  seatInUse?: number;
  graceEndsAt?: string | null;
  accessStartsAt?: string | null;
  accessEndsAt?: string | null;
}): Promise<OrgEntitlementRecord> {
  return withConn(async (client) => {
    const existing = input.id
      ? await client.query(
        'SELECT id FROM org_entitlements WHERE id = $1 LIMIT 1',
        [input.id],
      )
      : input.listingId
        ? await client.query(
          `
          SELECT id
          FROM org_entitlements
          WHERE org_id = $1 AND listing_id = $2 AND billing_model = $3
          LIMIT 1
          `,
          [input.orgId, input.listingId, input.billingModel],
        )
        : { rows: [] };

    if (existing.rows[0]) {
      const result = await client.query(
        `
        UPDATE org_entitlements
        SET
          org_id = $2,
          listing_id = $3,
          billing_customer_id = $4,
          billing_subscription_id = $5,
          billing_model = $6,
          billing_status = $7,
          entitlement_status = $8,
          seat_capacity = $9,
          seat_in_use = $10,
          grace_ends_at = $11,
          access_starts_at = COALESCE($12, access_starts_at),
          access_ends_at = $13,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          String(existing.rows[0].id),
          input.orgId,
          input.listingId ?? null,
          input.billingCustomerId ?? null,
          input.billingSubscriptionId ?? null,
          input.billingModel,
          input.billingStatus ?? 'active',
          input.entitlementStatus ?? 'active',
          input.seatCapacity ?? 1,
          input.seatInUse ?? 0,
          input.graceEndsAt ?? null,
          input.accessStartsAt ?? null,
          input.accessEndsAt ?? null,
        ],
      );
      return serializeOrgEntitlementRow(result.rows[0]);
    }

    const result = await client.query(
      `
      INSERT INTO org_entitlements (
        id,
        org_id,
        listing_id,
        billing_customer_id,
        billing_subscription_id,
        billing_model,
        billing_status,
        entitlement_status,
        seat_capacity,
        seat_in_use,
        grace_ends_at,
        access_starts_at,
        access_ends_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()), $13)
      RETURNING *
      `,
      [
        input.id ?? uuidv4(),
        input.orgId,
        input.listingId ?? null,
        input.billingCustomerId ?? null,
        input.billingSubscriptionId ?? null,
        input.billingModel,
        input.billingStatus ?? 'active',
        input.entitlementStatus ?? 'active',
        input.seatCapacity ?? 1,
        input.seatInUse ?? 0,
        input.graceEndsAt ?? null,
        input.accessStartsAt ?? null,
        input.accessEndsAt ?? null,
      ],
    );
    return serializeOrgEntitlementRow(result.rows[0]);
  });
}

export async function createOrgEntitlementOverride(input: {
  entitlementId: string;
  kind: string;
  status?: string;
  reason?: string;
  effectiveStartsAt?: string | null;
  effectiveEndsAt?: string | null;
  createdBy?: string | null;
}): Promise<OrgEntitlementOverrideRecord> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      INSERT INTO org_entitlement_overrides (
        id,
        entitlement_id,
        kind,
        status,
        reason,
        effective_starts_at,
        effective_ends_at,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8)
      RETURNING *
      `,
      [
        uuidv4(),
        input.entitlementId,
        input.kind,
        input.status ?? 'active',
        input.reason ?? '',
        input.effectiveStartsAt ?? null,
        input.effectiveEndsAt ?? null,
        input.createdBy ?? null,
      ],
    );
    return serializeOrgEntitlementOverrideRow(result.rows[0]);
  });
}

export async function recordBillingEvent(input: {
  orgId: string;
  entitlementId?: string | null;
  source: string;
  eventType: string;
  status?: string;
  stripeEventId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<BillingEventRecord> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      INSERT INTO billing_events (
        id,
        org_id,
        entitlement_id,
        source,
        event_type,
        status,
        stripe_event_id,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *
      `,
      [
        uuidv4(),
        input.orgId,
        input.entitlementId ?? null,
        input.source,
        input.eventType,
        input.status ?? 'received',
        input.stripeEventId ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    return serializeBillingEventRow(result.rows[0]);
  });
}

export async function listOrgBillingSummary(orgId: string): Promise<OrgBillingSummary> {
  return withConn(async (client) => {
    const [customer, subscriptions, invoices, entitlements, overrides, events] = await Promise.all([
      client.query('SELECT * FROM billing_customers WHERE org_id = $1 LIMIT 1', [orgId]),
      client.query('SELECT * FROM billing_subscriptions WHERE org_id = $1 ORDER BY created_at DESC', [orgId]),
      client.query('SELECT * FROM billing_invoices WHERE org_id = $1 ORDER BY created_at DESC', [orgId]),
      client.query('SELECT * FROM org_entitlements WHERE org_id = $1 ORDER BY created_at DESC', [orgId]),
      client.query(
        `
        SELECT o.*
        FROM org_entitlement_overrides o
        JOIN org_entitlements e ON e.id = o.entitlement_id
        WHERE e.org_id = $1
        ORDER BY o.created_at DESC
        `,
        [orgId],
      ),
      client.query('SELECT * FROM billing_events WHERE org_id = $1 ORDER BY created_at DESC', [orgId]),
    ]);

    return {
      customer: customer.rows[0] ? serializeBillingCustomerRow(customer.rows[0]) : null,
      subscriptions: subscriptions.rows.map((row) => serializeBillingSubscriptionRow(row)),
      invoices: invoices.rows.map((row) => serializeBillingInvoiceRow(row)),
      entitlements: entitlements.rows.map((row) => serializeOrgEntitlementRow(row)),
      overrides: overrides.rows.map((row) => serializeOrgEntitlementOverrideRow(row)),
      events: events.rows.map((row) => serializeBillingEventRow(row)),
    };
  });
}
