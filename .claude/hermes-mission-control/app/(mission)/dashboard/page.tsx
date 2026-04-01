"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { ListTodo, CheckCircle, Brain, Bot, Server, Cpu } from "lucide-react";
import { StatsCard } from "@/components/StatsCard";
import { AgentHealthCard } from "@/components/AgentHealthCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { api, type DashboardStats, type TimelineEvent, type QueueHealth, type QueueStats } from "@/lib/api";
import { useEventStream, type HermesEvent } from "@/hooks/useEventStream";

interface Toast {
  id: number;
  message: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [queueHealth, setQueueHealth] = useState<QueueHealth | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastCounterRef = useRef(0);

  const fetchData = useCallback(() => {
    Promise.all([api.dashboard(), api.timeline(10), api.queue.health(), api.queue.stats()])
      .then(([s, t, qh, qs]) => { setStats(s); setTimeline(t); setQueueHealth(qh); setQueueStats(qs); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addToast = useCallback((message: string) => {
    const id = ++toastCounterRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const handleEvent = useCallback((event: HermesEvent) => {
    let message = "";
    if (event.type === "task" && event.action === "created") {
      message = `Task created: ${event.data?.description || "new task"}`;
    } else if (event.type === "task" && event.action === "updated") {
      message = `Task updated: ${event.data?.description || "task"}`;
    } else if (event.type === "memory" && event.action === "created") {
      message = `Memory stored: ${event.data?.type || "new memory"}`;
    } else if (event.type === "score") {
      message = `Score recorded for ${event.data?.agentName || "agent"}`;
    } else if (event.type === "refinement") {
      message = `Refinement: ${event.data?.changeDescription || "agent updated"}`;
    } else if (event.type === "session") {
      message = `Session ${event.action}: ${event.data?.id?.slice(0, 8) || ""}`;
    }
    if (message) addToast(message);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData();
    }, 2000);
  }, [fetchData, addToast]);

  const { connected } = useEventStream(handleEvent);

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--error)] text-sm font-medium">Failed to connect to Hermes backend</p>
        <p className="text-[var(--text-tertiary)] text-xs mt-1">{error}</p>
        <p className="text-[var(--text-tertiary)] text-xs mt-3">Make sure hermes-backend is running on port 8100</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 rounded-lg soul-pulse mx-auto mb-3 bg-[var(--primary)]/10" />
        <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
      </div>
    );
  }

  const queueTotals = queueStats
    ? Object.values(queueStats).reduce(
        (acc, q) => ({ waiting: acc.waiting + q.waiting, active: acc.active + q.active, completed: acc.completed + q.completed, failed: acc.failed + q.failed }),
        { waiting: 0, active: 0, completed: 0, failed: 0 }
      )
    : null;

  return (
    <div>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="animate-fadeIn bg-[var(--card-color)] border border-[var(--border-default)] rounded-lg px-4 py-2.5 shadow-lg text-xs text-[var(--text-primary)] max-w-xs"
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Hermes orchestrator overview</p>
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <span className="text-[10px] font-medium text-[#22c55e] bg-[#22c55e]/10 px-2 py-0.5 rounded-full">
              Live
            </span>
          )}
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              connected ? "soul-pulse bg-[#22c55e]" : "bg-[#ef4444]"
            }`}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <StatsCard
          title="Total Tasks"
          value={stats.tasks.total}
          icon={ListTodo}
          color="bg-[#3b82f6]/10 text-[#3b82f6]"
          subtitle={`${stats.tasks.running} running`}
        />
        <StatsCard
          title="Success Rate"
          value={`${stats.tasks.successRate}%`}
          icon={CheckCircle}
          color="bg-[var(--success)]/10 text-[var(--success)]"
          subtitle={`${stats.tasks.completed} completed, ${stats.tasks.failed} failed`}
        />
        <StatsCard
          title="Memories"
          value={stats.memories.total}
          icon={Brain}
          color="bg-[var(--secondary)]/10 text-[var(--secondary)]"
          subtitle={`${Object.keys(stats.memories.byType).length} types`}
        />
        <StatsCard
          title="Active Agents"
          value={stats.agents.active}
          icon={Bot}
          color="bg-[var(--primary)]/10 text-[var(--primary)]"
          subtitle={`of ${stats.agents.total} total`}
        />
      </div>

      {/* Queue Throughput Card */}
      {queueHealth && queueTotals && (
        <div className="mt-6 animate-fadeIn bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#8b5cf6]/10 text-[#8b5cf6]">
              <Server className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Queue Throughput</h2>
            <span className={`ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
              queueHealth.redis === "connected" ? "bg-[#22c55e]/10 text-[#22c55e]" : "bg-[#ef4444]/10 text-[#ef4444]"
            }`}>
              Redis: {queueHealth.redis}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Workers</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{queueHealth.workers.workerCount}</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {queueHealth.workers.activeSubprocesses} active subprocess{queueHealth.workers.activeSubprocesses !== 1 ? "es" : ""}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Waiting</p>
              <p className="text-xl font-bold text-[#f59e0b] mt-1">{queueTotals.waiting}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Active</p>
              <p className="text-xl font-bold text-[#3b82f6] mt-1">{queueTotals.active}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Completed</p>
              <p className="text-xl font-bold text-[#22c55e] mt-1">{queueTotals.completed}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Failed</p>
              <p className="text-xl font-bold text-[#ef4444] mt-1">{queueTotals.failed}</p>
            </div>
          </div>
          {queueHealth.workers.workers.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--border-muted)]">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Worker Status</p>
              <div className="flex gap-2 flex-wrap">
                {queueHealth.workers.workers.map((w) => (
                  <span key={w.name} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    w.running ? "bg-[#22c55e]/10 text-[#22c55e]" : "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]"
                  }`}>
                    <Cpu className="h-3 w-3" />
                    {w.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mt-8">
        {/* Agent Health */}
        <div className="col-span-2">
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4">Agent Health</h2>
          <div className="grid grid-cols-3 gap-3">
            {stats.agents.list.map((agent) => (
              <AgentHealthCard key={agent.name} {...agent} />
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4">Recent Activity</h2>
          <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4 max-h-[400px] overflow-y-auto">
            <ActivityFeed events={timeline} />
          </div>
        </div>
      </div>
    </div>
  );
}
