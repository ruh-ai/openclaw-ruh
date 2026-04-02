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
    <div className="animate-fadeIn bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-[var(--primary)]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{name}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">{model}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2">
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
      <p className="text-[10px] text-[var(--text-tertiary)] mt-1 text-right">{passRate}% pass rate</p>
    </div>
  );
}
