"use client";
import { useState, useCallback, useEffect } from "react";
import { X, GitMerge, GitPullRequest, ExternalLink, Loader2, CheckCircle2, AlertCircle, FileText, Plus, Minus } from "lucide-react";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface MergeReviewDialogProps { agentId: string; agentName: string; branchName: string; onClose: () => void; onMerged?: () => void; }
type MergeStep = "loading" | "review" | "creating-pr" | "merging" | "done" | "error";
interface DiffData { files: string[]; additions: number; deletions: number; raw: string; }
interface BranchData { pr_number: number | null; pr_url: string | null; base_branch: string; title: string; }

export function MergeReviewDialog({ agentId, agentName, branchName, onClose, onMerged }: MergeReviewDialogProps) {
  const [step, setStep] = useState<MergeStep>("loading");
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [branch, setBranch] = useState<BranchData | null>(null);
  const [error, setError] = useState("");
  const [showRawDiff, setShowRawDiff] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [diffRes, branchRes] = await Promise.all([
          fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}/diff`),
          fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}`),
        ]);
        if (diffRes.ok) setDiff(await diffRes.json() as DiffData);
        if (branchRes.ok) setBranch(await branchRes.json() as BranchData);
        setStep("review");
      } catch { setStep("review"); }
    })();
  }, [agentId, branchName]);

  const handleCreatePR = useCallback(async () => {
    setStep("creating-pr");
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}/pr`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as Record<string, string>).error ?? "Failed to create PR"); }
      const prData = await res.json() as { prNumber: number; prUrl: string };
      setBranch((p) => p ? { ...p, pr_number: prData.prNumber, pr_url: prData.prUrl } : p);
      setStep("review");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); setStep("error"); }
  }, [agentId, branchName]);

  const handleMerge = useCallback(async () => {
    setStep("merging");
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}/merge`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as Record<string, string>).error ?? "Merge failed"); }
      setStep("done"); onMerged?.();
    } catch (err) { setError(err instanceof Error ? err.message : "Merge failed"); setStep("error"); }
  }, [agentId, branchName, onMerged]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-stroke)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--primary)]/10"><GitMerge className="h-4 w-4 text-[var(--primary)]" /></div>
            <div><h2 className="text-sm font-satoshi-bold text-[var(--text-primary)]">Merge Feature</h2><p className="text-[10px] text-[var(--text-tertiary)]">{branchName} → {branch?.base_branch ?? "main"}</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-light)] transition-colors"><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {step === "loading" && <div className="flex items-center justify-center py-8 gap-2"><Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" /><span className="text-xs text-[var(--text-tertiary)]">Loading diff...</span></div>}
          {step === "review" && (
            <>
              {diff && diff.files.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-satoshi-medium text-[var(--text-secondary)]"><FileText className="inline h-3 w-3 mr-1" />{diff.files.length} file{diff.files.length !== 1 ? "s" : ""}</span>
                    <span className="text-green-500 font-mono"><Plus className="inline h-3 w-3" />{diff.additions}</span>
                    <span className="text-red-400 font-mono"><Minus className="inline h-3 w-3" />{diff.deletions}</span>
                  </div>
                  <div className="rounded-xl border border-[var(--border-stroke)] divide-y divide-[var(--border-stroke)]">
                    {diff.files.map((f) => <div key={f} className="flex items-center gap-2 px-3 py-2"><FileText className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" /><span className="text-xs font-mono text-[var(--text-secondary)] truncate">{f}</span></div>)}
                  </div>
                  <button onClick={() => setShowRawDiff((v) => !v)} className="text-[10px] font-satoshi-medium text-[var(--primary)] hover:underline">{showRawDiff ? "Hide" : "Show"} full diff</button>
                  {showRawDiff && diff.raw && <div className="rounded-xl overflow-hidden border border-[var(--border-stroke)]" style={{ background: "#0c0a14" }}><pre className="p-3 text-[10px] font-mono text-white/80 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre">{diff.raw}</pre></div>}
                </div>
              )}
              {branch?.pr_url && branch.pr_number ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--success)]/5 border border-[var(--success)]/20">
                  <GitPullRequest className="h-4 w-4 text-[var(--success)]" />
                  <a href={branch.pr_url} target="_blank" rel="noopener noreferrer" className="text-xs font-satoshi-medium text-[var(--text-primary)] hover:underline flex items-center gap-1">PR #{branch.pr_number} <ExternalLink className="h-3 w-3" /></a>
                </div>
              ) : <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--border-stroke)]"><GitPullRequest className="h-4 w-4 text-[var(--text-tertiary)]" /><span className="text-xs text-[var(--text-secondary)]">No PR created yet</span></div>}
            </>
          )}
          {step === "done" && <div className="flex flex-col items-center py-8 gap-4"><CheckCircle2 className="h-12 w-12 text-[var(--success)]" /><p className="text-lg font-satoshi-bold text-[var(--text-primary)]">Feature merged</p><p className="text-xs text-[var(--text-secondary)]">{branch?.title ?? branchName} is now part of {agentName}</p></div>}
          {step === "error" && <div className="flex flex-col items-center py-6 gap-3"><AlertCircle className="h-8 w-8 text-[var(--error)]" /><p className="text-xs text-[var(--error)] text-center">{error}</p></div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-stroke)] shrink-0">
          {step === "review" && (<><button onClick={onClose} className="px-4 py-2 text-sm font-satoshi-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--color-light)]">Cancel</button>
            {!branch?.pr_number ? <button onClick={handleCreatePR} className="flex items-center gap-2 px-5 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--primary)] hover:opacity-90"><GitPullRequest className="h-3.5 w-3.5" /> Create PR</button>
            : <button onClick={handleMerge} className="flex items-center gap-2 px-5 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--primary)] hover:opacity-90"><GitMerge className="h-3.5 w-3.5" /> Squash & Merge</button>}</>)}
          {step === "error" && <button onClick={() => setStep("review")} className="px-4 py-2 text-sm font-satoshi-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--color-light)]">Try Again</button>}
          {step === "done" && <button onClick={onClose} className="px-5 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--primary)] hover:opacity-90">Done</button>}
        </div>
      </div>
    </div>
  );
}
