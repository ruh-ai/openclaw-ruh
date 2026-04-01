/**
 * Compact progress indicator for forge sandbox provisioning.
 * Shows: idle → provisioning (spinner) → ready (green) → failed (red + retry)
 */

"use client";

import { Loader2, CheckCircle2, XCircle, RefreshCw, Globe } from "lucide-react";
import type { ForgeSandboxStatus } from "@/lib/openclaw/builder-state";

interface ForgeProgressProps {
  status: ForgeSandboxStatus;
  error?: string | null;
  onRetry?: () => void;
}

export function ForgeProgress({ status, error, onRetry }: ForgeProgressProps) {
  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-[10px] font-satoshi-bold">
      <Globe className="h-3 w-3 text-[var(--text-tertiary)]" />

      {status === "provisioning" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
          <span className="text-[var(--text-secondary)]">Setting up workspace...</span>
        </>
      )}

      {status === "ready" && (
        <>
          <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
          <span className="text-[var(--success)]">Workspace ready</span>
        </>
      )}

      {status === "failed" && (
        <>
          <XCircle className="h-3 w-3 text-[var(--error)]" />
          <span className="text-[var(--error)]" title={error ?? undefined}>
            Setup failed
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-1 flex items-center gap-0.5 text-[var(--primary)] hover:underline"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Retry
            </button>
          )}
        </>
      )}
    </div>
  );
}
