"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Rocket, Loader2, ChevronDown, MessageSquare, LayoutDashboard, MessagesSquare, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/hooks/use-agents-store";
import { useSandboxHealth, type SandboxHealth } from "@/hooks/use-sandbox-health";
import { sanitizeAgentModelForSandbox } from "@/lib/openclaw/shared-codex";
import { TabChat } from "./_components/TabChat";
import { TabChats } from "./_components/TabChats";
import { TabMissionControl } from "./_components/TabMissionControl";
import { TabSettings } from "./_components/TabSettings";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Tab = "chat" | "chats" | "mission" | "settings";

interface SandboxRecord {
  sandbox_id: string;
  sandbox_name: string;
  sandbox_state?: string;
  gateway_port?: number;
  approved?: boolean;
  container_running?: boolean;
  created_at?: string;
  shared_codex_enabled?: boolean;
  shared_codex_model?: string | null;
}

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "chat",     label: "Chat",             icon: MessageSquare },
  { id: "chats",    label: "All Chats",        icon: MessagesSquare },
  { id: "mission",  label: "Mission Control",  icon: LayoutDashboard },
  { id: "settings", label: "Settings",         icon: Settings },
];

function sandboxHealthLabel(health: SandboxHealth | undefined): string {
  switch (health) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "unreachable":
      return "Unreachable";
    default:
      return "Checking";
  }
}

function sandboxHealthDotClass(health: SandboxHealth | undefined): string {
  switch (health) {
    case "running":
      return "bg-[var(--success)]";
    case "stopped":
      return "bg-[var(--error)]";
    case "unreachable":
      return "bg-[#F59E0B]";
    default:
      return "bg-[var(--text-tertiary)]";
  }
}

export default function AgentChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { agents, fetchAgent, setAgentModel } = useAgentsStore();
  const agent = agents.find((a) => a.id === id);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  const sandboxHealth = useSandboxHealth(agent?.sandboxIds ?? []);

  // If agent is not in local store, try fetching from backend
  useEffect(() => {
    if (!agent && !fetchAttempted) {
      setFetchAttempted(true);
      fetchAgent(id);
    }
  }, [agent, fetchAttempted, id, fetchAgent]);

  // Active tab — driven by ?tab= search param
  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab: Tab = tabParam && ["chat", "chats", "mission", "settings"].includes(tabParam) ? tabParam : "chat";

  const setTab = (tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Shared sandbox state
  const [sandboxes, setSandboxes] = useState<SandboxRecord[]>([]);
  const [activeSandbox, setActiveSandbox] = useState<SandboxRecord | null>(null);
  const [sandboxPickerOpen, setSandboxPickerOpen] = useState(false);
  const [loadingSandboxes, setLoadingSandboxes] = useState(true);

  // Selected conversation ID — bridge between Chats tab → Chat tab
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  // Fetch sandboxes
  useEffect(() => {
    if (!agent) return;
    const sandboxIds = agent.sandboxIds ?? [];
    if (sandboxIds.length === 0) { setLoadingSandboxes(false); return; }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sandboxes`);
        if (!res.ok) throw new Error();
        const all: SandboxRecord[] = await res.json();
        const relevant = all.filter((s) => sandboxIds.includes(s.sandbox_id));
        setSandboxes(relevant);
        if (relevant.length > 0) setActiveSandbox(relevant[relevant.length - 1]);
      } catch {
        // silently fail
      } finally {
        setLoadingSandboxes(false);
      }
    })();
  }, [agent]);

  useEffect(() => {
    if (!agent || !activeSandbox) return;
    const sanitizedModel = sanitizeAgentModelForSandbox(agent.model, activeSandbox);
    if (sanitizedModel !== agent.model) {
      setAgentModel(agent.id, sanitizedModel);
    }
  }, [
    activeSandbox?.sandbox_id,
    activeSandbox?.shared_codex_enabled,
    activeSandbox?.shared_codex_model,
    agent,
    setAgentModel,
  ]);

  const openConversation = (convId: string) => {
    setSelectedConvId(convId);
    setTab("chat");
  };

  const startNewChat = () => {
    setSelectedConvId(null);
    setTab("chat");
  };

  const activeSandboxHealth = activeSandbox ? sandboxHealth[activeSandbox.sandbox_id] : undefined;

  if (!agent) {
    if (!fetchAttempted) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--text-tertiary)]">Agent not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-[var(--border-default)]">
        {/* Top row: back + agent info + sandbox picker */}
        <div className="flex items-center justify-between px-6 md:px-8 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push("/agents")}
              className="p-1 rounded-lg hover:bg-[var(--color-light)] transition-colors shrink-0"
            >
              <ChevronLeft className="h-5 w-5 text-[var(--text-secondary)]" />
            </button>
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center text-base shrink-0">
              {agent.avatar}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-satoshi-bold text-[var(--text-primary)] truncate">{agent.name}</p>
              <p className="text-[11px] font-satoshi-regular text-[var(--text-tertiary)]">
                {agent.skills.length} skill{agent.skills.length !== 1 ? "s" : ""}
                {" · "}
                <span className={agent.status === "active" ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"}>
                  {agent.status}
                </span>
              </p>
            </div>
            {activeSandbox && (
              <div className="hidden md:flex items-center gap-2 h-8 px-3 rounded-lg border border-[var(--border-stroke)] bg-[var(--card-color)] text-xs font-satoshi-medium text-[var(--text-secondary)]">
                <span className={`w-1.5 h-1.5 rounded-full ${sandboxHealthDotClass(activeSandboxHealth)}`} />
                <span>{sandboxHealthLabel(activeSandboxHealth)} · {activeSandbox.sandbox_id.slice(0, 8)}…</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeSandbox && (activeSandboxHealth === "stopped" || activeSandboxHealth === "unreachable") && (
              <Button
                variant="outline"
                className="h-8 px-3 rounded-lg text-xs"
                onClick={() => router.push(`/agents/${id}/deploy`)}
              >
                Redeploy
              </Button>
            )}

            {/* Sandbox picker */}
            {sandboxes.length > 0 && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setSandboxPickerOpen((p) => !p)}
                  className="flex items-center gap-2 h-8 px-3 rounded-lg border border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)] text-xs font-satoshi-medium text-[var(--text-secondary)] transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${sandboxHealthDotClass(activeSandboxHealth)}`} />
                  {activeSandbox ? activeSandbox.sandbox_id.slice(0, 8) + "…" : "Select"}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {sandboxPickerOpen && (
                  <div
                    className="absolute right-0 top-9 z-20 w-64 bg-[var(--card-color)] border border-[var(--border-default)] rounded-xl shadow-lg py-1"
                    onMouseLeave={() => setSandboxPickerOpen(false)}
                  >
                    <p className="px-3.5 py-2 text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                      Deployed instances
                    </p>
                    {sandboxes.map((s) => (
                      <button
                        key={s.sandbox_id}
                        onClick={() => { setActiveSandbox(s); setSandboxPickerOpen(false); }}
                        className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-xs font-satoshi-regular transition-colors ${
                          activeSandbox?.sandbox_id === s.sandbox_id
                            ? "text-[var(--primary)] bg-[var(--primary)]/5"
                            : "text-[var(--text-secondary)] hover:bg-[var(--color-light)]"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sandboxHealthDotClass(sandboxHealth[s.sandbox_id])}`} />
                        <span className="truncate font-mono">{s.sandbox_id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-6 md:px-8">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-satoshi-bold border-b-2 transition-colors ${
                  active
                    ? "border-[var(--primary)] text-[var(--primary)]"
                    : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      {loadingSandboxes ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-[var(--text-tertiary)] animate-spin" />
        </div>
      ) : sandboxes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="flex flex-col items-center text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-[var(--primary)]/8 border border-[var(--primary)]/15 flex items-center justify-center mb-4">
              <Rocket className="h-6 w-6 text-[var(--primary)]" />
            </div>
            <h2 className="text-base font-satoshi-bold text-[var(--text-primary)] mb-2">Not deployed yet</h2>
            <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mb-6 leading-relaxed">
              Deploy this agent to a sandbox first before you can interact with it.
            </p>
            <Button
              variant="primary"
              className="h-10 px-6 gap-2 rounded-lg"
              onClick={() => router.push(`/agents/${id}/deploy`)}
            >
              <Rocket className="h-4 w-4" />
              Deploy Agent
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          {activeTab === "chat" && (
            <TabChat
              agent={agent}
              activeSandbox={activeSandbox}
              selectedConvId={selectedConvId}
              onConversationCreated={(convId) => setSelectedConvId(convId)}
            />
          )}
          {activeTab === "chats" && (
            <TabChats
              agent={agent}
              activeSandbox={activeSandbox}
              onOpenConversation={openConversation}
              onNewChat={startNewChat}
            />
          )}
          {activeTab === "mission" && (
            <TabMissionControl
              agent={agent}
              activeSandbox={activeSandbox}
              sandboxes={sandboxes}
            />
          )}
          {activeTab === "settings" && (
            <TabSettings agent={agent} activeSandbox={activeSandbox} />
          )}
        </div>
      )}
    </div>
  );
}
