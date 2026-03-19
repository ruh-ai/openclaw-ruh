"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { ConfigureStepper } from "./ConfigureStepper";
import { StepConnectTools } from "./StepConnectTools";
import { StepChooseSkills } from "./StepChooseSkills";
import { StepSetTriggers } from "./StepSetTriggers";

const STEPS = [
  { label: "Connect Tools" },
  { label: "Choose Skills" },
  { label: "Set Triggers" },
];

interface ConfigureAgentProps {
  agentName: string;
  onBack: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

export function ConfigureAgent({
  agentName,
  onBack,
  onComplete,
  onCancel,
}: ConfigureAgentProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleContinue = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    handleContinue();
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
          onContinue={handleContinue}
          onCancel={onCancel}
          onSkip={handleSkip}
          stepLabel={stepLabel}
        />
      )}
      {currentStep === 1 && (
        <StepChooseSkills
          onContinue={handleContinue}
          onCancel={onCancel}
          onSkip={handleSkip}
          stepLabel={stepLabel}
        />
      )}
      {currentStep === 2 && (
        <StepSetTriggers
          onContinue={handleContinue}
          onCancel={onCancel}
          stepLabel={stepLabel}
        />
      )}
    </div>
  );
}
