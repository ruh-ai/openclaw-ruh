"use client";
import { Zap, Brain, Wrench, ListTodo } from "lucide-react";

const EVENT_ICONS: Record<string, React.ElementType> = {
  task: ListTodo,
  refinement: Wrench,
  memory: Brain,
};

const EVENT_COLORS: Record<string, string> = {
  task: "bg-[#3b82f6]/10 text-[#3b82f6]",
  refinement: "bg-[var(--primary)]/10 text-[var(--primary)]",
  memory: "bg-[var(--secondary)]/10 text-[var(--secondary)]",
};

export function ActivityFeed({
  events,
}: {
  events: Array<{
    id: string;
    eventType: string;
    title: string;
    detail: string | null;
    agent: string | null;
    createdAt: string;
  }>;
}) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
        No activity yet. Hermes will log events as it works.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const Icon = EVENT_ICONS[event.eventType] || Zap;
        const color = EVENT_COLORS[event.eventType] || EVENT_COLORS.task;
        const time = new Date(event.createdAt).toLocaleString();

        return (
          <div key={event.id} className="animate-fadeIn flex items-start gap-3 rounded-[20px] border border-[var(--border-muted)] bg-white/45 px-3 py-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${color}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--text-primary)]">{event.title}</p>
              <div className="mt-1 flex items-center gap-2">
                {event.agent && (
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--primary)]">{event.agent}</span>
                )}
                {event.detail && (
                  <span className="text-[11px] text-[var(--text-tertiary)]">{event.detail}</span>
                )}
                <span className="ml-auto shrink-0 text-[10px] text-[var(--text-tertiary)]">{time}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
