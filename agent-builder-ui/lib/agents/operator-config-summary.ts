import type {
  AgentRuntimeInput,
  AgentToolConnection,
  AgentToolResearchSource,
  AgentToolConnectionStatus,
  AgentTriggerDefinition,
  AgentTriggerStatus,
} from "./types";
import type { SavedAgent } from "@/hooks/use-agents-store";
import { isRuntimeInputFilled } from "./runtime-inputs";

export interface ReviewToolItem {
  id: string;
  name: string;
  description: string;
  status: AgentToolConnectionStatus;
  statusLabel: string;
  detail: string;
  planNotes: string[];
  sources: AgentToolResearchSource[];
}

export interface ReviewTriggerItem {
  id: string;
  text: string;
  kind: AgentTriggerDefinition["kind"];
  status: AgentTriggerStatus;
  statusLabel: string;
  detail: string;
}

export interface DeployConfigSummary {
  toolSummary: string;
  runtimeInputSummary: string;
  triggerSummary: string;
  readinessLabel: string;
}

export interface ReviewRuntimeInputItem {
  key: string;
  label: string;
  required: boolean;
  statusLabel: string;
  detail: string;
}

function toolStatusLabel(status: AgentToolConnectionStatus): string {
  switch (status) {
    case "configured":
      return "Configured";
    case "missing_secret":
      return "Needs credentials";
    case "unsupported":
      return "Manual setup";
    default:
      return "Available";
  }
}

function triggerStatusLabel(trigger: AgentTriggerDefinition): string {
  const prefix = trigger.status === "supported" ? "Supported" : "Unsupported";
  return `${prefix} ${trigger.kind}`;
}

function firstDetail(values: string[] | undefined, fallback: string): string {
  const value = values?.find((entry) => entry.trim().length > 0);
  return value ?? fallback;
}

export function buildReviewToolItems(
  toolConnections: AgentToolConnection[] | undefined,
): ReviewToolItem[] {
  return (toolConnections ?? []).map((tool) => ({
    id: tool.toolId,
    name: tool.name,
    description: tool.description,
    status: tool.status,
    statusLabel: toolStatusLabel(tool.status),
    detail: firstDetail(
      tool.configSummary,
      `${tool.connectorType.toUpperCase()} · ${tool.authKind.replace("_", " ")}`,
    ),
    planNotes: buildResearchPlanNotes(tool),
    sources: tool.researchPlan?.sources ?? [],
  }));
}

function buildResearchPlanNotes(tool: AgentToolConnection): string[] {
  const plan = tool.researchPlan;
  if (!plan) return [];

  const notes: string[] = [];
  notes.push(`Recommended path: ${plan.recommendedMethod.toUpperCase()}`);

  if (plan.recommendedPackage) {
    notes.push(`Package or command: ${plan.recommendedPackage}`);
  }

  for (const step of plan.setupSteps.slice(0, 2)) {
    notes.push(`Setup: ${step}`);
  }

  for (const step of plan.validationSteps.slice(0, 2)) {
    notes.push(`Validate: ${step}`);
  }

  return notes;
}

export function buildReviewTriggerItems(
  triggers: AgentTriggerDefinition[] | undefined,
): ReviewTriggerItem[] {
  return (triggers ?? []).map((trigger) => ({
    id: trigger.id,
    text: trigger.title || trigger.id,
    kind: trigger.kind,
    status: trigger.status,
    statusLabel: triggerStatusLabel(trigger),
    detail: trigger.schedule?.trim() || trigger.description,
  }));
}

export function buildReviewRuntimeInputItems(
  runtimeInputs: AgentRuntimeInput[] | undefined,
): ReviewRuntimeInputItem[] {
  return (runtimeInputs ?? []).map((input) => ({
    key: input.key,
    label: input.label || input.key,
    required: input.required,
    statusLabel: isRuntimeInputFilled(input) ? "Provided" : "Missing value",
    detail: input.description,
  }));
}

function countByStatus<T extends string>(
  values: T[],
): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}`;
}

export function buildDeployConfigSummary(
  agent: Pick<SavedAgent, "toolConnections" | "runtimeInputs" | "triggers">,
): DeployConfigSummary {
  const toolCounts = countByStatus((agent.toolConnections ?? []).map((tool) => tool.status));
  const triggerCounts = countByStatus((agent.triggers ?? []).map((trigger) => trigger.status));
  const runtimeInputs = agent.runtimeInputs ?? [];
  const missingRuntimeInputs = runtimeInputs.filter((input) => input.required && !isRuntimeInputFilled(input)).length;
  const providedRuntimeInputs = runtimeInputs.length - missingRuntimeInputs;

  const toolSummaryParts: string[] = [];
  if ((toolCounts.get("configured") ?? 0) > 0) {
    toolSummaryParts.push(formatCount(toolCounts.get("configured") ?? 0, "configured"));
  }
  if ((toolCounts.get("missing_secret") ?? 0) > 0) {
    toolSummaryParts.push(
      formatCount(toolCounts.get("missing_secret") ?? 0, "needs credentials"),
    );
  }
  if ((toolCounts.get("unsupported") ?? 0) > 0) {
    toolSummaryParts.push(formatCount(toolCounts.get("unsupported") ?? 0, "manual setup"));
  }
  if ((toolCounts.get("available") ?? 0) > 0) {
    toolSummaryParts.push(formatCount(toolCounts.get("available") ?? 0, "available"));
  }

  const triggerSummaryParts: string[] = [];
  if ((triggerCounts.get("supported") ?? 0) > 0) {
    triggerSummaryParts.push(formatCount(triggerCounts.get("supported") ?? 0, "supported"));
  }
  if ((triggerCounts.get("unsupported") ?? 0) > 0) {
    triggerSummaryParts.push(formatCount(triggerCounts.get("unsupported") ?? 0, "unsupported"));
  }

  const runtimeInputSummaryParts: string[] = [];
  if (providedRuntimeInputs > 0) {
    runtimeInputSummaryParts.push(formatCount(providedRuntimeInputs, "runtime input ready"));
  }
  if (missingRuntimeInputs > 0) {
    runtimeInputSummaryParts.push(formatCount(missingRuntimeInputs, "missing runtime input"));
  }

  const missingSecrets = (toolCounts.get("missing_secret") ?? 0) > 0;
  const unsupportedTools = (toolCounts.get("unsupported") ?? 0) > 0;
  const unsupportedTriggers = (triggerCounts.get("unsupported") ?? 0) > 0;
  const runtimeInputsMissing = missingRuntimeInputs > 0;

  let readinessLabel = "Ready to deploy";
  if (missingSecrets || unsupportedTools || unsupportedTriggers || runtimeInputsMissing) {
    readinessLabel = "Action needed before deploy";
  }

  return {
    toolSummary: toolSummaryParts.join(", ") || "No tools configured",
    runtimeInputSummary: runtimeInputSummaryParts.join(", ") || "No runtime inputs required",
    triggerSummary: triggerSummaryParts.join(", ") || "Manual only",
    readinessLabel,
  };
}
