/**
 * Event Consumer Map — centralized dispatch for AG-UI custom events.
 *
 * Replaces the 9-branch if/else chain in use-agent-chat.ts with a clean
 * lookup map. Each consumer is a small function that can be tested in isolation.
 */

import type { Dispatch, SetStateAction } from "react";

import type { BrowserWorkspaceState } from "../browser-workspace";
import { applyBrowserWorkspaceEvent } from "../browser-workspace";
import type { BrowserWorkspaceEvent } from "../browser-workspace";
import type { AgentDevStage, ArchitecturePlan, DiscoveryDocument, StageStatus } from "../types";
import type {
  AgentStep,
  ChatMessage,
  SkillGraphReadyPayload,
  EditorFileChangedPayload,
  PreviewServerDetectedPayload,
  WizardSetPhasePayload,
} from "./types";
import { CustomEventName } from "./types";
import { tracer } from "./event-tracer";
import { ensureReasoningStep, appendReasoningStepDetail } from "./reasoning-step";

// ─── Consumer dependencies (injected by use-agent-chat) ─────────────────────

export interface ConsumerDeps {
  // CoPilot store (null if not in copilot mode)
  coPilotStore: CoPilotStoreLike | null | undefined;
  // Builder metadata (autosave-aware)
  commitBuilderMetadata: (name: string, value: unknown) => void;
  // React state setters
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setLiveResponse: (value: string) => void;
  setLiveBrowserState: (state: BrowserWorkspaceState) => void;
  liveBrowserStateRef: { current: BrowserWorkspaceState };
  setWorkspaceFilesTick: (updater: (prev: number) => number) => void;
  setDetectedPreviewPorts: (updater: (prev: number[]) => number[]) => void;
  // Editor file fetcher
  fetchEditorFile: (path: string) => void;
  // Callbacks
  onReadyForReview?: () => void;
  // Step tracking
  pushStep: (step: AgentStep) => void;
  updateStepDetail: (id: number, detail: string) => void;
  // Mutable refs
  thinkStepIdRef: { current: number };
  readyForReviewFiredRef: { current: boolean };
}

// Minimal interfaces to avoid circular imports
interface CoPilotStoreLike {
  setDiscoveryDocuments: (docs: { prd: DiscoveryDocument; trd: DiscoveryDocument }) => void;
  setThinkStatus: (status: StageStatus) => void;
  setDevStage: (stage: AgentDevStage) => void;
  setPhase: (phase: WizardSetPhasePayload["phase"]) => void;
  setArchitecturePlan: (plan: ArchitecturePlan) => void;
  setPlanStatus: (status: StageStatus) => void;
  setBuildStatus: (status: StageStatus) => void;
  pushBuildActivity: (item: { type: "file" | "skill" | "tool" | "task"; label: string }) => void;
  setBuildProgress: (progress: { completed: number; total: number | null; currentSkill: string | null }) => void;
  pushThinkActivity: (item: { type: "research" | "tool" | "status" | "identity"; label: string }) => void;
  updateBuildManifestTask: (taskId: string, update: Record<string, unknown>) => void;
  // Think v4 sub-step tracking
  setThinkStep: (step: string) => void;
  pushResearchFinding: (finding: { title: string; summary: string; source?: string }) => void;
  setResearchBriefPath: (path: string | null) => void;
  setPrdPath: (path: string | null) => void;
  setTrdPath: (path: string | null) => void;
  // Plan v4 incremental tracking
  setPlanStep: (step: string) => void;
  pushPlanActivity: (item: { type: string; label: string; count: number }) => void;
  updateArchitecturePlanSection: (section: string, data: unknown) => void;
  devStage: AgentDevStage;
}

// ─── Drop warning helper ───────────────────────────────────────────────────

function pushDropWarning(deps: ConsumerDeps, eventName: string, reason: string): void {
  deps.setMessages((prev) => [
    ...prev,
    {
      id: `drop-warn-${Date.now()}`,
      role: "system" as const,
      content: `⚠ Event "${eventName}" was not processed: ${reason}`,
    },
  ]);
}

// ─── Consumer type ──────────────────────────────────────────────────────────

type EventConsumer = (value: unknown, deps: ConsumerDeps) => void;

// ─── Individual consumers ───────────────────────────────────────────────────

export function consumeBrowserEvent(value: unknown, deps: ConsumerDeps): void {
  const browserEvent = value as BrowserWorkspaceEvent;
  deps.liveBrowserStateRef.current = applyBrowserWorkspaceEvent(
    deps.liveBrowserStateRef.current,
    browserEvent,
  );
  deps.setLiveBrowserState({ ...deps.liveBrowserStateRef.current });
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.BROWSER_EVENT);
}

export function consumeSkillGraphReady(value: unknown, deps: ConsumerDeps): void {
  const payload = value as SkillGraphReadyPayload;
  deps.commitBuilderMetadata(CustomEventName.SKILL_GRAPH_READY, value);

  const newId = `sgr-${Date.now()}`;
  deps.setMessages((prev) => [
    ...prev,
    {
      id: newId,
      role: "assistant",
      content: payload.content || `Skill graph generated with ${payload.skillGraph.length} skills.`,
      responseType: "ready_for_review",
    },
  ]);
  deps.setLiveResponse("");
  deps.readyForReviewFiredRef.current = true;
  // Advance to review only when the active lifecycle is already in Build.
  // Existing agents can emit or hydrate skill graphs before a fresh improvement
  // build has actually run; treating those as a completed build short-circuits
  // the real build trigger.
  if (deps.coPilotStore) {
    const stage = deps.coPilotStore.devStage;
    if (stage === "build") {
      deps.coPilotStore.setBuildStatus("done");
      deps.coPilotStore.setDevStage("review");
    }
  }
  deps.onReadyForReview?.();
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.SKILL_GRAPH_READY);
}

export function consumeEditorFileChanged(value: unknown, deps: ConsumerDeps): void {
  const payload = value as EditorFileChangedPayload;
  if (payload.path) {
    deps.fetchEditorFile(payload.path);
    deps.setWorkspaceFilesTick((prev) => prev + 1);
  }
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.EDITOR_FILE_CHANGED);
}

export function consumePreviewServerDetected(value: unknown, deps: ConsumerDeps): void {
  const payload = value as PreviewServerDetectedPayload;
  if (payload.port) {
    deps.setDetectedPreviewPorts((prev) =>
      prev.includes(payload.port) ? prev : [...prev, payload.port],
    );
  }
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.PREVIEW_SERVER_DETECTED);
}

export function consumeReasoning(value: unknown, deps: ConsumerDeps): void {
  const content = (value as { content: string }).content;
  ensureReasoningStep(deps.thinkStepIdRef, deps.pushStep);
  appendReasoningStepDetail(deps.thinkStepIdRef, content, deps.updateStepDetail);
}

export function consumeThinkStatus(value: unknown, deps: ConsumerDeps): void {
  if (!deps.coPilotStore) {
    pushDropWarning(deps, "think_status", "coPilotStore is null");
    tracer.drop("use-agent-chat", "CUSTOM", "think_status", "coPilotStore is null");
    return;
  }
  const payload = value as { status: string };
  const currentStage = deps.coPilotStore.devStage;
  if (currentStage && currentStage !== "think") {
    tracer.drop("use-agent-chat", "CUSTOM", "think_status", `ignored after stage advanced to ${currentStage}`);
    return;
  }
  deps.coPilotStore.setThinkStatus(payload.status as StageStatus);
  // Only set devStage to "think" if it hasn't already progressed past it.
  if (currentStage === "think" || !currentStage) {
    deps.coPilotStore.setDevStage("think");
  }
  tracer.apply("copilot-store", "CUSTOM", "think_status");
}

export function consumeThinkActivity(value: unknown, deps: ConsumerDeps): void {
  if (!deps.coPilotStore) {
    pushDropWarning(deps, "think_activity", "coPilotStore is null");
    tracer.drop("use-agent-chat", "CUSTOM", "think_activity", "coPilotStore is null");
    return;
  }
  const payload = value as { type: string; label: string };
  const currentStage = deps.coPilotStore.devStage;
  if (currentStage && currentStage !== "think") {
    tracer.drop("use-agent-chat", "CUSTOM", "think_activity", `ignored after stage advanced to ${currentStage}`);
    return;
  }
  deps.coPilotStore.pushThinkActivity({
    type: (payload.type as "research" | "tool" | "status" | "identity") || "status",
    label: payload.label || "Working...",
  });
  tracer.apply("copilot-store", "CUSTOM", "think_activity");
}

export function consumeDiscoveryDocuments(value: unknown, deps: ConsumerDeps): void {
  if (!deps.coPilotStore) {
    pushDropWarning(deps, "discovery_documents", "coPilotStore is null");
    tracer.drop("use-agent-chat", "CUSTOM", "discovery_documents", "coPilotStore is null");
    return;
  }
  const payload = value as { prd: unknown; trd: unknown; systemName?: string; content?: string };
  if (!payload.prd || !payload.trd) {
    tracer.drop("use-agent-chat", "CUSTOM", "discovery_documents", "prd or trd missing in payload");
    return;
  }
  deps.coPilotStore.setDiscoveryDocuments({
    prd: payload.prd as DiscoveryDocument,
    trd: payload.trd as DiscoveryDocument,
  });
  deps.coPilotStore.setThinkStatus("ready");
  // Only set devStage to "think" if it hasn't already progressed past it.
  // The architecture_plan_ready consumer may have already advanced to "plan".
  const currentStage = deps.coPilotStore.devStage;
  if (currentStage === "think" || !currentStage) {
    deps.coPilotStore.setDevStage("think");
  }
  tracer.apply("copilot-store", "CUSTOM", "discovery_documents");
}

export function consumeArchitecturePlanReady(value: unknown, deps: ConsumerDeps): void {
  if (!deps.coPilotStore) {
    pushDropWarning(deps, "architecture_plan_ready", "coPilotStore is null");
    tracer.drop("use-agent-chat", "CUSTOM", "architecture_plan_ready", "coPilotStore is null");
    return;
  }
  const payload = value as { plan: ArchitecturePlan; systemName?: string; content?: string };
  if (!payload.plan) {
    tracer.drop("use-agent-chat", "CUSTOM", "architecture_plan_ready", "plan missing in payload");
    return;
  }
  // Normalize the plan to fill missing fields before setting in store
  const { normalizePlan } = require("@/lib/openclaw/plan-formatter");
  deps.coPilotStore.setArchitecturePlan(normalizePlan(payload.plan as unknown as Record<string, unknown>));
  deps.coPilotStore.setPlanStatus("ready");
  deps.coPilotStore.setDevStage("plan");
  tracer.apply("copilot-store", "CUSTOM", "architecture_plan_ready");
}

export function consumeWizardEvent(value: unknown, deps: ConsumerDeps, name: string): void {
  deps.commitBuilderMetadata(name, value);
  tracer.apply("copilot-store", "CUSTOM", name);
}

export function consumeWizardPhase(value: unknown, deps: ConsumerDeps): void {
  if (!deps.coPilotStore) {
    pushDropWarning(deps, CustomEventName.WIZARD_SET_PHASE, "coPilotStore is null");
    tracer.drop("use-agent-chat", "CUSTOM", CustomEventName.WIZARD_SET_PHASE, "coPilotStore is null");
    return;
  }
  const payload = value as WizardSetPhasePayload;
  deps.coPilotStore.setPhase(payload.phase);
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.WIZARD_SET_PHASE);
}

// ─── Workspace & build event consumers ──────────────────────────────────────

function consumeFileWritten(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("use-agent-chat", "CUSTOM", CustomEventName.FILE_WRITTEN);
  deps.setWorkspaceFilesTick((prev) => prev + 1);
  if (deps.coPilotStore) {
    const payload = value as { path?: string; tool?: string };
    const path = payload.path || "unknown file";
    const shortPath = path.split("/").slice(-2).join("/");
    deps.coPilotStore.pushBuildActivity({ type: "file", label: shortPath });
  }
}

function consumeSkillCreated(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.SKILL_CREATED);
  deps.setWorkspaceFilesTick((prev) => prev + 1);
  if (deps.coPilotStore) {
    const payload = value as { skillId?: string; path?: string };
    const label = payload.skillId
      ? payload.skillId.replace(/[-_]/g, " ")
      : payload.path?.split("/").slice(-2).join("/") || "skill";
    deps.coPilotStore.pushBuildActivity({ type: "skill", label });
  }
}

function consumeBuildProgress(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.BUILD_PROGRESS);
  if (deps.coPilotStore) {
    const payload = value as { completed: number; total: number | null; currentSkill: string | null };
    deps.coPilotStore.setBuildProgress(payload);
  }
}

function consumeWorkspaceChanged(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("use-agent-chat", "CUSTOM", CustomEventName.WORKSPACE_CHANGED);
  deps.setWorkspaceFilesTick((prev) => prev + 1);
}

function consumeBuildTaskUpdated(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.BUILD_TASK_UPDATED);
  if (!deps.coPilotStore) return;
  const payload = value as { taskId?: string; specialist?: string; status?: string; files?: string[]; error?: string };
  if (!payload.taskId) return;
  deps.coPilotStore.updateBuildManifestTask(payload.taskId, {
    status: payload.status,
    files: payload.files,
    error: payload.error,
  });
  const label = payload.specialist
    ? `${payload.specialist}: ${payload.status}`
    : `Task ${payload.taskId}: ${payload.status}`;
  deps.coPilotStore.pushBuildActivity({ type: "task", label });
}

// ─── Think v4 event consumers ──────────────────────────────────────────────

function consumeThinkStep(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.THINK_STEP);
  if (!deps.coPilotStore) return;
  const payload = value as { step?: string; status?: string };
  if (!payload.step) return;
  deps.coPilotStore.setThinkStep(payload.step);
  const statusLabel = payload.status === "complete" ? "completed" : "started";
  deps.coPilotStore.pushThinkActivity({
    type: "status",
    label: `${payload.step} ${statusLabel}`,
  });
}

function consumeThinkResearchFinding(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.THINK_RESEARCH_FINDING);
  if (!deps.coPilotStore) return;
  const payload = value as { title?: string; summary?: string; source?: string };
  if (!payload.title || !payload.summary) return;
  deps.coPilotStore.pushResearchFinding({
    title: payload.title,
    summary: payload.summary,
    source: payload.source,
  });
  deps.coPilotStore.pushThinkActivity({
    type: "research",
    label: payload.title,
  });
}

function consumeThinkDocumentReady(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.THINK_DOCUMENT_READY);
  if (!deps.coPilotStore) return;
  const payload = value as { docType?: string; path?: string };
  if (!payload.docType || !payload.path) return;

  switch (payload.docType) {
    case "research_brief":
      deps.coPilotStore.setResearchBriefPath(payload.path);
      break;
    case "prd":
      deps.coPilotStore.setPrdPath(payload.path);
      break;
    case "trd":
      deps.coPilotStore.setTrdPath(payload.path);
      break;
  }

  deps.coPilotStore.pushThinkActivity({
    type: "status",
    label: `${payload.docType} written to workspace`,
  });

  // Auto-complete: when all three documents are written, mark Think as ready
  // We check the store state after updating — need to use a microtask
  // to let Zustand commit the current set() before reading back.
  queueMicrotask(() => {
    if (!deps.coPilotStore) return;
    const store = deps.coPilotStore as unknown as {
      researchBriefPath: string | null;
      prdPath: string | null;
      trdPath: string | null;
      thinkStatus: string;
    };
    if (store.researchBriefPath && store.prdPath && store.trdPath && store.thinkStatus !== "ready") {
      deps.coPilotStore.setThinkStep("complete");
      deps.coPilotStore.setThinkStatus("ready" as StageStatus);
    }
  });
}

// ─── Plan v4 event consumers ───────────────────────────────────────────────

function consumePlanSection(
  value: unknown,
  deps: ConsumerDeps,
  eventName: string,
  section: string,
  dataKey: string,
  stepName: string,
): void {
  tracer.apply("copilot-store", "CUSTOM", eventName);
  if (!deps.coPilotStore) return;
  const payload = value as Record<string, unknown>;
  const data = payload[dataKey];
  if (!data) return;

  deps.coPilotStore.updateArchitecturePlanSection(section, data);
  deps.coPilotStore.setPlanStep(stepName);
  const count = Array.isArray(data) ? data.length : (data as { tables?: unknown[] }).tables?.length ?? 1;
  deps.coPilotStore.pushPlanActivity({
    type: section as "skills",
    label: `${section}: ${count} item${count !== 1 ? "s" : ""} defined`,
    count,
  });
}

function consumePlanSkills(value: unknown, deps: ConsumerDeps): void {
  consumePlanSection(value, deps, CustomEventName.PLAN_SKILLS, "skills", "skills", "skills");
}

function consumePlanWorkflow(value: unknown, deps: ConsumerDeps): void {
  consumePlanSection(value, deps, CustomEventName.PLAN_WORKFLOW, "workflow", "workflow", "workflow");
}

function consumePlanDataSchema(value: unknown, deps: ConsumerDeps): void {
  consumePlanSection(value, deps, CustomEventName.PLAN_DATA_SCHEMA, "dataSchema", "dataSchema", "data");
}

function consumePlanApiEndpoints(value: unknown, deps: ConsumerDeps): void {
  consumePlanSection(value, deps, CustomEventName.PLAN_API_ENDPOINTS, "apiEndpoints", "apiEndpoints", "api");
}

function consumePlanDashboardPages(value: unknown, deps: ConsumerDeps): void {
  consumePlanSection(value, deps, CustomEventName.PLAN_DASHBOARD_PAGES, "dashboardPages", "dashboardPages", "dashboard");
}

function consumePlanEnvVars(value: unknown, deps: ConsumerDeps): void {
  consumePlanSection(value, deps, CustomEventName.PLAN_ENV_VARS, "envVars", "envVars", "envvars");
}

function consumePlanComplete(value: unknown, deps: ConsumerDeps): void {
  tracer.apply("copilot-store", "CUSTOM", CustomEventName.PLAN_COMPLETE);
  if (!deps.coPilotStore) return;
  deps.coPilotStore.setPlanStep("complete");
  deps.coPilotStore.setPlanStatus("ready" as StageStatus);
  deps.coPilotStore.pushPlanActivity({
    type: "complete",
    label: "Architecture plan complete",
    count: 0,
  });
}

// ─── Consumer registry ──────────────────────────────────────────────────────

// Consumers that receive (value, deps)
const simpleConsumers: Record<string, EventConsumer> = {
  [CustomEventName.BROWSER_EVENT]: consumeBrowserEvent,
  [CustomEventName.SKILL_GRAPH_READY]: consumeSkillGraphReady,
  [CustomEventName.EDITOR_FILE_CHANGED]: consumeEditorFileChanged,
  [CustomEventName.PREVIEW_SERVER_DETECTED]: consumePreviewServerDetected,
  reasoning: consumeReasoning,
  think_status: consumeThinkStatus,
  think_activity: consumeThinkActivity,
  discovery_documents: consumeDiscoveryDocuments,
  architecture_plan_ready: consumeArchitecturePlanReady,
  [CustomEventName.WIZARD_SET_PHASE]: consumeWizardPhase,
  [CustomEventName.FILE_WRITTEN]: consumeFileWritten,
  [CustomEventName.SKILL_CREATED]: consumeSkillCreated,
  [CustomEventName.BUILD_PROGRESS]: consumeBuildProgress,
  [CustomEventName.WORKSPACE_CHANGED]: consumeWorkspaceChanged,
  [CustomEventName.BUILD_TASK_UPDATED]: consumeBuildTaskUpdated,
  [CustomEventName.THINK_STEP]: consumeThinkStep,
  [CustomEventName.THINK_RESEARCH_FINDING]: consumeThinkResearchFinding,
  [CustomEventName.THINK_DOCUMENT_READY]: consumeThinkDocumentReady,
  [CustomEventName.PLAN_SKILLS]: consumePlanSkills,
  [CustomEventName.PLAN_WORKFLOW]: consumePlanWorkflow,
  [CustomEventName.PLAN_DATA_SCHEMA]: consumePlanDataSchema,
  [CustomEventName.PLAN_API_ENDPOINTS]: consumePlanApiEndpoints,
  [CustomEventName.PLAN_DASHBOARD_PAGES]: consumePlanDashboardPages,
  [CustomEventName.PLAN_ENV_VARS]: consumePlanEnvVars,
  [CustomEventName.PLAN_COMPLETE]: consumePlanComplete,
};

// Wizard events that go through commitBuilderMetadata (need the event name)
const wizardEventNames = new Set<string>([
  CustomEventName.WIZARD_UPDATE_FIELDS,
  CustomEventName.WIZARD_SET_SKILLS,
  CustomEventName.WIZARD_CONNECT_TOOLS,
  CustomEventName.WIZARD_SET_TRIGGERS,
  CustomEventName.WIZARD_SET_RULES,
  CustomEventName.WIZARD_SET_CHANNELS,
]);

// ─── Main dispatcher ────────────────────────────────────────────────────────

/**
 * Dispatch an AG-UI custom event to the appropriate consumer.
 * Returns true if the event was handled, false if no consumer was found.
 */
export function dispatchCustomEvent(
  name: string,
  value: unknown,
  deps: ConsumerDeps,
): boolean {
  tracer.receive("use-agent-chat", "CUSTOM", name);

  // Check simple consumers first
  const consumer = simpleConsumers[name];
  if (consumer) {
    try {
      consumer(value, deps);
    } catch (err) {
      tracer.drop("use-agent-chat", "CUSTOM", name, `consumer threw: ${err}`);
    }
    return true;
  }

  // Check wizard events
  if (wizardEventNames.has(name)) {
    try {
      consumeWizardEvent(value, deps, name);
    } catch (err) {
      tracer.drop("use-agent-chat", "CUSTOM", name, `wizard consumer threw: ${err}`);
    }
    return true;
  }

  tracer.drop("use-agent-chat", "CUSTOM", name, "no consumer registered");
  return false;
}
