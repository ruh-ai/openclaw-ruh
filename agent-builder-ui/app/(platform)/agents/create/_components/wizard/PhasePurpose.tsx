"use client";

import Image from "next/image";
import { useWizard } from "./WizardContext";
import { TemplatePicker } from "./TemplatePicker";
import { toast } from "sonner";

export function PhasePurpose() {
  const { state, applyTemplate, clearTemplate, updatePurpose } = useWizard();

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Title */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-9 h-9 shrink-0 mt-0.5">
            <Image src="/assets/logos/favicon.svg" alt="Purpose" width={36} height={36} />
          </div>
          <div>
            <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
              What kind of agent do you want to build?
            </h2>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
              Pick a template to get started fast, or start from scratch.
            </p>
          </div>
        </div>

        {/* Template picker */}
        <TemplatePicker
          selectedId={state.templateId}
          onSelect={(template) => {
            applyTemplate(template);
            toast.success(`Template applied: ${template.name}`);
          }}
          onBlankSlate={() => {
            clearTemplate();
            toast("Starting from scratch");
          }}
        />

        {/* Name + Description inputs */}
        <div className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="wizard-agent-name"
              className="block text-sm font-satoshi-medium text-[var(--text-primary)] mb-1.5"
            >
              Agent name
            </label>
            <input
              id="wizard-agent-name"
              type="text"
              value={state.name}
              onChange={(e) => updatePurpose(e.target.value, state.description)}
              placeholder="e.g. Finance Assistant"
              className="w-full h-10 px-4 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)]"
            />
          </div>

          <div>
            <label
              htmlFor="wizard-agent-desc"
              className="block text-sm font-satoshi-medium text-[var(--text-primary)] mb-1.5"
            >
              What does it do?
            </label>
            <textarea
              id="wizard-agent-desc"
              value={state.description}
              onChange={(e) => updatePurpose(state.name, e.target.value)}
              placeholder="Describe in 1-2 sentences what this agent should handle..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)] resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
