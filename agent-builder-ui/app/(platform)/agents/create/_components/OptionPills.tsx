"use client";

import type { AgentChatOption } from "../_config/agentChatSteps";

interface OptionPillsProps {
  options: AgentChatOption[];
  onSelect: (label: string) => void;
}

export const OptionPills: React.FC<OptionPillsProps> = ({
  options,
  onSelect,
}) => {
  return (
    <div className="flex flex-wrap gap-2 animate-fadeIn">
      {options.map((option) => (
        <button
          key={option.label}
          onClick={() => onSelect(option.label)}
          className="px-4 py-2 bg-white border border-border-default rounded-full text-sm font-satoshi-regular text-text-secondary
            hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--color-light,#faf5ff)]
            transition-all duration-200 cursor-pointer"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
