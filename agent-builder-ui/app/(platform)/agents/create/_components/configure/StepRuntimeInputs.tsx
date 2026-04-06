"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Key,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentRuntimeInput, AgentRuntimePopulationStrategy } from "@/lib/agents/types";

interface StepRuntimeInputsProps {
  runtimeInputs: AgentRuntimeInput[];
  onContinue: (runtimeInputs: AgentRuntimeInput[]) => void;
  onCancel: () => void;
  onSkip: () => void;
  stepLabel: string;
  onChange?: (runtimeInputs: AgentRuntimeInput[]) => void;
  hideFooter?: boolean;
}

function getStrategy(input: AgentRuntimeInput): AgentRuntimePopulationStrategy {
  return input.populationStrategy ?? "user_required";
}

function isEffectivelyFilled(input: AgentRuntimeInput): boolean {
  return (input.value?.trim().length ?? 0) > 0 || (input.defaultValue?.trim().length ?? 0) > 0;
}

function RuntimeInputField({
  input,
  onChange,
}: {
  input: AgentRuntimeInput;
  onChange: (value: string) => void;
}) {
  const effectiveValue = input.value || input.defaultValue || "";

  if (input.inputType === "boolean") {
    const isOn = effectiveValue === "true" || effectiveValue === "1" || effectiveValue === "yes";
    return (
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs font-satoshi-regular text-[var(--text-secondary)]">
          {isOn ? "Enabled" : "Disabled"}
        </span>
        <button
          type="button"
          onClick={() => onChange(isOn ? "false" : "true")}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            isOn ? "bg-[var(--primary)]" : "bg-[var(--border-stroke)]"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              isOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    );
  }

  if (input.inputType === "select" && input.options?.length) {
    return (
      <div className="relative mt-3">
        <select
          value={input.value || input.defaultValue || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 pr-8 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus-breathe"
        >
          {!input.value && !input.defaultValue && (
            <option value="">Select...</option>
          )}
          {input.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
      </div>
    );
  }

  if (input.inputType === "number") {
    return (
      <input
        type="number"
        value={input.value || input.defaultValue || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={input.example || input.key}
        className="mt-3 h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus-breathe"
      />
    );
  }

  return (
    <input
      type="text"
      value={input.value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={input.example || input.defaultValue || input.key}
      className="mt-3 h-11 w-full rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] px-3 text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus-breathe"
    />
  );
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const updateInput = (key: string, value: string) => {
    const nextInputs = runtimeInputs.map((input) =>
      input.key === key ? { ...input, value } : input,
    );
    onChange?.(nextInputs);
  };

  const { userRequired, autoConfigured } = useMemo(() => {
    const userRequired: AgentRuntimeInput[] = [];
    const autoConfigured: AgentRuntimeInput[] = [];
    for (const input of runtimeInputs) {
      if (getStrategy(input) === "user_required") {
        userRequired.push(input);
      } else {
        autoConfigured.push(input);
      }
    }
    return { userRequired, autoConfigured };
  }, [runtimeInputs]);

  const missingRequiredCount = userRequired.filter(
    (input) => input.required && !input.value?.trim() && !(input.defaultValue?.trim()),
  ).length;

  const autoFilledCount = autoConfigured.filter((i) => isEffectivelyFilled(i)).length;

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
                Runtime Configuration
              </h2>
              <p className="mt-0.5 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                {userRequired.length > 0
                  ? "Provide the credentials this agent needs. Other settings have been auto-configured."
                  : "All settings have been auto-configured. You can customize them below or continue."}
              </p>
            </div>
          </div>

          {/* Required Section */}
          {userRequired.length > 0 && (
            <section className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Key className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                  Required Credentials
                </h3>
                <span className="text-[10px] font-satoshi-medium text-[var(--text-tertiary)] bg-[var(--background)] border border-[var(--border-stroke)] rounded-full px-2 py-0.5">
                  {userRequired.length}
                </span>
              </div>
              <div className="space-y-3">
                {userRequired.map((input) => {
                  const filled = isEffectivelyFilled(input);
                  return (
                    <div
                      key={input.key}
                      className={`warmth-hover rounded-2xl border px-5 py-4 ${
                        filled
                          ? "border-[var(--border-stroke)] bg-[var(--card-color)]"
                          : "border-[var(--warning)]/30 bg-[var(--warning)]/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                            {input.label}
                            {input.required && !filled && (
                              <span className="ml-1 text-[var(--error)]">*</span>
                            )}
                          </p>
                          {input.description && !input.description.endsWith("required at runtime.") && (
                            <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
                              {input.description}
                            </p>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] ${
                            filled
                              ? "border-[var(--success)]/20 text-[var(--success)]"
                              : "border-[var(--warning)]/20 text-[var(--warning)]"
                          }`}
                        >
                          {filled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                          {filled ? "Set" : "Needed"}
                        </span>
                      </div>
                      <RuntimeInputField input={input} onChange={(v) => updateInput(input.key, v)} />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* No required inputs */}
          {userRequired.length === 0 && runtimeInputs.length === 0 && (
            <div className="rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] px-5 py-4 text-sm font-satoshi-regular text-[var(--text-secondary)]">
              No runtime inputs are currently required.
            </div>
          )}

          {/* Auto-configured Section */}
          {autoConfigured.length > 0 && (
            <section>
              <button
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex w-full items-center gap-2 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] px-4 py-3 text-left transition-colors hover:bg-[var(--background)]"
              >
                <Sparkles className="h-4 w-4 text-[var(--secondary)]" />
                <span className="flex-1 text-sm font-satoshi-bold text-[var(--text-primary)]">
                  Smart Defaults
                </span>
                <span className="text-xs font-satoshi-medium text-[var(--text-tertiary)]">
                  {autoFilledCount} of {autoConfigured.length} auto-configured
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${
                    advancedOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {advancedOpen && (
                <div className="mt-3 space-y-3 stage-enter">
                  {autoConfigured.map((input) => {
                    const strategy = getStrategy(input);
                    const filled = isEffectivelyFilled(input);
                    const isDefaulted = !input.value?.trim() && !!input.defaultValue?.trim();
                    return (
                      <div
                        key={input.key}
                        className="warmth-hover rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] px-5 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                              {input.label}
                            </p>
                            {input.description && !input.description.endsWith("required at runtime.") && (
                              <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-secondary)]">
                                {input.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em]"
                              style={{
                                borderColor: strategy === "ai_inferred" ? "#7b5aff33" : "#ae00d033",
                                color: strategy === "ai_inferred" ? "#7b5aff" : "#ae00d0",
                              }}
                            >
                              <Sparkles className="h-3 w-3" />
                              {strategy === "ai_inferred" ? "AI" : "Default"}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] ${
                                filled
                                  ? isDefaulted
                                    ? "border-[var(--primary)]/20 text-[var(--primary)]"
                                    : "border-[var(--success)]/20 text-[var(--success)]"
                                  : "border-[var(--warning)]/20 text-[var(--warning)]"
                              }`}
                            >
                              {filled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                              {filled ? (isDefaulted ? "Default" : "Set") : "Needed"}
                            </span>
                          </div>
                        </div>
                        <RuntimeInputField input={input} onChange={(v) => updateInput(input.key, v)} />
                        {input.defaultValue && input.inputType !== "boolean" && input.inputType !== "select" && (
                          <p className="mt-1.5 text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
                            Default: <span className="font-mono">{input.defaultValue}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
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
                  ? `${missingRequiredCount} required credential${missingRequiredCount === 1 ? "" : "s"} still missing`
                  : "Configuration ready"}
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
