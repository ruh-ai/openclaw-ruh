"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Layers,
  RefreshCw,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Bot,
  ArrowUpDown,
  Zap,
} from "lucide-react";
import { api, type QueueStats, type QueueJob, type QueueHealth } from "@/lib/api";

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  completed: CheckCircle,
  failed: XCircle,
  waiting: Clock,
  active: Loader2,
};

const STATUS_COLORS: Record<string, string> = {
  completed: "text-[var(--success)]",
  failed: "text-[var(--error)]",
  waiting: "text-[var(--text-tertiary)]",
  active: "text-[#3b82f6]",
};

const AGENT_COLORS: Record<string, string> = {
  backend: "#f97316",
  frontend: "#8b5cf6",
  flutter: "#06b6d4",
  test: "#22c55e",
  reviewer: "#eab308",
  sandbox: "#6366f1",
  analyst: "#ec4899",
  strategist: "#14b8a6",
  hermes: "#ae00d0",
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Critical", color: "text-[var(--error)] bg-[var(--error)]/10" },
  2: { label: "Critical", color: "text-[var(--error)] bg-[var(--error)]/10" },
  3: { label: "High", color: "text-[#f97316] bg-[#f97316]/10" },
  4: { label: "High", color: "text-[#f97316] bg-[#f97316]/10" },
  5: { label: "Normal", color: "text-[var(--text-secondary)] bg-[var(--bg-subtle)]" },
  6: { label: "Normal", color: "text-[var(--text-secondary)] bg-[var(--bg-subtle)]" },
  7: { label: "Low", color: "text-[var(--text-tertiary)] bg-[var(--bg-subtle)]" },
  8: { label: "Low", color: "text-[var(--text-tertiary)] bg-[var(--bg-subtle)]" },
  9: { label: "Low", color: "text-[var(--text-tertiary)] bg-[var(--bg-subtle)]" },
  10: { label: "Background", color: "text-[var(--text-tertiary)] bg-[var(--bg-subtle)]" },
};

function PriorityBadge({ priority }: { priority: number }) {
  const p = PRIORITY_LABELS[priority] || PRIORITY_LABELS[5];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${p.color}`}>
      P{priority} {p.label}
    </span>
  );
}

function AgentDot({ name }: { name: string }) {
  const color = AGENT_COLORS[name] || "#888";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[var(--text-primary)] font-medium">{name}</span>
    </span>
  );
}

function formatDuration(startedAt: string | null): string {
  if (!startedAt) return "-";
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

export default function QueuePage() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [activeJobs, setActiveJobs] = useState<QueueJob[]>([]);
  const [waitingJobs, setWaitingJobs] = useState<QueueJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<QueueJob[]>([]);
  const [health, setHealth] = useState<QueueHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitDesc, setSubmitDesc] = useState("");
  const [submitAgent, setSubmitAgent] = useState("auto");
  const [submitPriority, setSubmitPriority] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(() => {
    Promise.all([
      api.queue.stats(),
      api.queue.jobs({ status: "active", limit: "20" }),
      api.queue.jobs({ status: "waiting", limit: "20" }),
      api.queue.jobs({ limit: "15" }),
      api.queue.health(),
    ])
      .then(([s, active, waiting, recent, h]) => {
        setStats(s);
        setActiveJobs(active.items);
        setWaitingJobs(waiting.items);
        setRecentJobs(recent.items);
        setHealth(h);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!submitDesc.trim()) return;
    setSubmitting(true);
    try {
      await api.queue.submit({ description: submitDesc, agentName: submitAgent || undefined, priority: submitPriority });
      setSubmitDesc("");
      setShowSubmit(false);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const executionStats = stats?.["hermes-execution"] || { waiting: 0, active: 0, completed: 0, failed: 0 };
  const concurrency = health?.workers.workers.find(w => w.name === "hermes-execution")?.concurrency ?? 2;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Task Queue</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Live view of agent task processing
            {health && (
              <span className={`ml-2 ${health.redis === "connected" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                Redis: {health.redis}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSubmit(!showSubmit)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            Submit Task
          </button>
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors">
            <RefreshCw className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 p-2.5 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-lg text-xs text-[var(--error)]">{error}</div>
      )}

      {/* Submit Task Form */}
      {showSubmit && (
        <div className="mt-4 bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={submitDesc}
              onChange={(e) => setSubmitDesc(e.target.value)}
              placeholder="Describe the task..."
              className="flex-1 px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)]"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <select
              value={submitAgent}
              onChange={(e) => setSubmitAgent(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
            >
              <option value="auto">Auto-route</option>
              <option value="backend">Backend</option>
              <option value="frontend">Frontend</option>
              <option value="flutter">Flutter</option>
              <option value="test">Test</option>
              <option value="reviewer">Reviewer</option>
              <option value="sandbox">Sandbox</option>
              <option value="analyst">Analyst</option>
              <option value="strategist">Strategist</option>
              <option value="hermes">Hermes</option>
            </select>
            <select
              value={submitPriority}
              onChange={(e) => setSubmitPriority(parseInt(e.target.value, 10))}
              className="px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
            >
              <option value={1}>P1 Critical</option>
              <option value={3}>P3 High</option>
              <option value={5}>P5 Normal</option>
              <option value={7}>P7 Low</option>
              <option value={10}>P10 Background</option>
            </select>
            <button
              onClick={handleSubmit}
              disabled={submitting || !submitDesc.trim()}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "..." : "Submit"}
            </button>
          </div>
        </div>
      )}

      {/* Throughput Summary */}
      <div className="grid grid-cols-5 gap-3 mt-5">
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-[#3b82f6]">{executionStats.active}</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Running Now</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">of {concurrency} slots</p>
        </div>
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-[var(--text-tertiary)]">{executionStats.waiting}</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">In Queue</p>
        </div>
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-[var(--success)]">{executionStats.completed}</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Completed</p>
        </div>
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-[var(--error)]">{executionStats.failed}</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Failed</p>
        </div>
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{executionStats.waiting + executionStats.active + executionStats.completed + executionStats.failed}</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Total</p>
        </div>
      </div>

      {/* Active Agents Panel */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-[#3b82f6]" />
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Active Agents</h2>
          <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-full">
            {activeJobs.length} / {concurrency} execution slots
          </span>
        </div>
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl overflow-hidden">
          {activeJobs.length === 0 ? (
            <div className="text-center py-6 text-xs text-[var(--text-tertiary)]">No agents running right now</div>
          ) : (
            <div className="divide-y divide-[var(--border-default)]">
              {activeJobs.map((job) => (
                <div key={job.id} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex items-center gap-2 w-28 shrink-0">
                    <Loader2 className="h-3.5 w-3.5 text-[#3b82f6] animate-spin" />
                    <AgentDot name={job.agentName || "unknown"} />
                  </div>
                  <PriorityBadge priority={job.priority} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {(job.prompt || "").replace(/\n## Relevant Memory Context[\s\S]*/, "").slice(0, 120)}
                    </p>
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] w-16 text-right shrink-0">
                    {formatDuration(job.startedAt)}
                  </div>
                  <Link href={`/queue/${job.id}`} className="text-[10px] text-[var(--primary)] hover:underline shrink-0">
                    Details
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Waiting Queue Panel */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <ArrowUpDown className="h-4 w-4 text-[var(--text-tertiary)]" />
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Priority Queue</h2>
          <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-full">
            {waitingJobs.length} waiting
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">sorted by priority (lower = higher priority)</span>
        </div>
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl overflow-hidden">
          {waitingJobs.length === 0 ? (
            <div className="text-center py-6 text-xs text-[var(--text-tertiary)]">Queue is empty — all tasks are being processed or completed</div>
          ) : (
            <div className="divide-y divide-[var(--border-default)]">
              {waitingJobs
                .sort((a, b) => a.priority - b.priority)
                .map((job, i) => (
                  <div key={job.id} className="px-4 py-3 flex items-center gap-4">
                    <span className="text-[10px] font-mono text-[var(--text-tertiary)] w-6 text-right shrink-0">#{i + 1}</span>
                    <div className="flex items-center gap-2 w-28 shrink-0">
                      <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                      <AgentDot name={job.agentName || "auto"} />
                    </div>
                    <PriorityBadge priority={job.priority} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {(job.prompt || "").replace(/\n## Relevant Memory Context[\s\S]*/, "").slice(0, 120)}
                      </p>
                    </div>
                    <Link href={`/queue/${job.id}`} className="text-[10px] text-[var(--primary)] hover:underline shrink-0">
                      Details
                    </Link>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div className="mt-6">
        <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3">Recent Jobs</h2>
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl overflow-hidden">
          {recentJobs.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-tertiary)]">No jobs yet</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-left">
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Status</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Agent</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Priority</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Source</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Created</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => {
                  const Icon = STATUS_ICONS[job.status] || Clock;
                  const color = STATUS_COLORS[job.status] || "text-[var(--text-tertiary)]";
                  return (
                    <tr key={job.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--bg-subtle)] transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`flex items-center gap-1.5 ${color}`}>
                          <Icon className={`h-3.5 w-3.5 ${job.status === "active" ? "animate-spin" : ""}`} />
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><AgentDot name={job.agentName || "—"} /></td>
                      <td className="px-4 py-2.5"><PriorityBadge priority={job.priority} /></td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{job.source}</td>
                      <td className="px-4 py-2.5 text-[var(--text-tertiary)]">{new Date(job.createdAt).toLocaleTimeString()}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/queue/${job.id}`} className="text-[var(--primary)] hover:underline">Details</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
