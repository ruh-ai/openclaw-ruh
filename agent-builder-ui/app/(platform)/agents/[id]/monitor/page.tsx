"use client";

/**
 * Agent Monitoring Dashboard — real-time metrics and activity feed.
 * Shows: conversation count, message count, errors, response time, tool usage.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageSquare,
  AlertTriangle,
  Clock,
  Zap,
  Activity,
  BarChart3,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useAgentsStore } from "@/hooks/use-agents-store";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AgentMetrics {
  totalConversations: number;
  totalMessages: number;
  errorsLast24h: number;
  averageResponseMs: number | null;
  lastActiveAt: string | null;
  toolUsage: Array<{ tool: string; count: number }>;
}

interface ActivityEntry {
  id: string;
  type: string;
  timestamp: string;
  summary: string;
  details?: Record<string, unknown>;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = "primary",
}: {
  icon: typeof MessageSquare;
  label: string;
  value: string | number;
  subtext?: string;
  color?: "primary" | "success" | "error" | "warning";
}) {
  const colorMap = {
    primary: "text-[var(--primary)] bg-[var(--primary)]/8",
    success: "text-[var(--success)] bg-[var(--success)]/8",
    error: "text-red-500 bg-red-500/8",
    warning: "text-amber-500 bg-amber-500/8",
  };
  return (
    <div className="rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-2xl font-satoshi-bold text-[var(--text-primary)]">{value}</p>
      {subtext && (
        <p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] mt-1">{subtext}</p>
      )}
    </div>
  );
}

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-xs font-satoshi-regular text-[var(--text-tertiary)]">
        No activity yet. Start chatting with your agent to see events here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 px-3 py-2 rounded-lg border border-[var(--border-stroke)] bg-[var(--background)]"
        >
          <div className="mt-0.5">
            {entry.type.includes("error") || entry.type.includes("fail") ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            ) : entry.type.includes("chat") ? (
              <MessageSquare className="h-3.5 w-3.5 text-[var(--primary)]" />
            ) : (
              <Activity className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-satoshi-medium text-[var(--text-primary)]">
              {entry.summary}
            </p>
            <p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] mt-0.5">
              {new Date(entry.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AgentMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { agents, fetchAgent } = useAgentsStore();
  const agent = agents.find((a) => a.id === id);

  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!agent) fetchAgent(id);
  }, [agent, fetchAgent, id]);

  const loadData = async () => {
    try {
      const [metricsRes, activityRes] = await Promise.all([
        fetchBackendWithAuth(`${API_BASE}/api/agents/${id}/metrics`).catch(() => null),
        fetchBackendWithAuth(`${API_BASE}/api/agents/${id}/activity?limit=30`).catch(() => null),
      ]);

      if (metricsRes?.ok) {
        setMetrics(await metricsRes.json());
      } else {
        // Fallback: empty metrics if endpoint doesn't exist yet
        setMetrics({
          totalConversations: 0,
          totalMessages: 0,
          errorsLast24h: 0,
          averageResponseMs: null,
          lastActiveAt: null,
          toolUsage: [],
        });
      }

      if (activityRes?.ok) {
        setActivity(await activityRes.json());
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every 30s
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border-default)] bg-[var(--card-color)] px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/agents")}
              className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {agent?.avatar && <span className="text-2xl">{agent.avatar}</span>}
            <div>
              <h1 className="text-lg font-satoshi-bold text-[var(--text-primary)]">
                {agent?.name || "Agent"} — Monitoring
              </h1>
              <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                Real-time metrics and activity
              </p>
            </div>
          </div>
          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : (
            <>
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                  icon={MessageSquare}
                  label="Conversations"
                  value={metrics?.totalConversations ?? 0}
                  subtext="Total sessions"
                  color="primary"
                />
                <MetricCard
                  icon={Zap}
                  label="Messages"
                  value={metrics?.totalMessages ?? 0}
                  subtext="Total exchanges"
                  color="success"
                />
                <MetricCard
                  icon={AlertTriangle}
                  label="Errors (24h)"
                  value={metrics?.errorsLast24h ?? 0}
                  subtext="Last 24 hours"
                  color={metrics?.errorsLast24h ? "error" : "success"}
                />
                <MetricCard
                  icon={Clock}
                  label="Avg Response"
                  value={metrics?.averageResponseMs ? `${Math.round(metrics.averageResponseMs)}ms` : "—"}
                  subtext="Mean response time"
                />
              </div>

              {/* Tool Usage */}
              {metrics?.toolUsage && metrics.toolUsage.length > 0 && (
                <div className="rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="h-4 w-4 text-[var(--primary)]" />
                    <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Tool Usage</h3>
                  </div>
                  <div className="space-y-2">
                    {metrics.toolUsage.map((tool) => (
                      <div key={tool.tool} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-[var(--text-secondary)] w-32 truncate">
                          {tool.tool}
                        </span>
                        <div className="flex-1 h-2 bg-[var(--background)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--primary)] rounded-full"
                            style={{
                              width: `${Math.min(100, (tool.count / Math.max(...metrics.toolUsage.map((t) => t.count))) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)] w-8 text-right">
                          {tool.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Feed */}
              <div className="rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4 text-[var(--primary)]" />
                  <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Recent Activity</h3>
                </div>
                <ActivityFeed entries={activity} />
              </div>

              {/* Last Active */}
              {metrics?.lastActiveAt && (
                <p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] text-center">
                  Last active: {new Date(metrics.lastActiveAt).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
