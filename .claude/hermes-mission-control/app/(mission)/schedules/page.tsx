"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Play, Trash2, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";
import { api, type ScheduledTask } from "@/lib/api";

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", cronExpression: "", agentName: "auto" });
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(() => {
    api.schedules.list().then(setSchedules).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.name || !form.description || !form.cronExpression) return;
    setCreating(true);
    try {
      await api.schedules.create(form);
      setForm({ name: "", description: "", cronExpression: "", agentName: "auto" });
      setShowCreate(false);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (schedule: ScheduledTask) => {
    try {
      await api.schedules.update(schedule.id, { enabled: !schedule.enabled });
      fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await api.schedules.runNow(id);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.schedules.delete(id);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Schedules</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Cron-based autonomous task scheduling</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            New Schedule
          </button>
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]">
            <RefreshCw className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-lg text-xs text-[var(--error)]">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="mt-4 bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Schedule name"
              className="px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)]"
            />
            <input
              type="text"
              value={form.cronExpression}
              onChange={(e) => setForm({ ...form, cronExpression: e.target.value })}
              placeholder="Cron expression (e.g., 0 */2 * * *)"
              className="px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Task description (what should the agent do?)"
              className="flex-1 px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)]"
            />
            <select
              value={form.agentName}
              onChange={(e) => setForm({ ...form, agentName: e.target.value })}
              className="px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none"
            >
              <option value="auto">Auto-route</option>
              <option value="backend">Backend</option>
              <option value="frontend">Frontend</option>
              <option value="test">Test</option>
              <option value="reviewer">Reviewer</option>
              <option value="hermes">Hermes</option>
            </select>
            <button
              onClick={handleCreate}
              disabled={creating || !form.name || !form.description || !form.cronExpression}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Schedules Table */}
      <div className="mt-6 bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl overflow-hidden">
        {schedules.length === 0 ? (
          <div className="text-center py-12 text-xs text-[var(--text-tertiary)]">
            No schedules yet. Create one to automate recurring tasks.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-left">
                <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Name</th>
                <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Cron</th>
                <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Agent</th>
                <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Runs</th>
                <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Last Run</th>
                <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Status</th>
                <th className="px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--bg-subtle)]">
                  <td className="px-4 py-2.5">
                    <div>
                      <p className="text-[var(--text-primary)] font-medium">{s.name}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{s.description.slice(0, 60)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{s.cronExpression}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.agentName}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.runCount}</td>
                  <td className="px-4 py-2.5 text-[var(--text-tertiary)]">
                    {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => handleToggle(s)} className="transition-colors">
                      {s.enabled ? (
                        <ToggleRight className="h-5 w-5 text-[var(--success)]" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-[var(--text-tertiary)]" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRunNow(s.id)}
                        className="p-1 rounded hover:bg-[var(--primary)]/10 transition-colors"
                        title="Run now"
                      >
                        <Play className="h-3.5 w-3.5 text-[var(--primary)]" />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="p-1 rounded hover:bg-[var(--error)]/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--error)]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
