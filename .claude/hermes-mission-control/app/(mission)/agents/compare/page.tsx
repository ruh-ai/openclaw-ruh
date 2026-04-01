"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, CheckCircle, XCircle, Wrench } from "lucide-react";
import { api, type Agent, type AgentScore, type Refinement } from "@/lib/api";

interface AgentData {
  agent: Agent;
  scores: AgentScore[];
  refinements: Refinement[];
}

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-[var(--border-muted)] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function metricWinner(a: number, b: number): { a: string; b: string } {
  if (a > b) return { a: "text-[#22c55e]", b: "text-[var(--text-secondary)]" };
  if (b > a) return { a: "text-[var(--text-secondary)]", b: "text-[#22c55e]" };
  return { a: "text-[var(--text-secondary)]", b: "text-[var(--text-secondary)]" };
}

function AgentComparePanel({ data }: { data: AgentData }) {
  const { agent, scores, refinements } = data;
  const passRate = agent.tasksTotal > 0
    ? Math.round((agent.tasksPassed / agent.tasksTotal) * 100) : 0;
  const avgScore = scores.length > 0
    ? (scores.reduce((sum, s) => sum + (s.score ?? 0), 0) / scores.length).toFixed(1)
    : "—";

  return (
    <div className="flex-1 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl soul-pulse bg-[var(--primary)]/10 flex items-center justify-center">
          <Bot className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">{agent.name}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">{agent.model} · v{agent.version}</p>
        </div>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-4">{agent.description || "No description"}</p>

      <div className="space-y-3 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--text-tertiary)]">Pass rate</span>
          <span className="font-medium">{passRate}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-tertiary)]">Tasks total</span>
          <span className="font-medium">{agent.tasksTotal}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-tertiary)]">Avg score</span>
          <span className="font-medium">{avgScore}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-tertiary)]">Refinements</span>
          <span className="font-medium">{refinements.length}</span>
        </div>
      </div>

      {/* Recent Scores */}
      <div className="mt-5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Recent Scores</p>
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {scores.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">No scores yet</p>
          ) : scores.slice(0, 8).map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              {s.passed ? (
                <CheckCircle className="h-3 w-3 text-[var(--success)] shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-[var(--error)] shrink-0" />
              )}
              <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">
                {s.notes || (s.passed ? "Passed" : "Failed")}
              </span>
              {s.score != null && (
                <span className="text-[10px] font-medium text-[var(--text-secondary)] shrink-0">{s.score}/10</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Refinements */}
      <div className="mt-5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Recent Refinements</p>
        <div className="space-y-2 max-h-36 overflow-y-auto">
          {refinements.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">No refinements yet</p>
          ) : refinements.slice(0, 5).map((r) => (
            <div key={r.id} className="flex items-start gap-1.5">
              <Wrench className="h-3 w-3 text-[var(--primary)] mt-0.5 shrink-0" />
              <p className="text-xs text-[var(--text-secondary)] truncate">{r.changeDescription}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AgentComparePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentAName, setAgentAName] = useState("");
  const [agentBName, setAgentBName] = useState("");
  const [dataA, setDataA] = useState<AgentData | null>(null);
  const [dataB, setDataB] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.agents.list().then(setAgents).catch(console.error);
  }, []);

  useEffect(() => {
    if (!agentAName) { setDataA(null); return; }
    setLoading(true);
    Promise.all([
      api.agents.get(agentAName),
      api.scores.list(agentAName),
      api.refinements.list(agentAName),
    ]).then(([agent, scores, refinements]) => setDataA({ agent, scores, refinements }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agentAName]);

  useEffect(() => {
    if (!agentBName) { setDataB(null); return; }
    setLoading(true);
    Promise.all([
      api.agents.get(agentBName),
      api.scores.list(agentBName),
      api.refinements.list(agentBName),
    ]).then(([agent, scores, refinements]) => setDataB({ agent, scores, refinements }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agentBName]);

  const passRateA = dataA
    ? (dataA.agent.tasksTotal > 0 ? Math.round((dataA.agent.tasksPassed / dataA.agent.tasksTotal) * 100) : 0)
    : 0;
  const passRateB = dataB
    ? (dataB.agent.tasksTotal > 0 ? Math.round((dataB.agent.tasksPassed / dataB.agent.tasksTotal) * 100) : 0)
    : 0;
  const avgScoreA = dataA && dataA.scores.length > 0
    ? dataA.scores.reduce((sum, s) => sum + (s.score ?? 0), 0) / dataA.scores.length : 0;
  const avgScoreB = dataB && dataB.scores.length > 0
    ? dataB.scores.reduce((sum, s) => sum + (s.score ?? 0), 0) / dataB.scores.length : 0;

  const tasksColors = dataA && dataB ? metricWinner(dataA.agent.tasksTotal, dataB.agent.tasksTotal) : null;
  const passRateColors = dataA && dataB ? metricWinner(passRateA, passRateB) : null;
  const scoreColors = dataA && dataB ? metricWinner(avgScoreA, avgScoreB) : null;
  const refinementColors = dataA && dataB ? metricWinner(dataA.refinements.length, dataB.refinements.length) : null;

  const maxTasks = Math.max(dataA?.agent.tasksTotal ?? 0, dataB?.agent.tasksTotal ?? 0);
  const maxScore = 10;

  return (
    <div>
      <Link href="/agents" className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--primary)] mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to agents
      </Link>

      <h1 className="text-lg font-bold text-[var(--text-primary)]">Agent Comparison</h1>
      <p className="text-xs text-[var(--text-tertiary)] mt-1">Compare performance metrics side by side</p>

      {/* Agent selectors */}
      <div className="flex gap-4 mt-6">
        <div className="flex-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Agent A</label>
          <select
            value={agentAName}
            onChange={(e) => setAgentAName(e.target.value)}
            className="mt-1.5 w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-sm text-[var(--text-primary)]"
          >
            <option value="">Select an agent...</option>
            {agents.filter((a) => a.name !== agentBName).map((a) => (
              <option key={a.id} value={a.name}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-2 text-[var(--text-tertiary)] text-xs">vs</div>
        <div className="flex-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Agent B</label>
          <select
            value={agentBName}
            onChange={(e) => setAgentBName(e.target.value)}
            className="mt-1.5 w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-sm text-[var(--text-primary)]"
          >
            <option value="">Select an agent...</option>
            {agents.filter((a) => a.name !== agentAName).map((a) => (
              <option key={a.id} value={a.name}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats comparison row */}
      {dataA && dataB && (
        <div className="mt-6 grid grid-cols-4 gap-4 animate-fadeIn">
          {/* Tasks total */}
          <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Tasks Total</p>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className={`text-xl font-bold ${tasksColors?.a}`}>{dataA.agent.tasksTotal}</p>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{dataA.agent.name}</p>
                <StatBar value={dataA.agent.tasksTotal} max={maxTasks} color="var(--primary)" />
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${tasksColors?.b}`}>{dataB.agent.tasksTotal}</p>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{dataB.agent.name}</p>
                <StatBar value={dataB.agent.tasksTotal} max={maxTasks} color="var(--secondary)" />
              </div>
            </div>
          </div>

          {/* Pass rate */}
          <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Pass Rate</p>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className={`text-xl font-bold ${passRateColors?.a}`}>{passRateA}%</p>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{dataA.agent.name}</p>
                <StatBar value={passRateA} max={100} color="var(--primary)" />
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${passRateColors?.b}`}>{passRateB}%</p>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{dataB.agent.name}</p>
                <StatBar value={passRateB} max={100} color="var(--secondary)" />
              </div>
            </div>
          </div>

          {/* Avg score */}
          <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Avg Score</p>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className={`text-xl font-bold ${scoreColors?.a}`}>
                  {dataA.scores.length > 0 ? avgScoreA.toFixed(1) : "—"}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{dataA.agent.name}</p>
                <StatBar value={avgScoreA} max={maxScore} color="var(--primary)" />
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${scoreColors?.b}`}>
                  {dataB.scores.length > 0 ? avgScoreB.toFixed(1) : "—"}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{dataB.agent.name}</p>
                <StatBar value={avgScoreB} max={maxScore} color="var(--secondary)" />
              </div>
            </div>
          </div>

          {/* Refinements */}
          <div className="bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Refinements</p>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className={`text-xl font-bold ${refinementColors?.a}`}>{dataA.refinements.length}</p>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{dataA.agent.name}</p>
                <StatBar value={dataA.refinements.length} max={Math.max(dataA.refinements.length, dataB.refinements.length)} color="var(--primary)" />
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${refinementColors?.b}`}>{dataB.refinements.length}</p>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{dataB.agent.name}</p>
                <StatBar value={dataB.refinements.length} max={Math.max(dataA.refinements.length, dataB.refinements.length)} color="var(--secondary)" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-side panels */}
      {(dataA || dataB || agentAName || agentBName) && (
        <div className="flex gap-6 mt-6">
          {dataA ? (
            <AgentComparePanel data={dataA} />
          ) : agentAName ? (
            <div className="flex-1 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-5 flex items-center justify-center">
              <p className="text-xs text-[var(--text-tertiary)]">Loading {agentAName}...</p>
            </div>
          ) : (
            <div className="flex-1 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] border-dashed p-5 flex items-center justify-center">
              <div className="text-center">
                <Bot className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-tertiary)]">Select Agent A</p>
              </div>
            </div>
          )}
          {dataB ? (
            <AgentComparePanel data={dataB} />
          ) : agentBName ? (
            <div className="flex-1 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-5 flex items-center justify-center">
              <p className="text-xs text-[var(--text-tertiary)]">Loading {agentBName}...</p>
            </div>
          ) : (
            <div className="flex-1 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] border-dashed p-5 flex items-center justify-center">
              <div className="text-center">
                <Bot className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-tertiary)]">Select Agent B</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!agentAName && !agentBName && (
        <div className="mt-6 text-center py-12 bg-[var(--card-color)] rounded-xl border border-[var(--border-default)]">
          <Bot className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-tertiary)]">Select two agents to compare</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Use the dropdowns above to pick agents</p>
        </div>
      )}
    </div>
  );
}
