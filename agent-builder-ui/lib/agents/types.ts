export type AgentToolConnectionStatus =
  | "available"
  | "configured"
  | "missing_secret"
  | "unsupported";

export type AgentToolConnectionAuthKind =
  | "oauth"
  | "api_key"
  | "service_account"
  | "none";

export type AgentToolConnectionType = "mcp" | "api" | "cli";

export interface AgentToolResearchCredential {
  name: string;
  reason: string;
}

export interface AgentToolResearchAlternative {
  method: AgentToolConnectionType;
  summary: string;
  pros: string[];
  cons: string[];
}

export interface AgentToolResearchSource {
  title: string;
  url: string;
}

export interface AgentToolResearchPlan {
  toolName: string;
  recommendedMethod: AgentToolConnectionType;
  recommendedToolId?: string;
  recommendedPackage?: string;
  summary: string;
  rationale: string;
  requiredCredentials: AgentToolResearchCredential[];
  setupSteps: string[];
  integrationSteps: string[];
  validationSteps: string[];
  alternatives: AgentToolResearchAlternative[];
  sources: AgentToolResearchSource[];
}

export interface AgentToolConnection {
  toolId: string;
  name: string;
  description: string;
  status: AgentToolConnectionStatus;
  authKind: AgentToolConnectionAuthKind;
  connectorType: AgentToolConnectionType;
  configSummary: string[];
  researchPlan?: AgentToolResearchPlan;
}

export type AgentRuntimeInputSource = "architect_requirement" | "skill_requirement";

export interface AgentRuntimeInput {
  key: string;
  label: string;
  description: string;
  required: boolean;
  source: AgentRuntimeInputSource;
  value: string;
}

export type AgentTriggerKind = "manual" | "schedule" | "webhook";
export type AgentTriggerStatus = "supported" | "unsupported";

export interface AgentTriggerDefinition {
  id: string;
  title: string;
  kind: AgentTriggerKind;
  status: AgentTriggerStatus;
  description: string;
  schedule?: string;
  webhookPublicId?: string;
  webhookSecretLastFour?: string;
  webhookSecretIssuedAt?: string;
  webhookLastDeliveryAt?: string;
  webhookLastDeliveryStatus?: "delivered" | "failed";
}

// ─── Channels ────────────────────────────────────────────────────────────────

export type AgentChannelKind = "telegram" | "slack" | "discord";
export type AgentChannelStatus = "planned" | "configured" | "unsupported";

export interface AgentChannelSelection {
  kind: AgentChannelKind;
  status: AgentChannelStatus;
  label: string;
  description: string;
}

// ─── Improvements ────────────────────────────────────────────────────────────

export type AgentImprovementKind = "tool_connection" | "trigger" | "workflow";
export type AgentImprovementStatus = "pending" | "accepted" | "dismissed";

export interface AgentImprovement {
  id: string;
  kind: AgentImprovementKind;
  status: AgentImprovementStatus;
  scope: "builder";
  title: string;
  summary: string;
  rationale: string;
  targetId?: string;
}
