"use client";

import { useEffect, useState, useCallback } from "react";
import type { SandboxRecord } from "./SandboxSidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CronSchedule {
  kind: "cron" | "every" | "at";
  expr?: string;       // cron expression (kind=cron)
  everyMs?: number;    // milliseconds (kind=every)
  at?: string;         // ISO-8601 (kind=at)
  tz?: string;         // IANA timezone
}

interface CronJob {
  id: string;           // openclaw uses "id", not "jobId"
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  sessionTarget: string;
  payload: { kind: string; text?: string; message?: string };
  deleteAfterRun?: boolean;
  state?: { lastRunAtMs?: number; nextRunAtMs?: number; status?: string; error?: string };
}

interface CronRun {
  id: string;
  jobId: string;
  startedAtMs: number;
  finishedAtMs?: number;
  status: "ok" | "error" | "skipped" | "running";
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(ms: number | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

function scheduleLabel(s: CronSchedule): string {
  if (s.kind === "cron") return s.expr ?? "—";
  if (s.kind === "every") return s.everyMs ? `every ${s.everyMs / 1000}s` : "—";
  if (s.kind === "at") return s.at ? new Date(s.at).toLocaleString() : "—";
  return "—";
}

// ── RunHistory modal ──────────────────────────────────────────────────────────

function RunHistoryModal({
  sandboxId,
  job,
  onClose,
}: {
  sandboxId: string;
  job: CronJob;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/sandboxes/${sandboxId}/crons/${job.id}/runs`)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((data) => setRuns(Array.isArray(data) ? data : data.entries ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [sandboxId, job.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Run History</h2>
            <p className="text-xs text-gray-500 mt-0.5">{job.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-gray-600 px-5 py-6 text-center">Loading…</p>
          ) : error ? (
            <p className="text-xs text-red-400 px-5 py-6 text-center">{error}</p>
          ) : runs.length === 0 ? (
            <p className="text-xs text-gray-600 px-5 py-6 text-center">No runs recorded yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left px-5 py-2">Started</th>
                  <th className="text-left px-5 py-2">Duration</th>
                  <th className="text-left px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const dur =
                    r.finishedAtMs && r.startedAtMs
                      ? `${((r.finishedAtMs - r.startedAtMs) / 1000).toFixed(1)}s`
                      : "—";
                  return (
                    <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-5 py-2.5 text-gray-300">{formatTs(r.startedAtMs)}</td>
                      <td className="px-5 py-2.5 text-gray-400">{dur}</td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            r.status === "ok"
                              ? "text-green-400"
                              : r.status === "running"
                              ? "text-blue-400"
                              : "text-red-400"
                          }`}
                        >
                          {r.status === "ok" ? "✓" : r.status === "running" ? "⟳" : "✗"} {r.status}
                          {r.error && (
                            <span className="text-gray-500 font-normal ml-1 truncate max-w-32" title={r.error}>
                              ({r.error})
                            </span>
                          )}
                        </span>
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

// ── CreateCronModal ───────────────────────────────────────────────────────────

// ── EditCronModal ─────────────────────────────────────────────────────────────

function EditCronModal({
  sandboxId,
  job,
  onSaved,
  onClose,
}: {
  sandboxId: string;
  job: CronJob;
  onSaved: () => void;
  onClose: () => void;
}) {
  const initKind = (job.schedule.kind ?? "cron") as "cron" | "every" | "at";

  const [name, setName] = useState(job.name);
  const [scheduleKind, setScheduleKind] = useState<"cron" | "every" | "at">(initKind);
  const [cronExpr, setCronExpr] = useState(job.schedule.expr ?? "0 9 * * *");
  const [everyMin, setEveryMin] = useState(
    job.schedule.everyMs ? String(job.schedule.everyMs / 60000) : "30"
  );
  const [atDate, setAtDate] = useState(
    job.schedule.at ? new Date(job.schedule.at).toISOString().slice(0, 16) : ""
  );
  const [tz, setTz] = useState(job.schedule.tz ?? "");
  const [message, setMessage] = useState(
    job.payload?.message ?? job.payload?.text ?? ""
  );
  const [sessionTarget, setSessionTarget] = useState(job.sessionTarget ?? "main");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return;
    setSubmitting(true);
    setError("");

    const schedule: CronSchedule = { kind: scheduleKind };
    if (scheduleKind === "cron") { schedule.expr = cronExpr; if (tz) schedule.tz = tz; }
    else if (scheduleKind === "every") { schedule.everyMs = Number(everyMin) * 60 * 1000; }
    else if (scheduleKind === "at") { schedule.at = new Date(atDate).toISOString(); }

    const payloadKind = job.payload?.kind ?? "agentTurn";

    try {
      const res = await fetch(
        `${API_URL}/api/sandboxes/${sandboxId}/crons/${job.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            schedule,
            payload: payloadKind === "systemEvent"
              ? { kind: "systemEvent", text: message.trim() }
              : { kind: "agentTurn", message: message.trim() },
            session_target: sessionTarget,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Failed to update cron");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Edit Cron Job</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{job.id.slice(0, 16)}…</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Job name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Schedule kind */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Schedule type</label>
            <select
              value={scheduleKind}
              onChange={(e) => setScheduleKind(e.target.value as "cron" | "every" | "at")}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="cron">Cron expression (recurring)</option>
              <option value="every">Every N minutes (interval)</option>
              <option value="at">One-time (specific date/time)</option>
            </select>
          </div>

          {scheduleKind === "cron" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Cron expression</label>
                <input
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Timezone</label>
                <input
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  placeholder="UTC"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {scheduleKind === "every" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Interval (minutes)</label>
              <input
                type="number" min="1" value={everyMin}
                onChange={(e) => setEveryMin(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {scheduleKind === "at" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date & time</label>
              <input
                type="datetime-local" value={atDate}
                onChange={(e) => setAtDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Message */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Message / prompt</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Session target */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Session target</label>
            <select
              value={sessionTarget}
              onChange={(e) => setSessionTarget(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="main">main (shared agent session)</option>
              <option value="isolated">isolated (dedicated session per run)</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors font-medium">
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CreateCronModal ───────────────────────────────────────────────────────────

function CreateCronModal({
  sandboxId,
  onCreated,
  onClose,
}: {
  sandboxId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [scheduleKind, setScheduleKind] = useState<"cron" | "every" | "at">("cron");
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [everyMin, setEveryMin] = useState("30");
  const [atDate, setAtDate] = useState("");
  const [tz, setTz] = useState("UTC");
  const [message, setMessage] = useState("");
  const [sessionTarget, setSessionTarget] = useState("main");
  const [deleteAfterRun, setDeleteAfterRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return;
    setSubmitting(true);
    setError("");

    const schedule: CronSchedule = { kind: scheduleKind };
    if (scheduleKind === "cron") { schedule.expr = cronExpr; schedule.tz = tz; }
    else if (scheduleKind === "every") { schedule.everyMs = Number(everyMin) * 60 * 1000; }
    else if (scheduleKind === "at") { schedule.at = new Date(atDate).toISOString(); }

    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandboxId}/crons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          schedule,
          payload: { kind: "systemEvent", text: message.trim() },
          session_target: sessionTarget,
          delete_after_run: deleteAfterRun,
          enabled: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Failed to create cron");
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">New Cron Job</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Job name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily summary"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Schedule kind */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Schedule type</label>
            <select
              value={scheduleKind}
              onChange={(e) => setScheduleKind(e.target.value as "cron" | "every" | "at")}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="cron">Cron expression (recurring)</option>
              <option value="every">Every N minutes (interval)</option>
              <option value="at">One-time (specific date/time)</option>
            </select>
          </div>

          {/* Schedule value */}
          {scheduleKind === "cron" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Cron expression</label>
                <input
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  placeholder="0 9 * * *"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Timezone</label>
                <input
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  placeholder="UTC"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {scheduleKind === "every" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Interval (minutes)</label>
              <input
                type="number"
                min="1"
                value={everyMin}
                onChange={(e) => setEveryMin(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {scheduleKind === "at" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date & time</label>
              <input
                type="datetime-local"
                value={atDate}
                onChange={(e) => setAtDate(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Message */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Message / prompt</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Summarize today's activity"
              required
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Session target */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Session target</label>
            <select
              value={sessionTarget}
              onChange={(e) => setSessionTarget(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="main">main (shared agent session)</option>
              <option value="isolated">isolated (dedicated session per run)</option>
            </select>
          </div>

          {/* Delete after run */}
          {scheduleKind === "at" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteAfterRun}
                onChange={(e) => setDeleteAfterRun(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-gray-400">Delete job after it runs</span>
            </label>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors font-medium"
            >
              {submitting ? "Creating…" : "Create Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CronsPanel ────────────────────────────────────────────────────────────────

export default function CronsPanel({ sandbox }: { sandbox: SandboxRecord }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editJob, setEditJob] = useState<CronJob | null>(null);
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/crons`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setJobs(Array.isArray(data) ? data : (data as any).jobs ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sandbox.sandbox_id]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  async function handleToggle(job: CronJob) {
    setActionLoading(job.id + "-toggle");
    try {
      await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/crons/${job.id}/toggle`, {
        method: "POST",
      });
      setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, enabled: !j.enabled } : j));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRun(job: CronJob) {
    setActionLoading(job.id + "-run");
    try {
      await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/crons/${job.id}/run`, {
        method: "POST",
      });
      // Refresh to show updated lastRun
      await loadJobs();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(job: CronJob) {
    if (!confirm(`Delete cron job "${job.name}"?`)) return;
    setActionLoading(job.id + "-delete");
    try {
      await fetch(`${API_URL}/api/sandboxes/${sandbox.sandbox_id}/crons/${job.id}`, {
        method: "DELETE",
      });
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Cron Jobs</h2>
          <p className="text-xs text-gray-500 mt-0.5">{sandbox.sandbox_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadJobs}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title="Refresh"
          >
            ↻
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            + New Job
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-xs text-gray-600">Loading cron jobs…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <p className="text-xs text-red-400">{error}</p>
            <button onClick={loadJobs} className="text-xs text-blue-400 hover:text-blue-300">Retry</button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
            <p className="text-sm text-gray-500">No cron jobs yet.</p>
            <p className="text-xs text-gray-600">Schedule recurring tasks for your OpenClaw agent.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              + Create your first job →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          job.enabled ? "bg-green-400" : "bg-gray-600"
                        }`}
                      />
                      <p className="text-sm font-medium text-white truncate">{job.name}</p>
                      {job.state?.status === "error" && (
                        <span className="text-[10px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded font-medium shrink-0">
                          failed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 font-mono">{scheduleLabel(job.schedule)}</p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRun(job)}
                      disabled={actionLoading === job.id + "-run"}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                      title="Run now"
                    >
                      {actionLoading === job.id + "-run" ? "…" : "▶ Run"}
                    </button>
                    <button
                      onClick={() => handleToggle(job)}
                      disabled={actionLoading === job.id + "-toggle"}
                      className={`text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                        job.enabled
                          ? "bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400"
                          : "bg-green-900/30 hover:bg-green-900/50 text-green-400"
                      }`}
                      title={job.enabled ? "Disable" : "Enable"}
                    >
                      {actionLoading === job.id + "-toggle" ? "…" : job.enabled ? "Pause" : "Enable"}
                    </button>
                    <button
                      onClick={() => setEditJob(job)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-2.5 py-1 rounded-lg transition-colors"
                      title="Edit job"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setHistoryJob(job)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-2.5 py-1 rounded-lg transition-colors"
                      title="View run history"
                    >
                      History
                    </button>
                    <button
                      onClick={() => handleDelete(job)}
                      disabled={actionLoading === job.id + "-delete"}
                      className="text-xs text-gray-600 hover:text-red-400 transition-colors disabled:opacity-50 px-1"
                      title="Delete job"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Meta row */}
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-600 block">Session</span>
                    <span className="text-gray-400 font-mono">{job.sessionTarget}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Last run</span>
                    <span className="text-gray-400">{formatTs(job.state?.lastRunAtMs)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">Next run</span>
                    <span className="text-gray-400">{formatTs(job.state?.nextRunAtMs)}</span>
                  </div>
                </div>

                {/* Payload preview */}
                {job.payload?.text && (
                  <p className="text-xs text-gray-600 italic truncate">
                    "{job.payload.text}"
                  </p>
                )}

                {/* Error */}
                {job.state?.error && (
                  <p className="text-xs text-red-400 truncate" title={job.state.error}>
                    Error: {job.state.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {editJob && (
        <EditCronModal
          sandboxId={sandbox.sandbox_id}
          job={editJob}
          onSaved={loadJobs}
          onClose={() => setEditJob(null)}
        />
      )}
      {showCreate && (
        <CreateCronModal
          sandboxId={sandbox.sandbox_id}
          onCreated={loadJobs}
          onClose={() => setShowCreate(false)}
        />
      )}
      {historyJob && (
        <RunHistoryModal
          sandboxId={sandbox.sandbox_id}
          job={historyJob}
          onClose={() => setHistoryJob(null)}
        />
      )}
    </div>
  );
}
