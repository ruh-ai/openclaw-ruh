"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, CheckCircle2, AlertCircle, MessageSquare, FolderOpen, Rocket, Trash2 } from "lucide-react";
import { ReviewAgent } from "./_components/review/ReviewAgent";
import type { ReviewAgentOutput } from "./_components/review/ReviewAgent";
import { ConfigureAgent } from "./_components/configure/ConfigureAgent";
import type { ConfigureOutput } from "./_components/configure/ConfigureAgent";
import { TabChat } from "@/app/(platform)/agents/[id]/chat/_components/TabChat";
import { useAgentsStore } from "@/hooks/use-agents-store";
import { pushAgentConfig } from "@/lib/openclaw/agent-config";
import { saveToolCredentials } from "./_config/mcp-tool-registry";
import { useBuilderState } from "@/lib/openclaw/builder-state";
import { useCoPilotStore } from "@/lib/openclaw/copilot-state";
import { buildDeployConfigSummary } from "@/lib/agents/operator-config-summary";
import { mergeRuntimeInputDefinitions } from "@/lib/agents/runtime-inputs";
import { buildCreateDeployHref, resolveImproveAgentCompletionHref } from "@/lib/agents/deploy-handoff";
import { finalizeCredentialBackedToolConnections } from "@/lib/tools/tool-integration";
import { CoPilotLayout } from "./_components/copilot/CoPilotLayout";
import { WorkspacePanel } from "./_components/WorkspacePanel";
import { ShipDialog } from "./_components/ShipDialog";
import { CreationProgressCard, deriveCreationPhase } from "./_components/CreationProgressCard";
import { AnimatedRuhLogo } from "./_components/AnimatedRuhLogo";
import { OnboardingSequence } from "./_components/OnboardingSequence";
import type { SavedAgent } from "@/hooks/use-agents-store";
import type { AgentTriggerDefinition } from "@/lib/agents/types";
import {
  applyAcceptedImprovementsToConfig,
  applyReviewOutputToCreateSessionConfig,
  createInitialCreateSessionConfig,
  deriveCreateSessionReviewState,
  projectSelectedSkillsRuntimeContract,
  resolveConfiguredSkillNames,
  type CreateSessionConfigState,
} from "./create-session-config";
import {
  resolveCoPilotCompletionKind,
} from "@/lib/openclaw/copilot-flow";
import { useArchitectSandbox } from "@/hooks/use-architect-sandbox";
import { useForgeSandbox } from "@/hooks/use-forge-sandbox";
import { CREATE_AGENT_MODE_OPTIONS, normalizeCreateMode, type CreateAgentMode } from "./create-mode";
import { DEV_MOCK_BAR_QUERY_PARAM, shouldShowDevMockBar } from "./dev-mock-bar";
import {
  saveCoPilotLifecycleToCache,
  loadCoPilotLifecycleFromCache,
  clearCoPilotLifecycleCache,
} from "@/lib/openclaw/copilot-lifecycle-cache";
import {
  buildResumedBuilderState,
  buildResumedCoPilotSeed,
  clearCreateSessionCache,
  loadCreateSessionFromCache,
  saveCreateSessionToCache,
} from "@/lib/openclaw/create-session-cache";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function deriveTriggerLabel(
  rules: string[],
  graph: SavedAgent["skillGraph"] | null | undefined,
  triggers?: AgentTriggerDefinition[],
) {
  if (triggers && triggers.length > 0) {
    return triggers.map((trigger) => trigger.title).join(", ");
  }
  const scheduleRule = rules.find(
    (rule) => rule.toLowerCase().includes("schedule") || rule.toLowerCase().includes("cron"),
  );
  return scheduleRule || (graph?.some((node) =>
    `${node.name}${node.description ?? ""}`.toLowerCase().includes("slack")
  ) ? "On message received" : "Manual trigger");
}

function deriveAvatar(name: string) {
  return name.includes("slack") ? "💬"
    : name.includes("github") || name.includes("code") ? "💻"
    : name.includes("data") || name.includes("ingest") ? "📊"
    : name.includes("email") || name.includes("mail") ? "📧"
    : name.includes("report") ? "📋"
    : "🤖";
}

function CreateAgentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingAgentId = searchParams.get("agentId");
  const showDevMockBar = shouldShowDevMockBar(
    process.env.NODE_ENV,
    searchParams.get(DEV_MOCK_BAR_QUERY_PARAM),
  );

  const [mode, setMode] = useState<CreateAgentMode>(() => normalizeCreateMode("copilot"));

  const [view, setView] = useState<"chat" | "review" | "configure">("chat");
  const [hotPushStatus, setHotPushStatus] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const [hotPushCount, setHotPushCount] = useState(0);
  const [hotPushSummary, setHotPushSummary] = useState<string>("");
  const [hotPushRetryTarget, setHotPushRetryTarget] = useState<{ agentId: string; sandboxIds: string[] } | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [rulesOverride, setRulesOverride] = useState<string[] | null>(null);
  const [reviewOutput, setReviewOutput] = useState<ReviewAgentOutput | null>(null);

  const { agents, saveAgent, persistAgentEdits, updateAgentConfig, deleteForge, fetchAgent } = useAgentsStore();
  const existingAgent = editingAgentId ? agents.find((a) => a.id === editingAgentId) ?? null : null;

  const { builderState, updateBuilderState, resetBuilderState, initializeFromAgent } = useBuilderState();
  const { sandbox: architectSandbox } = useArchitectSandbox();

  // ── v2: per-agent forge sandbox ──────────────────────────────────────────
  // Each new agent gets its own container. forgePhase tracks the provisioning
  // lifecycle. Once ready, the chat routes to the agent's own container.
  const [forgePhase, setForgePhase] = useState<"init" | "provisioning" | null>(() =>
    editingAgentId ? null : "init"
  );
  const [forgeLog, setForgeLog] = useState<string[]>([]);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<"building" | "live">("building");
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showShipDialog, setShowShipDialog] = useState(false);
  const [modeTransitionKey, setModeTransitionKey] = useState(0);
  const [workspaceFileCount, setWorkspaceFileCount] = useState(0);
  const [workspaceBadge, setWorkspaceBadge] = useState(false);
  const [isRouteAgentHydrated, setIsRouteAgentHydrated] = useState(() => !editingAgentId);
  const [hasRestoredSession, setHasRestoredSession] = useState(() => !editingAgentId);

  const handleInitSubmit = useCallback(async (name: string, description: string) => {
    setForgePhase("provisioning");
    setForgeLog(["Creating your agent..."]);
    setForgeError(null);

    try {
      const createRes = await fetch(`${API_BASE}/api/agents/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!createRes.ok) throw new Error("Failed to create agent");
      const { agent_id, stream_id } = (await createRes.json()) as { agent_id: string; stream_id: string };

      // Update URL immediately so the agent ID is visible and the page is refreshable
      window.history.replaceState(null, "", `/agents/create?agentId=${agent_id}`);
      setForgeLog((prev) => [...prev, "Starting container..."]);

      const sseRes = await fetch(`${API_BASE}/api/agents/${agent_id}/forge/stream/${stream_id}`);
      if (!sseRes.ok || !sseRes.body) throw new Error("Failed to open provisioning stream");

      const reader = sseRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sandboxReady = false;

      try {
        while (!sandboxReady) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const block of events) {
            if (!block.trim()) continue;
            let eventName = "";
            const dataLines: string[] = [];
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim();
              else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
            }
            const dataStr = dataLines.join("\n");
            if (!eventName || !dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr) as Record<string, unknown>;
              if (eventName === "log") {
                setForgeLog((prev) => [...prev, String(parsed.message ?? "")]);
              } else if (eventName === "error") {
                throw new Error(String(parsed.message ?? "Provisioning failed"));
              } else if (eventName === "result" || eventName === "done" || eventName === "approved") {
                sandboxReady = true;
                break;
              }
            } catch (e) {
              if (e instanceof Error && (e.message.includes("failed") || e.message.includes("Failed"))) throw e;
            }
          }
        }
      } finally {
        try { await reader.cancel(); } catch { /* ignore cancel errors */ }
        try { reader.releaseLock(); } catch { /* may already be released */ }
      }

      setForgeLog((prev) => [...prev, "Agent workspace ready — opening chat..."]);
      // Use window.location for hard navigation — router.push can be blocked
      // by the still-pending fetch response cleanup
      window.location.href = `/agents/create?agentId=${agent_id}`;
    } catch (err) {
      setForgeError(err instanceof Error ? err.message : "Failed to provision agent workspace");
      setForgePhase("init");
    }
  }, [router]);

  const coPilotStore = useCoPilotStore();
  useEffect(() => {
    let cancelled = false;

    if (!editingAgentId) {
      setIsRouteAgentHydrated(true);
      setHasRestoredSession(true);
      return;
    }

    setIsRouteAgentHydrated(false);
    setHasRestoredSession(false);

    void fetchAgent(editingAgentId)
      .catch(() => null)
      .finally(() => {
        if (!cancelled) {
          setIsRouteAgentHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editingAgentId, fetchAgent]);

  const persistedDraftAgent = useMemo(
    () => (
      builderState.draftAgentId
        ? agents.find((candidate) => candidate.id === builderState.draftAgentId) ?? null
        : null
    ),
    [agents, builderState.draftAgentId],
  );
  const workingAgent = existingAgent ?? persistedDraftAgent;
  const effectiveAgentId = workingAgent?.id ?? createdAgentId;

  // v2: each agent gets its own container — resolve its forge sandbox.
  // Falls back to the shared architect sandbox for the copilot flow.
  const { sandbox: forgeSandbox } = useForgeSandbox(
    workingAgent?.forgeSandboxId ? workingAgent.id : null
  );
  const effectiveSandbox = forgeSandbox ?? architectSandbox;

  // v2: Poll workspace file count to detect new file writes from the Architect.
  // Shows a badge on the Files button and auto-opens the panel on first write.
  useEffect(() => {
    const sandboxId = workingAgent?.forgeSandboxId;
    if (!sandboxId || forgePhase) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const url = new URL(`${API_BASE}/api/sandboxes/${sandboxId}/workspace/files`);
        url.searchParams.set("depth", "1");
        url.searchParams.set("limit", "1");
        const res = await fetch(url.toString());
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const count = (data.items as unknown[])?.length ?? 0;
        if (!cancelled) {
          setWorkspaceFileCount((prev) => {
            if (count > prev && prev > 0) {
              setWorkspaceBadge(true);
            }
            if (count > 0 && prev === 0 && !showWorkspace) {
              // Auto-open on first file write
              setShowWorkspace(true);
            }
            return count;
          });
        }
      } catch { /* non-critical */ }
    };

    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [workingAgent?.forgeSandboxId, forgePhase, showWorkspace]);

  // Clear badge when panel is opened
  useEffect(() => {
    if (showWorkspace) setWorkspaceBadge(false);
  }, [showWorkspace]);

  // v2: Test / Build mode toggle — switches the container between Architect and Agent SOUL
  const handleTestModeToggle = useCallback(async () => {
    if (!workingAgent?.id || isSwitchingMode) return;
    const targetMode = agentMode === "building" ? "live" : "building";
    setIsSwitchingMode(true);
    try {
      const res = await fetch(`${API_BASE}/api/agents/${workingAgent.id}/mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: targetMode }),
      });
      if (res.ok) {
        setAgentMode(targetMode);
        setModeTransitionKey((k) => k + 1);
      }
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsSwitchingMode(false);
    }
  }, [agentMode, isSwitchingMode, workingAgent?.id]);

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteForge = useCallback(async () => {
    const agentId = workingAgent?.id;
    if (!agentId || isDeleting) return;
    if (!window.confirm("Discard this agent? The container and all work will be permanently deleted.")) return;
    setIsDeleting(true);
    try {
      await deleteForge(agentId);
      clearCreateSessionCache(agentId);
      clearCoPilotLifecycleCache(agentId);
      router.push("/agents");
    } catch {
      setIsDeleting(false);
    }
  }, [workingAgent?.id, isDeleting, router, deleteForge]);

  const [createSessionConfig, setCreateSessionConfig] = useState<CreateSessionConfigState>(() =>
    createInitialCreateSessionConfig(workingAgent),
  );
  const isImprovingExistingAgent = Boolean(existingAgent);

  const reflectStage = searchParams.get("stage");

  useEffect(() => {
    setMode("copilot");
    const restoreId = editingAgentId ?? existingAgent?.id ?? null;
    const cachedSession = restoreId ? loadCreateSessionFromCache(restoreId) : null;
    const cachedLifecycle = restoreId ? loadCoPilotLifecycleFromCache(restoreId) : null;
    const cachedCoPilot = cachedSession?.coPilot ?? cachedLifecycle ?? null;
    const cachedBuilder = cachedSession?.builder ?? null;

    const applyRecoveredSession = (agentForResume: SavedAgent | null) => {
      if (agentForResume) {
        initializeFromAgent(agentForResume);
      } else {
        resetBuilderState();
      }

      updateBuilderState(
        buildResumedBuilderState(
          restoreId ?? agentForResume?.id ?? "draft",
          agentForResume,
          cachedBuilder,
          cachedCoPilot,
        ),
      );
      coPilotStore.hydrateFromSeed(buildResumedCoPilotSeed(agentForResume, cachedCoPilot));
      setHasRestoredSession(true);
    };

    // When returning from deploy page to reflect stage, wait for agent data
    if (reflectStage === "reflect" && editingAgentId) {
      if (!existingAgent && !isRouteAgentHydrated && !cachedCoPilot) return;
      if (!existingAgent) {
        applyRecoveredSession(null);
        return;
      }

      initializeFromAgent(existingAgent);
      updateBuilderState(
        buildResumedBuilderState(existingAgent.id, existingAgent, cachedBuilder, cachedCoPilot),
      );
      const seed = buildResumedCoPilotSeed(existingAgent, cachedCoPilot);
      coPilotStore.hydrateFromSeed({
        ...seed,
        devStage: "reflect",
        deployStatus: "done",
        thinkStatus: "done",
        planStatus: "done",
        buildStatus: "done",
        evalStatus: "done",
        buildReport: {
          agentName: existingAgent.name,
          createdAt: new Date().toISOString(),
          stages: [
            { stage: "think", status: "completed" },
            { stage: "plan", status: "completed" },
            { stage: "build", status: "completed" },
            { stage: "review", status: "completed" },
            { stage: "test", status: "completed" },
            { stage: "ship", status: "completed" },
            { stage: "reflect", status: "completed" },
          ],
          skillCount: existingAgent.skills?.length ?? 0,
          subAgentCount: 0,
          integrationCount: existingAgent.toolConnections?.length ?? 0,
          triggerCount: existingAgent.triggers?.length ?? 0,
          notes: "",
        },
      });
      setHasRestoredSession(true);
      return;
    }

    if (existingAgent) {
      applyRecoveredSession(existingAgent);
      return;
    }

    if (cachedCoPilot || cachedBuilder) {
      applyRecoveredSession(null);
      return;
    }

    if (editingAgentId && !isRouteAgentHydrated) {
      return;
    }

    resetBuilderState();
    coPilotStore.reset();
    setHasRestoredSession(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAgentId, reflectStage, existingAgent, isRouteAgentHydrated]);

  useEffect(() => {
    setCreateSessionConfig(createInitialCreateSessionConfig(workingAgent));
  }, [workingAgent]);

  useEffect(() => {
    const effectiveSkillGraph = builderState.skillGraph ?? workingAgent?.skillGraph;
    const effectiveRules =
      builderState.agentRules.length > 0 ? builderState.agentRules : (workingAgent?.agentRules ?? []);

    setCreateSessionConfig((current) => {
      if (current.runtimeInputsTouched) {
        return current;
      }

      return {
        ...current,
        runtimeInputs: mergeRuntimeInputDefinitions({
          existing: current.runtimeInputs,
          skillGraph: effectiveSkillGraph,
          agentRules: effectiveRules,
        }),
      };
    });
  }, [builderState.agentRules, builderState.skillGraph, workingAgent?.agentRules, workingAgent?.skillGraph]);

  useEffect(() => {
    if (coPilotStore.runtimeInputs.length === 0 && createSessionConfig.runtimeInputs.length > 0) {
      coPilotStore.setRuntimeInputs(createSessionConfig.runtimeInputs);
    }
    // setRuntimeInputs is a stable Zustand action — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coPilotStore.runtimeInputs, createSessionConfig.runtimeInputs]);

  useEffect(() => {
    if (mode !== "copilot") {
      return;
    }

    const currentSignature = JSON.stringify(createSessionConfig.runtimeInputs);
    const nextSignature = JSON.stringify(coPilotStore.runtimeInputs);
    if (currentSignature === nextSignature) {
      return;
    }

    setCreateSessionConfig((current) => ({
      ...current,
      runtimeInputs: coPilotStore.runtimeInputs,
      runtimeInputsTouched: true,
    }));
  }, [coPilotStore.runtimeInputs, createSessionConfig.runtimeInputs, mode]);

  useEffect(() => {
    if (existingAgent || !builderState.draftAgentId || isCompleting) {
      return;
    }

    const persistedSignature = JSON.stringify(workingAgent?.runtimeInputs ?? []);
    const draftSignature = JSON.stringify(coPilotStore.runtimeInputs);
    if (persistedSignature === draftSignature) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void updateAgentConfig(builderState.draftAgentId!, {
        runtimeInputs: coPilotStore.runtimeInputs,
      });
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    builderState.draftAgentId,
    coPilotStore.runtimeInputs,
    existingAgent,
    isCompleting,
    updateAgentConfig,
    workingAgent?.runtimeInputs,
  ]);

  useEffect(() => {
    if (existingAgent || !builderState.draftAgentId || isCompleting) {
      return;
    }

    const persistedSignature = JSON.stringify(workingAgent?.discoveryDocuments ?? null);
    const draftSignature = JSON.stringify(coPilotStore.discoveryDocuments ?? null);
    if (persistedSignature === draftSignature) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void updateAgentConfig(builderState.draftAgentId!, {
        discoveryDocuments: coPilotStore.discoveryDocuments ?? null,
      });
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    builderState.draftAgentId,
    coPilotStore.discoveryDocuments,
    existingAgent,
    isCompleting,
    updateAgentConfig,
    workingAgent?.discoveryDocuments,
  ]);

  // Persist the full create-session snapshot so refreshes can recover builder work,
  // then keep the lighter lifecycle cache for older resume paths.
  useEffect(() => {
    const agentId = editingAgentId ?? effectiveAgentId ?? builderState.draftAgentId;
    if (!agentId || !hasRestoredSession) return;

    const timeout = window.setTimeout(() => {
      const snapshot = coPilotStore.snapshot();
      saveCreateSessionToCache(agentId, {
        coPilot: snapshot,
        builder: builderState,
      });
      if (snapshot.devStage !== "think") {
        saveCoPilotLifecycleToCache(agentId, snapshot);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  });

  const syntheticAgent: SavedAgent = useMemo(() => {
    const effectiveImprovements = builderState.improvements.length > 0 ? builderState.improvements : (workingAgent?.improvements ?? []);
    const projected = applyAcceptedImprovementsToConfig({
      toolConnections: createSessionConfig.toolConnections,
      improvements: effectiveImprovements,
    });

    return {
      id: workingAgent?.id ?? "new-agent",
      name: reviewOutput?.name ?? nameOverride ?? builderState.name ?? builderState.systemName ?? workingAgent?.name ?? "New Agent",
      avatar: workingAgent?.avatar ?? "🤖",
      description: builderState.description || workingAgent?.description || "",
      skills: workingAgent?.skills ?? [],
      triggerLabel: workingAgent?.triggerLabel ?? "Manual trigger",
      status: workingAgent?.status ?? "draft",
      createdAt: workingAgent?.createdAt ?? new Date().toISOString(),
      sandboxIds: [],
      skillGraph: builderState.skillGraph ?? workingAgent?.skillGraph ?? undefined,
      workflow: builderState.workflow ?? workingAgent?.workflow ?? undefined,
      agentRules: builderState.agentRules.length > 0 ? builderState.agentRules : workingAgent?.agentRules,
      runtimeInputs: createSessionConfig.runtimeInputs,
      toolConnections: projected.toolConnections,
      triggers: createSessionConfig.triggers,
      improvements: effectiveImprovements,
      channels: coPilotStore.channels.length > 0 ? coPilotStore.channels : (workingAgent?.channels ?? []),
      discoveryDocuments: coPilotStore.discoveryDocuments ?? workingAgent?.discoveryDocuments ?? null,
    };
  }, [builderState, coPilotStore.channels, coPilotStore.discoveryDocuments, createSessionConfig.runtimeInputs, createSessionConfig.toolConnections, createSessionConfig.triggers, nameOverride, reviewOutput?.name, workingAgent]);

  const finalizePendingCredentialDrafts = useCallback(async (
    agentId: string,
    toolConnections: NonNullable<SavedAgent["toolConnections"]>,
    credentialDrafts: Record<string, Record<string, string>> | undefined,
  ) => {
    const credentialEntries = Object.entries(credentialDrafts ?? {}).filter(
      ([, values]) => Object.values(values).some((value) => value.trim().length > 0),
    );

    if (credentialEntries.length === 0) {
      return { toolConnections, error: null as string | null };
    }

    const commitResults = await Promise.all(
      credentialEntries.map(async ([toolId, credentials]) => {
        const result = await saveToolCredentials(agentId, toolId, credentials);
        return { toolId, ok: result.ok, error: result.error };
      }),
    );

    const finalToolConnections = finalizeCredentialBackedToolConnections(
      toolConnections,
      Object.fromEntries(commitResults.map((result) => [result.toolId, result.ok])),
      { credentialBackedToolIds: new Set(credentialEntries.map(([toolId]) => toolId)) },
    );

    await updateAgentConfig(agentId, { toolConnections: finalToolConnections });

    const failedCommits = commitResults.filter((result) => !result.ok);
    if (failedCommits.length > 0) {
      return {
        toolConnections: finalToolConnections,
        error: `The agent was created, but credential storage failed for ${failedCommits
          .map((result) => result.toolId)
          .join(", ")}. Review the saved agent and retry from Connect Tools.`,
      };
    }

    return { toolConnections: finalToolConnections, error: null as string | null };
  }, [updateAgentConfig]);

  // ─── Chat flow completion handler ───────────────────────────────────────────
  const handleComplete = useCallback(async (configOutput?: ConfigureOutput) => {
    setIsCompleting(true);
    setCompletionError(null);
    const { skillGraph, workflow, systemName, agentRules } = builderState;
    const effectiveRules = reviewOutput?.rules ?? rulesOverride ?? (agentRules.length > 0 ? agentRules : (workingAgent?.agentRules ?? []));
    const effectiveGraph = skillGraph ?? workingAgent?.skillGraph ?? null;
    const effectiveName = reviewOutput?.name ?? nameOverride ?? builderState.name ?? systemName ?? workingAgent?.name ?? "New Agent";
    const selectedSkillProjection = projectSelectedSkillsRuntimeContract({
      selectedSkillIds: configOutput?.selectedSkills ?? createSessionConfig.selectedSkills,
      skillGraph: effectiveGraph,
      workflow: workflow ?? workingAgent?.workflow ?? null,
      runtimeInputs: configOutput?.runtimeInputs ?? createSessionConfig.runtimeInputs,
      agentRules: effectiveRules,
    });
    const effectiveSkills = resolveConfiguredSkillNames(
      selectedSkillProjection.selectedSkillIds,
      selectedSkillProjection.skillGraph,
      reviewOutput?.skills ?? selectedSkillProjection.skillGraph?.map((node) => node.name) ?? workingAgent?.skills ?? [],
    );
    const effectiveImprovements = reviewOutput?.improvements ?? builderState.improvements ?? workingAgent?.improvements ?? [];
    const effectiveToolConnections = applyAcceptedImprovementsToConfig({
      toolConnections: configOutput?.toolConnections ?? createSessionConfig.toolConnections,
      improvements: effectiveImprovements,
    }).toolConnections;
    const effectiveRuntimeInputs = selectedSkillProjection.runtimeInputs;
    const effectiveTriggers = configOutput?.triggers ?? createSessionConfig.triggers;

    const triggerLabel = deriveTriggerLabel(
      effectiveRules,
      selectedSkillProjection.skillGraph,
      effectiveTriggers,
    );
    const avatar = deriveAvatar(effectiveName.toLowerCase());
    const description =
      effectiveRules.find((r) => r.toLowerCase().includes("schedule")) ||
      (selectedSkillProjection.skillGraph && selectedSkillProjection.skillGraph.length > 0
        ? `Runs ${selectedSkillProjection.skillGraph.length} skills: ${selectedSkillProjection.skillGraph.map((n) => n.name).join(", ")}`
        : "AI agent");

    const updatedFields = {
      name: effectiveName,
      avatar,
      description: description || "AI agent",
      skills: effectiveSkills,
      triggerLabel,
      skillGraph: selectedSkillProjection.skillGraph,
      workflow: selectedSkillProjection.workflow ?? undefined,
      agentRules: effectiveRules.length > 0 ? effectiveRules : undefined,
      runtimeInputs: effectiveRuntimeInputs,
      toolConnections: effectiveToolConnections,
      triggers: effectiveTriggers,
      improvements: effectiveImprovements,
      channels: workingAgent?.channels ?? [],
      discoveryDocuments: coPilotStore.discoveryDocuments ?? workingAgent?.discoveryDocuments ?? null,
    };

    if (effectiveAgentId) {
      const savedAgent = await persistAgentEdits(effectiveAgentId, {
        ...updatedFields,
        status: "active",
      });

      let finalToolConnections = savedAgent.toolConnections ?? effectiveToolConnections;

      if (!isImprovingExistingAgent) {
        const credentialResult = await finalizePendingCredentialDrafts(
          savedAgent.id,
          finalToolConnections,
          configOutput?.credentialDrafts,
        );
        finalToolConnections = credentialResult.toolConnections;
        if (credentialResult.error) {
          setCompletionError(credentialResult.error);
          setIsCompleting(false);
          return;
        }
      }

      const sandboxIds = savedAgent.sandboxIds ?? [];
      if (isImprovingExistingAgent && sandboxIds.length > 0) {
        setHotPushStatus("pushing");
        setHotPushCount(sandboxIds.length);
        setHotPushSummary("");
        try {
          const results = await Promise.all(
            sandboxIds.map(async (sid) => ({
              sandboxId: sid,
              result: await pushAgentConfig(sid, savedAgent),
            }))
          );
          const failedSandboxIds = results
            .filter(({ result }) => !result.ok)
            .map(({ sandboxId }) => sandboxId);
          const succeededCount = results.length - failedSandboxIds.length;

          if (failedSandboxIds.length === 0) {
            setHotPushStatus("done");
            setHotPushSummary(`${results.length} instance${results.length !== 1 ? "s" : ""} updated`);
          } else {
            setHotPushStatus("error");
            setHotPushSummary(
              `${succeededCount} updated, ${failedSandboxIds.length} failed (${failedSandboxIds.join(", ")})`
            );
          }
        } catch {
          setHotPushStatus("error");
          setHotPushSummary("Config push failed before all running instances could be updated");
        }
        await new Promise((r) => setTimeout(r, 1200));
      }

      if (isImprovingExistingAgent && sandboxIds.length === 0) {
        const deploySummary = buildDeployConfigSummary({
          runtimeInputs: savedAgent.runtimeInputs ?? effectiveRuntimeInputs,
          toolConnections: finalToolConnections,
          triggers: effectiveTriggers,
        });
        resetBuilderState();
        clearCreateSessionCache(savedAgent.id);
        clearCoPilotLifecycleCache(savedAgent.id);
        router.push(resolveImproveAgentCompletionHref(
          savedAgent.id,
          sandboxIds,
          deploySummary.readinessLabel === "Ready to deploy",
        ));
        return;
      }

      if (!isImprovingExistingAgent) {
        const deploySummary = buildDeployConfigSummary({
          runtimeInputs: savedAgent.runtimeInputs ?? effectiveRuntimeInputs,
          toolConnections: finalToolConnections,
          triggers: effectiveTriggers,
        });
        resetBuilderState();
        clearCreateSessionCache(savedAgent.id);
        clearCoPilotLifecycleCache(savedAgent.id);
        router.push(
          buildCreateDeployHref(savedAgent.id, deploySummary.readinessLabel === "Ready to deploy"),
        );
        return;
      }
    } else {
      const agentId = await saveAgent({ ...updatedFields, status: "active" });
      setCreatedAgentId(agentId);
      const credentialResult = await finalizePendingCredentialDrafts(
        agentId,
        effectiveToolConnections,
        configOutput?.credentialDrafts,
      );
      if (credentialResult.error) {
        setCompletionError(credentialResult.error);
        setIsCompleting(false);
        return;
      }

      const deploySummary = buildDeployConfigSummary({
        runtimeInputs: effectiveRuntimeInputs,
        toolConnections: credentialResult.toolConnections,
        triggers: effectiveTriggers,
      });
      resetBuilderState();
      clearCreateSessionCache(agentId);
      clearCoPilotLifecycleCache(agentId);
      router.push(
        buildCreateDeployHref(agentId, deploySummary.readinessLabel === "Ready to deploy"),
      );
      return;
    }

    resetBuilderState();
    if (effectiveAgentId) {
      clearCreateSessionCache(effectiveAgentId);
      clearCoPilotLifecycleCache(effectiveAgentId);
    }
    router.push("/agents");
  }, [builderState, createSessionConfig.runtimeInputs, createSessionConfig.selectedSkills, createSessionConfig.toolConnections, createSessionConfig.triggers, effectiveAgentId, finalizePendingCredentialDrafts, isImprovingExistingAgent, nameOverride, persistAgentEdits, resetBuilderState, reviewOutput, router, rulesOverride, saveAgent, workingAgent]);

  const handleBuilderStateChange = useCallback((partial: Partial<typeof builderState>) => {
    updateBuilderState(partial);
  }, [updateBuilderState]);

  // ─── Mode switch with state sync ────────────────────────────────────────────

  const handleModeSwitch = useCallback((newMode: CreateAgentMode) => {
    const currentMode = mode;
    if (newMode === currentMode) return;

    if (currentMode === "copilot" && newMode === "chat") {
      // Sync CoPilotStore → BuilderState so chat mode sees copilot edits
      const snap = coPilotStore.snapshot();
      updateBuilderState({
        name: snap.name || builderState.name,
        description: snap.description || builderState.description,
        skillGraph: snap.skillGraph ?? builderState.skillGraph,
        workflow: snap.workflow ?? builderState.workflow,
        agentRules: snap.agentRules.length > 0 ? snap.agentRules : builderState.agentRules,
        triggers: snap.triggers.length > 0 ? snap.triggers : builderState.triggers,
        improvements: snap.improvements.length > 0 ? snap.improvements : builderState.improvements,
      });
    } else if (currentMode === "chat" && newMode === "copilot") {
      // Sync BuilderState → CoPilotStore so copilot mode sees chat edits
      const currentCopilot = coPilotStore.snapshot();
      coPilotStore.hydrateFromSeed({
        ...currentCopilot,
        name: builderState.name || currentCopilot.name,
        description: builderState.description || currentCopilot.description,
        skillGraph: builderState.skillGraph ?? currentCopilot.skillGraph,
        workflow: builderState.workflow ?? currentCopilot.workflow,
        agentRules: builderState.agentRules.length > 0 ? builderState.agentRules : currentCopilot.agentRules,
      });
    }

    setMode(newMode);
  }, [builderState, coPilotStore, mode, updateBuilderState]);

  // ─── Hot push retry ──────────────────────────────────────────────────────────

  const retryHotPush = useCallback(async () => {
    if (!hotPushRetryTarget) return;
    const targetAgent = agents.find((a) => a.id === hotPushRetryTarget.agentId);
    if (!targetAgent) return;
    const sids = hotPushRetryTarget.sandboxIds;
    setHotPushStatus("pushing");
    setHotPushCount(sids.length);
    setHotPushSummary("");
    setHotPushRetryTarget(null);
    try {
      const results = await Promise.all(
        sids.map(async (sid) => ({
          sandboxId: sid,
          result: await pushAgentConfig(sid, targetAgent),
        })),
      );
      const failedSandboxIds = results
        .filter(({ result }) => !result.ok)
        .map(({ sandboxId }) => sandboxId);
      const succeededCount = results.length - failedSandboxIds.length;
      if (failedSandboxIds.length === 0) {
        setHotPushStatus("done");
        setHotPushSummary(`${results.length} instance${results.length !== 1 ? "s" : ""} updated`);
        await new Promise((r) => setTimeout(r, 1200));
        resetBuilderState();
        if (hotPushRetryTarget.agentId) {
          clearCreateSessionCache(hotPushRetryTarget.agentId);
          clearCoPilotLifecycleCache(hotPushRetryTarget.agentId);
        }
        coPilotStore.reset();
        router.push("/agents");
      } else {
        setHotPushStatus("error");
        setHotPushSummary(`${succeededCount} updated, ${failedSandboxIds.length} still failed`);
        setHotPushRetryTarget({ agentId: hotPushRetryTarget.agentId, sandboxIds: failedSandboxIds });
      }
    } catch {
      setHotPushStatus("error");
      setHotPushSummary("Retry failed");
      setHotPushRetryTarget({ agentId: hotPushRetryTarget.agentId, sandboxIds: sids });
    }
  }, [agents, coPilotStore, hotPushRetryTarget, resetBuilderState, router]);

  const dismissHotPush = useCallback(() => {
    setHotPushStatus("idle");
    setHotPushRetryTarget(null);
    resetBuilderState();
    if (effectiveAgentId) {
      clearCreateSessionCache(effectiveAgentId);
      clearCoPilotLifecycleCache(effectiveAgentId);
    }
    coPilotStore.reset();
    router.push("/agents");
  }, [coPilotStore, effectiveAgentId, resetBuilderState, router]);

  // ─── Render: CoPilot mode ───────────────────────────────────────────────────

  const handleCoPilotComplete = useCallback(async (): Promise<boolean> => {
    setIsCompleting(true);
    const state = coPilotStore.snapshot();
    setCompletionError(null);
    const completionKind = resolveCoPilotCompletionKind({
      existingAgentId: existingAgent?.id ?? null,
      draftAgentId: builderState.draftAgentId,
    });
    const selectedSkillProjection = projectSelectedSkillsRuntimeContract({
      selectedSkillIds: state.selectedSkillIds,
      skillGraph: state.skillGraph,
      workflow: state.workflow,
      runtimeInputs: state.runtimeInputs,
      agentRules: state.agentRules,
    });
    const effectiveSkills = resolveConfiguredSkillNames(
      selectedSkillProjection.selectedSkillIds,
      selectedSkillProjection.skillGraph,
      workingAgent?.skills ?? [],
    );
    const finalFields = {
      name: state.name || builderState.name || state.systemName || builderState.systemName || "New Agent",
      avatar: "🤖",
      description: state.description || builderState.description,
      skills: effectiveSkills,
      triggerLabel: state.triggers.map(t => t.title || t.id).join(", "),
      agentRules: state.agentRules,
      runtimeInputs: selectedSkillProjection.runtimeInputs,
      skillGraph: selectedSkillProjection.skillGraph,
      workflow: selectedSkillProjection.workflow,
      toolConnections: applyAcceptedImprovementsToConfig({
        toolConnections: state.connectedTools,
        improvements: state.improvements,
      }).toolConnections,
      triggers: state.triggers,
      improvements: state.improvements,
      channels: state.channels,
      discoveryDocuments: state.discoveryDocuments ?? null,
    };
    if (completionKind === "improve-existing" && existingAgent) {
      const savedAgent = await persistAgentEdits(existingAgent.id, {
        ...finalFields,
        status: "active",
      });

      const sandboxIds = savedAgent.sandboxIds ?? [];
      if (sandboxIds.length > 0) {
        setHotPushStatus("pushing");
        setHotPushCount(sandboxIds.length);
        setHotPushSummary("");
        setHotPushRetryTarget(null);
        try {
          const results = await Promise.all(
            sandboxIds.map(async (sid) => ({
              sandboxId: sid,
              result: await pushAgentConfig(sid, savedAgent),
            })),
          );
          const failedSandboxIds = results
            .filter(({ result }) => !result.ok)
            .map(({ sandboxId }) => sandboxId);
          const succeededCount = results.length - failedSandboxIds.length;

          if (failedSandboxIds.length === 0) {
            setHotPushStatus("done");
            setHotPushSummary(`${results.length} instance${results.length !== 1 ? "s" : ""} updated`);
          } else {
            setHotPushStatus("error");
            setHotPushSummary(
              `${succeededCount} updated, ${failedSandboxIds.length} failed`,
            );
            setHotPushRetryTarget({ agentId: existingAgent.id, sandboxIds: failedSandboxIds });
            setIsCompleting(false);
            return false;
          }
        } catch {
          setHotPushStatus("error");
          setHotPushSummary("Config push failed before all running instances could be updated");
          setHotPushRetryTarget({ agentId: existingAgent.id, sandboxIds });
          setIsCompleting(false);
          return false;
        }
        await new Promise((r) => setTimeout(r, 1200));

        resetBuilderState();
        if (effectiveAgentId) clearCoPilotLifecycleCache(effectiveAgentId);
        if (effectiveAgentId) clearCreateSessionCache(effectiveAgentId);
        coPilotStore.reset();
        router.push("/agents");
        return true;
      }

      const deploySummary = buildDeployConfigSummary({
        runtimeInputs: finalFields.runtimeInputs,
        toolConnections: savedAgent.toolConnections ?? finalFields.toolConnections,
        triggers: finalFields.triggers,
      });

      resetBuilderState();
      if (effectiveAgentId) clearCoPilotLifecycleCache(effectiveAgentId);
      if (effectiveAgentId) clearCreateSessionCache(effectiveAgentId);
      coPilotStore.reset();
      router.push(resolveImproveAgentCompletionHref(
        existingAgent.id,
        sandboxIds,
        deploySummary.readinessLabel === "Ready to deploy",
      ));
      return true;
    }

    // Include the forge sandbox ID so we can skip re-deployment.
    // The forge step already provisioned a Docker sandbox — Ship just saves config
    // and pushes it to the existing sandbox instead of creating a new one.
    const forgeSandboxId = workingAgent?.forgeSandboxId ?? architectSandbox?.sandbox_id ?? undefined;

    const agentId = completionKind === "deploy-draft" && builderState.draftAgentId
      ? (
          await persistAgentEdits(builderState.draftAgentId, {
            ...finalFields,
            status: "active",
            ...(forgeSandboxId ? { forgeSandboxId } : {}),
          })
        ).id
      : await saveAgent({
          ...finalFields,
          status: "active",
          ...(forgeSandboxId ? { forgeSandboxId } : {}),
        });

    const credentialResult = await finalizePendingCredentialDrafts(
      agentId,
      state.connectedTools,
      state.credentialDrafts,
    );
    if (credentialResult.error) {
      setCompletionError(credentialResult.error);
      setIsCompleting(false);
      return false;
    }

    // If a forge sandbox already exists, push config to it instead of redirecting
    // to the deploy page (which would spin up a NEW sandbox — wasteful).
    if (forgeSandboxId) {
      try {
        const savedAgent = agents.find((a) => a.id === agentId) ?? { id: agentId, ...finalFields, toolConnections: credentialResult.toolConnections };
        const pushResult = await pushAgentConfig(
          forgeSandboxId,
          savedAgent as Parameters<typeof pushAgentConfig>[1],
        );
        if (!pushResult.ok) {
          setCompletionError(pushResult.detail ?? "Failed to activate agent");
          setIsCompleting(false);
          return false;
        }
      } catch (error) {
        setCompletionError(
          error instanceof Error ? error.message : "Failed to activate agent",
        );
        setIsCompleting(false);
        return false;
      }
      resetBuilderState();
      if (agentId) clearCoPilotLifecycleCache(agentId);
      if (agentId) clearCreateSessionCache(agentId);
      coPilotStore.reset();
      setIsCompleting(false);
      // Stay on the page — advance the wizard to Reflect stage
      coPilotStore.setDeployStatus("done");
      coPilotStore.advanceDevStage(); // ship → reflect
      return true;
    }

    // No forge sandbox — redirect to deploy page (legacy path)
    const deploySummary = buildDeployConfigSummary({
      runtimeInputs: finalFields.runtimeInputs,
      toolConnections: credentialResult.toolConnections,
      triggers: state.triggers,
    });

    resetBuilderState();
    if (agentId) clearCoPilotLifecycleCache(agentId);
    if (agentId) clearCreateSessionCache(agentId);
    coPilotStore.reset();
    router.push(
      buildCreateDeployHref(agentId, deploySummary.readinessLabel === "Ready to deploy"),
    );
    return true;
  }, [architectSandbox, builderState.description, builderState.draftAgentId, builderState.name, builderState.systemName, coPilotStore, existingAgent, finalizePendingCredentialDrafts, persistAgentEdits, resetBuilderState, router, saveAgent, workingAgent?.skills]);

  // ── v2 init form: shown when creating a brand-new agent ──────────────────
  if (forgePhase === "init" || forgePhase === "provisioning") {
    return (
      <ForgeInitScreen
        phase={forgePhase}
        log={forgeLog}
        error={forgeError}
        onSubmit={handleInitSubmit}
        onBack={() => router.push("/agents")}
      />
    );
  }

  if (mode === "copilot") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Mode toggle header */}
        <div className="flex items-center justify-between px-6 md:px-8 py-3 shrink-0 border-b border-[var(--border-default)] bg-[var(--card-color)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/agents")}
              className="p-1 rounded-lg hover:bg-[var(--color-light,#f5f5f5)] transition-colors cursor-pointer"
              aria-label="Back to agents"
            >
              <ChevronLeft className="h-5 w-5 text-[var(--text-secondary)]" />
            </button>
            <h1 className="text-lg font-satoshi-bold text-[var(--text-primary)]">
              {editingAgentId ? "Improve Agent" : "Create New Agent"}
            </h1>
          </div>
          <ModeToggle mode={mode} onChange={handleModeSwitch} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {completionError && (
            <div className="px-6 pt-4 md:px-8">
              <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/10 px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm font-satoshi-regular text-[var(--error)]">
                  {completionError}
                </span>
                {completionError.includes("credential") && (
                  <button
                    onClick={() => {
                      setCompletionError(null);
                      handleCoPilotComplete();
                    }}
                    className="shrink-0 px-3 py-1 text-xs font-satoshi-bold text-white bg-[var(--error)] rounded-lg hover:opacity-90 transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}
          {showDevMockBar && (
            <DevMockBar coPilotStore={coPilotStore} />
          )}
          <CoPilotLayout
            existingAgent={workingAgent}
            builderState={builderState}
            disableBuilderAutosave={isCompleting}
            isCompleting={isCompleting}
            onBuilderStateChange={handleBuilderStateChange}
            onComplete={handleCoPilotComplete}
            onCancel={() => router.push("/agents")}
            architectSandbox={effectiveSandbox}
          />
        </div>
      </div>
    );
  }

  // ─── Render: Chat mode (advanced) ───────────────────────────────────────────

  if (view === "review") {
    const reviewGraph = builderState.skillGraph ?? workingAgent?.skillGraph ?? null;
    const reviewName = reviewOutput?.name ?? nameOverride ?? builderState.name ?? builderState.systemName ?? workingAgent?.name ?? null;
    const reviewRules = reviewOutput?.rules ?? rulesOverride ?? (builderState.agentRules.length > 0 ? builderState.agentRules : (workingAgent?.agentRules ?? []));
    const reviewWorkflow = builderState.workflow ?? workingAgent?.workflow ?? null;
    const reviewImprovements = builderState.improvements.length > 0 ? builderState.improvements : (workingAgent?.improvements ?? []);
    const reviewConfig = deriveCreateSessionReviewState(
      createSessionConfig,
      workingAgent,
      reviewImprovements,
    );
    return (
      <ReviewAgent
        onBack={() => setView("chat")}
        onConfirm={(output) => {
          setReviewOutput(output);
          setNameOverride(output.name);
          setRulesOverride(output.rules);
          updateBuilderState({ improvements: output.improvements });
          setCreateSessionConfig((current) => applyReviewOutputToCreateSessionConfig({
            current,
            skillGraph: reviewGraph,
            reviewSkills: output.skills,
            reviewTriggers: output.triggers,
            improvements: output.improvements,
            fallbackToolConnections: workingAgent?.toolConnections ?? [],
            fallbackTriggers: workingAgent?.triggers ?? [],
          }));
          setView("configure");
        }}
        skillGraph={reviewGraph}
        workflow={reviewWorkflow}
        systemName={reviewName}
        agentRules={reviewRules}
        toolConnections={reviewConfig.toolConnections}
        runtimeInputs={reviewConfig.runtimeInputs}
        triggers={reviewConfig.triggers}
        improvements={reviewImprovements}
        discoveryDocuments={coPilotStore.discoveryDocuments ?? workingAgent?.discoveryDocuments ?? null}
      />
    );
  }

  if (view === "configure") {
    return (
      <div className="relative flex flex-col h-full">
        <ConfigureAgent
          agentName={reviewOutput?.name ?? builderState.name ?? builderState.systemName ?? workingAgent?.name ?? "New Agent"}
          onBack={() => setView("review")}
          onComplete={(configOutput) => handleComplete(configOutput)}
          onCancel={() => router.push("/agents")}
          value={createSessionConfig}
          onChange={setCreateSessionConfig}
          agentId={effectiveAgentId}
          skillGraph={builderState.skillGraph ?? workingAgent?.skillGraph}
          agentDescription={syntheticAgent.description}
          agentRules={reviewOutput?.rules ?? (builderState.agentRules.length > 0 ? builderState.agentRules : workingAgent?.agentRules)}
        />
        {completionError && (
          <div className="absolute inset-x-0 top-0 flex justify-center px-6 pt-4 pointer-events-auto">
            <div className="max-w-3xl rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/10 px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
              <span className="text-sm font-satoshi-regular text-[var(--error)]">{completionError}</span>
              {completionError.includes("credential") && (
                <button
                  onClick={() => setCompletionError(null)}
                  className="shrink-0 px-3 py-1 text-xs font-satoshi-bold text-white bg-[var(--error)] rounded-lg hover:opacity-90 transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}
        {hotPushStatus !== "idle" && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center px-6 pb-6 pointer-events-auto">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg bg-[var(--card-color)] border-[var(--border-stroke)]">
              {hotPushStatus === "pushing" && (
                <>
                  <Loader2 className="h-4 w-4 text-[var(--primary)] animate-spin shrink-0" />
                  <span className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                    Updating {hotPushCount} running instance{hotPushCount !== 1 ? "s" : ""}...
                  </span>
                </>
              )}
              {hotPushStatus === "done" && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[var(--success)] shrink-0" />
                  <span className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                    {hotPushSummary || `${hotPushCount} instance${hotPushCount !== 1 ? "s" : ""} updated`}
                  </span>
                </>
              )}
              {hotPushStatus === "error" && (
                <>
                  <AlertCircle className="h-4 w-4 text-[var(--error)] shrink-0" />
                  <span className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                    {hotPushSummary || "Config push failed — instances may need a redeploy"}
                  </span>
                  {hotPushRetryTarget && (
                    <button
                      onClick={retryHotPush}
                      className="ml-2 px-2.5 py-1 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={dismissHotPush}
                    className="ml-1 px-2.5 py-1 text-xs font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] rounded-lg hover:bg-[var(--color-light)] transition-colors"
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Chat view (builder mode) ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className={[
          "flex items-center justify-between px-6 md:px-8 py-3 shrink-0 border-b transition-all duration-500",
          agentMode === "live"
            ? "border-[var(--primary)]/20 bg-gradient-to-r from-[var(--card-color)] via-[rgba(174,0,208,0.03)] to-[var(--card-color)]"
            : "border-[var(--border-default)] bg-[var(--card-color)]",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/agents")}
            className="p-1 rounded-lg hover:bg-[var(--color-light,#f5f5f5)] transition-colors cursor-pointer"
            aria-label="Back to agents"
          >
            <ChevronLeft className="h-5 w-5 text-[var(--text-secondary)]" />
          </button>
          {workingAgent?.forgeSandboxId ? (
            <CreationProgressCard
              agentName={workingAgent.name ?? "Agent"}
              currentPhase={deriveCreationPhase(builderState)}
              isReady={agentMode === "live"}
            />
          ) : (
            <div>
              <h1 className="text-lg font-satoshi-bold text-[var(--text-primary)]">
                {existingAgent ? "Improve Agent" : "Create New Agent"}
              </h1>
              {existingAgent && (
                <p className="text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                  {existingAgent.name}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {workingAgent?.forgeSandboxId && (
            <button
              onClick={() => setShowWorkspace((v) => !v)}
              className={[
                "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-satoshi-medium transition-colors",
                showWorkspace
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--color-light,#f5f5f5)]",
              ].join(" ")}
              title="Toggle workspace files"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Files</span>
              {workspaceBadge && !showWorkspace && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--primary)] spark" />
              )}
            </button>
          )}
          {workingAgent?.forgeSandboxId ? (
            <>
              <button
                onClick={handleDeleteForge}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--error)]/5 transition-colors"
                title="Discard agent and container"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Discard</span>
              </button>
              <button
                onClick={handleTestModeToggle}
                disabled={isSwitchingMode}
                className={[
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-satoshi-bold transition-all",
                  isSwitchingMode
                    ? "opacity-60 cursor-not-allowed bg-[var(--primary)]/20 text-[var(--primary)]"
                    : agentMode === "building"
                    ? "bg-[var(--primary)] text-white hover:opacity-90"
                    : "bg-[var(--border-stroke)] text-[var(--text-primary)] hover:bg-[var(--border-default)]",
                ].join(" ")}
              >
                {isSwitchingMode ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{agentMode === "building" ? "Launching..." : "Returning..."}</span>
                  </>
                ) : agentMode === "building" ? (
                  "Test Agent"
                ) : (
                  "Back to Build"
                )}
              </button>
              {agentMode === "live" && (
                <button
                  onClick={() => setShowShipDialog(true)}
                  className="spark flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-satoshi-bold gradient-drift text-white hover:opacity-90 transition-all"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Ship
                </button>
              )}
            </>
          ) : (
            !existingAgent && <ModeToggle mode={mode} onChange={handleModeSwitch} />
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div key={modeTransitionKey} className="flex-1 flex flex-col overflow-hidden min-h-0 stage-enter">
          <TabChat
            mode="builder"
            disableBuilderAutosave={isCompleting}
            agent={syntheticAgent}
            activeSandbox={effectiveSandbox}
            selectedConvId={null}
            onConversationCreated={() => {}}
            builderState={builderState}
            onBuilderStateChange={handleBuilderStateChange}
            onReadyForReview={() => setView("review")}
          />
        </div>
        {showWorkspace && workingAgent?.forgeSandboxId && (
          <WorkspacePanel
            sandboxId={workingAgent.forgeSandboxId}
            onClose={() => setShowWorkspace(false)}
          />
        )}
      </div>

      {showShipDialog && workingAgent?.forgeSandboxId && (
        <ShipDialog
          sandboxId={workingAgent.forgeSandboxId}
          agentName={workingAgent.name ?? "Agent"}
          onClose={() => setShowShipDialog(false)}
        />
      )}
    </div>
  );
}

// ── Forge Init Screen ─────────────────────────────────────────────────────────
// Shown before the chat opens — collects name + description, then provisions
// the agent's own container with the Architect SOUL.md pre-loaded.
// Uses Alive Additions from DESIGN.md for warmth and presence.

/** Map raw provisioning log lines to friendly, human-readable steps */
function friendlyProvisioningStep(line: string): string | null {
  const lower = line.toLowerCase();
  if (lower.includes("creating your agent")) return "Starting your agent's journey...";
  if (lower.includes("starting container")) return "Preparing a private workspace...";
  if (lower.includes("pulling")) return "Setting up the environment...";
  if (lower.includes("container started") || lower.includes("container '")) return "Workspace is ready...";
  if (lower.includes("installing openclaw")) return "Teaching your agent the basics...";
  if (lower.includes("openclaw installed")) return "Core skills installed...";
  if (lower.includes("browser") || lower.includes("vnc")) return "Adding visual abilities...";
  if (lower.includes("gateway")) return "Opening communication channels...";
  if (lower.includes("architect") || lower.includes("soul")) return "Awakening the Architect...";
  if (lower.includes("ready") || lower.includes("opening chat")) return "Your agent is coming to life...";
  if (lower.includes("forwarding")) return null; // skip noisy env var lines
  return null; // hide raw technical lines
}

function ForgeInitScreen({
  phase,
  log,
  error,
  onSubmit,
  onBack,
}: {
  phase: "init" | "provisioning";
  log: string[];
  error: string | null;
  onSubmit: (name: string, description: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Derive friendly provisioning steps (deduplicated, filtered)
  const friendlySteps = useMemo(() => {
    const steps: string[] = [];
    const seen = new Set<string>();
    for (const line of log) {
      const friendly = friendlyProvisioningStep(line);
      if (friendly && !seen.has(friendly)) {
        seen.add(friendly);
        steps.push(friendly);
      }
    }
    return steps;
  }, [log]);

  // Orb intensity grows with progress
  const orbIntensity = Math.min(friendlySteps.length / 6, 1);

  if (phase === "provisioning") {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[var(--background)] px-6">
        <div className="w-full max-w-lg space-y-8 stage-enter">
          {/* Animated explainer: how Ruh works — cycles through scenes */}
          <OnboardingSequence />

          {/* Dark terminal card with live shell output */}
          {log.length > 0 && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "#0c0a14" }}
            >
              <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="ml-2 text-[9px] font-mono text-white/20">agent workspace</span>
              </div>
              <div className="px-4 py-3 space-y-1 max-h-[160px] overflow-y-auto">
                {log.map((line, i) => {
                  const age = log.length - i;
                  const isNew = age <= 2;
                  const isRecent = age <= 5;
                  return (
                    <p
                      key={i}
                      className="font-mono whitespace-nowrap overflow-hidden transition-opacity duration-500"
                      style={{
                        fontSize: "12px",
                        lineHeight: "20px",
                        color: "#fff",
                        opacity: 1,
                      }}
                    >
                      <span style={{ color: "#22c55e" }}>$</span> {line}
                    </p>
                  );
                })}
              </div>
            </div>
          )}

          {/* Progress dots */}
          <div className="flex justify-center gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-500"
                style={{
                  width: "8px",
                  height: "8px",
                  backgroundColor: i < friendlySteps.length
                    ? `rgba(174, 0, 208, ${0.4 + (i / 6) * 0.6})`
                    : "rgba(0, 0, 0, 0.06)",
                }}
              />
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/10 px-4 py-3 text-sm font-satoshi-regular text-[var(--error)] text-center spark">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full items-center justify-center bg-[var(--background)] px-6">
      <div className="w-full max-w-md space-y-8 stage-enter">
        {/* Ruh logo mark — idle mode, starts breathing when name is typed */}
        <div className="flex justify-center">
          <AnimatedRuhLogo
            mode={name.trim() ? "alive" : "idle"}
            size={72}
          />
        </div>

        <div className="text-center space-y-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-satoshi-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mx-auto mb-2 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to agents
          </button>
          <h1 className="text-2xl font-satoshi-bold text-[var(--text-primary)]">
            Who are you bringing to life?
          </h1>
          <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
            Give them a name and a purpose. You&apos;ll shape the rest together.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-satoshi-medium text-[var(--text-primary)]">
              Their name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Google Ads Manager"
              className="focus-breathe w-full px-4 py-3 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] text-sm font-satoshi-regular text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) onSubmit(name.trim(), description.trim());
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-satoshi-medium text-[var(--text-primary)]">
              What&apos;s their job?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe their role like you'd explain it to a teammate — what they handle, who they help, what good looks like."
              rows={4}
              className="focus-breathe w-full px-4 py-3 rounded-xl border border-[var(--border-stroke)] bg-[var(--card-color)] text-sm font-satoshi-regular text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none transition-all resize-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-[var(--error)]/20 bg-[var(--error)]/10 px-4 py-3 text-sm font-satoshi-regular text-[var(--error)]">
              {error}
            </div>
          )}

          <button
            onClick={() => { if (name.trim()) onSubmit(name.trim(), description.trim()); }}
            disabled={!name.trim()}
            className="gradient-drift w-full py-3 px-6 rounded-xl text-white text-sm font-satoshi-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:animate-none transition-all"
          >
            Bring to life
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateAgentPageFallback() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm font-satoshi-medium text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading agent builder...
      </div>
    </div>
  );
}

export default function CreateAgentPage() {
  return (
    <Suspense fallback={<CreateAgentPageFallback />}>
      <CreateAgentPageContent />
    </Suspense>
  );
}

// ─── Dev Mock Bar (dev only) ─────────────────────────────────────────────────

function DevMockBar({ coPilotStore }: { coPilotStore: { hydrateFromSeed: (seed: Record<string, unknown>) => void; devStage: string } }) {
  const [loadedStage, setLoadedStage] = useState<string | null>(null);

  const loadMock = async (stage: "review" | "test" | "test-done" | "ship" | "reflect") => {
    const mocks = await import("./_config/review-stage-mock");
    const seed = stage === "review"
      ? mocks.REVIEW_STAGE_MOCK
      : stage === "test"
      ? mocks.TEST_STAGE_MOCK
      : stage === "test-done"
      ? mocks.TEST_STAGE_COMPLETED_MOCK
      : stage === "ship"
      ? mocks.SHIP_STAGE_MOCK
      : mocks.REFLECT_STAGE_MOCK;
    coPilotStore.hydrateFromSeed(seed);
    setLoadedStage(stage);
  };

  const mockButtons: Array<{ id: "review" | "test" | "test-done" | "ship" | "reflect"; label: string }> = [
    { id: "review", label: "Review" },
    { id: "test", label: "Test" },
    { id: "test-done", label: "Test (done)" },
    { id: "ship", label: "Ship" },
    { id: "reflect", label: "Reflect" },
  ];

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
      <span className="text-[10px] font-mono text-amber-600">DEV</span>
      {mockButtons.map((btn) => (
        <button
          key={btn.id}
          onClick={() => loadMock(btn.id)}
          className={`px-2 py-0.5 text-[10px] font-satoshi-medium rounded ${
            loadedStage === btn.id
              ? "bg-green-500/20 text-green-600"
              : "bg-amber-500/20 text-amber-700 hover:bg-amber-500/30"
          } transition-colors`}
        >
          {loadedStage === btn.id ? `${btn.label} loaded` : btn.label}
        </button>
      ))}
      <span className="text-[10px] text-amber-600/60">
        Stage: {coPilotStore.devStage}
      </span>
    </div>
  );
}

// ─── Mode Toggle Component ────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: CreateAgentMode;
  onChange: (mode: CreateAgentMode) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-[var(--border-stroke)] bg-[var(--background)] p-0.5">
      {CREATE_AGENT_MODE_OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(normalizeCreateMode(id))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-satoshi-medium transition-all cursor-pointer ${
            mode === id
              ? "bg-[var(--card-color)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          }`}
        >
          <MessageSquare className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}
