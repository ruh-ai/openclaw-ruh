"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FileText, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_SKILLS } from "./mockData";
import { SkillDetailPanel } from "./SkillDetailPanel";
import type { SkillItem } from "./types";
import { buildSkillMarkdown } from "../../_config/generate-skills";
import type { SkillAvailability } from "@/lib/skills/skill-registry";
import type { SkillGraphNode } from "@/lib/openclaw/types";

interface StepChooseSkillsProps {
  onContinue: (selectedSkillIds: string[]) => void;
  onCancel: () => void;
  onSkip: () => void;
  stepLabel: string;
  skillGraph?: SkillGraphNode[] | null;
  skillAvailability?: SkillAvailability[];
  /** Hide the built-in footer (Back/Skip/Continue). Used when the wizard shell provides its own footer. */
  hideFooter?: boolean;
  /** Override the default initial selection. */
  initialSelected?: string[];
  /** Live callback fired on every selection change (for parent state tracking). */
  onSelectionChange?: (ids: string[]) => void;
  onBuildSkill?: (skillId: string) => void;
}

function availabilityMeta(skill: SkillItem): {
  badge: string;
  badgeClassName: string;
  cardClassName: string;
} {
  switch (skill.availabilityStatus) {
    case "native":
      return {
        badge: "Native",
        badgeClassName: "bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20",
        cardClassName: "",
      };
    case "registry_match":
      return {
        badge: "Registry",
        badgeClassName: "bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20",
        cardClassName: "",
      };
    case "custom_built":
      return {
        badge: "Custom Built",
        badgeClassName: "bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20",
        cardClassName: "",
      };
    case "needs_build":
      return {
        badge: "Needs Build",
        badgeClassName: "bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20",
        cardClassName: "bg-[var(--warning)]/5",
      };
    default:
      return {
        badge: "Suggested",
        badgeClassName: "bg-[var(--background)] text-[var(--text-tertiary)] border border-[var(--border-default)]",
        cardClassName: "",
      };
  }
}

export function StepChooseSkills({
  onContinue,
  onCancel,
  onSkip,
  stepLabel,
  skillGraph,
  skillAvailability,
  hideFooter,
  initialSelected,
  onSelectionChange,
  onBuildSkill,
}: StepChooseSkillsProps) {
  const availabilityBySkillId = useMemo(
    () => new Map((skillAvailability ?? []).map((entry) => [entry.skillId, entry])),
    [skillAvailability],
  );

  const skills: SkillItem[] = useMemo(
    () => (skillGraph && skillGraph.length > 0
      ? skillGraph.map((node) => {
          const availability = availabilityBySkillId.get(node.skill_id);
          return {
            id: node.skill_id,
            name: node.name || node.skill_id,
            description: node.description || node.source,
            isNew: node.status === "generating" || node.status === "generated",
            markdownContent: buildSkillMarkdown(node),
            availabilityStatus: availability?.status,
            availabilityReason: availability?.reason,
            matchedSkillId: availability?.matchedSkillId,
          };
        })
      : MOCK_SKILLS),
    [availabilityBySkillId, skillGraph],
  );

  const skillIdsKey = useMemo(
    () => skills.map((skill) => skill.id).join("|"),
    [skills],
  );
  const initialSelectedKey = useMemo(
    () => (initialSelected ?? []).join("|"),
    [initialSelected],
  );

  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelected ?? skills.map((s) => s.id))
  );
  const [viewingSkill, setViewingSkill] = useState<SkillItem | null>(null);

  useEffect(() => {
    setSelected(new Set(initialSelected ?? skills.map((skill) => skill.id)));
  }, [initialSelectedKey, skillIdsKey, initialSelected, skills]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange?.(Array.from(next));
      return next;
    });
  };

  const unresolvedSelectedCount = useMemo(
    () =>
      Array.from(selected).filter((skillId) => availabilityBySkillId.get(skillId)?.status === "needs_build").length,
    [availabilityBySkillId, selected],
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Step label */}
          <p className="text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
            {stepLabel}
          </p>

          {/* Title area */}
          <div className="flex items-start gap-3 mb-6">
            <div className="w-9 h-9 shrink-0 mt-0.5">
              <Image
                src="/assets/logos/favicon.svg"
                alt="Configure"
                width={36}
                height={36}
              />
            </div>
            <div>
              <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
                Choose Skills
              </h2>
              <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
                Skills define what your agent can do using the connected tools.
              </p>
            </div>
          </div>

          {/* Skill cards */}
          <div className="space-y-3">
            {skills.map((skill) => {
              const isSelected = selected.has(skill.id);
              const availability = availabilityMeta(skill);
              return (
                <div
                  key={skill.id}
                  className={`flex items-center gap-4 bg-[var(--card-color)] border-2 rounded-xl px-5 py-4 transition-all ${availability.cardClassName} ${
                    isSelected
                      ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)]"
                      : "border-[var(--border-stroke)] hover:border-[var(--border-default)]"
                  }`}
                >
                  {/* Clickable row area — selects the skill */}
                  <button
                    onClick={() => toggleSelect(skill.id)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-[var(--primary)]/5 border-[var(--primary)]/30"
                          : "bg-[var(--background)] border-[var(--border-default)]"
                      }`}
                    >
                      <FileText
                        className={`h-4 w-4 ${
                          isSelected ? "text-[var(--primary)]" : "text-[var(--text-tertiary)]"
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm font-satoshi-bold ${
                            isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
                          }`}
                        >
                          {skill.name}
                        </p>
                        {skill.isNew && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-satoshi-bold bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20">
                            New
                          </span>
                        )}
                        {skill.availabilityStatus && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-satoshi-bold ${availability.badgeClassName}`}>
                            {availability.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                        {skill.description}
                      </p>
                      {skill.availabilityReason && (
                        <p className="mt-1 text-[11px] font-satoshi-medium text-[var(--text-tertiary)]">
                          {skill.availabilityReason}
                          {skill.matchedSkillId ? ` (${skill.matchedSkillId})` : ""}
                        </p>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {skill.availabilityStatus === "needs_build" && (
                      <button
                        onClick={() => {
                          onBuildSkill?.(skill.id);
                          setViewingSkill(skill);
                        }}
                        className="rounded-lg border border-[var(--warning)]/20 bg-[var(--warning)]/10 px-2.5 py-1.5 text-[11px] font-satoshi-bold text-[var(--warning)] transition-colors hover:bg-[var(--warning)]/15"
                      >
                        Build Custom Skill
                      </button>
                    )}
                    <button
                      onClick={() => setViewingSkill(skill)}
                      className="p-2 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                      title="View skill details"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selection summary */}
          {selected.size > 0 && (
            <p className="mt-4 text-sm font-satoshi-medium text-[var(--text-secondary)]">
              {selected.size} skill{selected.size > 1 ? "s" : ""} selected
            </p>
          )}

          {unresolvedSelectedCount > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning)]/10 px-4 py-3">
              <p className="text-sm font-satoshi-bold text-[var(--warning)]">
                {unresolvedSelectedCount} selected skill{unresolvedSelectedCount > 1 ? "s" : ""} still need{unresolvedSelectedCount === 1 ? "s" : ""} a custom build before deploy.
              </p>
              <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
                You can keep configuring tools and triggers, but deploy stays blocked until those skills are built or deselected.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {!hideFooter && (
        <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 md:px-8 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Button variant="tertiary" className="h-10 px-6" onClick={onCancel}>
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              <Button variant="tertiary" className="h-10 px-5" onClick={onSkip}>
                Skip this step
              </Button>
              <Button
                variant="primary"
                className="h-10 px-6 gap-1.5"
                onClick={() => onContinue(Array.from(selected))}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {viewingSkill && viewingSkill.markdownContent && (
        <SkillDetailPanel
          skillName={viewingSkill.name}
          markdownContent={viewingSkill.markdownContent}
          onClose={() => setViewingSkill(null)}
        />
      )}
    </>
  );
}
