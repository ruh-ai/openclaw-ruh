"use client";

import type { ChatMode } from "@/lib/openclaw/stage-context";

const MODES: ChatMode[] = ["ask", "revise", "debug", "approve"];

const MODE_LABELS: Record<ChatMode, string> = {
  ask: "Ask",
  revise: "Revise",
  debug: "Debug",
  approve: "Approve",
};

export function ChatModeControl({
  value,
  allowed,
  onChange,
}: {
  value: ChatMode;
  allowed: ChatMode[];
  onChange: (mode: ChatMode) => void;
}) {
  const allowedSet = new Set(allowed);

  return (
    <div className="inline-flex rounded-lg border border-[var(--border-default)] bg-white p-0.5">
      {MODES.filter((mode) => allowedSet.has(mode)).map((mode) => {
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`h-7 rounded-md px-2.5 text-[11px] font-satoshi-bold transition-colors ${
              active
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--text-tertiary)] hover:bg-[var(--color-light)] hover:text-[var(--text-primary)]"
            }`}
          >
            {MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
