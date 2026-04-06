"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  CreditCard,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import { fetchAdminJson, mutateAdminJson } from "@/lib/admin-api";
import {
  ActionButton,
  AttentionRow,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  fieldClassName,
  formatDate,
  formatNumber,
} from "../../../_components/AdminPrimitives";

interface BillingDetailResponse {
  organization: {
    id: string;
    name: string;
    slug: string;
    kind: string;
    plan: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  customer: {
    id: string;
    stripeCustomerId: string;
    billingEmail: string | null;
    companyName: string | null;
    taxCountry: string | null;
    taxId: string | null;
    defaultPaymentMethodBrand: string | null;
    defaultPaymentMethodLast4: string | null;
  } | null;
  subscriptions: Array<{
    id: string;
    listingId: string | null;
    listingTitle: string | null;
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
  }>;
  invoices: Array<{
    id: string;
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
    isPastDue: boolean;
  }>;
  entitlements: Array<{
    id: string;
    listingId: string | null;
    listingTitle: string | null;
    listingSlug: string | null;
    billingCustomerId: string | null;
    billingSubscriptionId: string | null;
    billingModel: string;
    billingStatus: string;
    entitlementStatus: string;
    seatCapacity: number;
    seatInUse: number;
    graceEndsAt: string | null;
    accessStartsAt: string;
    accessEndsAt: string | null;
    access: {
      status: "active" | "grace_period" | "suspended" | "revoked";
      canAccess: boolean;
      overrideActive: boolean;
    };
    overrides: Array<{
      id: string;
      kind: string;
      status: string;
      reason: string;
      effectiveStartsAt: string;
      effectiveEndsAt: string | null;
      createdAt: string;
    }>;
    subscription: {
      id: string;
      stripeSubscriptionId: string;
      status: string;
      quantity: number;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    } | null;
  }>;
  events: Array<{
    id: string;
    source: string;
    eventType: string;
    status: string;
    createdAt: string;
    entitlementId: string | null;
  }>;
  attention: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
  }>;
  summary: {
    activeEntitlements: number;
    blockedEntitlements: number;
    pastDueEntitlements: number;
    overrideActiveEntitlements: number;
    seatCapacity: number;
    seatInUse: number;
    payableInvoices: number;
    amountDue: number;
  };
}

interface EntitlementEditDraft {
  listingId: string;
  billingSubscriptionId: string;
  billingModel: string;
  billingStatus: string;
  entitlementStatus: string;
  seatCapacity: string;
  seatInUse: string;
  graceEndsAt: string;
  accessStartsAt: string;
  accessEndsAt: string;
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toneForStatus(status: string) {
  if (status === "active" || status === "paid" || status === "success") return "success";
  if (status === "past_due" || status === "unpaid" || status === "suspended") return "warning";
  if (status === "revoked" || status === "canceled" || status === "failed") return "danger";
  return "neutral";
}

function toneForAccess(status: string) {
  if (status === "active") return "success";
  if (status === "grace_period") return "warning";
  if (status === "suspended" || status === "revoked") return "danger";
  return "neutral";
}

const EMPTY_ENTITLEMENT_DRAFT: EntitlementEditDraft = {
  listingId: "",
  billingSubscriptionId: "",
  billingModel: "subscription",
  billingStatus: "active",
  entitlementStatus: "active",
  seatCapacity: "1",
  seatInUse: "0",
  graceEndsAt: "",
  accessStartsAt: "",
  accessEndsAt: "",
};

export default function OrganizationBillingPage() {
  const params = useParams<{ id: string }>();
  const orgId = useMemo(() => String(params.id), [params.id]);

  const [data, setData] = useState<BillingDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionState, setActionState] = useState<string | null>(null);
  const [customerDraft, setCustomerDraft] = useState({
    stripeCustomerId: "",
    billingEmail: "",
    companyName: "",
    taxCountry: "",
    taxId: "",
    defaultPaymentMethodBrand: "",
    defaultPaymentMethodLast4: "",
  });
  const [entitlementDraft, setEntitlementDraft] = useState<EntitlementEditDraft>(
    EMPTY_ENTITLEMENT_DRAFT,
  );
  const [subscriptionDraft, setSubscriptionDraft] = useState({
    listingId: "",
    entitlementId: "",
    stripeSubscriptionId: "",
    stripePriceId: "",
    stripeProductId: "",
    status: "active",
    quantity: "1",
    currentPeriodStart: "",
    currentPeriodEnd: "",
    trialEndsAt: "",
    graceEndsAt: "",
    cancelAtPeriodEnd: false,
  });
  const [invoiceDraft, setInvoiceDraft] = useState({
    entitlementId: "",
    billingSubscriptionId: "",
    stripeInvoiceId: "",
    stripeSubscriptionId: "",
    status: "open",
    currency: "usd",
    amountDue: "0",
    amountPaid: "0",
    amountRemaining: "0",
    dueAt: "",
    paidAt: "",
    hostedInvoiceUrl: "",
    invoicePdfUrl: "",
  });
  const [entitlementEdits, setEntitlementEdits] = useState<
    Record<string, EntitlementEditDraft>
  >({});

  const syncDrafts = (response: BillingDetailResponse) => {
    setCustomerDraft({
      stripeCustomerId: response.customer?.stripeCustomerId ?? "",
      billingEmail: response.customer?.billingEmail ?? "",
      companyName: response.customer?.companyName ?? "",
      taxCountry: response.customer?.taxCountry ?? "",
      taxId: response.customer?.taxId ?? "",
      defaultPaymentMethodBrand: response.customer?.defaultPaymentMethodBrand ?? "",
      defaultPaymentMethodLast4: response.customer?.defaultPaymentMethodLast4 ?? "",
    });
    setEntitlementEdits(
      Object.fromEntries(
        response.entitlements.map((entitlement) => [
          entitlement.id,
          {
            listingId: entitlement.listingId ?? "",
            billingSubscriptionId: entitlement.billingSubscriptionId ?? "",
            billingModel: entitlement.billingModel,
            billingStatus: entitlement.billingStatus,
            entitlementStatus: entitlement.entitlementStatus,
            seatCapacity: String(entitlement.seatCapacity),
            seatInUse: String(entitlement.seatInUse),
            graceEndsAt: toDateTimeLocalValue(entitlement.graceEndsAt),
            accessStartsAt: toDateTimeLocalValue(entitlement.accessStartsAt),
            accessEndsAt: toDateTimeLocalValue(entitlement.accessEndsAt),
          },
        ]),
      ),
    );
  };

  const loadBilling = () => {
    setLoading(true);
    fetchAdminJson<BillingDetailResponse>(`/api/admin/organizations/${orgId}/billing`)
      .then((response) => {
        setData(response);
        syncDrafts(response);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load billing console");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBilling();
  }, [orgId]);

  const updateEntitlementEdit = (
    entitlementId: string,
    key: keyof EntitlementEditDraft,
    value: string,
  ) => {
    setEntitlementEdits((current) => ({
      ...current,
      [entitlementId]: {
        ...(current[entitlementId] ?? EMPTY_ENTITLEMENT_DRAFT),
        [key]: value,
      },
    }));
  };

  const saveCustomer = async () => {
    setActionState("customer");
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/billing/customer`,
        "POST",
        customerDraft,
      );
      loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save billing customer");
    } finally {
      setActionState(null);
    }
  };

  const createEntitlement = async () => {
    setActionState("create-entitlement");
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/billing/entitlements`,
        "POST",
        entitlementDraft,
      );
      setEntitlementDraft(EMPTY_ENTITLEMENT_DRAFT);
      loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entitlement");
    } finally {
      setActionState(null);
    }
  };

  const saveEntitlement = async (entitlementId: string) => {
    setActionState(`save-entitlement:${entitlementId}`);
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/billing/entitlements/${entitlementId}`,
        "PATCH",
        entitlementEdits[entitlementId],
      );
      loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entitlement");
    } finally {
      setActionState(null);
    }
  };

  const pauseEntitlement = async (entitlementId: string) => {
    const reason = window.prompt("Pause reason", "Paused by admin");
    if (reason === null) return;
    setActionState(`pause:${entitlementId}`);
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/billing/entitlements/${entitlementId}/pause`,
        "POST",
        { reason },
      );
      loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause entitlement");
    } finally {
      setActionState(null);
    }
  };

  const resumeEntitlement = async (entitlementId: string) => {
    const reason = window.prompt("Resume reason", "Resumed by admin");
    if (reason === null) return;
    setActionState(`resume:${entitlementId}`);
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/billing/entitlements/${entitlementId}/resume`,
        "POST",
        { reason },
      );
      loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume entitlement");
    } finally {
      setActionState(null);
    }
  };

  const grantTemporaryAccess = async (entitlementId: string) => {
    const defaultExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const effectiveEndsAt = window.prompt(
      "Temporary access expiry (ISO timestamp)",
      defaultExpiry,
    );
    if (!effectiveEndsAt) return;
    const reason =
      window.prompt("Temporary access reason", "Temporary access granted by admin") ||
      "Temporary access granted by admin";

    setActionState(`temporary:${entitlementId}`);
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/billing/entitlements/${entitlementId}/grant-temporary-access`,
        "POST",
        { effectiveEndsAt, reason },
      );
      loadBilling();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to grant temporary access",
      );
    } finally {
      setActionState(null);
    }
  };

  const createSubscription = async () => {
    setActionState("create-subscription");
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/billing/subscriptions`,
        "POST",
        subscriptionDraft,
      );
      setSubscriptionDraft({
        listingId: "",
        entitlementId: "",
        stripeSubscriptionId: "",
        stripePriceId: "",
        stripeProductId: "",
        status: "active",
        quantity: "1",
        currentPeriodStart: "",
        currentPeriodEnd: "",
        trialEndsAt: "",
        graceEndsAt: "",
        cancelAtPeriodEnd: false,
      });
      loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mirror subscription");
    } finally {
      setActionState(null);
    }
  };

  const createInvoice = async () => {
    setActionState("create-invoice");
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/billing/invoices`,
        "POST",
        invoiceDraft,
      );
      setInvoiceDraft({
        entitlementId: "",
        billingSubscriptionId: "",
        stripeInvoiceId: "",
        stripeSubscriptionId: "",
        status: "open",
        currency: "usd",
        amountDue: "0",
        amountPaid: "0",
        amountRemaining: "0",
        dueAt: "",
        paidAt: "",
        hostedInvoiceUrl: "",
        invoicePdfUrl: "",
      });
      loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mirror invoice");
    } finally {
      setActionState(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.organization.name ? `${data.organization.name} billing` : "Organization billing"}
        description="Link a Stripe customer, mirror subscription and invoice state, and control customer access with entitlement actions and temporary overrides."
        actions={
          <>
            <Link
              href={`/organizations/${orgId}`}
              className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--border-default)] bg-white/84 px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Organization console
            </Link>
            <Link
              href="/billing"
              className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--border-default)] bg-white/84 px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
            >
              Fleet billing
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <ActionButton onClick={loadBilling} busy={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </ActionButton>
          </>
        }
      />

      {error ? (
        <div className="rounded-[24px] border border-[var(--danger-soft)] bg-[rgba(255,244,247,0.92)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active entitlements"
          value={data?.summary.activeEntitlements ?? 0}
          detail="Entitlements currently allowing product access."
          icon={ShieldCheck}
          tone="success"
        />
        <MetricCard
          label="Blocked entitlements"
          value={data?.summary.blockedEntitlements ?? 0}
          detail="Entitlements blocked by billing state or manual override."
          icon={ShieldX}
          tone="danger"
        />
        <MetricCard
          label="Invoices open"
          value={data?.summary.payableInvoices ?? 0}
          detail="Invoices with a remaining balance in the local billing mirror."
          icon={Receipt}
          tone="warning"
        />
        <MetricCard
          label="Seats in use"
          value={`${formatNumber(data?.summary.seatInUse ?? 0)}/${formatNumber(
            data?.summary.seatCapacity ?? 0,
          )}`}
          detail="Recorded seat consumption across org entitlements."
          icon={CreditCard}
          tone="primary"
        />
      </div>

      {data?.attention.length ? (
        <div className="space-y-3">
          {data.attention.map((item) => (
            <AttentionRow
              key={item.id}
              title={item.title}
              detail={item.detail}
              severity={item.severity}
            />
          ))}
        </div>
      ) : null}

      <Panel
        title="Billing customer"
        description="Attach the Stripe customer identity and support metadata for this organization."
        actions={
          <ActionButton
            onClick={saveCustomer}
            busy={actionState === "customer"}
            tone="primary"
          >
            Save customer
          </ActionButton>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Stripe customer ID</span>
            <input
              className={fieldClassName}
              value={customerDraft.stripeCustomerId}
              onChange={(event) =>
                setCustomerDraft((current) => ({
                  ...current,
                  stripeCustomerId: event.target.value,
                }))
              }
              placeholder="cus_..."
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Billing email</span>
            <input
              className={fieldClassName}
              value={customerDraft.billingEmail}
              onChange={(event) =>
                setCustomerDraft((current) => ({
                  ...current,
                  billingEmail: event.target.value,
                }))
              }
              placeholder="billing@customer.com"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Company name</span>
            <input
              className={fieldClassName}
              value={customerDraft.companyName}
              onChange={(event) =>
                setCustomerDraft((current) => ({
                  ...current,
                  companyName: event.target.value,
                }))
              }
              placeholder="Customer Inc."
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Tax country</span>
            <input
              className={fieldClassName}
              value={customerDraft.taxCountry}
              onChange={(event) =>
                setCustomerDraft((current) => ({
                  ...current,
                  taxCountry: event.target.value,
                }))
              }
              placeholder="US"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Tax ID</span>
            <input
              className={fieldClassName}
              value={customerDraft.taxId}
              onChange={(event) =>
                setCustomerDraft((current) => ({
                  ...current,
                  taxId: event.target.value,
                }))
              }
              placeholder="Tax identifier"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Payment method brand</span>
            <input
              className={fieldClassName}
              value={customerDraft.defaultPaymentMethodBrand}
              onChange={(event) =>
                setCustomerDraft((current) => ({
                  ...current,
                  defaultPaymentMethodBrand: event.target.value,
                }))
              }
              placeholder="visa"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Payment method last4</span>
            <input
              className={fieldClassName}
              value={customerDraft.defaultPaymentMethodLast4}
              onChange={(event) =>
                setCustomerDraft((current) => ({
                  ...current,
                  defaultPaymentMethodLast4: event.target.value,
                }))
              }
              placeholder="4242"
            />
          </label>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/72 p-4 text-sm text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">Current linkage</p>
            <p className="mt-2">{data?.customer?.stripeCustomerId || "No customer linked yet"}</p>
            <p className="mt-2">Org status: {data?.organization.status ?? "—"}</p>
          </div>
        </div>
      </Panel>

      <Panel title="Entitlements" description="Define purchased access and operate support overrides directly from this console.">
        <div className="grid gap-3 rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Listing ID</span>
            <input
              className={fieldClassName}
              value={entitlementDraft.listingId}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  listingId: event.target.value,
                }))
              }
              placeholder="Optional listing UUID"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Billing model</span>
            <select
              className={fieldClassName}
              value={entitlementDraft.billingModel}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  billingModel: event.target.value,
                }))
              }
            >
              <option value="subscription">subscription</option>
              <option value="one_time">one_time</option>
              <option value="manual">manual</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Billing status</span>
            <select
              className={fieldClassName}
              value={entitlementDraft.billingStatus}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  billingStatus: event.target.value,
                }))
              }
            >
              <option value="active">active</option>
              <option value="trialing">trialing</option>
              <option value="past_due">past_due</option>
              <option value="unpaid">unpaid</option>
              <option value="canceled">canceled</option>
              <option value="incomplete">incomplete</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Entitlement status</span>
            <select
              className={fieldClassName}
              value={entitlementDraft.entitlementStatus}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  entitlementStatus: event.target.value,
                }))
              }
            >
              <option value="active">active</option>
              <option value="grace_period">grace_period</option>
              <option value="suspended">suspended</option>
              <option value="revoked">revoked</option>
              <option value="override_active">override_active</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Seat capacity</span>
            <input
              className={fieldClassName}
              value={entitlementDraft.seatCapacity}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  seatCapacity: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Seats in use</span>
            <input
              className={fieldClassName}
              value={entitlementDraft.seatInUse}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  seatInUse: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Access starts</span>
            <input
              className={fieldClassName}
              type="datetime-local"
              value={entitlementDraft.accessStartsAt}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  accessStartsAt: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Access ends</span>
            <input
              className={fieldClassName}
              type="datetime-local"
              value={entitlementDraft.accessEndsAt}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  accessEndsAt: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Grace ends</span>
            <input
              className={fieldClassName}
              type="datetime-local"
              value={entitlementDraft.graceEndsAt}
              onChange={(event) =>
                setEntitlementDraft((current) => ({
                  ...current,
                  graceEndsAt: event.target.value,
                }))
              }
            />
          </label>
          <div className="flex items-end">
            <ActionButton
              onClick={createEntitlement}
              busy={actionState === "create-entitlement"}
              tone="primary"
              className="w-full"
            >
              Create entitlement
            </ActionButton>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {loading ? (
            <div className="rounded-[22px] border border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              Loading entitlements…
            </div>
          ) : data?.entitlements.length ? (
            data.entitlements.map((entitlement) => {
              const edit = entitlementEdits[entitlement.id] ?? EMPTY_ENTITLEMENT_DRAFT;
              return (
                <div
                  key={entitlement.id}
                  className="rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-[var(--text-primary)]">
                          {entitlement.listingTitle || "Manual entitlement"}
                        </p>
                        <StatusPill tone={toneForStatus(entitlement.billingStatus)}>
                          {entitlement.billingStatus}
                        </StatusPill>
                        <StatusPill tone={toneForStatus(entitlement.entitlementStatus)}>
                          {entitlement.entitlementStatus}
                        </StatusPill>
                        <StatusPill tone={toneForAccess(entitlement.access.status)}>
                          access {entitlement.access.status}
                        </StatusPill>
                        {entitlement.access.overrideActive ? (
                          <StatusPill tone="warning">override active</StatusPill>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
                        <span>model {entitlement.billingModel}</span>
                        <span>
                          seats {entitlement.seatInUse}/{entitlement.seatCapacity}
                        </span>
                        <span>subscription {entitlement.subscription?.stripeSubscriptionId || "—"}</span>
                        <span>starts {formatDate(entitlement.accessStartsAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionButton
                        onClick={() => saveEntitlement(entitlement.id)}
                        busy={actionState === `save-entitlement:${entitlement.id}`}
                      >
                        Save
                      </ActionButton>
                      <ActionButton
                        onClick={() => pauseEntitlement(entitlement.id)}
                        busy={actionState === `pause:${entitlement.id}`}
                        tone="danger"
                      >
                        Pause
                      </ActionButton>
                      <ActionButton
                        onClick={() => resumeEntitlement(entitlement.id)}
                        busy={actionState === `resume:${entitlement.id}`}
                      >
                        Resume
                      </ActionButton>
                      <ActionButton
                        onClick={() => grantTemporaryAccess(entitlement.id)}
                        busy={actionState === `temporary:${entitlement.id}`}
                      >
                        Temporary access
                      </ActionButton>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Listing ID</span>
                      <input
                        className={fieldClassName}
                        value={edit.listingId}
                        onChange={(event) =>
                          updateEntitlementEdit(entitlement.id, "listingId", event.target.value)
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Billing subscription ID</span>
                      <input
                        className={fieldClassName}
                        value={edit.billingSubscriptionId}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "billingSubscriptionId",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Billing model</span>
                      <select
                        className={fieldClassName}
                        value={edit.billingModel}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "billingModel",
                            event.target.value,
                          )
                        }
                      >
                        <option value="subscription">subscription</option>
                        <option value="one_time">one_time</option>
                        <option value="manual">manual</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Billing status</span>
                      <select
                        className={fieldClassName}
                        value={edit.billingStatus}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "billingStatus",
                            event.target.value,
                          )
                        }
                      >
                        <option value="active">active</option>
                        <option value="trialing">trialing</option>
                        <option value="past_due">past_due</option>
                        <option value="unpaid">unpaid</option>
                        <option value="canceled">canceled</option>
                        <option value="incomplete">incomplete</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Entitlement status</span>
                      <select
                        className={fieldClassName}
                        value={edit.entitlementStatus}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "entitlementStatus",
                            event.target.value,
                          )
                        }
                      >
                        <option value="active">active</option>
                        <option value="grace_period">grace_period</option>
                        <option value="suspended">suspended</option>
                        <option value="revoked">revoked</option>
                        <option value="override_active">override_active</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Seat capacity</span>
                      <input
                        className={fieldClassName}
                        value={edit.seatCapacity}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "seatCapacity",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Seats in use</span>
                      <input
                        className={fieldClassName}
                        value={edit.seatInUse}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "seatInUse",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Access starts</span>
                      <input
                        className={fieldClassName}
                        type="datetime-local"
                        value={edit.accessStartsAt}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "accessStartsAt",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Access ends</span>
                      <input
                        className={fieldClassName}
                        type="datetime-local"
                        value={edit.accessEndsAt}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "accessEndsAt",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Grace ends</span>
                      <input
                        className={fieldClassName}
                        type="datetime-local"
                        value={edit.graceEndsAt}
                        onChange={(event) =>
                          updateEntitlementEdit(
                            entitlement.id,
                            "graceEndsAt",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  </div>

                  {entitlement.overrides.length ? (
                    <div className="mt-4 rounded-[22px] border border-[var(--border-default)] bg-[rgba(244,240,251,0.76)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Active and historical overrides
                      </p>
                      <div className="mt-3 space-y-2">
                        {entitlement.overrides.map((override) => (
                          <div
                            key={override.id}
                            className="flex flex-col gap-2 rounded-[18px] border border-[var(--border-default)] bg-white/70 p-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusPill tone={toneForStatus(override.status)}>
                                  {override.status}
                                </StatusPill>
                                <StatusPill tone="neutral">{override.kind}</StatusPill>
                              </div>
                              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                {override.reason || "No reason recorded"}
                              </p>
                            </div>
                            <div className="text-sm text-[var(--text-secondary)]">
                              <p>starts {formatDate(override.effectiveStartsAt)}</p>
                              <p>ends {formatDate(override.effectiveEndsAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-[22px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No entitlements recorded yet.
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Subscription mirror" description="Record or update the Stripe subscription snapshot used by the admin support console.">
          <div className="grid gap-3 rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Entitlement ID</span>
              <input
                className={fieldClassName}
                value={subscriptionDraft.entitlementId}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    entitlementId: event.target.value,
                  }))
                }
                placeholder="Optional entitlement UUID"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Listing ID</span>
              <input
                className={fieldClassName}
                value={subscriptionDraft.listingId}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    listingId: event.target.value,
                  }))
                }
                placeholder="Optional listing UUID"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Stripe subscription ID</span>
              <input
                className={fieldClassName}
                value={subscriptionDraft.stripeSubscriptionId}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    stripeSubscriptionId: event.target.value,
                  }))
                }
                placeholder="sub_..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Status</span>
              <input
                className={fieldClassName}
                value={subscriptionDraft.status}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                placeholder="active"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Quantity</span>
              <input
                className={fieldClassName}
                value={subscriptionDraft.quantity}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Stripe price ID</span>
              <input
                className={fieldClassName}
                value={subscriptionDraft.stripePriceId}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    stripePriceId: event.target.value,
                  }))
                }
                placeholder="price_..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Stripe product ID</span>
              <input
                className={fieldClassName}
                value={subscriptionDraft.stripeProductId}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    stripeProductId: event.target.value,
                  }))
                }
                placeholder="prod_..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Current period end</span>
              <input
                className={fieldClassName}
                type="datetime-local"
                value={subscriptionDraft.currentPeriodEnd}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    currentPeriodEnd: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Current period start</span>
              <input
                className={fieldClassName}
                type="datetime-local"
                value={subscriptionDraft.currentPeriodStart}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    currentPeriodStart: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Trial ends</span>
              <input
                className={fieldClassName}
                type="datetime-local"
                value={subscriptionDraft.trialEndsAt}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    trialEndsAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Grace ends</span>
              <input
                className={fieldClassName}
                type="datetime-local"
                value={subscriptionDraft.graceEndsAt}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    graceEndsAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-3 rounded-[18px] border border-[var(--border-default)] bg-white/70 px-4 py-3 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={subscriptionDraft.cancelAtPeriodEnd}
                onChange={(event) =>
                  setSubscriptionDraft((current) => ({
                    ...current,
                    cancelAtPeriodEnd: event.target.checked,
                  }))
                }
              />
              Cancel at period end
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <ActionButton
              onClick={createSubscription}
              busy={actionState === "create-subscription"}
              tone="primary"
            >
              Mirror subscription
            </ActionButton>
          </div>
          <div className="mt-4 space-y-3">
            {data?.subscriptions.length ? (
              data.subscriptions.map((subscription) => (
                <div
                  key={subscription.id}
                  className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {subscription.stripeSubscriptionId}
                    </p>
                    <StatusPill tone={toneForStatus(subscription.status)}>
                      {subscription.status}
                    </StatusPill>
                    {subscription.cancelAtPeriodEnd ? (
                      <StatusPill tone="warning">cancel at period end</StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {subscription.listingTitle || "No listing linked"} • quantity {subscription.quantity}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    current period {formatDate(subscription.currentPeriodStart)} → {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
                No subscriptions mirrored yet.
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Invoice mirror" description="Track invoice state, remaining balance, and overdue windows from inside the admin console.">
          <div className="grid gap-3 rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Entitlement ID</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.entitlementId}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    entitlementId: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Billing subscription ID</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.billingSubscriptionId}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    billingSubscriptionId: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Stripe invoice ID</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.stripeInvoiceId}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    stripeInvoiceId: event.target.value,
                  }))
                }
                placeholder="in_..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Status</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.status}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                placeholder="open"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Currency</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.currency}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    currency: event.target.value,
                  }))
                }
                placeholder="usd"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Stripe subscription ID</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.stripeSubscriptionId}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    stripeSubscriptionId: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Amount due (minor units)</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.amountDue}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    amountDue: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Amount paid (minor units)</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.amountPaid}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    amountPaid: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Amount remaining (minor units)</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.amountRemaining}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    amountRemaining: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Due at</span>
              <input
                className={fieldClassName}
                type="datetime-local"
                value={invoiceDraft.dueAt}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Paid at</span>
              <input
                className={fieldClassName}
                type="datetime-local"
                value={invoiceDraft.paidAt}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    paidAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Hosted invoice URL</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.hostedInvoiceUrl}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    hostedInvoiceUrl: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Invoice PDF URL</span>
              <input
                className={fieldClassName}
                value={invoiceDraft.invoicePdfUrl}
                onChange={(event) =>
                  setInvoiceDraft((current) => ({
                    ...current,
                    invoicePdfUrl: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <ActionButton
              onClick={createInvoice}
              busy={actionState === "create-invoice"}
              tone="primary"
            >
              Mirror invoice
            </ActionButton>
          </div>
          <div className="mt-4 space-y-3">
            {data?.invoices.length ? (
              data.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {invoice.stripeInvoiceId}
                    </p>
                    <StatusPill tone={toneForStatus(invoice.status)}>{invoice.status}</StatusPill>
                    {invoice.isPastDue ? (
                      <StatusPill tone="danger">past due</StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    remaining {formatNumber(invoice.amountRemaining)} {invoice.currency.toUpperCase()} minor units
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    due {formatDate(invoice.dueAt)} • paid {formatDate(invoice.paidAt)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
                No invoices mirrored yet.
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Billing events" description="Recent billing changes and admin interventions for this organization.">
        <div className="space-y-3">
          {data?.events.length ? (
            data.events.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-[22px] border border-[var(--border-default)] bg-white/72 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {event.eventType}
                    </p>
                    <StatusPill tone={toneForStatus(event.status)}>{event.status}</StatusPill>
                    <StatusPill tone="neutral">{event.source}</StatusPill>
                    {event.entitlementId ? (
                      <StatusPill tone="neutral">entitlement</StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {event.entitlementId || "organization scope"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Clock3 className="h-4 w-4" />
                  {formatDate(event.createdAt)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No billing events recorded yet for this organization.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
