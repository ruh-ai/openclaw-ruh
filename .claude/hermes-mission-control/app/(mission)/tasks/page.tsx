"use client";
import { useEffect, useState } from "react";
import { ListTodo, Plus } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { api, type TaskLog } from "@/lib/api";

const PAGE_SIZE = 30;

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitDesc, setSubmitDesc] = useState("");
  const [submitAgent, setSubmitAgent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = () => {
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    };
    if (statusFilter) params.status = statusFilter;
    api.tasks.list(params).then((r) => { setTasks(r.items); setTotal(r.total); });
  };

  useEffect(() => {
    fetchTasks();
  }, [statusFilter, page]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  const handleSubmit = async () => {
    if (!submitDesc.trim()) return;
    setSubmitting(true);
    try {
      await api.queue.submit({
        description: submitDesc.trim(),
        ...(submitAgent.trim() ? { agentName: submitAgent.trim() } : {}),
      });
      setSubmitDesc("");
      setSubmitAgent("");
      setShowSubmit(false);
      fetchTasks();
    } catch (e) {
      console.error("Failed to submit task:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Tasks</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">{total} tasks logged</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSubmit(!showSubmit)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            Submit Task
          </button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-xs text-[var(--text-secondary)]"
          >
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Submit Task Form */}
      {showSubmit && (
        <div className="mt-4 animate-fadeIn bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Description</label>
              <input
                type="text"
                value={submitDesc}
                onChange={(e) => setSubmitDesc(e.target.value)}
                placeholder="What should the agent do?"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-color)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Agent (optional)</label>
              <input
                type="text"
                value={submitAgent}
                onChange={(e) => setSubmitAgent(e.target.value)}
                placeholder="e.g. backend, frontend, reviewer"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-color)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSubmit(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !submitDesc.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] overflow-hidden">
        {tasks.length === 0 ? (
          <div className="text-center py-12">
            <ListTodo className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-tertiary)]">No tasks yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Description</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Source</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Delegated To</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Result</th>
                <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Time</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3 text-xs text-[var(--text-primary)] max-w-xs truncate">{task.description}</td>
                  <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                    {task.sessionId ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#8b5cf6]/10 text-[#8b5cf6]">session</span>
                    ) : task.parentTaskId ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#3b82f6]/10 text-[#3b82f6]">subtask</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-subtle)] text-[var(--text-tertiary)]">direct</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--primary)] font-medium">{task.delegatedTo || "hermes"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                    {task.error ? (
                      <span className="text-[var(--error)]">{task.error}</span>
                    ) : (
                      task.resultSummary || "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
                    {new Date(task.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
