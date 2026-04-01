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
  /** @deprecated Use AG-UI REASONING_* EventType instead. Kept for backward compatibility. */
  REASONING: "reasoning",
  // ── Workspace & build events (from tool execution via WebSocket) ──
  /** A file was written to the agent workspace via exec. */
  FILE_WRITTEN: "file_written",
  /** A SKILL.md file was created in skills/. */
  SKILL_CREATED: "skill_created",
  /** Build progress update — tracks how many skills have been written. */
  BUILD_PROGRESS: "build_progress",
  /** Any workspace file change (create/update/delete). */
  WORKSPACE_CHANGED: "workspace_changed",
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
