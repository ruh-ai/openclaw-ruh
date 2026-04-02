"use client";

import React from "react";
import { Plus } from "lucide-react";
import { AGENT_TEMPLATES, type AgentTemplate } from "../../_config/wizard-templates";

function warmthMouseHandler(e: React.MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mouse-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
  e.currentTarget.style.setProperty("--mouse-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
}

interface TemplatePickerProps {
  selectedId: string | null;
  onSelect: (template: AgentTemplate) => void;
  onBlankSlate: () => void;
}

export function TemplatePicker({ selectedId, onSelect, onBlankSlate }: TemplatePickerProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {AGENT_TEMPLATES.map((t) => {
        const isSelected = selectedId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            onMouseMove={warmthMouseHandler}
            className={`warmth-hover text-left rounded-xl border-2 p-4 transition-all cursor-pointer group ${
              isSelected
                ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)] bg-[var(--card-color)]"
                : "border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)]"
            }`}
          >
            <div className="text-2xl mb-2">{t.emoji}</div>
            <p className={`text-sm font-satoshi-bold mb-1 ${
              isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
            }`}>
              {t.name}
            </p>
            <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] line-clamp-2">
              {t.tagline}
            </p>
            <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-satoshi-medium bg-[var(--background)] border border-[var(--border-default)] text-[var(--text-tertiary)]">
              {t.category}
            </span>
          </button>
        );
      })}

      {/* Blank slate card */}
      <button
        onClick={onBlankSlate}
        onMouseMove={warmthMouseHandler}
        className={`warmth-hover text-left rounded-xl border-2 border-dashed p-4 transition-all cursor-pointer group ${
          selectedId === null
            ? "border-[var(--primary)] bg-[var(--primary)]/5"
            : "border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)]"
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-[var(--background)] border border-[var(--border-default)] flex items-center justify-center mb-2">
          <Plus className="h-4 w-4 text-[var(--text-tertiary)]" />
        </div>
        <p className={`text-sm font-satoshi-bold mb-1 ${
          selectedId === null ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
        }`}>
          Start from scratch
        </p>
        <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] line-clamp-2">
          Build a custom agent with no pre-filled defaults
        </p>
      </button>
    </div>
  );
}
