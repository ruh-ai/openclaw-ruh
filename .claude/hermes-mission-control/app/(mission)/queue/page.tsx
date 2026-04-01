"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Layers,
  Play,
  Pause,
  RefreshCw,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
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

function QueueStatsCard({ name, stats }: { name: string; stats: { waiting: number; active: number; completed: number; failed: number } }) {
  const shortName = name.replace("hermes:", "");
  const total = stats.waiting + stats.active + stats.completed + stats.failed;

  return (
    <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase">{shortName}</h3>
        <span className="text-[10px] text-[var(--text-tertiary)]">{total} total</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-[var(--text-tertiary)]">{stats.waiting}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Waiting</p>
        </div>
        <div>
          <p className="text-lg font-bold text-[#3b82f6]">{stats.active}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Active</p>
        </div>
        <div>
          <p className="text-lg font-bold text-[var(--success)]">{stats.completed}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Done</p>
        </div>
        <div>
          <p className="text-lg font-bold text-[var(--error)]">{stats.failed}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Failed</p>
        </div>
      </div>
    </div>
  );
}

export default function QueuePage() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [health, setHealth] = useState<QueueHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitDesc, setSubmitDesc] = useState("");
  const [submitAgent, setSubmitAgent] = useState("auto");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(() => {
    Promise.all([api.queue.stats(), api.queue.jobs({ limit: "20" }), api.queue.health()])
      .then(([s, j, h]) => { setStats(s); setJobs(j.items); setHealth(h); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!submitDesc.trim()) return;
    setSubmitting(true);
    try {
      await api.queue.submit({ description: submitDesc, agentName: submitAgent || undefined });
      setSubmitDesc("");
      setShowSubmit(false);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !stats) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--error)] text-sm font-medium">Failed to load queue data</p>
        <p className="text-[var(--text-tertiary)] text-xs mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Task Queue</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            BullMQ workers processing tasks autonomously
            {health && (
              <span className={`ml-2 ${health.redis === "connected" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                Redis: {health.redis}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {health?.workers.running && (
            <span className="text-[10px] font-medium text-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 rounded-full">
              {health.workers.workerCount} workers / {health.workers.activeSubprocesses} active
            </span>
          )}
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
              <option value="hermes">Hermes</option>
            </select>
            <button
              onClick={handleSubmit}
              disabled={submitting || !submitDesc.trim()}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </div>
      )}

      {/* Queue Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-3 mt-6">
          {Object.entries(stats).map(([name, s]) => (
            <QueueStatsCard key={name} name={name} stats={s} />
          ))}
          {Object.keys(stats).length === 0 && (
            <div className="col-span-5 text-center py-8 text-xs text-[var(--text-tertiary)]">
              No queue activity yet. Submit a task to get started.
            </div>
          )}
        </div>
      )}

      {/* Recent Jobs */}
      <div className="mt-8">
        <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4">Recent Jobs</h2>
        <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl overflow-hidden">
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-tertiary)]">No jobs yet</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-left">
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Status</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Agent</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Queue</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Source</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Created</th>
                  <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
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
                      <td className="px-4 py-2.5 text-[var(--text-primary)]">{job.agentName || "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{job.queueName.replace("hermes:", "")}</td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{job.source}</td>
                      <td className="px-4 py-2.5 text-[var(--text-tertiary)]">{new Date(job.createdAt).toLocaleTimeString()}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/queue/${job.id}`} className="text-[var(--primary)] hover:underline">
                          Details
                        </Link>
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
