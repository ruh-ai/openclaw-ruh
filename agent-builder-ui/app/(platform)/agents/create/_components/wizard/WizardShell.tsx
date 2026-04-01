"use client";

import { useState } from "react";
import { ChevronLeft, ArrowRight, Rocket, Loader2, Hammer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfigureStepper } from "../configure/ConfigureStepper";
import { WizardProvider, useWizard, type WizardOutput } from "./WizardContext";
import { buildSkillMarkdown } from "../../_config/generate-skills";
import { PhasePurpose } from "./PhasePurpose";
import { PhaseSkills } from "./PhaseSkills";
import { PhaseTools } from "./PhaseTools";
import { PhaseBehavior } from "./PhaseBehavior";
import { PhaseReviewDeploy } from "./PhaseReviewDeploy";

const STEPS = [
  { label: "Purpose" },
  { label: "Skills" },
  { label: "Tools" },
  { label: "Behavior" },
  { label: "Review" },
];

const PHASE_TOASTS = [
  "Purpose defined",
  null, // skills toast is dynamic
  "Tools configured",
  "Behavior set",
  null, // deploy toast handled separately
];

interface WizardShellProps {
  onComplete: (output: WizardOutput) => Promise<void>;
  onCancel: () => void;
}

function WizardShellInner({ onComplete, onCancel }: WizardShellProps) {
  const { state, setPhase, nextPhase, prevPhase, markSkillsBuilt, toOutput } = useWizard();
  const [isDeploying, setIsDeploying] = useState(false);
  const [isBuildingSkills, setIsBuildingSkills] = useState(false);

  const canContinue = () => {
    switch (state.currentPhase) {
      case 0: return state.name.trim().length > 0;
      case 1: return true; // skills are optional
      case 2: return true; // tools are optional
      case 3: return true; // behavior has defaults
      case 4: return state.name.trim().length > 0;
      default: return true;
    }
  };

  const handleContinue = () => {
    if (state.currentPhase === 4) {
      handleDeploy();
      return;
    }
    // Fire phase-specific toast
    const toastMsg = PHASE_TOASTS[state.currentPhase];
    if (toastMsg) {
      toast.success(toastMsg);
    } else if (state.currentPhase === 1) {
      const n = state.selectedSkillIds.length;
      toast.success(n > 0 ? `${n} skill${n !== 1 ? "s" : ""} selected` : "Skills skipped");
    }
    nextPhase();
  };

  const handleSkip = () => {
    nextPhase();
  };

  const handleBack = () => {
    if (state.currentPhase === 0) {
      onCancel();
    } else {
      prevPhase();
    }
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      const output = toOutput();
      await onComplete(output);
      toast.success("Agent created!");
    } catch {
      toast.error("Failed to create agent");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleBuildAndContinue = () => {
    setIsBuildingSkills(true);
    try {
      const targetIds = new Set(
        state.selectedSkillIds.length > 0
          ? state.selectedSkillIds
          : state.generatedNodes.map((n) => n.skill_id),
      );
      // Generate real SKILL.md content for each selected skill
      const builtSkills = state.generatedNodes
        .filter((node) => targetIds.has(node.skill_id))
        .map((node) => ({
          skillId: node.skill_id,
          skill_md: buildSkillMarkdown(node),
        }));
      markSkillsBuilt(builtSkills);
      toast.success(`${builtSkills.length} skill${builtSkills.length !== 1 ? "s" : ""} built`);
      nextPhase();
    } finally {
      setIsBuildingSkills(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border-default)] bg-[var(--card-color)] px-6 md:px-8 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={handleBack}
            className="p-1.5 rounded-lg border border-[var(--border-stroke)] hover:bg-[var(--color-light)] transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
          <h1 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
            {state.name || "Create New Agent"}
          </h1>
        </div>
        <ConfigureStepper steps={STEPS} currentStep={state.currentPhase} />
      </div>

      {/* Phase content */}
      {state.currentPhase === 0 && <PhasePurpose />}
      {state.currentPhase === 1 && <PhaseSkills />}
      {state.currentPhase === 2 && <PhaseTools />}
      {state.currentPhase === 3 && <PhaseBehavior />}
      {state.currentPhase === 4 && <PhaseReviewDeploy onEditPhase={setPhase} />}

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 md:px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button variant="tertiary" className="h-10 px-6" onClick={onCancel}>
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            {state.currentPhase > 0 && state.currentPhase < 4 && (
              <Button variant="tertiary" className="h-10 px-5" onClick={handleSkip}>
                Skip
              </Button>
            )}
            {/* Build & Continue — only on Skills phase when skills exist */}
            {state.currentPhase === 1 && state.generatedNodes.length > 0 && (
              <Button
                variant="primary"
                className="h-10 px-6 gap-1.5"
                disabled={isBuildingSkills}
                onClick={handleBuildAndContinue}
              >
                {isBuildingSkills ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building...
                  </>
                ) : (
                  <>
                    <Hammer className="h-4 w-4" />
                    Build & Continue
                  </>
                )}
              </Button>
            )}
            <Button
              variant={state.currentPhase === 1 && state.generatedNodes.length > 0 ? "tertiary" : "primary"}
              className="h-10 px-6 gap-1.5"
              disabled={!canContinue() || isDeploying}
              onClick={handleContinue}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : state.currentPhase === 4 ? (
                <>
                  <Rocket className="h-4 w-4" />
                  Deploy Agent
                </>
              ) : (
                <>
                  Continue <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WizardShell(props: WizardShellProps) {
  return (
    <WizardProvider>
      <WizardShellInner {...props} />
    </WizardProvider>
  );
}
