"use client";

import type { TaskPlan } from "@/lib/openclaw/task-plan-parser";

interface TaskProgressHeaderProps {
  plan: TaskPlan | null;
}

export default function TaskProgressHeader({ plan }: TaskProgressHeaderProps) {
  if (!plan || plan.items.length === 0) return null;

  const doneCount = plan.items.filter((i) => i.status === "done").length;
  const totalCount = plan.items.length;
  const currentLabel =
    plan.currentTaskIndex >= 0
      ? plan.items[plan.currentTaskIndex].label
      : "All tasks complete";

  return (
    <div className="flex items-center gap-2 ml-3">
      {/* Separator */}
      <div className="w-px h-3 bg-[var(--border-default)]" />

      {/* Progress dots */}
      <div className="flex items-center gap-0.5">
        {plan.items.map((item, i) => (
          <span
            key={item.id}
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              item.status === "done"
                ? "bg-[var(--success)]"
                : item.status === "active"
                ? "bg-[var(--primary)] animate-pulse"
                : "bg-[var(--border-stroke)]"
            }`}
            title={`${i + 1}. ${item.label}`}
          />
        ))}
      </div>

      {/* Counter text */}
      <span className="text-[9px] font-satoshi-medium text-[var(--text-tertiary)] tabular-nums whitespace-nowrap">
        {doneCount === totalCount ? (
          <span className="text-[var(--success)]">Done</span>
        ) : (
          <>
            Task {doneCount + 1} of {totalCount}
          </>
        )}
      </span>

      {/* Current task label (truncated) */}
      <span className="text-[9px] font-satoshi-regular text-[var(--text-tertiary)]/80 truncate max-w-[140px]">
        {currentLabel}
      </span>
    </div>
  );
}
