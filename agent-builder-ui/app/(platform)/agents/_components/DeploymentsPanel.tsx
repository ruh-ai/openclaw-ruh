"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Trash2,
  MessageSquare,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import type { SavedAgent } from "@/hooks/use-agents-store";
import { useAgentsStore } from "@/hooks/use-agents-store";
import type { SandboxHealth } from "@/hooks/use-sandbox-health";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SandboxInfo {
  sandbox_id: string;
  sandbox_name: string;
  created_at: string;
  gateway_port?: number;
  notFound?: boolean;
}

function healthDotClass(h: SandboxHealth): string {
  switch (h) {
    case "running":
      return "bg-[var(--success)]";
    case "stopped":
      return "bg-[var(--error)]";
    case "unreachable":
      return "bg-[#F59E0B]";
    default:
      return "bg-[var(--text-tertiary)] animate-pulse";
  }
}

function healthLabel(h: SandboxHealth): string {
  switch (h) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "unreachable":
      return "Unreachable";
    default:
      return "Loading...";
  }
}

function healthBadgeClass(h: SandboxHealth): string {
  switch (h) {
    case "running":
      return "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20";
    case "stopped":
      return "bg-[var(--error)]/10 text-[var(--error)] border-[var(--error)]/20";
    case "unreachable":
      return "bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/20";
    default:
      return "bg-[var(--background)] text-[var(--text-tertiary)] border-[var(--border-default)]";
  }
}

function timeAgo(iso: string): string {
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
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 rounded hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
      title="Copy sandbox ID"
    >
      {copied ? <Check className="h-3 w-3 text-[var(--success)]" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function DeploymentsPanel({
  agent,
  sandboxHealth,
  onClose,
  onChat,
  onRefreshHealth,
}: {
  agent: SavedAgent;
  sandboxHealth: Record<string, SandboxHealth>;
  onClose: () => void;
  onChat: (agentId: string) => void;
  onRefreshHealth?: () => void;
}) {
  const { removeSandboxFromAgent, restartSandbox } = useAgentsStore();
  const [sandboxes, setSandboxes] = useState<SandboxInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

  const sandboxIds = agent.sandboxIds ?? [];

  const fetchSandboxes = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      sandboxIds.map(async (sid) => {
        try {
          const res = await fetch(`${API_BASE}/api/sandboxes/${sid}`);
          if (!res.ok) return { sandbox_id: sid, sandbox_name: "", created_at: "", notFound: true } as SandboxInfo;
          return (await res.json()) as SandboxInfo;
        } catch {
          return { sandbox_id: sid, sandbox_name: "", created_at: "", notFound: true } as SandboxInfo;
        }
      }),
    );
    setSandboxes(results);
    setLoading(false);
  }, [sandboxIds.join(",")]);

  useEffect(() => {
    fetchSandboxes();
  }, [fetchSandboxes]);

  const handleDelete = async (sandboxId: string) => {
    setActionLoading((prev) => ({ ...prev, [sandboxId]: "deleting" }));
    try {
      await removeSandboxFromAgent(agent.id, sandboxId);
      setSandboxes((prev) => prev.filter((s) => s.sandbox_id !== sandboxId));
      setConfirmDeleteId(null);
      onRefreshHealth?.();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[sandboxId];
        return next;
      });
    }
  };

  const handleRestart = async (sandboxId: string) => {
    setActionLoading((prev) => ({ ...prev, [sandboxId]: "restarting" }));
    try {
      await restartSandbox(sandboxId);
      onRefreshHealth?.();
    } catch (err) {
      console.error("Restart failed:", err);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[sandboxId];
        return next;
      });
    }
  };

  const handleCleanupStale = async (sandboxId: string) => {
    setActionLoading((prev) => ({ ...prev, [sandboxId]: "cleaning" }));
    try {
      await removeSandboxFromAgent(agent.id, sandboxId);
      setSandboxes((prev) => prev.filter((s) => s.sandbox_id !== sandboxId));
    } catch (err) {
      console.error("Cleanup failed:", err);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[sandboxId];
        return next;
      });
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[var(--card-color)] border-l border-[var(--border-default)] shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center text-lg shrink-0">
              {agent.avatar}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-satoshi-bold text-[var(--text-primary)] truncate">
                {agent.name}
              </p>
              <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                {sandboxes.filter((s) => !s.notFound).length} deployment{sandboxes.filter((s) => !s.notFound).length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sandboxes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)]">
                No deployments found
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sandboxes.map((sandbox) => {
                const health = sandboxHealth[sandbox.sandbox_id] ?? "loading";
                const action = actionLoading[sandbox.sandbox_id];
                const isConfirming = confirmDeleteId === sandbox.sandbox_id;

                if (sandbox.notFound) {
                  return (
                    <div
                      key={sandbox.sandbox_id}
                      className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/5 p-4"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-[var(--error)]" />
                        <span className="text-xs font-satoshi-bold text-[var(--error)]">
                          Not Found
                        </span>
                      </div>
                      <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mb-3">
                        Sandbox <code className="text-[10px] bg-[var(--background)] px-1 py-0.5 rounded">{sandbox.sandbox_id.slice(0, 8)}</code> no longer exists.
                      </p>
                      <button
                        onClick={() => handleCleanupStale(sandbox.sandbox_id)}
                        disabled={!!action}
                        className="text-xs font-satoshi-bold text-[var(--error)] hover:underline disabled:opacity-50"
                      >
                        {action === "cleaning" ? "Removing..." : "Remove stale reference"}
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={sandbox.sandbox_id}
                    className="rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] p-4 hover:border-[var(--border-default)] transition-colors"
                  >
                    {/* Sandbox header row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-[var(--text-primary)] bg-[var(--color-light)] px-2 py-0.5 rounded">
                          {sandbox.sandbox_id.slice(0, 8)}
                        </code>
                        <CopyButton text={sandbox.sandbox_id} />
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-satoshi-bold border ${healthBadgeClass(health)}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${healthDotClass(health)}`} />
                        {healthLabel(health)}
                      </span>
                    </div>

                    {/* Sandbox details */}
                    <div className="flex items-center gap-3 text-[11px] font-satoshi-regular text-[var(--text-tertiary)] mb-3">
                      {sandbox.sandbox_name && (
                        <span className="truncate max-w-[120px]">{sandbox.sandbox_name}</span>
                      )}
                      {sandbox.created_at && (
                        <span>Created {timeAgo(sandbox.created_at)}</span>
                      )}
                      {sandbox.gateway_port && (
                        <span>Port {sandbox.gateway_port}</span>
                      )}
                    </div>

                    {/* Actions */}
                    {isConfirming ? (
                      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-default)]">
                        <span className="text-xs font-satoshi-regular text-[var(--text-secondary)] flex-1">
                          Delete this deployment?
                        </span>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={!!action}
                          className="px-2.5 py-1 text-xs font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] rounded-lg hover:bg-[var(--color-light)] transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(sandbox.sandbox_id)}
                          disabled={!!action}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-satoshi-bold text-white bg-[var(--error)] rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          {action === "deleting" ? "Deleting..." : "Confirm"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-default)]">
                        <button
                          onClick={() => onChat(agent.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg border border-[var(--border-stroke)] bg-[var(--card-color)] hover:bg-[var(--color-light)] text-[11px] font-satoshi-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                        >
                          <MessageSquare className="h-3 w-3" />
                          Chat
                        </button>
                        {(health === "stopped" || health === "unreachable") && (
                          <button
                            onClick={() => handleRestart(sandbox.sandbox_id)}
                            disabled={!!action}
                            className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/5 hover:bg-[var(--primary)]/10 text-[11px] font-satoshi-bold text-[var(--primary)] transition-all disabled:opacity-50"
                          >
                            <RotateCcw className={`h-3 w-3 ${action === "restarting" ? "animate-spin" : ""}`} />
                            {action === "restarting" ? "Restarting..." : "Restart"}
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDeleteId(sandbox.sandbox_id)}
                          className="flex items-center justify-center h-7 w-7 rounded-lg border border-[var(--error)]/20 hover:bg-[var(--error)]/5 text-[var(--error)] transition-all"
                          title="Delete deployment"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
