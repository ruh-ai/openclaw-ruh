"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Boxes,
  ScrollText,
  Store,
  Users,
  Waypoints,
} from "lucide-react";

import { fetchAdminJson } from "@/lib/admin-api";
import {
  AttentionRow,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  formatDate,
  formatNumber,
} from "../_components/AdminPrimitives";

interface OverviewResponse {
  users: {
    total: number;
    byRole: { admin: number; developer: number; endUser: number };
    byStatus: { active: number; suspended: number; pending: number };
  };
  organizations: {
    total: number;
    developer: number;
    customer: number;
    top: Array<{
      id: string;
      name: string;
      slug: string;
      kind: string;
      memberCount: number;
      agentCount: number;
      installCount: number;
      listingCount: number;
    }>;
  };
  agents: {
    total: number;
    byStatus: { active: number; draft: number; forging: number };
  };
  runtime: {
    summary: {
      total: number;
      healthy: number;
      gateway_unreachable: number;
      db_only: number;
      container_only: number;
      sharedCodexEnabled: number;
    };
    issues: Array<{
      sandbox_id: string;
      sandbox_name: string | null;
      drift_state: string;
      linked_agents: Array<{ id: string; name: string; attachment: string }>;
    }>;
  };
  marketplace: {
    summary: {
      totalListings: number;
      published: number;
      pendingReview: number;
      totalInstalls: number;
    };
    topListings: Array<{
      id: string;
      title: string;
      status: string;
      installCount: number;
      ownerOrgName: string | null;
      publisherEmail: string | null;
      updatedAt: string;
    }>;
  };
  activity: {
    recentAuditEvents: Array<{
      event_id: string;
      occurred_at: string;
      action_type: string;
      target_type: string;
      target_id: string;
      outcome: string;
      actor_type: string;
      actor_id: string;
    }>;
  };
  attention: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
    href?: string;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAdminJson<OverviewResponse>("/api/admin/overview")
      .then((response) => {
        setData(response);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load overview");
      })
      .finally(() => setLoading(false));
  }, []);

  const runtimeDrift = data
    ? data.runtime.summary.gateway_unreachable +
      data.runtime.summary.db_only +
      data.runtime.summary.container_only
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform-wide command view for tenant growth, runtime health, audit activity, and marketplace momentum."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/runtime"
              className="inline-flex items-center rounded-[18px] border border-transparent bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(123,90,255,0.28)]"
            >
              Review runtime
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center rounded-[18px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.84)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
            >
              Moderate marketplace
            </Link>
          </div>
        }
      />

      {error ? (
        <Panel title="Overview unavailable" description={error}>
          <p className="text-sm text-[var(--text-secondary)]">
            The admin backend did not return a valid overview payload.
          </p>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Users"
          value={data?.users.total ?? 0}
          detail={
            data
              ? `${formatNumber(data.users.byRole.developer)} developers and ${formatNumber(data.users.byRole.endUser)} end users`
              : "Loading user totals"
          }
          icon={Users}
          tone="primary"
        />
        <MetricCard
          label="Organizations"
          value={data?.organizations.total ?? 0}
          detail={
            data
              ? `${data.organizations.developer} developer orgs and ${data.organizations.customer} customer orgs`
              : "Loading organizations"
          }
          icon={Boxes}
          tone="neutral"
        />
        <MetricCard
          label="Agents"
          value={data?.agents.total ?? 0}
          detail={
            data
              ? `${data.agents.byStatus.active} active, ${data.agents.byStatus.forging} forging`
              : "Loading agent counts"
          }
          icon={Bot}
          tone="success"
        />
        <MetricCard
          label="Healthy Sandboxes"
          value={data?.runtime.summary.healthy ?? 0}
          detail={
            data
              ? `${runtimeDrift} non-healthy entries across ${data.runtime.summary.total} tracked sandboxes`
              : "Loading runtime reconciliation"
          }
          icon={Waypoints}
          tone={runtimeDrift > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Marketplace Installs"
          value={data?.marketplace.summary.totalInstalls ?? 0}
          detail={
            data
              ? `${data.marketplace.summary.published} published listings, ${data.marketplace.summary.pendingReview} pending review`
              : "Loading marketplace health"
          }
          icon={Store}
          tone="warning"
        />
        <MetricCard
          label="Recent Audit Events"
          value={data?.activity.recentAuditEvents.length ?? 0}
          detail="Most recent control-plane mutations and operational actions."
          icon={ScrollText}
          tone="danger"
        />
      </div>

      <Panel
        title="Needs Attention"
        description="Operational and business signals that currently deserve a human decision."
      >
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-[var(--text-secondary)]">Loading attention items…</p>
          ) : data && data.attention.length > 0 ? (
            data.attention.map((item) => (
              <AttentionRow
                key={item.id}
                title={item.title}
                detail={item.detail}
                severity={item.severity}
                href={item.href}
              />
            ))
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4">
              <AlertTriangle className="h-5 w-5 text-[var(--success)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                No urgent control-plane issues surfaced in the current snapshot.
              </p>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Top Organizations"
          description="Developer and customer orgs currently driving the most activity."
        >
          <div className="space-y-3">
            {data?.organizations.top.map((org) => (
              <div
                key={org.id}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {org.name}
                    </p>
                    <StatusPill tone={org.kind === "developer" ? "primary" : "warning"}>
                      {org.kind}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {org.slug}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm text-[var(--text-secondary)]">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {formatNumber(org.memberCount)}
                    </p>
                    <p>Members</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {formatNumber(org.agentCount)}
                    </p>
                    <p>Agents</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {formatNumber(org.installCount)}
                    </p>
                    <p>Installs</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Recent Audit Activity"
          description="Latest high-signal mutations and operational actions."
        >
          <div className="space-y-3">
            {data?.activity.recentAuditEvents.map((event) => (
              <div
                key={event.event_id}
                className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={event.outcome === "success" ? "success" : "danger"}>
                    {event.outcome}
                  </StatusPill>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {event.action_type}
                  </p>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {event.target_type} <span className="font-medium">{event.target_id}</span>
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {event.actor_type} <span className="font-medium">{event.actor_id}</span>
                </p>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                  {formatDate(event.occurred_at)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Runtime Issues"
          description="Non-healthy runtime entries surfaced by reconciliation."
        >
          <div className="space-y-3">
            {data?.runtime.issues.length ? (
              data.runtime.issues.map((item) => (
                <div
                  key={item.sandbox_id}
                  className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {item.sandbox_name || item.sandbox_id}
                    </p>
                    <StatusPill tone="danger">{item.drift_state}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {item.sandbox_id}
                  </p>
                  {item.linked_agents.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.linked_agents.map((agent) => (
                        <StatusPill
                          key={`${item.sandbox_id}-${agent.id}-${agent.attachment}`}
                          tone={agent.attachment === "forge" ? "warning" : "primary"}
                        >
                          {agent.name}
                        </StatusPill>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                No runtime drift items are currently reported.
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title="Top Marketplace Listings"
          description="Published or emerging listings with the strongest adoption signal."
        >
          <div className="space-y-3">
            {data?.marketplace.topListings.map((listing) => (
              <div
                key={listing.id}
                className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {listing.title}
                  </p>
                  <StatusPill tone={listing.status === "published" ? "success" : "warning"}>
                    {listing.status}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {listing.ownerOrgName || listing.publisherEmail || "Unknown owner"}
                </p>
                <div className="mt-3 flex items-center justify-between text-sm text-[var(--text-secondary)]">
                  <span>{formatNumber(listing.installCount)} installs</span>
                  <span>Updated {formatDate(listing.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
