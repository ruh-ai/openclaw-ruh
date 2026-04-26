"use client";

/**
 * RequestChangesButton — artifact-targeted feedback.
 *
 * Lets the user ask the architect to revise a specific artifact (PRD,
 * TRD, Plan, or a specific section). Renders as a small ghost button.
 * Clicking it selects the artifact target and leaves the user's actual
 * feedback to be typed in the chat input with the target chip visible.
 */

import { MessageSquarePlus } from "lucide-react";
import type { ArtifactTarget } from "@/lib/openclaw/stage-context";

interface Props {
  target: ArtifactTarget;
  label?: string;
  disabled?: boolean;
  onRequestRevision: (target: ArtifactTarget) => void;
}

export function RequestChangesButton({ target, label = "Ask architect to revise", disabled = false, onRequestRevision }: Props) {
  return (
    <button
      type="button"
      onClick={() => onRequestRevision(target)}
      disabled={disabled}
      className="inline-flex items-center gap-1 text-[11px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--primary)] disabled:opacity-40 transition-colors"
    >
      <MessageSquarePlus className="h-3 w-3" />
      {label}
    </button>
  );
}
