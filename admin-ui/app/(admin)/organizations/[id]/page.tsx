"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Boxes,
  CreditCard,
  RefreshCw,
  ShieldAlert,
  Store,
  Trash2,
  UserPlus,
  Users,
  Waypoints,
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
} from "../../_components/AdminPrimitives";

interface OrganizationDetailResponse {
  organization: {
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
  };
  members: Array<{
    id: string;
    userId: string;
    role: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    user: {
      email: string;
      displayName: string;
      role: string;
      status: string;
      emailVerified: boolean;
      createdAt: string;
    };
  }>;
  agents: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    createdAt: string;
    sandboxIds: string[];
    forgeSandboxId: string | null;
    creatorEmail: string | null;
    creatorDisplayName: string | null;
  }>;
  listings: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    version: string;
    category: string;
    installCount: number;
    updatedAt: string;
    publisherEmail: string | null;
  }>;
  installs: Array<{
    userId: string;
    userEmail: string;
    listingId: string;
    listingTitle: string;
    agentId: string;
    agentName: string | null;
    version: string;
    installedAt: string;
    lastLaunchedAt: string | null;
  }>;
  sessions: Array<{
    id: string;
    userId: string;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: string;
    expiresAt: string;
    user: {
      email: string;
      displayName: string;
      role: string;
      status: string;
    };
  }>;
  runtime: Array<{
    sandbox_id: string;
    sandbox_name: string | null;
    sandbox_state: string | null;
    approved: boolean;
    shared_codex_enabled: boolean;
    shared_codex_model: string | null;
    dashboard_url: string | null;
    signed_url: string | null;
    standard_url: string | null;
    created_at: string | null;
    linked_agents: Array<{
      id: string;
      name: string;
      status: string;
      attachment: string;
    }>;
  }>;
  audit: {
    items: Array<{
      event_id: string;
      occurred_at: string;
      request_id: string | null;
      action_type: string;
      target_type: string;
      target_id: string;
      outcome: string;
      actor_type: string;
      actor_id: string;
      details: Record<string, unknown>;
    }>;
  };
  warnings: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
  }>;
}

type OrgTab = "overview" | "people" | "assets" | "runtime" | "audit";

type MemberDraftState = Record<
  string,
  {
    role: string;
    status: string;
  }
>;

const TABS: Array<{ id: OrgTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "assets", label: "Assets" },
  { id: "runtime", label: "Runtime" },
  { id: "audit", label: "Audit" },
];

function statusTone(status: string) {
  if (status === "active" || status === "published" || status === "success") {
    return "success";
  }
  if (status === "suspended" || status === "rejected") {
    return "danger";
  }
  if (status === "archived" || status === "pending_review" || status === "invited") {
    return "warning";
  }
  return "neutral";
}

function summaryCardTone(value: number) {
  return value > 0 ? "warning" : "primary";
}

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orgId = useMemo(() => String(params.id), [params.id]);

  const [activeTab, setActiveTab] = useState<OrgTab>("overview");
  const [data, setData] = useState<OrganizationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionState, setActionState] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    slug: "",
    plan: "free",
    status: "active",
  });
  const [memberDrafts, setMemberDrafts] = useState<MemberDraftState>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [inviteStatus, setInviteStatus] = useState("active");

  const loadOrganization = () => {
    setLoading(true);
    fetchAdminJson<OrganizationDetailResponse>(`/api/admin/organizations/${orgId}`)
      .then((response) => {
        setData(response);
        setDraft({
          name: response.organization.name,
          slug: response.organization.slug,
          plan: response.organization.plan,
          status: response.organization.status,
        });
        setMemberDrafts(
          Object.fromEntries(
            response.members.map((member) => [
              member.id,
              { role: member.role, status: member.status },
            ]),
          ),
        );
        setError("");
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load organization",
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrganization();
  }, [orgId]);

  const saveOrganization = async () => {
    setActionState("save-org");
    try {
      await mutateAdminJson(`/api/admin/organizations/${orgId}`, "PATCH", draft);
      loadOrganization();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update organization",
      );
    } finally {
      setActionState(null);
    }
  };

  const transitionOrganization = async (
    nextStatus: "active" | "suspended" | "archived",
    options: {
      revokeSessions?: boolean;
      confirmMessage: string;
    },
  ) => {
    const confirmed = window.confirm(options.confirmMessage);
    if (!confirmed) return;
    setActionState(`status:${nextStatus}`);
    try {
      await mutateAdminJson(`/api/admin/organizations/${orgId}`, "PATCH", {
        status: nextStatus,
      });
      if (options.revokeSessions) {
        await mutateAdminJson(`/api/admin/organizations/${orgId}/sessions`, "DELETE");
      }
      loadOrganization();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update organization status",
      );
    } finally {
      setActionState(null);
    }
  };

  const resetSessionContext = async () => {
    const confirmed = window.confirm(
      "Clear active organization context for all current sessions on this org?",
    );
    if (!confirmed) return;
    setActionState("reset-sessions");
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/session-context/reset`,
        "POST",
      );
      loadOrganization();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset session context",
      );
    } finally {
      setActionState(null);
    }
  };

  const addMember = async () => {
    if (!inviteEmail.trim()) return;
    setActionState("add-member");
    try {
      await mutateAdminJson(`/api/admin/organizations/${orgId}/members`, "POST", {
        email: inviteEmail.trim(),
        role: inviteRole,
        status: inviteStatus,
      });
      setInviteEmail("");
      setInviteRole("employee");
      setInviteStatus("active");
      loadOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setActionState(null);
    }
  };

  const updateMemberDraft = (
    membershipId: string,
    key: "role" | "status",
    value: string,
  ) => {
    setMemberDrafts((current) => ({
      ...current,
      [membershipId]: {
        ...(current[membershipId] ?? { role: "employee", status: "active" }),
        [key]: value,
      },
    }));
  };

  const saveMember = async (membershipId: string) => {
    const patch = memberDrafts[membershipId];
    if (!patch) return;
    setActionState(`member:${membershipId}`);
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/members/${membershipId}`,
        "PATCH",
        patch,
      );
      loadOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setActionState(null);
    }
  };

  const removeMember = async (membershipId: string, email: string) => {
    const confirmed = window.confirm(`Remove ${email} from this organization?`);
    if (!confirmed) return;
    setActionState(`member-delete:${membershipId}`);
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/members/${membershipId}`,
        "DELETE",
      );
      loadOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setActionState(null);
    }
  };

  const revokeSession = async (sessionId: string, email: string) => {
    const confirmed = window.confirm(`Revoke the active session for ${email}?`);
    if (!confirmed) return;
    setActionState(`session:${sessionId}`);
    try {
      await mutateAdminJson(
        `/api/admin/organizations/${orgId}/sessions/${sessionId}`,
        "DELETE",
      );
      loadOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setActionState(null);
    }
  };

  const revokeAllSessions = async () => {
    const confirmed = window.confirm(
      "Revoke every active session currently pinned to this organization?",
    );
    if (!confirmed) return;
    setActionState("sessions:revoke-all");
    try {
      await mutateAdminJson(`/api/admin/organizations/${orgId}/sessions`, "DELETE");
      loadOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke sessions");
    } finally {
      setActionState(null);
    }
  };

  const deleteOrganization = async () => {
    const confirmed = window.confirm(
      "Delete this organization permanently? Only archived and empty organizations can be deleted.",
    );
    if (!confirmed) return;
    setActionState("delete-org");
    try {
      await mutateAdminJson(`/api/admin/organizations/${orgId}`, "DELETE");
      router.push("/organizations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete organization");
    } finally {
      setActionState(null);
    }
  };

  const organization = data?.organization;

  const renderOverview = () => (
    <div className="space-y-6">
      {data?.warnings.length ? (
        <div className="space-y-3">
          {data.warnings.map((warning) => (
            <AttentionRow
              key={warning.id}
              title={warning.title}
              detail={warning.detail}
              severity={warning.severity}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="Organization settings"
          description="Core org identity, plan, and lifecycle status."
          actions={
            <ActionButton
              tone="primary"
              busy={actionState === "save-org"}
              onClick={saveOrganization}
            >
              Save changes
            </ActionButton>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Name
              </span>
              <input
                className={fieldClassName}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Slug
              </span>
              <input
                className={fieldClassName}
                value={draft.slug}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, slug: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Plan
              </span>
              <input
                className={fieldClassName}
                value={draft.plan}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, plan: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Status
              </span>
              <select
                className={fieldClassName}
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="active">active</option>
                <option value="suspended">suspended</option>
                <option value="archived">archived</option>
              </select>
            </label>
          </div>
        </Panel>

        <Panel
          title="Lifecycle actions"
          description="High-value controls for org governance and access."
        >
          <div className="grid gap-3">
            <ActionButton
              onClick={() =>
                transitionOrganization("active", {
                  confirmMessage: "Reactivate this organization?",
                })
              }
              busy={actionState === "status:active"}
            >
              Reactivate
            </ActionButton>
            <ActionButton
              tone="danger"
              onClick={() =>
                transitionOrganization("suspended", {
                  revokeSessions: true,
                  confirmMessage:
                    "Suspend this organization and revoke org-pinned sessions?",
                })
              }
              busy={actionState === "status:suspended"}
            >
              Suspend + revoke access
            </ActionButton>
            <ActionButton
              onClick={() =>
                transitionOrganization("archived", {
                  confirmMessage: "Archive this organization?",
                })
              }
              busy={actionState === "status:archived"}
            >
              Archive
            </ActionButton>
            <ActionButton
              onClick={resetSessionContext}
              busy={actionState === "reset-sessions"}
            >
              Reset session context
            </ActionButton>
            <ActionButton
              tone="danger"
              onClick={revokeAllSessions}
              busy={actionState === "sessions:revoke-all"}
            >
              Revoke org sessions
            </ActionButton>
            <ActionButton
              tone="danger"
              onClick={deleteOrganization}
              busy={actionState === "delete-org"}
            >
              <Trash2 className="h-4 w-4" />
              Delete archived org
            </ActionButton>
          </div>
        </Panel>
      </div>

      <Panel
        title="Membership footprint"
        description="A quick read on whether this organization has the right operators in place."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/72 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Owners
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(organization?.membershipBreakdown.owner ?? 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/72 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Admins
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(organization?.membershipBreakdown.admin ?? 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/72 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Developers
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(organization?.membershipBreakdown.developer ?? 0)}
            </p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white/72 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Employees
            </p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {formatNumber(organization?.membershipBreakdown.employee ?? 0)}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );

  const renderPeople = () => (
    <div className="space-y-6">
      <Panel
        title="Member operations"
        description="Add members, correct roles, and govern membership state without leaving the org console."
      >
        <div className="grid gap-3 rounded-[24px] border border-[var(--border-default)] bg-white/68 p-4 md:grid-cols-[1.5fr_0.8fr_0.8fr_auto]">
          <input
            className={fieldClassName}
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="Member email"
          />
          <select
            className={fieldClassName}
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value)}
          >
            <option value="owner">owner</option>
            <option value="admin">admin</option>
            <option value="developer">developer</option>
            <option value="employee">employee</option>
          </select>
          <select
            className={fieldClassName}
            value={inviteStatus}
            onChange={(event) => setInviteStatus(event.target.value)}
          >
            <option value="active">active</option>
            <option value="invited">invited</option>
            <option value="suspended">suspended</option>
          </select>
          <ActionButton
            tone="primary"
            busy={actionState === "add-member"}
            onClick={addMember}
          >
            <UserPlus className="h-4 w-4" />
            Add member
          </ActionButton>
        </div>

        <div className="mt-4 space-y-3">
          {data?.members.length ? (
            data.members.map((member) => {
              const memberDraft = memberDrafts[member.id] ?? {
                role: member.role,
                status: member.status,
              };
              return (
                <div
                  key={member.id}
                  className="rounded-[24px] border border-[var(--border-default)] bg-white/74 p-4"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {member.user.displayName || member.user.email}
                        </p>
                        <StatusPill tone={statusTone(member.user.status)}>
                          user {member.user.status}
                        </StatusPill>
                        <StatusPill tone={statusTone(member.role)}>
                          {member.role}
                        </StatusPill>
                        <StatusPill tone={statusTone(member.status)}>
                          membership {member.status}
                        </StatusPill>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {member.user.email} • platform role {member.user.role} • joined{" "}
                        {formatDate(member.createdAt)}
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[160px_160px_auto_auto]">
                      <select
                        className={fieldClassName}
                        value={memberDraft.role}
                        onChange={(event) =>
                          updateMemberDraft(member.id, "role", event.target.value)
                        }
                      >
                        <option value="owner">owner</option>
                        <option value="admin">admin</option>
                        <option value="developer">developer</option>
                        <option value="employee">employee</option>
                      </select>
                      <select
                        className={fieldClassName}
                        value={memberDraft.status}
                        onChange={(event) =>
                          updateMemberDraft(member.id, "status", event.target.value)
                        }
                      >
                        <option value="active">active</option>
                        <option value="invited">invited</option>
                        <option value="suspended">suspended</option>
                      </select>
                      <ActionButton
                        busy={actionState === `member:${member.id}`}
                        onClick={() => saveMember(member.id)}
                      >
                        Save
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        busy={actionState === `member-delete:${member.id}`}
                        onClick={() => removeMember(member.id, member.user.email)}
                      >
                        Remove
                      </ActionButton>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No members yet.
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Active sessions"
        description="See who is actively pinned to this organization and revoke access quickly."
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionButton
              busy={actionState === "sessions:revoke-all"}
              onClick={revokeAllSessions}
            >
              Revoke all
            </ActionButton>
            <ActionButton
              busy={actionState === "reset-sessions"}
              onClick={resetSessionContext}
            >
              Reset active-org selection
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-3">
          {data?.sessions.length ? (
            data.sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-col gap-3 rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4 xl:flex-row xl:items-center xl:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {session.user.displayName || session.user.email}
                    </p>
                    <StatusPill tone={statusTone(session.user.status)}>
                      {session.user.status}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {session.user.email} • {session.ipAddress || "IP unknown"} • created{" "}
                    {formatDate(session.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    expires {formatDate(session.expiresAt)} • {session.userAgent || "User agent unavailable"}
                  </p>
                </div>
                <ActionButton
                  tone="danger"
                  busy={actionState === `session:${session.id}`}
                  onClick={() => revokeSession(session.id, session.user.email)}
                >
                  Revoke session
                </ActionButton>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No active sessions are currently pinned to this organization.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );

  const renderAssets = () => (
    <div className="space-y-6">
      <Panel
        title="Agents"
        description="Every agent currently owned by this organization."
      >
        <div className="grid gap-3">
          {data?.agents.length ? (
            data.agents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-[24px] border border-[var(--border-default)] bg-white/74 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {agent.name}
                  </p>
                  <StatusPill tone={statusTone(agent.status)}>{agent.status}</StatusPill>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {agent.description || "No description recorded."}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  creator {agent.creatorDisplayName || agent.creatorEmail || "Unknown"} • created{" "}
                  {formatDate(agent.createdAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {agent.sandboxIds.map((sandboxId) => (
                    <StatusPill key={sandboxId} tone="neutral">
                      sandbox {sandboxId}
                    </StatusPill>
                  ))}
                  {agent.forgeSandboxId ? (
                    <StatusPill tone="primary">forge {agent.forgeSandboxId}</StatusPill>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No agents owned by this organization.
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Marketplace listings"
          description="Published and draft listings attached to this organization."
        >
          <div className="space-y-3">
            {data?.listings.length ? (
              data.listings.map((listing) => (
                <div
                  key={listing.id}
                  className="rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {listing.title}
                    </p>
                    <StatusPill tone={statusTone(listing.status)}>
                      {listing.status}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {listing.slug} • version {listing.version} • {listing.category}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    installs {formatNumber(listing.installCount)} • updated{" "}
                    {formatDate(listing.updatedAt)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
                No marketplace listings for this organization.
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Installed listing footprint"
          description="Customer adoption tied to this organization."
        >
          <div className="space-y-3">
            {data?.installs.length ? (
              data.installs.map((install) => (
                <div
                  key={`${install.userId}:${install.listingId}:${install.installedAt}`}
                  className="rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4"
                >
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {install.listingTitle}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    user {install.userEmail} • version {install.version}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    installed {formatDate(install.installedAt)} • last launched{" "}
                    {formatDate(install.lastLaunchedAt)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
                No installs recorded for this organization.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );

  const renderRuntime = () => (
    <div className="space-y-6">
      <Panel
        title="Runtime surface"
        description="Sandbox visibility for the organization without mixing it into people and asset operations."
      >
        <div className="space-y-3">
          {data?.runtime.length ? (
            data.runtime.map((runtime) => (
              <div
                key={runtime.sandbox_id}
                className="rounded-[24px] border border-[var(--border-default)] bg-white/74 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {runtime.sandbox_name || runtime.sandbox_id}
                  </p>
                  <StatusPill tone={statusTone(runtime.sandbox_state || "unknown")}>
                    {runtime.sandbox_state || "unknown"}
                  </StatusPill>
                  <StatusPill tone={runtime.approved ? "success" : "warning"}>
                    {runtime.approved ? "approved" : "unapproved"}
                  </StatusPill>
                  {runtime.shared_codex_enabled ? (
                    <StatusPill tone="primary">
                      shared codex {runtime.shared_codex_model || ""}
                    </StatusPill>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {runtime.linked_agents.map((agent) => (
                    <StatusPill key={`${runtime.sandbox_id}:${agent.id}`} tone="neutral">
                      {agent.attachment} • {agent.name}
                    </StatusPill>
                  ))}
                </div>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  created {formatDate(runtime.created_at)} • dashboard{" "}
                  {runtime.dashboard_url || "not available"}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No runtime entries currently linked to this organization.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );

  const renderAudit = () => (
    <div className="space-y-6">
      <Panel
        title="Audit trail"
        description="Recent org-scoped control-plane activity."
      >
        <div className="space-y-3">
          {data?.audit.items.length ? (
            data.audit.items.map((item) => (
              <div
                key={item.event_id}
                className="rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {item.action_type}
                  </p>
                  <StatusPill tone={statusTone(item.outcome)}>{item.outcome}</StatusPill>
                  <StatusPill tone="neutral">{item.target_type}</StatusPill>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  target {item.target_id} • actor {item.actor_type}:{item.actor_id}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  occurred {formatDate(item.occurred_at)} • request {item.request_id || "—"}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-[var(--border-default)] bg-white/60 p-5 text-sm text-[var(--text-secondary)]">
              No audit events yet.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={organization?.name || "Organization"}
        description="Operate this organization through focused tabs instead of one long surface. Keep the core identity visible, then move into people, assets, runtime, or audit only when needed."
        actions={
          <>
            <Link
              href="/organizations"
              className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--border-default)] bg-white/84 px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Organizations
            </Link>
            <Link
              href={`/organizations/${orgId}/billing`}
              className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--border-default)] bg-white/84 px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
            >
              <CreditCard className="h-4 w-4" />
              Billing
            </Link>
            <ActionButton onClick={loadOrganization} busy={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </ActionButton>
          </>
        }
      />

      {error ? (
        <div className="rounded-[24px] border border-[var(--danger-soft)] bg-[rgba(255,244,247,0.9)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Members"
          value={organization?.memberCount ?? 0}
          detail={`${formatNumber(organization?.activeMemberCount ?? 0)} active memberships`}
          icon={Users}
          tone="primary"
        />
        <MetricCard
          label="Agents"
          value={organization?.agentCount ?? 0}
          detail={`${formatNumber(organization?.activeAgentCount ?? 0)} active`}
          icon={Bot}
          tone="success"
        />
        <MetricCard
          label="Listings"
          value={organization?.listingCount ?? 0}
          detail={`${formatNumber(organization?.publishedListingCount ?? 0)} published`}
          icon={Store}
          tone="primary"
        />
        <MetricCard
          label="Active sessions"
          value={organization?.activeSessionCount ?? 0}
          detail="Org-pinned sessions that can be revoked from People."
          icon={ShieldAlert}
          tone={summaryCardTone(organization?.activeSessionCount ?? 0)}
        />
      </div>

      <div className="rounded-[28px] border border-[var(--border-default)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,240,251,0.92))] p-2 shadow-[var(--panel-shadow)]">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-[18px] px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))] text-white shadow-[0_16px_34px_rgba(123,90,255,0.24)]"
                    : "text-[var(--text-secondary)] hover:bg-white/80 hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "overview" ? renderOverview() : null}
      {activeTab === "people" ? renderPeople() : null}
      {activeTab === "assets" ? renderAssets() : null}
      {activeTab === "runtime" ? renderRuntime() : null}
      {activeTab === "audit" ? renderAudit() : null}

      <Panel
        title="Operator shortcuts"
        description="Dedicated consoles are still the fastest path for specialized workflows."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Link
            href={`/organizations/${orgId}/billing`}
            className="rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[var(--accent-primary)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Billing console
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Stripe customer linkage, entitlements, invoice mirrors, and support overrides.
            </p>
          </Link>
          <div className="rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-[var(--accent-primary)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Org created
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {formatDate(organization?.createdAt)} • updated {formatDate(organization?.updatedAt)}
            </p>
          </div>
          <div className="rounded-[24px] border border-[var(--border-default)] bg-white/72 p-4">
            <div className="flex items-center gap-2">
              <Waypoints className="h-4 w-4 text-[var(--accent-primary)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Quick drilldown
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Use People for access corrections, Assets for ownership visibility, Runtime for sandbox investigation, and Audit for incident timelines.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
