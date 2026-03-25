"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Zap,
  Terminal,
  Rocket,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  Clock3,
  FileJson,
  KeyRound,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { pushAgentConfig } from "@/lib/openclaw/agent-config";
import type { SavedAgent } from "@/hooks/use-agents-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SandboxRecord {
  sandbox_id: string;
  sandbox_name: string;
  sandbox_state?: string;
  gateway_port?: number;
  approved?: boolean;
  created_at?: string;
}

interface GatewayStatus {
  sandbox_id?: string;
  sandbox_name?: string;
  gateway_port?: number;
  approved?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

interface TabMissionControlProps {
  agent: SavedAgent;
  activeSandbox: SandboxRecord | null;
  sandboxes: SandboxRecord[];
}

function timeAgo(iso?: string): string {
  if (!iso) return "unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
      {children}
    </p>
  );
}

export function TabMissionControl({ agent, activeSandbox, sandboxes }: TabMissionControlProps) {
  const router = useRouter();
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [convCount, setConvCount] = useState<number | null>(null);
  const [pushingConfig, setPushingConfig] = useState(false);
  const [pushResult, setPushResult] = useState<"idle" | "ok" | "error">("idle");

  const fetchStatus = useCallback(async () => {
    if (!activeSandbox) return;
    setStatusLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/status`);
      if (res.ok) setGatewayStatus(await res.json());
    } catch {
      // silently fail
    } finally {
      setStatusLoading(false);
    }
  }, [activeSandbox?.sandbox_id]);

  const fetchConvCount = useCallback(async () => {
    if (!activeSandbox) return;
    try {
      const res = await fetch(`${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/conversations`);
      if (res.ok) {
        const data = await res.json() as { items?: unknown[] };
        setConvCount((data.items ?? []).length);
      }
    } catch {
      setConvCount(null);
    }
  }, [activeSandbox?.sandbox_id]);

  useEffect(() => {
    fetchStatus();
    fetchConvCount();
  }, [fetchStatus, fetchConvCount]);

  const handlePushConfig = async () => {
    if (!activeSandbox) return;
    setPushingConfig(true);
    setPushResult("idle");
    try {
      const result = await pushAgentConfig(activeSandbox.sandbox_id, agent);
      setPushResult(result.ok ? "ok" : "error");
    } catch {
      setPushResult("error");
    } finally {
      setPushingConfig(false);
      setTimeout(() => setPushResult("idle"), 3000);
    }
  };

  const sshCommand = activeSandbox
    ? `docker exec -it openclaw-${activeSandbox.sandbox_id} bash`
    : "";

  const skills = agent.skillGraph ?? agent.skills.map((s) => ({ skill_id: s, name: s, description: "" }));
  const allEnvVars = [
    ...new Set(
      (agent.skillGraph ?? []).flatMap((n) => ("requires_env" in n ? (n.requires_env ?? []) : []))
    ),
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl space-y-6">

        {/* ── Gateway Status ── */}
        <div>
          <SectionTitle>Gateway Status</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Health */}
            <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full shrink-0 ${statusLoading ? "bg-[var(--text-tertiary)] animate-pulse" : activeSandbox ? "bg-[var(--success)]" : "bg-[var(--text-tertiary)]"}`} />
              <div>
                <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wide">Health</p>
                <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                  {statusLoading ? "Checking..." : activeSandbox ? "Running" : "No sandbox"}
                </p>
              </div>
              <button onClick={fetchStatus} className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors">
                <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Port */}
            <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3">
              <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Port</p>
              <p className="text-sm font-satoshi-bold text-[var(--text-primary)] font-mono">
                {gatewayStatus?.gateway_port ?? activeSandbox?.gateway_port ?? "—"}
              </p>
            </div>

            {/* Deployed */}
            <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3">
              <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Deployed</p>
              <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                {timeAgo(activeSandbox?.created_at)}
              </p>
            </div>
          </div>
        </div>

        {/* ── Activity ── */}
        <div>
          <SectionTitle>Activity</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3">
              <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Conversations</p>
              <p className="text-2xl font-satoshi-bold text-[var(--text-primary)]">
                {convCount ?? "—"}
              </p>
            </div>
            <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3">
              <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Skills</p>
              <p className="text-2xl font-satoshi-bold text-[var(--text-primary)]">{skills.length}</p>
            </div>
            <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3">
              <p className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Instances</p>
              <p className="text-2xl font-satoshi-bold text-[var(--text-primary)]">{sandboxes.length}</p>
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <SectionTitle>Quick Actions</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="tertiary"
              className="h-9 px-4 gap-2 rounded-lg text-xs"
              onClick={handlePushConfig}
              disabled={pushingConfig || !activeSandbox}
            >
              {pushingConfig
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : pushResult === "ok"
                ? <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                : <RefreshCw className="h-3.5 w-3.5" />
              }
              {pushResult === "ok" ? "Config updated" : pushResult === "error" ? "Push failed" : "Push Config Update"}
            </Button>
            <Button
              variant="tertiary"
              className="h-9 px-4 gap-2 rounded-lg text-xs"
              onClick={() => router.push(`/agents/${agent.id}/deploy`)}
            >
              <Rocket className="h-3.5 w-3.5" />
              Deploy New Instance
            </Button>
            <Button
              variant="tertiary"
              className="h-9 px-4 gap-2 rounded-lg text-xs"
              onClick={() => router.push(`/agents/create?agentId=${agent.id}`)}
            >
              <Wrench className="h-3.5 w-3.5" />
              Improve Agent
            </Button>
          </div>
        </div>

        {/* ── SSH Access ── */}
        {activeSandbox && (
          <div>
            <SectionTitle>SSH Access</SectionTitle>
            <div className="flex items-center gap-2 bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3">
              <Terminal className="h-3.5 w-3.5 text-white/40 shrink-0" />
              <code className="flex-1 text-xs font-mono text-green-400/80 truncate">{sshCommand}</code>
              <CopyButton text={sshCommand} />
            </div>
          </div>
        )}

        {/* ── Loaded Skills ── */}
        <div>
          <SectionTitle>Loaded Skills</SectionTitle>
          <div className="space-y-1.5">
            {skills.length === 0 ? (
              <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)] italic">No skills configured.</p>
            ) : skills.map((skill, i) => {
              const name = "name" in skill ? skill.name : String(skill);
              const desc = "description" in skill ? skill.description : undefined;
              const envs = "requires_env" in skill ? (skill.requires_env ?? []) : [];
              return (
                <div key={i} className="flex items-start gap-3 bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-2.5">
                  <FileJson className="h-4 w-4 text-[var(--primary)]/60 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-satoshi-bold text-[var(--text-primary)]">{name}</p>
                    {desc && <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)] mt-0.5 line-clamp-1">{desc}</p>}
                    {envs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {envs.map((v: string) => (
                          <span key={v} className="inline-flex items-center gap-1 text-[9px] font-mono text-[var(--text-tertiary)] bg-[var(--border-default)]/40 px-1.5 py-0.5 rounded">
                            <KeyRound className="h-2 w-2" />{v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Agent Rules ── */}
        {(agent.agentRules ?? []).length > 0 && (
          <div>
            <SectionTitle>Behaviour Rules</SectionTitle>
            <div className="space-y-1.5">
              {agent.agentRules!.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-2.5">
                  <Activity className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                  <p className="text-xs font-satoshi-regular text-[var(--text-secondary)]">{rule}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Env Variables ── */}
        {allEnvVars.length > 0 && (
          <div>
            <SectionTitle>Required Env Variables</SectionTitle>
            <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3 flex flex-wrap gap-2">
              {allEnvVars.map((v) => (
                <span key={v} className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--border-default)]/40 border border-[var(--border-stroke)] px-2 py-1 rounded-lg">
                  <KeyRound className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />{v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Trigger ── */}
        <div>
          <SectionTitle>Trigger</SectionTitle>
          <div className="flex items-center gap-2 bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-4 py-3">
            <Clock3 className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
            <span className="text-sm font-satoshi-medium text-[var(--text-secondary)]">{agent.triggerLabel}</span>
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
