"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  Clock3,
  GitCompare,
  Plug,
  Zap,
  MoreHorizontal,
  Trash2,
  Power,
  MessageSquare,
  Wrench,
  Rocket,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAgentsStore, type SavedAgent } from "@/hooks/use-agents-store";
import { useSandboxHealth, type SandboxHealth } from "@/hooks/use-sandbox-health";

function summarizeSandboxHealth(
  sandboxIds: string[],
  healthMap: Record<string, SandboxHealth>,
): "running" | "degraded" | "stopped" | "loading" | null {
  if (sandboxIds.length === 0) return null;

  const states = sandboxIds.map((sandboxId) => healthMap[sandboxId] ?? "loading");
  if (states.every((state) => state === "loading")) return "loading";
  if (states.every((state) => state === "running")) return "running";
  if (states.every((state) => state === "stopped")) return "stopped";
  return "degraded";
}

function deploymentBadgeClasses(summary: ReturnType<typeof summarizeSandboxHealth>): string {
  switch (summary) {
    case "running":
      return "bg-[var(--success)]/8 text-[var(--success)] border border-[var(--success)]/20";
    case "stopped":
      return "bg-[var(--error)]/8 text-[var(--error)] border border-[var(--error)]/20";
    case "degraded":
      return "bg-[#F59E0B]/10 text-[#B45309] border border-[#F59E0B]/20";
    default:
      return "bg-[var(--background)] text-[var(--text-secondary)] border border-[var(--border-default)]";
  }
}

function deploymentDotClasses(summary: ReturnType<typeof summarizeSandboxHealth>): string {
  switch (summary) {
    case "running":
      return "bg-[var(--success)]";
    case "stopped":
      return "bg-[var(--error)]";
    case "degraded":
      return "bg-[#F59E0B]";
    default:
      return "bg-[var(--text-tertiary)]";
  }
}

function AgentCard({
  agent,
  sandboxHealth,
  onDelete,
  onToggleStatus,
  onChat,
  onBuild,
  onDeploy,
}: {
  agent: SavedAgent;
  sandboxHealth: Record<string, SandboxHealth>;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, status: SavedAgent["status"]) => void;
  onChat: (id: string) => void;
  onBuild: (id: string) => void;
  onDeploy: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = agent.status === "active";
  const deploymentSummary = summarizeSandboxHealth(agent.sandboxIds ?? [], sandboxHealth);

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="relative group bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-2xl px-5 py-4 hover:border-[var(--border-default)] hover:shadow-sm transition-all">
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center text-xl shrink-0">
            {agent.avatar}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-satoshi-bold text-[var(--text-primary)] truncate">
              {agent.name}
            </p>
            <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)] mt-0.5">
              Created {timeAgo(agent.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-satoshi-bold ${
              isActive
                ? "bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20"
                : "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)] border border-[var(--border-default)]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isActive ? "bg-[var(--success)]" : "bg-[var(--text-tertiary)]"
              }`}
            />
            {isActive ? "Active" : "Draft"}
          </span>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((p) => !p)}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-7 z-20 w-44 bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    onDeploy(agent.id);
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm font-satoshi-regular text-[var(--text-secondary)] hover:bg-[var(--color-light)] transition-colors"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Deploy
                </button>
                <div className="mx-3 my-1 border-t border-[var(--border-default)]" />
                <button
                  onClick={() => {
                    onToggleStatus(agent.id, isActive ? "draft" : "active");
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm font-satoshi-regular text-[var(--text-secondary)] hover:bg-[var(--color-light)] transition-colors"
                >
                  <Power className="h-3.5 w-3.5" />
                  {isActive ? "Deactivate" : "Activate"}
                </button>
                <div className="mx-3 my-1 border-t border-[var(--border-default)]" />
                <button
                  onClick={() => {
                    onDelete(agent.id);
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm font-satoshi-regular text-[var(--error)] hover:bg-[var(--error)]/5 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] leading-relaxed mb-3 line-clamp-2">
        {agent.description}
      </p>

      {/* Chips row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Skills chip */}
        {agent.skills.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-satoshi-medium bg-[var(--primary)]/8 text-[var(--primary)] border border-[var(--primary)]/15">
            <Zap className="h-3 w-3" />
            {agent.skills.length} skill{agent.skills.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Trigger chip */}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-satoshi-medium bg-[var(--background)] text-[var(--text-secondary)] border border-[var(--border-default)]">
          <Clock3 className="h-3 w-3" />
          {agent.triggerLabel}
        </span>

        {/* Deployments chip */}
        {(agent.sandboxIds?.length ?? 0) > 0 && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-satoshi-medium ${deploymentBadgeClasses(deploymentSummary)}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${deploymentDotClasses(deploymentSummary)}`} />
            <Rocket className="h-3 w-3" />
            {agent.sandboxIds.length} deployed
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-default)]">
        <button
          onClick={() => onChat(agent.id)}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-[var(--border-stroke)] bg-[var(--background)] hover:bg-[var(--color-light)] hover:border-[var(--border-default)] text-xs font-satoshi-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </button>
        <button
          onClick={() => onBuild(agent.id)}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/5 hover:bg-[var(--primary)]/10 hover:border-[var(--primary)]/50 text-xs font-satoshi-bold text-[var(--primary)] transition-all"
        >
          <Wrench className="h-3.5 w-3.5" />
          Build
        </button>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { agents, deleteAgent, updateAgentStatus, fetchAgents } = useAgentsStore();
  const sandboxHealth = useSandboxHealth(
    agents.flatMap((agent) => agent.sandboxIds ?? []),
  );

  // Sync agents from backend on mount
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleChat = (id: string) => router.push(`/agents/${id}/chat`);
  const handleBuild = (id: string) => router.push(`/agents/create?agentId=${id}`);
  const handleDeploy = (id: string) => router.push(`/agents/${id}/deploy`);

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateAgent = () => router.push("/agents/create");

  if (agents.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <div className="flex items-center justify-between px-6 md:px-8 py-5 shrink-0">
          <h1 className="text-xl md:text-2xl font-satoshi-bold text-text-primary">Agents</h1>
          <Button variant="primary" className="h-10 px-4 gap-2 rounded-lg" onClick={handleCreateAgent}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create New Agent</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="flex flex-col items-center text-center max-w-lg">
            <div className="w-48 h-48 mb-4 relative">
              <Image src="/assets/illustrations/agents-empty.svg" alt="Create your first AI Agent" fill className="object-contain" />
            </div>
            <h2 className="text-lg md:text-xl font-satoshi-bold text-text-primary mb-2">Create Your First AI Employee</h2>
            <p className="text-xs font-satoshi-regular text-text-secondary mb-6 max-w-md leading-4">
              AI Employees handle repetitive tasks automatically, working around the clock so you can focus on what matters most.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 mb-8">
              <div className="flex items-center gap-1.5 text-xs font-satoshi-regular text-text-secondary">
                <Clock3 className="h-4 w-4 text-brand-secondary" /><span>24/7 availability</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-satoshi-regular text-text-secondary">
                <GitCompare className="h-4 w-4 text-brand-secondary" /><span>Custom Workflows</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-satoshi-regular text-text-secondary">
                <Plug className="h-4 w-4 text-brand-secondary" /><span>Easy Integration</span>
              </div>
            </div>
            <Button variant="primary" className="h-11 px-6 gap-2 rounded-lg text-sm" onClick={handleCreateAgent}>
              <Plus className="h-4 w-4" />Create Agent
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-8 py-5 shrink-0 border-b border-[var(--border-default)]">
        <div>
          <h1 className="text-xl md:text-2xl font-satoshi-bold text-text-primary">Agents</h1>
          <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)] mt-0.5">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} · {agents.filter((a) => a.status === "active").length} active
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-placeholder" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 w-[200px] md:w-[260px] border border-border-default rounded-lg bg-white text-sm font-satoshi-regular"
            />
          </div>
          <Button variant="primary" className="h-10 px-4 gap-2 rounded-lg" onClick={handleCreateAgent}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create New Agent</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>
      </div>

      {/* Agent grid */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
        {filtered.length === 0 ? (
          <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] text-center mt-12">
            No agents match &ldquo;{search}&rdquo;
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            sandboxHealth={sandboxHealth}
            onDelete={deleteAgent}
            onToggleStatus={updateAgentStatus}
            onChat={handleChat}
                onBuild={handleBuild}
                onDeploy={handleDeploy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
