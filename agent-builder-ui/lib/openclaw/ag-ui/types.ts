/**
 * AG-UI shared types for the agent builder.
 *
 * Defines the unified state shape that flows through AG-UI StateSnapshot
 * and StateDelta events, plus custom event names for domain-specific data.
 */

import type { BrowserWorkspaceState } from "../browser-workspace";
import type { TaskPlan } from "../task-plan-parser";
import type { SkillGraphNode, WorkflowDefinition } from "../types";
import { createEmptyBrowserWorkspaceState } from "../browser-workspace";
import type {
  AgentImprovement,
  AgentToolConnection,
  AgentTriggerDefinition,
} from "@/lib/agents/types";

// Re-export AG-UI core types used throughout the codebase
export { EventType } from "@ag-ui/core";
export type {
  BaseEvent,
  RunAgentInput,
  Message as AGUIMessage,
  Tool as AGUITool,
  Context as AGUIContext,
} from "@ag-ui/core";

// ─── Step types (same as current TabChat) ────────────────────────────────────

export type StepKind = "thinking" | "tool" | "writing";
export type StepStatus = "active" | "done";

export interface AgentStep {
  id: number;
  kind: StepKind;
  label: string;
  detail?: string;
  toolName?: string;
  status: StepStatus;
  startedAt: number;
  elapsedMs?: number;
}

// ─── Editor file ─────────────────────────────────────────────────────────────

export interface EditorFile {
  path: string;
  content: string;
  language: string;
}

// ─── Chat message ────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  hiddenInTranscript?: boolean;
  steps?: AgentStep[];
  browserState?: BrowserWorkspaceState;
  taskPlan?: TaskPlan;
  questions?: import("../types").ClarificationQuestion[];
  clarificationContext?: string;
  responseType?: string;
}

// ─── Chat mode ───────────────────────────────────────────────────────────────

export type ChatMode = "agent" | "builder";

// ─── Custom event names ──────────────────────────────────────────────────────

export const CustomEventName = {
  BROWSER_EVENT: "browser_event",
  SKILL_GRAPH_READY: "skill_graph_ready",
  EDITOR_FILE_CHANGED: "editor_file_changed",
  // Co-pilot wizard control events
  WIZARD_SET_PHASE: "wizard_set_phase",
  WIZARD_UPDATE_FIELDS: "wizard_update_fields",
  WIZARD_SET_SKILLS: "wizard_set_skills",
  WIZARD_CONNECT_TOOLS: "wizard_connect_tools",
  WIZARD_SET_TRIGGERS: "wizard_set_triggers",
  WIZARD_SET_RULES: "wizard_set_rules",
  WIZARD_SET_CHANNELS: "wizard_set_channels",
  PREVIEW_SERVER_DETECTED: "preview_server_detected",
  // ── Workspace & build events (from tool execution via WebSocket) ──
  /** A file was written to the agent workspace via exec. */
  FILE_WRITTEN: "file_written",
  /** A SKILL.md file was created in skills/. */
  SKILL_CREATED: "skill_created",
  /** Build progress update — tracks how many skills have been written. */
  BUILD_PROGRESS: "build_progress",
  /** Any workspace file change (create/update/delete). */
  WORKSPACE_CHANGED: "workspace_changed",
  /** Build task status change (v4 orchestrator). */
  BUILD_TASK_UPDATED: "build_task_updated",
  // ── Think phase events (v4 multi-step research) ──
  /** Think sub-step transition (research → prd → trd). */
  THINK_STEP: "think_step",
  /** A research finding discovered during Think research phase. */
  THINK_RESEARCH_FINDING: "think_research_finding",
  /** A Think document was written to workspace. */
  THINK_DOCUMENT_READY: "think_document_ready",
  // ── Plan phase events (v4 incremental plan building) ──
  /** Plan skills decision. */
  PLAN_SKILLS: "plan_skills",
  /** Plan workflow decision. */
  PLAN_WORKFLOW: "plan_workflow",
  /** Plan data schema decision. */
  PLAN_DATA_SCHEMA: "plan_data_schema",
  /** Plan API endpoints decision. */
  PLAN_API_ENDPOINTS: "plan_api_endpoints",
  /** Plan dashboard pages decision. */
  PLAN_DASHBOARD_PAGES: "plan_dashboard_pages",
  /** Plan dashboard prototype gate. */
  PLAN_DASHBOARD_PROTOTYPE: "plan_dashboard_prototype",
  /** Plan environment variables decision. */
  PLAN_ENV_VARS: "plan_env_vars",
  /** Plan sub-agents decision (multi-agent fleet definition; empty for single-agent). */
  PLAN_SUB_AGENTS: "plan_sub_agents",
  /** Plan memory authority decision (per-role tier/lane writers; empty for single-operator pipelines). */
  PLAN_MEMORY_AUTHORITY: "plan_memory_authority",
  /** All plan decisions emitted — plan is complete. */
  PLAN_COMPLETE: "plan_complete",
  // ── Checkpoint pause event (Think/Plan checkpoints) ──
  /** The Architect has paused to ask the user a clarifying question. */
  ASK_USER: "ask_user",
  // ── Reveal phase events (employee profile reveal) ──
  /** The Architect's first structured output: employee profile brief-back. */
  EMPLOYEE_REVEAL: "employee_reveal",
  /** Progressive reveal: one field arrives from the Architect. */
  REVEAL_FIELD: "reveal_field",
  /** Progressive reveal: all fields emitted — the composition is complete. */
  REVEAL_DONE: "reveal_done",
} as const;

// ─── Event payload types ─────────────────────────────────────────────────────

export interface FileWrittenPayload {
  path: string;
  tool: string;
}

export interface SkillCreatedPayload {
  skillId: string;
  path: string;
}

export interface BuildProgressPayload {
  completed: number;
  total: number | null;
  currentSkill: string | null;
}

export interface WorkspaceChangedPayload {
  action: "create" | "update" | "delete";
  path: string;
}

export interface BuildTaskUpdatedPayload {
  taskId: string;
  specialist: string;
  status: "pending" | "running" | "done" | "failed";
  files: string[];
  error?: string;
}

// ─── Think phase payloads ──────────────────────────────────────────────────

export type ThinkSubStep = "research" | "prd" | "trd";

export interface ThinkStepPayload {
  step: ThinkSubStep;
  status: "started" | "complete";
}

export interface ThinkResearchFindingPayload {
  title: string;
  summary: string;
  source?: string;
}

export type ThinkDocType = "research_brief" | "prd" | "trd";

export interface ThinkDocumentReadyPayload {
  docType: ThinkDocType;
  path: string;
}

// ─── Plan phase payloads ───────────────────────────────────────────────────

export type PlanSubStep = "skills" | "workflow" | "data" | "api" | "dashboard" | "envvars" | "complete";

export interface PlanSkillsPayload {
  skills: Array<{ id: string; name: string; description: string; dependencies: string[]; toolType?: string; envVars?: string[] }>;
}

export interface PlanWorkflowPayload {
  workflow: { steps: Array<{ skillId: string; parallel?: boolean }> };
}

export interface PlanDataSchemaPayload {
  dataSchema: { tables: Array<{ name: string; description: string; columns: Array<{ name: string; type: string; description: string }>; indexes?: string[] }> };
}

export interface PlanApiEndpointsPayload {
  apiEndpoints: Array<{ method: string; path: string; description: string; query?: string; responseShape?: string }>;
}

export interface PlanDashboardPagesPayload {
  dashboardPages: Array<{ path: string; title: string; description: string; components: Array<{ type: string; title: string; dataSource: string }> }>;
}

export interface PlanDashboardPrototypePayload {
  dashboardPrototype: {
    summary: string;
    primaryUsers: string[];
    workflows: Array<{
      id: string;
      name: string;
      steps: string[];
      requiredActions: string[];
      successCriteria: string[];
    }>;
    pages: Array<{
      path: string;
      title: string;
      purpose: string;
      supportsWorkflows: string[];
      requiredActions: string[];
      acceptanceCriteria: string[];
    }>;
    revisionPrompts: string[];
    approvalChecklist: string[];
  };
}

export interface PlanEnvVarsPayload {
  envVars: Array<{ key: string; label: string; description: string; required: boolean; inputType?: string; defaultValue?: string; group?: string }>;
}

// ─── Ask-user checkpoint payload ────────────────────────────────────────────

export type AskUserQuestionType = "text" | "select" | "multiselect" | "boolean";

export interface AskUserPayload {
  id: string;
  question: string;
  type: AskUserQuestionType;
  options?: string[];
}

// ─── Employee reveal payload ────────────────────────────────────────────────

export interface EmployeeRevealPayload {
  name: string;
  title: string;
  opening: string;
  what_i_heard: string[];
  what_i_will_own: string[];
  what_i_wont_do: string[];
  first_move: string;
  clarifying_question: string;
}

// ─── Progressive reveal field payload ───────────────────────────────────────

export type RevealFieldKey =
  | "name"
  | "title"
  | "opening"
  | "what_i_heard"
  | "what_i_will_own"
  | "what_i_wont_do"
  | "first_move"
  | "clarifying_question";

export interface RevealFieldPayload {
  key: RevealFieldKey;
  value: string | string[];
}

// ─── Editor file changed payload ────────────────────────────────────────────

export interface EditorFileChangedPayload {
  path: string;
}

// ─── Preview server detected payload ────────────────────────────────────────

export interface PreviewServerDetectedPayload {
  port: number;
}

// ─── Skill graph ready payload ───────────────────────────────────────────────

export interface SkillGraphReadyPayload {
  skillGraph: SkillGraphNode[];
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  agentRules: string[];
  toolConnectionHints: string[];
  toolConnections: AgentToolConnection[];
  triggerHints: string[];
  triggers: AgentTriggerDefinition[];
  channelHints: string[];
  improvements?: AgentImprovement[];
  content?: string;
}

// ─── Unified AG-UI state ─────────────────────────────────────────────────────

export interface AgentUIState {
  browser: BrowserWorkspaceState;
  taskPlan: TaskPlan | null;
  editorFiles: {
    active: EditorFile | null;
    recent: Array<{ path: string; language: string }>;
  };
  steps: AgentStep[];
  liveResponse: string;
}

export function createInitialAgentUIState(): AgentUIState {
  return {
    browser: createEmptyBrowserWorkspaceState(),
    taskPlan: null,
    editorFiles: { active: null, recent: [] },
    steps: [],
    liveResponse: "",
  };
}

// ─── Builder metadata ───────────────────────────────────────────────────────

export type BuilderDraftSaveStatus = "idle" | "saving" | "saved" | "error";

export interface BuilderMetadataState {
  draftAgentId: string | null;
  name: string;
  description: string;
  systemName: string | null;
  skillGraph: SkillGraphNode[] | null;
  workflow: WorkflowDefinition | null;
  agentRules: string[];
  toolConnectionHints: string[];
  toolConnections: AgentToolConnection[];
  triggerHints: string[];
  triggers: AgentTriggerDefinition[];
  channelHints: string[];
  improvements: AgentImprovement[];
  draftSaveStatus: BuilderDraftSaveStatus;
  lastSavedAt: string | null;
  lastSavedHash: string | null;
}

export function createInitialBuilderMetadataState(): BuilderMetadataState {
  return {
    draftAgentId: null,
    name: "",
    description: "",
    systemName: null,
    skillGraph: null,
    workflow: null,
    agentRules: [],
    toolConnectionHints: [],
    toolConnections: [],
    triggerHints: [],
    triggers: [],
    channelHints: [],
    improvements: [],
    draftSaveStatus: "idle",
    lastSavedAt: null,
    lastSavedHash: null,
  };
}

// ─── Co-pilot wizard event payloads ──────────────────────────────────────────

export interface WizardSetPhasePayload {
  phase: "purpose" | "skills" | "tools" | "triggers" | "review";
}

export interface WizardUpdateFieldsPayload {
  name?: string;
  description?: string;
  systemName?: string;
}

export interface WizardSetSkillsPayload {
  nodes: SkillGraphNode[];
  workflow: WorkflowDefinition | null;
  rules: string[];
  skillIds: string[];
}

export interface WizardConnectToolsPayload {
  toolIds: string[];
  toolConnections?: AgentToolConnection[];
}

export interface WizardSetTriggersPayload {
  triggerIds: string[];
  triggers?: AgentTriggerDefinition[];
}

export interface WizardSetRulesPayload {
  rules: string[];
}

export interface WizardSetChannelsPayload {
  channelIds: string[];
}
