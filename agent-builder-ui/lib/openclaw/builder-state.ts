/**
 * Builder state — managed by the create page, passed to TabChat as props.
 *
 * Tracks the architect's output (skill graph, workflow, rules) independently
 * of the chat messages. The create page owns this state and passes it down.
 */

import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { SkillGraphNode, WorkflowDefinition } from "./types";
import type { BuilderDraftSaveStatus } from "./ag-ui/types";
import type {
  AgentImprovement,
  AgentToolConnection,
  AgentTriggerDefinition,
} from "@/lib/agents/types";

export type ForgeSandboxStatus = "idle" | "provisioning" | "ready" | "failed";

export interface BuilderState {
  sessionId: string;
  name: string;
  description: string;
  skillGraph: SkillGraphNode[] | null;
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  agentRules: string[];
  toolConnectionHints: string[];
  toolConnections: AgentToolConnection[];
  triggerHints: string[];
  triggers: AgentTriggerDefinition[];
  channelHints: string[];
  improvements: AgentImprovement[];
  draftAgentId: string | null;
  draftSaveStatus: BuilderDraftSaveStatus;
  lastSavedAt: string | null;
  lastSavedHash: string | null;
  /** Forge sandbox — dedicated per-agent builder sandbox */
  forgeSandboxId: string | null;
  forgeSandboxStatus: ForgeSandboxStatus;
  forgeVncPort: number | null;
  forgeError: string | null;
}

export interface UseBuilderStateReturn {
  builderState: BuilderState;
  updateBuilderState: (partial: Partial<BuilderState>) => void;
  resetBuilderState: () => void;
  initializeFromAgent: (agent: {
    id?: string;
    name: string;
    description?: string;
    skillGraph?: SkillGraphNode[] | null;
    workflow?: WorkflowDefinition | null;
    agentRules?: string[];
    toolConnections?: AgentToolConnection[];
    triggers?: AgentTriggerDefinition[];
    improvements?: AgentImprovement[];
  }) => void;
}

function createInitialState(): BuilderState {
  return {
    sessionId: uuidv4(),
    name: "",
    description: "",
    skillGraph: null,
    workflow: null,
    systemName: null,
    agentRules: [],
    toolConnectionHints: [],
    toolConnections: [],
    triggerHints: [],
    triggers: [],
    channelHints: [],
    improvements: [],
    draftAgentId: null,
    draftSaveStatus: "idle",
    lastSavedAt: null,
    lastSavedHash: null,
    forgeSandboxId: null,
    forgeSandboxStatus: "idle",
    forgeVncPort: null,
    forgeError: null,
  };
}

export function useBuilderState(): UseBuilderStateReturn {
  const [state, setState] = useState<BuilderState>(createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const updateBuilderState = useCallback((partial: Partial<BuilderState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const resetBuilderState = useCallback(() => {
    setState(createInitialState());
  }, []);

  const initializeFromAgent = useCallback((agent: {
    id?: string;
    name: string;
    description?: string;
    skillGraph?: SkillGraphNode[] | null;
    workflow?: WorkflowDefinition | null;
    agentRules?: string[];
    toolConnections?: AgentToolConnection[];
    triggers?: AgentTriggerDefinition[];
    improvements?: AgentImprovement[];
    forgeSandboxId?: string | null;
  }) => {
    setState({
      sessionId: uuidv4(),
      name: agent.name,
      description: agent.description ?? "",
      skillGraph: agent.skillGraph ?? null,
      workflow: agent.workflow ?? null,
      systemName: agent.name,
      agentRules: agent.agentRules ?? [],
      toolConnectionHints: [],
      toolConnections: agent.toolConnections ?? [],
      triggerHints: [],
      triggers: agent.triggers ?? [],
      channelHints: [],
      improvements: agent.improvements ?? [],
      draftAgentId: agent.id ?? null,
      draftSaveStatus: "idle",
      lastSavedAt: null,
      lastSavedHash: null,
      forgeSandboxId: agent.forgeSandboxId ?? null,
      forgeSandboxStatus: agent.forgeSandboxId ? "ready" : "idle",
      forgeVncPort: null,
      forgeError: null,
    });
  }, []);

  return {
    builderState: state,
    updateBuilderState,
    resetBuilderState,
    initializeFromAgent,
  };
}
