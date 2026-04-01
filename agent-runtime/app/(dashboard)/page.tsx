"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Activity,
  ListTodo,
  FileText,
  TrendingUp,
} from "lucide-react";

interface Stats {
  tasks: Record<string, number>;
  totalTasks: number;
  tasksCompletedToday: number;
  activityToday: number;
  totalReports: number;
  errorsToday: number;
}

interface ActivityItem {
  id: number;
  type: string;
  summary: string;
  details: string;
  created_at: string;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});
    fetch("/api/activity?limit=10").then((r) => r.json()).then((d) => setActivity(d.items || [])).catch(() => {});
  }, []);

  const statCards = [
    {
      label: "Tasks In Progress",
      value: stats?.tasks?.in_progress ?? 0,
      icon: ListTodo,
      color: "var(--primary)",
      bg: "var(--primary-light)",
    },
    {
      label: "Completed Today",
      value: stats?.tasksCompletedToday ?? 0,
      icon: CheckCircle2,
      color: "var(--success)",
      bg: "rgba(34, 197, 94, 0.08)",
    },
    {
      label: "Total Reports",
      value: stats?.totalReports ?? 0,
      icon: FileText,
      color: "var(--info)",
      bg: "rgba(59, 130, 246, 0.08)",
    },
    {
      label: "Errors Today",
      value: stats?.errorsToday ?? 0,
      icon: AlertTriangle,
      color: stats?.errorsToday ? "var(--error)" : "var(--text-tertiary)",
      bg: stats?.errorsToday ? "rgba(239, 68, 68, 0.08)" : "var(--bg-muted)",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Mission Control</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Overview of your agent&apos;s current state and recent activity
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: card.bg }}
              >
                <card.icon className="h-4.5 w-4.5" style={{ color: card.color }} />
              </div>
              <TrendingUp className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* Activity feed */}
        <div className="col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--text-secondary)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent Activity</h2>
            </div>
            <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-muted)] px-2 py-0.5 rounded-full">
              {stats?.activityToday ?? 0} today
            </span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {activity.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[var(--text-tertiary)]">No activity yet. Create a task to get started.</p>
              </div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="mt-0.5">
                    {item.type.includes("error") ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-[var(--error)]" />
                    ) : item.type.includes("done") || item.type.includes("completed") ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text-primary)]">{item.summary}</p>
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Task summary */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Task Breakdown</h2>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: "Backlog", key: "backlog", color: "var(--text-tertiary)" },
              { label: "In Progress", key: "in_progress", color: "var(--primary)" },
              { label: "Under Review", key: "review", color: "var(--warning)" },
              { label: "Done", key: "done", color: "var(--success)" },
            ].map((row) => (
              <div key={row.key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="text-sm text-[var(--text-secondary)]">{row.label}</span>
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {stats?.tasks?.[row.key] ?? 0}
                </span>
              </div>
            ))}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-tertiary)]">Total</span>
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {stats?.totalTasks ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
