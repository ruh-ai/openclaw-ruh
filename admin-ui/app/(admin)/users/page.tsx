"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { CheckCircle2, Shield, UserCog, Users } from "lucide-react";

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

interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  appAccess: {
    admin: boolean;
    builder: boolean;
    customer: boolean;
  };
  memberships: Array<{
    id: string;
    organizationName: string;
    organizationKind: string;
    role: string;
    status: string;
  }>;
  primaryOrganization: {
    organizationName: string;
    organizationKind: string;
  } | null;
}

interface UsersResponse {
  items: UserRecord[];
  total: number;
}

function roleTone(role: string) {
  if (role === "admin") return "danger";
  if (role === "developer") return "primary";
  return "neutral";
}

function statusTone(status: string) {
  if (status === "active") return "success";
  if (status === "suspended") return "danger";
  return "warning";
}

export default function UsersPage() {
  const [data, setData] = useState<UsersResponse>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const deferredSearch = useDeferredValue(search);

  const loadUsers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (deferredSearch) params.set("search", deferredSearch);
    if (roleFilter) params.set("role", roleFilter);
    if (statusFilter) params.set("status", statusFilter);

    fetchAdminJson<UsersResponse>(`/api/admin/users?${params.toString()}`)
      .then((response) => {
        setData(response);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load users");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, [deferredSearch, roleFilter, statusFilter]);

  const updateUser = async (userId: string, patch: Record<string, unknown>) => {
    setSavingId(userId);
    try {
      await mutateAdminJson(`/api/admin/users/${userId}`, "PATCH", patch);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    const confirmed = window.confirm(
      `Delete user ${email}? This removes the account and cannot be undone from the admin panel.`,
    );
    if (!confirmed) {
      return;
    }

    setSavingId(userId);
    try {
      await mutateAdminJson(`/api/admin/users/${userId}`, "DELETE");
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setSavingId(null);
    }
  };

  const filteredUsers = data.items;
  const adminCount = filteredUsers.filter((user) => user.role === "admin").length;
  const activeCount = filteredUsers.filter((user) => user.status === "active").length;
  const builderAccessCount = filteredUsers.filter((user) => user.appAccess.builder).length;
  const customerAccessCount = filteredUsers.filter((user) => user.appAccess.customer).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="People & Access"
        description="Inspect platform users in tenant context, understand what surfaces they can access, and manage account state without leaving the control plane."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Visible Users"
          value={data.total}
          detail="Rows matching the current filters."
          icon={Users}
          tone="primary"
        />
        <MetricCard
          label="Admins"
          value={adminCount}
          detail="Platform administrators in the current result set."
          icon={Shield}
          tone="danger"
        />
        <MetricCard
          label="Active Accounts"
          value={activeCount}
          detail="Users currently able to sign in."
          icon={CheckCircle2}
          tone="success"
        />
        <MetricCard
          label="Surface Access"
          value={`${builderAccessCount}/${customerAccessCount}`}
          detail="Builder access vs customer access across the filtered set."
          icon={UserCog}
          tone="warning"
        />
      </div>

      <Panel
        title="Directory"
        description="Role, status, app-access, and org-membership context for every visible account."
        actions={
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email or display name"
              className={fieldClassName}
            />
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className={fieldClassName}
            >
              <option value="">All roles</option>
              <option value="admin">Admin</option>
              <option value="developer">Developer</option>
              <option value="end_user">End user</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={fieldClassName}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        }
      >
        {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <tr>
                <th className="pb-3 font-semibold">User</th>
                <th className="pb-3 font-semibold">Access</th>
                <th className="pb-3 font-semibold">Memberships</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Created</th>
                <th className="pb-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-[var(--border-default)] align-top"
                >
                  <td className="py-4 pr-4">
                    <div className="space-y-2">
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">
                          {user.displayName || user.email}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {user.email}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusPill tone={roleTone(user.role)}>{user.role}</StatusPill>
                        <StatusPill tone={user.emailVerified ? "success" : "warning"}>
                          {user.emailVerified ? "email verified" : "email pending"}
                        </StatusPill>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex flex-wrap gap-2">
                      {user.appAccess.admin ? (
                        <StatusPill tone="danger">admin</StatusPill>
                      ) : null}
                      {user.appAccess.builder ? (
                        <StatusPill tone="primary">builder</StatusPill>
                      ) : null}
                      {user.appAccess.customer ? (
                        <StatusPill tone="warning">customer</StatusPill>
                      ) : null}
                      {!user.appAccess.admin &&
                      !user.appAccess.builder &&
                      !user.appAccess.customer ? (
                        <StatusPill tone="neutral">no active surface</StatusPill>
                      ) : null}
                    </div>
                    {user.primaryOrganization ? (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Primary org:{" "}
                        <span className="font-medium text-[var(--text-primary)]">
                          {user.primaryOrganization.organizationName}
                        </span>
                      </p>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex max-w-md flex-wrap gap-2">
                      {user.memberships.length ? (
                        user.memberships.map((membership) => (
                          <StatusPill
                            key={membership.id}
                            tone={
                              membership.organizationKind === "developer"
                                ? "primary"
                                : "warning"
                            }
                          >
                            {membership.organizationName} · {membership.role}
                          </StatusPill>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)]">
                          No active org memberships
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <StatusPill tone={statusTone(user.status)}>{user.status}</StatusPill>
                  </td>
                  <td className="py-4 pr-4 text-sm text-[var(--text-secondary)]">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex flex-col gap-2 md:items-end">
                      <select
                        value={user.role}
                        onChange={(event) =>
                          updateUser(user.id, { role: event.target.value })
                        }
                        disabled={savingId === user.id}
                        className={fieldClassName}
                      >
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                        <option value="end_user">End user</option>
                      </select>
                      <ActionButton
                        onClick={() =>
                          updateUser(user.id, {
                            status:
                              user.status === "active" ? "suspended" : "active",
                          })
                        }
                        disabled={savingId === user.id}
                        busy={savingId === user.id}
                      >
                        {user.status === "active" ? "Suspend" : "Activate"}
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        onClick={() => deleteUser(user.id, user.email)}
                        disabled={savingId === user.id}
                        busy={savingId === user.id}
                      >
                        Delete user
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && data.items.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            No users matched the current filters.
          </p>
        ) : null}
      </Panel>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading people…</p>
      ) : null}
    </div>
  );
}
