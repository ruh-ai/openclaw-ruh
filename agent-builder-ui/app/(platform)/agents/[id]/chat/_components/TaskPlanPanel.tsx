"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Search,
  Globe,
  PenLine,
  Brain,
} from "lucide-react";
import type { TaskPlan, TaskPlanItem } from "@/lib/openclaw/task-plan-parser";

// ─── TaskCheckbox ──────────────────────────────────────────────────────────

function TaskCheckbox({ status }: { status: TaskPlanItem["status"] }) {
  if (status === "done") {
    return (
      <span className="w-3.5 h-3.5 rounded-full bg-[var(--success)]/15 flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-2.5 w-2.5 text-[var(--success)]" />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative flex w-3.5 h-3.5 items-center justify-center shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-20" />
        <span className="relative w-3.5 h-3.5 rounded-full border-2 border-[var(--primary)] flex items-center justify-center">
          <span className="w-1 h-1 rounded-full bg-[var(--primary)]" />
        </span>
      </span>
    );
  }
  // pending
  return (
    <Circle className="w-3.5 h-3.5 text-white/15 shrink-0" />
  );
}

// ─── Task label icon — inferred from keywords ──────────────────────────────

function TaskIcon({ label }: { label: string }) {
  const l = label.toLowerCase();
  if (/search|find|look\s?up/.test(l))
    return <Search className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />;
  if (/visit|browse|navigate|open|website/.test(l))
    return <Globe className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />;
  if (/write|create|generate|draft|compose/.test(l))
    return <PenLine className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />;
  if (/analy[sz]e|review|evaluate|assess/.test(l))
    return <Brain className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />;
  return null;
}

// ─── TaskItem ──────────────────────────────────────────────────────────────

function TaskItem({
  item,
  index,
  isChild,
}: {
  item: TaskPlanItem;
  index: number;
  isChild?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 py-1 ${
        isChild ? "ml-6" : ""
      } ${
        item.status === "active"
          ? "bg-[var(--primary)]/5 -mx-2 px-2 rounded-md"
          : ""
      }`}
    >
      <TaskCheckbox status={item.status} />
      <TaskIcon label={item.label} />
      <span
        className={`text-xs font-satoshi-medium leading-relaxed flex-1 min-w-0 ${
          item.status === "done"
            ? "text-[var(--text-tertiary)] line-through"
            : item.status === "active"
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
      >
        {item.label}
      </span>
    </div>
  );
}

// ─── TaskPlanPanel ─────────────────────────────────────────────────────────

interface TaskPlanPanelProps {
  plan: TaskPlan;
  isLive: boolean;
}

export default function TaskPlanPanel({ plan, isLive }: TaskPlanPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const doneCount = plan.items.filter((i) => i.status === "done").length;
  const totalCount = plan.items.length;

  // Collapsed state for historical plans
  if (!isLive && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1.5 mb-2 text-[11px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors"
      >
        <ListChecks className="h-3 w-3" />
        <span>
          Show plan ({doneCount}/{totalCount} done)
        </span>
        <ChevronDown className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className={`mb-2 ${!isLive ? "opacity-90" : ""}`}>
      {/* Header — clickable to collapse */}
      <button
        onClick={() => !isLive && setCollapsed(true)}
        className={`flex items-center gap-2 mb-1.5 w-full ${!isLive ? "hover:text-[var(--primary)]" : ""} transition-colors`}
        disabled={isLive}
      >
        <ListChecks className="h-3.5 w-3.5 text-[var(--primary)]" />
        <span className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-widest">
          Task Plan
        </span>

        {/* Progress pill */}
        <span className="ml-auto flex items-center gap-1 bg-[var(--primary)]/10 rounded-full px-2 py-0.5">
          <span className="text-[10px] font-satoshi-bold text-[var(--primary)] tabular-nums">
            {doneCount}/{totalCount}
          </span>
        </span>

        {/* Collapse chevron for historical */}
        {!isLive && (
          <ChevronUp className="h-3 w-3 text-[var(--text-tertiary)]" />
        )}
      </button>

      {/* Task items */}
      <div className="flex flex-col">
        {plan.items.map((item, i) => (
          <div key={item.id}>
            <TaskItem item={item} index={i} />
            {item.children?.map((child, ci) => (
              <TaskItem key={child.id} item={child} index={ci} isChild />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
