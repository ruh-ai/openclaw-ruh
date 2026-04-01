"use client";

import { useState, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import { ConfigureStepper } from "./ConfigureStepper";
import { StepConnectTools } from "./StepConnectTools";
import { StepRuntimeInputs } from "./StepRuntimeInputs";
import { StepChooseSkills } from "./StepChooseSkills";
import { StepSetTriggers } from "./StepSetTriggers";
import type { SkillGraphNode } from "@/lib/openclaw/types";
import type { CreateSessionConfigState } from "../../create-session-config";

const STEPS = [
  { label: "Connect Tools" },
  { label: "Runtime Inputs" },
  { label: "Choose Skills" },
  { label: "Set Triggers" },
];

export interface ConfigureOutput {
  toolConnections: CreateSessionConfigState["toolConnections"];
  credentialDrafts: CreateSessionConfigState["credentialDrafts"];
  runtimeInputs: CreateSessionConfigState["runtimeInputs"];
  selectedSkills: string[];
  triggers: CreateSessionConfigState["triggers"];
}

interface ConfigureAgentProps {
  agentId?: string | null;
  agentName: string;
  agentDescription?: string;
  onBack: () => void;
  onComplete: (output: ConfigureOutput) => void;
  onCancel: () => void;
  value: CreateSessionConfigState;
  onChange: (next: CreateSessionConfigState) => void;
  skillGraph?: SkillGraphNode[] | null;
  agentRules?: string[];
}

export function ConfigureAgent({
  agentId,
  agentName,
  agentDescription,
  onBack,
  onComplete,
  onCancel,
  value,
  onChange,
  skillGraph,
  agentRules,
}: ConfigureAgentProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleToolsContinue = useCallback((toolConnections: CreateSessionConfigState["toolConnections"]) => {
    onChange({ ...value, toolConnections, toolConnectionsTouched: true });
    setCurrentStep(1);
  }, [onChange, value]);

  const handleRuntimeInputsContinue = useCallback((runtimeInputs: CreateSessionConfigState["runtimeInputs"]) => {
    onChange({ ...value, runtimeInputs, runtimeInputsTouched: true });
    setCurrentStep(2);
  }, [onChange, value]);

  const handleSkillsContinue = useCallback((skills: string[]) => {
    onChange({ ...value, selectedSkills: skills });
    setCurrentStep(3);
  }, [onChange, value]);

  const handleTriggersContinue = useCallback((triggers: CreateSessionConfigState["triggers"]) => {
    const nextValue = { ...value, triggers, triggersTouched: true };
    onChange(nextValue);
    onComplete(nextValue);
  }, [onChange, onComplete, value]);

  const handleSkip = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onComplete(value);
    }
  };

  const stepLabel = `Step ${currentStep + 1} of ${STEPS.length}`;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border-default)] bg-[var(--card-color)] px-6 md:px-8 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={currentStep === 0 ? onBack : () => setCurrentStep((s) => s - 1)}
            className="p-1.5 rounded-lg border border-[var(--border-stroke)] hover:bg-[var(--color-light)] transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
          <h1 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
            {agentName}
          </h1>
        </div>

        {/* Stepper */}
        <ConfigureStepper steps={STEPS} currentStep={currentStep} />
      </div>

      {/* Step content */}
      {currentStep === 0 && (
        <StepConnectTools
          onContinue={handleToolsContinue}
          onCancel={onCancel}
          onSkip={handleSkip}
          stepLabel={stepLabel}
          agentId={agentId ?? null}
          agentUseCase={agentDescription}
          skillGraph={skillGraph}
          initialConnected={value.toolConnections}
          initialCredentialDrafts={value.credentialDrafts}
          onConnectionChange={(toolConnections) => onChange({ ...value, toolConnections, toolConnectionsTouched: true })}
          onCredentialDraftChange={(credentialDrafts) => onChange({ ...value, credentialDrafts })}
        />
      )}
      {currentStep === 1 && (
        <StepRuntimeInputs
          runtimeInputs={value.runtimeInputs}
          onContinue={handleRuntimeInputsContinue}
          onCancel={onCancel}
          onSkip={handleSkip}
          stepLabel={stepLabel}
          onChange={(runtimeInputs) => onChange({ ...value, runtimeInputs, runtimeInputsTouched: true })}
        />
      )}
      {currentStep === 2 && (
        <StepChooseSkills
          onContinue={handleSkillsContinue}
          onCancel={onCancel}
          onSkip={handleSkip}
          stepLabel={stepLabel}
          skillGraph={skillGraph}
          initialSelected={value.selectedSkills}
          onSelectionChange={(selectedSkills) => onChange({ ...value, selectedSkills })}
        />
      )}
      {currentStep === 3 && (
        <StepSetTriggers
          onContinue={handleTriggersContinue}
          onCancel={onCancel}
          onSkip={handleSkip}
          stepLabel={stepLabel}
          agentRules={agentRules}
          initialSelected={value.triggers}
          onSelectionChange={(triggers) => onChange({ ...value, triggers, triggersTouched: true })}
        />
      )}
    </div>
  );
}
