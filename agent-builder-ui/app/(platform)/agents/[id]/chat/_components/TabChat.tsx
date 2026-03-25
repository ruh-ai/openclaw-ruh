"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Send, Plus, ChevronDown, ChevronUp, CheckCircle2,
  Wrench, Terminal, Loader2, Brain, PenLine, SplitSquareHorizontal, Globe, Files,
} from "lucide-react";
import Image from "next/image";
import MessageContent from "@/app/(platform)/agents/create/_components/MessageContent";
import type { SavedAgent } from "@/hooks/use-agents-store";
import { getEffectiveChatModel } from "@/lib/openclaw/shared-codex";
import {
  applyBrowserWorkspaceEvent,
  createEmptyBrowserWorkspaceState,
  extractBrowserWorkspaceEvent,
  type BrowserWorkspaceEvent,
  type BrowserWorkspaceState,
} from "@/lib/openclaw/browser-workspace";
import BrowserPanel from "./BrowserPanel";
import FilesPanel from "./FilesPanel";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ─────────────────────────────────────────────────────────────────

type StepKind   = "thinking" | "tool" | "writing";
type StepStatus = "active"   | "done";

interface AgentStep {
  id:         number;
  kind:       StepKind;
  label:      string;
  detail?:    string;
  toolName?:  string;
  status:     StepStatus;
  startedAt:  number;
  elapsedMs?: number;
}

interface SandboxRecord {
  sandbox_id:    string;
  sandbox_name:  string;
  sandbox_state?: string;
  gateway_port?:  number;
  approved?:      boolean;
  created_at?:    string;
  shared_codex_enabled?: boolean;
  shared_codex_model?: string | null;
}

interface ChatMessage {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  steps?:  AgentStep[];
  browserState?: BrowserWorkspaceState;
}

interface TabChatProps {
  agent:                 SavedAgent;
  activeSandbox:         SandboxRecord | null;
  selectedConvId:        string | null;
  onConversationCreated: (convId: string) => void;
}

interface MessageHistoryPage {
  messages: Array<{ id?: number; role: string; content: string }>;
  next_cursor: number | null;
  has_more: boolean;
}

let msgCounter = 0;
const newId = () => `msg-${msgCounter++}`;

// ─── StepBadge ─────────────────────────────────────────────────────────────

function StepBadge({ num, status }: { num: number; status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="w-5 h-5 rounded-full bg-[var(--success)]/15 flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
      </span>
    );
  }
  return (
    <span className="relative flex w-5 h-5 items-center justify-center shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-25" />
      <span className="relative w-5 h-5 rounded-full bg-[var(--primary)]/15 border border-[var(--primary)]/40 flex items-center justify-center">
        <span className="text-[9px] font-satoshi-bold text-[var(--primary)]">{num}</span>
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
      {/* Header row */}
      <div className="flex items-center gap-2.5 group">
        <StepBadge num={index + 1} status={step.status} />

        {/* Kind icon */}
        {step.kind === "thinking" && <Brain  className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />}
        {step.kind === "writing"  && <PenLine className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />}
        {step.kind === "tool" && (
          step.toolName === "exec" || step.toolName === "bash" || step.toolName === "terminal"
            ? <Terminal className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
            : <Wrench   className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
        )}

        <span className={`text-sm font-satoshi-medium flex-1 ${
          step.status === "active" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}>
          {step.label}
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

      <div className="flex flex-col divide-y divide-[var(--border-stroke)]/40">
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
      <span className="text-[10px] font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-widest">
        {name}
      </span>
    </div>
  );
}

// ─── ComputerView — right panel showing agent's workspace ──────────────────

function ComputerView({
  liveSteps,
  messages,
  isLoading,
  tick,
  liveBrowserState,
  onResumeTakeover,
  activeSandboxId,
  workspaceScopeKey,
}: {
  liveSteps:        AgentStep[];
  messages:         ChatMessage[];
  isLoading:        boolean;
  tick:             number;
  liveBrowserState: BrowserWorkspaceState;
  onResumeTakeover: () => void;
  activeSandboxId: string | null;
  workspaceScopeKey: string;
}) {
  const [activeTab, setActiveTab] = useState<"terminal" | "thinking" | "browser" | "files">("terminal");
  const terminalScrollRef = useRef<HTMLDivElement>(null);
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

  // Auto-switch to browser tab when first browser item appears
  useEffect(() => {
    if (allBrowser.length > 0 && allTools.length === 0 && allThinks.length === 0) {
      setActiveTab("browser");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBrowser.length]);

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
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            isLoading ? "bg-green-400 animate-pulse" : "bg-white/15"
          }`} />
          <span className="text-[10px] font-satoshi-bold text-white/40 uppercase tracking-widest">
            Agent&apos;s Workspace
          </span>
        </div>

        {/* Tabs */}
        <div className="ml-auto flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
          {(["terminal", "files", "browser", "thinking"] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-satoshi-bold capitalize transition-colors ${
                activeTab === t
                  ? "bg-white/12 text-white/80"
                  : "text-white/25 hover:text-white/50"
              }`}
            >
              {t === "files" && <Files className="h-2.5 w-2.5" />}
              {t === "browser" && <Globe className="h-2.5 w-2.5" />}
              {t}
              {t === "browser" && allBrowser.length > 0 && (
                <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-blue-400/60" />
              )}
              {t === "browser" && takeover?.status === "requested" && (
                <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-amber-300/80" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal tab */}
      {activeTab === "terminal" && (
        <div ref={terminalScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {allTools.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Terminal className="h-7 w-7 text-white/8 mb-3" />
              <p className="text-[10px] font-mono text-white/15">No commands run yet</p>
            </div>
          ) : (
            allTools.map((step, i) => (
              <div key={`${step.id}-${i}`}>
                {/* Tool header */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest">
                    {step.toolName ?? "tool"}
                  </span>
                  {step.status === "done"
                    ? <span className="text-green-400/60 text-[9px]">
                        ✓{step.elapsedMs != null ? ` ${(step.elapsedMs / 1000).toFixed(1)}s` : ""}
                      </span>
                    : <span className="text-yellow-400/50 text-[9px] animate-pulse">running…</span>
                  }
                </div>
                {/* Command block */}
                <div className="rounded-lg bg-zinc-900/80 border border-white/5 px-3 py-2.5">
                  <span className="text-green-400/60 font-mono text-[11px] select-none">$ </span>
                  <span className="font-mono text-[11px] text-green-300/80 whitespace-pre-wrap break-all">
                    {step.detail ?? "…"}
                  </span>
                  {step.status === "active" && (
                    <span className="animate-pulse text-green-400/60 ml-0.5 font-mono">▋</span>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Idle cursor */}
          {isLoading && liveTools.length === 0 && liveThink === undefined && (
            <div className="flex items-center gap-1.5 text-white/15 font-mono text-[11px]">
              <span className="text-green-400/40 select-none">$</span>
              <span className="animate-pulse">▋</span>
            </div>
          )}
        </div>
      )}

      {/* Thinking tab */}
      {activeTab === "thinking" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {allThinks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Brain className="h-7 w-7 text-white/8 mb-3" />
              <p className="text-[10px] font-mono text-white/15">No reasoning captured yet</p>
            </div>
          ) : (
            allThinks.map((step, i) => (
              <div key={`${step.id}-${i}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest">
                    Turn {i + 1}
                  </span>
                  {step.status === "active" && (
                    <span className="text-[9px] font-mono text-blue-400/50 animate-pulse">thinking…</span>
                  )}
                </div>
                <p className="text-[11px] font-mono text-white/40 whitespace-pre-wrap leading-relaxed">
                  {step.detail ?? "…"}
                  {step.status === "active" && (
                    <span className="animate-pulse text-white/30 ml-0.5">▋</span>
                  )}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Browser tab */}
      {activeTab === "files" && (
        <FilesPanel sandboxId={activeSandboxId} scopeKey={workspaceScopeKey} />
      )}

      {/* Browser tab */}
      {activeTab === "browser" && (
        <BrowserPanel
          items={allBrowser}
          isLoading={isLoading}
          previewUrl={previewUrl}
          takeover={takeover}
          onResumeTakeover={onResumeTakeover}
        />
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function TabChat({ agent, activeSandbox, selectedConvId, onConversationCreated }: TabChatProps) {
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [input,          setInput]          = useState("");
  const [isLoading,      setIsLoading]      = useState(false);
  const [liveSteps,      setLiveSteps]      = useState<AgentStep[]>([]);
  const [liveResponse,   setLiveResponse]   = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const [messageCursor, setMessageCursor] = useState<number | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [showComputer,   setShowComputer]   = useState(true);
  const [liveBrowserState, setLiveBrowserState] = useState<BrowserWorkspaceState>(createEmptyBrowserWorkspaceState);

  // Tick for live elapsed re-renders
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isLoading) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [isLoading]);

  const scrollRef        = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const lastLoadedConvId = useRef<string | null>(null);
  const parserRef        = useRef<{
    rawBuf:      string;
    stepCounter: number;
    phase:       "pre_think" | "in_think" | "post_think" | "in_tool" | "writing";
  }>({ rawBuf: "", stepCounter: 0, phase: "pre_think" });
  const liveStepsRef     = useRef<AgentStep[]>([]);

  // ── Code block parser — extracts terminal commands from streamed markdown ──
  // The OpenClaw gateway runs tools internally and only streams back text.
  // We parse the markdown to detect code blocks and show them in the terminal panel.
  const codeBlockRef = useRef<{
    fullText:       string;   // accumulated full response text
    inCodeBlock:    boolean;  // inside a ``` block
    codeContent:    string;   // accumulated code block content
    codeLang:       string;   // language hint after ```
    activeStepId:   number;   // step id for current code block (-1 = none)
    lastCommand:    string;   // last backtick command detected before code block
  }>({
    fullText: "", inCodeBlock: false, codeContent: "",
    codeLang: "", activeStepId: -1, lastCommand: "",
  });

  // ── Browser item parser — extracts images and URLs from streamed markdown ──
  const browserParserRef = useRef<{
    fullText:      string;
    scannedUpTo:   number;  // index in fullText up to which we've already scanned
    seenUrls:      Set<string>;
  }>({ fullText: "", scannedUpTo: 0, seenUrls: new Set() });
  const liveBrowserStateRef = useRef<BrowserWorkspaceState>(createEmptyBrowserWorkspaceState());
  // Tracks the last browser tool name so the result handler can synthesize screenshot events
  const lastBrowserToolRef = useRef<string | null>(null);

  const effectiveModel = getEffectiveChatModel(agent.model, activeSandbox);

  // ── Scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [messages, isLoading, liveResponse, liveSteps.length]);

  // ── Auto-resize textarea ──────────────────────────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // ── Reset on sandbox change ───────────────────────────────────────────
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setMessageCursor(null);
    setHasMoreHistory(false);
    setLiveBrowserState(createEmptyBrowserWorkspaceState());
    lastLoadedConvId.current = null;
  }, [activeSandbox?.sandbox_id]);

  // ── Load conversation history ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedConvId || !activeSandbox) return;
    if (selectedConvId === lastLoadedConvId.current) return;
    lastLoadedConvId.current = selectedConvId;
    setConversationId(selectedConvId);
    setMessages([]);
    setMessageCursor(null);
    setHasMoreHistory(false);
    setLoadingHistory(true);

    fetch(`${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/conversations/${selectedConvId}/messages?limit=50`)
      .then(r => r.json())
      .then((data: unknown) => {
        const page = data as MessageHistoryPage;
        const arr: Array<{ role: string; content: string }> = page.messages ?? [];
        setMessages(arr.map(m => ({
          id:      newId(),
          role:    m.role === "user" ? "user" : "assistant",
          content: m.content,
        })));
        setMessageCursor(page.next_cursor);
        setHasMoreHistory(page.has_more);
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [selectedConvId, activeSandbox?.sandbox_id]);

  const loadOlderHistory = useCallback(async () => {
    if (!activeSandbox || !conversationId || messageCursor == null || loadingOlderHistory) return;

    setLoadingOlderHistory(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/conversations/${conversationId}/messages?limit=50&before=${messageCursor}`,
      );
      if (!res.ok) return;
      const page = (await res.json()) as MessageHistoryPage;
      setMessages((prev) => [
        ...page.messages.map((m) => ({
          id: newId(),
          role: m.role === "user" ? "user" as const : "assistant" as const,
          content: m.content,
        })),
        ...prev,
      ]);
      setMessageCursor(page.next_cursor);
      setHasMoreHistory(page.has_more);
    } finally {
      setLoadingOlderHistory(false);
    }
  }, [activeSandbox, conversationId, loadingOlderHistory, messageCursor]);

  // ── Helpers ───────────────────────────────────────────────────────────

  const ensureConversation = useCallback(async (sandboxId: string): Promise<string> => {
    if (conversationId) return conversationId;
    const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/conversations`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name:  `Chat – ${new Date().toLocaleString()}`,
        model: effectiveModel,
      }),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    const conv = await res.json();
    // Mark as already loaded so the history-load useEffect doesn't clear in-flight messages
    lastLoadedConvId.current = conv.id;
    setConversationId(conv.id);
    onConversationCreated(conv.id);
    return conv.id;
  }, [conversationId, effectiveModel, onConversationCreated]);

  const persistMessages = useCallback(async (
    sandboxId: string,
    convId:    string,
    entries:   Array<{ role: string; content: string }>
  ) => {
    try {
      await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/conversations/${convId}/messages`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: entries }),
      });
    } catch { /* non-critical */ }
  }, []);

  // ── Step mutations ────────────────────────────────────────────────────

  const pushStep = useCallback((step: AgentStep) => {
    liveStepsRef.current = [...liveStepsRef.current, step];
    setLiveSteps([...liveStepsRef.current]);
  }, []);

  const finishStep = useCallback((id: number, detail?: string) => {
    liveStepsRef.current = liveStepsRef.current.map(s =>
      s.id === id
        ? { ...s, status: "done" as StepStatus, detail, elapsedMs: Date.now() - s.startedAt }
        : s
    );
    setLiveSteps([...liveStepsRef.current]);
  }, []);

  const updateStepDetail = useCallback((id: number, detail: string) => {
    liveStepsRef.current = liveStepsRef.current.map(s =>
      s.id === id ? { ...s, detail } : s
    );
    setLiveSteps([...liveStepsRef.current]);
  }, []);

  // ── Code block detector — parses streaming text for terminal output ──
  const processCodeBlocks = useCallback((newDelta: string) => {
    const cb = codeBlockRef.current;
    cb.fullText += newDelta;

    // Scan the new delta for ``` markers
    // We need to check the tail of fullText for partial/complete ``` sequences
    const text = cb.fullText;

    if (!cb.inCodeBlock) {
      // Look for opening ``` in the full text (check from recent portion)
      const searchFrom = Math.max(0, text.length - newDelta.length - 10);
      const openIdx = text.indexOf("```", searchFrom);
      if (openIdx !== -1 && openIdx >= searchFrom) {
        cb.inCodeBlock = true;
        cb.codeContent = "";

        // Extract language hint (e.g. ```bash or ```sh or ```shell or just ```)
        const afterTicks = text.slice(openIdx + 3);
        const langMatch = afterTicks.match(/^(\w+)/);
        cb.codeLang = langMatch ? langMatch[1] : "";

        // Content starts after the first newline following ```[lang]
        const nlIdx = afterTicks.indexOf("\n");
        if (nlIdx !== -1) {
          cb.codeContent = afterTicks.slice(nlIdx + 1);
        }

        // Try to find a command name from text before the code block
        // Look for backtick-wrapped commands like `ls -la` or `pwd`
        const textBefore = text.slice(0, openIdx);
        const cmdMatch = textBefore.match(/`([^`]+)`[^`]*$/);
        if (cmdMatch) {
          cb.lastCommand = cmdMatch[1];
        } else {
          // Try to find command-like words
          const linesBefore = textBefore.split("\n").filter(l => l.trim());
          const lastLine = linesBefore[linesBefore.length - 1] || "";
          // Check for patterns like "Output of ls -la:" or "Running: pwd"
          const cmdPattern = lastLine.match(/(?:output of|running|executing|command|ran)\s*:?\s*`?([^`:\n]+)`?/i);
          cb.lastCommand = cmdPattern ? cmdPattern[1].trim() : "";
        }

        // Determine tool name from language or command
        const isTerminal = !cb.codeLang ||
          ["bash", "sh", "shell", "zsh", "terminal", "console", "cmd"].includes(cb.codeLang.toLowerCase());

        const toolName = isTerminal ? "terminal" : cb.codeLang;
        const label = cb.lastCommand
          ? cb.lastCommand
          : (isTerminal ? "Terminal output" : `Code: ${cb.codeLang}`);

        // Create a tool step
        const id = parserRef.current.stepCounter++;
        cb.activeStepId = id;
        pushStep({
          id,
          kind: "tool",
          label: `${label}`,
          toolName,
          detail: cb.codeContent.replace(/```[\s]*$/, "").trimEnd() || "executing…",
          status: "active",
          startedAt: Date.now(),
        });
      }
    } else {
      // Inside a code block — accumulate content and check for closing ```
      // We need to re-check from the tail of fullText
      const openIdx = cb.fullText.lastIndexOf("```", cb.fullText.length - newDelta.length - 5);
      // Actually, simpler: just get everything after the opening ``` marker
      // and check for a closing ```
      cb.codeContent += newDelta;

      // Check if the code block is now closed
      const closeIdx = cb.codeContent.indexOf("```");
      if (closeIdx !== -1) {
        // Code block closed
        const finalContent = cb.codeContent.slice(0, closeIdx).trimEnd();
        cb.inCodeBlock = false;

        if (cb.activeStepId !== -1) {
          const detail = cb.lastCommand
            ? `${cb.lastCommand}\n${finalContent}`
            : finalContent;
          finishStep(cb.activeStepId, detail);
          cb.activeStepId = -1;
        }

        cb.codeContent = "";
        cb.codeLang = "";
        cb.lastCommand = "";
      } else {
        // Still accumulating — update the step detail
        if (cb.activeStepId !== -1) {
          const currentContent = cb.codeContent.trimEnd();
          const detail = cb.lastCommand
            ? `${cb.lastCommand}\n${currentContent}`
            : currentContent;
          updateStepDetail(cb.activeStepId, detail);
        }
      }
    }
  }, [pushStep, finishStep, updateStepDetail]);

  // ── Browser content detector — parses streaming text for images & URLs ──
  // Only scans completed lines (up to last \n) to avoid matching partial URLs
  // as the text streams in character by character.
  const processForBrowser = useCallback((newDelta: string) => {
    const bp = browserParserRef.current;
    bp.fullText += newDelta;

    // Only scan up to the last newline — anything after may be a partial URL
    const lastNl = bp.fullText.lastIndexOf("\n");
    if (lastNl === -1) return; // no complete lines yet
    const endIdx = lastNl + 1;
    if (endIdx <= bp.scannedUpTo) return; // no new complete lines

    // Only scan the NEW completed text (from where we left off)
    const completedText = bp.fullText.slice(bp.scannedUpTo, endIdx);
    bp.scannedUpTo = endIdx;

    // Normalize URL for deduplication: strip trailing punctuation and quotes
    const normalizeUrl = (u: string) => u.replace(/[.),"'`]+$/, "").toLowerCase();

    const addEvent = (event: BrowserWorkspaceEvent) => {
      liveBrowserStateRef.current = applyBrowserWorkspaceEvent(liveBrowserStateRef.current, event);
      setLiveBrowserState({ ...liveBrowserStateRef.current });
    };

    const addItem = (event: BrowserWorkspaceEvent, dedupeKey: string) => {
      const normalized = normalizeUrl(dedupeKey);
      if (bp.seenUrls.has(normalized)) return;
      bp.seenUrls.add(normalized);
      addEvent(event);
    };

    let match;

    // 1. Detect markdown images: ![alt](url)
    const imgRegex = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
    while ((match = imgRegex.exec(completedText)) !== null) {
      addItem({ type: "screenshot", url: match[2], label: match[1] || "Screenshot" }, match[2]);
    }

    // 2. Detect URLs after navigation verbs
    const navRegex = /(?:navigat(?:ing|ed)\s+to|open(?:ing|ed)\s+|brows(?:ing|ed)\s+|visit(?:ing|ed)\s+|going\s+to|fetch(?:ing|ed)|loading)\s+`?(https?:\/\/[^\s`),>"]+)`?/gi;
    while ((match = navRegex.exec(completedText)) !== null) {
      const url = match[1].replace(/[.),"']+$/, "");
      addItem({ type: "navigation", url, label: url }, url);
    }

    // 3. Detect standalone URLs after "URL:" or "Visited URL:" patterns
    const urlRefRegex = /(?:visited\s+)?(?:URL|url|link|page|site|website|webpage)[\s:]+`?(https?:\/\/[^\s`),>"]+)`?/gi;
    while ((match = urlRefRegex.exec(completedText)) !== null) {
      const url = match[1].replace(/[.),"']+$/, "");
      addItem({ type: "navigation", url, label: url }, url);
    }

    // 4. Detect port announcements (for Phase 2 preview)
    const portRegex = /(?:running|started|listening|available|serving)\s+(?:on|at)\s+(?:port\s+|:|\s*)(\d{4,5})/gi;
    while ((match = portRegex.exec(completedText)) !== null) {
      addItem(
        { type: "preview", url: `http://localhost:${match[1]}`, label: `localhost:${match[1]}` },
        `preview:${match[1]}`,
      );
    }
  }, []);

  const resumeBrowserTakeover = useCallback(() => {
    liveBrowserStateRef.current = applyBrowserWorkspaceEvent(liveBrowserStateRef.current, {
      type: "takeover_resumed",
      reason: "Operator marked the browser step as complete",
      actionLabel: "Agent resumed",
    });
    setLiveBrowserState({ ...liveBrowserStateRef.current });
  }, []);

  // ── Send message ──────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading || !activeSandbox) return;

    setInput("");
    setMessages(prev => [...prev, { id: newId(), role: "user", content: text }]);
    setIsLoading(true);
    liveStepsRef.current = [];
    setLiveSteps([]);
    setLiveResponse("");
    parserRef.current = { rawBuf: "", stepCounter: 0, phase: "pre_think" };
    codeBlockRef.current = {
      fullText: "", inCodeBlock: false, codeContent: "",
      codeLang: "", activeStepId: -1, lastCommand: "",
    };
    browserParserRef.current = { fullText: "", scannedUpTo: 0, seenUrls: new Set() };
    liveBrowserStateRef.current = createEmptyBrowserWorkspaceState();
    setLiveBrowserState(createEmptyBrowserWorkspaceState());
    lastBrowserToolRef.current = null;

    let thinkStepId = -1;
    let toolStepId  = -1;
    let writeStepId = -1;

    // OpenAI tool_calls accumulator: { [index]: { name, arguments } }
    const toolCallBuf: Record<number, { name: string; args: string; stepId: number }> = {};

    // Custom event tracking: the OpenClaw gateway sends `event: <phase>` lines
    // followed by `data: { "tool": "...", "name": "..." }` for tool executions
    let currentSSEEvent = "";
    // Track tool step created from custom events (separate from XML/OpenAI tool calls)
    let customToolStepId = -1;

    try {
      const convId = await ensureConversation(activeSandbox.sandbox_id);
      const res = await fetch(`${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          conversation_id: convId,
          messages:        [{ role: "user", content: text }],
          model:           effectiveModel,
          stream:          true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();

      const processDelta = (delta: string) => {
        const p = parserRef.current;
        p.rawBuf += delta;
        const buf = p.rawBuf;

        // pre_think ─────────────────────────────────────────────────────
        if (p.phase === "pre_think") {
          if (buf.startsWith("<think>")) {
            p.phase = "in_think";
            const id = p.stepCounter++;
            thinkStepId = id;
            pushStep({
              id, kind: "thinking", label: "Reasoning",
              status: "active", startedAt: Date.now(),
            });
          } else if (buf.startsWith("<function=")) {
            p.phase = "in_tool";
            processDelta("");
          } else if (buf.length > 0 && !buf.startsWith("<")) {
            p.phase = "writing";
            const id = p.stepCounter++;
            writeStepId = id;
            pushStep({
              id, kind: "writing", label: "Writing response…",
              status: "active", startedAt: Date.now(),
            });
            setLiveResponse(buf);
          }
          return;
        }

        // in_think ──────────────────────────────────────────────────────
        if (p.phase === "in_think") {
          const closeIdx = buf.indexOf("</think>");
          if (closeIdx === -1) {
            updateStepDetail(thinkStepId, buf.slice("<think>".length));
          } else {
            const thinkText = buf.slice("<think>".length, closeIdx);
            finishStep(thinkStepId, thinkText);
            const rest = buf.slice(closeIdx + "</think>".length).trimStart();
            p.rawBuf = rest;
            p.phase  = "post_think";
            if (rest) processDelta("");
          }
          return;
        }

        // post_think ────────────────────────────────────────────────────
        if (p.phase === "post_think") {
          const toolStart = buf.indexOf("<function=");
          if (toolStart === 0) {
            p.phase = "in_tool";
            processDelta("");
          } else if (toolStart > 0) {
            // Text before tool call — emit text, then re-enter post_think for the tool
            const textBefore = buf.slice(0, toolStart).trim();
            if (textBefore) {
              if (writeStepId === -1) {
                const id = p.stepCounter++;
                writeStepId = id;
                pushStep({
                  id, kind: "writing", label: "Writing response…",
                  status: "active", startedAt: Date.now(),
                });
              }
              setLiveResponse(textBefore);
            }
            p.rawBuf = buf.slice(toolStart);
            p.phase = "in_tool";
            processDelta("");
          } else if (toolStart === -1 && buf.length > 0) {
            // No tool call — plain response content
            if (writeStepId === -1) {
              const id = p.stepCounter++;
              writeStepId = id;
              pushStep({
                id, kind: "writing", label: "Writing response…",
                status: "active", startedAt: Date.now(),
              });
            }
            setLiveResponse(buf);
          }
          return;
        }

        // in_tool ───────────────────────────────────────────────────────
        if (p.phase === "in_tool") {
          const nameMatch = buf.match(/<function=([^>]+)>/);
          const toolName  = nameMatch?.[1] ?? "tool";

          if (toolStepId === -1) {
            const id = p.stepCounter++;
            toolStepId = id;
            pushStep({
              id, kind: "tool",
              label: `Using tool: ${toolName}`, toolName,
              status: "active", startedAt: Date.now(),
            });
          }

          const toolEnd = buf.indexOf("</function>");
          const altEnd  = buf.indexOf("</tool_call>");
          let endIdx    = toolEnd !== -1 ? toolEnd + "</function>".length
                        : altEnd  !== -1 ? altEnd  + "</tool_call>".length
                        : -1;

          if (endIdx !== -1) {
            const cmdMatch = buf.match(/<parameter=(?:cmd|command|query|code|path)>([\s\S]*?)<\/parameter>/);
            const detail   = cmdMatch ? cmdMatch[1].trim() : buf.slice(0, 200);
            finishStep(toolStepId, detail);
            toolStepId = -1;
            // Skip trailing </tool_call> if present right after </function>
            const after = buf.slice(endIdx).trimStart();
            if (after.startsWith("</tool_call>")) {
              endIdx = buf.indexOf("</tool_call>", endIdx) + "</tool_call>".length;
            }
            const rest = buf.slice(endIdx).trimStart();
            p.rawBuf = rest;
            p.phase  = "post_think";
            if (rest) processDelta("");
          }
          return;
        }

        // writing ───────────────────────────────────────────────────────
        if (p.phase === "writing") {
          const toolStart = buf.indexOf("<function=");
          if (toolStart === 0) {
            // Tool call immediately — switch to tool mode
            p.phase = "in_tool";
            processDelta("");
          } else if (toolStart > 0) {
            // Text then tool call
            setLiveResponse(buf.slice(0, toolStart).trim());
            p.rawBuf = buf.slice(toolStart);
            p.phase = "in_tool";
            processDelta("");
          } else {
            setLiveResponse(buf);
          }
        }
      };

      // SSE read loop
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        for (const line of chunk.split("\n")) {
          // ── Track SSE event type ──────────────────────────────────
          if (line.startsWith("event: ")) {
            currentSSEEvent = line.slice(7).trim();
            continue;
          }

          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break outer;
          try {
            const parsed = JSON.parse(raw);

            const browserEvent = extractBrowserWorkspaceEvent(parsed);
            if (browserEvent) {
              liveBrowserStateRef.current = applyBrowserWorkspaceEvent(
                liveBrowserStateRef.current,
                browserEvent,
              );
              setLiveBrowserState({ ...liveBrowserStateRef.current });
              currentSSEEvent = "";
              continue;
            }

            // ── Custom OpenClaw gateway events ──────────────────────
            // The gateway sends `data: { "phase": "..." }` and
            // `data: { "tool": "...", "name": "..." }` for tool calls.
            // These are NOT in OpenAI format and need separate handling.

            // Phase-only event (e.g. {"phase": "thinking"})
            if (parsed.phase && !parsed.choices) {
              // If we had a custom tool step active and we're moving to a
              // non-tool phase, finish it
              if (parsed.phase !== "tool_execution" && customToolStepId !== -1) {
                finishStep(customToolStepId);
                customToolStepId = -1;
              }
              currentSSEEvent = "";
              continue;
            }

            // Tool execution event (e.g. {"tool": "exec", "name": "exec"})
            if ((parsed.tool || parsed.name) && !parsed.choices) {
              const toolName = parsed.tool || parsed.name || "tool";
              const detail = parsed.input ?? parsed.command ?? parsed.arguments ?? parsed.query ?? parsed.cmd ?? undefined;

              // Finish any prior custom tool step
              if (customToolStepId !== -1) {
                finishStep(customToolStepId);
              }

              const id = parserRef.current.stepCounter++;
              customToolStepId = id;
              pushStep({
                id,
                kind: "tool",
                label: `Using tool: ${toolName}`,
                toolName,
                detail: typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : undefined,
                status: "active",
                startedAt: Date.now(),
              });

              // ── Browser workspace synthesis from tool calls ──────────
              lastBrowserToolRef.current = null;
              const BROWSER_NAV   = /^(browser_navigate|navigate|browser_goto|goto|open_url|web_navigate|browser_open|web_browse)$/i;
              const BROWSER_SHOT  = /^(browser_screenshot|screenshot|capture_screen|take_screenshot|browser_capture|browser_screen)$/i;
              const BROWSER_ACT   = /^(browser_click|browser_type|browser_fill|browser_scroll|browser_hover|browser_press|browser_select|browser_submit|browser_check|browser_uncheck)$/i;

              if (BROWSER_NAV.test(toolName)) {
                const inputObj = parsed.input as Record<string, unknown> | undefined;
                const url = (typeof inputObj?.url === "string" ? inputObj.url : undefined)
                  ?? (typeof detail === "string" && /^https?:\/\//.test(detail) ? detail : undefined);
                if (url) {
                  liveBrowserStateRef.current = applyBrowserWorkspaceEvent(liveBrowserStateRef.current, { type: "navigation", url, label: url });
                  setLiveBrowserState({ ...liveBrowserStateRef.current });
                }
              } else if (BROWSER_SHOT.test(toolName)) {
                lastBrowserToolRef.current = "screenshot";
              } else if (BROWSER_ACT.test(toolName)) {
                const actionLabel = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : toolName;
                liveBrowserStateRef.current = applyBrowserWorkspaceEvent(liveBrowserStateRef.current, { type: "action", label: actionLabel });
                setLiveBrowserState({ ...liveBrowserStateRef.current });
              }

              currentSSEEvent = "";
              continue;
            }

            // Tool result / output event (e.g. {"result": "...", "output": "..."})
            if ((parsed.result !== undefined || parsed.output !== undefined) && !parsed.choices) {
              // ── Screenshot synthesis from browser tool result ─────────
              if (lastBrowserToolRef.current === "screenshot") {
                const raw = parsed.result ?? parsed.output ?? "";
                const rawStr = typeof raw === "string" ? raw : "";
                if (rawStr.startsWith("data:image/") || /^https?:\/\//.test(rawStr)) {
                  liveBrowserStateRef.current = applyBrowserWorkspaceEvent(liveBrowserStateRef.current, {
                    type: "screenshot", url: rawStr, label: "Screenshot",
                  });
                  setLiveBrowserState({ ...liveBrowserStateRef.current });
                }
                lastBrowserToolRef.current = null;
              }

              if (customToolStepId !== -1) {
                const output = parsed.result ?? parsed.output ?? "";
                const currentStep = liveStepsRef.current.find(s => s.id === customToolStepId);
                const detail = currentStep?.detail
                  ? `${currentStep.detail}\n${typeof output === "string" ? output : JSON.stringify(output)}`
                  : (typeof output === "string" ? output : JSON.stringify(output));
                finishStep(customToolStepId, detail);
                customToolStepId = -1;
              }
              currentSSEEvent = "";
              continue;
            }

            // ── Standard OpenAI SSE format ──────────────────────────

            // Separate reasoning field (DeepSeek / other models)
            const reasoning =
              parsed?.choices?.[0]?.delta?.reasoning_content ??
              parsed?.choices?.[0]?.delta?.thinking ?? "";
            if (reasoning) {
              if (thinkStepId === -1) {
                const id = parserRef.current.stepCounter++;
                thinkStepId = id;
                pushStep({
                  id, kind: "thinking", label: "Reasoning",
                  status: "active", startedAt: Date.now(),
                });
                parserRef.current.phase = "in_think";
              }
              updateStepDetail(thinkStepId, reasoning);
            }

            const delta = parsed?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              // If we have content flowing and a custom tool step was active,
              // finish it — the agent has moved past tool execution
              if (customToolStepId !== -1 && delta.trim() && !delta.startsWith("<function=")) {
                finishStep(customToolStepId);
                customToolStepId = -1;
              }
              processDelta(delta);

              // Also feed into the code block detector to extract
              // terminal commands from markdown code blocks
              processCodeBlocks(delta);

              // Feed into browser detector to extract images and URLs
              processForBrowser(delta);
            }

            // ── OpenAI native tool_calls format ──────────────────────
            const toolCalls = parsed?.choices?.[0]?.delta?.tool_calls as
              Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined;
            if (toolCalls) {
              // If a custom tool step was open, finish it before handling native tool_calls
              if (customToolStepId !== -1) {
                finishStep(customToolStepId);
                customToolStepId = -1;
              }
              for (const tc of toolCalls) {
                const idx = tc.index ?? 0;
                if (!toolCallBuf[idx]) {
                  // First chunk for this tool call — create step
                  const name = tc.function?.name ?? "tool";
                  const id = parserRef.current.stepCounter++;
                  toolCallBuf[idx] = { name, args: "", stepId: id };
                  pushStep({
                    id, kind: "tool",
                    label: `Using tool: ${name}`, toolName: name,
                    status: "active", startedAt: Date.now(),
                  });
                }
                // Accumulate streamed arguments
                if (tc.function?.arguments) {
                  toolCallBuf[idx].args += tc.function.arguments;
                  // Try to extract the command/query from partial JSON
                  try {
                    const args = JSON.parse(toolCallBuf[idx].args);
                    const detail = args.command ?? args.cmd ?? args.query ?? args.code ?? args.path ?? toolCallBuf[idx].args;
                    updateStepDetail(toolCallBuf[idx].stepId, typeof detail === "string" ? detail : JSON.stringify(detail));
                  } catch {
                    // Still accumulating — show raw args so far
                    updateStepDetail(toolCallBuf[idx].stepId, toolCallBuf[idx].args);
                  }
                }
              }
            }

            // ── Finish tool calls when choice has finish_reason ──────
            const finishReason = parsed?.choices?.[0]?.finish_reason;
            if (finishReason === "tool_calls" || finishReason === "stop") {
              for (const idx of Object.keys(toolCallBuf)) {
                const tc = toolCallBuf[Number(idx)];
                if (tc) {
                  let detail = tc.args;
                  try {
                    const args = JSON.parse(tc.args);
                    detail = args.command ?? args.cmd ?? args.query ?? args.code ?? args.path ?? tc.args;
                  } catch { /* use raw */ }
                  finishStep(tc.stepId, typeof detail === "string" ? detail : JSON.stringify(detail));
                }
              }
              // Also finish any custom tool step
              if (customToolStepId !== -1) {
                finishStep(customToolStepId);
                customToolStepId = -1;
              }
            }
          } catch { /* partial */ }
        }
      }

      // Finalise all open steps — read from ref (synchronous, no stale closures)
      const finalContent = liveResponse || parserRef.current.rawBuf.trim() || "No response received.";

      const finalSteps = liveStepsRef.current.map(s =>
        s.status === "active"
          ? { ...s, status: "done" as StepStatus, elapsedMs: Date.now() - s.startedAt }
          : s
      );

      // Final flush: scan remaining text that didn't end with a newline
      processForBrowser("\n");

      const finalBrowserState = liveBrowserStateRef.current.items.length > 0
        || liveBrowserStateRef.current.previewUrl
        || liveBrowserStateRef.current.takeover
        ? { ...liveBrowserStateRef.current }
        : undefined;

      setMessages(mp => [...mp, {
        id:      newId(),
        role:    "assistant",
        content: finalContent,
        steps:   finalSteps.length > 0 ? finalSteps : undefined,
        browserState: finalBrowserState,
      }]);

      liveStepsRef.current = [];
      setLiveSteps([]);
      setLiveResponse("");
      liveBrowserStateRef.current = createEmptyBrowserWorkspaceState();
      setLiveBrowserState(createEmptyBrowserWorkspaceState());
      void writeStepId;

      await persistMessages(activeSandbox.sandbox_id, convId, [
        { role: "user",      content: text         },
        { role: "assistant", content: finalContent  },
      ]);
    } catch (err) {
      liveStepsRef.current = [];
      setLiveSteps([]);
      setLiveResponse("");
      setMessages(prev => [...prev, {
        id:      newId(),
        role:    "assistant",
        content: `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`,
      }]);
    } finally {
      setIsLoading(false);
      setLiveResponse("");
      liveStepsRef.current = [];
      setLiveSteps([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isLoading, activeSandbox, effectiveModel, ensureConversation, persistMessages, finishStep, updateStepDetail, pushStep, processCodeBlocks, processForBrowser]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startNewChat = () => {
    setConversationId(null);
    setMessages([]);
  };

  const agentLogo = "/assets/logos/favicon.svg";

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-row flex-1 overflow-hidden min-h-0">

      {/* ── LEFT: Chat column ── */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-0 min-w-0">
        {/* Toolbar */}
        <div className="shrink-0 flex items-center justify-between px-5 py-2 border-b border-[var(--border-default)]">
          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] hover:bg-[var(--color-light)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Plus className="h-3 w-3" />
            New Chat
          </button>

          {/* Toggle computer view */}
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
                {messages.length === 0 && !isLoading && (
                  <div className="flex items-start gap-3 animate-fadeIn">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
                      <Image src={agentLogo} alt={agent.name} width={32} height={32} className="rounded-full" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <AgentLabel name={agent.name} logo={agentLogo} />
                      <p className="text-sm font-satoshi-regular text-[var(--text-primary)] leading-relaxed">
                        Hi! I&apos;m <strong>{agent.name}</strong>. How can I help you today?
                      </p>
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map(msg =>
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
                        {msg.steps && msg.steps.length > 0 && (
                          <TaskList steps={msg.steps} tick={0} isLive={false} />
                        )}
                        <MessageContent content={msg.content} />
                      </div>
                    </div>
                  )
                )}

                {/* Live bubble */}
                {isLoading && (
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

                      {/* Live task list */}
                      {liveSteps.length > 0 && (
                        <TaskList steps={liveSteps} tick={tick} isLive={true} />
                      )}

                      {/* Streaming response */}
                      {liveResponse && <MessageContent content={liveResponse} />}

                      {/* Initial connecting state */}
                      {liveSteps.length === 0 && !liveResponse && (
                        <div className="flex items-center gap-2 py-0.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-50" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--primary)]" />
                          </span>
                          <span className="text-sm font-satoshi-regular text-[var(--text-tertiary)]">Connecting…</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="shrink-0 px-4 md:px-0 pb-6 pt-3">
          <div className="max-w-2xl mx-auto md:ml-8">
            <div className="relative flex items-end gap-2 border border-[var(--border-default)] rounded-2xl bg-white px-4 py-3 shadow-sm focus-within:border-[var(--primary)]/40 transition-colors">
              <Image src={agentLogo} alt="" width={20} height={20} className="shrink-0 mb-1 opacity-30" />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${agent.name}…`}
                disabled={isLoading || !activeSandbox}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm font-satoshi-regular text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-none min-h-[24px] max-h-[120px] leading-relaxed disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading || !activeSandbox}
                className="p-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-tertiary)] hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)] disabled:hover:border-[var(--border-default)] transition-all shrink-0 mb-0.5"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-center text-[11px] font-satoshi-regular text-[var(--text-tertiary)] mt-2">
              {activeSandbox
                ? <>Running on <span className="font-mono">{activeSandbox.sandbox_id.slice(0, 8)}…</span></>
                : "No sandbox selected"}
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Computer view ── */}
      {showComputer && (
        <div className="w-[360px] xl:w-[420px] shrink-0 border-l border-[var(--border-default)] flex flex-col overflow-hidden">
          <ComputerView
            liveSteps={liveSteps}
            messages={messages}
            isLoading={isLoading}
            tick={tick}
            liveBrowserState={liveBrowserState}
            onResumeTakeover={resumeBrowserTakeover}
            activeSandboxId={activeSandbox?.sandbox_id ?? null}
            workspaceScopeKey={`${activeSandbox?.sandbox_id ?? "none"}:${selectedConvId ?? conversationId ?? "new"}`}
          />
        </div>
      )}
    </div>
  );
}
