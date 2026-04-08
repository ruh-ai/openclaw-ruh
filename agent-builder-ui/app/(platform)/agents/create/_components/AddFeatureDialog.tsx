"use client";
import { useState, useCallback } from "react";
import { X, GitBranch, Loader2 } from "lucide-react";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface AddFeatureDialogProps { agentId: string; agentName: string; onClose: () => void; onCreated: (branchName: string) => void; }

export function AddFeatureDialog({ agentId, agentName, onClose, onCreated }: AddFeatureDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "feature";

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setCreating(true); setError(null);
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error((data as Record<string, string>).error ?? `Failed (${res.status})`); }
      const branch = await res.json() as { branch_name: string };
      onCreated(branch.branch_name);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create branch"); }
    finally { setCreating(false); }
  }, [agentId, title, description, onCreated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-stroke)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--primary)]/10"><GitBranch className="h-4 w-4 text-[var(--primary)]" /></div>
            <div><h2 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Add Feature</h2><p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">Create a feature branch for {agentName}</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-light)] transition-colors"><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-satoshi-medium text-[var(--text-secondary)]">What feature are you adding?</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add Slack notifications"
              className="focus-breathe w-full px-3 py-2.5 rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-sm font-satoshi-regular text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && !creating && title.trim() && handleCreate()} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-satoshi-medium text-[var(--text-secondary)]">Description <span className="text-[var(--text-tertiary)]">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the feature" rows={3}
              className="focus-breathe w-full px-3 py-2.5 rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-sm font-satoshi-regular text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none resize-none" />
          </div>
          {title.trim() && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border-stroke)]">
              <GitBranch className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /><span className="text-xs font-mono text-[var(--text-secondary)]">feature/{branchSlug}</span>
            </div>
          )}
          {error && <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/10 px-3 py-2 text-xs text-[var(--error)]">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-stroke)]">
          <button onClick={onClose} className="px-4 py-2 text-sm font-satoshi-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--color-light)] transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={!title.trim() || creating}
            className="flex items-center gap-2 px-5 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--primary)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />} Create Branch
          </button>
        </div>
      </div>
    </div>
  );
}
