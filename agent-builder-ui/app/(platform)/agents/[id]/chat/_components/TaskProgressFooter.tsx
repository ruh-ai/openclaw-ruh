"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, ChevronUp } from "lucide-react";
import type { TaskPlan } from "@/lib/openclaw/task-plan-parser";
import type { AgentStep } from "@/lib/openclaw/ag-ui/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskProgressFooterProps {
  isLoading: boolean;
  taskPlan: TaskPlan | null;
  liveSteps: AgentStep[];
  tick: number;
  sandboxId: string | null;
  onThumbnailClick?: () => void;
  onScrollToBottom?: () => void;
}

// ─── Browser Thumbnail Hook ─────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const THUMB_POLL_MS = 2000;

function useBrowserThumbnail(sandboxId: string | null, enabled: boolean) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!sandboxId || !enabled) {
      setThumbnailUrl(null);
      return;
    }

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/sandboxes/${sandboxId}/browser/screenshot?t=${Date.now()}`
        );
        if (stopped || !res.ok) {
          timeoutId = setTimeout(poll, 3000);
          return;
        }
        const blob = await res.blob();
        if (stopped) return;
        if (blob.size > 200) {
          const objectUrl = URL.createObjectURL(blob);
          if (prevUrl.current) {
            const old = prevUrl.current;
            setTimeout(() => URL.revokeObjectURL(old), 100);
          }
          prevUrl.current = objectUrl;
          setThumbnailUrl(objectUrl);
        }
      } catch {
        /* retry on next poll */
      }
      if (!stopped) timeoutId = setTimeout(poll, THUMB_POLL_MS);
    };

    poll();
    return () => {
      stopped = true;
      clearTimeout(timeoutId);
      if (prevUrl.current) {
        URL.revokeObjectURL(prevUrl.current);
        prevUrl.current = null;
      }
    };
  }, [sandboxId, enabled]);

  return thumbnailUrl;
}

// ─── Status helpers ─────────────────────────────────────────────────────────

function getStatusText(liveSteps: AgentStep[]): string {
  const active = [...liveSteps].reverse().find((s) => s.status === "active");
  if (!active) return "Working...";
  switch (active.kind) {
    case "thinking":
      return "Thinking";
    case "writing":
      return "Writing";
    case "tool":
      return active.label ? `Running: ${active.label}` : "Running tool";
    default:
      return "Working...";
  }
}

function getCurrentTaskLabel(
  taskPlan: TaskPlan | null,
  liveSteps: AgentStep[]
): string | null {
  if (taskPlan && taskPlan.currentTaskIndex >= 0) {
    return taskPlan.items[taskPlan.currentTaskIndex]?.label ?? null;
  }
  // Fallback: latest active step label
  const active = [...liveSteps].reverse().find((s) => s.status === "active");
  return active?.label ?? null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TaskProgressFooter({
  isLoading,
  taskPlan,
  liveSteps,
  tick,
  sandboxId,
  onThumbnailClick,
  onScrollToBottom,
}: TaskProgressFooterProps) {
  void tick; // triggers re-render

  const thumbnailUrl = useBrowserThumbnail(sandboxId, isLoading);

  if (!isLoading) return null;

  const statusText = getStatusText(liveSteps);
  const taskLabel = getCurrentTaskLabel(taskPlan, liveSteps);

  const doneCount = taskPlan
    ? taskPlan.items.filter((i) => i.status === "done").length
    : 0;
  const totalCount = taskPlan ? taskPlan.items.length : 0;

  return (
    <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] animate-fadeIn">
      <div className="max-w-2xl mx-auto md:ml-8 px-4 py-2 flex items-center gap-3">
        {/* Browser thumbnail */}
        <button
          onClick={onThumbnailClick}
          className="shrink-0 w-[60px] h-[40px] rounded-md overflow-hidden bg-zinc-900 border border-white/10 hover:border-[var(--primary)]/40 transition-colors relative group"
          title="View agent's computer"
        >
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt="Agent browser"
              className="w-full h-full object-cover"
            />
          ) : (
            <Monitor className="h-4 w-4 text-white/20 absolute inset-0 m-auto" />
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        </button>

        {/* Status dot + text */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-40" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--primary)]" />
          </span>
          <span className="text-xs font-satoshi-medium text-[var(--text-secondary)] whitespace-nowrap">
            {statusText}
          </span>
        </div>

        {/* Task label */}
        {taskLabel && (
          <>
            <div className="w-px h-3 bg-[var(--border-default)] shrink-0" />
            <span className="text-xs font-satoshi-regular text-[var(--text-tertiary)] truncate min-w-0">
              {taskLabel}
            </span>
          </>
        )}

        {/* Step counter pill */}
        {taskPlan && totalCount > 0 && (
          <span className="ml-auto flex items-center gap-1 bg-[var(--primary)]/10 rounded-full px-2 py-0.5 shrink-0">
            <span className="text-[10px] font-satoshi-bold text-[var(--primary)] tabular-nums">
              {doneCount}/{totalCount}
            </span>
          </span>
        )}

        {/* Scroll to bottom / expand */}
        <button
          onClick={onScrollToBottom}
          className="shrink-0 p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors"
          title="Scroll to latest"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
