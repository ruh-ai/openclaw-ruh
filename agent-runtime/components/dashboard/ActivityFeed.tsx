"use client";

import { Clock, CheckCircle2, AlertTriangle, Zap, type LucideIcon } from "lucide-react";

export interface ActivityItem {
  id: string | number;
  icon?: LucideIcon;
  iconColor?: string;
  text: string;
  detail?: string;
  time: string;
  type?: string;
}

function inferIcon(type?: string): { Icon: LucideIcon; color: string } {
  if (!type) return { Icon: Zap, color: "var(--text-tertiary)" };
  const t = type.toLowerCase();
  if (t.includes("error") || t.includes("fail")) return { Icon: AlertTriangle, color: "var(--error)" };
  if (t.includes("done") || t.includes("complete") || t.includes("success")) return { Icon: CheckCircle2, color: "var(--success)" };
  if (t.includes("start") || t.includes("run")) return { Icon: Zap, color: "var(--primary)" };
  return { Icon: Clock, color: "var(--text-tertiary)" };
}

export function ActivityFeed({
  items,
  title = "Activity",
  emptyMessage = "No activity yet",
  maxItems = 20,
}: {
  items: ActivityItem[];
  title?: string;
  emptyMessage?: string;
  maxItems?: number;
}) {
  const display = items.slice(0, maxItems);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {display.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">{emptyMessage}</p>
          </div>
        ) : (
          display.map((item) => {
            const { Icon, color } = item.icon
              ? { Icon: item.icon, color: item.iconColor || "var(--text-tertiary)" }
              : inferIcon(item.type);
            return (
              <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                <div className="mt-0.5">
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">{item.text}</p>
                  {item.detail && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{item.detail}</p>
                  )}
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{item.time}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
