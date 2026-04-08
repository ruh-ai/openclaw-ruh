"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Loader2, GitCommit, RotateCcw, Clock, Tag, AlertCircle, CheckCircle2, GitBranch } from "lucide-react";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";
import { useAgentsStore } from "@/hooks/use-agents-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface AgentVersion { id: string; agent_id: string; version_number: number; snapshot: Record<string, unknown>; message: string | null; created_at: string; created_by: string | null; }

export default function VersionHistoryPage() {
  const { id: agentId } = useParams<{ id: string }>();
  const router = useRouter();
  const { agents } = useAgentsStore();
  const agent = agents.find((a) => a.id === agentId);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [rollbackSuccess, setRollbackSuccess] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/versions?limit=50`);
      if (!res.ok) throw new Error("Failed to load versions");
      setVersions(await res.json() as AgentVersion[]);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); } finally { setLoading(false); }
  }, [agentId]);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  const handleRollback = async (v: number) => {
    if (!confirm(`Roll back to v${v}?`)) return;
    setRollingBack(v);
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/versions/${v}/rollback`, { method: "POST" });
      if (!res.ok) throw new Error("Rollback failed");
      setRollbackSuccess(v); setTimeout(() => setRollbackSuccess(null), 3000);
    } catch { setError("Rollback failed"); } finally { setRollingBack(null); }
  };

  const timeAgo = (iso: string) => { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; };
  const snapshotSummary = (s: Record<string, unknown>) => { const parts: string[] = []; const sk = Array.isArray(s.skillGraph) ? s.skillGraph.length : 0; const tr = Array.isArray(s.triggers) ? s.triggers.length : 0; if (sk) parts.push(`${sk} skill${sk !== 1 ? "s" : ""}`); if (tr) parts.push(`${tr} trigger${tr !== 1 ? "s" : ""}`); return parts.join(", ") || "empty snapshot"; };

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      <div className="shrink-0 border-b border-[var(--border-stroke)] px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-[var(--color-light)]"><ChevronLeft className="h-5 w-5 text-[var(--text-secondary)]" /></button>
          <div><h1 className="text-lg font-satoshi-bold text-[var(--text-primary)]">Version History</h1>
            {agent && <p className="text-xs text-[var(--text-tertiary)]">{agent.name} — {versions.length} version{versions.length !== 1 ? "s" : ""}</p>}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading && <div className="flex items-center justify-center py-16 gap-2"><Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" /><span className="text-sm text-[var(--text-tertiary)]">Loading...</span></div>}
        {error && !loading && <div className="flex items-center justify-center py-16"><AlertCircle className="h-8 w-8 text-[var(--error)]" /><p className="text-sm text-[var(--error)] ml-2">{error}</p></div>}
        {!loading && !error && versions.length === 0 && <div className="flex flex-col items-center justify-center py-16"><Tag className="h-8 w-8 text-[var(--text-tertiary)]" /><p className="text-sm font-satoshi-medium text-[var(--text-secondary)] mt-2">No versions yet</p><p className="text-xs text-[var(--text-tertiary)]">Versions are created when feature branches merge.</p></div>}
        {!loading && versions.length > 0 && (
          <div className="max-w-2xl mx-auto relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-[var(--border-default)]" />
            {versions.map((version, idx) => {
              const isLatest = idx === 0;
              const snap = (version.snapshot ?? {}) as Record<string, unknown>;
              return (
                <div key={version.id} className="relative pl-12 pb-6">
                  <div className={`absolute left-3 w-4 h-4 rounded-full border-2 ${isLatest ? "bg-[var(--primary)] border-[var(--primary)]" : "bg-[var(--card-color)] border-[var(--border-default)]"}`} />
                  <div className={`rounded-xl border ${isLatest ? "border-[var(--primary)]/20 bg-[var(--primary)]/3" : "border-[var(--border-stroke)] bg-[var(--card-color)]"} overflow-hidden`}>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <GitCommit className={`h-3.5 w-3.5 ${isLatest ? "text-[var(--primary)]" : "text-[var(--text-tertiary)]"}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-satoshi-bold text-[var(--text-primary)]">v{version.version_number}</span>
                            {isLatest && <span className="text-[9px] font-satoshi-bold text-[var(--primary)] bg-[var(--primary)]/10 px-1.5 py-0.5 rounded-full">latest</span>}
                            {rollbackSuccess === version.version_number && <span className="text-[9px] text-[var(--success)] bg-[var(--success)]/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" /> restored</span>}
                          </div>
                          {version.message && <p className="text-xs text-[var(--text-secondary)] truncate">{version.message}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(version.created_at)}</span>
                        {!isLatest && <button onClick={() => handleRollback(version.version_number)} disabled={rollingBack !== null} className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-satoshi-bold text-[var(--text-secondary)] rounded-lg border border-[var(--border-stroke)] hover:border-[var(--primary)]/30 hover:text-[var(--primary)] disabled:opacity-40 transition-all">
                          {rollingBack === version.version_number ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Rollback
                        </button>}
                      </div>
                    </div>
                    <button onClick={() => setExpandedId(expandedId === version.id ? null : version.id)} className="w-full px-4 py-2 border-t border-[var(--border-default)]/50 flex items-center gap-1.5 text-[10px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                      <GitBranch className="h-3 w-3" /> {snapshotSummary(snap)}
                    </button>
                    {expandedId === version.id && <div className="px-4 pb-3 border-t border-[var(--border-default)]/50"><pre className="text-[10px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-[200px] overflow-y-auto mt-2">{JSON.stringify(snap, null, 2).slice(0, 2000)}</pre></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
