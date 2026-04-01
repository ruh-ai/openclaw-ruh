"use client";

import { useState } from "react";
import Image from "next/image";
import { Pencil, Zap, FileText, Link2, MessageSquare, ListChecks, ChevronDown, ChevronRight } from "lucide-react";
import { useWizard } from "./WizardContext";
import { MOCK_TRIGGER_CATEGORIES } from "../configure/mockData";
import { buildSkillMarkdown } from "../../_config/generate-skills";

// Flatten triggers for label lookup
const TRIGGER_MAP = new Map(
  MOCK_TRIGGER_CATEGORIES.flatMap((cat) =>
    cat.triggers.map((t) => [t.id, { title: t.title, code: t.code }])
  )
);

function SummarySection({
  icon: Icon,
  title,
  onEdit,
  children,
}: {
  icon: typeof FileText;
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-2xl px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
          <span className="text-sm font-satoshi-bold text-[var(--text-primary)]">{title}</span>
        </div>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors"
          title={`Edit ${title.toLowerCase()}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

interface PhaseReviewDeployProps {
  onEditPhase: (phase: 0 | 1 | 2 | 3 | 4) => void;
}

export function PhaseReviewDeploy({ onEditPhase }: PhaseReviewDeployProps) {
  const { state } = useWizard();
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const selectedNodes = state.generatedNodes.filter((n) =>
    state.selectedSkillIds.includes(n.skill_id)
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Title */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-9 h-9 shrink-0 mt-0.5">
            <Image src="/assets/logos/favicon.svg" alt="Review" width={36} height={36} />
          </div>
          <div>
            <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
              Review and deploy
            </h2>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
              Everything looks good? Hit deploy to create your agent.
            </p>
          </div>
        </div>

        {/* Agent identity */}
        <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 shrink-0">
              <Image src="/assets/logos/favicon.svg" alt="Agent" width={40} height={40} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-satoshi-bold text-[var(--text-primary)] truncate">
                {state.name || "New Agent"}
              </p>
              <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] line-clamp-2">
                {state.description || "No description"}
              </p>
            </div>
            <button
              onClick={() => onEditPhase(0)}
              className="p-1.5 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          {state.templateId && (
            <span className="inline-block mt-3 px-2.5 py-1 rounded-lg text-xs font-satoshi-medium bg-[var(--primary)]/5 text-[var(--primary)] border border-[var(--primary)]/20">
              Template: {state.templateId.replace(/-/g, " ")}
            </span>
          )}
        </div>

        {/* Skills */}
        <SummarySection icon={FileText} title={`Skills (${selectedNodes.length})`} onEdit={() => onEditPhase(1)}>
          {selectedNodes.length === 0 ? (
            <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
              No skills generated
            </p>
          ) : (
            <div className="space-y-2">
              {selectedNodes.map((node) => {
                const isExpanded = expandedSkill === node.skill_id;
                return (
                  <div key={node.skill_id}>
                    <button
                      onClick={() => setExpandedSkill(isExpanded ? null : node.skill_id)}
                      className="w-full flex items-start gap-2.5 text-left cursor-pointer group"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 mt-0.5 text-[var(--text-tertiary)] shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-[var(--text-tertiary)] shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-satoshi-bold text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors">
                          {node.name}
                        </p>
                        <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] line-clamp-1">
                          {node.description}
                        </p>
                      </div>
                    </button>
                    {isExpanded && (
                      <pre className="mt-2 ml-6 px-3 py-2.5 rounded-lg bg-[var(--background)] border border-[var(--border-default)] text-[10px] font-mono text-[var(--text-tertiary)] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                        {buildSkillMarkdown(node)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SummarySection>

        {/* Tools */}
        <SummarySection icon={Link2} title="Connected Tools" onEdit={() => onEditPhase(2)}>
          {state.connectedToolIds.length === 0 ? (
            <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
              No tools connected
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {state.connectedToolIds.map((id) => (
                <span
                  key={id}
                  className="px-3 py-1.5 rounded-lg text-xs font-satoshi-medium bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20"
                >
                  {id}
                </span>
              ))}
            </div>
          )}
        </SummarySection>

        {/* Behavior */}
        <SummarySection icon={MessageSquare} title="Behavior" onEdit={() => onEditPhase(3)}>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase w-14">Tone</span>
              <span className="text-sm font-satoshi-medium text-[var(--text-secondary)] capitalize">
                {state.tone === "custom" ? (state.customToneDescription || "Custom") : state.tone}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase w-14 mt-0.5">Triggers</span>
              {state.primaryTriggerIds.length === 0 ? (
                <span className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">Manual trigger</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {state.primaryTriggerIds.map((id) => {
                    const trigger = TRIGGER_MAP.get(id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-[var(--background)] border border-[var(--border-default)] text-[var(--text-tertiary)]"
                      >
                        <Zap className="h-2.5 w-2.5" />
                        {trigger?.title ?? id}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </SummarySection>

        {/* Rules */}
        <SummarySection icon={ListChecks} title="Rules" onEdit={() => onEditPhase(3)}>
          {state.rules.length === 0 ? (
            <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
              No rules defined
            </p>
          ) : (
            <ul className="space-y-1.5">
              {state.rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] shrink-0" />
                  {rule}
                </li>
              ))}
            </ul>
          )}
        </SummarySection>
      </div>
    </div>
  );
}
