"use client";

import { X } from "lucide-react";

interface SkillDetailPanelProps {
  skillName: string;
  markdownContent: string;
  onClose: () => void;
}

export function SkillDetailPanel({
  skillName,
  markdownContent,
  onClose,
}: SkillDetailPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-[var(--card-color)] border-l border-[var(--border-default)] shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
          <h2 className="text-lg font-satoshi-bold text-[var(--text-primary)]">
            {skillName}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Markdown content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="bg-[#1a1a2e] text-[#e0e0e0] rounded-xl p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap">
            {markdownContent}
          </div>
        </div>
      </div>
    </div>
  );
}
