export interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  isNew?: boolean;
  markdownUrl?: string;
  markdownContent?: string;
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
