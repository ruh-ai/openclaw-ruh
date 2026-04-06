"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle,
  Cpu,
  Layers,
  ListTodo,
  Radar,
  Server,
  Sparkles,
  Target,
} from "lucide-react";
import { StatsCard } from "@/components/StatsCard";
import { AgentHealthCard } from "@/components/AgentHealthCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RunnerSwitcher } from "@/components/RunnerSwitcher";
import { api, type AgentRunnerKind, type DashboardStats, type QueueHealth, type QueueStats, type TimelineEvent } from "@/lib/api";
import { useEventStream, type HermesEvent } from "@/hooks/useEventStream";

interface Toast {
  id: number;
  message: string;
}

function GoalPriorityBadge({ priority }: { priority: string }) {
  const palette =
    priority === "critical"
      ? "bg-[var(--error)]/12 text-[var(--error)]"
      : priority === "high"
        ? "bg-[#f97316]/12 text-[#f97316]"
        : priority === "low"
          ? "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
          : "bg-[var(--primary)]/10 text-[var(--primary)]";

  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${palette}`}>{priority}</span>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [queueHealth, setQueueHealth] = useState<QueueHealth | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRunner, setPendingRunner] = useState<AgentRunnerKind | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastCounterRef = useRef(0);

  const fetchData = useCallback(() => {
    Promise.all([api.dashboard(), api.timeline(10), api.queue.health(), api.queue.stats()])
      .then(([dashboardStats, activity, health, queue]) => {
        setStats(dashboardStats);
        setTimeline(activity);
        setQueueHealth(health);
        setQueueStats(queue);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addToast = useCallback((message: string) => {
    const id = ++toastCounterRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const handleRunnerSelect = useCallback(async (runner: AgentRunnerKind) => {
    setPendingRunner(runner);
    try {
      const result = await api.queue.setRunner(runner);
      setQueueHealth((current) => (current ? { ...current, agentRunner: result.agentRunner } : current));
      setError(null);
      addToast(`Hermes runner switched to ${runner === "claude" ? "Claude Code" : "Codex"}`);
      fetchData();
    } catch (e: any) {
      setError(e.message);
      addToast(`Runner switch failed: ${e.message}`);
    } finally {
      setPendingRunner(null);
    }
  }, [addToast, fetchData]);

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

    if (message) {
      addToast(message);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData();
    }, 1500);
  }, [addToast, fetchData]);

  const { connected } = useEventStream(handleEvent);

  const queueTotals = useMemo(() => {
    if (!queueStats) return null;
    return Object.values(queueStats).reduce(
      (acc, queue) => ({
        waiting: acc.waiting + queue.waiting,
        active: acc.active + queue.active,
        completed: acc.completed + queue.completed,
        failed: acc.failed + queue.failed,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0 },
    );
  }, [queueStats]);

  if (error) {
    return (
      <div className="mission-card rounded-[32px] px-6 py-16 text-center">
        <p className="text-sm font-medium text-[var(--error)]">Failed to connect to Hermes backend</p>
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">{error}</p>
        <p className="mt-4 text-xs text-[var(--text-tertiary)]">Make sure `hermes-backend` is running on port `8100`.</p>
      </div>
    );
  }

  if (!stats || !queueHealth) {
    return (
      <div className="mission-card rounded-[32px] px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 soul-pulse">
          <Sparkles className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">Loading Mission Control...</p>
      </div>
    );
  }

  const runnerBlocked = !queueHealth.agentRunner.available;
  const activeGoals = stats.goals.list;
  const pressuredGoals = activeGoals.filter((goal) => goal.progressPct < 100).length;
  const executionSlots = queueHealth.workers.workers.find((worker) => worker.name === "hermes-execution")?.concurrency ?? 0;
  const systemLabel = runnerBlocked ? "Blocked" : connected ? "Flowing" : "Degraded";
  const systemColor = runnerBlocked ? "text-[var(--error)]" : connected ? "text-[var(--success)]" : "text-[var(--warning)]";
  const systemCopy = runnerBlocked
    ? "Hermes knows about your goals, but it cannot spawn agent workers until the selected runner becomes executable."
    : pressuredGoals > 0
      ? `${pressuredGoals} active goals are still in motion. Mission Control is prioritizing queue pressure and operator visibility.`
      : "The orchestrator is healthy and ready for the next goal package.";

  return (
    <div className="space-y-6">
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div key={toast.id} className="mission-card animate-fadeIn max-w-xs rounded-2xl px-4 py-3 text-xs text-[var(--text-primary)]">
              {toast.message}
            </div>
          ))}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="mission-card-dark rounded-[32px] px-6 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`status-orb inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-medium ${systemColor}`}>
                <span className="h-2.5 w-2.5 rounded-full bg-current" />
                {systemLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs text-white/78">
                {stats.goals.active} active goals
              </span>
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs text-white/78">
                {queueHealth.workers.workerCount} workers online
              </span>
            </div>

            <div>
              <p className="section-label text-white/55">Operator Summary</p>
              <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                Mission Control should explain why work is stalled, not merely look alive.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/78 sm:text-base">
                {systemCopy}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] bg-white/8 px-4 py-4">
                <p className="section-label text-white/50">Agent Runner</p>
                <p className="mt-2 text-lg font-medium text-white">
                  {queueHealth.agentRunner.selected === "claude" ? "Claude Code" : "Codex"}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/68">
                  {queueHealth.agentRunner.available ? "Ready" : "Unavailable"} via {queueHealth.agentRunner.selectedSource}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/68">{queueHealth.agentRunner.path}</p>
              </div>
              <div className="rounded-[24px] bg-white/8 px-4 py-4">
                <p className="section-label text-white/50">Queue Pressure</p>
                <p className="mt-2 text-lg font-medium text-white">{queueTotals?.active ?? 0} running / {queueTotals?.waiting ?? 0} waiting</p>
                <p className="mt-1 text-xs leading-5 text-white/68">{executionSlots} execution slots configured</p>
              </div>
              <div className="rounded-[24px] bg-white/8 px-4 py-4">
                <p className="section-label text-white/50">Live Stream</p>
                <p className="mt-2 text-lg font-medium text-white">{connected ? "Connected" : "Reconnecting"}</p>
                <p className="mt-1 text-xs leading-5 text-white/68">Redis is {queueHealth.redis} and event updates are {connected ? "flowing" : "degraded"}.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mission-card rounded-[32px] px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-label">Goal Focus</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">What needs motion now</h3>
            </div>
            <Link href="/goals" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)]">
              Open goals
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {activeGoals.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                No active goals yet. Hermes is ready for its next package.
              </div>
            ) : (
              activeGoals.slice(0, 4).map((goal) => (
                <div key={goal.id} className="rounded-[24px] border border-[var(--border-muted)] bg-white/55 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{goal.title}</p>
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                        {goal.completedCount}/{goal.taskCount || 0} tasks completed
                      </p>
                    </div>
                    <GoalPriorityBadge priority={goal.priority} />
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-[var(--border-muted)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${goal.progressPct}%`,
                        background: "linear-gradient(90deg, var(--primary), var(--secondary))",
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>{goal.progressPct}% complete</span>
                    <span>{goal.taskCount === 0 ? "needs decomposition" : "tasked"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {runnerBlocked && (
        <section className="mission-card rounded-[28px] border border-[var(--error)]/18 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--error)]/10 text-[var(--error)]">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="section-label">Blocked State</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Hermes cannot spawn agent workers</h3>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
                  This is why the system feels idle even with active goals. The analyst sweep is firing, but subprocess execution is blocked before agents can do work. Switch runners or clear the selected runner error before assuming the queue is empty.
                </p>
              </div>
            </div>
            <div className="rounded-[24px] bg-[var(--error)]/6 px-4 py-3 text-xs text-[var(--text-secondary)] sm:max-w-md">
              <p className="font-medium text-[var(--error)]">Runner error</p>
              <p className="mt-2 break-all">{queueHealth.agentRunner.error || "Unknown runner failure"}</p>
            </div>
          </div>
        </section>
      )}

      <RunnerSwitcher runner={queueHealth.agentRunner} onSelect={handleRunnerSelect} pendingRunner={pendingRunner} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total Tasks"
          value={stats.tasks.total}
          icon={ListTodo}
          color="bg-[#3b82f6]/10 text-[#3b82f6]"
          subtitle={`${stats.tasks.running} currently running`}
        />
        <StatsCard
          title="Success Rate"
          value={`${stats.tasks.successRate}%`}
          icon={CheckCircle}
          color="bg-[var(--success)]/10 text-[var(--success)]"
          subtitle={`${stats.tasks.completed} completed, ${stats.tasks.failed} failed`}
        />
        <StatsCard
          title="Memory Graph"
          value={stats.memories.total}
          icon={Brain}
          color="bg-[var(--secondary)]/10 text-[var(--secondary)]"
          subtitle={`${Object.keys(stats.memories.byType).length} memory types in circulation`}
        />
        <StatsCard
          title="Specialists"
          value={stats.agents.active}
          icon={Bot}
          color="bg-[var(--primary)]/10 text-[var(--primary)]"
          subtitle={`${stats.agents.total} registered agent roles`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="mission-card rounded-[32px] px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-label">Operations</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Queue throughput and worker reality</h3>
            </div>
            <Link href="/queue" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)]">
              Open queue
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] bg-[var(--bg-subtle)] px-4 py-4">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Layers className="h-4 w-4 text-[#3b82f6]" />
                <span className="text-xs font-medium uppercase tracking-[0.18em]">Running</span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{queueTotals?.active ?? 0}</p>
            </div>
            <div className="rounded-[24px] bg-[var(--bg-subtle)] px-4 py-4">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Target className="h-4 w-4 text-[#f59e0b]" />
                <span className="text-xs font-medium uppercase tracking-[0.18em]">Waiting</span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{queueTotals?.waiting ?? 0}</p>
            </div>
            <div className="rounded-[24px] bg-[var(--bg-subtle)] px-4 py-4">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Server className="h-4 w-4 text-[var(--success)]" />
                <span className="text-xs font-medium uppercase tracking-[0.18em]">Redis</span>
              </div>
              <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{queueHealth.redis}</p>
            </div>
            <div className="rounded-[24px] bg-[var(--bg-subtle)] px-4 py-4">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Cpu className="h-4 w-4 text-[var(--primary)]" />
                <span className="text-xs font-medium uppercase tracking-[0.18em]">Workers</span>
              </div>
              <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{queueHealth.workers.workerCount} online</p>
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-[var(--border-muted)] bg-white/55 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Execution Lane</p>
                <h4 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Runner and worker pool</h4>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${queueHealth.agentRunner.available ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--error)]/10 text-[var(--error)]"}`}>
                {queueHealth.agentRunner.available ? "spawn ready" : "spawn blocked"}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {queueHealth.workers.workers.map((worker) => (
                <span
                  key={worker.name}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
                    worker.running ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${worker.running ? "bg-current" : "bg-[var(--text-tertiary)]"}`} />
                  {worker.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mission-card rounded-[32px] px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-label">Live Activity</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Recent orchestration trace</h3>
            </div>
            <Radar className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div className="mt-5 max-h-[520px] overflow-y-auto pr-1">
            <ActivityFeed events={timeline} />
          </div>
        </div>
      </section>

      <section className="mission-card rounded-[32px] px-5 py-5 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Specialists</p>
            <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Agent health at a glance</h3>
          </div>
          <Link href="/agents" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)]">
            Open agents
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stats.agents.list.map((agent) => (
            <AgentHealthCard key={agent.name} {...agent} />
          ))}
        </div>
      </section>
    </div>
  );
}
