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
import { isRuntimeInputFilled, mergeRuntimeInputDefinitions } from "@/lib/agents/runtime-inputs";
import { useCoPilotStore } from "@/lib/openclaw/copilot-state";
import {
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
    setPlanStatus,
    setBuildStatus,
    pushBuildActivity,
    setBuildProgress,
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

    setSkillAvailability(
      resolveSkillAvailability(skillGraph, skillRegistry, builtSkillIds),
    );
  }, [builtSkillIds, setSkillAvailability, skillGraph, skillRegistry]);

  useEffect(() => {
    const mergedRuntimeInputs = mergeRuntimeInputDefinitions({
      existing: runtimeInputs,
      skillGraph,
      agentRules,
    });
    const currentSignature = JSON.stringify(runtimeInputs);
    const mergedSignature = JSON.stringify(mergedRuntimeInputs);
    if (currentSignature !== mergedSignature) {
      setRuntimeInputs(mergedRuntimeInputs);
    }
  }, [agentRules, runtimeInputs, setRuntimeInputs, skillGraph]);

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
    if (currentThinkStatus !== "ready" && currentThinkStatus !== "approved") {
      setThinkStatus("generating");
      setDiscoveryStatus("loading");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description]);

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
          // Build stage complete — advance to review
          setBuildStatus("done");
          setDevStage("review");
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
    [activeSandbox?.sandbox_id, onBuilderStateChange, pushBuildActivity, setBuildProgress, setBuildStatus, setDevStage, setSkillGeneration, setSkillGraph, updateFields],
  );

  // Called when user completes discovery (Think stage) or clicks "Skip"
  const handleDiscoveryComplete = useCallback(() => {
    setThinkStatus("approved");
    setDevStage("plan");
    setPlanStatus("generating");
    // Plan stage will show a loading spinner until the architect returns
    // an architecture_plan response. The actual message is sent by TabChat
    // via the onPlanGenerationNeeded callback.
  }, [setThinkStatus, setDevStage, setPlanStatus]);

  // Called when user approves Plan stage — triggers actual build
  const handlePlanApproved = useCallback(() => {
    setPlanStatus("approved");
    setDevStage("build");
    setBuildStatus("building");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const context = discoveryStatus === "skipped" ? undefined : discoveryAnswers;
    const docs = discoveryDocuments ?? undefined;
    triggerSkillGeneration(trimmedName, trimmedDescription, context, docs, architecturePlan);
  }, [name, description, discoveryStatus, discoveryAnswers, discoveryDocuments, architecturePlan, triggerSkillGeneration, setPlanStatus, setDevStage, setBuildStatus]);

  // Called when user retries a failed build
  const handleRetryBuild = useCallback(() => {
    buildRetryCountRef.current = 0; // Reset auto-retry counter for manual retry
    setBuildStatus("building");
    setSkillGeneration("loading");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const context = discoveryStatus === "skipped" ? undefined : discoveryAnswers;
    const docs = discoveryDocuments ?? undefined;
    triggerSkillGeneration(trimmedName, trimmedDescription, context, docs, architecturePlan);
  }, [name, description, discoveryStatus, discoveryAnswers, discoveryDocuments, architecturePlan, triggerSkillGeneration, setBuildStatus, setSkillGeneration]);

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
          onRetryBuild={handleRetryBuild}
          onDone={handleDone}
        />
      </div>
    </div>
  );
}
