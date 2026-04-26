"use client";

/**
 * StepDiscovery — shows the architect-generated PRD and TRD documents.
 *
 * The architect analyses the agent description and produces two editable
 * documents: a Product Requirements Document (PRD) and a Technical
 * Requirements Document (TRD). The user reviews, edits, and approves
 * them before the architect starts building.
 *
 * Falls back to the legacy Q&A flow if no documents are available.
 */

import { useState, useCallback } from "react";
import { FileText, Wrench, SkipForward, ChevronRight, RefreshCw, Check } from "lucide-react";
import type { DiscoveryDocuments, DiscoveryQuestion } from "@/lib/openclaw/types";
import type { DiscoveryStatus } from "@/lib/openclaw/copilot-state";
import { RequestChangesButton } from "../copilot/RequestChangesButton";
import { ArtifactActionBar } from "../copilot/ArtifactActionBar";
import type { ArtifactTarget } from "@/lib/openclaw/stage-context";

interface DiscoveryArtifactActions {
  requestChanges: (target: ArtifactTarget) => void;
  regenerate: (target: ArtifactTarget) => void;
  compare: (target: ArtifactTarget) => void;
  explain: (target: ArtifactTarget) => void;
  openFiles: (target: ArtifactTarget) => void;
}

interface StepDiscoveryProps {
  questions: DiscoveryQuestion[] | null;
  answers: Record<string, string | string[]>;
  documents: DiscoveryDocuments | null;
  status: DiscoveryStatus;
  hideFooter?: boolean;
  onAnswer: (questionId: string, answer: string | string[]) => void;
  onDocSectionEdit: (docType: "prd" | "trd", sectionIndex: number, content: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  onRegenerate?: () => void;
  /**
   * Called when the user asks the architect to revise a specific artifact.
   * Parent selects the target and switches chat into revision mode.
   */
  onRequestArtifactChange?: (target: ArtifactTarget) => void;
  artifactActions?: DiscoveryArtifactActions;
}

export function StepDiscovery({
  documents,
  status,
  hideFooter = false,
  onDocSectionEdit,
  onContinue,
  onSkip,
  onRegenerate,
  onRequestArtifactChange,
  artifactActions,
}: StepDiscoveryProps) {
  const [activeTab, setActiveTab] = useState<"prd" | "trd">("prd");
  const activeTarget: ArtifactTarget = activeTab === "prd"
    ? { kind: "prd", path: ".openclaw/discovery/PRD.md" }
    : { kind: "trd", path: ".openclaw/discovery/TRD.md" };

  if (status === "loading") {
    return (
      <div className="p-6 space-y-4">
        <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--primary)]">Preparing requirements documents...</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            The architect is analyzing your agent description and producing a Product Requirements Document (PRD) and Technical Requirements Document (TRD).
          </p>
        </div>
      </div>
    );
  }

  if (status === "idle" && !documents) {
    return (
      <div className="p-6 space-y-4">
        <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--primary)]">Ready to start</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            Send a message in chat to generate requirements, or skip to proceed directly.
          </p>
        </div>
        {!hideFooter && (
          <div className="flex justify-end">
            <button
              onClick={onSkip}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-[var(--border-stroke)] rounded-lg transition-colors"
            >
              <SkipForward className="h-3 w-3" />
              Skip Discovery
            </button>
          </div>
        )}
      </div>
    );
  }

  if (status === "error" || !documents) {
    return (
      <div className="p-6 space-y-4">
        <div className="rounded-xl border border-[var(--warning)]/20 bg-[var(--warning)]/5 px-4 py-3">
          <p className="text-sm font-satoshi-bold text-[var(--warning)]">Discovery skipped</p>
          <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
            The architect will generate skills based on your description.
          </p>
        </div>
        {!hideFooter && (
          <div className="flex justify-end">
            <button
              onClick={onContinue}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
              Continue
            </button>
          </div>
        )}
      </div>
    );
  }

  const activeDoc = documents[activeTab];

  return (
    <div className="flex flex-col h-full">
      {/* Tab header */}
      <div className="shrink-0 px-6 pt-4 pb-0">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--background)] border border-[var(--border-stroke)] w-fit">
          <button
            onClick={() => setActiveTab("prd")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-satoshi-medium transition-all ${
              activeTab === "prd"
                ? "bg-[var(--card-color)] text-[var(--primary)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <FileText className="h-3 w-3" />
            PRD
          </button>
          <button
            onClick={() => setActiveTab("trd")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-satoshi-medium transition-all ${
              activeTab === "trd"
                ? "bg-[var(--card-color)] text-[var(--primary)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <Wrench className="h-3 w-3" />
            TRD
          </button>
        </div>
        <p className="mt-2 text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
          Review and edit the {activeTab === "prd" ? "product" : "technical"} requirements. The architect will build exactly what you approve.
        </p>
      </div>

      {/* Document sections */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {artifactActions ? (
          <ArtifactActionBar
            target={activeTarget}
            canApprove={status === "ready"}
            canRegenerate
            onApprove={onContinue}
            onRequestChanges={artifactActions.requestChanges}
            onRegenerate={(target) => {
              artifactActions.regenerate(target);
              onRegenerate?.();
            }}
            onCompare={artifactActions.compare}
            onExplain={artifactActions.explain}
            onOpenFiles={artifactActions.openFiles}
          />
        ) : onRequestArtifactChange ? (
          <div className="flex justify-end">
            <RequestChangesButton
              target={activeTarget}
              label={`Ask architect to revise ${activeTab.toUpperCase()}`}
              onRequestRevision={onRequestArtifactChange}
            />
          </div>
        ) : null}
        {activeDoc.sections.map((section, idx) => (
          <div key={`${activeTab}-${idx}`} className="space-y-1">
            <DocSectionCard
              heading={section.heading}
              content={section.content}
              onChange={(content) => onDocSectionEdit(activeTab, idx, content)}
            />
            {onRequestArtifactChange && (
              <div className="pl-2">
                <RequestChangesButton
                  target={{ ...activeTarget, section: section.heading }}
                  onRequestRevision={onRequestArtifactChange}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {!hideFooter && (
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <SkipForward className="h-3 w-3" />
              Skip
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-[var(--border-stroke)] rounded-lg transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </button>
            )}
          </div>
          <button
            onClick={onContinue}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
          >
            <Check className="h-3 w-3" />
            Let&apos;s Plan
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Document Section Card ──────────────────────────────────────────────────

function DocSectionCard({
  heading,
  content,
  onChange,
}: {
  heading: string;
  content: string;
  onChange: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  const save = useCallback(() => {
    onChange(draft);
    setEditing(false);
  }, [draft, onChange]);

  const cancel = useCallback(() => {
    setDraft(content);
    setEditing(false);
  }, [content]);

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-default)] bg-[var(--card-color)]">
        <p className="text-xs font-satoshi-bold text-[var(--text-primary)]">{heading}</p>
        {!editing ? (
          <button
            onClick={() => { setDraft(content); setEditing(true); }}
            className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button onClick={cancel} className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors">
              Cancel
            </button>
            <button onClick={save} className="text-[10px] font-satoshi-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors">
              Save
            </button>
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(3, draft.split("\n").length + 1)}
            className="w-full text-xs font-satoshi-regular text-[var(--text-primary)] leading-relaxed bg-transparent outline-none resize-none"
            autoFocus
          />
        ) : (
          <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
            {content || <span className="italic text-[var(--text-tertiary)]">No content yet</span>}
          </p>
        )}
      </div>
    </div>
  );
}
