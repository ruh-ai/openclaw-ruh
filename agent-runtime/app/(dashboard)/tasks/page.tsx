"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, GripVertical, Clock, CheckCircle2, AlertCircle, Circle } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  skill_used: string | null;
  outcome: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const COLUMNS = [
  { id: "backlog", label: "Backlog", icon: Circle, color: "var(--text-tertiary)" },
  { id: "in_progress", label: "In Progress", icon: Clock, color: "var(--primary)" },
  { id: "review", label: "Under Review", icon: AlertCircle, color: "var(--warning)" },
  { id: "done", label: "Done", icon: CheckCircle2, color: "var(--success)" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fetchTasks = useCallback(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const createTask = async () => {
    if (!newTitle.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle("");
    setShowForm(false);
    fetchTasks();
  };

  const moveTask = async (taskId: string, newStatus: string) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchTasks();
  };

  const tasksByStatus = (status: string) => tasks.filter((t) => t.status === status);

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Task Board</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage and track your agent&apos;s work
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* New task form */}
      {showForm && (
        <div className="mb-4 rounded-xl border border-[var(--primary)] bg-[var(--primary-light)] p-4 flex gap-3">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTask()}
            placeholder="What should the agent work on?"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-card)] outline-none focus:border-[var(--primary)]"
          />
          <button
            onClick={createTask}
            className="px-4 py-2 text-sm font-semibold text-white bg-[var(--primary)] rounded-lg hover:opacity-90"
          >
            Create
          </button>
          <button
            onClick={() => { setShowForm(false); setNewTitle(""); }}
            className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex-1 grid grid-cols-4 gap-4 min-h-0">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus(col.id);
          return (
            <div key={col.id} className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3">
                <col.icon className="h-4 w-4" style={{ color: col.color }} />
                <span className="text-sm font-semibold text-[var(--text-primary)]">{col.label}</span>
                <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-muted)] px-1.5 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto pb-4">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 hover:shadow-sm transition-shadow group"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-[var(--text-tertiary)] mt-1 line-clamp-2">{task.description}</p>
                        )}
                        {task.skill_used && (
                          <span className="inline-block mt-2 text-[10px] font-medium text-[var(--primary)] bg-[var(--primary-light)] px-1.5 py-0.5 rounded">
                            {task.skill_used}
                          </span>
                        )}
                        {/* Move buttons */}
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {COLUMNS.filter((c) => c.id !== task.status).map((target) => (
                            <button
                              key={target.id}
                              onClick={() => moveTask(task.id, target.id)}
                              className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors"
                            >
                              {target.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[var(--border)] py-8 text-center">
                    <p className="text-xs text-[var(--text-tertiary)]">No tasks</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
