"use client";

import { useMemo } from "react";

/**
 * Creation phases the Architect walks through.
 * The chat content is parsed for signals that indicate phase transitions.
 */
const CREATION_PHASES = [
  { id: "purpose", label: "Purpose", emoji: "🎯" },
  { id: "personality", label: "Soul", emoji: "💜" },
  { id: "skills", label: "Skills", emoji: "⚡" },
  { id: "tools", label: "Tools", emoji: "🔧" },
  { id: "triggers", label: "Triggers", emoji: "🔄" },
  { id: "ready", label: "Ready", emoji: "✨" },
] as const;

type PhaseId = (typeof CREATION_PHASES)[number]["id"];

interface CreationProgressCardProps {
  agentName: string;
  /** The current phase — derived from Architect conversation signals */
  currentPhase: PhaseId;
  /** Whether the agent is fully ready (triggers soul-born animation) */
  isReady: boolean;
}

/**
 * Derive the current creation phase from the builder state / chat messages.
 * Call this from the parent and pass the result as `currentPhase`.
 */
export function deriveCreationPhase(builderState: {
  name?: string | null;
  description?: string | null;
  skillGraph?: unknown[] | null;
  agentRules?: string[];
  triggers?: unknown[];
}): PhaseId {
  if ((builderState.triggers?.length ?? 0) > 0) return "ready";
  if ((builderState.skillGraph?.length ?? 0) > 0 && (builderState.agentRules?.length ?? 0) > 0) return "triggers";
  if ((builderState.skillGraph?.length ?? 0) > 0) return "tools";
  if ((builderState.agentRules?.length ?? 0) > 0) return "skills";
  if (builderState.description) return "personality";
  if (builderState.name) return "purpose";
  return "purpose";
}

export function CreationProgressCard({
  agentName,
  currentPhase,
  isReady,
}: CreationProgressCardProps) {
  const phaseIndex = useMemo(
    () => CREATION_PHASES.findIndex((p) => p.id === currentPhase),
    [currentPhase],
  );

  const completedCount = phaseIndex + 1;
  const totalPhases = CREATION_PHASES.length;
  const progressPct = (completedCount / totalPhases) * 100;

  return (
    <div
      className={[
        "flex items-center gap-3 px-3 py-2 rounded-xl border transition-all",
        isReady
          ? "soul-born border-[var(--primary)]/30 bg-[var(--primary)]/5"
          : "border-[var(--border-stroke)] bg-[var(--card-color)]",
      ].join(" ")}
    >
      {/* Avatar with soul pulse */}
      <div className={isReady ? "soul-pulse-strong" : completedCount > 1 ? "soul-pulse" : ""}>
        <div
          className="rounded-full flex items-center justify-center text-white text-xs font-satoshi-bold shrink-0"
          style={{
            width: "32px",
            height: "32px",
            background: "linear-gradient(135deg, #ae00d0, #7b5aff)",
          }}
        >
          {agentName.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Name + phase */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-satoshi-bold text-[var(--text-primary)] truncate">
          {agentName}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px]">
            {CREATION_PHASES[phaseIndex]?.emoji}
          </span>
          <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)]">
            {isReady ? "Ready to test" : CREATION_PHASES[phaseIndex]?.label}
          </span>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-1 shrink-0">
        {CREATION_PHASES.map((phase, i) => (
          <div
            key={phase.id}
            className="rounded-full transition-all duration-500"
            style={{
              width: i === phaseIndex ? "12px" : "6px",
              height: "6px",
              borderRadius: i === phaseIndex ? "3px" : "50%",
              backgroundColor:
                i <= phaseIndex
                  ? `rgba(174, 0, 208, ${0.3 + (i / totalPhases) * 0.7})`
                  : "rgba(0, 0, 0, 0.06)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
