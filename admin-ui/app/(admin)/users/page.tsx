"use client";
import { useEffect, useState } from "react";
import { Shield, User, Code } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
}

const ROLE_ICONS: Record<string, typeof Shield> = { admin: Shield, developer: Code, end_user: User };
const ROLE_COLORS: Record<string, string> = {
  admin: "text-[var(--error)] bg-[var(--error)]/10",
  developer: "text-[var(--primary)] bg-[var(--primary)]/10",
  end_user: "text-[var(--text-tertiary)] bg-[var(--bg-subtle)]",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchUsers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (roleFilter) params.set("role", roleFilter);
    if (search) params.set("search", search);
    fetch(`${API_URL}/api/admin/users?${params}`, {
      credentials: "include",
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setUsers(data.items); setTotal(data.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, [roleFilter, search]);

  const updateRole = async (userId: string, role: string) => {
    await fetch(`${API_URL}/api/admin/users/${userId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    fetchUsers();
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    await fetch(`${API_URL}/api/admin/users/${userId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: currentStatus === "active" ? "suspended" : "active" }),
    });
    fetchUsers();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Users</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{total} total users</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mt-4">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[var(--border-default)] rounded-lg bg-[var(--card-color)] outline-none focus:border-[var(--primary)] w-64"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-[var(--border-default)] rounded-lg bg-[var(--card-color)] outline-none"
        >
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="developer">Developer</option>
          <option value="end_user">End User</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)]">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-tertiary)]">User</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-tertiary)]">Role</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-tertiary)]">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-tertiary)]">Created</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--text-tertiary)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const RoleIcon = ROLE_ICONS[user.role] || User;
              return (
                <tr key={user.id} className="border-b border-[var(--border-default)] last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text-primary)]">{user.displayName || user.email}</p>
                    <p className="text-[var(--text-tertiary)]">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${ROLE_COLORS[user.role] || ""}`}>
                      <RoleIcon className="h-3 w-3" />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      user.status === "active" ? "text-[var(--success)] bg-[var(--success)]/10" : "text-[var(--error)] bg-[var(--error)]/10"
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-tertiary)]">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <select
                      value={user.role}
                      onChange={e => updateRole(user.id, e.target.value)}
                      className="px-2 py-1 text-[10px] border border-[var(--border-default)] rounded bg-[var(--bg-default)] mr-2"
                    >
                      <option value="admin">Admin</option>
                      <option value="developer">Developer</option>
                      <option value="end_user">End User</option>
                    </select>
                    <button
                      onClick={() => toggleStatus(user.id, user.status)}
                      className={`px-2 py-1 text-[10px] rounded font-medium ${
                        user.status === "active"
                          ? "text-[var(--error)] bg-[var(--error)]/10 hover:bg-[var(--error)]/20"
                          : "text-[var(--success)] bg-[var(--success)]/10 hover:bg-[var(--success)]/20"
                      }`}
                    >
                      {user.status === "active" ? "Suspend" : "Activate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && users.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--text-tertiary)]">No users found</div>
        )}
      </div>
    </div>
  );
}
