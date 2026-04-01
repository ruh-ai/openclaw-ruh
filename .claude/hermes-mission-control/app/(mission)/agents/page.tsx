"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, GitCompare } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { api, type Agent } from "@/lib/api";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    api.agents.list().then(setAgents).catch(console.error);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Agents</h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Registry of all specialist agents</p>
        </div>
        <Link
          href="/agents/compare"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
        >
          <GitCompare className="h-3.5 w-3.5" />
          Compare
        </Link>
      </div>

      <div className="mt-6 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-default)]">
              <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Agent</th>
              <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Model</th>
              <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Status</th>
              <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Tasks</th>
              <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Pass Rate</th>
              <th className="text-left px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Version</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const passRate = agent.tasksTotal > 0
                ? Math.round((agent.tasksPassed / agent.tasksTotal) * 100)
                : 0;
              return (
                <tr key={agent.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/agents/${agent.name}`} className="flex items-center gap-2.5 group">
                      <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                        <Bot className="h-3.5 w-3.5 text-[var(--primary)]" />
                      </div>
                      <span className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors">
                        {agent.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">{agent.model}</td>
                  <td className="px-4 py-3"><StatusBadge status={agent.status} /></td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                    {agent.tasksTotal}
                    <span className="text-[var(--text-tertiary)]">
                      {" "}({agent.tasksPassed}
                      <span className="text-[var(--success)]"> P</span> / {agent.tasksFailed}
                      <span className="text-[var(--error)]"> F</span>)
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[var(--border-muted)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${passRate}%`,
                            background: "linear-gradient(to right, var(--primary), var(--secondary))",
                          }}
                        />
                      </div>
                      <span className="text-xs text-[var(--text-secondary)]">{passRate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">v{agent.version}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
