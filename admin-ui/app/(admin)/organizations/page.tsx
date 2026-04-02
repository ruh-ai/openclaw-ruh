"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import {
  Briefcase,
  Building2,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import { fetchAdminJson, mutateAdminJson } from "@/lib/admin-api";
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

interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  kind: string;
  plan: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  activeMemberCount: number;
  activeSessionCount: number;
  membershipBreakdown: {
    owner: number;
    admin: number;
    developer: number;
    employee: number;
  };
  agentCount: number;
  activeAgentCount: number;
  listingCount: number;
  publishedListingCount: number;
  installCount: number;
}

interface OrganizationsResponse {
  items: OrganizationRecord[];
  total: number;
}

function statusTone(status: string) {
  if (status === "active") return "success";
  if (status === "suspended") return "danger";
  return "warning";
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [data, setData] = useState<OrganizationsResponse>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createDraft, setCreateDraft] = useState({
    name: "",
    slug: "",
    kind: "customer",
    plan: "free",
    status: "active",
    ownerEmail: "",
    ownerRole: "owner",
    ownerStatus: "active",
  });
  const deferredSearch = useDeferredValue(search);

  const loadOrganizations = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (deferredSearch) params.set("search", deferredSearch);
    if (kindFilter) params.set("kind", kindFilter);
    if (statusFilter) params.set("status", statusFilter);

    fetchAdminJson<OrganizationsResponse>(
      `/api/admin/organizations?${params.toString()}`,
    )
      .then((response) => {
        setData(response);
        setError("");
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load organizations",
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrganizations();
  }, [deferredSearch, kindFilter, statusFilter]);

  const updateOrganization = async (
    orgId: string,
    patch: Record<string, unknown>,
  ) => {
    setSavingId(orgId);
    try {
      await mutateAdminJson(`/api/admin/organizations/${orgId}`, "PATCH", patch);
      loadOrganizations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update organization",
      );
    } finally {
      setSavingId(null);
    }
  };

  const createOrganization = async () => {
    if (!createDraft.name.trim()) {
      setError("Organization name is required");
      return;
    }

    setCreating(true);
    try {
      const response = await mutateAdminJson<{ organization: { id: string } }>(
        "/api/admin/organizations",
        "POST",
        {
          ...createDraft,
          name: createDraft.name.trim(),
          slug: createDraft.slug.trim(),
          ownerEmail: createDraft.ownerEmail.trim(),
        },
      );
      setCreateDraft({
        name: "",
        slug: "",
        kind: "customer",
        plan: "free",
        status: "active",
        ownerEmail: "",
        ownerRole: "owner",
        ownerStatus: "active",
      });
      setError("");
      loadOrganizations();
      router.push(`/organizations/${response.organization.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create organization",
      );
    } finally {
      setCreating(false);
    }
  };

  const developerOrgs = data.items.filter((org) => org.kind === "developer").length;
  const customerOrgs = data.items.filter((org) => org.kind === "customer").length;
  const activeOrgs = data.items.filter((org) => org.status === "active").length;
  const installs = data.items.reduce((sum, org) => sum + org.installCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="Fleet view of every tenant, with quick governance actions and direct access into each organization console."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Visible Orgs"
          value={data.total}
          detail="Organizations matching the current filters."
          icon={Building2}
          tone="primary"
        />
        <MetricCard
          label="Developer / Customer"
          value={`${developerOrgs}/${customerOrgs}`}
          detail="Developer orgs versus customer orgs."
          icon={Briefcase}
          tone="warning"
        />
        <MetricCard
          label="Active Tenants"
          value={activeOrgs}
          detail={`${data.total - activeOrgs} organizations are suspended or archived.`}
          icon={ShieldCheck}
          tone={activeOrgs === data.total ? "success" : "warning"}
        />
        <MetricCard
          label="Installs"
          value={installs}
          detail="Marketplace install volume attributed to visible orgs."
          icon={Wallet}
          tone="danger"
        />
      </div>

      <Panel
        title="Create organization"
        description="Create a new tenant and optionally seed an initial membership from an existing platform user."
      >
        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.9fr_0.75fr_0.75fr]">
          <input
            type="text"
            value={createDraft.name}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Organization name"
            className={fieldClassName}
          />
          <input
            type="text"
            value={createDraft.slug}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, slug: event.target.value }))
            }
            placeholder="Slug (optional)"
            className={fieldClassName}
          />
          <select
            value={createDraft.kind}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, kind: event.target.value }))
            }
            className={fieldClassName}
          >
            <option value="customer">Customer</option>
            <option value="developer">Developer</option>
          </select>
          <select
            value={createDraft.plan}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, plan: event.target.value }))
            }
            className={fieldClassName}
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_0.85fr_0.85fr_0.75fr_auto]">
          <input
            type="text"
            value={createDraft.ownerEmail}
            onChange={(event) =>
              setCreateDraft((current) => ({
                ...current,
                ownerEmail: event.target.value,
              }))
            }
            placeholder="Owner email (optional, existing user)"
            className={fieldClassName}
          />
          <select
            value={createDraft.ownerRole}
            onChange={(event) =>
              setCreateDraft((current) => ({
                ...current,
                ownerRole: event.target.value,
              }))
            }
            className={fieldClassName}
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
            <option value="employee">Employee</option>
          </select>
          <select
            value={createDraft.ownerStatus}
            onChange={(event) =>
              setCreateDraft((current) => ({
                ...current,
                ownerStatus: event.target.value,
              }))
            }
            className={fieldClassName}
          >
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            value={createDraft.status}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, status: event.target.value }))
            }
            className={fieldClassName}
          >
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
          <ActionButton
            tone="primary"
            onClick={createOrganization}
            busy={creating}
            disabled={creating || savingId !== null}
          >
            Create organization
          </ActionButton>
        </div>
      </Panel>

      <Panel
        title="Organization Inventory"
        description="Update high-signal org settings directly here, then open the full organization console for deeper tenant operations."
        actions={
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search org name or slug"
              className={fieldClassName}
            />
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
              className={fieldClassName}
            >
              <option value="">All kinds</option>
              <option value="developer">Developer</option>
              <option value="customer">Customer</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={fieldClassName}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        }
      >
        {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="space-y-4">
          {data.items.map((org) => (
            <div
              key={org.id}
              className="rounded-[28px] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-5"
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-[var(--text-primary)]">
                        {org.name}
                      </p>
                      <StatusPill tone={org.kind === "developer" ? "primary" : "warning"}>
                        {org.kind}
                      </StatusPill>
                      <StatusPill tone={statusTone(org.status)}>{org.status}</StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {org.slug}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                      Created {formatDate(org.createdAt)} · Updated {formatDate(org.updatedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone="success">
                      {org.activeMemberCount} active members
                    </StatusPill>
                    <StatusPill tone="primary">
                      {org.membershipBreakdown.owner} owners
                    </StatusPill>
                    <StatusPill tone="warning">
                      {org.membershipBreakdown.admin} admins
                    </StatusPill>
                    <StatusPill tone="neutral">
                      {org.activeSessionCount} active sessions
                    </StatusPill>
                    <StatusPill tone="success">
                      {org.activeAgentCount} active agents
                    </StatusPill>
                    <StatusPill tone="danger">
                      {org.publishedListingCount} published listings
                    </StatusPill>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {formatNumber(org.memberCount)}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">Members</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {formatNumber(org.agentCount)}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">Agents</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {formatNumber(org.listingCount)}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">Listings</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {formatNumber(org.installCount)}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">Installs</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  <select
                    value={org.plan}
                    onChange={(event) =>
                      updateOrganization(org.id, { plan: event.target.value })
                    }
                    disabled={savingId === org.id}
                    className={fieldClassName}
                  >
                    {["free", "pro", "business", "enterprise"].includes(org.plan) ? null : (
                      <option value={org.plan}>{org.plan}</option>
                    )}
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="business">Business</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                  <select
                    value={org.status}
                    onChange={(event) =>
                      updateOrganization(org.id, { status: event.target.value })
                    }
                    disabled={savingId === org.id}
                    className={fieldClassName}
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/organizations/${org.id}`}
                    className="inline-flex items-center justify-center rounded-[18px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.84)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand-border-strong)] hover:bg-white"
                  >
                    Open org console
                  </Link>
                  <ActionButton
                    tone={org.status === "active" ? "danger" : "success"}
                    onClick={() =>
                      updateOrganization(org.id, {
                        status: org.status === "active" ? "suspended" : "active",
                      })
                    }
                    busy={savingId === org.id}
                    disabled={savingId !== null}
                  >
                    {org.status === "active" ? "Suspend access" : "Reactivate"}
                  </ActionButton>
                  {org.status !== "archived" ? (
                    <ActionButton
                      tone="warning"
                      onClick={() => updateOrganization(org.id, { status: "archived" })}
                      busy={savingId === org.id}
                      disabled={savingId !== null}
                    >
                      Archive
                    </ActionButton>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {!loading && data.items.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            No organizations matched the current filters.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
