"use client";

import Image from "next/image";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentRuntimeInput } from "@/lib/agents/types";

interface StepRuntimeInputsProps {
  runtimeInputs: AgentRuntimeInput[];
  onContinue: (runtimeInputs: AgentRuntimeInput[]) => void;
  onCancel: () => void;
  onSkip: () => void;
  stepLabel: string;
  onChange?: (runtimeInputs: AgentRuntimeInput[]) => void;
  hideFooter?: boolean;
}

export function StepRuntimeInputs({
  runtimeInputs,
  onContinue,
  onCancel,
  onSkip,
  stepLabel,
  onChange,
  hideFooter = false,
}: StepRuntimeInputsProps) {
  const updateInput = (key: string, value: string) => {
    const nextInputs = runtimeInputs.map((input) =>
      input.key === key ? { ...input, value } : input,
    );
    onChange?.(nextInputs);
  };

  const missingRequiredCount = runtimeInputs.filter(
    (input) => input.required && input.value.trim().length === 0,
  ).length;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          <p className="mb-4 text-xs font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {stepLabel}
          </p>

          <div className="mb-6 flex items-start gap-3">
            <div className="mt-0.5 h-9 w-9 shrink-0">
              <Image src="/assets/logos/favicon.svg" alt="Runtime Inputs" width={36} height={36} />
            </div>
            <div>
              <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
                Runtime Inputs
              </h2>
              <p className="mt-0.5 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                Enter the non-secret values this agent needs at runtime. These persist with the saved agent and block deploy until required fields are filled.
              </p>
            </div>
          </div>

          {runtimeInputs.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] px-5 py-4 text-sm font-satoshi-regular text-[var(--text-secondary)]">
              No runtime inputs are currently required.
            </div>
          ) : (
            <div className="space-y-4">
              {runtimeInputs.map((input) => {
                const filled = input.value.trim().length > 0;
                return (
                  <div
                    key={input.key}
                    className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] px-5 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                          {input.label}
                        </p>
                        <p className="mt-1 text-xs font-satoshi-medium text-[var(--text-tertiary)]">
                          {input.key}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {filled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {filled ? "Provided" : "Missing"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                      {input.description}
                    </p>
                    <input
                      value={input.value}
                      onChange={(event) => updateInput(input.key, event.target.value)}
                      placeholder={input.key}
                      className="mt-3 h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!hideFooter && (
        <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 py-4 md:px-8">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              <p className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                {missingRequiredCount > 0
                  ? `${missingRequiredCount} required runtime input${missingRequiredCount === 1 ? "" : "s"} still missing`
                  : "Runtime inputs ready"}
              </p>
              <Button variant="ghost" onClick={onSkip}>
                Skip
              </Button>
              <Button onClick={() => onContinue(runtimeInputs)} className="gap-2">
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
