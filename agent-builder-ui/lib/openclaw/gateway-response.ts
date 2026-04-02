import yaml from "js-yaml";

import { normalizeArchitectResponse } from "./response-normalization";

type UnknownRecord = Record<string, unknown>;

const KNOWN_RESPONSE_TYPES = new Set([
  "clarification",
  "ready_for_review",
  "tool_recommendation",
  "agent_response",
  "deploy_complete",
  "build_complete",
  "error",
  "discovery",
  "architecture_plan",
]);

export interface FinalizeGatewayResponseOptions {
  agentId: string;
  runId?: string;
  systemNameFactory?: () => string;
}

export function extractMessageText(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;

  if (typeof message === "object" && message !== null) {
    const record = message as UnknownRecord;
    if (Array.isArray(record.content)) {
      return record.content
        .filter((block): block is UnknownRecord => Boolean(block) && typeof block === "object")
        .filter((block) => block.type === "text")
        .map((block) => String(block.text ?? ""))
        .join("");
    }

    if (typeof record.content === "string") {
      return record.content;
    }
  }

  return "";
}

export function finalizeGatewayResponse(
  text: string,
  options: FinalizeGatewayResponseOptions,
): UnknownRecord {
  const systemNameFactory =
    options.systemNameFactory ?? (() => `agent-${Date.now().toString(36)}`);

  const normalizedJson = tryParseJson(text);
  if (normalizedJson) {
    return finalizeKnownResponse(normalizedJson, text, options, systemNameFactory);
  }

  const embeddedJsonMatch = text.match(
    /\{[\s\S]*"type"\s*:\s*"(clarification|ready_for_review|tool_recommendation|agent_response|deploy_complete|error|discovery|architecture_plan)"[\s\S]*\}/,
  );
  if (embeddedJsonMatch) {
    const normalizedEmbedded = tryParseJson(embeddedJsonMatch[0]);
    if (normalizedEmbedded) {
      return finalizeKnownResponse(normalizedEmbedded, text, options, systemNameFactory);
    }
  }

  const jsonBlockMatch = text.match(/```json\s*\n([\s\S]*?)```/);
  if (jsonBlockMatch) {
    const normalizedJsonBlock = tryParseJson(jsonBlockMatch[1]);
    if (normalizedJsonBlock) {
      return finalizeKnownResponse(normalizedJsonBlock, text, options, systemNameFactory);
    }
  }

  const typedYamlMatch = text.match(
    /```(ready_for_review|clarification|tool_recommendation|deploy_complete|agent_response|discovery|architecture_plan)\s*\n([\s\S]*?)```/,
  );
  if (typedYamlMatch) {
    const typedYamlResponse = tryParseTypedYamlResponse(
      typedYamlMatch[1],
      typedYamlMatch[2],
      text,
      systemNameFactory,
    );
    if (typedYamlResponse) {
      return typedYamlResponse;
    }
  }

  const genericYamlMatch = text.match(/```yaml\s*\n([\s\S]*?)```/);
  if (genericYamlMatch) {
    const genericYamlResponse = tryParseGenericYamlResponse(
      genericYamlMatch[1],
      text,
      options,
      systemNameFactory,
    );
    if (genericYamlResponse) {
      return genericYamlResponse;
    }
  }

  return {
    type: "agent_response",
    runId: options.runId ?? "",
    agent: options.agentId,
    content: text,
  };
}

export function buildAdapterAvailability(
  nodes: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const availability: Record<string, unknown> = {};

  for (const node of nodes) {
    if (node.type !== "ingestion" || !Array.isArray(node.data_sources)) {
      continue;
    }

    for (const dataSource of node.data_sources as Array<Record<string, unknown>>) {
      availability[String(dataSource.source_type)] = {
        source_type: dataSource.source_type,
        has_adapter: dataSource.access_method === "adapter",
        access_method: dataSource.access_method,
      };
    }
  }

  return availability;
}

function tryParseJson(text: string): UnknownRecord | null {
  try {
    return normalizeArchitectResponse(JSON.parse(text) as UnknownRecord) as UnknownRecord;
  } catch {
    return null;
  }
}

function finalizeKnownResponse(
  parsed: UnknownRecord,
  originalText: string,
  options: FinalizeGatewayResponseOptions,
  systemNameFactory: () => string,
): UnknownRecord {
  if (typeof parsed.type === "string" && !KNOWN_RESPONSE_TYPES.has(parsed.type)) {
    return {
      type: "agent_response",
      content:
        (parsed.message as string) ||
        (parsed.content as string) ||
        originalText,
    };
  }

  ensureSystemName(parsed, systemNameFactory);
  return parsed;
}

function ensureSystemName(parsed: UnknownRecord, systemNameFactory: () => string): void {
  if (parsed.type !== "ready_for_review") return;

  const skillGraph = parsed.skill_graph as UnknownRecord | undefined;
  if (!skillGraph || typeof skillGraph !== "object") return;

  if (!skillGraph.system_name) {
    const nodes = skillGraph.nodes as Array<UnknownRecord> | undefined;
    const firstId = nodes?.[0]?.skill_id as string | undefined;
    skillGraph.system_name = firstId
      ? firstId.replace(/_/g, "-").replace(/-skill$/, "")
      : systemNameFactory();
  }
}

function tryParseTypedYamlResponse(
  blockType: string,
  blockContent: string,
  originalText: string,
  systemNameFactory: () => string,
): UnknownRecord | null {
  try {
    const parsed = yaml.load(blockContent) as UnknownRecord;
    const normalized = normalizeArchitectResponse(parsed) as UnknownRecord;

    if (
      blockType === "ready_for_review" &&
      normalized.skill_graph &&
      typeof normalized.skill_graph === "object"
    ) {
      const graphResponse = buildReadyForReviewGraphResponse(parsed, normalized, systemNameFactory);
      if (graphResponse) {
        return graphResponse;
      }
    }

    return finalizeKnownResponse(normalized, originalText, {
      agentId: "architect",
    }, systemNameFactory);
  } catch {
    return null;
  }
}

function buildReadyForReviewGraphResponse(
  parsed: UnknownRecord,
  normalized: UnknownRecord,
  systemNameFactory: () => string,
): UnknownRecord | null {
  const skillGraph = normalized.skill_graph as UnknownRecord;
  const rawNodes = Array.isArray(skillGraph.nodes)
    ? (skillGraph.nodes as Array<UnknownRecord>)
    : [];
  const rawEdges = Array.isArray(skillGraph.edges)
    ? (skillGraph.edges as Array<UnknownRecord>)
    : [];

  if (rawNodes.length === 0 && rawEdges.length === 0) {
    return null;
  }

  const nodes = rawNodes.map((node) => ({
    skill_id: (node.id as string) || (node.skill_id as string),
    name:
      (node.id as string) ||
      (node.skill_id as string) ||
      String((node.description as string) || "").slice(0, 40),
    source: (node.type as string) === "ingestion" ? "data_ingestion" : "custom",
    status:
      (node.type as string) === "trigger" || (node.type as string) === "config"
        ? "always_included"
        : "generating",
    depends_on: rawEdges
      .filter((edge) => edge.to === node.id)
      .map((edge) => edge.from as string),
    description: (node.description as string) || "",
  }));

  return {
    type: "ready_for_review",
    skill_graph: {
      system_name:
        (normalized.automation_type as string) ||
        systemNameFactory(),
      nodes,
      workflow: {
        name: "main-workflow",
        description: `${(parsed.automation_type as string) || "pipeline"} - ${nodes.length} nodes`,
        steps: rawEdges.map((edge, index) => ({
          id: `step-${index}`,
          action: "execute",
          skill: edge.to as string,
          wait_for: [edge.from as string],
        })),
      },
    },
    adapter_availability: buildAdapterAvailability(rawNodes),
    raw_spec: normalized,
  };
}

function tryParseGenericYamlResponse(
  yamlContent: string,
  originalText: string,
  options: FinalizeGatewayResponseOptions,
  systemNameFactory: () => string,
): UnknownRecord | null {
  try {
    const parsed = yaml.load(yamlContent) as UnknownRecord;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = { ...parsed };
    const hasSkillGraph =
      record.skill_graph ||
      record.nodes ||
      record.skills ||
      record.type === "ready_for_review";

    if (hasSkillGraph) {
      if (!record.skill_graph && record.nodes) {
        record.skill_graph = record.nodes;
        delete record.nodes;
      } else if (!record.skill_graph && record.skills) {
        record.skill_graph = record.skills;
        delete record.skills;
      }

      if (!record.type || !KNOWN_RESPONSE_TYPES.has(String(record.type))) {
        record.type = "ready_for_review";
      }

      if (!record.content) {
        const prose = originalText.replace(/```yaml[\s\S]*?```/, "").trim();
        if (prose) {
          record.content = prose;
        }
      }

      return finalizeKnownResponse(
        normalizeArchitectResponse(record) as UnknownRecord,
        originalText,
        options,
        systemNameFactory,
      );
    }

    if (typeof record.type === "string" && KNOWN_RESPONSE_TYPES.has(record.type)) {
      return finalizeKnownResponse(
        normalizeArchitectResponse(record) as UnknownRecord,
        originalText,
        options,
        systemNameFactory,
      );
    }
  } catch {
    return null;
  }

  return null;
}
