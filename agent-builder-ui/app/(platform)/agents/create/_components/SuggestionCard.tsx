"use client";

import { Lightbulb } from "lucide-react";

interface SuggestionCardProps {
  label: string;
  onClick: (label: string) => void;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  label,
  onClick,
}) => {
  return (
    <button
      onClick={() => onClick(label)}
      className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-border-default rounded-xl
        hover:border-[var(--primary)] hover:bg-[var(--color-light,#faf5ff)]
        transition-all duration-200 cursor-pointer text-left group"
    >
      <Lightbulb className="h-4 w-4 text-text-tertiary shrink-0 group-hover:text-[var(--primary)]" />
      <span className="text-sm font-satoshi-regular text-text-secondary group-hover:text-text-primary flex-1">
        {label}
      </span>
      <span className="text-text-tertiary group-hover:text-[var(--primary)] transition-colors">
        &rarr;
      </span>
    </button>
  );
};
