import type {
  AgentToolConnection,
  AgentToolConnectionType,
  AgentToolResearchPlan,
  AgentTriggerDefinition,
} from "@/lib/agents/types";
import type { SkillAvailabilityStatus } from "@/lib/skills/skill-registry";

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  status?: AgentToolConnection["status"];
  authKind?: AgentToolConnection["authKind"];
  connectorType?: AgentToolConnectionType;
  configSummary?: string[];
  researchPlan?: AgentToolResearchPlan;
}

export type ToolConnectionDraft = AgentToolConnection;
export type ToolCredentialDrafts = Record<string, Record<string, string>>;
export type TriggerSelection = AgentTriggerDefinition;

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  isNew?: boolean;
  markdownUrl?: string;
  markdownContent?: string;
  availabilityStatus?: SkillAvailabilityStatus;
  availabilityReason?: string;
  matchedSkillId?: string;
}

export type TriggerCategoryId =
  | "user-initiated"
  | "time-based"
  | "data-change"
  | "event-webhook"
  | "conditional"
  | "agent-to-agent"
  | "compliance"
  | "system-infra";

export interface TriggerCard {
  id: string;
  title: string;
  description: string;
  code: string;
}

export interface TriggerCategory {
  id: TriggerCategoryId;
  label: string;
  count: number;
  color: string; // left-border accent color
  triggers: TriggerCard[];
}

export interface ConfigureStepProps {
  agentName: string;
  onContinue: () => void;
  onBack: () => void;
  onCancel: () => void;
  onSkip?: () => void;
  currentStep: number;
  totalSteps: number;
}
