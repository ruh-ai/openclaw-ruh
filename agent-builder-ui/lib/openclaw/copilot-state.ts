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
  BuildReport,
  DiscoveryDocuments,
  DiscoveryQuestion,
  EvalLoopState,
  EvalTask,
  SkillGraphNode,
  StageStatus,
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
  type: "file" | "skill" | "tool";
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

  // Plan stage
  architecturePlan: ArchitecturePlan | null;
  planStatus: StageStatus;

  // Build stage
  buildStatus: StageStatus;
  buildActivity: BuildActivityItem[];
  buildProgress: BuildProgress | null;

  // Test stage
  evalTasks: EvalTask[];
  evalStatus: StageStatus;
  /** The agent's own sandbox container ID — set during Build, used for real eval. */
  agentSandboxId: string | null;
  /** Reinforcement loop state for iterative skill improvement. */
  evalLoopState: EvalLoopState;

  // Ship stage
  deployStatus: StageStatus;

  // Reflect stage
  buildReport: BuildReport | null;
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

  // ── Lifecycle actions ──────────────────────────────────────────────────────
  setDevStage: (stage: AgentDevStage) => void;
  advanceDevStage: () => void;
  goBackDevStage: () => void;
  setThinkStatus: (status: StageStatus) => void;
  pushThinkActivity: (item: Omit<ThinkActivityItem, "id" | "timestamp">) => void;
  clearThinkActivity: () => void;
  setArchitecturePlan: (plan: ArchitecturePlan) => void;
  updateArchitecturePlan: (partial: Partial<ArchitecturePlan>) => void;
  setPlanStatus: (status: StageStatus) => void;
  setBuildStatus: (status: StageStatus) => void;
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
    architecturePlan: null,
    planStatus: "idle",
    buildStatus: "idle",
    buildActivity: [],
    buildProgress: null,
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
    buildReport: null,
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
  think: { thinkStatus: "idle" as StageStatus, thinkActivity: [] as ThinkActivityItem[] },
  plan: { planStatus: "idle" as StageStatus },
  build: { buildStatus: "idle" as StageStatus },
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
    // Preserve in-flight lifecycle state that CoPilotLayout effects have
    // already advanced past the initial value. Re-hydration (triggered by
    // existingAgent reference changes or isRouteAgentHydrated flipping)
    // would otherwise reset thinkStatus/planStatus back to "idle" while
    // the architect is already generating.
    const LIFECYCLE_KEYS: (keyof CoPilotState)[] = [
      "thinkStatus", "planStatus", "buildStatus",
      "discoveryStatus", "evalStatus", "deployStatus",
    ];
    const lifecyclePreserve: Partial<CoPilotState> = {};
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
    return {
      ...initial,
      ...seed,
      ...lifecyclePreserve,
      maxUnlockedDevStage: resolveMaxUnlockedDevStage({ ...seed, ...lifecyclePreserve }),
    };
  }),

  // ── Lifecycle actions ──────────────────────────────────────────────────────

  setDevStage: (stage) =>
    set((state) => ({
      devStage: stage,
      maxUnlockedDevStage: maxDevStage(state.maxUnlockedDevStage, stage),
    })),

  advanceDevStage: () => {
    const { devStage, evalStatus, maxUnlockedDevStage } = get();
    const idx = AGENT_DEV_STAGES.indexOf(devStage);
    if (idx < AGENT_DEV_STAGES.length - 1) {
      const nextStage = AGENT_DEV_STAGES[idx + 1];
      const updates: Partial<CoPilotState> = {
        devStage: nextStage,
        maxUnlockedDevStage: maxDevStage(maxUnlockedDevStage, nextStage),
      };
      if (devStage === "test" && (evalStatus === "idle" || evalStatus === "running")) {
        (updates as Record<string, unknown>).evalStatus = "done";
      }
      set(updates as Partial<CoPilotState>);
    }
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

  setArchitecturePlan: (plan) => set({ architecturePlan: plan, planStatus: "ready" }),

  updateArchitecturePlan: (partial) =>
    set((state) => ({
      architecturePlan: state.architecturePlan
        ? { ...state.architecturePlan, ...partial }
        : null,
    })),

  setPlanStatus: (status) => set({ planStatus: status }),

  setBuildStatus: (status) =>
    set(
      status === "building"
        ? { buildStatus: status, buildActivity: [], buildProgress: null }
        : { buildStatus: status },
    ),

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
      architecturePlan: state.architecturePlan,
      planStatus: state.planStatus,
      buildStatus: state.buildStatus,
      buildActivity: state.buildActivity,
      buildProgress: state.buildProgress,
      evalTasks: state.evalTasks,
      evalStatus: state.evalStatus,
      agentSandboxId: state.agentSandboxId,
      evalLoopState: state.evalLoopState,
      deployStatus: state.deployStatus,
      buildReport: state.buildReport,
    };
  },
}));

// Expose store on window in dev mode for browser-based testing
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as unknown as Record<string, unknown>).__coPilotStore = useCoPilotStore;
}
