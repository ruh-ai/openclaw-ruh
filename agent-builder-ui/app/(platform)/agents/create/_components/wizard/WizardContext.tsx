"use client";

import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react";
import type { AgentTemplate, ToneOption } from "../../_config/wizard-templates";
import type { SkillGraphNode, WorkflowDefinition } from "@/lib/openclaw/types";

// ─── State ────────────────────────────────────────────────────────────────────

export interface WizardState {
  currentPhase: 0 | 1 | 2 | 3 | 4;
  templateId: string | null;
  // Phase 1: Purpose
  name: string;
  description: string;
  // Phase 2: Skills (AI-generated)
  generatedNodes: SkillGraphNode[];
  selectedSkillIds: string[];
  generatedWorkflow: WorkflowDefinition | null;
  generatedRules: string[];
  builtSkillIds: string[];
  // Phase 3: Tools
  connectedToolIds: string[];
  // Phase 4: Behavior
  tone: ToneOption;
  customToneDescription: string;
  primaryTriggerIds: string[];
  rules: string[];
}

const INITIAL_STATE: WizardState = {
  currentPhase: 0,
  templateId: null,
  name: "",
  description: "",
  generatedNodes: [],
  selectedSkillIds: [],
  generatedWorkflow: null,
  generatedRules: [],
  builtSkillIds: [],
  connectedToolIds: [],
  tone: "professional",
  customToneDescription: "",
  primaryTriggerIds: [],
  rules: [],
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type WizardAction =
  | { type: "SET_PHASE"; phase: WizardState["currentPhase"] }
  | { type: "APPLY_TEMPLATE"; template: AgentTemplate }
  | { type: "CLEAR_TEMPLATE" }
  | { type: "UPDATE_PURPOSE"; name: string; description: string }
  | { type: "SET_GENERATED_SKILLS"; nodes: SkillGraphNode[]; workflow: WorkflowDefinition | null; rules: string[] }
  | { type: "UPDATE_SKILLS"; skillIds: string[] }
  | { type: "MARK_SKILLS_BUILT"; builtSkills: Array<{ skillId: string; skill_md: string }> }
  | { type: "UPDATE_TOOLS"; toolIds: string[] }
  | { type: "UPDATE_BEHAVIOR"; patch: Partial<Pick<WizardState, "tone" | "customToneDescription" | "primaryTriggerIds" | "rules">> }
  | { type: "RESET" };

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_PHASE":
      return { ...state, currentPhase: action.phase };
    case "APPLY_TEMPLATE":
      return {
        ...state,
        templateId: action.template.id,
        name: action.template.name,
        description: action.template.description,
        selectedSkillIds: [...action.template.skills],
        connectedToolIds: [...action.template.tools],
        tone: action.template.tone,
        customToneDescription: "",
        primaryTriggerIds: [...action.template.triggerIds],
        rules: [...action.template.rules],
      };
    case "CLEAR_TEMPLATE":
      return { ...INITIAL_STATE, currentPhase: state.currentPhase };
    case "UPDATE_PURPOSE":
      return { ...state, name: action.name, description: action.description };
    case "SET_GENERATED_SKILLS":
      return {
        ...state,
        generatedNodes: action.nodes,
        selectedSkillIds: action.nodes.map((n) => n.skill_id),
        generatedWorkflow: action.workflow,
        generatedRules: action.rules,
        // Pre-fill behavior rules from architect if empty
        rules: state.rules.length === 0 ? action.rules : state.rules,
      };
    case "UPDATE_SKILLS":
      return { ...state, selectedSkillIds: action.skillIds };
    case "MARK_SKILLS_BUILT": {
      const builtMap = new Map(action.builtSkills.map((s) => [s.skillId, s.skill_md]));
      return {
        ...state,
        builtSkillIds: [...new Set([...state.builtSkillIds, ...builtMap.keys()])],
        generatedNodes: state.generatedNodes.map((node) => {
          const md = builtMap.get(node.skill_id);
          return md ? { ...node, skill_md: md } : node;
        }),
      };
    }
    case "UPDATE_TOOLS":
      return { ...state, connectedToolIds: action.toolIds };
    case "UPDATE_BEHAVIOR":
      return { ...state, ...action.patch };
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
}

// ─── Output shape (matches handleComplete's expectations) ─────────────────────

export interface WizardOutput {
  name: string;
  avatar: string;
  description: string;
  skills: string[];
  triggerLabel: string;
  agentRules: string[];
  skillGraph?: SkillGraphNode[];
  workflow?: WorkflowDefinition | null;
  builtSkillIds?: string[];
  status: "active" | "draft";
}

function deriveAvatar(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("slack")) return "💬";
  if (n.includes("github") || n.includes("code") || n.includes("devops")) return "💻";
  if (n.includes("data") || n.includes("pipeline") || n.includes("ingest")) return "📊";
  if (n.includes("email") || n.includes("mail") || n.includes("support")) return "📧";
  if (n.includes("report") || n.includes("finance")) return "💰";
  if (n.includes("content") || n.includes("write")) return "✍️";
  return "🤖";
}

const TONE_RULES: Record<ToneOption, string> = {
  professional: "Maintain a professional, concise tone",
  friendly: "Use a warm, approachable, and conversational tone",
  technical: "Use precise technical language with code examples when appropriate",
  custom: "",
};

// ─── Context ──────────────────────────────────────────────────────────────────

interface WizardContextValue {
  state: WizardState;
  setPhase: (phase: WizardState["currentPhase"]) => void;
  nextPhase: () => void;
  prevPhase: () => void;
  applyTemplate: (template: AgentTemplate) => void;
  clearTemplate: () => void;
  updatePurpose: (name: string, description: string) => void;
  setGeneratedSkills: (nodes: SkillGraphNode[], workflow: WorkflowDefinition | null, rules: string[]) => void;
  updateSkills: (skillIds: string[]) => void;
  markSkillsBuilt: (builtSkills: Array<{ skillId: string; skill_md: string }>) => void;
  updateTools: (toolIds: string[]) => void;
  updateBehavior: (patch: Partial<Pick<WizardState, "tone" | "customToneDescription" | "primaryTriggerIds" | "rules">>) => void;
  reset: () => void;
  toOutput: () => WizardOutput;
}

const WizardCtx = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardCtx);
  if (!ctx) throw new Error("useWizard must be used inside WizardProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const setPhase = useCallback((phase: WizardState["currentPhase"]) => {
    dispatch({ type: "SET_PHASE", phase });
  }, []);

  const nextPhase = useCallback(() => {
    dispatch({ type: "SET_PHASE", phase: Math.min(state.currentPhase + 1, 4) as WizardState["currentPhase"] });
  }, [state.currentPhase]);

  const prevPhase = useCallback(() => {
    dispatch({ type: "SET_PHASE", phase: Math.max(state.currentPhase - 1, 0) as WizardState["currentPhase"] });
  }, [state.currentPhase]);

  const applyTemplate = useCallback((template: AgentTemplate) => {
    dispatch({ type: "APPLY_TEMPLATE", template });
  }, []);

  const clearTemplate = useCallback(() => {
    dispatch({ type: "CLEAR_TEMPLATE" });
  }, []);

  const updatePurpose = useCallback((name: string, description: string) => {
    dispatch({ type: "UPDATE_PURPOSE", name, description });
  }, []);

  const setGeneratedSkills = useCallback((nodes: SkillGraphNode[], workflow: WorkflowDefinition | null, rules: string[]) => {
    dispatch({ type: "SET_GENERATED_SKILLS", nodes, workflow, rules });
  }, []);

  const updateSkills = useCallback((skillIds: string[]) => {
    dispatch({ type: "UPDATE_SKILLS", skillIds });
  }, []);

  const markSkillsBuilt = useCallback((builtSkills: Array<{ skillId: string; skill_md: string }>) => {
    dispatch({ type: "MARK_SKILLS_BUILT", builtSkills });
  }, []);

  const updateTools = useCallback((toolIds: string[]) => {
    dispatch({ type: "UPDATE_TOOLS", toolIds });
  }, []);

  const updateBehavior = useCallback((patch: Partial<Pick<WizardState, "tone" | "customToneDescription" | "primaryTriggerIds" | "rules">>) => {
    dispatch({ type: "UPDATE_BEHAVIOR", patch });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const toOutput = useCallback((): WizardOutput => {
    const toneRule = state.tone === "custom"
      ? state.customToneDescription.trim() ? state.customToneDescription.trim() : null
      : TONE_RULES[state.tone];
    const allRules = toneRule ? [toneRule, ...state.rules] : [...state.rules];

    // Filter generated nodes to only include selected skills
    const selectedNodes = state.generatedNodes.filter((n) =>
      state.selectedSkillIds.includes(n.skill_id)
    );

    return {
      name: state.name || "New Agent",
      avatar: deriveAvatar(state.name),
      description: state.description || "AI agent",
      skills: state.selectedSkillIds,
      triggerLabel: state.primaryTriggerIds.length > 0
        ? state.primaryTriggerIds.join(", ")
        : "Manual trigger",
      agentRules: allRules,
      skillGraph: selectedNodes.length > 0 ? selectedNodes : undefined,
      workflow: state.generatedWorkflow,
      builtSkillIds: state.builtSkillIds.length > 0 ? state.builtSkillIds : undefined,
      status: "active",
    };
  }, [state]);

  return (
    <WizardCtx.Provider value={{
      state,
      setPhase,
      nextPhase,
      prevPhase,
      applyTemplate,
      clearTemplate,
      updatePurpose,
      setGeneratedSkills,
      updateSkills,
      markSkillsBuilt,
      updateTools,
      updateBehavior,
      reset,
      toOutput,
    }}>
      {children}
    </WizardCtx.Provider>
  );
}
