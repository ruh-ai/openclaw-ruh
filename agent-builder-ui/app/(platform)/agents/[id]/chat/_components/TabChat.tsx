"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Send, Plus, ChevronDown, ChevronUp, CheckCircle2,
  Wrench, Terminal, Loader2, Brain, PenLine, SplitSquareHorizontal, Globe, Files, Code2, SlidersHorizontal, Lock,
  Maximize2, Minimize2, CornerDownLeft, Play, LayoutDashboard,
} from "lucide-react";
import Image from "next/image";
import MessageContent from "@/app/(platform)/agents/create/_components/MessageContent";
import type { SavedAgent } from "@/hooks/use-agents-store";
import {
  createEmptyBrowserWorkspaceState,
  type BrowserWorkspaceState,
} from "@/lib/openclaw/browser-workspace";
import { stripPlanTags, type TaskPlan } from "@/lib/openclaw/task-plan-parser";
import { useAgentChat } from "@/lib/openclaw/ag-ui/use-agent-chat";
import type { AgentStep, StepStatus, ChatMessage, ChatMode, EditorFile } from "@/lib/openclaw/ag-ui/types";
import BrowserPanel from "./BrowserPanel";
import FilesPanel from "./FilesPanel";
import PreviewPanel from "./PreviewPanel";
import TaskPlanPanel from "./TaskPlanPanel";
import TaskProgressHeader from "./TaskProgressHeader";
import TaskProgressFooter from "./TaskProgressFooter";
import CodeEditorPanel from "./CodeEditorPanel";
import { ChatModeControl } from "./ChatModeControl";
import { ChatStageContextBar } from "./ChatStageContextBar";
import { shouldAutoSwitchWorkspaceTab } from "./tab-workspace-autoswitch";
import { AgentConfigPanel } from "@/app/(platform)/agents/create/_components/AgentConfigPanel";
import { ClarificationMessage } from "@/app/(platform)/agents/create/_components/ClarificationMessage";
import { WizardStepRenderer } from "@/app/(platform)/agents/create/_components/copilot/WizardStepRenderer";
import { LifecycleStepRenderer, getStageInputPlaceholder } from "@/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer";
import { PendingQuestionsPanel } from "@/app/(platform)/agents/create/_components/copilot/PendingQuestionsPanel";
import { hasPurposeMetadata } from "@/lib/openclaw/copilot-flow";
import { AnimatedRuhLogo } from "@/app/(platform)/agents/create/_components/AnimatedRuhLogo";
import {
  useCoPilotStore,
  type CoPilotActions,
  type CoPilotPhase,
  type CoPilotState,
} from "@/lib/openclaw/copilot-state";
import { buildBuilderChatSuggestions } from "@/lib/openclaw/builder-chat-suggestions";
import {
  resolveStageContext,
  type ArtifactTarget,
  type ChatMode as StageChatMode,
  type StageContext,
} from "@/lib/openclaw/stage-context";

// ─── DashboardIframe — loads agent dashboard preview ────────────────────────
// In local dev, embeds the dashboard via direct Docker host port for speed.
// In production, uses the same-origin proxy path (/api/sandbox-preview/...)
// which Next.js rewrites to the backend, avoiding localhost access from the
// user's browser to the remote VM.

function DashboardIframe({ sandboxId, containerPort, backendPort }: {
  sandboxId: string;
  containerPort: number;
  backendPort: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const isLocal = API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // In production, always use the proxy — direct localhost is unreachable
      if (!isLocal) {
        if (!cancelled) {
          setSrc(`/api/sandbox-preview/${sandboxId}/proxy/${containerPort}/?backendPort=${backendPort}`);
        }
        return;
      }
      // Local dev: try direct Docker host port for speed (no proxy overhead)
      try {
        const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/preview/ports`);
        if (!res.ok) throw new Error("ports endpoint failed");
        const data = await res.json() as { ports: Record<number, number>; active: number[] };
        if (cancelled) return;
        const hostPort = data.ports[containerPort];
        if (hostPort && data.active.includes(containerPort)) {
          setSrc(`http://localhost:${hostPort}/`);
          return;
        }
      } catch { /* fall through */ }
      // Fallback: use the proxy
      if (!cancelled) {
        setSrc(`/api/sandbox-preview/${sandboxId}/proxy/${containerPort}/?backendPort=${backendPort}`);
      }
    })();
    return () => { cancelled = true; };
  }, [sandboxId, containerPort, backendPort, API_BASE, isLocal]);

  if (!src) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-[var(--text-tertiary)]">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <iframe
      key={`dashboard-${sandboxId}-${src}`}
      src={src}
      className="flex-1 w-full border-0"
      title="Agent Dashboard"
    />
  );
}

function getAllowedChatModes(context: StageContext): StageChatMode[] {
  const modes = new Set<StageChatMode>(["ask"]);
  if (context.allowedActions.some((action) => action === "request_changes" || action === "regenerate" || action === "compare")) {
    modes.add("revise");
  }
  if (context.allowedActions.some((action) => action === "debug" || action === "retry_build" || action === "run_test")) {
    modes.add("debug");
  }
  if (context.allowedActions.some((action) => action === "approve" || action === "ship")) {
    modes.add("approve");
  }
  return Array.from(modes);
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface SandboxRecord {
  sandbox_id:    string;
  sandbox_name:  string;
  sandbox_state?: string;
  gateway_port?:  number;
  vnc_port?:      number | null;
  approved?:      boolean;
  created_at?:    string;
  shared_codex_enabled?: boolean;
  shared_codex_model?: string | null;
}

interface TabChatProps {
  agent:                 SavedAgent;
  activeSandbox:         SandboxRecord | null;
  selectedConvId:        string | null;
  onConversationCreated: (convId: string) => void;
  /** Chat mode: "agent" (default) or "builder" (architect agent). */
  mode?:                 ChatMode;
  /** Pause builder autosave when the page is finalizing a save/deploy. */
  disableBuilderAutosave?: boolean;
  /** Builder state: skill graph, workflow, rules from architect. */
  builderState?:         import("@/lib/openclaw/builder-state").BuilderState;
  /** Callback when builder state changes (skill graph ready, etc.). */
  onBuilderStateChange?: (partial: Partial<import("@/lib/openclaw/builder-state").BuilderState>) => void;
  /** Callback when architect produces a skill graph (builder mode). */
  onReadyForReview?:     () => void;
  /** Callback when user clicks a clarification option chip (builder mode). */
  onSelectOption?:       (text: string) => void;
  /** Show the Co-Pilot flow inside the builder Config tab. */
  showCoPilotConfig?:    boolean;
  /** Finalize the embedded Co-Pilot flow from the review step. */
  onBuilderComplete?:    () => void | Promise<boolean>;
  /** Whether the embedded Co-Pilot flow can be completed right now. */
  canBuilderComplete?:   boolean;
  /** Whether the embedded Co-Pilot completion action is currently running. */
  isCompletingBuilder?:  boolean;
  /** Active Co-Pilot phase for builder-aware workspace focus. */
  coPilotPhase?:         CoPilotPhase;
  /** Shared Co-Pilot store for AG-UI event synchronization. */
  coPilotStore?:         (CoPilotState & CoPilotActions) | null;
  /** Bridge mode for builder: "build" (strict) or "copilot" (workspace-enabled). */
  builderBridgeMode?:    import("@/lib/openclaw/test-mode").OpenClawRequestMode;
  /** Callback when user completes or skips the discovery phase. */
  onDiscoveryComplete?:  () => void;
  /** Callback when user approves the architecture plan (Plan stage). */
  onPlanApproved?:       () => void;
  /** Callback when user clicks retry after build failure. */
  onRetryBuild?:         () => void;
  /** Callback when user clicks cancel during an active build. */
  onCancelBuild?:        () => void;
  /** Callback when user clicks Done on the reflect stage. */
  onDone?:               () => void;
}

// ─── StepBadge ─────────────────────────────────────────────────────────────

function StepBadge({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="w-4 h-4 rounded-full bg-[var(--success)]/15 flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-2.5 w-2.5 text-[var(--success)]" />
      </span>
    );
  }
  return (
    <span className="relative flex w-4 h-4 items-center justify-center shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-20" />
      <span className="relative w-4 h-4 rounded-full border-2 border-[var(--primary)] flex items-center justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
      </span>
    </span>
  );
}

// ─── StepRow — Manus-style numbered step with inline tool sub-row ───────────

function StepRow({
  step,
  index,
  tick,
}: {
  step:  AgentStep;
  index: number;
  tick:  number;
}) {
  const [expanded, setExpanded] = useState(false);
  void tick; // triggers re-render for elapsed

  const elapsedSec = step.status === "done" && step.elapsedMs != null
    ? Math.round(step.elapsedMs / 1000)
    : step.status === "active"
    ? Math.floor((Date.now() - step.startedAt) / 1000)
    : null;

  const hasExpandable = step.kind === "thinking" && Boolean(step.detail);

  return (
    <div className="flex flex-col py-1.5">
      {/* Header row — Manus-style minimal */}
      <div className="flex items-center gap-2 group">
        <StepBadge status={step.status} />

        <span className={`text-sm font-satoshi-medium flex-1 ${
          step.status === "active" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}>
          {step.kind === "thinking" && step.status === "active" && !step.label
            ? "Thinking..."
            : step.label}
        </span>

        {elapsedSec != null && (
          <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] tabular-nums shrink-0">
            {elapsedSec}s
          </span>
        )}

        {hasExpandable && (
          <button
            onClick={() => setExpanded(p => !p)}
            className="text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors opacity-0 group-hover:opacity-100"
          >
            {expanded
              ? <ChevronUp   className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Tool sub-row — always visible, Manus "└─ Using X  command" style */}
      {step.kind === "tool" && (
        <div className="ml-7 mt-1.5 flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--text-tertiary)] select-none">└─</span>
          <div className="flex items-center gap-1.5 bg-zinc-900 rounded-md px-2 py-1 max-w-full overflow-x-auto">
            <Terminal className="h-2.5 w-2.5 text-green-400/50 shrink-0" />
            <code className="text-[10px] font-mono text-green-400/80 whitespace-nowrap">
              {step.detail ?? "executing…"}
            </code>
            {step.status === "active" && (
              <span className="animate-pulse text-green-400/60 ml-0.5">▋</span>
            )}
          </div>
        </div>
      )}

      {/* Thinking expandable detail */}
      {hasExpandable && expanded && (
        <div className="ml-7 mt-1.5 border-l-2 border-[var(--border-stroke)] pl-3 max-h-44 overflow-y-auto">
          <p className="text-[11px] font-mono text-[var(--text-tertiary)] whitespace-pre-wrap leading-relaxed">
            {step.detail}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── TaskList — Manus-style primary step list ───────────────────────────────

function TaskList({
  steps,
  tick,
  isLive,
}: {
  steps:  AgentStep[];
  tick:   number;
  isLive: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (steps.length === 0) return null;

  if (!isLive && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1.5 mb-3 text-[11px] font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors"
      >
        <Brain className="h-3 w-3" />
        <span>Show reasoning ({steps.length} step{steps.length !== 1 ? "s" : ""})</span>
        <ChevronDown className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className={`mb-3 ${!isLive ? "opacity-80" : ""}`}>
      {/* Section label — only on completed */}
      {!isLive && (
        <button
          onClick={() => setCollapsed(true)}
          className="flex items-center gap-1.5 mb-2 text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-widest hover:text-[var(--primary)] transition-colors w-full"
        >
          <Brain className="h-3 w-3" />
          <span>Reasoning</span>
          <ChevronUp className="h-3 w-3 ml-auto" />
        </button>
      )}

      <div className={`flex flex-col ${isLive ? "border-l-2 border-[var(--primary)]/20 pl-3" : "divide-y divide-[var(--border-stroke)]/40"}`}>
        {steps.map((s, i) => (
          <StepRow key={s.id} step={s} index={i} tick={tick} />
        ))}
      </div>
    </div>
  );
}

// ─── AgentLabel ────────────────────────────────────────────────────────────

function AgentLabel({ name, logo }: { name: string; logo: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Image src={logo} alt={name} width={13} height={13} className="rounded-full opacity-60" />
      <span className="text-[11px] font-satoshi-medium text-[var(--text-secondary)]">
        {name}
      </span>
      <span className="text-[9px] font-satoshi-medium text-[var(--text-tertiary)] bg-[var(--background-accent)] rounded-full px-1.5 py-0.5">
        Agent
      </span>
    </div>
  );
}

// ─── TerminalPanel — activity log + interactive command input ────────────────

function TerminalPanel({
  allTools,
  liveTools,
  liveThink,
  isLoading,
  terminalScrollRef,
  isBuilderMode,
  workspaceUnlocked,
  onTerminalCommand,
}: {
  allTools:           AgentStep[];
  liveTools:          AgentStep[];
  liveThink:          AgentStep | undefined;
  isLoading:          boolean;
  terminalScrollRef:  React.RefObject<HTMLDivElement | null>;
  isBuilderMode:      boolean;
  workspaceUnlocked:  boolean;
  onTerminalCommand?: (command: string) => void;
}) {
  const [cmdInput, setCmdInput] = useState("");
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const showInput = Boolean(onTerminalCommand);

  const handleSubmitCommand = useCallback(() => {
    const cmd = cmdInput.trim();
    if (!cmd || isLoading) return;
    setCmdInput("");
    onTerminalCommand?.(cmd);
  }, [cmdInput, isLoading, onTerminalCommand]);

  const handleCmdKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmitCommand();
    }
  }, [handleSubmitCommand]);

  return (
    <div className="flex-1 min-h-0 bg-[var(--background)] p-3 md:p-4">
      <div
        data-testid="workspace-terminal-shell"
        className="mx-auto flex h-full min-h-[26rem] max-w-4xl flex-col overflow-hidden rounded-[22px] border border-[#241b38] bg-[#0c0a14] shadow-[0_18px_40px_rgba(8,6,14,0.28)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="ml-2 text-[9px] font-mono uppercase tracking-[0.24em] text-white/25">
              {isBuilderMode ? "architect terminal" : "agent terminal"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-white/35">
            <span>{allTools.length} command{allTools.length === 1 ? "" : "s"}</span>
            {isLoading ? (
              <span className="inline-flex items-center gap-1 text-[#f5b14c]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f5b14c] animate-pulse" />
                live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#7ee787]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7ee787]" />
                ready
              </span>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={terminalScrollRef}
            data-testid="workspace-terminal-log"
            className="flex-1 overflow-y-auto px-4 py-4"
          >
            {allTools.length === 0 && !showInput ? (
              <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-3 text-center">
                <Terminal className="h-8 w-8 text-white/15" />
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-white/30">
                    Terminal ready
                  </p>
                  <p className="text-[11px] font-mono text-white/45">No commands run yet</p>
                </div>
              </div>
            ) : allTools.length === 0 && showInput ? (
              <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-3 text-center">
                <Terminal className="h-8 w-8 text-white/15" />
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-white/30">
                    Terminal ready
                  </p>
                  <p className="text-[11px] font-mono text-white/45">No commands run yet</p>
                  <p className="max-w-sm text-[11px] font-mono leading-relaxed text-white/28">
                    Run commands to test tools, install packages, or explore the environment.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {allTools.map((step, i) => (
                  <div key={`${step.id}-${i}`} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.18em] text-white/28">
                      <span className="text-white/18">{String(i + 1).padStart(2, "0")}</span>
                      <span>{step.toolName === "code_editor" ? "code" : step.toolName ?? "tool"}</span>
                      {step.status === "done" ? (
                        <span className="text-[#7ee787]">
                          ✓{step.elapsedMs != null ? ` ${(step.elapsedMs / 1000).toFixed(1)}s` : ""}
                        </span>
                      ) : (
                        <span className="text-[#f5b14c] animate-pulse">running…</span>
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                      <span className="select-none font-mono text-[11px] text-[#7ee787]">$ </span>
                      <span className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-white/85">
                        {step.detail ?? "…"}
                      </span>
                      {step.status === "active" && (
                        <span className="ml-0.5 animate-pulse font-mono text-[#7ee787]">▋</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isLoading && liveTools.length === 0 && liveThink === undefined && (
              <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-white/35">
                <span className="select-none text-[#7ee787]">$</span>
                <span className="animate-pulse">▋</span>
              </div>
            )}
          </div>

          {showInput && (
            <div
              data-testid="workspace-terminal-input"
              className="shrink-0 border-t border-white/6 bg-black/20 px-4 py-3"
            >
              <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <span className="shrink-0 select-none font-mono text-[11px] text-[#7ee787]">$</span>
                <input
                  ref={cmdInputRef}
                  type="text"
                  value={cmdInput}
                  onChange={e => setCmdInput(e.target.value)}
                  onKeyDown={handleCmdKeyDown}
                  placeholder={isLoading ? "Waiting for agent…" : "Type a command… (npm install, curl, ls, etc.)"}
                  disabled={isLoading}
                  className="flex-1 bg-transparent font-mono text-[11px] text-white/88 placeholder:text-white/25 outline-none disabled:opacity-40"
                />
                <button
                  onClick={handleSubmitCommand}
                  disabled={isLoading || !cmdInput.trim()}
                  title="Run command (Enter)"
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] font-mono text-white/45 transition-colors hover:border-[#7ee787]/20 hover:text-[#7ee787] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  Run
                </button>
              </div>
              <p className="mt-2 text-[10px] font-mono text-white/25">
                {isBuilderMode
                  ? "Commands run in the architect's sandbox during creation."
                  : "Live terminal activity from the agent appears here."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ComputerView — right panel showing agent's workspace ──────────────────

// ─── Tool category sets for auto-switch ─────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TERMINAL_TOOLS = new Set(["exec", "bash", "shell_exec", "shell", "terminal", "run", "sh"]);
const BROWSER_TOOLS = new Set([
  "browser_navigate", "browser_click", "browser_input", "browser_scroll",
  "browser_hover", "browser_press", "browser_select", "browser_submit",
  "browser_screenshot", "screenshot", "navigate", "browser_goto", "goto",
  "open_url", "web_navigate", "browser_open", "web_browse", "capture_screen",
  "take_screenshot", "browser_capture", "browser_screen",
  "browser_type", "browser_fill", "browser_check", "browser_uncheck",
  "computer", "computer_use", "web_search",
]);
const CODE_TOOLS = new Set([
  "file_write", "write_file", "file_str_replace", "str_replace_editor",
  "create_file", "edit_file", "write", "save_file", "code_editor",
  "text_editor", "read_file", "file_read",
]);

type ComputerViewTab = "terminal" | "code" | "browser" | "files" | "preview" | "config" | "dashboard";

function ComputerView({
  liveSteps,
  messages,
  isLoading,
  tick,
  liveBrowserState,
  onResumeTakeover,
  activeSandboxId,
  conversationId,
  vncAvailable,
  taskPlan,
  activeEditorFile,
  recentEditorFiles,
  onEditorFileSelect,
  mode = "agent",
  builderState,
  onBuilderNameChange,
  onBuilderRulesChange,
  existingAgent,
  showCoPilotConfig,
  onBuilderComplete,
  canBuilderComplete = false,
  isCompletingBuilder = false,
  coPilotPhase,
  triggerLabel,
  isFullscreen = false,
  onToggleFullscreen,
  onTerminalCommand,
  workspaceFilesTick = 0,
  detectedPreviewPorts = [],
  onPreviewStart,
  onDiscoveryComplete,
  onPlanApproved,
  onRetryBuild,
  onCancelBuild,
  onDone,
  onRequestArtifactChange,
}: {
  liveSteps:        AgentStep[];
  messages:         ChatMessage[];
  isLoading:        boolean;
  tick:             number;
  liveBrowserState: BrowserWorkspaceState;
  onResumeTakeover: () => void;
  activeSandboxId: string | null;
  conversationId: string | null;
  vncAvailable:   boolean;
  taskPlan:        TaskPlan | null;
  activeEditorFile: EditorFile | null;
  recentEditorFiles: Array<{ path: string; language: string }>;
  onEditorFileSelect: (path: string) => void;
  mode?:            ChatMode;
  builderState?:    import("@/lib/openclaw/builder-state").BuilderState;
  onBuilderNameChange?: (name: string) => void;
  onBuilderRulesChange?: (rules: string[]) => void;
  existingAgent?:   SavedAgent | null;
  showCoPilotConfig?: boolean;
  onBuilderComplete?: () => void | Promise<boolean>;
  canBuilderComplete?: boolean;
  isCompletingBuilder?: boolean;
  coPilotPhase?: CoPilotPhase;
  triggerLabel: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Callback to execute a terminal command via the architect bridge (builder mode). */
  onTerminalCommand?: (command: string) => void;
  /** Increments when workspace files change */
  workspaceFilesTick?: number;
  /** Ports detected as running dev servers */
  detectedPreviewPorts?: number[];
  /** Called when the Preview tab is clicked with no active ports — triggers agent to start a dev server */
  onPreviewStart?: () => void;
  /** Called when user completes or skips discovery */
  onDiscoveryComplete?: () => void;
  /** Called when user approves architecture plan */
  onPlanApproved?: () => void;
  /** Called when user retries build after failure */
  onRetryBuild?: () => void;
  /** Called when user cancels an active build */
  onCancelBuild?: () => void;
  /** Called when user clicks Done on reflect stage */
  onDone?: () => void;
  /**
   * Called when the user clicks "Request changes" on a specific artifact.
   * Implementations should select this target and switch chat into Revise mode.
   */
  onRequestArtifactChange?: (target: ArtifactTarget) => void;
}) {
  const isBuilderMode = mode === "builder";
  const [activeTab, setActiveTab] = useState<ComputerViewTab>(
    isBuilderMode && showCoPilotConfig ? "config" : "dashboard"
  );
  const userTabClickRef = useRef<number>(0); // timestamp of last manual tab click
  const lastAutoSwitchRef = useRef<number>(0);
  const previousCoPilotPhaseRef = useRef<CoPilotPhase | null>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  // Unlock workspace tabs once purpose metadata exists (name + description).
  // In copilot mode, don't require skill graph — the agent should be able to
  // browse, code, and plan while still generating the skill graph.
  const workspaceUnlocked =
    hasPurposeMetadata(builderState?.name ?? "", builderState?.description ?? "");
  const coPilotStoreForChannels = useCoPilotStore();
  void tick;

  const histSteps   = messages.flatMap(m => m.steps ?? []);
  const histTools   = histSteps.filter(s => s.kind === "tool");
  const histThinks  = histSteps.filter(s => s.kind === "thinking");

  const liveTools   = liveSteps.filter(s => s.kind === "tool");
  const liveThink   = liveSteps.find(s => s.kind === "thinking");

  const allTools    = [...histTools, ...liveTools];
  const allThinks   = [...histThinks, ...(liveThink ? [liveThink] : [])];
  const historicalBrowserState = [...messages]
    .reverse()
    .find((message) => message.browserState)?.browserState ?? createEmptyBrowserWorkspaceState();

  // Merge historical + live browser items
  const histBrowser = messages.flatMap(m => m.browserState?.items ?? []);
  const allBrowser  = [...histBrowser, ...liveBrowserState.items];
  const previewUrl = liveBrowserState.previewUrl ?? historicalBrowserState.previewUrl;
  const takeover = liveBrowserState.takeover ?? historicalBrowserState.takeover;

  // ── Auto-switch logic based on tool type ───────────────────────────────
  // Respects manual tab selection (user clicked within last 5s)
  const lastAutoSwitchTabRef = useRef<string>("");
  const autoSwitchTo = useCallback((tab: typeof activeTab, options?: { force?: boolean }) => {
    const now = Date.now();
    if (!options?.force && now - userTabClickRef.current < 5000) return;
    // Only debounce repeated switches to the SAME tab; different tab always goes through
    if (!options?.force && now - lastAutoSwitchRef.current < 300 && lastAutoSwitchTabRef.current === tab) return;
    lastAutoSwitchRef.current = now;
    lastAutoSwitchTabRef.current = tab;
    setActiveTab(tab);
  }, []);

  // Track whether we've already sent a preview-start request for this session
  const previewStartSentRef = useRef(false);

  const handleTabClick = useCallback((tab: typeof activeTab) => {
    userTabClickRef.current = Date.now();
    setActiveTab(tab);

    // When Preview tab is clicked with no active ports, ask the agent to start a dev server
    if (
      tab === "preview" &&
      !previewStartSentRef.current &&
      detectedPreviewPorts.length === 0 &&
      !isLoading &&
      onPreviewStart
    ) {
      previewStartSentRef.current = true;
      onPreviewStart();
    }
  }, [detectedPreviewPorts.length, isLoading, onPreviewStart]);

  // No longer force-lock to config tab — all workspace tabs are accessible from the start

  // Auto-switch to browser tab when browser items arrive via direct events
  useEffect(() => {
    if (!shouldAutoSwitchWorkspaceTab({ mode, reason: "browser_activity" })) return;
    if (liveBrowserState.items.length > 0) {
      autoSwitchTo("browser");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBrowserState.items.length, mode]);

  // Auto-switch to preview tab when dev server is detected
  useEffect(() => {
    if (!shouldAutoSwitchWorkspaceTab({ mode, reason: "preview_detected" })) return;
    if (detectedPreviewPorts.length > 0) {
      autoSwitchTo("preview");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedPreviewPorts.length, mode]);

  // Auto-switch based on latest tool type
  useEffect(() => {
    if (!shouldAutoSwitchWorkspaceTab({ mode, reason: "tool_activity" })) return;
    const latestTool = [...liveSteps].reverse().find(s => s.kind === "tool" && s.status === "active");
    if (!latestTool?.toolName) return;
    const name = latestTool.toolName.toLowerCase();
    if (CODE_TOOLS.has(name)) autoSwitchTo("code");
    else if (BROWSER_TOOLS.has(name)) autoSwitchTo("browser");
    else if (TERMINAL_TOOLS.has(name)) autoSwitchTo("terminal");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSteps, mode]);

  // Auto-switch to code tab when editor file changes
  useEffect(() => {
    if (!shouldAutoSwitchWorkspaceTab({ mode, reason: "editor_file" })) return;
    if (activeEditorFile) autoSwitchTo("code");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditorFile?.path, mode]);

  // TODO: Plan-mode tab switching requires the gateway to emit structured
  // TOOL_CALL events during internal tool execution. See SPEC-gateway-tool-events.
  // Currently, plan-mode tasks execute tools inside the sandbox and only stream
  // plain text back, so no tool steps are created and tabs don't switch.

  // Builder phase changes should return focus to Config even after a manual runtime-tab click.
  useEffect(() => {
    if (!shouldAutoSwitchWorkspaceTab({ mode, reason: "copilot_phase" })) return;
    if (!isBuilderMode || !showCoPilotConfig) return;
    if (!coPilotPhase) return;
    const previousPhase = previousCoPilotPhaseRef.current;
    previousCoPilotPhaseRef.current = coPilotPhase;
    if (!previousPhase || previousPhase === coPilotPhase) return;
    autoSwitchTo("config", { force: true });
  }, [autoSwitchTo, coPilotPhase, isBuilderMode, showCoPilotConfig]);

  // Auto-scroll terminal to bottom when new tool steps appear
  useEffect(() => {
    if (terminalScrollRef.current && activeTab === "terminal") {
      requestAnimationFrame(() => {
        terminalScrollRef.current?.scrollTo({
          top: terminalScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [allTools.length, activeTab]);

  return (
    <div className="flex h-full flex-col bg-[var(--card-color)]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 border-b border-[var(--border-default)] bg-[linear-gradient(180deg,rgba(247,230,250,0.9),rgba(255,255,255,0.96))] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full border shrink-0 ${
            isLoading
              ? "bg-[var(--primary)] border-[var(--primary)]/30 animate-pulse"
              : "bg-[var(--background-accent)] border-[var(--border-stroke)]"
          }`} />
          <span className="text-[10px] font-satoshi-bold text-[var(--text-secondary)] uppercase tracking-widest">
            Agent&apos;s Computer
          </span>
        </div>

        {/* Task progress */}
        <TaskProgressHeader plan={taskPlan} />

        {/* Tabs */}
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center gap-0.5 rounded-xl border border-[var(--border-default)] bg-[var(--background)] p-0.5">
            {([...(isBuilderMode && showCoPilotConfig ? ["config"] as const : []), "dashboard", "terminal", "code", "files", "browser", "preview"] as ComputerViewTab[]).map((t) => {
              return (
                <button
                  key={t}
                  onClick={() => {
                    handleTabClick(t);
                  }}
                  data-testid={`computer-tab-${t}`}
                  data-active={activeTab === t ? "true" : "false"}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-satoshi-bold capitalize transition-colors relative ${
                    activeTab === t
                      ? "border border-[var(--primary)]/15 bg-[var(--card-color)] text-[var(--primary)] shadow-sm"
                      : "border border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {t === "config" && <SlidersHorizontal className="h-2.5 w-2.5" />}
                  {t === "dashboard" && <LayoutDashboard className="h-2.5 w-2.5" />}
                  {t === "terminal" && <Terminal className="h-2.5 w-2.5" />}
                  {t === "code" && <Code2 className="h-2.5 w-2.5" />}
                  {t === "files" && <Files className="h-2.5 w-2.5" />}
                  {t === "browser" && <Globe className="h-2.5 w-2.5" />}
                  {t === "preview" && <Play className="h-2.5 w-2.5" />}
                  {t}
                  {t === "terminal" && allTools.length > 0 && activeTab !== t && (
                    <span className="ml-0.5 inline-flex items-center justify-center h-3.5 min-w-[14px] px-0.5 rounded-full bg-[var(--text-tertiary)]/15 text-[8px] font-mono text-[var(--text-tertiary)]">{allTools.length}</span>
                  )}
                  {t === "config" && builderState?.skillGraph && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                  )}
                  {t === "code" && recentEditorFiles.length > 0 && activeTab !== t && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                  )}
                  {t === "browser" && allBrowser.length > 0 && activeTab !== t && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--info)]" />
                  )}
                  {t === "browser" && takeover?.status === "requested" && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
                  )}
                  {t === "preview" && detectedPreviewPorts.length > 0 && activeTab !== t && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Fullscreen toggle */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={isFullscreen ? "Exit fullscreen (Esc)" : "Expand workspace"}
              className="p-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-light)] transition-colors"
            >
              {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Terminal tab */}
      {activeTab === "terminal" && (
        <TerminalPanel
          allTools={allTools}
          liveTools={liveTools}
          liveThink={liveThink}
          isLoading={isLoading}
          terminalScrollRef={terminalScrollRef}
          isBuilderMode={isBuilderMode}
          workspaceUnlocked={workspaceUnlocked}
          onTerminalCommand={onTerminalCommand}
        />
      )}

      {/* Code editor tab */}
      {activeTab === "code" && (
        <div className="flex-1 min-h-0 bg-[#1a1a2e]">
          <CodeEditorPanel
            activeFile={activeEditorFile}
            recentFiles={recentEditorFiles}
            onFileSelect={onEditorFileSelect}
            sandboxId={activeSandboxId}
            conversationId={conversationId}
            refreshTick={workspaceFilesTick}
          />
        </div>
      )}

      {/* Files tab */}
      {activeTab === "files" && (
        <div className="flex-1 min-h-0 bg-[#1a1a2e]">
          <FilesPanel
            sandboxId={activeSandboxId}
            conversationId={conversationId}
            refreshTick={workspaceFilesTick}
            isAgentRunning={isLoading}
          />
        </div>
      )}

      {/* Browser tab */}
      {activeTab === "browser" && (
        <BrowserPanel
          items={allBrowser}
          isLoading={isLoading}
          previewUrl={previewUrl}
          takeover={takeover}
          onResumeTakeover={onResumeTakeover}
          sandboxId={activeSandboxId ?? undefined}
          vncAvailable={vncAvailable}
        />
      )}

      {/* Dashboard tab — agent's built application (auto-discovered from service_ports) */}
      {activeTab === "dashboard" && (() => {
        const dashboardPort = existingAgent?.servicePorts?.find(s => s.name === "dashboard")?.port ?? 3100;
        const backendPort = existingAgent?.servicePorts?.find(s => s.name === "backend")?.port ?? 3100;
        // Prefer the backend port for the dashboard when both are the same (single-port arch)
        const effectiveDashPort = dashboardPort === backendPort ? backendPort : dashboardPort;
        return (
        <div className="flex-1 min-h-0 flex flex-col">
          {activeSandboxId ? (
            <DashboardIframe
              sandboxId={activeSandboxId}
              containerPort={effectiveDashPort}
              backendPort={backendPort}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
              <LayoutDashboard className="h-7 w-7 text-[var(--primary)]/20" />
              <p className="text-[10px] font-satoshi-bold text-[var(--text-secondary)] text-center">
                Agent Dashboard
              </p>
              <p className="text-[10px] font-mono text-[var(--text-tertiary)] text-center leading-relaxed">
                The agent&apos;s dashboard will appear here once the sandbox is running.
                <br />
                <span className="text-[var(--text-tertiary)]/60">
                  Shows the application built during agent creation.
                </span>
              </p>
            </div>
          )}
        </div>
        );
      })()}

      {/* Preview tab */}
      {activeTab === "preview" && (
        <PreviewPanel
          sandboxId={activeSandboxId}
          conversationId={conversationId}
          isAgentRunning={isLoading}
          detectedPorts={detectedPreviewPorts}
        />
      )}

      {/* Config tab (builder mode only) — 7-stage lifecycle stepper */}
      {activeTab === "config" && isBuilderMode && showCoPilotConfig && (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--background)]">
          <LifecycleStepRenderer
            embedded
            agentId={existingAgent?.id}
            onComplete={onBuilderComplete}
            canComplete={canBuilderComplete}
            isCompleting={isCompletingBuilder}
            onDiscoveryComplete={onDiscoveryComplete}
            onPlanApproved={onPlanApproved}
            onRetryBuild={onRetryBuild}
            onCancelBuild={onCancelBuild}
            onDone={onDone}
            onRequestArtifactChange={onRequestArtifactChange}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function TabChat({
  agent, activeSandbox, selectedConvId, onConversationCreated,
  mode = "agent", disableBuilderAutosave = false, builderState,
  onBuilderStateChange, onReadyForReview, onSelectOption,
  onBuilderComplete, canBuilderComplete = false, isCompletingBuilder = false,
  showCoPilotConfig = false, coPilotPhase, coPilotStore: coPilotStoreProp,
  builderBridgeMode, onDiscoveryComplete, onPlanApproved,
  onRetryBuild, onCancelBuild, onDone,
}: TabChatProps) {
  const isBuilderMode = mode === "builder";
  const [input, setInput] = useState("");
  const [showComputer, setShowComputer] = useState(true);
  const fallbackCoPilotStore = useCoPilotStore();
  const coPilotStore = coPilotStoreProp ?? (isBuilderMode ? fallbackCoPilotStore : null);
  const effectiveCoPilotPhase = coPilotPhase ?? coPilotStore?.phase;
  const triggerLabel = coPilotStore && coPilotStore.triggers.length > 0
    ? coPilotStore.triggers.map((trigger) => trigger.title || trigger.id).join(", ")
    : "No trigger selected yet";
  const builderDisplayName = builderState?.name || builderState?.systemName || agent.name;
  const builderSuggestionName = coPilotStore?.name || builderState?.name || builderState?.systemName || agent.name;
  const builderSuggestionDescription = coPilotStore?.description || builderState?.description || agent.description || "";
  const featureCtx = coPilotStore?.featureContext ?? null;
  const isFeatureMode = Boolean(featureCtx);
  const resolvedStageContext = isBuilderMode && coPilotStore
    ? resolveStageContext({
        devStage: coPilotStore.devStage,
        thinkStatus: coPilotStore.thinkStatus,
        planStatus: coPilotStore.planStatus,
        buildStatus: coPilotStore.buildStatus,
        deployStatus: coPilotStore.deployStatus,
        discoveryDocuments: coPilotStore.discoveryDocuments,
        architecturePlan: coPilotStore.architecturePlan,
        buildManifest: coPilotStore.buildManifest,
        buildReport: coPilotStore.buildReport as { readiness?: "blocked" | "test-ready" | "ship-ready"; checks?: unknown[] } | null,
        selectedArtifact: coPilotStore.selectedArtifactTarget,
      })
    : null;
  const allowedChatModes = resolvedStageContext ? getAllowedChatModes(resolvedStageContext) : ["ask" as StageChatMode];
  const activeStageChatMode = coPilotStore && allowedChatModes.includes(coPilotStore.chatMode)
    ? coPilotStore.chatMode
    : resolvedStageContext?.mode ?? "ask";
  const stageContext = resolvedStageContext
    ? { ...resolvedStageContext, mode: activeStageChatMode }
    : null;
  const builderSuggestions = isBuilderMode
    ? buildBuilderChatSuggestions({
        ...(stageContext
          ? { stageContext, agentName: builderSuggestionName }
          : {
              devStage: coPilotStore?.devStage,
              name: builderSuggestionName,
              description: builderSuggestionDescription,
            }),
        featureContext: featureCtx,
      })
    : [];
  const hasPersistedBuilderIdentity = Boolean(
    builderState?.draftAgentId || (agent.id !== "new-agent" && !agent.id.startsWith("new-")),
  );
  const effectiveDraftSaveStatus =
    builderState?.draftSaveStatus === "idle" && hasPersistedBuilderIdentity
      ? "saved"
      : builderState?.draftSaveStatus;
  const builderDraftStatusLabel =
    effectiveDraftSaveStatus === "saving"
      ? "Saving draft…"
      : effectiveDraftSaveStatus === "saved"
      ? "Draft saved"
      : effectiveDraftSaveStatus === "error"
      ? "Draft save failed"
      : null;

  // AG-UI hook — manages all chat state, streaming, and persistence
  const chat = useAgentChat({
    agent,
    activeSandbox,
    mode: mode ?? "agent",
    selectedConvId,
    builderAutosaveEnabled: !disableBuilderAutosave,
    builderState,
    onBuilderStateChange,
    onReadyForReview,
    onConversationCreated,
    coPilotStore,
    builderBridgeMode,
  });

  const {
    messages, isLoading, liveResponse, liveSteps,
    liveBrowserState, liveTaskPlan, activeEditorFile, recentEditorFiles,
    conversationId, loadingHistory, hasMoreHistory, activeRunSurface,
    sendMessage: sendChatMessage, startNewChat, loadOlderHistory,
    resumeBrowserTakeover, selectEditorFile: handleEditorFileSelect,
    memoryBanner, tick, workspaceFilesTick, detectedPreviewPorts,
  } = chat;
  const visibleMessages = messages.filter((message) => !message.hiddenInTranscript);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [messages, isLoading, liveResponse, liveSteps.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Input handling
  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendChatMessage(text);
  }, [input, sendChatMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Terminal command handler — wraps the command in an instruction and sends
  // it through the architect bridge so the agent executes it directly.
  const handleTerminalCommand = useCallback((command: string) => {
    sendChatMessage(
      `Execute this command in the sandbox terminal and show me the output:\n\`\`\`bash\n${command}\n\`\`\``,
      { surface: isBuilderMode ? "workspace" : "chat" },
    );
  }, [isBuilderMode, sendChatMessage]);

  // ── Auto-trigger Think stage PRD/TRD generation ────────────────────────
  useEffect(() => {
    if (coPilotStore?.userTriggeredThink && !coPilotStore?.thinkRunId) {
      coPilotStore?.setUserTriggeredThink?.(true);
      return;
    }

    const thinkRunId = coPilotStore?.thinkRunId ?? null;
    if (
      coPilotStore?.devStage === "think" &&
      coPilotStore?.thinkStatus === "generating" &&
      coPilotStore?.userTriggeredThink &&
      Boolean(thinkRunId) &&
      coPilotStore?.lastDispatchedThinkRunId !== thinkRunId &&
      !coPilotStore?.discoveryDocuments &&
      !isLoading
    ) {
      const name = coPilotStore.name?.trim();
      const desc = coPilotStore.description?.trim();
      if (name && desc) {
        coPilotStore?.markThinkRunDispatched?.(thinkRunId);
        coPilotStore?.setUserTriggeredThink?.(false);
        const thinkPrompt = `Create the PRD and TRD for ${name} based on this mission: ${desc}`;
        const recoverThinkDocuments = async (): Promise<boolean> => {
          if (coPilotStore?.discoveryDocuments) return true;
          const sandboxId = coPilotStore?.agentSandboxId;
          if (!sandboxId) return false;
          try {
            const { readWorkspaceFile } = await import("@/lib/openclaw/workspace-writer");
            const [prdContent, trdContent] = await Promise.all([
              readWorkspaceFile(sandboxId, ".openclaw/discovery/PRD.md"),
              readWorkspaceFile(sandboxId, ".openclaw/discovery/TRD.md"),
            ]);
            if (!prdContent || !trdContent) return false;
            const parse = (md: string) => {
              const lines = md.split("\n");
              const title = lines[0]?.replace(/^#\s+/, "") ?? "Document";
              const sections: Array<{ heading: string; content: string }> = [];
              let heading = "";
              let content: string[] = [];
              for (const line of lines.slice(1)) {
                if (line.startsWith("## ")) {
                  if (heading) sections.push({ heading, content: content.join("\n").trim() });
                  heading = line.replace(/^##\s+/, "");
                  content = [];
                } else {
                  content.push(line);
                }
              }
              if (heading) sections.push({ heading, content: content.join("\n").trim() });
              return { title, sections };
            };
            coPilotStore?.setDiscoveryDocuments?.({ prd: parse(prdContent), trd: parse(trdContent) });
            coPilotStore?.setThinkStatus?.("ready");
            coPilotStore?.setUserTriggeredThink?.(false);
            return true;
          } catch (err) {
            console.warn("[Think] Failed to read docs from workspace:", err);
            return false;
          }
        };
        sendChatMessage(thinkPrompt, { silent: true })
          .then(() => recoverThinkDocuments())
          .catch(async () => {
            const recovered = await recoverThinkDocuments();
            if (!recovered) coPilotStore?.setThinkStatus?.("failed");
          });
      }
    }
  }, [coPilotStore?.devStage, coPilotStore?.thinkStatus, coPilotStore?.thinkRunId, coPilotStore?.discoveryDocuments, coPilotStore?.name, coPilotStore?.description, coPilotStore?.userTriggeredThink, coPilotStore?.lastDispatchedThinkRunId, isLoading, sendChatMessage]);

  // ── Auto-trigger plan generation when Think → Plan transition occurs ────
  useEffect(() => {
    if (coPilotStore?.userTriggeredPlan && !coPilotStore?.planRunId) {
      coPilotStore?.setUserTriggeredPlan?.(true);
      return;
    }

    const planRunId = coPilotStore?.planRunId ?? null;
    if (
      coPilotStore?.devStage === "plan" &&
      coPilotStore?.planStatus === "generating" &&
      coPilotStore?.userTriggeredPlan &&
      Boolean(planRunId) &&
      coPilotStore?.lastDispatchedPlanRunId !== planRunId &&
      !isLoading
    ) {
      coPilotStore?.markPlanRunDispatched?.(planRunId);
      coPilotStore?.setUserTriggeredPlan?.(false);
      // Build a message that includes the approved PRD/TRD for the architect
      const docs = coPilotStore.discoveryDocuments;
      let planPrompt = "Generate the architecture plan for this agent.";
      if (docs) {
        const prdSummary = docs.prd.sections.map((s) => `### ${s.heading}\n${s.content}`).join("\n\n");
        const trdSummary = docs.trd.sections.map((s) => `### ${s.heading}\n${s.content}`).join("\n\n");
        planPrompt = `The user has approved the following requirements. Generate a structured architecture plan.\n\n## PRD: ${docs.prd.title}\n${prdSummary}\n\n## TRD: ${docs.trd.title}\n${trdSummary}`;
      }
      sendChatMessage(planPrompt, { silent: true })
        .then(async () => {
          // Plan message completed — architect should have written architecture.json
          // to the workspace. Read it and populate the store (reliable, no marker parsing).
          if (!coPilotStore?.architecturePlan) {
            const sandboxId = coPilotStore?.agentSandboxId;
            if (sandboxId) {
              try {
                const { readWorkspaceFile } = await import("@/lib/openclaw/workspace-writer");
                const planJson = await readWorkspaceFile(sandboxId, ".openclaw/plan/architecture.json");
                if (planJson) {
                  const { normalizePlan } = await import("@/lib/openclaw/plan-formatter");
                  const plan = normalizePlan(JSON.parse(planJson));
                  coPilotStore?.setArchitecturePlan?.(plan);
                  coPilotStore?.setPlanStatus?.("ready");
                }
              } catch (err) {
                console.warn("[Plan] Failed to read plan from workspace:", err);
              }
            }
          }
        })
        .catch(() => {
          coPilotStore?.setPlanStatus?.("failed");
        });
    }
  }, [coPilotStore?.devStage, coPilotStore?.planStatus, coPilotStore?.planRunId, coPilotStore?.userTriggeredPlan, isLoading, coPilotStore?.discoveryDocuments, coPilotStore?.lastDispatchedPlanRunId, sendChatMessage]);

  // Plan approval is user-gated — the user clicks "Approve & Start Build"
  // in the Plan stage UI (LifecycleStepRenderer StagePlan). No auto-approval.
  // This gives users time to review the architecture plan before build starts.

  const agentLogo = "/assets/logos/favicon.svg";
  const loadingOlderHistory = false;

  // ── Resizable split ───────────────────────────────────────────────────
  const STORAGE_KEY = "agent-workspace-split";
  const defaultPct = isBuilderMode ? 55 : 50;
  const [splitPct, setSplitPct] = useState<number>(() => {
    if (typeof window === "undefined") return defaultPct;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : defaultPct;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isWorkspaceFullscreen, setIsWorkspaceFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = 100 - (x / rect.width) * 100;
      const clamped = Math.min(70, Math.max(30, pct));
      setSplitPct(clamped);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(STORAGE_KEY, String(splitPct));
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, splitPct]);

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isWorkspaceFullscreen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsWorkspaceFullscreen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isWorkspaceFullscreen]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`flex h-full flex-row flex-1 overflow-hidden min-h-0 ${isResizing ? "select-none cursor-col-resize" : ""}`}>

      {/* ── LEFT: Chat column ── */}
      <div className={`flex flex-col overflow-hidden min-h-0 min-w-0 ${isWorkspaceFullscreen && showComputer ? "hidden" : "flex-1"}`} style={showComputer && !isWorkspaceFullscreen ? { width: `${100 - splitPct}%`, minWidth: 360 } : undefined}>
        {/* Toolbar */}
        <div className="shrink-0 flex items-center justify-between px-5 py-2 border-b border-[var(--border-default)]">
          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] hover:bg-[var(--color-light)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Plus className="h-3 w-3" />
            New Chat
          </button>

          <div className="flex items-center gap-2">
            {isBuilderMode && (
              <>
                <span
                  data-testid="builder-agent-name"
                  className="max-w-[180px] truncate text-xs font-satoshi-bold text-[var(--text-primary)]"
                >
                  {builderDisplayName}
                </span>
                {builderDraftStatusLabel && (
                  <span
                    data-testid="builder-draft-status"
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-satoshi-bold ${
                      effectiveDraftSaveStatus === "error"
                        ? "border-[var(--error)]/20 bg-[var(--error)]/10 text-[var(--error)]"
                        : "border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        effectiveDraftSaveStatus === "saving"
                          ? "bg-[var(--primary)] animate-pulse"
                          : effectiveDraftSaveStatus === "error"
                          ? "bg-[var(--error)]"
                          : "bg-[var(--primary)]"
                      }`}
                    />
                    {builderDraftStatusLabel}
                  </span>
                )}
              </>
            )}
            <button
              onClick={() => setShowComputer(p => !p)}
              title={showComputer ? "Hide workspace" : "Show workspace"}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-satoshi-medium border transition-colors ${
                showComputer
                  ? "border-[var(--primary)]/30 text-[var(--primary)] bg-[var(--primary)]/5"
                  : "border-[var(--border-stroke)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--color-light)]"
              }`}
            >
              <SplitSquareHorizontal className="h-3 w-3" />
              <span className="hidden sm:inline">Workspace</span>
            </button>
          </div>
        </div>

        {memoryBanner && (
          <div className="shrink-0 border-b border-[var(--border-default)] bg-[var(--primary)]/5 px-5 py-2">
            <p className="text-xs font-satoshi-medium text-[var(--primary)]">
              {memoryBanner}
            </p>
          </div>
        )}

        {isBuilderMode && stageContext && (
          <ChatStageContextBar context={stageContext} />
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-0">
          <div className="max-w-2xl mx-auto md:ml-8 py-6 space-y-6">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 text-[var(--text-tertiary)] animate-spin" />
              </div>
            ) : (
              <>
                {hasMoreHistory && (
                  <div className="flex justify-center">
                    <button
                      onClick={loadOlderHistory}
                      disabled={loadingOlderHistory}
                      className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30 transition-colors disabled:opacity-50"
                    >
                      {loadingOlderHistory ? "Loading older messages…" : "Load older messages"}
                    </button>
                  </div>
                )}
                {/* Empty state */}
                {visibleMessages.length === 0 && !isLoading && (
                  <div className="flex items-start gap-3 animate-fadeIn">
                    <div className="shrink-0 w-8 h-8 flex items-center justify-center">
                      <AnimatedRuhLogo mode="alive" size={32} />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <AgentLabel name={agent.name} logo={agentLogo} />
                      {isBuilderMode ? (
                        <div className="space-y-4 mt-1">
                          <p className="text-sm font-satoshi-regular text-[var(--text-primary)] leading-relaxed">
                            {isFeatureMode
                              ? `Describe the feature you want to add to ${featureCtx?.baselineAgent.name ?? "your agent"}.`
                              : "Describe the agent you want to build. I'll design its skills, integrations, and deployment config."}
                          </p>
                          <div className="space-y-2">
                            <p className="text-[10px] font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                              {isFeatureMode ? `Feature: ${featureCtx?.title ?? ""}` : builderSuggestionDescription.trim().length > 0 ? "Suggested prompts" : "Try an example"}
                            </p>
                            {builderSuggestions.map((example) => (
                              <button
                                key={`${example.label}-${example.prompt.slice(0, 30)}`}
                                onClick={() => {
                                  if (example.mode) {
                                    coPilotStore?.setChatMode(example.mode);
                                  }
                                  setInput(example.prompt);
                                  setTimeout(() => textareaRef.current?.focus(), 50);
                                }}
                                className="block w-full text-left px-3 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--card-color)] text-xs font-satoshi-regular text-[var(--text-secondary)] hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5 transition-colors leading-relaxed"
                              >
                                <span className="block text-[11px] font-satoshi-bold text-[var(--text-primary)]">
                                  {example.label}
                                </span>
                                <span className="mt-1 block text-[var(--text-secondary)]">
                                  {example.prompt}
                                </span>
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-4 pt-1">
                            {(isFeatureMode ? ["Discover", "Plan", "Build", "Review", "Test", "Merge"] : ["Think", "Plan", "Build", "Review → Test → Ship"]).map((label, i, arr) => (
                              <div key={label} className="flex items-center gap-1.5">
                                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `color-mix(in srgb, var(--primary) ${100 - i * 15}%, transparent)` }} />
                                  {label}
                                </div>
                                {i < arr.length - 1 && <span className="text-[var(--text-tertiary)]/30 ml-1.5">→</span>}
                              </div>
                            ))}
                            <span className="text-[10px] font-mono text-[var(--text-tertiary)]/50 ml-auto">{isFeatureMode ? "~1–3 min" : "~3–5 min"}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm font-satoshi-regular text-[var(--text-primary)] leading-relaxed">
                          Hi! I&apos;m <strong>{agent.name}</strong>. How can I help you today?
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {visibleMessages.map(msg =>
                  msg.role === "user" ? (
                    <div key={msg.id} className="flex justify-end animate-fadeIn">
                      <div className="bg-[var(--user-bubble,#f0f0ef)] text-sm font-satoshi-regular text-[var(--text-primary)] rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] shadow-sm">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div key={msg.id} className="flex items-start gap-3 animate-fadeIn">
                      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5">
                        <Image src={agentLogo} alt={agent.name} width={32} height={32} className="rounded-full" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <AgentLabel name={agent.name} logo={agentLogo} />
                        {msg.taskPlan && (
                          <TaskPlanPanel plan={msg.taskPlan} isLive={false} />
                        )}
                        {msg.steps && msg.steps.length > 0 && (
                          <TaskList steps={msg.steps} tick={0} isLive={false} />
                        )}
                        {/* Builder mode: clarification questions */}
                        {msg.questions && msg.questions.length > 0 ? (
                          <ClarificationMessage
                            context={msg.clarificationContext}
                            questions={msg.questions}
                            onSelectOption={(text) => {
                              setInput(text);
                              onSelectOption?.(text);
                            }}
                          />
                        ) : stripPlanTags(msg.content).trim() ? (
                          <MessageContent content={stripPlanTags(msg.content)} />
                        ) : null}
                      </div>
                    </div>
                  )
                )}

                {/* Builder mode: Proceed to Review card (only in Advanced mode, not copilot) */}
                {isBuilderMode && !showCoPilotConfig && builderState?.skillGraph && !isLoading && (
                  <div className="flex justify-center animate-fadeIn">
                    <button
                      onClick={onReadyForReview}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-satoshi-bold shadow-md hover:opacity-90 transition-opacity"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Proceed to Review
                    </button>
                  </div>
                )}

                {/* Live bubble */}
                {isLoading && activeRunSurface !== "workspace" && (
                  <div className="flex items-start gap-3 animate-fadeIn">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5">
                      <Image
                        src={agentLogo}
                        alt={agent.name}
                        width={28}
                        height={28}
                        className={liveResponse ? "" : "animate-spin"}
                      />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <AgentLabel name={agent.name} logo={agentLogo} />

                      {/* Live task plan */}
                      {liveTaskPlan && (
                        <TaskPlanPanel plan={liveTaskPlan} isLive={true} />
                      )}

                      {/* Live task list */}
                      {liveSteps.length > 0 && (
                        <TaskList steps={liveSteps} tick={tick} isLive={true} />
                      )}

                      {/* Streaming response */}
                      {liveResponse && <MessageContent content={stripPlanTags(liveResponse)} />}

                      {/* Initial thinking state — Manus-style minimal */}
                      {liveSteps.length === 0 && !liveResponse && (
                        <div className="flex items-center gap-2 py-0.5">
                          <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" />
                          <span className="text-sm font-satoshi-regular text-[var(--text-tertiary)]">Thinking</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Task progress footer — Manus-style persistent bar above input */}
        <TaskProgressFooter
          isLoading={isLoading}
          taskPlan={liveTaskPlan}
          liveSteps={liveSteps}
          tick={tick}
          sandboxId={activeSandbox?.sandbox_id ?? null}
          onThumbnailClick={() => setShowComputer(true)}
          onScrollToBottom={() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
        />

        {/* Pending architect questions (Think/Plan checkpoints) */}
        {isBuilderMode && coPilotStore && coPilotStore.pendingQuestions && coPilotStore.pendingQuestions.length > 0 && (
          <div className="shrink-0 pt-3">
            <PendingQuestionsPanel
              questions={coPilotStore.pendingQuestions}
              disabled={isLoading}
              onSubmit={(composed) => sendChatMessage(composed)}
            />
          </div>
        )}

        {/* Input bar */}
        <div className="shrink-0 px-4 md:px-0 pb-6 pt-3">
          <div className="max-w-2xl mx-auto md:ml-8">
            {isBuilderMode && coPilotStore && stageContext && (
              <div className="mb-2 flex items-center justify-between gap-3">
                <ChatModeControl
                  value={stageContext.mode}
                  allowed={allowedChatModes}
                  onChange={(mode) => coPilotStore.setChatMode(mode)}
                />
                {stageContext.primaryArtifact ? (
                  <button
                    type="button"
                    onClick={() => {
                      coPilotStore.setSelectedArtifactTarget(null);
                      coPilotStore.setChatMode("ask");
                    }}
                    className="text-[11px] font-satoshi-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    Clear target
                  </button>
                ) : null}
              </div>
            )}
            <div className="relative flex items-end gap-2 border border-[var(--border-default)] rounded-2xl bg-white px-4 py-3 shadow-sm focus-within:border-[var(--primary)]/40 transition-colors">
              <AnimatedRuhLogo mode="idle" size={20} className="shrink-0 mb-1 opacity-30" />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={getStageInputPlaceholder(coPilotStore?.devStage, isBuilderMode, agent.name, isFeatureMode)}
                disabled={(isLoading && !isBuilderMode) || (!isBuilderMode && !activeSandbox)}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm font-satoshi-regular text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-none min-h-[24px] max-h-[120px] leading-relaxed disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading || (!isBuilderMode && !activeSandbox)}
                className="p-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-tertiary)] hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)] disabled:hover:border-[var(--border-default)] transition-all shrink-0 mb-0.5"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-center text-[11px] font-satoshi-regular text-[var(--text-tertiary)] mt-2">
              {isBuilderMode
                ? "Powered by Ruh AI architect agent"
                : activeSandbox
                ? <>Running on <span className="font-mono">{activeSandbox.sandbox_id.slice(0, 8)}…</span></>
                : "No sandbox selected"}
            </p>
          </div>
        </div>
      </div>

      {/* ── RESIZE HANDLE ── */}
      {showComputer && !isWorkspaceFullscreen && (
        <div
          onMouseDown={handleMouseDown}
          className={`shrink-0 w-1 cursor-col-resize group relative z-10 ${isResizing ? "bg-[var(--primary)]/30" : "hover:bg-[var(--primary)]/20"} transition-colors`}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
      )}

      {/* ── RIGHT: Computer view ── */}
      {showComputer && (
        <div
          className={`shrink-0 flex flex-col overflow-hidden bg-[var(--card-color)] ${isWorkspaceFullscreen ? "flex-1" : ""}`}
          style={isWorkspaceFullscreen ? undefined : { width: `${splitPct}%`, minWidth: 480 }}
        >
          <ComputerView
            liveSteps={liveSteps}
            messages={messages}
            isLoading={isLoading}
            tick={tick}
            liveBrowserState={liveBrowserState}
            onResumeTakeover={resumeBrowserTakeover}
            activeSandboxId={activeSandbox?.sandbox_id ?? null}
            conversationId={selectedConvId ?? conversationId}
            vncAvailable={Boolean(activeSandbox?.vnc_port)}
            taskPlan={liveTaskPlan}
            activeEditorFile={activeEditorFile}
            recentEditorFiles={recentEditorFiles}
            onEditorFileSelect={handleEditorFileSelect}
            mode={mode}
            builderState={builderState}
            onBuilderNameChange={name => onBuilderStateChange?.({ systemName: name })}
            onBuilderRulesChange={rules => onBuilderStateChange?.({ agentRules: rules })}
            existingAgent={agent}
            isFullscreen={isWorkspaceFullscreen}
            onToggleFullscreen={() => setIsWorkspaceFullscreen(f => !f)}
              showCoPilotConfig={showCoPilotConfig}
              onBuilderComplete={onBuilderComplete}
              canBuilderComplete={canBuilderComplete}
              isCompletingBuilder={isCompletingBuilder}
              coPilotPhase={effectiveCoPilotPhase}
              triggerLabel={triggerLabel}
              onTerminalCommand={handleTerminalCommand}
              workspaceFilesTick={workspaceFilesTick}
              detectedPreviewPorts={detectedPreviewPorts}
              onPreviewStart={() => {
                sendChatMessage(
                  "Look at the current workspace directory. Figure out what project is here, how to install dependencies and start a dev server. Then start the dev server and tell me the URL and port it's running on. If there's no project, create a simple index.html with a status page showing the agent's capabilities.",
                  { silent: true },
                );
              }}
              onDiscoveryComplete={onDiscoveryComplete}
              onPlanApproved={onPlanApproved}
              onRetryBuild={onRetryBuild}
              onCancelBuild={onCancelBuild}
              onDone={onDone}
              onRequestArtifactChange={(target) => {
                coPilotStore?.setSelectedArtifactTarget(target);
                coPilotStore?.setChatMode("revise");
                setShowComputer(false);
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
            />
        </div>
      )}
    </div>
  );
}
