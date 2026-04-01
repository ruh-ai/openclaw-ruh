"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, CheckCircle, XCircle, Wrench, Zap, Shield, RefreshCw, Code, Layers } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { api, type Agent, type AgentScore, type Refinement, type TaskLog } from "@/lib/api";

const CIRCUIT_COLORS: Record<string, string> = {
  closed: "bg-[var(--success)]/10 text-[var(--success)]",
  open: "bg-[var(--error)]/10 text-[var(--error)]",
  "half-open": "bg-[var(--warning)]/10 text-[var(--warning)]",
};

export default function AgentDetailPage() {
  const params = useParams();
  const name = params.name as string;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [scores, setScores] = useState<AgentScore[]>([]);
  const [refinements, setRefinements] = useState<Refinement[]>([]);
  const [tasks, setTasks] = useState<TaskLog[]>([]);
  const [syncing, setSyncing] = useState(false);

  const fetchData = () => {
    Promise.all([
      api.agents.get(name),
      api.scores.list(name),
      api.refinements.list(name),
      api.tasks.list({ delegatedTo: name, limit: "10" }),
    ]).then(([a, s, r, t]) => {
      setAgent(a);
      setScores(s);
      setRefinements(r);
      setTasks(t.items);
    }).catch(console.error);
  };

  useEffect(() => { fetchData(); }, [name]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.agents.sync();
      fetchData();
    } catch (e) { console.error(e); }
    finally { setSyncing(false); }
  };

  if (!agent) {
    return <div className="text-center py-16 text-[var(--text-tertiary)] text-sm">Loading...</div>;
  }

  const passRate = agent.tasksTotal > 0
    ? Math.round((agent.tasksPassed / agent.tasksTotal) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Link href="/agents" className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--primary)]">
          <ArrowLeft className="h-3 w-3" /> Back to agents
        </Link>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-[10px] text-[var(--text-secondary)] hover:bg-[var(--primary)]/10 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync from disk"}
        </button>
      </div>

      {/* Agent header */}
      <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl soul-pulse bg-[var(--primary)]/10 flex items-center justify-center">
          <Bot className="h-6 w-6 text-[var(--primary)]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[var(--text-primary)]">{agent.name}</h1>
            <StatusBadge status={agent.status} />
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CIRCUIT_COLORS[agent.circuitState] || ""}`}>
              <Shield className="h-2.5 w-2.5 inline mr-0.5" />
              {agent.circuitState}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">v{agent.version}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{agent.description || "No description"}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{passRate}%</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">pass rate ({agent.tasksTotal} tasks)</p>
        </div>
      </div>

      {/* Skills + Tools + Stack row */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        {/* Tools */}
        <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Code className="h-3.5 w-3.5 text-[var(--primary)]" />
            <h3 className="text-xs font-bold text-[var(--text-primary)]">Tools</h3>
          </div>
          {agent.tools ? (
            <div className="flex flex-wrap gap-1">
              {agent.tools.split(",").map(t => t.trim()).filter(Boolean).map((tool) => (
                <span key={tool} className="px-2 py-0.5 bg-[var(--primary)]/10 text-[var(--primary)] rounded text-[10px] font-medium">
                  {tool}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[var(--text-tertiary)]">Not synced yet</p>
          )}
          <p className="text-[10px] text-[var(--text-tertiary)] mt-2">Model: {agent.model} | Prompt: {agent.promptSize > 0 ? `${Math.round(agent.promptSize / 1024)}KB` : "?"}</p>
        </div>

        {/* Stack */}
        <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Layers className="h-3.5 w-3.5 text-[var(--secondary)]" />
            <h3 className="text-xs font-bold text-[var(--text-primary)]">Stack</h3>
          </div>
          {agent.stack ? (
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{agent.stack}</p>
          ) : (
            <p className="text-[10px] text-[var(--text-tertiary)]">Not synced yet</p>
          )}
        </div>

        {/* Stats */}
        <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5 text-[var(--warning)]" />
            <h3 className="text-xs font-bold text-[var(--text-primary)]">Performance</h3>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-[var(--success)]">{agent.tasksPassed}</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Passed</p>
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--error)]">{agent.tasksFailed}</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Failed</p>
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">{agent.version}</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Version</p>
            </div>
          </div>
          {agent.lastSyncedAt && (
            <p className="text-[10px] text-[var(--text-tertiary)] mt-2">Last synced: {new Date(agent.lastSyncedAt).toLocaleString()}</p>
          )}
          {agent.promptHash && (
            <p className="text-[10px] text-[var(--text-tertiary)] font-mono">Hash: {agent.promptHash}</p>
          )}
        </div>
      </div>

      {/* Skills */}
      {agent.skills.length > 0 && (
        <div className="mt-4 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
          <h3 className="text-xs font-bold text-[var(--text-primary)] mb-2">Skills & Capabilities</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {agent.skills.map((skill, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[var(--primary)] flex-shrink-0" />
                <span className="text-xs text-[var(--text-secondary)]">{skill}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mt-6">
        {/* Recent Scores */}
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3">Score History</h2>
          <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4 space-y-2 max-h-80 overflow-y-auto">
            {scores.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)] text-center py-4">No scores yet</p>
            ) : scores.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-[var(--border-muted)] last:border-0">
                {s.passed ? (
                  <CheckCircle className="h-3.5 w-3.5 text-[var(--success)]" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-[var(--error)]" />
                )}
                <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{s.notes || (s.passed ? "Passed" : "Failed")}</span>
                {s.score != null && <span className="text-xs font-medium text-[var(--text-secondary)]">{s.score}/10</span>}
                <span className="text-[10px] text-[var(--text-tertiary)]">{new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Refinement History — shows skill evolution */}
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3">
            Skill Evolution
            <span className="text-[10px] font-normal text-[var(--text-tertiary)] ml-2">
              {refinements.length} refinement{refinements.length !== 1 ? "s" : ""}
            </span>
          </h2>
          <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4 space-y-2 max-h-80 overflow-y-auto">
            {refinements.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)] text-center py-4">No refinements yet — agent hasn&apos;t evolved</p>
            ) : refinements.map((r) => (
              <div key={r.id} className="py-2 border-b border-[var(--border-muted)] last:border-0">
                <div className="flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-[var(--primary)]" />
                  <span className="text-xs font-medium text-[var(--text-primary)]">{r.changeDescription}</span>
                </div>
                {r.reason && <p className="text-[10px] text-[var(--text-tertiary)] mt-1 ml-5">Why: {r.reason}</p>}
                {r.diffSummary && <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 ml-5 font-mono">{r.diffSummary}</p>}
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 ml-5">{new Date(r.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="mt-6">
        <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3">Recent Tasks</h2>
        <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] overflow-hidden">
          {tasks.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] text-center py-6">No tasks delegated yet</p>
          ) : (
            <table className="w-full">
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border-muted)] last:border-0">
                    <td className="px-4 py-2.5 text-xs text-[var(--text-primary)]">{t.description.slice(0, 80)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-2.5 text-[10px] text-[var(--text-tertiary)]">
                      {t.durationMs ? `${Math.round(t.durationMs / 1000)}s` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-[var(--text-tertiary)]">
                      {new Date(t.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
