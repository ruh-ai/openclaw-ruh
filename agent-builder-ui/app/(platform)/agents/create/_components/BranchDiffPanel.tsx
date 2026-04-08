"use client";
import { useState, useEffect } from "react";
import { GitBranch, GitPullRequest, ExternalLink, FileText, Plus, Minus, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface DiffData { files: string[]; additions: number; deletions: number; raw: string; }
interface BranchData { pr_number: number | null; pr_url: string | null; base_branch: string; title: string; }

export function BranchDiffPanel({ agentId, branchName }: { agentId: string; branchName: string }) {
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [branch, setBranch] = useState<BranchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [diffRes, branchRes] = await Promise.all([
          fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}/diff`),
          fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/branches/${encodeURIComponent(branchName)}`),
        ]);
        if (diffRes.ok) setDiff(await diffRes.json() as DiffData);
        if (branchRes.ok) setBranch(await branchRes.json() as BranchData);
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, [agentId, branchName]);

  if (loading) return <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 px-4 py-3"><div className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" /><span className="text-xs text-[var(--text-tertiary)]">Loading diff...</span></div></div>;

  return (
    <div className="rounded-xl border border-[var(--primary)]/15 bg-[var(--primary)]/3 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span className="text-xs font-satoshi-bold text-[var(--text-primary)]">{branch?.title ?? branchName}</span>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{branchName} → {branch?.base_branch ?? "main"}</span>
        </div>
        {branch?.pr_url && branch.pr_number && (
          <a href={branch.pr_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-satoshi-medium text-[var(--success)] hover:underline">
            <GitPullRequest className="h-3 w-3" /> PR #{branch.pr_number} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      {diff && diff.files.length > 0 && (
        <>
          <div className="px-4 pb-3 flex items-center gap-4">
            <span className="text-[10px] font-satoshi-medium text-[var(--text-secondary)]"><FileText className="inline h-3 w-3 mr-0.5" />{diff.files.length} file{diff.files.length !== 1 ? "s" : ""}</span>
            <span className="text-[10px] font-mono text-green-500"><Plus className="inline h-3 w-3" />{diff.additions}</span>
            <span className="text-[10px] font-mono text-red-400"><Minus className="inline h-3 w-3" />{diff.deletions}</span>
          </div>
          <div className="border-t border-[var(--primary)]/10">
            <button onClick={() => setShowDiff((v) => !v)} className="w-full px-4 py-2 flex items-center gap-1.5 text-[10px] font-satoshi-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              {showDiff ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {showDiff ? "Hide" : "Show"} changed files
            </button>
            {showDiff && <div className="px-4 pb-3 space-y-1">{diff.files.map((file) => <div key={file} className="flex items-center gap-2 py-1"><FileText className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" /><span className="text-[10px] font-mono text-[var(--text-secondary)] truncate">{file}</span></div>)}</div>}
          </div>
        </>
      )}
      {diff && diff.files.length === 0 && <div className="px-4 pb-3"><p className="text-[10px] text-[var(--text-tertiary)]">No changes yet on this branch.</p></div>}
    </div>
  );
}
