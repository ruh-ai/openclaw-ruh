"use client";

/**
 * CoPilotLayout — unified Co-Pilot builder workspace.
 *
 * TabChat hosts both the builder chat and the Agent's Computer workspace.
 * The Config tab inside that workspace renders the active Co-Pilot step UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Rocket, Loader2, Check, AlertCircle } from "lucide-react";
import { TabChat } from "@/app/(platform)/agents/[id]/chat/_components/TabChat";
import { buildDeployConfigSummary } from "@/lib/agents/operator-config-summary";
import { isRuntimeInputFilled, mergeRuntimeInputDefinitions, enrichRuntimeInputsFromPlan } from "@/lib/agents/runtime-inputs";
import { generateSkillTests, skillTestsToEvalTasks } from "@/lib/openclaw/skill-test-generator";
import { hasRequiredDashboardPrototype, hasUsableArchitecturePlan, useCoPilotStore } from "@/lib/openclaw/copilot-state";
import {
  buildReviewStateFromArchitecturePlan,
  evaluateCoPilotDeployReadiness,
  hasPurposeMetadata,
  getSelectedUnresolvedSkillIds,
} from "@/lib/openclaw/copilot-flow";
import type { BuilderState } from "@/lib/openclaw/builder-state";
import {
  fetchSkillRegistry,
  resolveSkillAvailability,
  type SkillRegistryEntry,
} from "@/lib/skills/skill-registry";
import { generateDiscoveryQuestions, generateSkillsFromArchitect } from "../../_config/generate-skills";
import type { SavedAgent } from "@/hooks/use-agents-store";
import type { ArchitectSandboxInfo } from "@/hooks/use-architect-sandbox";
import type { AgentDevStage, ArchitecturePlan } from "@/lib/openclaw/types";
import type { BuildReport } from "@/lib/openclaw/types";
import { shouldApplyWorkspaceRehydration } from "@/lib/openclaw/workspace-rehydration";

/**
 * True when the plan object was synthesized from `normalizePlan({})` — every
 * array is empty and every optional object is null. Treat these as "no plan"
 * so we overwrite them with the real one from the sandbox file.
 */
function isEmptyArchitecturePlan(plan: ArchitecturePlan | null): boolean {
  if (!plan) return false;
  return (
    (plan.skills?.length ?? 0) === 0
    && (plan.workflow?.steps?.length ?? 0) === 0
    && (plan.integrations?.length ?? 0) === 0
    && (plan.apiEndpoints?.length ?? 0) === 0
    && (plan.dashboardPages?.length ?? 0) === 0
    && (plan.envVars?.length ?? 0) === 0
    && !plan.dataSchema
  );
}

interface CoPilotLayoutProps {
  existingAgent: SavedAgent | null;
  builderState: BuilderState;
  disableBuilderAutosave?: boolean;
  isCompleting?: boolean;
  onBuilderStateChange: (partial: Partial<BuilderState>) => void;
  onComplete: () => void | Promise<boolean>;
  onCancel: () => void;
  /** The sandbox for this agent — either its forge sandbox or the shared architect. */
  activeSandbox?: ArchitectSandboxInfo | null;
}

export function CoPilotLayout({
  existingAgent,
  builderState,
  disableBuilderAutosave = false,
  isCompleting = false,
  onBuilderStateChange,
  onComplete,
  onCancel,
  activeSandbox,
}: CoPilotLayoutProps) {
  const coPilotStore = useCoPilotStore();
  const {
    name,
    description,
    selectedSkillIds,
    skillAvailability,
    skillGraph,
    builtSkillIds,
    skillGenerationStatus,
    agentRules,
    workflow,
    improvements,
    runtimeInputs,
    connectedTools,
    triggers,
    discoveryStatus,
    discoveryAnswers,
    discoveryDocuments,
    architecturePlan,
    setPhase,
    setRuntimeInputs,
    updateFields,
    setSkillGraph,
    clearSkillGraph,
    setSkillGeneration,
    setSkillAvailability,
    setDiscoveryQuestions,
    setDiscoveryDocuments,
    setDiscoveryStatus,
    skipDiscovery,
    setDevStage,
    setThinkStatus,
    setUserTriggeredThink,
    setPlanStatus,
    setBuildStatus,
    setUserTriggeredBuild,
    pushBuildActivity,
    setBuildProgress,
    setBuildReport,
  } = coPilotStore;
  const [skillRegistry, setSkillRegistry] = useState<SkillRegistryEntry[]>([]);
  const lastGeneratedSignatureRef = useRef<string | null>(null);
  const latestPurposeSignatureRef = useRef<string>("");
  // Track whether the chat already provided a skill graph (via SKILL_GRAPH_READY)
  // so the generation effect can skip redundant calls without depending on skillGraph directly.
  const chatProvidedSkillGraphRef = useRef(false);
  const purposeReady = hasPurposeMetadata(name, description);
  const unresolvedSelectedSkills = useMemo(
    () => getSelectedUnresolvedSkillIds(selectedSkillIds, skillAvailability),
    [selectedSkillIds, skillAvailability],
  );
  const deploySummary = useMemo(
    () => buildDeployConfigSummary({
      runtimeInputs,
      toolConnections: connectedTools,
      triggers,
    }),
    [connectedTools, runtimeInputs, triggers],
  );
  const deployReadiness = useMemo(
    () => evaluateCoPilotDeployReadiness({
      purposeReady,
      skillGenerationStatus,
      skillGraphCount: skillGraph?.length ?? 0,
      selectedSkillIds,
      unresolvedSelectedSkills,
      missingRequiredRuntimeInputKeys: runtimeInputs
        .filter((input) => input.required && !isRuntimeInputFilled(input))
        .map((input) => input.key),
      deploySummary,
    }),
    [
      deploySummary,
      purposeReady,
      runtimeInputs,
      selectedSkillIds,
      skillGenerationStatus,
      skillGraph,
      unresolvedSelectedSkills,
    ],
  );
  const canDeploy = deployReadiness.canDeploy;

  // In copilot mode, "ready for review" advances the wizard instead of switching views
  const handleReadyForReview = useCallback(() => {
    setPhase("skills");
  }, [setPhase]);

  useEffect(() => {
    let cancelled = false;

    void fetchSkillRegistry()
      .then((entries) => {
        if (!cancelled) {
          setSkillRegistry(entries);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSkillRegistry([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Workspace reconciliation removed — new agents must always go through the
  // full Think → Plan → Build flow. Stale workspace files from previous
  // attempts or container reuse should not short-circuit the build process.

  useEffect(() => {
    onBuilderStateChange({
      name,
      description,
    });
  }, [description, name, onBuilderStateChange]);

  useEffect(() => {
    if (!skillGraph || skillGraph.length === 0) {
      setSkillAvailability([]);
      return;
    }

    // When the lifecycle has progressed past build (review/test/ship/reflect),
    // all skills in the graph should be considered built — even if builtSkillIds
    // was never populated (e.g. workspace reconciliation, session restore).
    const POST_BUILD_STAGES = new Set(["review", "test", "ship", "reflect"]);
    const effectiveBuiltIds = POST_BUILD_STAGES.has(coPilotStore.devStage)
      ? skillGraph.map((n) => n.skill_id)
      : builtSkillIds;

    setSkillAvailability(
      resolveSkillAvailability(skillGraph, skillRegistry, effectiveBuiltIds),
    );
  }, [builtSkillIds, coPilotStore.devStage, setSkillAvailability, skillGraph, skillRegistry]);

  useEffect(() => {
    let mergedRuntimeInputs = mergeRuntimeInputDefinitions({
      existing: runtimeInputs,
      skillGraph,
      agentRules,
    });
    // Enrich with metadata from the architecture plan (labels, defaults, types, groups)
    if (architecturePlan?.envVars) {
      mergedRuntimeInputs = enrichRuntimeInputsFromPlan(mergedRuntimeInputs, architecturePlan.envVars);
    }
    const currentSignature = JSON.stringify(runtimeInputs);
    const mergedSignature = JSON.stringify(mergedRuntimeInputs);
    if (currentSignature !== mergedSignature) {
      setRuntimeInputs(mergedRuntimeInputs);
    }
  }, [agentRules, architecturePlan, runtimeInputs, setRuntimeInputs, skillGraph]);

  // AI auto-population for ai_inferred variables
  const inferAttemptedRef = useRef(false);
  useEffect(() => {
    if (inferAttemptedRef.current || !architecturePlan || runtimeInputs.length === 0) return;

    const inferrable = runtimeInputs.filter(
      (input) => (input.populationStrategy ?? "user_required") === "ai_inferred" && !input.value?.trim(),
    );
    if (inferrable.length === 0) return;

    inferAttemptedRef.current = true;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    fetch(`${apiBase}/api/infer-inputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        agentName: name,
        agentDescription: description,
        variables: inferrable.map((v) => ({
          key: v.key,
          label: v.label,
          description: v.description,
          example: v.example,
          options: v.options,
        })),
      }),
    })
      .then((r) => r.json())
      .then((data: { values: Record<string, string> }) => {
        if (data.values && Object.keys(data.values).length > 0) {
          const updated = runtimeInputs.map((input) =>
            data.values[input.key] && !input.value?.trim()
              ? { ...input, value: data.values[input.key] }
              : input,
          );
          setRuntimeInputs(updated);
        }
      })
      .catch(() => {});
  }, [architecturePlan, runtimeInputs, name, description, setRuntimeInputs]);

  // Keep the ref in sync so the generation effect can check it without depending on skillGraph
  useEffect(() => {
    chatProvidedSkillGraphRef.current = (skillGraph?.length ?? 0) > 0 && skillGenerationStatus === "ready";
  }, [skillGraph, skillGenerationStatus]);

  // ── Step 1: When purpose is ready, trigger discovery questions ──────────
  useEffect(() => {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const signature = `${trimmedName}\n${trimmedDescription}`;
    latestPurposeSignatureRef.current = signature;

    if (!hasPurposeMetadata(trimmedName, trimmedDescription)) {
      lastGeneratedSignatureRef.current = null;
      setPhase("purpose");
      clearSkillGraph();
      onBuilderStateChange({
        name: trimmedName,
        description: trimmedDescription,
        skillGraph: null,
        workflow: null,
        systemName: trimmedName || null,
        agentRules: [],
        improvements: [],
      });
      return;
    }

    if (lastGeneratedSignatureRef.current === signature) {
      return;
    }

    // The Think stage PRD/TRD generation happens through the chat message.
    // When the user sends their description, the BuilderAgent uses THINK_SYSTEM_INSTRUCTION
    // which tells the architect to ONLY produce PRD + TRD. The response arrives
    // as a "discovery_documents" custom event that populates the copilot store.
    //
    // We just set the stage — no API call here.
    lastGeneratedSignatureRef.current = signature;
    // Only regress devStage to "think" if we haven't already progressed past it.
    // The architecture_plan_ready consumer sets devStage to "plan", and
    // WIZARD_UPDATE_FIELDS (identity event) can update name/description which
    // re-fires this effect — we must not overwrite a later stage.
    const currentDevStage = useCoPilotStore.getState().devStage;
    if (currentDevStage === "think" || currentDevStage === undefined) {
      setDevStage("think");
    }
    // Only set to "generating" if the Think stage hasn't already completed.
    // The identity event (WIZARD_UPDATE_FIELDS) can update name/description
    // AFTER discovery_documents has already set thinkStatus to "ready".
    // Without this guard, the effect re-fires and resets the status.
    const currentThinkStatus = useCoPilotStore.getState().thinkStatus;
    if (
      currentThinkStatus !== "ready"
      && currentThinkStatus !== "approved"
      && currentThinkStatus !== "generating"
      && currentThinkStatus !== "done"
    ) {
      setThinkStatus("generating");
      setUserTriggeredThink(true);
      setDiscoveryStatus("loading");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description]);

  // ── Reveal trigger lives at page-level ───────────────────────────────────
  // The reveal screen is rendered by page.tsx BEFORE CoPilotLayout mounts,
  // so the reveal architect call is authored there. A duplicate trigger here
  // (kept historically) races with the page-level fire in the recovery flow
  // and produces double architect calls — see the gateway logs showing two
  // WS connections opened milliseconds apart. Single source of truth.

  // ── Workspace rehydration: restore Think/Plan state from workspace files ──
  const rehydratedSandboxRef = useRef<string | null>(null);
  useEffect(() => {
    const sandboxId = activeSandbox?.sandbox_id;
    if (!sandboxId || rehydratedSandboxRef.current === sandboxId) return;
    rehydratedSandboxRef.current = sandboxId;
    let cancelled = false;

    // Non-blocking: try reading workspace files to restore state after page refresh
    Promise.all([
      import("@/lib/openclaw/workspace-writer"),
      import("@/lib/openclaw/plan-formatter"),
    ]).then(([{ readWorkspaceFile }, { normalizePlan }]) => {
      const parseDiscoveryDoc = (md: string) => {
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

      Promise.all([
        readWorkspaceFile(sandboxId, ".openclaw/discovery/PRD.md"),
        readWorkspaceFile(sandboxId, ".openclaw/discovery/TRD.md"),
        readWorkspaceFile(sandboxId, ".openclaw/discovery/research-brief.md"),
        readWorkspaceFile(sandboxId, ".openclaw/plan/architecture.json"),
      ]).then(([prd, trd, researchBrief, planJson]) => {
        if (
          cancelled
          || !shouldApplyWorkspaceRehydration({
            requestedSandboxId: sandboxId,
            currentSandboxId: useCoPilotStore.getState().agentSandboxId,
          })
        ) {
          return;
        }

        // Rehydrate Think paths if docs exist
        if (researchBrief) coPilotStore.setResearchBriefPath(".openclaw/discovery/research-brief.md");
        if (prd) coPilotStore.setPrdPath(".openclaw/discovery/PRD.md");
        if (trd) coPilotStore.setTrdPath(".openclaw/discovery/TRD.md");

        // If all Think docs exist, prefer the workspace as source of truth.
        // A dropped WebSocket can leave the UI stuck at "generating" even after
        // the architect wrote PRD/TRD successfully.
        if (prd && trd && !coPilotStore.discoveryDocuments) {
          coPilotStore.setDiscoveryDocuments({
            prd: parseDiscoveryDoc(prd),
            trd: parseDiscoveryDoc(trd),
          });
        }
        const canRecoverThink = coPilotStore.thinkStatus !== "approved" && coPilotStore.thinkStatus !== "done";
        if (prd && trd && canRecoverThink) {
          coPilotStore.setThinkStep("complete");
          coPilotStore.setThinkStatus("ready");
          coPilotStore.setUserTriggeredThink(false);
        }

        // Rehydrate Plan if architecture.json exists.
        // The on-disk shape matches ArchitecturePlan loosely — normalize so
        // missing arrays/objects get filled with [] / null and the UI can
        // render without defensive fallbacks.
        const hasEmptyPlan = isEmptyArchitecturePlan(coPilotStore.architecturePlan);
        const shouldRecoverPlan = !coPilotStore.architecturePlan
          || hasEmptyPlan
          || coPilotStore.planStatus === "failed"
          || !hasUsableArchitecturePlan(coPilotStore.architecturePlan);
        if (planJson && shouldRecoverPlan) {
          try {
            const plan = normalizePlan(JSON.parse(planJson) as Record<string, unknown>);
            coPilotStore.setArchitecturePlan(plan);
            // If the plan was successfully parsed from disk, trust the
            // workspace over stale client state. Reloading during generation
            // intentionally sanitizes "generating" to "failed", but the
            // architect may still have written architecture.json successfully.
            if (coPilotStore.planStatus !== "approved" && coPilotStore.planStatus !== "done") {
              coPilotStore.setPlanStatus("ready");
            }
            // If we're still on Think but have a plan, advance to Plan stage
            if (coPilotStore.devStage === "think" && prd && trd) {
              coPilotStore.setThinkStatus("approved");
              coPilotStore.setDevStage("plan");
            }
          } catch {
            // Ignore parse errors — fresh state is fine
          }
        }
      }).catch(() => {
        // Workspace read failures are non-fatal — fresh state is fine
      });
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSandbox?.sandbox_id]);

  // Set agentSandboxId early so workspace reads work during Think/Plan (not just Build)
  useEffect(() => {
    if (activeSandbox?.sandbox_id && coPilotStore.agentSandboxId !== activeSandbox.sandbox_id) {
      coPilotStore.setAgentSandboxId(activeSandbox.sandbox_id);
    }
  }, [activeSandbox?.sandbox_id, coPilotStore.agentSandboxId, coPilotStore]);

  const confirmForgeStage = useCallback(async (stage: AgentDevStage): Promise<boolean> => {
    const agentId = existingAgent?.id;
    if (!agentId) {
      useCoPilotStore.setState({
        lifecycleAdvanceStatus: "failed",
        lifecycleAdvanceError: "No agent ID is available for lifecycle advancement.",
      });
      return false;
    }
    useCoPilotStore.setState({ lifecycleAdvanceStatus: "saving", lifecycleAdvanceError: null });
    try {
      const { fetchBackendWithAuth } = await import("@/lib/auth/backend-fetch");
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetchBackendWithAuth(`${apiBase}/api/agents/${agentId}/forge/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const payload = await res.json().catch(() => ({})) as { forge_stage?: string; detail?: string; message?: string };
      if (!res.ok) {
        throw new Error(payload.detail ?? payload.message ?? `Stage update failed (${res.status})`);
      }
      if (payload.forge_stage !== stage) {
        throw new Error("Stage update returned an unexpected lifecycle stage.");
      }
      useCoPilotStore.setState({ lifecycleAdvanceStatus: "idle", lifecycleAdvanceError: null });
      return true;
    } catch (error) {
      useCoPilotStore.setState({
        lifecycleAdvanceStatus: "failed",
        lifecycleAdvanceError: error instanceof Error ? error.message : "Stage update rejected.",
      });
      return false;
    }
  }, [existingAgent?.id]);

  // ── Step 2: When discovery is complete/skipped, trigger skill generation ──
  const buildRetryCountRef = useRef(0);
  const MAX_BUILD_RETRIES = 2;

  const triggerSkillGeneration = useCallback(
    (
      trimmedName: string,
      trimmedDescription: string,
      context?: Record<string, string | string[]>,
      docs?: import("@/lib/openclaw/types").DiscoveryDocuments,
      plan?: import("@/lib/openclaw/types").ArchitecturePlan | null,
    ) => {
      const signature = `${trimmedName}\n${trimmedDescription}`;
      setSkillGeneration("loading");

      void generateSkillsFromArchitect(
        trimmedName,
        trimmedDescription,
        {
          onStatus: (message) => {
            pushBuildActivity({ type: "tool", label: message });
          },
          onCustomEvent: (eventName, data) => {
            const payload = data as Record<string, unknown>;
            if (eventName === "skill_created") {
              const skillId = (payload.skillId as string) || "";
              pushBuildActivity({ type: "skill", label: skillId.replace(/[-_]/g, " ") });
            } else if (eventName === "file_written") {
              const path = (payload.path as string) || "unknown file";
              pushBuildActivity({ type: "file", label: path.split("/").slice(-2).join("/") });
            } else if (eventName === "build_progress") {
              setBuildProgress(payload as { completed: number; total: number | null; currentSkill: string | null });
            }
          },
        },
        context,
        docs,
        plan ?? undefined,
        activeSandbox?.sandbox_id,
      )
        .then((generated) => {
          if (latestPurposeSignatureRef.current !== signature) return;

          // Skills are written directly by the architect via tool execution
          // through the WebSocket gateway. No scaffold endpoint needed —
          // file_written and skill_created events update the UI in real-time.

          buildRetryCountRef.current = 0;
          lastGeneratedSignatureRef.current = signature;
          // Wire the agent's sandbox ID to the eval system so the Test stage
          // can run evaluations against the real agent container.
          if (activeSandbox?.sandbox_id) {
            coPilotStore.setAgentSandboxId(activeSandbox.sandbox_id);
          }
          setSkillGraph(generated.nodes, generated.workflow, generated.agentRules);
          updateFields({ systemName: generated.systemName ?? trimmedName });
          onBuilderStateChange({
            name: trimmedName,
            description: trimmedDescription,
            skillGraph: generated.nodes,
            workflow: generated.workflow,
            systemName: generated.systemName ?? trimmedName,
            agentRules: generated.agentRules,
          });
          // Publish built skills back to the registry (non-blocking).
          // This grows the ecosystem — future agents benefit from reuse.
          for (const node of generated.nodes) {
            if (node.skill_md) {
              fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/skills`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  skill_id: node.skill_id,
                  name: node.name,
                  description: node.description || node.name,
                  tags: [trimmedName.toLowerCase().replace(/\s+/g, "-"), node.source || "custom"],
                  skill_md: node.skill_md,
                }),
              }).catch(() => {}); // Non-blocking — failure doesn't affect the build
            }
          }

          // Build stage complete — generate skill tests then advance
          setBuildStatus("done");

          // Auto-generate skill smoke tests from the built skill graph
          if (generated.nodes.length > 0) {
            const skillTests = generateSkillTests(generated.nodes, generated.systemName ?? trimmedName);
            const evalTasks = skillTestsToEvalTasks(skillTests);
            if (evalTasks.length > 0) {
              coPilotStore.setEvalTasks(evalTasks);
            }
          }

          void confirmForgeStage("review").then((confirmed) => {
            if (confirmed) setDevStage("review");
          });
        })
        .catch((error) => {
          if (latestPurposeSignatureRef.current !== signature) return;

          // Auto-retry up to MAX_BUILD_RETRIES times before showing failure
          if (buildRetryCountRef.current < MAX_BUILD_RETRIES) {
            buildRetryCountRef.current += 1;
            console.warn(
              `[Build] Attempt ${buildRetryCountRef.current} failed, retrying... (${error instanceof Error ? error.message : "unknown error"})`,
            );
            // Small delay before retry to avoid hammering the sandbox
            setTimeout(() => {
              setSkillGeneration("loading");
              setBuildStatus("building");
              triggerSkillGeneration(trimmedName, trimmedDescription, context, docs, plan);
            }, 2000);
            return;
          }

          // Exhausted retries — show failure to user
          buildRetryCountRef.current = 0;
          setSkillGeneration(
            "error",
            error instanceof Error ? error.message : "Skill generation failed.",
          );
          setBuildStatus("failed");
        });
    },
    [activeSandbox?.sandbox_id, confirmForgeStage, onBuilderStateChange, pushBuildActivity, setBuildProgress, setBuildStatus, setDevStage, setSkillGeneration, setSkillGraph, updateFields],
  );

  // Called when user completes discovery (Think stage) or clicks "Skip"
  const handleDiscoveryComplete = useCallback(async () => {
    const sandboxId = activeSandbox?.sandbox_id;
    const docs = coPilotStore.discoveryDocuments;

    if (!docs?.prd || !docs?.trd) {
      console.warn("[CoPilot] Refusing to start Plan without approved PRD/TRD documents.");
      setThinkStatus("failed");
      useCoPilotStore.setState({
        lifecycleAdvanceStatus: "failed",
        lifecycleAdvanceError: "Generate and approve PRD/TRD documents before planning.",
      });
      return;
    }

    if (!sandboxId) {
      console.warn("[CoPilot] Refusing to start Plan without a forge sandbox.");
      setThinkStatus("failed");
      useCoPilotStore.setState({
        lifecycleAdvanceStatus: "failed",
        lifecycleAdvanceError: "Agent workspace is not ready yet.",
      });
      return;
    }

    // Persist PRD/TRD to workspace before advancing forge_stage. Otherwise a
    // stale in-memory document can move the backend to Plan with no artifacts.
    try {
      const [{ formatPRD, formatTRD }, { writeWorkspaceFiles }] = await Promise.all([
        import("@/lib/openclaw/plan-formatter"),
        import("@/lib/openclaw/workspace-writer"),
      ]);
      await writeWorkspaceFiles(sandboxId, [
        { path: ".openclaw/discovery/PRD.md", content: formatPRD(docs.prd) },
        { path: ".openclaw/discovery/TRD.md", content: formatTRD(docs.trd) },
      ]);
      coPilotStore.setPrdPath(".openclaw/discovery/PRD.md");
      coPilotStore.setTrdPath(".openclaw/discovery/TRD.md");
    } catch (err) {
      console.warn("[CoPilot] Failed to persist discovery docs:", err);
      setThinkStatus("failed");
      useCoPilotStore.setState({
        lifecycleAdvanceStatus: "failed",
        lifecycleAdvanceError: "Could not save PRD/TRD into the agent workspace.",
      });
      return;
    }

    setThinkStatus("approved");

    const stageConfirmed = await confirmForgeStage("plan");
    if (!stageConfirmed) return;

    setDevStage("plan");
    setPlanStatus("generating");

    // Dispatch plan generation directly via the bridge API.
    // The TabChat useEffect approach has timing issues with Zustand prop subscriptions,
    // so we call the architect directly here and leave userTriggeredPlan false.
    const forgeSandboxId = activeSandbox?.sandbox_id;
    if (!forgeSandboxId) {
      console.warn("[Plan] No forge sandbox available — cannot generate plan. The agent's container may still be provisioning.");
      setPlanStatus("failed");
      return;
    }
    if (forgeSandboxId) {
      const agentId = existingAgent?.id;
      Promise.all([
        import("@/lib/openclaw/api"),
        import("@/lib/openclaw/ag-ui/builder-agent"),
      ]).then(([{ sendToArchitectStreaming }, { PLAN_SYSTEM_INSTRUCTION }]) => {
        let planPrompt = "Generate the architecture plan for this agent.";
        if (docs) {
          const prdSummary = docs.prd.sections.map((s: { heading: string; content: string }) => `### ${s.heading}\n${s.content}`).join("\n\n");
          const trdSummary = docs.trd.sections.map((s: { heading: string; content: string }) => `### ${s.heading}\n${s.content}`).join("\n\n");
          planPrompt = `The user has approved the following requirements. Generate a structured architecture plan.\n\n## PRD: ${docs.prd.title}\n${prdSummary}\n\n## TRD: ${docs.trd.title}\n${trdSummary}`;
        }
        const planMessage = `${PLAN_SYSTEM_INSTRUCTION}\n\n${planPrompt}`;
        sendToArchitectStreaming(
          `copilot-plan:${forgeSandboxId}`,
          planMessage,
          {
            onDelta: () => {},
            onStatus: () => {},
          },
          { mode: "copilot", forgeSandboxId, agentId: agentId ?? undefined },
        ).then(async () => {
          // Read architecture.json from workspace
          try {
            const { readWorkspaceFile } = await import("@/lib/openclaw/workspace-writer");
            const planJson = await readWorkspaceFile(forgeSandboxId, ".openclaw/plan/architecture.json");
            if (planJson) {
              const { normalizePlan } = await import("@/lib/openclaw/plan-formatter");
              const plan = normalizePlan(JSON.parse(planJson));
              coPilotStore.setArchitecturePlan(plan);
              coPilotStore.setPlanStatus("ready");
            } else if (coPilotStore.planStatus !== "ready") {
              coPilotStore.setPlanStatus("failed");
            }
          } catch (err) {
            console.warn("[Plan] Failed to read plan from workspace:", err);
            // Don't overwrite "ready" if the plan_complete fallback already set it
            if (coPilotStore.planStatus !== "ready") {
              coPilotStore.setPlanStatus("failed");
            }
          }
        }).catch((err) => {
          console.warn("[Plan] Architect streaming failed:", err);
          // Don't overwrite "ready" if the plan_complete fallback already set it
          if (coPilotStore.planStatus !== "ready") {
            coPilotStore.setPlanStatus("failed");
          }
        });
      });
    }
  }, [confirmForgeStage, setThinkStatus, setDevStage, setPlanStatus, activeSandbox?.sandbox_id, coPilotStore.discoveryDocuments, coPilotStore]);

  // Called when user approves Plan stage — unlocks Prototype review before Build.
  const handlePlanApproved = useCallback(async () => {
    const agentId = existingAgent?.id;
    if (!agentId) {
      setSkillGeneration("error", "No agent ID — cannot advance to Prototype.");
      return;
    }
    const planForApproval = useCoPilotStore.getState().architecturePlan ?? architecturePlan;
    if (!hasUsableArchitecturePlan(planForApproval)) {
      setSkillGeneration("error", "A complete architecture plan is required before Prototype. Ask the architect to regenerate the Plan with skills and workflow.");
      return;
    }
    if (!hasRequiredDashboardPrototype(planForApproval)) {
      setSkillGeneration("error", "Dashboard prototype is required before Prototype. Ask the architect to revise the Plan with dashboard workflows, actions, and acceptance checks.");
      return;
    }

    setPlanStatus("approved");
    const stageConfirmed = await confirmForgeStage("prototype");
    if (!stageConfirmed) return;

    setDevStage("prototype");
  }, [architecturePlan, existingAgent, confirmForgeStage, setPlanStatus, setDevStage, setSkillGeneration]);

  // Called when user approves Prototype stage — triggers v4 orchestrator build.
  const handlePrototypeApproved = useCallback(async () => {
    const agentId = existingAgent?.id;
    if (!agentId) {
      setSkillGeneration("error", "No agent ID — cannot build.");
      return;
    }
    const planForApproval = useCoPilotStore.getState().architecturePlan ?? architecturePlan;
    if (!hasUsableArchitecturePlan(planForApproval)) {
      setSkillGeneration("error", "A complete architecture plan is required before Build. Ask the architect to regenerate the Plan with skills and workflow.");
      return;
    }
    if (!hasRequiredDashboardPrototype(planForApproval)) {
      setSkillGeneration("error", "Dashboard prototype is required before Build. Ask the architect to revise the Plan with dashboard workflows, actions, and acceptance checks.");
      return;
    }

    const stageConfirmed = await confirmForgeStage("build");
    if (!stageConfirmed) return;

    setDevStage("build");
    setBuildStatus("building");
    setUserTriggeredBuild(true);
    setSkillGeneration("loading");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    pushBuildActivity({ type: "task", label: "Starting build pipeline (server-side)..." });

    try {
      // Start the build on the backend
      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const { fetchBackendWithAuth } = await import("@/lib/auth/backend-fetch");
      const startRes = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parallelBuild: coPilotStore.parallelBuildEnabled }),
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({ detail: "Build start failed" }));
        throw new Error((err as { detail?: string }).detail ?? "Build start failed");
      }

      const { stream_id } = (await startRes.json()) as { stream_id: string };
      buildStreamIdRef.current = stream_id;

      // Consume the SSE stream for build progress
      const streamRes = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/build/stream/${stream_id}`);
      if (!streamRes.ok || !streamRes.body) throw new Error("Failed to open build stream");

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let buildDone = false;
      let terminalEventSeen = false;

      while (!buildDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const block of events) {
          if (!block.trim()) continue;
          let eventName = "";
          const eventDataLines: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            if (line.startsWith("data:")) eventDataLines.push(line.slice(5).trimStart());
          }
          const eventData = eventDataLines.join("\n");
          if (!eventData) continue;

          if (eventName === "done") {
            buildDone = true;
            if (!terminalEventSeen) {
              const message = "Build stream ended before completion.";
              pushBuildActivity({ type: "tool", label: message });
              setSkillGeneration("error", message);
              setBuildStatus("failed");
            }
            continue;
          }

          try {
            const evt = JSON.parse(eventData) as Record<string, unknown>;
            const type = evt.type as string;

            switch (type) {
              case "task_start":
                pushBuildActivity({ type: "task", label: `Starting ${evt.specialist}...` });
                break;
              case "task_complete":
                pushBuildActivity({ type: "task", label: `${evt.specialist} complete (${(evt.files as string[])?.length ?? 0} files)` });
                break;
              case "task_failed":
                pushBuildActivity({ type: "task", label: `${evt.specialist} failed: ${String(evt.error ?? "").slice(0, 80)}` });
                break;
              case "file_written":
                pushBuildActivity({ type: "file", label: String(evt.path ?? "").split("/").slice(-2).join("/") });
                break;
              case "progress":
                setBuildProgress({ completed: evt.completed as number, total: evt.total as number, currentSkill: null });
                break;
              case "status":
                pushBuildActivity({ type: "tool", label: String(evt.message ?? "") });
                break;
              case "setup_progress":
                pushBuildActivity({ type: "tool", label: `Setup: ${String(evt.message ?? "")}` });
                break;
              case "build_report": {
                const report = evt.report as BuildReport;
                setBuildReport(report);
                if (report.readiness === "blocked") {
                  setBuildStatus("failed");
                  pushBuildActivity({
                    type: "tool",
                    label: report.blockers?.[0] ?? "Build report blocked progression.",
                  });
                } else {
                  setBuildStatus("done");
                  pushBuildActivity({
                    type: "tool",
                    label: `Build report ready: ${report.readiness ?? "ready"}`,
                  });
                }
                break;
              }
              case "build_complete": {
                buildDone = true;
                terminalEventSeen = true;
                const manifest = evt.manifest as { tasks: Array<{ specialist: string; status: string; files: string[] }> };
                coPilotStore.setBuildManifest(evt.manifest as import("@/lib/openclaw/types").BuildManifest);
                coPilotStore.setAgentSandboxId(activeSandbox?.sandbox_id ?? null);
                const currentReport = useCoPilotStore.getState().buildReport;

                // Extract skill graph from the latest plan for Review stage. The
                // stream callback can outlive the render that created it, so read
                // the store first and fall back to the captured value.
                let planForReview = useCoPilotStore.getState().architecturePlan ?? architecturePlan;
                if (!planForReview && activeSandbox?.sandbox_id) {
                  try {
                    const [{ readWorkspaceFile }, { normalizePlan }] = await Promise.all([
                      import("@/lib/openclaw/workspace-writer"),
                      import("@/lib/openclaw/plan-formatter"),
                    ]);
                    const planJson = await readWorkspaceFile(activeSandbox.sandbox_id, ".openclaw/plan/architecture.json");
                    if (planJson) {
                      planForReview = normalizePlan(JSON.parse(planJson) as Record<string, unknown>);
                      coPilotStore.setArchitecturePlan(planForReview);
                    }
                  } catch {
                    // The Review screen will show the empty state if no plan can be recovered.
                  }
                }

                if (planForReview) {
                  const reviewState = buildReviewStateFromArchitecturePlan({
                    plan: planForReview,
                    manifest,
                    agentName: trimmedName,
                  });
                  setSkillGraph(reviewState.nodes, reviewState.workflow, []);
                  for (const skillId of reviewState.builtSkillIds) {
                    coPilotStore.markSkillBuilt(skillId);
                  }
                  if (reviewState.nodes.length > 0) {
                    setSkillGeneration("ready");
                  }
                  onBuilderStateChange({
                    name: trimmedName,
                    description: trimmedDescription,
                    skillGraph: reviewState.nodes,
                    workflow: reviewState.workflow,
                    systemName: trimmedName,
                  });
                }

                const allDone = manifest?.tasks?.every((t) => t.status === "done") ?? false;
                if (currentReport?.readiness === "blocked") {
                  setBuildStatus("failed");
                  pushBuildActivity({ type: "tool", label: "Build complete, but readiness is blocked. Check the build report." });
                } else if (allDone) {
                  setBuildStatus("done");
                  if (await confirmForgeStage("review")) {
                    setDevStage("review");
                  }
                } else {
                  setBuildStatus("done");
                  if (await confirmForgeStage("review")) {
                    setDevStage("review");
                  }
                  pushBuildActivity({ type: "tool", label: "Build complete — some tasks had issues. Check Review." });
                }
                break;
              }
              case "error":
                terminalEventSeen = true;
                buildDone = true;
                {
                  const message = String(evt.message ?? evt.error ?? "Build failed.");
                  pushBuildActivity({ type: "tool", label: `Error: ${message}` });
                  setSkillGeneration("error", message);
                  setBuildStatus("failed");
                }
                break;
            }
          } catch { /* skip unparseable SSE */ }
        }
      }

      if (!terminalEventSeen) {
        const message = "Build stream ended before completion.";
        pushBuildActivity({ type: "tool", label: message });
        setSkillGeneration("error", message);
        setBuildStatus("failed");
      }

      try { await reader.cancel(); } catch { /* ignore */ }
    } catch (error) {
      setSkillGeneration("error", error instanceof Error ? error.message : "Build failed.");
      setBuildStatus("failed");
    }
  }, [name, description, architecturePlan, existingAgent, activeSandbox, coPilotStore, confirmForgeStage, setDevStage, setBuildStatus, setUserTriggeredBuild, pushBuildActivity, setBuildProgress, setSkillGeneration, setSkillGraph, setBuildReport, onBuilderStateChange]);

  // Called when user retries a failed build — re-triggers the prototype-approved build flow.
  const handleRetryBuild = useCallback(() => {
    buildRetryCountRef.current = 0;
    handlePrototypeApproved();
  }, [handlePrototypeApproved]);

  // Fix 5: Build cancellation
  const buildStreamIdRef = useRef<string | null>(null);
  const handleCancelBuild = useCallback(async () => {
    const agentId = existingAgent?.id;
    const streamId = buildStreamIdRef.current;
    if (!agentId || !streamId) return;

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const { fetchBackendWithAuth } = await import("@/lib/auth/backend-fetch");
      await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/build/cancel/${streamId}`, {
        method: "POST",
      });
      pushBuildActivity({ type: "tool", label: "Build cancelled by user." });
      setBuildStatus("failed");
    } catch {
      pushBuildActivity({ type: "tool", label: "Failed to cancel build." });
    }
  }, [existingAgent?.id, pushBuildActivity, setBuildStatus]);

  // Called when user clicks Done on reflect stage
  const handleDone = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = "/agents";
    }
  }, []);

  // Watch for discovery status changes to trigger generation
  useEffect(() => {
    if (discoveryStatus === "skipped") {
      handleDiscoveryComplete();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryStatus]);

  // Synthetic agent for TabChat in builder mode
  const syntheticAgent: SavedAgent = useMemo(() => ({
    id: existingAgent?.id ?? `new-${uuidv4()}`,
    name: name || builderState.name || builderState.systemName || existingAgent?.name || "New Agent",
    avatar: existingAgent?.avatar ?? "🤖",
    description: description || builderState.description || existingAgent?.description || "",
    skills: existingAgent?.skills ?? [],
    triggerLabel: existingAgent?.triggerLabel ?? "",
    agentRules: agentRules.length > 0 ? agentRules : (existingAgent?.agentRules ?? []),
    sandboxIds: existingAgent?.sandboxIds ?? [],
    skillGraph: skillGraph ?? existingAgent?.skillGraph ?? undefined,
    workflow: workflow ?? existingAgent?.workflow ?? null,
    improvements: improvements.length > 0 ? improvements : existingAgent?.improvements,
    status: existingAgent?.status ?? "draft",
    createdAt: existingAgent?.createdAt ?? new Date().toISOString(),
  }), [
    builderState.description,
    builderState.name,
    builderState.systemName,
    description,
    existingAgent,
    name,
    agentRules,
    skillGraph,
    workflow,
    improvements,
  ]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Footer: Deploy ────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-2.5 border-b border-[var(--border-default)] bg-[var(--card-color)]">
        <div className="flex items-center gap-2">
          <span className="text-lg">{syntheticAgent.avatar}</span>
          <div>
            <h2 className="text-sm font-satoshi-bold text-[var(--text-primary)]">
              {name || builderState.name || builderState.systemName || "New Agent"}
            </h2>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] text-[var(--text-tertiary)]">Co-Pilot Mode</p>
              {builderState.draftSaveStatus === "saving" && (
                <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)]">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Saving…
                </span>
              )}
              {builderState.draftSaveStatus === "saved" && (
                <span className="flex items-center gap-0.5 text-[10px] text-[var(--success)]">
                  <Check className="h-2.5 w-2.5" />
                  Draft saved
                </span>
              )}
              {builderState.draftSaveStatus === "error" && (
                <span className="flex items-center gap-0.5 text-[10px] text-[var(--error)]">
                  <AlertCircle className="h-2.5 w-2.5" />
                  Draft save failed
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-satoshi-medium text-[var(--text-secondary)] border border-[var(--border-stroke)] rounded-lg hover:bg-[var(--color-light)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onComplete}
            disabled={!canDeploy || isCompleting}
            title={!canDeploy ? deployReadiness.blockerMessage ?? undefined : undefined}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 disabled:opacity-30 transition-colors"
          >
            <Rocket className="h-3 w-3" />
            {isCompleting ? "Deploying…" : "Deploy Agent"}
          </button>
        </div>
      </div>

      {!canDeploy && (
        <div className="shrink-0 border-b border-[var(--border-default)] bg-[var(--background)] px-6 py-2">
          <p className="text-xs font-satoshi-medium text-[var(--text-tertiary)]">
            {deployReadiness.blockerMessage}
          </p>
        </div>
      )}

      {/* ── Unified builder workspace ─────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TabChat
          agent={syntheticAgent}
          activeSandbox={activeSandbox ?? null}
          selectedConvId={null}
          onConversationCreated={() => {}}
          mode="builder"
          disableBuilderAutosave={disableBuilderAutosave}
          builderState={builderState}
          onBuilderStateChange={onBuilderStateChange}
          onReadyForReview={handleReadyForReview}
          onBuilderComplete={onComplete}
          canBuilderComplete={canDeploy}
          isCompletingBuilder={isCompleting}
          showCoPilotConfig
          coPilotPhase={coPilotStore.phase}
          coPilotStore={coPilotStore}
          builderBridgeMode="copilot"
          onDiscoveryComplete={handleDiscoveryComplete}
          onPlanApproved={handlePlanApproved}
          onPrototypeApproved={handlePrototypeApproved}
          onRetryBuild={handleRetryBuild}
          onCancelBuild={handleCancelBuild}
          onDone={handleDone}
        />
      </div>
    </div>
  );
}
