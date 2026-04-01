"use client";
import { useEffect, useState } from "react";
import { GitBranch, Wrench, Brain, ListTodo, Zap, TrendingUp, Play } from "lucide-react";
import { api, type TimelineEvent, type EvolutionReport, type AgentTrend } from "@/lib/api";

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  task: { icon: ListTodo, color: "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20", label: "Task" },
  refinement: { icon: Wrench, color: "bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20", label: "Refinement" },
  memory: { icon: Brain, color: "bg-[var(--secondary)]/10 text-[var(--secondary)] border-[var(--secondary)]/20", label: "Memory" },
};

export default function EvolutionPage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [reports, setReports] = useState<EvolutionReport[]>([]);
  const [trends, setTrends] = useState<AgentTrend[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  useEffect(() => {
    api.timeline(50).then(setEvents).catch(console.error);
    api.evolution.reports().then(setReports).catch(console.error);
    api.evolution.trends(7).then(setTrends).catch(console.error);
  }, []);

  const handleTriggerEvolution = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const result = await api.evolution.trigger();
      setTriggerResult(result.triggered ? "Evolution triggered successfully" : "Evolution trigger returned false");
      // Refresh reports after trigger
      api.evolution.reports().then(setReports).catch(console.error);
    } catch (e) {
      setTriggerResult(`Error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setTriggering(false);
    }
  };

  // Group trends by agent
  const trendsByAgent = trends.reduce<Record<string, AgentTrend[]>>((acc, t) => {
    (acc[t.agentName] ||= []).push(t);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Evolution</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Timeline of how Hermes has grown</p>
        </div>
        <button
          onClick={handleTriggerEvolution}
          disabled={triggering}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Play className="h-3 w-3" />
          {triggering ? "Triggering..." : "Trigger Evolution"}
        </button>
      </div>

      {triggerResult && (
        <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${
          triggerResult.startsWith("Error") ? "bg-[#ef4444]/10 text-[#ef4444]" : "bg-[#22c55e]/10 text-[#22c55e]"
        }`}>
          {triggerResult}
        </div>
      )}

      {/* Agent Performance Trends */}
      {Object.keys(trendsByAgent).length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Agent Performance Trends</h2>
            <span className="text-[10px] text-[var(--text-tertiary)]">Last 7 days</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(trendsByAgent).map(([agentName, agentTrends]) => (
              <div key={agentName} className="animate-fadeIn bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
                <p className="text-xs font-medium text-[var(--primary)] mb-3">{agentName}</p>
                <div className="space-y-2">
                  {agentTrends.map((t) => {
                    const passRate = t.total > 0 ? Math.round((t.passed / t.total) * 100) : 0;
                    return (
                      <div key={t.date} className="flex items-center gap-3">
                        <span className="text-[10px] text-[var(--text-tertiary)] w-16 shrink-0">{t.date}</span>
                        <div className="flex-1 h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#22c55e] rounded-full transition-all"
                            style={{ width: `${passRate}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-[var(--text-secondary)] w-12 text-right">
                          {passRate}% ({t.total})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolution Reports */}
      {reports.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4">Evolution Reports</h2>
          <div className="space-y-3">
            {reports.map((report) => {
              const time = new Date(report.createdAt);
              return (
                <div key={report.id} className="animate-fadeIn bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                      {report.reportType}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-subtle)] text-[var(--text-tertiary)]">
                      {report.trigger}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">
                      {time.toLocaleDateString()} {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-primary)]">{report.summary}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-8">
        <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4">Event Timeline</h2>
        {events.length === 0 ? (
          <div className="text-center py-16">
            <GitBranch className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-tertiary)]">No evolution events yet</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">Events will appear as Hermes works, learns, and refines agents</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[var(--border-default)]" />

            <div className="space-y-4">
              {events.map((event, i) => {
                const config = EVENT_CONFIG[event.eventType] || { icon: Zap, color: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] border-[var(--border-default)]", label: event.eventType };
                const Icon = config.icon;
                const time = new Date(event.createdAt);
                const isFirst = i === 0;

                return (
                  <div key={event.id} className={`animate-fadeIn flex gap-4 ${isFirst ? "animate-spark" : ""}`}>
                    <div className={`relative z-10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${config.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4 -mt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${config.color}`}>
                          {config.label}
                        </span>
                        {event.agent && (
                          <span className="text-[10px] font-medium text-[var(--primary)]">{event.agent}</span>
                        )}
                        <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">
                          {time.toLocaleDateString()} {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-primary)]">{event.title}</p>
                      {event.detail && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">{event.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
