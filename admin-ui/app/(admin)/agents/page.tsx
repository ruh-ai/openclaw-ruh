"use client";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AgentRecord {
  id: string;
  name: string;
  description: string;
  status: string;
  createdBy: string | null;
  createdAt: string;
  sandboxIds: string[];
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    fetch(`${API_URL}/api/admin/agents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setAgents(data.items || data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-lg font-bold text-[var(--text-primary)]">Agents</h1>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{agents.length} agents across all users</p>

      <div className="mt-4 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)]">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-tertiary)]">Agent</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-tertiary)]">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-tertiary)]">Sandboxes</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-tertiary)]">Created</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id} className="border-b border-[var(--border-default)] last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--text-primary)]">{agent.name}</p>
                  <p className="text-[var(--text-tertiary)] truncate max-w-xs">{agent.description}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    agent.status === "active" ? "text-[var(--success)] bg-[var(--success)]/10" : "text-[var(--text-tertiary)] bg-[var(--bg-subtle)]"
                  }`}>
                    {agent.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--text-tertiary)]">{agent.sandboxIds?.length || 0}</td>
                <td className="px-4 py-3 text-[var(--text-tertiary)]">{new Date(agent.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
