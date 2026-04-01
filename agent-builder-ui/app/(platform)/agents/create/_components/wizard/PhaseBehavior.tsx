"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, X, Briefcase, Smile, Code, Pencil } from "lucide-react";
import { useWizard } from "./WizardContext";
import { MOCK_TRIGGER_CATEGORIES } from "../configure/mockData";
import type { ToneOption } from "../../_config/wizard-templates";

const TONE_OPTIONS: { id: ToneOption; label: string; icon: typeof Briefcase; description: string }[] = [
  { id: "professional", label: "Professional", icon: Briefcase, description: "Concise, formal, business-appropriate" },
  { id: "friendly", label: "Friendly", icon: Smile, description: "Warm, approachable, conversational" },
  { id: "technical", label: "Technical", icon: Code, description: "Precise, detailed, code-aware" },
  { id: "custom", label: "Custom", icon: Pencil, description: "Define your own tone" },
];

// Flatten all triggers for the simplified picker
const ALL_TRIGGERS = MOCK_TRIGGER_CATEGORIES.flatMap((cat) =>
  cat.triggers.map((t) => ({ ...t, categoryLabel: cat.label, categoryColor: cat.color }))
);

// Show a curated set of the most common triggers
const POPULAR_TRIGGER_IDS = [
  "chat-command", "cron-schedule", "webhook-post", "message-received",
  "form-submit", "deploy-complete", "db-row-insert", "agent-call",
];
const POPULAR_TRIGGERS = POPULAR_TRIGGER_IDS
  .map((id) => ALL_TRIGGERS.find((t) => t.id === id))
  .filter(Boolean) as typeof ALL_TRIGGERS;

export function PhaseBehavior() {
  const { state, updateBehavior } = useWizard();
  const [newRule, setNewRule] = useState("");

  const addRule = () => {
    const trimmed = newRule.trim();
    if (trimmed) {
      updateBehavior({ rules: [...state.rules, trimmed] });
      setNewRule("");
    }
  };

  const removeRule = (index: number) => {
    updateBehavior({ rules: state.rules.filter((_, i) => i !== index) });
  };

  const toggleTrigger = (triggerId: string) => {
    const next = state.primaryTriggerIds.includes(triggerId)
      ? state.primaryTriggerIds.filter((id) => id !== triggerId)
      : [...state.primaryTriggerIds, triggerId];
    updateBehavior({ primaryTriggerIds: next });
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Title */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 shrink-0 mt-0.5">
            <Image src="/assets/logos/favicon.svg" alt="Behavior" width={36} height={36} />
          </div>
          <div>
            <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
              How should your agent behave?
            </h2>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
              Set the tone, triggers, and rules that shape your agent.
            </p>
          </div>
        </div>

        {/* Tone selector */}
        <div>
          <label className="block text-sm font-satoshi-bold text-[var(--text-primary)] mb-3">
            Communication tone
          </label>
          <div className="grid grid-cols-2 gap-3">
            {TONE_OPTIONS.map((opt) => {
              const isSelected = state.tone === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => updateBehavior({ tone: opt.id })}
                  className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)] bg-[var(--card-color)]"
                      : "border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)]"
                  }`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${isSelected ? "text-[var(--primary)]" : "text-[var(--text-tertiary)]"}`} />
                  <div>
                    <p className={`text-sm font-satoshi-bold ${isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs font-satoshi-regular text-[var(--text-secondary)]">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          {state.tone === "custom" && (
            <textarea
              value={state.customToneDescription}
              onChange={(e) => updateBehavior({ customToneDescription: e.target.value })}
              placeholder="Describe the tone you want..."
              rows={2}
              className="w-full mt-3 px-4 py-3 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)] resize-none"
            />
          )}
        </div>

        {/* Trigger selector (simplified) */}
        <div>
          <label className="block text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">
            When should this agent run?
          </label>
          <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mb-3">
            Select one or more triggers. You can change these later.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {POPULAR_TRIGGERS.map((trigger) => {
              const isSelected = state.primaryTriggerIds.includes(trigger.id);
              return (
                <button
                  key={trigger.id}
                  onClick={() => toggleTrigger(trigger.id)}
                  className={`text-left rounded-xl border-2 px-4 py-3 transition-all cursor-pointer ${
                    isSelected
                      ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)] bg-[var(--card-color)]"
                      : "border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)]"
                  }`}
                  style={{ borderLeftWidth: "3px", borderLeftColor: isSelected ? "var(--primary)" : trigger.categoryColor }}
                >
                  <p className={`text-sm font-satoshi-bold ${isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"}`}>
                    {trigger.title}
                  </p>
                  <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] line-clamp-1">
                    {trigger.description}
                  </p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border-default)] text-[10px] font-mono text-[var(--text-tertiary)]">
                    {trigger.code}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rules */}
        <div>
          <label className="block text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">
            Agent rules
          </label>
          <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mb-3">
            Constraints and guidelines for your agent. Optional.
          </p>

          {state.rules.length > 0 && (
            <div className="space-y-2 mb-3">
              {state.rules.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-2.5 group"
                >
                  <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] shrink-0" />
                  <span className="flex-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                    {rule}
                  </span>
                  <button
                    onClick={() => removeRule(i)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--error)] transition-all shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRule()}
              placeholder="Add a rule and press Enter..."
              className="flex-1 h-10 px-4 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)]"
            />
            <button
              onClick={addRule}
              disabled={!newRule.trim()}
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white transition-colors shrink-0 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
