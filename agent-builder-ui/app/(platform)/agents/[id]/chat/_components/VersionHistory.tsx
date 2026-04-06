"use client";

import { useEffect, useState, useCallback } from "react";
import { History, RotateCcw, Loader2, AlertTriangle, X } from "lucide-react";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  message: string;
  created_at: string;
  snapshot: Record<string, unknown>;
}

interface VersionHistoryProps {
  agentId: string;
}

export function VersionHistory({ agentId }: VersionHistoryProps) {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AgentVersion | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/versions`);
      if (!res.ok) throw new Error(`Failed to load versions (${res.status})`);
      const data: AgentVersion[] = await res.json();
      setVersions(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  async function handleRollback(version: AgentVersion) {
    setRollingBack(version.id);
    setConfirmTarget(null);
    try {
      const res = await fetchBackendWithAuth(
        `${API_BASE}/api/agents/${agentId}/versions/${version.version_number}/rollback`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Rollback failed (${res.status})`);
      await fetchVersions();
    } catch (err: any) {
      setError(err.message ?? "Rollback failed");
    } finally {
      setRollingBack(null);
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">{error}</p>
        <button
          onClick={() => { setLoading(true); fetchVersions(); }}
          className="text-xs font-satoshi-medium text-[var(--primary)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <History className="h-5 w-5 text-[var(--text-tertiary)]" />
        <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">No versions yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-3 py-2 mb-1">
        <History className="h-4 w-4 text-[var(--text-tertiary)]" />
        <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Version History</h3>
      </div>

      <div className="space-y-2 px-2">
        {versions.map((v) => (
          <div
            key={v.id}
            className="rounded-lg border border-[var(--border-stroke)] bg-[var(--card-color)] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-satoshi-bold text-[var(--primary)]">
                    v{v.version_number}
                  </span>
                  <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
                    {formatDate(v.created_at)}
                  </span>
                </div>
                <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mt-1 line-clamp-2">
                  {v.message || "No message"}
                </p>
              </div>
              <button
                onClick={() => setConfirmTarget(v)}
                disabled={rollingBack !== null}
                className="shrink-0 p-1.5 rounded-md hover:bg-[var(--background)] transition-colors disabled:opacity-40"
                title={`Rollback to v${v.version_number}`}
              >
                {rollingBack === v.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl p-5 max-w-sm w-full mx-4 shadow-lg">
            <div className="flex items-start justify-between mb-3">
              <h4 className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                Confirm Rollback
              </h4>
              <button onClick={() => setConfirmTarget(null)} className="p-0.5">
                <X className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            </div>
            <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mb-4">
              Roll back to <span className="font-satoshi-bold text-[var(--primary)]">v{confirmTarget.version_number}</span>?
              This will restore the agent to the state at that version. The current state will be saved as a new version.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-satoshi-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRollback(confirmTarget)}
                className="px-3 py-1.5 rounded-lg text-xs font-satoshi-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
              >
                Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
