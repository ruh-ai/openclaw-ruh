"use client";

import { Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({
  title = "No data yet",
  description = "Data will appear here once the agent starts working.",
  icon: Icon = Inbox,
  action,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-muted)]/30 p-12 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--bg-muted)] mb-4">
        <Icon className="h-5 w-5 text-[var(--text-tertiary)]" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
