"use client";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-[#22c55e]/10 text-[#22c55e]",
  running: "bg-[#3b82f6]/10 text-[#3b82f6]",
  pending: "bg-[#f59e0b]/10 text-[#f59e0b]",
  failed: "bg-[#ef4444]/10 text-[#ef4444]",
  active: "bg-[#22c55e]/10 text-[#22c55e]",
  inactive: "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${style}`}>
      {status}
    </span>
  );
}
