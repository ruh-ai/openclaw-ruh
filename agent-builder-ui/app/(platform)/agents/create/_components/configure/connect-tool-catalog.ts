"use client";

import type { SkillGraphNode } from "@/lib/openclaw/types";
import type { ToolResearchResult } from "@/lib/tools/tool-integration";
import {
  getToolDefinition,
  listSupportedTools,
  toolSupportsDirectConnection,
} from "../../_config/mcp-tool-registry";
import type { ToolConnectionDraft, ToolItem } from "./types";

const RESEARCH_TOOL_SEEDS: { keywords: string[]; tool: ToolItem }[] = [
  {
    keywords: ["google ads", "google_ads", "paid media", "adwords"],
    tool: {
      id: "google-ads",
      name: "Google Ads",
      description: "Inspect campaigns, keywords, budgets, and performance signals.",
      icon: "google",
      connected: false,
      status: "available",
      authKind: "oauth",
      connectorType: "mcp",
      configSummary: [],
    },
  },
  {
    keywords: ["slack", "slack_bot", "slack notification", "slack digest"],
    tool: {
      id: "slack",
      name: "Slack",
      description: "Send messages, notifications, and digests to Slack channels.",
      icon: "slack",
      connected: false,
      status: "available",
      authKind: "api_key",
      connectorType: "mcp",
      configSummary: [],
    },
  },
  {
    keywords: ["jira", "ticket", "sprint", "atlassian"],
    tool: {
      id: "jira",
      name: "Jira",
      description: "Research the best integration path before saving a manual plan.",
      icon: "jira",
      connected: false,
      status: "unsupported",
      authKind: "none",
      connectorType: "api",
      configSummary: ["Research required before save"],
    },
  },
  {
    keywords: ["notion"],
    tool: {
      id: "notion",
      name: "Notion",
      description: "Research the best integration path before saving a manual plan.",
      icon: "notion",
      connected: false,
      status: "unsupported",
      authKind: "none",
      connectorType: "api",
      configSummary: ["Research required before save"],
    },
  },
  {
    keywords: ["linear"],
    tool: {
      id: "linear",
      name: "Linear",
      description: "Research the best integration path before saving a manual plan.",
      icon: "linear",
      connected: false,
      status: "unsupported",
      authKind: "none",
      connectorType: "api",
      configSummary: ["Research required before save"],
    },
  },
  {
    keywords: ["zoho"],
    tool: {
      id: "zoho-crm",
      name: "Zoho CRM",
      description: "Research the best integration path before saving a manual plan.",
      icon: "zoho",
      connected: false,
      status: "unsupported",
      authKind: "none",
      connectorType: "api",
      configSummary: ["Research required before save"],
    },
  },
];

function buildSearchText(
  nodes?: SkillGraphNode[] | null,
  agentUseCase?: string,
): string {
  const graphText = (nodes ?? [])
    .map((node) => `${node.skill_id} ${node.name} ${node.description || ""}`)
    .join(" ");
  return `${graphText} ${agentUseCase ?? ""}`.toLowerCase();
}

/**
 * Infer tools from skill graph nodes that have explicit tool_type/tool_id.
 * Returns tools whose type was set by the architect during skill generation.
 */
export function inferToolsFromSkillGraph(
  nodes?: SkillGraphNode[] | null,
): ToolItem[] {
  if (!nodes) return [];

  const seen = new Set<string>();
  const tools: ToolItem[] = [];

  for (const node of nodes) {
    if (!node.tool_type) continue;

    const explicitToolId = node.tool_id?.trim();
    const externalApi = node.external_api?.trim();
    const toolId = explicitToolId || externalApi?.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!toolId) continue;
    if (seen.has(toolId)) continue;
    seen.add(toolId);

    const registryDef = getToolDefinition(toolId);
    if (registryDef) {
      tools.push({
        id: registryDef.id,
        name: registryDef.name,
        description: registryDef.description,
        icon: registryDef.icon,
        connected: false,
        status: "available",
        authKind: registryDef.authKind,
        connectorType: "mcp",
        configSummary: [],
      });
    } else {
      tools.push({
        id: toolId,
        name:
          externalApi
          || toolId.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        description:
          node.description
          || (externalApi
            ? `${externalApi} integration via ${node.tool_type}`
            : `Integration via ${node.tool_type}`),
        icon: "tool",
        connected: false,
        status: node.tool_type === "mcp" ? "available" : "unsupported",
        authKind: "none",
        connectorType: node.tool_type,
        configSummary: node.tool_type !== "mcp" ? [`Requires ${node.tool_type.toUpperCase()} integration`] : [],
      });
    }
  }

  return tools;
}

export function inferFocusedResearchTool(
  nodes?: SkillGraphNode[] | null,
  agentUseCase?: string,
): ToolItem | null {
  // First try explicit tool_type from skill graph
  const explicitTools = inferToolsFromSkillGraph(nodes);
  if (explicitTools.length > 0) {
    return explicitTools[0];
  }

  // Fallback to keyword-based inference
  const allText = buildSearchText(nodes, agentUseCase);
  if (!allText.trim()) {
    return null;
  }

  const detected = RESEARCH_TOOL_SEEDS
    .filter(({ keywords }) => keywords.some((keyword) => allText.includes(keyword)))
    .map(({ tool }) => tool);

  return detected[0] ? { ...detected[0] } : null;
}

/**
 * Infer ALL matching tools from keyword seeds (not just the first).
 * Used by the tool catalog to show all relevant tools for the agent.
 */
export function inferAllResearchTools(
  nodes?: SkillGraphNode[] | null,
  agentUseCase?: string,
): ToolItem[] {
  const explicitTools = inferToolsFromSkillGraph(nodes);
  if (explicitTools.length > 0) {
    return explicitTools;
  }

  const allText = buildSearchText(nodes, agentUseCase);
  if (!allText.trim()) {
    return [];
  }

  return RESEARCH_TOOL_SEEDS
    .filter(({ keywords }) => keywords.some((keyword) => allText.includes(keyword)))
    .map(({ tool }) => ({ ...tool }));
}

export function getCredentialBackedToolIds(): Set<string> {
  return new Set(
    listSupportedTools().map((tool) => tool.toolId),
  );
}

export function mergeToolCards(
  baseTools: ToolItem[],
  connections: ToolConnectionDraft[],
): ToolItem[] {
  const byId = new Map(baseTools.map((tool) => [tool.id, { ...tool }]));

  for (const connection of connections) {
    const existing = byId.get(connection.toolId);
    const directDefinition = getToolDefinition(connection.toolId);
    byId.set(connection.toolId, {
      id: connection.toolId,
      name: connection.name,
      description: connection.description,
      icon: existing?.icon ?? directDefinition?.icon ?? "tool",
      connected: true,
      status: connection.status,
      authKind: connection.authKind,
      connectorType: connection.connectorType,
      configSummary: connection.configSummary,
      researchPlan: connection.researchPlan,
    });
  }

  return Array.from(byId.values()).map((tool) => {
    const connection = connections.find((item) => item.toolId === tool.id);
    if (!connection) {
      return {
        ...tool,
        connected: false,
        status: tool.status ?? "available",
        authKind: tool.authKind ?? getToolDefinition(tool.id)?.authKind ?? "none",
        connectorType: tool.connectorType ?? (toolSupportsDirectConnection(tool.id) ? "mcp" : "api"),
        configSummary: tool.configSummary ?? [],
        researchPlan: tool.researchPlan,
      };
    }

    return {
      ...tool,
      connected: true,
      status: connection.status,
      authKind: connection.authKind,
      connectorType: connection.connectorType,
      configSummary: connection.configSummary,
      researchPlan: connection.researchPlan,
    };
  });
}

export function buildConnectToolCatalog({
  skillGraph,
  agentUseCase,
  connections,
  latestRecommendation,
}: {
  skillGraph?: SkillGraphNode[] | null;
  agentUseCase?: string;
  connections: ToolConnectionDraft[];
  latestRecommendation?: ToolResearchResult | null;
}): ToolItem[] {
  const baseTools: ToolItem[] = [];
  const priorityIds: string[] = [];
  const supportedToolCards = buildSupportedToolCards();
  const latestRecommendationCard = latestRecommendation
    ? buildToolItemFromRecommendation(latestRecommendation)
    : null;

  // Include all tools from skill graph with explicit tool_type
  const skillGraphTools = inferToolsFromSkillGraph(skillGraph);
  for (const tool of skillGraphTools) {
    baseTools.push(tool);
    priorityIds.push(tool.id);
  }

  // Infer all matching tools from keywords when skill graph lacks explicit tool_type
  const inferredTools = latestRecommendationCard
    ? []
    : skillGraphTools.length > 0
    ? [] // Already have explicit tools from skill graph
    : inferAllResearchTools(skillGraph, agentUseCase);

  for (const tool of inferredTools) {
    if (!priorityIds.includes(tool.id)) {
      baseTools.push(tool);
      priorityIds.push(tool.id);
    }
  }

  for (const connection of connections) {
    baseTools.push({
      id: connection.toolId,
      name: connection.name,
      description: connection.description,
      icon: getToolDefinition(connection.toolId)?.icon ?? "tool",
      connected: true,
      status: connection.status,
      authKind: connection.authKind,
      connectorType: connection.connectorType,
      configSummary: connection.configSummary,
    });
    priorityIds.push(connection.toolId);
  }

  if (latestRecommendationCard) {
    baseTools.push(latestRecommendationCard);
    priorityIds.push(latestRecommendationCard.id);
  }

  // Only show the full supported tool catalog when no tools have been detected
  // from the skill graph, connections, or recommendations. When the architect
  // has identified specific tools, showing all available tools is noise.
  const hasDetectedTools = priorityIds.length > 0;
  if (!hasDetectedTools) {
    for (const tool of supportedToolCards) {
      baseTools.push(tool);
    }
  } else {
    // Still include supported tools that match a detected tool ID (for merging status)
    for (const tool of supportedToolCards) {
      if (priorityIds.includes(tool.id)) {
        baseTools.push(tool);
      }
    }
  }

  const merged = mergeToolCards(baseTools, connections);
  const priorityOrder = new Map(priorityIds.map((toolId, index) => [toolId, index]));

  return merged.sort((left, right) => {
    const leftPriority = priorityOrder.get(left.id);
    const rightPriority = priorityOrder.get(right.id);

    if (leftPriority !== undefined || rightPriority !== undefined) {
      return (leftPriority ?? Number.MAX_SAFE_INTEGER) - (rightPriority ?? Number.MAX_SAFE_INTEGER);
    }

    return left.name.localeCompare(right.name);
  });
}

export function buildSupportedToolCards(): ToolItem[] {
  return listSupportedTools().map((tool) => ({
    id: tool.toolId,
    name: tool.name,
    description: tool.description,
    icon: getToolDefinition(tool.toolId)?.icon ?? "tool",
    connected: false,
  }));
}

function slugifyToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildToolItemFromRecommendation(recommendation: ToolResearchResult): ToolItem {
  const supportedDefinition = recommendation.recommendedToolId
    ? getToolDefinition(recommendation.recommendedToolId)
    : null;

  if (supportedDefinition) {
    return {
      id: supportedDefinition.id,
      name: supportedDefinition.name,
      description: supportedDefinition.description,
      icon: supportedDefinition.icon,
      connected: false,
      status: "available",
      authKind: supportedDefinition.authKind,
      connectorType: "mcp",
      configSummary: [recommendation.summary].filter(Boolean),
    };
  }

  return {
    id: slugifyToolName(recommendation.toolName) || "manual-tool-plan",
    name: recommendation.toolName,
    description: recommendation.summary || "Research the best integration path before saving a manual plan.",
    icon: "tool",
    connected: false,
    status: "unsupported",
    authKind: "none",
    connectorType: recommendation.recommendedMethod,
    configSummary: [recommendation.summary].filter(Boolean),
  };
}
