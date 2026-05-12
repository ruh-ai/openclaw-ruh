"use client";

import { useState } from "react";
import { Clock, X, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  messages: string[];
  onClear: () => void;
  onRemoveAt: (index: number) => void;
}

export function QueuedMessagesChip({ messages, onClear, onRemoveAt }: Props) {
  const [expanded, setExpanded] = useState(false);
  const count = messages.length;
  if (count === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--background)]/50 px-3 py-2 text-[12px] font-satoshi-regular text-[var(--text-secondary)]">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <Clock className="h-3 w-3" />
          <span>
            {count === 1
              ? "1 message queued — will send when the current turn ends"
              : `${count} messages queued — will send in order when the current turn ends`}
          </span>
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
        >
          Clear all
        </button>
      </div>
      {expanded && (
        <ul className="mt-2 space-y-1.5 pl-5">
          {messages.map((msg, i) => (
            <li
              key={`${i}-${msg.slice(0, 16)}`}
              className="flex items-start gap-2 group"
            >
              <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-[var(--primary)]/50 shrink-0" />
              <span className="flex-1 leading-relaxed text-[var(--text-primary)] line-clamp-3">
                {msg}
              </span>
              <button
                type="button"
                onClick={() => onRemoveAt(i)}
                aria-label="Remove queued message"
                className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-500 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
