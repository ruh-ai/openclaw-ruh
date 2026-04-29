/**
 * useAgentChat — React hook that replaces the streaming loop + state
 * management in TabChat.tsx.
 *
 * Creates an AG-UI agent (SandboxAgent or BuilderAgent), subscribes to
 * events, and manages all chat state: messages, steps, browser workspace,
 * task plans, code editor files, and backend-owned conversation persistence.
 */

"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { EventType } from "@ag-ui/core";
import type { BaseEvent } from "@ag-ui/core";
import { SandboxAgent } from "./sandbox-agent";
import { BuilderAgent } from "./builder-agent";
import {
  createTextDeltaStateMachine,
  createCodeBlockExtractor,
  createBrowserExtractor,
  createTaskPlanExtractor,
  type StepOp,
} from "./event-middleware";
import { dispatchCustomEvent } from "./event-consumer-map";
import {
  applyBrowserWorkspaceEvent,
  createEmptyBrowserWorkspaceState,
  extractPersistedWorkspaceState,
  type BrowserWorkspaceState,
  type PersistedWorkspaceState,
} from "../browser-workspace";
import { stripPlanTags, type TaskPlan } from "../task-plan-parser";
import { getEffectiveChatModel } from "../shared-codex";
import { buildWorkspaceMemorySystemMessage, hasWorkspaceMemory } from "../workspace-memory";
import {
  appendReasoningStepDetail,
  ensureReasoningStep,
  finishReasoningStep,
} from "./reasoning-step";
import { CustomEventName } from "./types";
import type {
  AgentStep,
  BuilderMetadataState,
  StepStatus,
  ChatMessage,
  ChatMode,
  EditorFile,
  EditorFileChangedPayload,
  PreviewServerDetectedPayload,
  SkillGraphReadyPayload,
  WizardSetPhasePayload,
} from "./types";
import {
  createBuilderMetadataAutosaveController,
  createSeededBuilderMetadataState,
  reduceBuilderMetadataEvent,
} from "./builder-metadata-autosave";
import {
  shouldAppendUserMessageToTranscript,
  shouldHideCompletedRunFromTranscript,
  shouldShowLiveTranscript,
  type RunSurface,
} from "./run-surface-policy";
import type { CoPilotActions, CoPilotState } from "../copilot-state";
import { useAgentsStore, type SavedAgent } from "@/hooks/use-agents-store";
import type { BuilderState } from "../builder-state";
import { readWorkspaceFile } from "../workspace-writer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SandboxRecord {
  sandbox_id: string;
  sandbox_name: string;
  sandbox_state?: string;
  gateway_port?: number;
  vnc_port?: number | null;
  approved?: boolean;
  created_at?: string;
  shared_codex_enabled?: boolean;
  shared_codex_model?: string | null;
}

interface MessageHistoryPage {
  messages: Array<{
    id?: number;
    role: string;
    content: string;
    workspace_state?: PersistedWorkspaceState;
  }>;
  next_cursor: number | null;
  has_more: boolean;
}

export interface UseAgentChatConfig {
  agent: SavedAgent;
  activeSandbox: SandboxRecord | null;
  mode: ChatMode;
  selectedConvId: string | null;
  builderAutosaveEnabled?: boolean;
  builderState?: BuilderState;
  onBuilderStateChange?: (partial: Partial<BuilderState>) => void;
  onReadyForReview?: () => void;
  onConversationCreated: (convId: string) => void;
  /** Co-pilot store for wizard state synchronization */
  coPilotStore?: (CoPilotState & CoPilotActions) | null;
  /** Bridge mode for builder: "build" (strict) or "copilot" (workspace-enabled). */
  builderBridgeMode?: import("../test-mode").OpenClawRequestMode;
}

export interface UseAgentChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  liveResponse: string;
  liveSteps: AgentStep[];
  liveBrowserState: BrowserWorkspaceState;
  liveTaskPlan: TaskPlan | null;
  activeEditorFile: EditorFile | null;
  recentEditorFiles: Array<{ path: string; language: string }>;
  conversationId: string | null;
  loadingHistory: boolean;
  hasMoreHistory: boolean;
  activeRunSurface: RunSurface | null;
  sendMessage: (text: string, opts?: { silent?: boolean; surface?: RunSurface }) => Promise<void>;
  startNewChat: () => void;
  loadOlderHistory: () => Promise<void>;
  resumeBrowserTakeover: () => void;
  selectEditorFile: (path: string) => void;
  memoryBanner: string | null;
  tick: number;
  /** Increments when workspace files change (code tool completes, agent run finishes) */
  workspaceFilesTick: number;
  /** Ports detected as running dev servers from agent output */
  detectedPreviewPorts: number[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let msgCounter = 0;
const newId = () => `msg-${msgCounter++}`;

const CODE_TOOLS = new Set([
  "file_write", "write_file", "file_str_replace", "str_replace_editor",
  "create_file", "edit_file", "write", "save_file", "code_editor",
  "text_editor", "read_file", "file_read",
]);

function mapPersistedMessageToChatMessage(message: {
  role: string;
  content: string;
  workspace_state?: PersistedWorkspaceState;
}): ChatMessage {
  const persistedWorkspace = message.workspace_state
    ? extractPersistedWorkspaceState(message.workspace_state)
    : null;
  return {
    id: newId(),
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    browserState: persistedWorkspace?.browserState,
    taskPlan: persistedWorkspace?.taskPlan,
    steps: persistedWorkspace?.steps,
  };
}

function isPersistedBuilderAgentCandidate(agent: SavedAgent): boolean {
  return agent.id !== "new-agent" && !agent.id.startsWith("new-");
}

function buildBuilderMetadataPatch(
  previous: BuilderMetadataState,
  next: BuilderMetadataState,
): Partial<BuilderMetadataState> {
  const patch: Partial<BuilderMetadataState> = {};
  const patchRecord = patch as Record<
    keyof BuilderMetadataState,
    BuilderMetadataState[keyof BuilderMetadataState]
  >;

  for (const key of Object.keys(next) as Array<keyof BuilderMetadataState>) {
    if (Object.is(previous[key], next[key])) {
      continue;
    }
    patchRecord[key] = next[key];
  }

  return patch;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useAgentChat(config: UseAgentChatConfig): UseAgentChatReturn {
  const {
    agent, activeSandbox, mode, selectedConvId,
    builderAutosaveEnabled = true,
    builderState, onBuilderStateChange, onReadyForReview,
    onConversationCreated, coPilotStore, builderBridgeMode,
  } = config;

  const isBuilderMode = mode === "builder";
  const agents = useAgentsStore((state) => state.agents);
  const saveAgentDraft = useAgentsStore((state) => state.saveAgentDraft);
  const persistedBuilderAgent = useMemo(() => {
    if (!isBuilderMode) {
      return null;
    }

    if (builderState?.draftAgentId) {
      return (
        agents.find((entry) => entry.id === builderState.draftAgentId)
        ?? (agent.id === builderState.draftAgentId ? agent : null)
      );
    }

    return isPersistedBuilderAgentCandidate(agent) ? agent : null;
  }, [agent, agents, builderState?.draftAgentId, isBuilderMode]);

  // ── State ───────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input_unused, _setInput] = useState("");
  void input_unused;
  const [isLoading, setIsLoading] = useState(false);
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const [liveResponse, setLiveResponse] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const [messageCursor, setMessageCursor] = useState<number | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [activeRunSurface, setActiveRunSurface] = useState<RunSurface | null>(null);
  const [liveBrowserState, setLiveBrowserState] = useState<BrowserWorkspaceState>(createEmptyBrowserWorkspaceState);
  const [memoryAppliedConversationId, setMemoryAppliedConversationId] = useState<string | null>(null);
  const [liveTaskPlan, setLiveTaskPlan] = useState<TaskPlan | null>(null);
  const [activeEditorFile, setActiveEditorFile] = useState<EditorFile | null>(null);
  const [recentEditorFiles, setRecentEditorFiles] = useState<Array<{ path: string; language: string }>>([]);
  const [workspaceFilesTick, setWorkspaceFilesTick] = useState(0);
  const [detectedPreviewPorts, setDetectedPreviewPorts] = useState<number[]>([]);
  const [builderMetadata, setBuilderMetadata] = useState<BuilderMetadataState>(() =>
    createSeededBuilderMetadataState(isBuilderMode ? persistedBuilderAgent : null, builderState),
  );

  // Tick for live elapsed re-renders
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isLoading) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [isLoading]);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const liveStepsRef = useRef<AgentStep[]>([]);
  const liveBrowserStateRef = useRef<BrowserWorkspaceState>(createEmptyBrowserWorkspaceState());
  const activeMessageIdRef = useRef<string | null>(null);
  const stepNameToIdRef = useRef<Map<string, number>>(new Map());
  const builderMetadataRef = useRef<BuilderMetadataState>(builderMetadata);
  builderMetadataRef.current = builderMetadata;
  const coPilotStoreRef = useRef(coPilotStore);
  coPilotStoreRef.current = coPilotStore;
  const autosaveControllerRef = useRef<ReturnType<typeof createBuilderMetadataAutosaveController> | null>(null);
  const lastLoadedConvId = useRef<string | null>(null);
  const sandboxIdRef = useRef<string | null>(activeSandbox?.sandbox_id ?? null);
  sandboxIdRef.current = activeSandbox?.sandbox_id ?? null;

  const effectiveModel = getEffectiveChatModel(agent.model, activeSandbox);

  const applyBuilderMetadataPatch = useCallback((patch: Partial<BuilderMetadataState>) => {
    if (Object.keys(patch).length === 0) {
      return;
    }

    // AG-UI can emit several builder metadata events back-to-back in one stream tick.
    // Keep the imperative ref ahead of React state so later events reduce against the latest snapshot.
    const nextMetadata = { ...builderMetadataRef.current, ...patch };
    builderMetadataRef.current = nextMetadata;
    setBuilderMetadata(nextMetadata);

    onBuilderStateChange?.(patch as Partial<BuilderState>);

    const currentCoPilotStore = coPilotStoreRef.current;

    if (!currentCoPilotStore) {
      return;
    }

    if (
      patch.name !== undefined
      || patch.description !== undefined
      || patch.systemName !== undefined
    ) {
      const fieldsUpdate: Record<string, string | undefined> = {};
      if (patch.name !== undefined && nextMetadata.name) fieldsUpdate.name = nextMetadata.name;
      if (patch.description !== undefined && nextMetadata.description) fieldsUpdate.description = nextMetadata.description;
      if (patch.systemName !== undefined) fieldsUpdate.systemName = nextMetadata.systemName ?? undefined;
      if (Object.keys(fieldsUpdate).length > 0) {
        currentCoPilotStore.updateFields(fieldsUpdate as Partial<Pick<CoPilotState, "name" | "description" | "systemName">>);
      }
    }

    if (
      patch.skillGraph !== undefined
      || patch.workflow !== undefined
      || patch.agentRules !== undefined
    ) {
      if (nextMetadata.skillGraph) {
        currentCoPilotStore.setSkillGraph(
          nextMetadata.skillGraph,
          nextMetadata.workflow,
          nextMetadata.agentRules,
        );
        currentCoPilotStore.selectSkills(nextMetadata.skillGraph.map((node) => node.skill_id));
        // Mark skills that have skill_md content as built (architect already created them)
        for (const node of nextMetadata.skillGraph) {
          if (node.skill_md) {
            currentCoPilotStore.markSkillBuilt(node.skill_id);
          }
        }
      } else {
        currentCoPilotStore.setRules(nextMetadata.agentRules);
      }
    }

    if (patch.improvements !== undefined) {
      currentCoPilotStore.setImprovements(nextMetadata.improvements);
    }

    if (patch.toolConnections !== undefined) {
      currentCoPilotStore.connectTools(nextMetadata.toolConnections);
    }

    if (patch.triggers !== undefined) {
      currentCoPilotStore.setTriggers(nextMetadata.triggers);
    }

    if (patch.channelHints !== undefined && nextMetadata.channelHints.length > 0) {
      // Convert channelHints (string[]) to AgentChannelSelection[] for the copilot store
      const CHANNEL_LABELS: Record<string, { label: string; description: string }> = {
        telegram: { label: "Telegram", description: "Telegram bot" },
        slack: { label: "Slack", description: "Slack bot" },
        discord: { label: "Discord", description: "Discord bot" },
      };
      const channelSelections = nextMetadata.channelHints
        .filter((id): id is "telegram" | "slack" | "discord" => id === "telegram" || id === "slack" || id === "discord")
        .map((kind) => ({
          kind,
          status: kind === "discord" ? "unsupported" as const : "planned" as const,
          label: CHANNEL_LABELS[kind]?.label ?? kind,
          description: CHANNEL_LABELS[kind]?.description ?? "",
        }));
      if (channelSelections.length > 0) {
        currentCoPilotStore.setChannels(channelSelections);
      }
    }
  }, [onBuilderStateChange]);

  const commitBuilderMetadataEvent = useCallback((name: string, value: unknown) => {
    if (!autosaveControllerRef.current && isBuilderMode && builderAutosaveEnabled && typeof window !== "undefined") {
      autosaveControllerRef.current = createBuilderMetadataAutosaveController({
        agent: persistedBuilderAgent,
        saveAgentDraft,
        scheduler: {
          schedule: (run) => window.setTimeout(run, 800),
          clear: (handle) => window.clearTimeout(handle as number),
        },
        now: () => new Date().toISOString(),
        onMetadataPatch: applyBuilderMetadataPatch,
      });
    }

    const previous = builderMetadataRef.current;
    const next = reduceBuilderMetadataEvent(previous, name, value);
    const patch = buildBuilderMetadataPatch(previous, next);

    if (Object.keys(patch).length === 0) {
      return;
    }

    applyBuilderMetadataPatch(patch);
    if (builderAutosaveEnabled) {
      autosaveControllerRef.current?.schedule(next);
    }
  }, [applyBuilderMetadataPatch, builderAutosaveEnabled, isBuilderMode, persistedBuilderAgent, saveAgentDraft]);

  useEffect(() => {
    if (!isBuilderMode) {
      return;
    }

    const seeded = createSeededBuilderMetadataState(persistedBuilderAgent, builderState);
    builderMetadataRef.current = seeded;
    setBuilderMetadata(seeded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderState?.sessionId, isBuilderMode]);

  useEffect(() => {
    if (!isBuilderMode || !builderAutosaveEnabled) {
      autosaveControllerRef.current?.cancel();
      autosaveControllerRef.current = null;
      return;
    }

    autosaveControllerRef.current = createBuilderMetadataAutosaveController({
      agent: persistedBuilderAgent,
      saveAgentDraft,
      scheduler: {
        schedule: (run) => window.setTimeout(run, 800),
        clear: (handle) => window.clearTimeout(handle as number),
      },
      now: () => new Date().toISOString(),
      onMetadataPatch: applyBuilderMetadataPatch,
    });

    return () => {
      autosaveControllerRef.current?.cancel();
      autosaveControllerRef.current = null;
    };
  }, [applyBuilderMetadataPatch, builderAutosaveEnabled, isBuilderMode, persistedBuilderAgent, saveAgentDraft]);

  // ── Reset on sandbox change ─────────────────────────────────────────────
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setMessageCursor(null);
    setHasMoreHistory(false);
    setLiveBrowserState(createEmptyBrowserWorkspaceState());
    setMemoryAppliedConversationId(null);
    lastLoadedConvId.current = null;
  }, [activeSandbox?.sandbox_id]);

  // ── Load conversation history ───────────────────────────────────────────
  useEffect(() => {
    const sandboxId = activeSandbox?.sandbox_id;
    if (!selectedConvId || !sandboxId) return;
    if (selectedConvId === lastLoadedConvId.current) return;
    lastLoadedConvId.current = selectedConvId;
    setConversationId(selectedConvId);
    setMemoryAppliedConversationId(null);
    setMessages([]);
    setMessageCursor(null);
    setHasMoreHistory(false);
    setLoadingHistory(true);

    fetch(`${API_BASE}/api/sandboxes/${sandboxId}/conversations/${selectedConvId}/messages?limit=50`)
      .then(r => r.json())
      .then((data: unknown) => {
        const page = data as MessageHistoryPage;
        const arr = page.messages ?? [];
        setMessages(arr.map(mapPersistedMessageToChatMessage));
        setMessageCursor(page.next_cursor);
        setHasMoreHistory(page.has_more);
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [activeSandbox?.sandbox_id, selectedConvId]);

  // ── Load older history ──────────────────────────────────────────────────
  const loadOlderHistory = useCallback(async () => {
    if (!activeSandbox || !conversationId || messageCursor == null || loadingOlderHistory) return;
    setLoadingOlderHistory(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/conversations/${conversationId}/messages?limit=50&before=${messageCursor}`,
      );
      if (!res.ok) return;
      const page = (await res.json()) as MessageHistoryPage;
      setMessages((prev) => [...page.messages.map(mapPersistedMessageToChatMessage), ...prev]);
      setMessageCursor(page.next_cursor);
      setHasMoreHistory(page.has_more);
    } finally {
      setLoadingOlderHistory(false);
    }
  }, [activeSandbox, conversationId, loadingOlderHistory, messageCursor]);

  // ── Ensure conversation (agent mode) ────────────────────────────────────
  const ensureConversation = useCallback(async (sandboxId: string): Promise<string> => {
    if (conversationId) return conversationId;
    const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Chat – ${new Date().toLocaleString()}`,
        model: effectiveModel,
      }),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    const conv = await res.json();
    lastLoadedConvId.current = conv.id;
    setConversationId(conv.id);
    onConversationCreated(conv.id);
    return conv.id;
  }, [conversationId, effectiveModel, onConversationCreated]);

  // ── Step mutations ──────────────────────────────────────────────────────
  const pushStep = useCallback((step: AgentStep) => {
    liveStepsRef.current = [...liveStepsRef.current, step];
    setLiveSteps([...liveStepsRef.current]);
  }, []);

  const finishStep = useCallback((id: number, detail?: string) => {
    liveStepsRef.current = liveStepsRef.current.map(s =>
      s.id === id
        ? { ...s, status: "done" as StepStatus, detail: detail ?? s.detail, elapsedMs: Date.now() - s.startedAt }
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

  // ── Apply step operations from middleware ────────────────────────────────
  const applyStepOps = useCallback((ops: StepOp[]) => {
    for (const op of ops) {
      if (op.action === "push" && op.step) pushStep(op.step);
      else if (op.action === "finish" && op.id != null) finishStep(op.id, op.detail);
      else if (op.action === "update_detail" && op.id != null && op.detail != null) updateStepDetail(op.id, op.detail);
    }
  }, [pushStep, finishStep, updateStepDetail]);

  // ── Fetch editor file ───────────────────────────────────────────────────
  const fetchEditorFile = useCallback(async (filePath: string) => {
    if (!activeSandbox) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/sandboxes/${activeSandbox.sandbox_id}/workspace/file?path=${encodeURIComponent(filePath)}${
          conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ""
        }`
      );
      if (!res.ok) return;
      const data = await res.json();
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
      const langMap: Record<string, string> = {
        js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
        py: "python", html: "html", css: "css", json: "json", md: "markdown",
        sh: "shell", yaml: "yaml", yml: "yaml",
      };
      const language = langMap[ext] ?? "text";
      setActiveEditorFile({ path: filePath, content: data.content ?? "", language });
      setRecentEditorFiles(prev => {
        if (prev.some(f => f.path === filePath)) return prev;
        return [...prev, { path: filePath, language }];
      });
    } catch { /* non-critical */ }
  }, [activeSandbox, conversationId]);

  // ── Resume browser takeover ─────────────────────────────────────────────
  const resumeBrowserTakeover = useCallback(() => {
    liveBrowserStateRef.current = applyBrowserWorkspaceEvent(liveBrowserStateRef.current, {
      type: "takeover_resumed",
      reason: "Operator marked the browser step as complete",
      actionLabel: "Agent resumed",
    });
    setLiveBrowserState({ ...liveBrowserStateRef.current });
  }, []);

  // ── Send message ────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, opts?: { silent?: boolean; surface?: RunSurface }) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    if (!isBuilderMode && !activeSandbox) return;
    const runSurface = opts?.surface ?? "chat";

    if (shouldAppendUserMessageToTranscript(runSurface, Boolean(opts?.silent))) {
      setMessages(prev => [...prev, { id: newId(), role: "user", content: trimmed }]);
    }
    // User replying clears any pending architect questions — the next turn starts
    // fresh, and the architect's subsequent response will populate new ones if needed.
    coPilotStore?.clearPendingQuestions?.();
    setActiveRunSurface(runSurface);
    setIsLoading(true);
    liveStepsRef.current = [];
    setLiveSteps([]);
    setLiveResponse("");
    liveBrowserStateRef.current = createEmptyBrowserWorkspaceState();
    setLiveBrowserState(createEmptyBrowserWorkspaceState());
    setLiveTaskPlan(null);

    // Create middleware instances
    const deltaMachine = createTextDeltaStateMachine();
    let readyForReviewFired = false;
    let codeBlockStepCounter = 100; // offset to avoid collision with deltaMachine
    const codeBlockExtractor = createCodeBlockExtractor(
      () => codeBlockStepCounter,
      (n) => { codeBlockStepCounter = n; },
    );
    const browserExtractor = createBrowserExtractor(() => sandboxIdRef.current, API_BASE);
    const taskPlanExtractor = createTaskPlanExtractor();

    // Track thinking step for "thinking" events (from agent mode)
    const thinkStepIdRef = { current: -1 };

    try {
      // Agent mode: conversation + workspace memory
      let convId: string | null = null;
      if (!isBuilderMode && activeSandbox) {
        const isNewConversation = !conversationId;
        const willApplyWorkspaceMemory = isNewConversation && hasWorkspaceMemory(agent.workspaceMemory);
        convId = await ensureConversation(activeSandbox.sandbox_id);
        if (willApplyWorkspaceMemory) {
          setMemoryAppliedConversationId(convId);
        }
      }

      // Build system messages (agent mode only)
      const systemMessages = !isBuilderMode && convId && !conversationId && agent.workspaceMemory && hasWorkspaceMemory(agent.workspaceMemory)
        ? [{ role: "system" as const, content: buildWorkspaceMemorySystemMessage(agent.workspaceMemory) }]
        : [];

      // Create the appropriate AG-UI agent
      const agentInstance = isBuilderMode
        ? new BuilderAgent({
            sessionId: builderState?.sessionId ?? uuidv4(),
            mode: builderBridgeMode ?? "build",
            onSessionRotate: (newId) => onBuilderStateChange?.({ sessionId: newId }),
            forgeSandboxId: activeSandbox?.sandbox_id,
          })
        : new SandboxAgent({ sandboxId: activeSandbox!.sandbox_id });

      // Subscribe and run
      const threadId = convId ?? uuidv4();
      const runId = uuidv4();

      // Collect events via Observable subscription
      await new Promise<void>((resolve, reject) => {
        const observable = agentInstance.run({
          threadId,
          runId,
          messages: [{ id: uuidv4(), role: "user", content: trimmed }],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {
            conversationId: convId,
            model: effectiveModel,
            systemMessages,
            wizardState: coPilotStoreRef.current ? coPilotStoreRef.current.snapshot() : undefined,
          },
        });

        const subscription = observable.subscribe({
          next: (event: BaseEvent) => {
            const eventType = (event as { type: string }).type;

            switch (eventType) {
              case EventType.TEXT_MESSAGE_START: {
                const messageId = (event as unknown as { messageId: string }).messageId;
                activeMessageIdRef.current = messageId ?? null;
                break;
              }

              case EventType.TEXT_MESSAGE_END: {
                // If SKILL_GRAPH_READY already pushed its own message, skip duplicate finalization.
                if (readyForReviewFired) {
                  activeMessageIdRef.current = null;
                  break;
                }
                const endContent = stripPlanTags(liveResponse || deltaMachine.getRawBuf().trim()).trim();
                let endPlan = taskPlanExtractor.getPlan();
                if (readyForReviewFired && endPlan) {
                  endPlan = {
                    ...endPlan,
                    currentTaskIndex: -1,
                    items: endPlan.items.map(item => ({ ...item, status: "done" as const })),
                  };
                }
                const endSteps = liveStepsRef.current.map(s =>
                  s.status === "active"
                    ? { ...s, status: "done" as StepStatus, elapsedMs: Date.now() - s.startedAt }
                    : s
                );
                browserExtractor.process("\n");
                const endBrowser = liveBrowserStateRef.current.items.length > 0
                  || liveBrowserStateRef.current.previewUrl
                  || liveBrowserStateRef.current.takeover
                  ? { ...liveBrowserStateRef.current }
                  : undefined;

                const hasEndContent = endContent && endContent !== "No response received.";
                const hasEndSteps = endSteps.length > 0;
                const hasEndBrowser = Boolean(endBrowser);
                const hasEndPlan = Boolean(endPlan);

                const hideInTranscript = shouldHideCompletedRunFromTranscript(runSurface, {
                  hasSteps: hasEndSteps,
                  hasBrowser: hasEndBrowser,
                  hasPlan: hasEndPlan,
                });

                if (hasEndContent || hasEndSteps || hasEndBrowser || hasEndPlan) {
                  setMessages(prev => [...prev, {
                    id: activeMessageIdRef.current || newId(),
                    role: "assistant" as const,
                    content: hideInTranscript ? "" : endContent || "",
                    hiddenInTranscript: hideInTranscript,
                    steps: hasEndSteps ? endSteps : undefined,
                    browserState: endBrowser,
                    taskPlan: endPlan ?? undefined,
                  }]);
                }
                // Reset live state for potential next message in the same run
                setLiveResponse("");
                liveStepsRef.current = [];
                setLiveSteps([]);
                liveBrowserStateRef.current = createEmptyBrowserWorkspaceState();
                setLiveBrowserState(createEmptyBrowserWorkspaceState());
                deltaMachine.reset();
                activeMessageIdRef.current = null;
                break;
              }

              case EventType.TEXT_MESSAGE_CONTENT: {
                const delta = (event as unknown as { delta: string }).delta;
                // Feed through all middleware
                const deltaResult = deltaMachine.process(delta);
                applyStepOps(deltaResult.stepOps);
                if (deltaResult.cleanText && shouldShowLiveTranscript(runSurface)) {
                  setLiveResponse(deltaResult.cleanText);
                }

                // Code block extraction
                const codeOps = codeBlockExtractor.process(delta);
                applyStepOps(codeOps);

                // Browser extraction
                const browserResult = browserExtractor.process(delta);
                if (browserResult.events.length > 0) {
                  liveBrowserStateRef.current = browserResult.state;
                  setLiveBrowserState({ ...browserResult.state });
                }

                // Task plan extraction
                const plan = taskPlanExtractor.process(delta);
                if (plan) setLiveTaskPlan(plan);
                break;
              }

              case EventType.CUSTOM: {
                const name = (event as unknown as { name: string }).name;
                const value = (event as unknown as { value: unknown }).value;

                // Dispatch through the centralized consumer map.
                // All event handling logic lives in event-consumer-map.ts
                // where each consumer is individually testable and traceable.
                dispatchCustomEvent(name, value, {
                  coPilotStore: coPilotStoreRef.current,
                  commitBuilderMetadata: commitBuilderMetadataEvent,
                  setMessages,
                  setLiveResponse,
                  setLiveBrowserState,
                  liveBrowserStateRef,
                  setWorkspaceFilesTick,
                  setDetectedPreviewPorts,
                  fetchEditorFile,
                  readWorkspaceFile,
                  onReadyForReview,
                  pushStep,
                  updateStepDetail,
                  thinkStepIdRef,
                  readyForReviewFiredRef: (() => {
                    const ref = { current: readyForReviewFired };
                    // Sync back mutations from the consumer
                    Object.defineProperty(ref, "current", {
                      get: () => readyForReviewFired,
                      set: (v: boolean) => { readyForReviewFired = v; },
                    });
                    return ref;
                  })(),
                });
                break;
              }

              case EventType.TOOL_CALL_START: {
                const toolCallId = (event as unknown as { toolCallId: string }).toolCallId;
                const toolCallName = (event as unknown as { toolCallName: string }).toolCallName;
                const id = parseInt(toolCallId.replace("tool-", ""), 10) || Date.now();
                pushStep({
                  id,
                  kind: "tool",
                  label: `Using tool: ${toolCallName}`,
                  toolName: toolCallName,
                  status: "active",
                  startedAt: Date.now(),
                });
                break;
              }

              case EventType.TOOL_CALL_ARGS: {
                const toolCallId = (event as unknown as { toolCallId: string }).toolCallId;
                const delta = (event as unknown as { delta: string }).delta;
                const id = parseInt(toolCallId.replace("tool-", ""), 10) || 0;
                const currentStep = liveStepsRef.current.find(s => s.id === id);
                const detail = currentStep?.detail
                  ? `${currentStep.detail}${delta}`
                  : delta;
                updateStepDetail(id, detail);
                break;
              }

              case EventType.TOOL_CALL_RESULT: {
                const toolCallId = (event as unknown as { toolCallId: string }).toolCallId;
                const content = (event as unknown as { content: string }).content;
                const id = parseInt(toolCallId.replace("tool-", ""), 10) || 0;
                const currentStep = liveStepsRef.current.find(s => s.id === id);
                const detail = currentStep?.detail
                  ? `${currentStep.detail}\n${content}`
                  : content;
                updateStepDetail(id, detail);

                // Detect code tool → fetch file
                if (currentStep?.toolName && CODE_TOOLS.has(currentStep.toolName.toLowerCase())) {
                  const pathMatch = currentStep.detail?.match(/"path"\s*:\s*"([^"]+)"/);
                  if (pathMatch) fetchEditorFile(pathMatch[1]);
                }
                break;
              }

              case EventType.TOOL_CALL_END: {
                const toolCallId = (event as unknown as { toolCallId: string }).toolCallId;
                const id = parseInt(toolCallId.replace("tool-", ""), 10) || 0;
                finishStep(id);
                break;
              }

              case EventType.STEP_STARTED: {
                const stepName = (event as unknown as { stepName: string }).stepName || "processing";
                // Skip tool-prefixed steps — already handled by TOOL_CALL_START
                if (stepName.startsWith("tool-")) break;
                const stepId = Date.now() + Math.random();
                stepNameToIdRef.current.set(stepName, stepId);
                pushStep({
                  id: stepId,
                  kind: "thinking",
                  label: stepName.charAt(0).toUpperCase() + stepName.slice(1).replace(/-/g, " "),
                  status: "active",
                  startedAt: Date.now(),
                });
                break;
              }
              case EventType.STEP_FINISHED: {
                const finishedStepName = (event as unknown as { stepName: string }).stepName || "";
                const mappedId = stepNameToIdRef.current.get(finishedStepName);
                if (mappedId !== undefined) {
                  finishStep(mappedId);
                  stepNameToIdRef.current.delete(finishedStepName);
                }
                break;
              }

              // ── AG-UI Reasoning events ──────────────────────────────
              case EventType.REASONING_START:
              case EventType.REASONING_MESSAGE_START: {
                ensureReasoningStep(thinkStepIdRef, pushStep);
                break;
              }
              case EventType.REASONING_MESSAGE_CONTENT: {
                const reasoningDelta = (event as unknown as { delta: string }).delta
                  || (event as unknown as { content: string }).content
                  || "";
                appendReasoningStepDetail(thinkStepIdRef, reasoningDelta, updateStepDetail);
                break;
              }
              case EventType.REASONING_MESSAGE_END:
              case EventType.REASONING_END: {
                finishReasoningStep(thinkStepIdRef, finishStep);
                break;
              }

              // ── AG-UI State events ─────────────────────────────────
              case EventType.STATE_SNAPSHOT: {
                const snapshot = (event as unknown as { snapshot: Record<string, unknown> }).snapshot;
                if (snapshot && typeof snapshot === "object") {
                  const metadataKeys: Array<keyof BuilderMetadataState> = [
                    "name", "description", "systemName", "skillGraph", "workflow",
                    "agentRules", "toolConnectionHints", "toolConnections", "triggerHints", "triggers", "improvements",
                  ];
                  const patch: Partial<BuilderMetadataState> = {};
                  for (const key of metadataKeys) {
                    if (key in snapshot) {
                      (patch as Record<string, unknown>)[key] = snapshot[key];
                    }
                  }
                  if (Object.keys(patch).length > 0) {
                    applyBuilderMetadataPatch(patch);
                  }
                }
                break;
              }
              case EventType.STATE_DELTA: {
                const patches = (event as unknown as { delta: Array<{ op: string; path: string; value?: unknown }> }).delta;
                if (Array.isArray(patches)) {
                  // Apply RFC 6902 JSON Patch to builder metadata
                  const current = { ...builderMetadataRef.current };
                  for (const p of patches) {
                    const segments = p.path.split("/").filter(Boolean);
                    if (segments.length === 1 && p.op === "replace") {
                      (current as Record<string, unknown>)[segments[0]] = p.value;
                    }
                  }
                  const patch = buildBuilderMetadataPatch(builderMetadataRef.current, current);
                  if (Object.keys(patch).length > 0) {
                    applyBuilderMetadataPatch(patch);
                  }
                }
                break;
              }

              case EventType.RUN_ERROR: {
                const message = (event as unknown as { message: string }).message;
                // Show the error as an assistant message instead of crashing
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `error-${Date.now()}`,
                    role: "assistant" as const,
                    content: `**Error:** ${message}`,
                    steps: [],
                  },
                ]);
                reject(new Error(message));
                return;
              }

              case EventType.RUN_FINISHED:
                break;
            }
          },
          error: (err: unknown) => reject(err),
          complete: () => resolve(),
        });

        // Clean up on unmount scenario
        void subscription;
      });

      // ── Finalize ──────────────────────────────────────────────────────
      // If TEXT_MESSAGE_END was emitted during the stream, the message was
      // already committed to messages[]. This block is a fallback for agents
      // that complete without emitting TEXT_MESSAGE_END (defensive).
      if (activeMessageIdRef.current !== null || (!readyForReviewFired && (liveResponse || deltaMachine.getRawBuf().trim()))) {
        const rawFinalContent = liveResponse || deltaMachine.getRawBuf().trim() || "";
        const strippedContent = stripPlanTags(rawFinalContent).trim();
        let taskPlan = taskPlanExtractor.getPlan();

        if (readyForReviewFired && taskPlan) {
          taskPlan = {
            ...taskPlan,
            currentTaskIndex: -1,
            items: taskPlan.items.map(item => ({ ...item, status: "done" as const })),
          };
        }

        const finalContent = strippedContent || (taskPlan ? "" : "No response received.");

        const finalSteps = liveStepsRef.current.map(s =>
          s.status === "active"
            ? { ...s, status: "done" as StepStatus, elapsedMs: Date.now() - s.startedAt }
            : s
        );

        browserExtractor.process("\n");
        const finalBrowserState = liveBrowserStateRef.current.items.length > 0
          || liveBrowserStateRef.current.previewUrl
          || liveBrowserStateRef.current.takeover
          ? { ...liveBrowserStateRef.current }
          : undefined;

        const hasContent = finalContent && finalContent !== "No response received.";
        const hasSteps = finalSteps.length > 0;
        const hasBrowser = Boolean(finalBrowserState);
        const hasPlan = Boolean(taskPlan);

        const hideInTranscript = shouldHideCompletedRunFromTranscript(runSurface, {
          hasSteps,
          hasBrowser,
          hasPlan,
        });

        if (hasContent || hasSteps || hasBrowser || hasPlan) {
          setMessages(mp => [...mp, {
            id: activeMessageIdRef.current || newId(),
            role: "assistant",
            content: hideInTranscript ? "" : finalContent,
            hiddenInTranscript: hideInTranscript,
            steps: hasSteps ? finalSteps : undefined,
            browserState: finalBrowserState,
            taskPlan: taskPlan ?? undefined,
          }]);
        }
      }

      activeMessageIdRef.current = null;

      // Signal workspace files changed after run completes
      setWorkspaceFilesTick(prev => prev + 1);

      liveStepsRef.current = [];
      setLiveSteps([]);
      setLiveResponse("");
      liveBrowserStateRef.current = createEmptyBrowserWorkspaceState();
      setLiveBrowserState(createEmptyBrowserWorkspaceState());

    } catch (err) {
      liveStepsRef.current = [];
      setLiveSteps([]);
      setLiveResponse("");
      activeMessageIdRef.current = null;
      stepNameToIdRef.current.clear();
      setMessages(prev => [...prev, {
        id: newId(),
        role: "assistant",
        content: `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`,
      }]);
    } finally {
      setIsLoading(false);
      setActiveRunSurface(null);
      setLiveResponse("");
      liveStepsRef.current = [];
      setLiveSteps([]);
      activeMessageIdRef.current = null;
      stepNameToIdRef.current.clear();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, activeSandbox, effectiveModel, ensureConversation, finishStep, updateStepDetail, pushStep, applyStepOps, fetchEditorFile, isBuilderMode, builderState?.sessionId, onBuilderStateChange, onReadyForReview, agent.workspaceMemory, conversationId]);

  // ── Start new chat ──────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    setConversationId(null);
    setMemoryAppliedConversationId(null);
    setMessages([]);
    setDetectedPreviewPorts([]);
  }, []);

  // ── Select editor file ──────────────────────────────────────────────────
  const selectEditorFile = useCallback((path: string) => {
    fetchEditorFile(path);
  }, [fetchEditorFile]);

  // ── Memory banner ───────────────────────────────────────────────────────
  const hasSavedWorkspaceMemory = hasWorkspaceMemory(agent.workspaceMemory);
  const memoryBanner = !hasSavedWorkspaceMemory
    ? null
    : conversationId && memoryAppliedConversationId === conversationId
    ? "Workspace memory was applied when this conversation started."
    : !conversationId
    ? "Workspace memory will be applied to the next new chat."
    : "Workspace memory is saved for the next new chat.";

  return {
    messages,
    isLoading,
    liveResponse,
    liveSteps,
    liveBrowserState,
    liveTaskPlan,
    activeEditorFile,
    recentEditorFiles,
    conversationId,
    loadingHistory,
    hasMoreHistory,
    activeRunSurface,
    sendMessage,
    startNewChat,
    loadOlderHistory,
    resumeBrowserTakeover,
    selectEditorFile,
    memoryBanner,
    tick,
    workspaceFilesTick,
    detectedPreviewPorts,
  };
}
