"use client";
import { GitBranch } from "lucide-react";

export function BranchIndicator({ branchName, baseBranch = "main" }: { branchName: string; baseBranch?: string }) {
  if (branchName === baseBranch) return null;
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--primary)]/8 border border-[var(--primary)]/15">
      <GitBranch className="h-3 w-3 text-[var(--primary)]" />
      <span className="text-[10px] font-mono font-medium text-[var(--primary)]">{branchName}</span>
      <span className="text-[9px] text-[var(--text-tertiary)]">from {baseBranch}</span>
    </div>
  );
}
