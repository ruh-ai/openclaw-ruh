"use client";

/**
 * StepConfigureChannels — lets users declare which communication channels
 * the agent should be accessible through.
 *
 * This is intent-only — no credentials are entered during agent creation.
 * Actual channel connection happens post-deploy in the agent setup flow.
 */

import { useCallback, useMemo, useState } from "react";
import { MessageCircle, Hash, Headphones, Check } from "lucide-react";
import type { AgentChannelKind, AgentChannelSelection } from "@/lib/agents/types";
import {
  getChannelCatalog,
  buildChannelSelections,
  detectSuggestedChannels,
  type ChannelCatalogEntry,
} from "./channel-catalog";

const CHANNEL_ICONS: Record<AgentChannelKind, typeof MessageCircle> = {
  telegram: MessageCircle,
  slack: Hash,
  discord: Headphones,
};

interface StepConfigureChannelsProps {
  initialSelected?: AgentChannelSelection[];
  discoveryAnswers?: Record<string, string | string[]>;
  hideFooter?: boolean;
  onSelectionChange?: (channels: AgentChannelSelection[]) => void;
  onContinue?: (channels: AgentChannelSelection[]) => void;
  onCancel?: () => void;
  onSkip?: () => void;
  stepLabel?: string;
}

export function StepConfigureChannels({
  initialSelected = [],
  discoveryAnswers,
  hideFooter = false,
  onSelectionChange,
  onContinue,
  onCancel,
  onSkip,
}: StepConfigureChannelsProps) {
  const catalog = useMemo(() => getChannelCatalog(), []);

  const suggestedKinds = useMemo(() => {
    if (discoveryAnswers) {
      return new Set(detectSuggestedChannels(discoveryAnswers));
    }
    return new Set<AgentChannelKind>();
  }, [discoveryAnswers]);

  const [selectedKinds, setSelectedKinds] = useState<Set<AgentChannelKind>>(() => {
    if (initialSelected.length > 0) {
      return new Set(initialSelected.map((ch) => ch.kind));
    }
    return new Set(suggestedKinds);
  });

  const handleToggle = useCallback(
    (kind: AgentChannelKind) => {
      setSelectedKinds((prev) => {
        const next = new Set(prev);
        if (next.has(kind)) {
          next.delete(kind);
        } else {
          next.add(kind);
        }
        const selections = buildChannelSelections(next);
        onSelectionChange?.(selections);
        return next;
      });
    },
    [onSelectionChange],
  );

  const handleContinue = useCallback(() => {
    const selections = buildChannelSelections(selectedKinds);
    onContinue?.(selections);
  }, [onContinue, selectedKinds]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">
          Communication Channels
        </h3>
        <p className="text-xs text-[var(--text-tertiary)]">
          Select how users will interact with this agent. Channel credentials are configured after deployment — just declare intent here.
        </p>
      </div>

      <div className="space-y-3">
        {catalog.map((entry) => (
          <ChannelCard
            key={entry.kind}
            entry={entry}
            selected={selectedKinds.has(entry.kind)}
            suggested={suggestedKinds.has(entry.kind)}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {selectedKinds.size === 0 && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3">
          <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
            No channels selected. The agent will be accessible through web chat only.
            You can add channels later in the agent setup.
          </p>
        </div>
      )}

      {!hideFooter && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] rounded-lg hover:bg-[var(--color-light)] transition-colors"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-3 py-1.5 text-xs font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleContinue}
              className="px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Channel Card ────────────────────────────────────────────────────────────

function ChannelCard({
  entry,
  selected,
  suggested,
  onToggle,
}: {
  entry: ChannelCatalogEntry;
  selected: boolean;
  suggested: boolean;
  onToggle: (kind: AgentChannelKind) => void;
}) {
  const Icon = CHANNEL_ICONS[entry.kind];
  const isUnsupported = entry.status === "unsupported";

  return (
    <button
      onClick={() => onToggle(entry.kind)}
      disabled={isUnsupported}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
        selected
          ? "border-[var(--primary)] bg-[var(--primary)]/5"
          : isUnsupported
          ? "border-[var(--border-default)] bg-[var(--background)] opacity-50 cursor-not-allowed"
          : "border-[var(--border-default)] bg-[var(--background)] hover:border-[var(--primary)]/30"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center justify-center h-8 w-8 rounded-lg ${
              selected ? "bg-[var(--primary)]/15" : "bg-[var(--color-light)]"
            }`}
          >
            <Icon className={`h-4 w-4 ${selected ? "text-[var(--primary)]" : "text-[var(--text-tertiary)]"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{entry.label}</p>
              {suggested && !selected && (
                <span className="px-1.5 py-0.5 text-[9px] font-satoshi-bold uppercase tracking-wider text-[var(--primary)] bg-[var(--primary)]/10 rounded">
                  Suggested
                </span>
              )}
            </div>
            <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
              {entry.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)]">
            {entry.availabilityLabel}
          </span>
          {selected && (
            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-[var(--primary)]">
              <Check className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
