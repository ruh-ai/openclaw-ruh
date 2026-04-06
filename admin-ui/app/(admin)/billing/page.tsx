"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { fetchAdminJson } from "@/lib/admin-api";
import {
  ActionButton,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  fieldClassName,
  formatDate,
  formatNumber,
} from "../_components/AdminPrimitives";

interface BillingOpsResponse {
  summary: {
    customerOrgs: number;
    activeEntitlements: number;
    pastDueOrgs: number;
    blockedOrgs: number;
    missingCustomerLinks: number;
    overrideActiveEntitlements: number;
    invoicesDue: number;
    amountDue: number;
  };
  items: Array<{
    orgId: string;
    orgName: string;
    orgSlug: string;
    orgStatus: string;
    plan: string;
    customerLinked: boolean;
    activeEntitlements: number;
    blockedEntitlements: number;
    pastDueEntitlements: number;
    overrideActiveEntitlements: number;
    payableInvoices: number;
    amountDue: number;
    seatCapacity: number;
    seatInUse: number;
    risk: "high" | "medium" | "low";
    signals: string[];
    lastEventAt: string | null;
  }>;
  events: Array<{
    id: string;
    orgId: string;
    orgName: string;
    orgSlug: string;
    source: string;
    eventType: string;
    status: string;
    createdAt: string;
  }>;
}

function riskTone(risk: string) {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  return "primary";
}

export default function BillingOpsPage() {
  const [data, setData] = useState<BillingOpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("all");

  const loadBillingOps = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (risk !== "all") params.set("risk", risk);

    fetchAdminJson<BillingOpsResponse>(
      `/api/admin/billing/ops${params.toString() ? `?${params.toString()}` : ""}`,
    )
      .then((response) => {
        setData(response);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load billing ops");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBillingOps();
  }, [search, risk]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Ops"
        description="Operate the commercial control plane without losing the boundary between Stripe finance truth and Ruh product-access truth. Use this queue to find customer orgs that are past due, blocked, under-provisioned, or missing billing linkage."
        actions={
          <ActionButton onClick={loadBillingOps} busy={loading} tone="secondary">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </ActionButton>
        }
      />

      {error ? (
        <div className="rounded-[24px] border border-[var(--danger-soft)] bg-[rgba(255,244,247,0.92)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Customer orgs"
          value={data?.summary.customerOrgs ?? 0}
          detail="Customer tenants currently in the billing fleet queue."
          icon={CreditCard}
          tone="primary"
        />
        <MetricCard
          label="Active entitlements"
          value={data?.summary.activeEntitlements ?? 0}
          detail="Recorded entitlements currently allowing access."
          icon={ShieldCheck}
          tone="success"
        />
        <MetricCard
          label="Past due orgs"
          value={data?.summary.pastDueOrgs ?? 0}
          detail="Organizations with at least one past_due or unpaid entitlement."
          icon={AlertTriangle}
          tone="warning"
        />
        <MetricCard
          label="Blocked orgs"
          value={data?.summary.blockedOrgs ?? 0}
          detail="Organizations where at least one entitlement is currently blocked."
          icon={ShieldAlert}
          tone="danger"
        />
      </div>

      <Panel
        title="Fleet queue"
        description="Filter for customers that need intervention, then jump into the org-specific billing console."
        actions={
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput);
            }}
          >
            <input
              className={`${fieldClassName} min-w-[220px]`}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search org name or slug"
            />
            <select
              className={fieldClassName}
              value={risk}
              onChange={(event) => setRisk(event.target.value)}
            >
              <option value="all">All risk levels</option>
              <option value="high">High risk</option>
              <option value="medium">Medium risk</option>
              <option value="low">Low risk</option>
            </select>
            <ActionButton type="submit">Apply</ActionButton>
          </form>
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Missing customer links
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(data?.summary.missingCustomerLinks ?? 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Override-active entitlements
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(data?.summary.overrideActiveEntitlements ?? 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Invoices with remaining balance
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(data?.summary.invoicesDue ?? 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Recorded amount due
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(data?.summary.amountDue ?? 0)}
            </p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Stored in billing minor units from the mirror records.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-5 text-sm text-[var(--text-secondary)]">
              Loading billing queue…
            </div>
          ) : data?.items.length ? (
            data.items.map((item) => (
              <div
                key={item.orgId}
                className="flex flex-col gap-4 rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4 xl:flex-row xl:items-center xl:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-[var(--text-primary)]">
                      {item.orgName}
                    </p>
                    <StatusPill tone={riskTone(item.risk)}>{item.risk} risk</StatusPill>
                    <StatusPill tone={item.customerLinked ? "success" : "warning"}>
                      {item.customerLinked ? "customer linked" : "missing customer"}
                    </StatusPill>
                    <StatusPill tone={item.orgStatus === "active" ? "success" : "warning"}>
                      {item.orgStatus}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {item.orgSlug} • plan {item.plan}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
                    <span>{item.activeEntitlements} active</span>
                    <span>{item.blockedEntitlements} blocked</span>
                    <span>{item.pastDueEntitlements} past due</span>
                    <span>{item.payableInvoices} invoices open</span>
                    <span>
                      seats {item.seatInUse}/{item.seatCapacity}
                    </span>
                  </div>
                  {item.signals.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.signals.slice(0, 3).map((signal) => (
                        <StatusPill key={signal} tone={riskTone(item.risk)}>
                          {signal}
                        </StatusPill>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <div className="text-right text-sm text-[var(--text-secondary)]">
                    <p>amount due {formatNumber(item.amountDue)}</p>
                    <p>last event {formatDate(item.lastEventAt)}</p>
                  </div>
                  <Link
                    href={`/organizations/${item.orgId}/billing`}
                    className="inline-flex items-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(123,90,255,0.24)]"
                  >
                    Open billing console
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No organizations matched the current billing filters.
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Recent billing events"
        description="Newest mirror and support actions across customer organizations."
      >
        <div className="space-y-3">
          {data?.events.length ? (
            data.events.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {event.eventType}
                    </p>
                    <StatusPill tone={event.status === "success" ? "success" : "warning"}>
                      {event.status}
                    </StatusPill>
                    <StatusPill tone="neutral">{event.source}</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {event.orgName} • {event.orgSlug}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                  <span>{formatDate(event.createdAt)}</span>
                  <Link
                    href={`/organizations/${event.orgId}/billing`}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--accent-primary)]"
                  >
                    Inspect
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No billing events recorded yet.
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Operating model"
        description="Keep the financial source of truth in Stripe, and use this panel for product access, seat governance, and commercial support operations."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Money truth</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Stripe owns payment state, invoice settlement, refunds, and customer billing identity.
            </p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Access truth</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Ruh entitlements decide whether a customer org can currently use a purchased capability and how many seats they can consume.
            </p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/70 p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Admin support actions</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Use organization billing consoles to link Stripe customers, mirror subscriptions and invoices, pause or resume access, and grant temporary access during incidents.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
