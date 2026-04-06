"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDot,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { api, type BoardTask, type BoardTaskStatus, type GoalBoardLane } from "@/lib/api";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-[var(--error)]/10 text-[var(--error)]",
  high: "bg-orange-500/10 text-orange-500",
  normal: "bg-[#3b82f6]/10 text-[#3b82f6]",
  low: "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
};

const GOAL_STATUS_COLORS: Record<string, string> = {
  active: "bg-[var(--success)]/10 text-[var(--success)]",
  paused: "bg-[var(--warning)]/10 text-[var(--warning)]",
  completed: "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
};

const COLUMN_CONFIG: Array<{ key: BoardTaskStatus; label: string; hint: string }> = [
  { key: "todo", label: "Todo", hint: "Planned work that still needs an execution run." },
  { key: "in_progress", label: "In Progress", hint: "Currently queued or being executed by Hermes." },
  { key: "blocked", label: "Blocked", hint: "Needs intervention before Hermes should keep pushing." },
  { key: "done", label: "Done", hint: "Finished work with clear agent attribution." },
];

type GoalFormState = {
  title: string;
  description: string;
  priority: string;
  deadline: string;
  criteria: string;
};

type TaskDraft = {
  title: string;
  description: string;
  plannedAgent: string;
  priority: string;
};

const EMPTY_GOAL_FORM: GoalFormState = {
  title: "",
  description: "",
  priority: "normal",
  deadline: "",
  criteria: "",
};

const EMPTY_TASK_DRAFT: TaskDraft = {
  title: "",
  description: "",
  plannedAgent: "",
  priority: "normal",
};

function TaskCard({
  task,
  busy,
  onRun,
  onStatusChange,
}: {
  task: BoardTask;
  busy: boolean;
  onRun: () => void;
  onStatusChange: (status: BoardTaskStatus, blockedReason?: string | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-white/75 p-3 shadow-[0_10px_24px_rgba(25,16,62,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {task.description || task.title}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal}`}>
          {task.priority}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-[10px] text-[var(--text-tertiary)]">
        <div className="flex items-center justify-between gap-2">
          <span>Planned agent</span>
          <span className="font-medium text-[var(--text-primary)]">{task.plannedAgent || "auto"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Last execution</span>
          <span className="font-medium text-[var(--text-primary)]">{task.lastExecutionAgent || "none"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Completed by</span>
          <span className="font-medium text-[var(--text-primary)]">{task.completedByAgent || "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Runs</span>
          <span className="font-medium text-[var(--text-primary)]">{task.runCount}</span>
        </div>
      </div>

      {task.blockedReason && (
        <div className="mt-3 rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/5 px-3 py-2 text-[10px] text-[var(--error)]">
          {task.blockedReason}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {task.status !== "in_progress" && (
          <button
            onClick={onRun}
            disabled={busy}
            className="rounded-full bg-[var(--primary)] px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Running..." : task.status === "done" ? "Run Again" : "Run"}
          </button>
        )}

        {task.status === "blocked" ? (
          <button
            onClick={() => onStatusChange("todo", null)}
            disabled={busy}
            className="rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
          >
            Move to Todo
          </button>
        ) : (
          task.status !== "done" && (
            <button
              onClick={() => onStatusChange("blocked", "Blocked by operator")}
              disabled={busy}
              className="rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
            >
              Block
            </button>
          )
        )}

        {task.status !== "done" ? (
          <button
            onClick={() => onStatusChange("done")}
            disabled={busy}
            className="rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
          >
            Mark Done
          </button>
        ) : (
          <button
            onClick={() => onStatusChange("todo")}
            disabled={busy}
            className="rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const [board, setBoard] = useState<GoalBoardLane[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [goalForm, setGoalForm] = useState<GoalFormState>(EMPTY_GOAL_FORM);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});
  const [openTaskComposerGoalId, setOpenTaskComposerGoalId] = useState<string | null>(null);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [creatingTaskForGoalId, setCreatingTaskForGoalId] = useState<string | null>(null);
  const [analyzingGoalId, setAnalyzingGoalId] = useState<string | null>(null);
  const [goalActionId, setGoalActionId] = useState<string | null>(null);
  const [taskActionId, setTaskActionId] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    api.goals.board()
      .then((result) => {
        setBoard(result.items);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCreateGoal = async () => {
    if (!goalForm.title.trim() || !goalForm.description.trim()) return;
    setCreatingGoal(true);
    try {
      const acceptanceCriteria = goalForm.criteria
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      await api.goals.create({
        title: goalForm.title.trim(),
        description: goalForm.description.trim(),
        priority: goalForm.priority,
        deadline: goalForm.deadline || undefined,
        acceptanceCriteria,
      });
      setGoalForm(EMPTY_GOAL_FORM);
      setShowCreateGoal(false);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingGoal(false);
    }
  };

  const handleGoalStatusChange = async (goalId: string, status: string) => {
    setGoalActionId(goalId);
    try {
      await api.goals.update(goalId, { status });
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGoalActionId(null);
    }
  };

  const handleAnalyze = async (goalId: string) => {
    setAnalyzingGoalId(goalId);
    try {
      await api.goals.analyze(goalId);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzingGoalId(null);
    }
  };

  const updateTaskDraft = (goalId: string, patch: Partial<TaskDraft>) => {
    setTaskDrafts((current) => ({
      ...current,
      [goalId]: {
        ...(current[goalId] || EMPTY_TASK_DRAFT),
        ...patch,
      },
    }));
  };

  const handleCreateTask = async (goalId: string) => {
    const draft = taskDrafts[goalId] || EMPTY_TASK_DRAFT;
    if (!draft.title.trim()) return;

    setCreatingTaskForGoalId(goalId);
    try {
      await api.boardTasks.create({
        goalId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        plannedAgent: draft.plannedAgent.trim() || null,
        priority: draft.priority,
      });
      setTaskDrafts((current) => ({ ...current, [goalId]: EMPTY_TASK_DRAFT }));
      setOpenTaskComposerGoalId(null);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingTaskForGoalId(null);
    }
  };

  const handleRunTask = async (taskId: string) => {
    setTaskActionId(taskId);
    try {
      await api.boardTasks.run(taskId);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTaskActionId(null);
    }
  };

  const handleTaskStatusChange = async (taskId: string, status: BoardTaskStatus, blockedReason?: string | null) => {
    setTaskActionId(taskId);
    try {
      await api.boardTasks.update(taskId, { status, blockedReason });
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTaskActionId(null);
    }
  };

  const totalTasks = board.reduce((sum, lane) => sum + lane.stats.total, 0);
  const totalDone = board.reduce((sum, lane) => sum + lane.stats.done, 0);
  const totalBlocked = board.reduce((sum, lane) => sum + lane.stats.blocked, 0);
  const totalInProgress = board.reduce((sum, lane) => sum + lane.stats.inProgress, 0);

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Goals Board</h1>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Linear-style planning lanes where every task belongs to a goal and every execution can be traced back to the agent that ran it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--border-default)] bg-white/70 px-3 py-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
            {board.length} goals
          </span>
          <span className="rounded-full border border-[var(--border-default)] bg-white/70 px-3 py-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
            {totalTasks} task cards
          </span>
          <span className="rounded-full border border-[var(--border-default)] bg-white/70 px-3 py-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
            {totalInProgress} running
          </span>
          <span className="rounded-full border border-[var(--border-default)] bg-white/70 px-3 py-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
            {totalBlocked} blocked
          </span>
          <button
            onClick={() => setShowCreateGoal((current) => !current)}
            className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            New Goal
          </button>
          <button onClick={fetchData} className="rounded-full p-2 hover:bg-[var(--bg-subtle)]">
            <RefreshCw className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-[var(--error)]/20 bg-[var(--error)]/5 px-4 py-3 text-xs text-[var(--error)]">
          {error}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="mission-card rounded-[24px] p-4">
          <p className="section-label">Completed</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{totalDone}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Cards currently in the done column.</p>
        </div>
        <div className="mission-card rounded-[24px] p-4">
          <p className="section-label">Blocked</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{totalBlocked}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Needs operator input or a better task breakdown.</p>
        </div>
        <div className="mission-card rounded-[24px] p-4">
          <p className="section-label">In Progress</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{totalInProgress}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Cards actively moving through Hermes.</p>
        </div>
        <div className="mission-card rounded-[24px] p-4">
          <p className="section-label">Completion</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            {totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0}%
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Across all goal-linked board tasks.</p>
        </div>
      </div>

      {showCreateGoal && (
        <div className="mission-card mt-5 rounded-[28px] p-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <input
              type="text"
              value={goalForm.title}
              onChange={(e) => setGoalForm((current) => ({ ...current, title: e.target.value }))}
              placeholder="Goal title"
              className="rounded-2xl border border-[var(--border-default)] bg-white/80 px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            />
            <select
              value={goalForm.priority}
              onChange={(e) => setGoalForm((current) => ({ ...current, priority: e.target.value }))}
              className="rounded-2xl border border-[var(--border-default)] bg-white/80 px-4 py-3 text-sm text-[var(--text-primary)] outline-none"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <input
              type="date"
              value={goalForm.deadline}
              onChange={(e) => setGoalForm((current) => ({ ...current, deadline: e.target.value }))}
              className="rounded-2xl border border-[var(--border-default)] bg-white/80 px-4 py-3 text-sm text-[var(--text-primary)] outline-none"
            />
          </div>
          <textarea
            value={goalForm.description}
            onChange={(e) => setGoalForm((current) => ({ ...current, description: e.target.value }))}
            placeholder="Describe the initiative and desired outcome..."
            rows={3}
            className="mt-3 w-full rounded-2xl border border-[var(--border-default)] bg-white/80 px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <textarea
            value={goalForm.criteria}
            onChange={(e) => setGoalForm((current) => ({ ...current, criteria: e.target.value }))}
            placeholder="Acceptance criteria, one per line"
            rows={3}
            className="mt-3 w-full rounded-2xl border border-[var(--border-default)] bg-white/80 px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowCreateGoal(false)}
              className="rounded-full border border-[var(--border-default)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateGoal}
              disabled={creatingGoal || !goalForm.title.trim() || !goalForm.description.trim()}
              className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {creatingGoal ? "Creating..." : "Create Goal"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {board.length === 0 ? (
          <div className="mission-card rounded-[28px] px-8 py-16 text-center">
            <Target className="mx-auto h-10 w-10 text-[var(--text-tertiary)]" />
            <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">No goals yet</p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Create a goal and let Hermes decompose it into board tasks that can be owned and executed.
            </p>
          </div>
        ) : (
          board.map((lane) => {
            const progress = lane.stats.total > 0
              ? Math.round((lane.stats.done / lane.stats.total) * 100)
              : lane.goal.progressPct;
            const taskDraft = taskDrafts[lane.goal.id] || EMPTY_TASK_DRAFT;

            return (
              <div key={lane.goal.id} className="mission-card rounded-[30px] p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/goals/${lane.goal.id}`} className="text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--primary)]">
                        {lane.goal.title}
                      </Link>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[lane.goal.priority] || PRIORITY_COLORS.normal}`}>
                        {lane.goal.priority}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${GOAL_STATUS_COLORS[lane.goal.status] || GOAL_STATUS_COLORS.active}`}>
                        {lane.goal.status}
                      </span>
                      {lane.goal.deadline && (
                        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          Due {new Date(lane.goal.deadline).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{lane.goal.description}</p>
                    {lane.goal.acceptanceCriteria.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {lane.goal.acceptanceCriteria.slice(0, 4).map((criterion, index) => (
                          <span key={index} className="rounded-full border border-[var(--border-default)] bg-white/70 px-2.5 py-1 text-[10px] text-[var(--text-secondary)]">
                            {criterion}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
                    <div className="rounded-[24px] border border-[var(--border-default)] bg-white/70 p-4">
                      <p className="section-label">Goal Progress</p>
                      <div className="mt-2 flex items-end justify-between">
                        <p className="text-3xl font-semibold text-[var(--text-primary)]">{progress}%</p>
                        <p className="text-xs text-[var(--text-secondary)]">{lane.stats.done}/{lane.stats.total || 0} done</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                        <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-[var(--border-default)] bg-white/70 p-4">
                      <p className="section-label">Lane Pressure</p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-xl font-semibold text-[var(--text-primary)]">{lane.stats.todo}</p>
                          <p className="text-[10px] text-[var(--text-secondary)]">Todo</p>
                        </div>
                        <div>
                          <p className="text-xl font-semibold text-[var(--text-primary)]">{lane.stats.inProgress}</p>
                          <p className="text-[10px] text-[var(--text-secondary)]">In Progress</p>
                        </div>
                        <div>
                          <p className="text-xl font-semibold text-[var(--text-primary)]">{lane.stats.blocked}</p>
                          <p className="text-[10px] text-[var(--text-secondary)]">Blocked</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setOpenTaskComposerGoalId((current) => current === lane.goal.id ? null : lane.goal.id)}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                  >
                    <Plus className="h-3 w-3" />
                    Add Task
                  </button>
                  <button
                    onClick={() => handleAnalyze(lane.goal.id)}
                    disabled={analyzingGoalId === lane.goal.id || lane.goal.status !== "active"}
                    className="flex items-center gap-1.5 rounded-full bg-[var(--primary)]/10 px-3 py-1.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/20 disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    {analyzingGoalId === lane.goal.id ? "Analyzing..." : "Analyze Goal"}
                  </button>
                  {lane.goal.status === "active" ? (
                    <button
                      onClick={() => handleGoalStatusChange(lane.goal.id, "paused")}
                      disabled={goalActionId === lane.goal.id}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                    >
                      <Pause className="h-3 w-3" />
                      Pause Goal
                    </button>
                  ) : lane.goal.status === "paused" ? (
                    <button
                      onClick={() => handleGoalStatusChange(lane.goal.id, "active")}
                      disabled={goalActionId === lane.goal.id}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                    >
                      <Play className="h-3 w-3" />
                      Resume Goal
                    </button>
                  ) : (
                    <button
                      onClick={() => handleGoalStatusChange(lane.goal.id, "active")}
                      disabled={goalActionId === lane.goal.id}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                    >
                      <CircleDot className="h-3 w-3" />
                      Reopen Goal
                    </button>
                  )}
                  {lane.goal.status !== "completed" && (
                    <button
                      onClick={() => handleGoalStatusChange(lane.goal.id, "completed")}
                      disabled={goalActionId === lane.goal.id}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Mark Goal Done
                    </button>
                  )}
                </div>

                {openTaskComposerGoalId === lane.goal.id && (
                  <div className="mt-4 rounded-[24px] border border-[var(--border-default)] bg-white/75 p-4">
                    <div className="grid gap-3 lg:grid-cols-[1.2fr,1.2fr,0.8fr,0.8fr]">
                      <input
                        type="text"
                        value={taskDraft.title}
                        onChange={(e) => updateTaskDraft(lane.goal.id, { title: e.target.value })}
                        placeholder="Task title"
                        className="rounded-2xl border border-[var(--border-default)] bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                      />
                      <input
                        type="text"
                        value={taskDraft.description}
                        onChange={(e) => updateTaskDraft(lane.goal.id, { description: e.target.value })}
                        placeholder="Optional implementation detail"
                        className="rounded-2xl border border-[var(--border-default)] bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                      />
                      <input
                        type="text"
                        value={taskDraft.plannedAgent}
                        onChange={(e) => updateTaskDraft(lane.goal.id, { plannedAgent: e.target.value })}
                        placeholder="backend, frontend, reviewer..."
                        className="rounded-2xl border border-[var(--border-default)] bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                      />
                      <select
                        value={taskDraft.priority}
                        onChange={(e) => updateTaskDraft(lane.goal.id, { priority: e.target.value })}
                        className="rounded-2xl border border-[var(--border-default)] bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => setOpenTaskComposerGoalId(null)}
                        className="rounded-full border border-[var(--border-default)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleCreateTask(lane.goal.id)}
                        disabled={creatingTaskForGoalId === lane.goal.id || !taskDraft.title.trim()}
                        className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {creatingTaskForGoalId === lane.goal.id ? "Creating..." : "Create Task"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 grid gap-4 xl:grid-cols-4">
                  {COLUMN_CONFIG.map((column) => {
                    const columnTasks = lane.tasks.filter((task) => task.status === column.key);

                    return (
                      <div key={column.key} className="rounded-[26px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.62)] p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{column.label}</p>
                            <p className="mt-1 text-[10px] leading-4 text-[var(--text-tertiary)]">{column.hint}</p>
                          </div>
                          <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                            {columnTasks.length}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          {columnTasks.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-[10px] text-[var(--text-tertiary)]">
                              No task cards here yet.
                            </div>
                          ) : (
                            columnTasks.map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                busy={taskActionId === task.id}
                                onRun={() => handleRunTask(task.id)}
                                onStatusChange={(status, blockedReason) => handleTaskStatusChange(task.id, status, blockedReason)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
