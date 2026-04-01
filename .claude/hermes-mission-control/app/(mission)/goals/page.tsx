"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Target, Play, Pause, CheckCircle } from "lucide-react";
import { api, type Goal } from "@/lib/api";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-[var(--error)]/10 text-[var(--error)]",
  high: "bg-orange-500/10 text-orange-500",
  normal: "bg-[#3b82f6]/10 text-[#3b82f6]",
  low: "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-[var(--success)]/10 text-[var(--success)]",
  paused: "bg-[var(--warning)]/10 text-[var(--warning)]",
  completed: "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "normal", deadline: "", criteria: "" });
  const [creating, setCreating] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    api.goals.list().then((r) => setGoals(r.items)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.title || !form.description) return;
    setCreating(true);
    try {
      const criteria = form.criteria.split("\n").map(s => s.trim()).filter(Boolean);
      await api.goals.create({
        title: form.title,
        description: form.description,
        priority: form.priority,
        deadline: form.deadline || undefined,
        acceptanceCriteria: criteria,
      });
      setForm({ title: "", description: "", priority: "normal", deadline: "", criteria: "" });
      setShowCreate(false);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (goal: Goal, status: string) => {
    try {
      await api.goals.update(goal.id, { status });
      fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAnalyze = async (goalId: string) => {
    setAnalyzing(goalId);
    try {
      await api.goals.analyze(goalId);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Goals</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Set objectives, track progress, let the analyst decompose them into tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            New Goal
          </button>
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]">
            <RefreshCw className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-lg text-xs text-[var(--error)]">{error}</div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="mt-4 bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Goal title" className="col-span-2 px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)]" />
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)]">
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe the goal..." rows={2}
            className="w-full px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] resize-none" />
          <div className="grid grid-cols-3 gap-3">
            <textarea value={form.criteria} onChange={(e) => setForm({ ...form, criteria: e.target.value })}
              placeholder="Acceptance criteria (one per line)" rows={3}
              className="col-span-2 px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] resize-none" />
            <div className="flex flex-col gap-2">
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)]" />
              <button onClick={handleCreate} disabled={creating || !form.title || !form.description}
                className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
                {creating ? "Creating..." : "Create Goal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goals List */}
      <div className="mt-6 grid gap-4">
        {goals.length === 0 ? (
          <div className="text-center py-12 bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl">
            <Target className="h-8 w-8 mx-auto text-[var(--text-tertiary)] mb-3" />
            <p className="text-xs text-[var(--text-tertiary)]">No goals yet. Create one to get started.</p>
          </div>
        ) : (
          goals.map((goal) => (
            <div key={goal.id} className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-5 hover:border-[var(--primary)]/30 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Link href={`/goals/${goal.id}`} className="text-sm font-bold text-[var(--text-primary)] hover:text-[var(--primary)]">
                      {goal.title}
                    </Link>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLORS[goal.priority] || ""}`}>
                      {goal.priority}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[goal.status] || ""}`}>
                      {goal.status}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{goal.description.slice(0, 150)}</p>
                  {goal.deadline && (
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Deadline: {new Date(goal.deadline).toLocaleDateString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-4">
                  {goal.status === "active" && (
                    <>
                      <button onClick={() => handleAnalyze(goal.id)} disabled={analyzing === goal.id}
                        className="px-2 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded text-[10px] font-medium hover:bg-[var(--primary)]/20 disabled:opacity-50"
                        title="Run analyst">
                        {analyzing === goal.id ? "Analyzing..." : "Analyze"}
                      </button>
                      <button onClick={() => handleStatusChange(goal, "paused")}
                        className="p-1 rounded hover:bg-[var(--bg-subtle)]" title="Pause">
                        <Pause className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                      </button>
                      <button onClick={() => handleStatusChange(goal, "completed")}
                        className="p-1 rounded hover:bg-[var(--bg-subtle)]" title="Complete">
                        <CheckCircle className="h-3.5 w-3.5 text-[var(--success)]" />
                      </button>
                    </>
                  )}
                  {goal.status === "paused" && (
                    <button onClick={() => handleStatusChange(goal, "active")}
                      className="p-1 rounded hover:bg-[var(--bg-subtle)]" title="Resume">
                      <Play className="h-3.5 w-3.5 text-[var(--primary)]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                  <span>Progress</span>
                  <span>{goal.progressPct}%</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)] rounded-full transition-all"
                    style={{ width: `${goal.progressPct}%` }}
                  />
                </div>
              </div>

              {/* Acceptance criteria preview */}
              {goal.acceptanceCriteria.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {goal.acceptanceCriteria.slice(0, 3).map((c, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-[var(--bg-subtle)] rounded text-[10px] text-[var(--text-tertiary)]">
                      {c.slice(0, 40)}{c.length > 40 ? "..." : ""}
                    </span>
                  ))}
                  {goal.acceptanceCriteria.length > 3 && (
                    <span className="px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                      +{goal.acceptanceCriteria.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
