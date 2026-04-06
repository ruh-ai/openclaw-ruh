"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Play, Trash2 } from "lucide-react";
import { api, type Goal, type GoalBoardLane, type GoalProgress, type TaskLog } from "@/lib/api";

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [boardLane, setBoardLane] = useState<GoalBoardLane | null>(null);
  const [runs, setRuns] = useState<TaskLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchData = useCallback(() => {
    Promise.all([api.goals.get(id), api.goals.progress(id), api.goals.goalBoard(id), api.goals.tasks(id)])
      .then(([g, p, board, t]) => {
        setGoal(g);
        setProgress(p);
        setBoardLane(board);
        setRuns(t.items);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await api.goals.analyze(id);
      setTimeout(fetchData, 3000); // refresh after a short delay
    } catch (e: any) { setError(e.message); }
    finally { setAnalyzing(false); }
  };

  const handleDelete = async () => {
    try {
      await api.goals.delete(id);
      router.push("/goals");
    } catch (e: any) { setError(e.message); }
  };

  if (!goal) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 rounded-lg soul-pulse mx-auto mb-3 bg-[var(--primary)]/10" />
        <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/goals")} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="h-4 w-4 text-[var(--text-tertiary)]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">{goal.title}</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{goal.status} / {goal.priority} priority</p>
        </div>
        <button onClick={handleAnalyze} disabled={analyzing || goal.status !== "active"}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
          <Play className="h-3 w-3" />
          {analyzing ? "Analyzing..." : "Run Analyst"}
        </button>
        <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]">
          <RefreshCw className="h-4 w-4 text-[var(--text-tertiary)]" />
        </button>
        <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-[var(--error)]/10">
          <Trash2 className="h-4 w-4 text-[var(--error)]" />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-lg text-xs text-[var(--error)]">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Goal details */}
        <div className="col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-5">
            <h2 className="text-xs font-bold text-[var(--text-primary)] mb-2 uppercase">Description</h2>
            <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{goal.description}</p>
            {goal.deadline && (
              <p className="text-[10px] text-[var(--text-tertiary)] mt-3">Deadline: {new Date(goal.deadline).toLocaleDateString()}</p>
            )}
          </div>

          {/* Linked Tasks */}
          <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-5">
            <h2 className="text-xs font-bold text-[var(--text-primary)] mb-3 uppercase">
              Board Tasks ({boardLane?.stats.total ?? 0})
            </h2>
            {!boardLane || boardLane.tasks.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)]">No tasks linked yet. Click "Run Analyst" to decompose this goal.</p>
            ) : (
              <div className="space-y-2">
                {boardLane.tasks.map((task) => (
                  <div key={task.id} className="py-3 border-b border-[var(--border-default)] last:border-0">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-[var(--text-primary)]">{task.title}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1">{task.description || task.title}</p>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        task.status === "done" ? "bg-[var(--success)]/10 text-[var(--success)]" :
                        task.status === "blocked" ? "bg-[var(--error)]/10 text-[var(--error)]" :
                        task.status === "in_progress" ? "bg-[#3b82f6]/10 text-[#3b82f6]" :
                        "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-[var(--text-tertiary)]">
                      <span>Planned: {task.plannedAgent || "auto"}</span>
                      <span>Last execution: {task.lastExecutionAgent || "none"}</span>
                      <span>Completed by: {task.completedByAgent || "-"}</span>
                      <span>Runs: {task.runCount}</span>
                    </div>
                    {task.blockedReason && (
                      <p className="mt-2 text-[10px] text-[var(--error)]">{task.blockedReason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-5">
            <h2 className="text-xs font-bold text-[var(--text-primary)] mb-3 uppercase">
              Execution Runs ({runs.length})
            </h2>
            {runs.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)]">No execution runs recorded for this goal yet.</p>
            ) : (
              <div className="space-y-2">
                {runs.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-[var(--border-default)] last:border-0">
                    <div className="flex-1">
                      <p className="text-xs text-[var(--text-primary)]">{t.description.slice(0, 100)}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                        {t.delegatedTo || "unassigned"}
                        {t.boardTaskId ? ` · board card ${t.boardTaskId.slice(0, 8)}` : ""}
                      </p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      t.status === "completed" ? "bg-[var(--success)]/10 text-[var(--success)]" :
                      t.status === "failed" ? "bg-[var(--error)]/10 text-[var(--error)]" :
                      t.status === "running" ? "bg-[#3b82f6]/10 text-[#3b82f6]" :
                      "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
                    }`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Progress + Criteria */}
        <div className="space-y-6">
          {/* Progress */}
          {progress && (
            <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-5">
              <h2 className="text-xs font-bold text-[var(--text-primary)] mb-3 uppercase">Progress</h2>
              <div className="text-center mb-4">
                <p className="text-3xl font-bold text-[var(--primary)]">{progress.progressPct}%</p>
              </div>
              <div className="h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden mb-4">
                <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${progress.progressPct}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div>
                  <p className="font-bold text-[var(--success)]">{progress.completed}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Completed</p>
                </div>
                <div>
                  <p className="font-bold text-[#3b82f6]">{progress.running}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Running</p>
                </div>
                <div>
                  <p className="font-bold text-[var(--error)]">{progress.failed}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Failed</p>
                </div>
                <div>
                  <p className="font-bold text-[var(--text-primary)]">{progress.total}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Total</p>
                </div>
              </div>
            </div>
          )}

          {/* Acceptance Criteria */}
          <div className="bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-5">
            <h2 className="text-xs font-bold text-[var(--text-primary)] mb-3 uppercase">Acceptance Criteria</h2>
            {goal.acceptanceCriteria.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)]">No criteria defined</p>
            ) : (
              <ul className="space-y-2">
                {goal.acceptanceCriteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="mt-0.5 w-4 h-4 rounded border border-[var(--border-default)] flex-shrink-0" />
                    <span className="text-xs text-[var(--text-secondary)]">{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
