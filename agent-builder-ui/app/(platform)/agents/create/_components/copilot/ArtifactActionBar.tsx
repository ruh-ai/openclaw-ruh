"use client";

import {
  CheckCircle2,
  GitCompareArrows,
  MessageSquarePlus,
  RefreshCw,
  Search,
  FolderOpen,
} from "lucide-react";
import type { ArtifactTarget } from "@/lib/openclaw/stage-context";

interface ArtifactActionBarProps {
  target: ArtifactTarget;
  canApprove: boolean;
  canRegenerate: boolean;
  onApprove: () => void;
  onRequestChanges: (target: ArtifactTarget) => void;
  onRegenerate: (target: ArtifactTarget) => void;
  onCompare: (target: ArtifactTarget) => void;
  onExplain: (target: ArtifactTarget) => void;
  onOpenFiles?: (target: ArtifactTarget) => void;
}

function artifactLabel(target: ArtifactTarget): string {
  if (target.section) return `${target.kind.replace(/_/g, " ")} / ${target.section}`;
  return target.kind.replace(/_/g, " ");
}

export function ArtifactActionBar({
  target,
  canApprove,
  canRegenerate,
  onApprove,
  onRequestChanges,
  onRegenerate,
  onCompare,
  onExplain,
  onOpenFiles,
}: ArtifactActionBarProps) {
  const targetLabel = artifactLabel(target);

  const secondaryButtonClass =
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--card-color)] px-2.5 text-[11px] font-satoshi-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--background)] px-3 py-2"
      aria-label={`${targetLabel} actions`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-satoshi-medium uppercase text-[var(--text-tertiary)]">
          Artifact
        </p>
        <p className="truncate text-xs font-satoshi-bold capitalize text-[var(--text-primary)]">
          {targetLabel}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onApprove}
          disabled={!canApprove}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 text-[11px] font-satoshi-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Approve
        </button>
        <button
          type="button"
          onClick={() => onRequestChanges(target)}
          className={secondaryButtonClass}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Request Changes
        </button>
        <button
          type="button"
          onClick={() => onRegenerate(target)}
          disabled={!canRegenerate}
          className={secondaryButtonClass}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </button>
        <button type="button" onClick={() => onCompare(target)} className={secondaryButtonClass}>
          <GitCompareArrows className="h-3.5 w-3.5" />
          Compare Changes
        </button>
        <button type="button" onClick={() => onExplain(target)} className={secondaryButtonClass}>
          <Search className="h-3.5 w-3.5" />
          Explain
        </button>
        <button
          type="button"
          onClick={() => onOpenFiles?.(target)}
          disabled={!onOpenFiles}
          className={secondaryButtonClass}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open Files
        </button>
      </div>
    </div>
  );
}
