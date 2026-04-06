"use client";
import { Bot } from "lucide-react";

export function AgentHealthCard({
  name,
  model,
  tasksTotal,
  tasksPassed,
  tasksFailed,
  passRate,
}: {
  name: string;
  model: string;
  tasksTotal: number;
  tasksPassed: number;
  tasksFailed: number;
  passRate: number;
}) {
  const barWidth = tasksTotal > 0 ? passRate : 0;

  return (
    <div className="mission-card animate-fadeIn rounded-[24px] p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--primary)]/12">
          <Bot className="h-4 w-4 text-[var(--primary)]" />
        </div>
        <div>
          <p className="text-base font-semibold text-[var(--text-primary)]">{name}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{model}</p>
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span>{tasksTotal} tasks</span>
        <span>
          <span className="text-[var(--success)]">{tasksPassed}</span>
          {" / "}
          <span className="text-[var(--error)]">{tasksFailed}</span>
        </span>
      </div>
      <div className="h-1.5 bg-[var(--border-muted)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${barWidth}%`,
            background: "linear-gradient(to right, var(--primary), var(--secondary))",
          }}
        />
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">{passRate}% pass rate</p>
    </div>
  );
}
