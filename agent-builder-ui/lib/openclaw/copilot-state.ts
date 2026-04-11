/**
 * CoPilot State — shared Zustand store for the co-pilot wizard.
 *
 * Both the chat (via AG-UI custom events from BuilderAgent) and the wizard UI
 * (via user clicks) read and write to this same store. This enables the
 * architect agent and the user to co-control the wizard in real time.
 */

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type {
  AgentDevStage,
  ArchitecturePlan,
  BuildManifestTask,
  BuildReport,
  DiscoveryDocuments,
  DiscoveryQuestion,
  EvalLoopState,
  EvalTask,
  SkillGraphNode,
  StageStatus,
  ValidationReport,
  WorkflowDefinition,
} from "./types";
import { AGENT_DEV_STAGES } from "./types";
import type { SkillAvailability } from "@/lib/skills/skill-registry";
import type { AgentChannelSelection, AgentImprovement, AgentRuntimeInput } from "@/lib/agents/types";
import type {
  ToolConnectionDraft,
  ToolCredentialDrafts,
  TriggerSelection,
} from "@/app/(platform)/agents/create/_components/configure/types";

// ─── Phase type ──────────────────────────────────────────────────────────────

/** @deprecated Use AgentDevStage for the new lifecycle. Kept for backward compat. */
export type CoPilotPhase = "purpose" | "discovery" | "skills" | "tools" | "runtime_inputs" | "triggers" | "channels" | "review";
export type SkillGenerationStatus = "idle" | "loading" | "ready" | "error";
export type DiscoveryStatus = "idle" | "loading" | "ready" | "skipped" | "error";

// Re-export for convenience
export type { AgentDevStage, StageStatus } from "./types";
export { AGENT_DEV_STAGES } from "./types";

export const PHASE_ORDER: CoPilotPhase[] = ["purpose", "discovery", "skills", "tools", "runtime_inputs", "triggers", "channels", "review"];

// ─── Build activity feed ────────────────────────────────────────────────────

export interface BuildActivityItem {
  id: string;
  type: "file" | "skill" | "tool" | "task";
  label: string;
  timestamp: number;
}

export interface BuildProgress {
  completed: number;
  total: number | null;
  currentSkill: string | null;
}

// ─── Think activity feed ────────────────────────────────────────────────────

export interface ThinkActivityItem {
  id: string;
  type: "research" | "tool" | "status" | "identity";
  label: string;
  timestamp: number;
}

// ─── Think research findings ───────────────────────────────────────────────

export type ThinkSubStep = "idle" | "research" | "prd" | "trd" | "complete";

export interface ThinkResearchFinding {
  id: string;
  title: string;
  summary: string;
  source?: string;
  timestamp: number;
}

// ─── Plan activity feed ────────────────────────────────────────────────────

export type PlanSubStep = "idle" | "skills" | "workflow" | "data" | "api" | "dashboard" | "envvars" | "complete";

export interface PlanActivityItem {
  id: string;
  type: "skills" | "workflow" | "data_schema" | "api_endpoints" | "dashboard_pages" | "env_vars" | "complete";
  label: string;
  count: number;
  timestamp: number;
}

// ─── State ───────────────────────────────────────────────────────────────────

export interface CoPilotState {
  sessionId: string;
  /** @deprecated Use devStage instead. Kept for backward compat with TabChat auto-switch. */
  phase: CoPilotPhase;

  // Purpose
  name: string;
  description: string;

  // Discovery (architect intake — PRD/TRD documents)
  discoveryQuestions: DiscoveryQuestion[] | null;
  discoveryAnswers: Record<string, string | string[]>;
  discoveryDocuments: DiscoveryDocuments | null;
  discoveryStatus: DiscoveryStatus;

  // Skills (from architect or user)
  skillGraph: SkillGraphNode[] | null;
  selectedSkillIds: string[];
  workflow: WorkflowDefinition | null;
  skillGenerationStatus: SkillGenerationStatus;
  skillGenerationError: string | null;
  skillAvailability: SkillAvailability[];
  builtSkillIds: string[];

  // Tools
  connectedTools: ToolConnectionDraft[];
  credentialDrafts: ToolCredentialDrafts;
  runtimeInputs: AgentRuntimeInput[];

  // Triggers
  triggers: TriggerSelection[];

  // Channels
  channels: AgentChannelSelection[];

  // Behavior
  agentRules: string[];
  improvements: AgentImprovement[];

  // Metadata
  systemName: string | null;

  // ── Agent Development Lifecycle ────────────────────────────────────────────
  devStage: AgentDevStage;
  maxUnlockedDevStage: AgentDevStage;

  // Think stage
  thinkStatus: StageStatus;
  thinkActivity: ThinkActivityItem[];
  /** Whether the user explicitly moved into think generation. */
  userTriggeredThink: boolean;
  thinkRunId: string | null;
  lastDispatchedThinkRunId: string | null;
  /** Current Think sub-step (v4 multi-step research). */
  thinkStep: ThinkSubStep;
  /** Research findings discovered during Think phase. */
  researchFindings: ThinkResearchFinding[];
  /** Workspace path for the research brief, set when written. */
  researchBriefPath: string | null;
  /** Workspace path for the PRD, set when written. */
  prdPath: string | null;
  /** Workspace path for the TRD, set when written. */
  trdPath: string | null;

  // Plan stage
  architecturePlan: ArchitecturePlan | null;
  planStatus: StageStatus;
  /** Whether the user approved Think completion to request a plan. */
  userTriggeredPlan: boolean;
  planRunId: string | null;
  lastDispatchedPlanRunId: string | null;
  /** Current Plan sub-step (v4 incremental plan building). */
  planStep: PlanSubStep;
  /** Plan activity feed showing which sections have been decided. */
  planActivity: PlanActivityItem[];

  // Build stage
  buildStatus: StageStatus;
  buildActivity: BuildActivityItem[];
  buildProgress: BuildProgress | null;
  /** When true, build fans out skill generation to parallel workers. */
  parallelBuildEnabled: boolean;
  /** Whether the user approved plan generation to start a build. */
  userTriggeredBuild: boolean;
  buildRunId: string | null;

  // Test stage
  evalTasks: EvalTask[];
  evalStatus: StageStatus;
  /** The agent's own sandbox container ID — set during Build, used for real eval. */
  agentSandboxId: string | null;
  /** Reinforcement loop state for iterative skill improvement. */
  evalLoopState: EvalLoopState;

  // Ship stage
  deployStatus: StageStatus;

  // Build manifest (v3 pipeline)
  buildManifest: import("./types").BuildManifest | null;

  // Build validation
  buildValidation: ValidationReport | null;

  // Reflect stage
  buildReport: BuildReport | null;

  // Feature branch mode
  featureContext: { title: string; description: string; baselineAgent: { name: string; skillCount: number; skills: string[] } } | null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export interface CoPilotActions {
  setPhase: (phase: CoPilotPhase) => void;
  advancePhase: () => void;
  goBackPhase: () => void;

  updateFields: (partial: Partial<Pick<CoPilotState, "name" | "description" | "systemName">>) => void;

  setDiscoveryQuestions: (questions: DiscoveryQuestion[]) => void;
  setDiscoveryAnswer: (questionId: string, answer: string | string[]) => void;
  setDiscoveryDocuments: (docs: DiscoveryDocuments) => void;
  updateDiscoveryDocSection: (docType: "prd" | "trd", sectionIndex: number, content: string) => void;
  setDiscoveryStatus: (status: DiscoveryStatus) => void;
  skipDiscovery: () => void;

  setSkillGraph: (
    nodes: SkillGraphNode[],
    workflow: WorkflowDefinition | null,
    rules: string[],
  ) => void;
  clearSkillGraph: () => void;
  setSkillGeneration: (status: SkillGenerationStatus, error?: string | null) => void;
  setSkillAvailability: (availability: SkillAvailability[]) => void;
  markSkillBuilt: (skillId: string, skillMd?: string) => void;
  buildAllSkills: (builder: (node: SkillGraphNode) => string) => void;
  selectSkills: (ids: string[]) => void;

  connectTools: (tools: ToolConnectionDraft[]) => void;
  setCredentialDrafts: (drafts: ToolCredentialDrafts) => void;
  setRuntimeInputs: (runtimeInputs: AgentRuntimeInput[]) => void;
  setTriggers: (triggers: TriggerSelection[]) => void;
  setChannels: (channels: AgentChannelSelection[]) => void;
  setRules: (rules: string[]) => void;
  setImprovements: (improvements: AgentImprovement[]) => void;
  hydrateFromSeed: (seed: Partial<CoPilotState>) => void;
  hydrateForFeature: (featureCtx: CoPilotState["featureContext"], startStage?: string) => void;

  // ── Lifecycle actions ──────────────────────────────────────────────────────
  setDevStage: (stage: AgentDevStage) => void;
  advanceDevStage: () => void;
  /** Returns true if the current stage's hard gate is satisfied. */
  canAdvanceDevStage: () => boolean;
  goBackDevStage: () => void;
  setThinkStatus: (status: StageStatus) => void;
  setUserTriggeredThink: (triggered: boolean) => void;
  markThinkRunDispatched: (runId: string | null) => void;
  pushThinkActivity: (item: Omit<ThinkActivityItem, "id" | "timestamp">) => void;
  clearThinkActivity: () => void;
  setThinkStep: (step: ThinkSubStep | string) => void;
  pushResearchFinding: (finding: Omit<ThinkResearchFinding, "id" | "timestamp">) => void;
  clearResearchFindings: () => void;
  setResearchBriefPath: (path: string | null) => void;
  setPrdPath: (path: string | null) => void;
  setTrdPath: (path: string | null) => void;
  setArchitecturePlan: (plan: ArchitecturePlan) => void;
  updateArchitecturePlan: (partial: Partial<ArchitecturePlan>) => void;
  setPlanStatus: (status: StageStatus) => void;
  setUserTriggeredPlan: (triggered: boolean) => void;
  markPlanRunDispatched: (runId: string | null) => void;
  setPlanStep: (step: PlanSubStep | string) => void;
  pushPlanActivity: (item: { type: PlanActivityItem["type"] | string; label: string; count: number }) => void;
  clearPlanActivity: () => void;
  updateArchitecturePlanSection: (section: string, data: unknown) => void;
  setBuildStatus: (status: StageStatus) => void;
  setUserTriggeredBuild: (triggered: boolean) => void;
  setParallelBuildEnabled: (enabled: boolean) => void;
  pushBuildActivity: (item: Omit<BuildActivityItem, "id" | "timestamp">) => void;
  setBuildProgress: (progress: BuildProgress) => void;
  clearBuildActivity: () => void;
  setEvalTasks: (tasks: EvalTask[]) => void;
  updateEvalTask: (taskId: string, partial: Partial<EvalTask>) => void;
  setEvalStatus: (status: StageStatus) => void;
  setAgentSandboxId: (id: string | null) => void;
  setEvalLoopState: (state: Partial<EvalLoopState>) => void;
  resetEvalLoop: () => void;
  setDeployStatus: (status: StageStatus) => void;
  setBuildManifest: (manifest: import("./types").BuildManifest | null) => void;
  updateBuildManifestTask: (taskId: string, update: Partial<BuildManifestTask>) => void;
  setBuildValidation: (report: ValidationReport | null) => void;
  setBuildReport: (report: BuildReport) => void;

  reset: () => void;
  snapshot: () => CoPilotState;
}

// ─── Initial state ───────────────────────────────────────────────────────────

function createInitialState(): CoPilotState {
  return {
    sessionId: uuidv4(),
    phase: "purpose",
    name: "",
    description: "",
    discoveryQuestions: null,
    discoveryAnswers: {},
    discoveryDocuments: null,
    discoveryStatus: "idle",
    skillGraph: null,
    selectedSkillIds: [],
    workflow: null,
    skillGenerationStatus: "idle",
    skillGenerationError: null,
    skillAvailability: [],
    builtSkillIds: [],
    connectedTools: [],
    credentialDrafts: {},
    runtimeInputs: [],
    triggers: [],
    channels: [],
    agentRules: [],
    improvements: [],
    systemName: null,
    // Lifecycle
    devStage: "think",
    maxUnlockedDevStage: "think",
      thinkStatus: "idle",
      thinkActivity: [],
      userTriggeredThink: false,
      thinkRunId: null,
      lastDispatchedThinkRunId: null,
      thinkStep: "idle",
      researchFindings: [],
      researchBriefPath: null,
      prdPath: null,
      trdPath: null,
      architecturePlan: null,
      planStatus: "idle",
      userTriggeredPlan: false,
      planRunId: null,
      lastDispatchedPlanRunId: null,
      planStep: "idle",
      planActivity: [],
      buildStatus: "idle",
      buildActivity: [],
      buildProgress: null,
      userTriggeredBuild: false,
      buildRunId: null,
      parallelBuildEnabled: false,
    evalTasks: [],
    evalStatus: "idle",
    agentSandboxId: null,
    evalLoopState: {
      iteration: 0,
      maxIterations: 5,
      scores: [],
      mutations: [],
      status: "idle",
    },
    deployStatus: "idle",
    buildManifest: null,
    buildValidation: null,
    buildReport: null,
    featureContext: null,
  };
}

function getDevStageIndex(stage: AgentDevStage | null | undefined): number {
  if (!stage) return 0;
  const index = AGENT_DEV_STAGES.indexOf(stage);
  return index >= 0 ? index : 0;
}

function maxDevStage(a: AgentDevStage, b: AgentDevStage): AgentDevStage {
  return getDevStageIndex(a) >= getDevStageIndex(b) ? a : b;
}

function resolveMaxUnlockedDevStage(seed: Partial<CoPilotState>): AgentDevStage {
  const currentStage = seed.devStage ?? "think";
  const unlockedStage = seed.maxUnlockedDevStage ?? currentStage;
  return maxDevStage(currentStage, unlockedStage);
}

// ─── Stage-status reset map (used by goBackDevStage) ────────────────────────

const STAGE_STATUS_RESET: Partial<Record<AgentDevStage, Partial<CoPilotState>>> = {
  think: {
    thinkStatus: "idle" as StageStatus,
    thinkActivity: [] as ThinkActivityItem[],
    userTriggeredThink: false,
    thinkRunId: null,
    lastDispatchedThinkRunId: null,
    thinkStep: "idle" as ThinkSubStep,
    researchFindings: [] as ThinkResearchFinding[],
    researchBriefPath: null as string | null,
    prdPath: null as string | null,
    trdPath: null as string | null,
    userTriggeredPlan: false,
    planRunId: null,
    lastDispatchedPlanRunId: null,
    userTriggeredBuild: false,
    buildRunId: null,
  },
  plan: {
    planStatus: "idle" as StageStatus,
    userTriggeredPlan: false,
    planRunId: null,
    lastDispatchedPlanRunId: null,
    planStep: "idle" as PlanSubStep,
    planActivity: [] as PlanActivityItem[],
    userTriggeredBuild: false,
    buildRunId: null,
  },
  build: {
    buildStatus: "idle" as StageStatus,
    buildActivity: [] as BuildActivityItem[],
    buildProgress: null as BuildProgress | null,
    userTriggeredBuild: false,
    buildRunId: null,
    agentSandboxId: null as string | null,
    buildValidation: null as ValidationReport | null,
  },
  test: { evalStatus: "idle" as StageStatus },
  ship: { deployStatus: "idle" as StageStatus },
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useCoPilotStore = create<CoPilotState & CoPilotActions>((set, get) => ({
  ...createInitialState(),

  setPhase: (phase) => set({ phase }),

  advancePhase: () => {
    const { phase } = get();
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx < PHASE_ORDER.length - 1) {
      set({ phase: PHASE_ORDER[idx + 1] });
    }
  },

  goBackPhase: () => {
    const { phase } = get();
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx > 0) {
      set({ phase: PHASE_ORDER[idx - 1] });
    }
  },

  updateFields: (partial) => set(partial),

  setDiscoveryQuestions: (questions) =>
    set({
      discoveryQuestions: questions,
      discoveryStatus: "ready",
    }),

  setDiscoveryAnswer: (questionId, answer) =>
    set((state) => ({
      discoveryAnswers: { ...state.discoveryAnswers, [questionId]: answer },
    })),

  setDiscoveryDocuments: (docs) =>
    set({
      discoveryDocuments: docs,
      discoveryStatus: "ready",
    }),

  updateDiscoveryDocSection: (docType, sectionIndex, content) =>
    set((state) => {
      if (!state.discoveryDocuments) return {};
      const doc = { ...state.discoveryDocuments[docType] };
      const sections = [...doc.sections];
      sections[sectionIndex] = { ...sections[sectionIndex], content };
      return {
        discoveryDocuments: {
          ...state.discoveryDocuments,
          [docType]: { ...doc, sections },
        },
      };
    }),

  setDiscoveryStatus: (status) => set({ discoveryStatus: status }),

  skipDiscovery: () =>
    set({
      discoveryStatus: "skipped",
      discoveryQuestions: null,
      discoveryAnswers: {},
    }),

  setSkillGraph: (nodes, workflow, rules) =>
    set({
      skillGraph: nodes,
      selectedSkillIds: nodes.map((n) => n.skill_id),
      builtSkillIds: Array.from(
        new Set(
          nodes
            .filter((node) => typeof node.skill_md === "string" && node.skill_md.trim().length > 0)
            .map((node) => node.skill_id),
        ),
      ),
      workflow,
      skillGenerationStatus: nodes.length > 0 ? "ready" : get().skillGenerationStatus,
      skillGenerationError: null,
      agentRules: rules.length > 0 ? rules : get().agentRules,
      systemName: nodes[0]?.skill_id
        ? nodes[0].skill_id.replace(/_/g, "-").replace(/-skill$/, "")
        : get().systemName,
    }),

  clearSkillGraph: () =>
    set({
      skillGraph: null,
      selectedSkillIds: [],
      workflow: null,
      skillAvailability: [],
      builtSkillIds: [],
      connectedTools: [],
      credentialDrafts: {},
      runtimeInputs: [],
      triggers: [],
      channels: [],
      agentRules: [],
      improvements: [],
      skillGenerationStatus: "idle",
      skillGenerationError: null,
      discoveryQuestions: null,
      discoveryAnswers: {},
      discoveryStatus: "idle",
    }),

  setSkillGeneration: (status, error = null) =>
    set({
      skillGenerationStatus: status,
      skillGenerationError: error,
    }),

  setSkillAvailability: (availability) => set({ skillAvailability: availability }),

  markSkillBuilt: (skillId, skillMd) =>
    set((state) => ({
      builtSkillIds: state.builtSkillIds.includes(skillId)
        ? state.builtSkillIds
        : [...state.builtSkillIds, skillId],
      // Stamp skill_md on the node so it gets deployed to the sandbox
      skillGraph: skillMd && state.skillGraph
        ? state.skillGraph.map((n) => n.skill_id === skillId ? { ...n, skill_md: skillMd } : n)
        : state.skillGraph,
    })),

  buildAllSkills: (builder) =>
    set((state) => {
      if (!state.skillGraph) return {};
      const targetIds = new Set(
        state.selectedSkillIds.length > 0
          ? state.selectedSkillIds
          : state.skillGraph.map((n) => n.skill_id),
      );
      const newBuiltIds = new Set(state.builtSkillIds);
      const updatedNodes = state.skillGraph.map((node) => {
        if (!targetIds.has(node.skill_id)) return node;
        newBuiltIds.add(node.skill_id);
        return { ...node, skill_md: builder(node) };
      });
      return {
        skillGraph: updatedNodes,
        builtSkillIds: Array.from(newBuiltIds),
      };
    }),

  selectSkills: (ids) => set({ selectedSkillIds: ids }),

  connectTools: (tools) => set({ connectedTools: tools }),
  setCredentialDrafts: (drafts) => set({ credentialDrafts: drafts }),
  setRuntimeInputs: (runtimeInputs) => set({ runtimeInputs }),

  setTriggers: (triggers) => set({ triggers }),
  setChannels: (channels) => set({ channels }),

  setRules: (rules) => set({ agentRules: rules }),
  setImprovements: (improvements) => set({ improvements }),
  hydrateFromSeed: (seed) => set((prev) => {
    const initial = createInitialState();

    // Lifecycle preserve: when re-hydrating the SAME agent (e.g. from cache after
    // refresh), keep any lifecycle state that has progressed past initial.
    // Cross-agent leaks are prevented by the caller: page.tsx calls reset() before
    // hydrateFromSeed, and the cache is keyed by agentId. The seed is always for
    // the correct agent — no name/sessionId comparison needed.
    const isSameAgent = seed.name !== undefined && seed.name === prev.name;

    const LIFECYCLE_KEYS: (keyof CoPilotState)[] = [
      "thinkStatus", "userTriggeredThink", "planStatus", "userTriggeredPlan", "buildStatus", "userTriggeredBuild",
      "thinkRunId", "lastDispatchedThinkRunId", "planRunId", "lastDispatchedPlanRunId", "buildRunId",
      "discoveryStatus", "evalStatus", "deployStatus",
    ];
    const lifecyclePreserve: Partial<CoPilotState> = {};

    if (isSameAgent) {
      for (const key of LIFECYCLE_KEYS) {
        const seedVal = (seed as Record<string, unknown>)[key];
        const prevVal = prev[key];
        const initialVal = (initial as unknown as Record<string, unknown>)[key];
        // If the seed would reset to the initial value but the current state
        // has progressed past it, keep the current (advanced) state.
        if (prevVal !== initialVal && (seedVal === undefined || seedVal === initialVal)) {
          (lifecyclePreserve as Record<string, unknown>)[key] = prevVal;
        }
      }
    }

    return {
      ...initial,
      ...seed,
      ...lifecyclePreserve,
      maxUnlockedDevStage: resolveMaxUnlockedDevStage({ ...seed, ...lifecyclePreserve }),
    };
  }),

  hydrateForFeature: (featureCtx, startStage) => set((prev) => {
    const stage = (startStage ?? "think") as AgentDevStage;
    return {
      ...prev,
      devStage: stage, maxUnlockedDevStage: stage,
      thinkStatus: "idle" as StageStatus, planStatus: "idle" as StageStatus,
      buildStatus: "idle" as StageStatus, evalStatus: "idle" as StageStatus, deployStatus: "idle" as StageStatus,
      userTriggeredThink: false, userTriggeredPlan: false, userTriggeredBuild: false,
      thinkActivity: [], thinkRunId: null, lastDispatchedThinkRunId: null,
      thinkStep: "idle" as ThinkSubStep, researchFindings: [], researchBriefPath: null, prdPath: null, trdPath: null,
      planActivity: [], planRunId: null, lastDispatchedPlanRunId: null, planStep: "idle" as PlanSubStep, architecturePlan: null,
      buildActivity: [], buildProgress: null, buildRunId: null, buildManifest: null, buildValidation: null, buildReport: null,
      evalTasks: [], evalLoopState: { iteration: 0, maxIterations: 3, scores: [], mutations: [], status: "idle" as const },
      featureContext: featureCtx,
    };
  }),

  // ── Lifecycle actions ──────────────────────────────────────────────────────

  setDevStage: (stage) =>
    set((state) => ({
      devStage: stage,
      maxUnlockedDevStage: maxDevStage(state.maxUnlockedDevStage, stage),
    })),

  canAdvanceDevStage: () => {
    const state = get();
    const idx = AGENT_DEV_STAGES.indexOf(state.devStage);
    if (idx >= AGENT_DEV_STAGES.length - 1) return false;
    switch (state.devStage) {
      case "think":
        return state.thinkStatus === "approved" || state.thinkStatus === "done";
      case "plan":
        return state.planStatus === "approved" || state.planStatus === "done";
      case "build":
        return state.buildStatus === "done";
      default:
        return true;
    }
  },

  advanceDevStage: () => {
    const state = get();
    const { devStage, evalStatus, maxUnlockedDevStage } = state;
    const idx = AGENT_DEV_STAGES.indexOf(devStage);
    if (idx >= AGENT_DEV_STAGES.length - 1) return;

    // Gate: don't advance past an incomplete stage.
    // Each stage has a hard approval/completion requirement.
    const canAdvance = (() => {
      switch (devStage) {
        case "think":
          return state.thinkStatus === "approved" || state.thinkStatus === "done";
        case "plan":
          return state.planStatus === "approved" || state.planStatus === "done";
        case "build":
          return state.buildStatus === "done";
        // review, test, ship — allow free navigation once reached
        default:
          return true;
      }
    })();
    if (!canAdvance) return;

    const nextStage = AGENT_DEV_STAGES[idx + 1];
    const updates: Partial<CoPilotState> = {
      devStage: nextStage,
      maxUnlockedDevStage: maxDevStage(maxUnlockedDevStage, nextStage),
    };
    if (devStage === "test" && (evalStatus === "idle" || evalStatus === "running")) {
      (updates as Record<string, unknown>).evalStatus = "done";
    }
    set(updates as Partial<CoPilotState>);
  },

  goBackDevStage: () => {
    const { devStage } = get();
    const idx = AGENT_DEV_STAGES.indexOf(devStage);
    if (idx > 0) {
      const target = AGENT_DEV_STAGES[idx - 1];
      set({ devStage: target, maxUnlockedDevStage: target, ...STAGE_STATUS_RESET[target] });
    }
  },

  setThinkStatus: (status) => set({ thinkStatus: status }),
  setUserTriggeredThink: (triggered) =>
    set((state) => ({
      userTriggeredThink: triggered,
      thinkRunId: triggered ? (state.thinkRunId ?? uuidv4()) : null,
      lastDispatchedThinkRunId: triggered ? null : state.lastDispatchedThinkRunId,
    })),

  markThinkRunDispatched: (runId) => set({ lastDispatchedThinkRunId: runId ?? null }),

  pushThinkActivity: (item) =>
    set((state) => ({
      thinkActivity: [
        ...state.thinkActivity,
        {
          ...item,
          id: `think-${state.thinkActivity.length}-${Date.now()}`,
          timestamp: Date.now(),
        },
      ],
    })),

  clearThinkActivity: () => set({ thinkActivity: [] }),

  setThinkStep: (step) => set({ thinkStep: step as ThinkSubStep }),

  pushResearchFinding: (finding) =>
    set((state) => ({
      researchFindings: [
        ...state.researchFindings,
        {
          ...finding,
          id: `rf-${state.researchFindings.length}-${Date.now()}`,
          timestamp: Date.now(),
        },
      ],
    })),

  clearResearchFindings: () => set({ researchFindings: [] }),

  setResearchBriefPath: (path) => set({ researchBriefPath: path }),
  setPrdPath: (path) => set({ prdPath: path }),
  setTrdPath: (path) => set({ trdPath: path }),

  setArchitecturePlan: (plan) => set({ architecturePlan: plan, planStatus: "ready" }),

  updateArchitecturePlan: (partial) =>
    set((state) => ({
      architecturePlan: state.architecturePlan
        ? { ...state.architecturePlan, ...partial }
        : null,
    })),

  setPlanStatus: (status) => set({ planStatus: status }),
  setUserTriggeredPlan: (triggered) =>
    set((state) => ({
      userTriggeredPlan: triggered,
      planRunId: triggered ? (state.planRunId ?? uuidv4()) : null,
      lastDispatchedPlanRunId: triggered ? null : state.lastDispatchedPlanRunId,
    })),

  markPlanRunDispatched: (runId) => set({ lastDispatchedPlanRunId: runId ?? null }),

  setPlanStep: (step) => set({ planStep: step as PlanSubStep }),

  pushPlanActivity: (item) =>
    set((state) => ({
      planActivity: [
        ...state.planActivity,
        {
          type: item.type as PlanActivityItem["type"],
          label: item.label,
          count: item.count,
          id: `pa-${state.planActivity.length}-${Date.now()}`,
          timestamp: Date.now(),
        },
      ],
    })),

  clearPlanActivity: () => set({ planActivity: [] }),

  updateArchitecturePlanSection: (section, data) =>
    set((state) => ({
      architecturePlan: state.architecturePlan
        ? { ...state.architecturePlan, [section]: data }
        : null,
    })),

  setBuildStatus: (status) =>
    set(
      status === "building"
        ? { buildStatus: status, buildActivity: [], buildProgress: null }
        : { buildStatus: status },
    ),
  setUserTriggeredBuild: (triggered) =>
    set((state) => ({
      userTriggeredBuild: triggered,
      buildRunId: triggered ? (state.buildRunId ?? uuidv4()) : null,
    })),

  setParallelBuildEnabled: (enabled) => set({ parallelBuildEnabled: enabled }),

  pushBuildActivity: (item) =>
    set((state) => ({
      buildActivity: [
        ...state.buildActivity.slice(-19),
        {
          ...item,
          id: `ba-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
        },
      ],
    })),

  setBuildProgress: (progress) => set({ buildProgress: progress }),

  clearBuildActivity: () => set({ buildActivity: [], buildProgress: null }),

  setEvalTasks: (tasks) => set({ evalTasks: tasks }),

  updateEvalTask: (taskId, partial) =>
    set((state) => ({
      evalTasks: state.evalTasks.map((t) =>
        t.id === taskId ? { ...t, ...partial } : t,
      ),
    })),

  setEvalStatus: (status) => set({ evalStatus: status }),

  setAgentSandboxId: (id) => set({ agentSandboxId: id }),

  setEvalLoopState: (partial) =>
    set((state) => ({
      evalLoopState: { ...state.evalLoopState, ...partial },
    })),

  resetEvalLoop: () =>
    set({
      evalLoopState: {
        iteration: 0,
        maxIterations: 5,
        scores: [],
        mutations: [],
        status: "idle",
      },
    }),

  setDeployStatus: (status) => set({ deployStatus: status }),

  setBuildManifest: (manifest) => set({ buildManifest: manifest }),

  updateBuildManifestTask: (taskId, update) =>
    set((state) => {
      if (!state.buildManifest) return {};
      return {
        buildManifest: {
          ...state.buildManifest,
          tasks: state.buildManifest.tasks.map((t) =>
            t.id === taskId ? { ...t, ...update } : t,
          ),
        },
      };
    }),

  setBuildValidation: (report) => set({ buildValidation: report }),

  setBuildReport: (report) => set({ buildReport: report }),

  reset: () => set(createInitialState()),

  snapshot: () => {
    const state = get();
    return {
      sessionId: state.sessionId,
      phase: state.phase,
      name: state.name,
      description: state.description,
      discoveryQuestions: state.discoveryQuestions,
      discoveryAnswers: state.discoveryAnswers,
      discoveryDocuments: state.discoveryDocuments,
      discoveryStatus: state.discoveryStatus,
      skillGraph: state.skillGraph,
      selectedSkillIds: state.selectedSkillIds,
      workflow: state.workflow,
      skillGenerationStatus: state.skillGenerationStatus,
      skillGenerationError: state.skillGenerationError,
      skillAvailability: state.skillAvailability,
      builtSkillIds: state.builtSkillIds,
      connectedTools: state.connectedTools,
      credentialDrafts: state.credentialDrafts,
      runtimeInputs: state.runtimeInputs,
      triggers: state.triggers,
      channels: state.channels,
      agentRules: state.agentRules,
      improvements: state.improvements,
      systemName: state.systemName,
      // Lifecycle
      devStage: state.devStage,
      maxUnlockedDevStage: state.maxUnlockedDevStage,
      thinkStatus: state.thinkStatus,
      thinkActivity: state.thinkActivity,
      userTriggeredThink: state.userTriggeredThink,
      thinkRunId: state.thinkRunId,
      lastDispatchedThinkRunId: state.lastDispatchedThinkRunId,
      thinkStep: state.thinkStep,
      researchFindings: state.researchFindings,
      researchBriefPath: state.researchBriefPath,
      prdPath: state.prdPath,
      trdPath: state.trdPath,
      architecturePlan: state.architecturePlan,
      planStatus: state.planStatus,
      userTriggeredPlan: state.userTriggeredPlan,
      planRunId: state.planRunId,
      lastDispatchedPlanRunId: state.lastDispatchedPlanRunId,
      planStep: state.planStep,
      planActivity: state.planActivity,
      buildStatus: state.buildStatus,
      userTriggeredBuild: state.userTriggeredBuild,
      buildRunId: state.buildRunId,
      buildActivity: state.buildActivity,
      buildProgress: state.buildProgress,
      parallelBuildEnabled: state.parallelBuildEnabled,
      evalTasks: state.evalTasks,
      evalStatus: state.evalStatus,
      agentSandboxId: state.agentSandboxId,
      evalLoopState: state.evalLoopState,
      deployStatus: state.deployStatus,
      buildManifest: state.buildManifest,
      buildValidation: state.buildValidation,
      buildReport: state.buildReport,
      featureContext: state.featureContext,
    };
  },
}));

// Expose store on window in dev mode for browser-based testing
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as unknown as Record<string, unknown>).__coPilotStore = useCoPilotStore;
}
