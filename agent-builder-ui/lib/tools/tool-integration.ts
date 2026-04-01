import { v4 as uuidv4 } from "uuid";

import type {
  AgentToolConnection,
  AgentToolResearchAlternative,
  AgentToolResearchCredential,
  AgentToolResearchPlan,
  AgentToolResearchSource,
} from "@/lib/agents/types";
import { sendToArchitectStreaming } from "@/lib/openclaw/api";

type UnknownRecord = Record<string, unknown>;

export type ToolIntegrationMethod = "mcp" | "api" | "cli";

export interface ToolResearchCredential {
  name: string;
  reason: string;
}

export interface ToolResearchAlternative {
  method: ToolIntegrationMethod;
  summary: string;
  pros: string[];
  cons: string[];
}

export interface ToolResearchSource {
  title: string;
  url: string;
}

export interface ToolResearchResult {
  type: "tool_recommendation";
  toolName: string;
  recommendedMethod: ToolIntegrationMethod;
  recommendedToolId?: string;
  recommendedPackage?: string;
  summary: string;
  rationale: string;
  requiredCredentials: ToolResearchCredential[];
  setupSteps: string[];
  integrationSteps: string[];
  validationSteps: string[];
  alternatives: ToolResearchAlternative[];
  sources: ToolResearchSource[];
}

function normalizePlanCredentials(
  value: AgentToolResearchPlan["requiredCredentials"] | ToolResearchCredential[],
): AgentToolResearchCredential[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      name: typeof item.name === "string" ? item.name.trim() : "",
      reason: typeof item.reason === "string" ? item.reason.trim() : "",
    }))
    .filter((item) => item.name.length > 0);
}

function normalizePlanAlternatives(
  value: AgentToolResearchPlan["alternatives"] | ToolResearchAlternative[],
): AgentToolResearchAlternative[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      method: normalizeMethod(item.method),
      summary: typeof item.summary === "string" ? item.summary.trim() : "",
      pros: normalizeStringArray(item.pros),
      cons: normalizeStringArray(item.cons),
    }))
    .filter((item) => item.summary.length > 0);
}

function normalizePlanSources(
  value: AgentToolResearchPlan["sources"] | ToolResearchSource[],
): AgentToolResearchSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim() : "",
      url: typeof item.url === "string" ? item.url.trim() : "",
    }))
    .filter((item) => item.title.length > 0 && item.url.length > 0);
}

export function buildToolResearchPlan(
  result: ToolResearchResult,
  fallbackToolName?: string,
): AgentToolResearchPlan {
  return {
    toolName: result.toolName || fallbackToolName || "",
    recommendedMethod: normalizeMethod(result.recommendedMethod),
    recommendedToolId: result.recommendedToolId?.trim() || undefined,
    recommendedPackage: result.recommendedPackage?.trim() || undefined,
    summary: result.summary.trim(),
    rationale: result.rationale.trim(),
    requiredCredentials: normalizePlanCredentials(result.requiredCredentials),
    setupSteps: normalizeStringArray(result.setupSteps),
    integrationSteps: normalizeStringArray(result.integrationSteps),
    validationSteps: normalizeStringArray(result.validationSteps),
    alternatives: normalizePlanAlternatives(result.alternatives),
    sources: normalizePlanSources(result.sources),
  };
}

export function buildToolResearchResultFromPlan(
  plan: AgentToolResearchPlan | undefined,
  fallbackToolName?: string,
): ToolResearchResult | null {
  if (!plan) {
    return null;
  }

  return {
    type: "tool_recommendation",
    toolName: plan.toolName || fallbackToolName || "",
    recommendedMethod: normalizeMethod(plan.recommendedMethod),
    recommendedToolId: plan.recommendedToolId?.trim() || undefined,
    recommendedPackage: plan.recommendedPackage?.trim() || undefined,
    summary: plan.summary.trim(),
    rationale: plan.rationale.trim(),
    requiredCredentials: normalizePlanCredentials(plan.requiredCredentials),
    setupSteps: normalizeStringArray(plan.setupSteps),
    integrationSteps: normalizeStringArray(plan.integrationSteps),
    validationSteps: normalizeStringArray(plan.validationSteps),
    alternatives: normalizePlanAlternatives(plan.alternatives),
    sources: normalizePlanSources(plan.sources),
  };
}

export interface CredentialSummary {
  toolId: string;
  hasCredentials: boolean;
  createdAt: string;
}

export interface ToolResearchCallbacks {
  onStatus?: (phase: string, message: string) => void;
}

export interface ToolResearchRequest {
  toolName: string;
  useCase?: string;
  supportedToolsContext?: string;
  sessionId?: string;
}

function normalizeMethod(value: unknown): ToolIntegrationMethod {
  return value === "mcp" || value === "cli" ? value : "api";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function normalizeCredentials(value: unknown): ToolResearchCredential[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is UnknownRecord => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      reason: typeof item.reason === "string" ? item.reason : "",
    }))
    .filter((item) => item.name.length > 0);
}

function normalizeAlternatives(value: unknown): ToolResearchAlternative[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is UnknownRecord => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => ({
      method: normalizeMethod(item.method),
      summary: typeof item.summary === "string" ? item.summary : "",
      pros: normalizeStringArray(item.pros),
      cons: normalizeStringArray(item.cons),
    }))
    .filter((item) => item.summary.length > 0);
}

function normalizeSources(value: unknown): ToolResearchSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is UnknownRecord => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      url: typeof item.url === "string" ? item.url : "",
    }))
    .filter((item) => item.title.length > 0 && item.url.length > 0);
}

export function normalizeToolResearchResponse(raw: UnknownRecord): ToolResearchResult {
  return {
    type: "tool_recommendation",
    toolName: typeof raw.tool_name === "string" ? raw.tool_name : "",
    recommendedMethod: normalizeMethod(raw.recommended_method),
    recommendedToolId:
      typeof raw.recommended_tool_id === "string" && raw.recommended_tool_id.trim()
        ? raw.recommended_tool_id
        : undefined,
    recommendedPackage:
      typeof raw.recommended_package === "string" && raw.recommended_package.trim()
        ? raw.recommended_package
        : undefined,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    rationale: typeof raw.rationale === "string" ? raw.rationale : "",
    requiredCredentials: normalizeCredentials(raw.required_credentials),
    setupSteps: normalizeStringArray(raw.setup_steps),
    integrationSteps: normalizeStringArray(raw.integration_steps),
    validationSteps: normalizeStringArray(raw.validation_steps),
    alternatives: normalizeAlternatives(raw.alternatives),
    sources: normalizeSources(raw.sources),
  };
}

export function buildToolResearchPrompt({
  toolName,
  useCase,
  supportedToolsContext,
}: ToolResearchRequest): string {
  return `[INSTRUCTION]
You are the OpenClaw architect agent helping an operator integrate external tools into an AI agent.

Your job:
1. Decide the best integration method for the requested tool: "mcp", "api", or "cli".
2. Preference order is CLI first, then MCP, then direct API, but only when that method is actually a good fit.
3. Prefer CLI when the tool is fundamentally local, operator-driven, or the official CLI is the most stable integration surface.
4. Prefer MCP when there is a credible maintained MCP server and it fits agent tool-call workflows better than a CLI bridge.
5. Prefer direct API integration when neither CLI nor MCP is a strong fit, or when a custom wrapper is the safer path.
6. Be explicit about whether the current product can support one-click setup now.
7. Include concrete setup, agent integration, and validation steps.
8. Return ONLY valid JSON matching this shape:
{
  "type": "tool_recommendation",
  "tool_name": "...",
  "recommended_method": "mcp" | "api" | "cli",
  "recommended_tool_id": "existing-registry-tool-id or null",
  "recommended_package": "npm package, CLI command, or API SDK name",
  "summary": "...",
  "rationale": "...",
  "required_credentials": [{ "name": "...", "reason": "..." }],
  "setup_steps": ["..."],
  "integration_steps": ["..."],
  "validation_steps": ["..."],
  "alternatives": [
    { "method": "api", "summary": "...", "pros": ["..."], "cons": ["..."] }
  ],
  "sources": [{ "title": "...", "url": "https://..." }]
}
[/INSTRUCTION]

Tool to research: ${toolName}
${useCase ? `Use case: ${useCase}` : ""}
${supportedToolsContext ? `Current one-click supported tools:\n${supportedToolsContext}` : ""}
`;
}

export async function researchToolIntegration(
  request: ToolResearchRequest,
  callbacks?: ToolResearchCallbacks,
): Promise<ToolResearchResult> {
  const response = await sendToArchitectStreaming(
    request.sessionId ?? uuidv4(),
    buildToolResearchPrompt(request),
    callbacks,
  );

  if (response.type === "tool_recommendation") {
    return normalizeToolResearchResponse(response as unknown as UnknownRecord);
  }

  throw new Error(
    response.content ||
      response.error ||
      "The architect did not return a structured tool recommendation.",
  );
}

function withStatusSummary(
  connection: AgentToolConnection,
  status: AgentToolConnection["status"],
): AgentToolConnection {
  const summary = connection.configSummary.filter(Boolean);
  const withoutCredentialStatus = summary.filter(
    (item) => item !== "Credentials stored securely" && item !== "Credentials still required",
  );

  if (status === "configured") {
    return {
      ...connection,
      status,
      configSummary: [...withoutCredentialStatus, "Credentials stored securely"],
    };
  }

  if (status === "missing_secret") {
    return {
      ...connection,
      status,
      configSummary: [...withoutCredentialStatus, "Credentials still required"],
    };
  }

  return {
    ...connection,
    status,
  };
}

export function reconcileToolConnections(
  connections: AgentToolConnection[],
  summaries: CredentialSummary[],
  options?: { credentialBackedToolIds?: Set<string> },
): AgentToolConnection[] {
  const credentialBackedToolIds = options?.credentialBackedToolIds ?? new Set<string>();
  const summaryByTool = new Map(
    summaries
      .filter((summary) => summary.hasCredentials)
      .map((summary) => [summary.toolId, summary]),
  );

  return connections.map((connection) => {
    if (!credentialBackedToolIds.has(connection.toolId) || connection.status === "unsupported") {
      return connection;
    }

    if (summaryByTool.has(connection.toolId)) {
      return withStatusSummary(connection, "configured");
    }

    if (connection.status === "available") {
      return connection;
    }

    return withStatusSummary(connection, "missing_secret");
  });
}

export function finalizeCredentialBackedToolConnections(
  connections: AgentToolConnection[],
  commitResults: Record<string, boolean>,
  options?: { credentialBackedToolIds?: Set<string> },
): AgentToolConnection[] {
  const credentialBackedToolIds = options?.credentialBackedToolIds ?? new Set<string>();

  return connections.map((connection) => {
    if (!credentialBackedToolIds.has(connection.toolId) || connection.status === "unsupported") {
      return connection;
    }

    if (commitResults[connection.toolId] === true) {
      return withStatusSummary(connection, "configured");
    }

    if (commitResults[connection.toolId] === false) {
      return withStatusSummary(connection, "missing_secret");
    }

    return connection;
  });
}
