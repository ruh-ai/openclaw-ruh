"use client";

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  active:    { bg: "rgba(34, 197, 94, 0.08)", text: "rgb(34, 197, 94)", dot: "rgb(34, 197, 94)" },
  running:   { bg: "rgba(34, 197, 94, 0.08)", text: "rgb(34, 197, 94)", dot: "rgb(34, 197, 94)" },
  done:      { bg: "rgba(34, 197, 94, 0.08)", text: "rgb(34, 197, 94)", dot: "rgb(34, 197, 94)" },
  completed: { bg: "rgba(34, 197, 94, 0.08)", text: "rgb(34, 197, 94)", dot: "rgb(34, 197, 94)" },
  success:   { bg: "rgba(34, 197, 94, 0.08)", text: "rgb(34, 197, 94)", dot: "rgb(34, 197, 94)" },
  pending:   { bg: "rgba(234, 179, 8, 0.08)", text: "rgb(202, 138, 4)", dot: "rgb(234, 179, 8)" },
  review:    { bg: "rgba(234, 179, 8, 0.08)", text: "rgb(202, 138, 4)", dot: "rgb(234, 179, 8)" },
  warning:   { bg: "rgba(234, 179, 8, 0.08)", text: "rgb(202, 138, 4)", dot: "rgb(234, 179, 8)" },
  error:     { bg: "rgba(239, 68, 68, 0.08)", text: "rgb(239, 68, 68)", dot: "rgb(239, 68, 68)" },
  failed:    { bg: "rgba(239, 68, 68, 0.08)", text: "rgb(239, 68, 68)", dot: "rgb(239, 68, 68)" },
  cancelled: { bg: "rgba(107, 114, 128, 0.08)", text: "rgb(107, 114, 128)", dot: "rgb(107, 114, 128)" },
  draft:     { bg: "rgba(107, 114, 128, 0.08)", text: "rgb(107, 114, 128)", dot: "rgb(107, 114, 128)" },
  backlog:   { bg: "rgba(107, 114, 128, 0.08)", text: "rgb(107, 114, 128)", dot: "rgb(107, 114, 128)" },
};

const DEFAULT_STYLE = { bg: "rgba(107, 114, 128, 0.08)", text: "rgb(107, 114, 128)", dot: "rgb(107, 114, 128)" };

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLES[status.toLowerCase()] ?? DEFAULT_STYLE;
  const display = label ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
      {display}
    </span>
  );
}
