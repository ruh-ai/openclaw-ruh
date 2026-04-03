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
    setUserTriggeredThink,
    setPlanStatus,
    setUserTriggeredPlan,
    setBuildStatus,
    setUserTriggeredBuild,
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

  // ── Workspace rehydration: restore Think/Plan state from workspace files ──
  const rehydratedRef = useRef(false);
  useEffect(() => {
    const sandboxId = activeSandbox?.sandbox_id;
    if (!sandboxId || rehydratedRef.current) return;
    rehydratedRef.current = true;

    // Non-blocking: try reading workspace files to restore state after page refresh
    import("@/lib/openclaw/workspace-writer").then(({ readWorkspaceFile }) => {
      Promise.all([
        readWorkspaceFile(sandboxId, ".openclaw/discovery/PRD.md"),
        readWorkspaceFile(sandboxId, ".openclaw/discovery/TRD.md"),
        readWorkspaceFile(sandboxId, ".openclaw/discovery/research-brief.md"),
        readWorkspaceFile(sandboxId, ".openclaw/plan/architecture.json"),
      ]).then(([prd, trd, researchBrief, planJson]) => {
        // Rehydrate Think paths if docs exist
        if (researchBrief) coPilotStore.setResearchBriefPath(".openclaw/discovery/research-brief.md");
        if (prd) coPilotStore.setPrdPath(".openclaw/discovery/PRD.md");
        if (trd) coPilotStore.setTrdPath(".openclaw/discovery/TRD.md");

        // If all think docs exist and think hasn't progressed, mark as ready
        if (prd && trd && coPilotStore.thinkStatus === "idle") {
          coPilotStore.setThinkStep("complete");
          coPilotStore.setThinkStatus("ready");
        }

        // Rehydrate Plan if architecture.json exists
        if (planJson && !coPilotStore.architecturePlan) {
          try {
            const plan = JSON.parse(planJson);
            coPilotStore.setArchitecturePlan(plan);
          } catch {
            // Ignore parse errors
          }
        }
      }).catch(() => {
        // Workspace read failures are non-fatal — fresh state is fine
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSandbox?.sandbox_id]);

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

    // Persist PRD/TRD to workspace so they survive refresh and ship with the template
    const sandboxId = activeSandbox?.sandbox_id;
    const docs = coPilotStore.discoveryDocuments;
    if (sandboxId && docs) {
      import("@/lib/openclaw/plan-formatter").then(({ formatPRD, formatTRD }) =>
        import("@/lib/openclaw/workspace-writer").then(({ writeWorkspaceFiles }) =>
          writeWorkspaceFiles(sandboxId, [
            { path: ".openclaw/discovery/PRD.md", content: formatPRD(docs.prd) },
            { path: ".openclaw/discovery/TRD.md", content: formatTRD(docs.trd) },
          ]).catch((err) => console.warn("[CoPilot] Failed to persist discovery docs:", err)),
        ),
      );
    }

    setDevStage("plan");
    setPlanStatus("generating");
    setUserTriggeredPlan(true);
    // Plan stage will show a loading spinner until the architect returns
    // an architecture_plan response. The actual message is sent by TabChat
    // via the onPlanGenerationNeeded callback.
  }, [setThinkStatus, setDevStage, setPlanStatus, setUserTriggeredPlan, activeSandbox?.sandbox_id, coPilotStore.discoveryDocuments]);

  // Called when user approves Plan stage — triggers v4 orchestrator build
  const handlePlanApproved = useCallback(async () => {
    setPlanStatus("approved");

    const sandboxId = activeSandbox?.sandbox_id;
    if (!sandboxId) {
      setBuildStatus("failed");
      setSkillGeneration("error", "No active sandbox — cannot build.");
      return;
    }

    // Persist architecture plan to workspace before build starts
    if (architecturePlan) {
      try {
        const { renderPlanSummary } = await import("@/lib/openclaw/plan-formatter");
        const { writeWorkspaceFiles } = await import("@/lib/openclaw/workspace-writer");
        await writeWorkspaceFiles(sandboxId, [
          { path: ".openclaw/plan/architecture.json", content: JSON.stringify(architecturePlan, null, 2) },
          { path: ".openclaw/plan/PLAN.md", content: renderPlanSummary(architecturePlan) },
        ]);
      } catch (err) {
        console.warn("[CoPilot] Failed to persist plan:", err);
      }
    }

    setDevStage("build");
    setBuildStatus("building");
    setUserTriggeredBuild(true);
    setSkillGeneration("loading");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    // ── V4 build: always use orchestrator with specialist sub-agents ──
    pushBuildActivity({ type: "task", label: "Starting build pipeline..." });

    import("@/lib/openclaw/build-orchestrator").then(({ runBuildPipeline }) =>
      runBuildPipeline(
        sandboxId,
        {
          onTaskStart: (task) => {
            pushBuildActivity({ type: "task", label: `Starting ${task.specialist}...` });
          },
          onTaskComplete: (task) => {
            pushBuildActivity({ type: "task", label: `${task.specialist} complete (${task.files.length} files)` });
          },
          onTaskFailed: (task, error) => {
            pushBuildActivity({ type: "task", label: `${task.specialist} failed: ${error.slice(0, 80)}` });
          },
          onFileWritten: (path) => {
            pushBuildActivity({ type: "file", label: path.split("/").slice(-2).join("/") });
          },
          onProgress: (completed, total) => {
            setBuildProgress({ completed, total, currentSkill: null });
          },
          onStatus: (msg) => {
            pushBuildActivity({ type: "tool", label: msg });
          },
          onValidation: (report) => {
            coPilotStore.setBuildValidation(report);
          },
        },
        {
          plan: architecturePlan ?? undefined,
          agentName: trimmedName,
          discoveryDocs: discoveryDocuments,
        },
      ).then((manifest) => {
        coPilotStore.setBuildManifest(manifest);
        coPilotStore.setAgentSandboxId(sandboxId);

        // Extract skill graph from plan for the Review stage
        if (architecturePlan) {
          const nodes = architecturePlan.skills.map((s) => ({
            skill_id: s.id,
            name: s.name,
            description: s.description,
            status: "generated" as const,
            source: "custom" as const,
            depends_on: s.dependencies,
            requires_env: s.envVars,
            skill_md: s.skillMd ?? "",
          }));
          const workflow = architecturePlan.workflow
            ? {
                name: "main-workflow",
                description: `${trimmedName} workflow`,
                steps: architecturePlan.workflow.steps.map((step, i) => ({
                  id: `step-${i}`,
                  action: "execute" as const,
                  skill: step.skillId,
                  wait_for: i > 0 ? [architecturePlan.workflow.steps[i - 1].skillId] : [],
                })),
              }
            : null;
          setSkillGraph(nodes, workflow, []);
          onBuilderStateChange({
            name: trimmedName,
            description: trimmedDescription,
            skillGraph: nodes,
            workflow,
            systemName: trimmedName,
          });
        }

        const allDone = manifest.tasks.every((t) => t.status === "done");
        if (allDone) {
          setBuildStatus("done");
          setDevStage("review");
        } else {
          setBuildStatus("failed");
          setSkillGeneration("error", "Some build tasks failed. Check the build log.");
        }
      }).catch((error) => {
        setSkillGeneration("error", error instanceof Error ? error.message : "Build failed.");
        setBuildStatus("failed");
      }),
    );
  }, [name, description, discoveryDocuments, architecturePlan, activeSandbox, coPilotStore, setPlanStatus, setDevStage, setBuildStatus, setUserTriggeredBuild, pushBuildActivity, setBuildProgress, setSkillGeneration, setSkillGraph, onBuilderStateChange]);

  // Called when user retries a failed build — re-triggers handlePlanApproved
  const handleRetryBuild = useCallback(() => {
    buildRetryCountRef.current = 0;
    // Re-enter the plan-approved flow which detects v3 vs v2 automatically
    handlePlanApproved();
  }, [handlePlanApproved]);

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
