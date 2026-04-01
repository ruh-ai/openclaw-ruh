"use client";
import { useEffect, useState } from "react";
import { Users, Bot, Server, Store } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PlatformStats {
  totalUsers: number;
  totalAgents: number;
  activeSandboxes: number;
  marketplaceListings: number;
}

function StatsCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Users; color: string }) {
  return (
    <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<PlatformStats>({ totalUsers: 0, totalAgents: 0, activeSandboxes: 0, marketplaceListings: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/admin/stats`, {
      credentials: "include",
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-lg font-bold text-[var(--text-primary)]">Dashboard</h1>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Platform overview and health</p>

      <div className="grid grid-cols-4 gap-4 mt-6">
        <StatsCard label="Total Users" value={stats.totalUsers} icon={Users} color="bg-[var(--primary)]/10 text-[var(--primary)]" />
        <StatsCard label="Total Agents" value={stats.totalAgents} icon={Bot} color="bg-[var(--secondary)]/10 text-[var(--secondary)]" />
        <StatsCard label="Active Sandboxes" value={stats.activeSandboxes} icon={Server} color="bg-[var(--success)]/10 text-[var(--success)]" />
        <StatsCard label="Marketplace" value={stats.marketplaceListings} icon={Store} color="bg-[var(--warning)]/10 text-[var(--warning)]" />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
