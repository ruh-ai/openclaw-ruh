"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { api, type WorkerPoolConfig } from "@/lib/api";

const QUEUE_DESCRIPTIONS: Record<string, string> = {
  ingestion: "Validates incoming tasks, queries memory for context, routes to the best specialist agent",
  execution: "Spawns Claude CLI subprocesses to run agent tasks. Controls how many agents run in parallel",
  learning: "Parses agent output, extracts learnings, scores agents, detects skills, triggers evolution",
  evolution: "Scheduled analysis: detects declining agents, triggers prompt refinements, runs maintenance",
  factory: "Creates new specialist agent .md files when capability gaps are detected (3+ unmatched tasks)",
  analyst: "Decomposes high-level goals into concrete, actionable tasks for specialist agents",
};

export default function WorkerPoolPage() {
  const [configs, setConfigs] = useState<WorkerPoolConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const fetchData = useCallback(() => {
    api.pool.list().then(setConfigs).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleConcurrencyChange = async (config: WorkerPoolConfig, newValue: number) => {
    if (newValue < 0 || newValue > config.maxConcurrency) return;
    setSaving(config.id);
    try {
      await api.pool.update(config.id, { concurrency: newValue });
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await api.pool.reload();
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReloading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Worker Pool</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Configure concurrency per queue. Changes apply immediately.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReload} disabled={reloading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
            <RotateCcw className="h-3 w-3" />
            {reloading ? "Reloading..." : "Reload Workers"}
          </button>
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]">
            <RefreshCw className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-lg text-xs text-[var(--error)]">{error}</div>
      )}

      <div className="mt-6 bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border-default)] text-left">
              <th className="px-5 py-3 text-[var(--text-tertiary)] font-medium">Queue</th>
              <th className="px-5 py-3 text-[var(--text-tertiary)] font-medium">Concurrency</th>
              <th className="px-5 py-3 text-[var(--text-tertiary)] font-medium">Max</th>
              <th className="px-5 py-3 text-[var(--text-tertiary)] font-medium">Slider</th>
              <th className="px-5 py-3 text-[var(--text-tertiary)] font-medium">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((config) => {
              const shortName = config.queueName.replace("hermes-", "");
              return (
                <tr key={config.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)] capitalize">{shortName}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 max-w-[280px]">
                        {QUEUE_DESCRIPTIONS[shortName] || config.queueName}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConcurrencyChange(config, config.concurrency - 1)}
                        disabled={config.concurrency <= 0 || saving === config.id}
                        className="w-6 h-6 rounded bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--primary)]/10 disabled:opacity-30 flex items-center justify-center font-bold"
                      >
                        -
                      </button>
                      <span className="text-lg font-bold text-[var(--primary)] w-8 text-center">
                        {saving === config.id ? "..." : config.concurrency}
                      </span>
                      <button
                        onClick={() => handleConcurrencyChange(config, config.concurrency + 1)}
                        disabled={config.concurrency >= config.maxConcurrency || saving === config.id}
                        className="w-6 h-6 rounded bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--primary)]/10 disabled:opacity-30 flex items-center justify-center font-bold"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[var(--text-tertiary)]">{config.maxConcurrency}</td>
                  <td className="px-5 py-4">
                    <input
                      type="range"
                      min={0}
                      max={config.maxConcurrency}
                      value={config.concurrency}
                      onChange={(e) => handleConcurrencyChange(config, parseInt(e.target.value, 10))}
                      className="w-full accent-[var(--primary)]"
                    />
                  </td>
                  <td className="px-5 py-4 text-[var(--text-tertiary)]">
                    {new Date(config.updatedAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
