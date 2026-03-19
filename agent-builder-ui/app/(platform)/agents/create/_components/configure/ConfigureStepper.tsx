"use client";

import { Check } from "lucide-react";

interface Step {
  label: string;
}

interface ConfigureStepperProps {
  steps: Step[];
  currentStep: number; // 0-based
}

export function ConfigureStepper({ steps, currentStep }: ConfigureStepperProps) {
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-md mx-auto">
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;

        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-satoshi-bold transition-all ${
                  isCompleted
                    ? "bg-[var(--success)] text-white"
                    : isCurrent
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--border-muted)] text-[var(--text-tertiary)]"
                }`}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={`text-xs font-satoshi-medium whitespace-nowrap ${
                  isCompleted
                    ? "text-[var(--success)]"
                    : isCurrent
                    ? "text-[var(--primary)]"
                    : "text-[var(--text-tertiary)]"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className="flex-1 mx-2 mt-[-18px]">
                <div
                  className={`h-[2px] w-full transition-colors ${
                    i < currentStep
                      ? "bg-[var(--success)]"
                      : "bg-[var(--border-muted)]"
                  } ${i < currentStep ? "" : "border-dashed border-t-2 border-[var(--border-muted)] bg-transparent"}`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
