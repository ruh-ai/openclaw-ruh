import type {
  AgentToolConnection,
  AgentToolConnectionAuthKind,
  AgentToolConnectionType,
  AgentTriggerDefinition,
  AgentTriggerKind,
  AgentTriggerStatus,
} from "@/lib/agents/types";
import { getToolDefinition } from "@/app/(platform)/agents/create/_config/mcp-tool-registry";
import type { ArchitectResponse, ClarificationQuestion, SkillGraphNode, WorkflowDefinition } from "./types";

type UnknownRecord = Record<string, unknown>;

const TOOL_CONNECTION_AUTH_KINDS: AgentToolConnectionAuthKind[] = ["oauth", "api_key", "service_account", "none"];
const TOOL_CONNECTION_TYPES: AgentToolConnectionType[] = ["mcp", "api", "cli"];
const TRIGGER_KINDS: AgentTriggerKind[] = ["manual", "schedule", "webhook"];
const TRIGGER_STATUSES: AgentTriggerStatus[] = ["supported", "unsupported"];

const SUPPORTED_QUESTION_TYPES = new Set<ClarificationQuestion["type"]>([
  "text",
  "select",
  "multiselect",
  "boolean",
]);

function normalizeQuestionType(rawType: unknown): ClarificationQuestion["type"] {
  if (typeof rawType !== "string") return "text";
  if (rawType === "confirm") return "boolean";
  if (rawType === "info") return "text";
  if (SUPPORTED_QUESTION_TYPES.has(rawType as ClarificationQuestion["type"])) {
    return rawType as ClarificationQuestion["type"];
  }
  return "text";
}

function normalizeClarificationQuestions(rawQuestions: unknown): ClarificationQuestion[] {
  if (!Array.isArray(rawQuestions)) return [];

  return rawQuestions.map((question, index) => {
    if (typeof question === "string") {
      return {
        id: `q-${index}`,
        question,
        type: "text",
      };
    }

    const record = (question ?? {}) as UnknownRecord;
    const details = Array.isArray(record.details)
      ? record.details
          .map((detail) => String(detail).trim())
          .filter(Boolean)
          .join(" ")
      : "";

    return {
      id: typeof record.id === "string" ? record.id : `q-${index}`,
      question: [String(record.question ?? ""), details].filter(Boolean).join(" "),
      type: normalizeQuestionType(record.type),
      placeholder: typeof record.placeholder === "string" ? record.placeholder : undefined,
      options: Array.isArray(record.options)
        ? record.options.map((option) => String(option))
        : undefined,
      required: Boolean(record.required),
    };
  });
}

function normalizeSkillSource(rawSkill: UnknownRecord): SkillGraphNode["source"] {
  const toolSource = String(rawSkill.tool_source ?? "").trim();
  const implementation = String(rawSkill.implementation ?? "").trim();
  const nativeTools = Array.isArray(rawSkill.native_tools) ? rawSkill.native_tools : [];

  if (nativeTools.length > 0 || toolSource === "native") return "native_tool";
  if (toolSource === "data_ingestion") return "data_ingestion";
  if (implementation === "existing") return "existing";
  return "custom";
}

function normalizeWorkflowDependencies(
  rawWorkflow: unknown,
): Map<string, string[]> {
  const dependencies = new Map<string, string[]>();
  const steps = Array.isArray((rawWorkflow as UnknownRecord | undefined)?.steps)
    ? ((rawWorkflow as UnknownRecord).steps as unknown[])
    : [];

  for (const step of steps) {
    const record = (step ?? {}) as UnknownRecord;
    const skillId = typeof record.skill === "string" ? record.skill : "";
    if (!skillId) continue;

    const waitFor = Array.isArray(record.wait_for)
      ? record.wait_for.filter((value): value is string => typeof value === "string")
      : [];

    dependencies.set(skillId, waitFor);
  }

  return dependencies;
}

function normalizeToolConnectionAuthKind(
  rawAuthKind: unknown,
  fallback: AgentToolConnectionAuthKind,
): AgentToolConnectionAuthKind {
  return TOOL_CONNECTION_AUTH_KINDS.includes(rawAuthKind as AgentToolConnectionAuthKind)
    ? rawAuthKind as AgentToolConnectionAuthKind
    : fallback;
}

function normalizeToolConnectionType(
  rawConnectorType: unknown,
  fallback: AgentToolConnectionType,
): AgentToolConnectionType {
  return TOOL_CONNECTION_TYPES.includes(rawConnectorType as AgentToolConnectionType)
    ? rawConnectorType as AgentToolConnectionType
    : fallback;
}

function normalizeTriggerKind(rawKind: unknown, fallback: AgentTriggerKind): AgentTriggerKind {
  return TRIGGER_KINDS.includes(rawKind as AgentTriggerKind)
    ? rawKind as AgentTriggerKind
    : fallback;
}

function normalizeTriggerStatus(rawStatus: unknown, fallback: AgentTriggerStatus): AgentTriggerStatus {
  return TRIGGER_STATUSES.includes(rawStatus as AgentTriggerStatus)
    ? rawStatus as AgentTriggerStatus
    : fallback;
}

function defaultTriggerStatus(
  triggerId: string,
  kind: AgentTriggerKind,
): AgentTriggerStatus {
  if (triggerId === "webhook-post") {
    return "supported";
  }

  return kind === "manual" || kind === "schedule"
    ? "supported"
    : "unsupported";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeToolConnections(rawConnections: unknown): AgentToolConnection[] | undefined {
  if (!Array.isArray(rawConnections)) return undefined;

  const normalized = rawConnections
    .map((entry, index) => {
      const record = (entry ?? {}) as UnknownRecord;
      const rawToolId =
        typeof record.tool_id === "string" ? record.tool_id
          : typeof record.toolId === "string" ? record.toolId
            : typeof record.recommended_tool_id === "string" ? record.recommended_tool_id
              : typeof record.name === "string" ? slugify(record.name)
                : `tool-${index + 1}`;
      const toolId = rawToolId.trim().replace(/_/g, "-");
      if (!toolId) return null;

      const registryDefinition = getToolDefinition(toolId);
      const requiredEnv = Array.isArray(record.required_env)
        ? record.required_env.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const configSummary = Array.isArray(record.config_summary)
        ? record.config_summary
            .map((value) => String(value).trim())
            .filter(Boolean)
        : [];

      if (configSummary.length === 0 && requiredEnv.length > 0) {
        configSummary.push(`Required env: ${requiredEnv.join(", ")}`);
      }
      if (configSummary.length === 0 && registryDefinition?.credentials.length) {
        configSummary.push("Credentials required");
      }

      const fallbackStatus: AgentToolConnection["status"] =
        requiredEnv.length > 0 || (registryDefinition?.credentials.length ?? 0) > 0
          ? "missing_secret"
          : "available";

      return {
        toolId,
        name:
          (typeof record.name === "string" && record.name.trim())
          || registryDefinition?.name
          || toolId.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        description:
          (typeof record.description === "string" && record.description.trim())
          || registryDefinition?.description
          || "Architect-recommended tool connection.",
        status:
          record.status === "available"
          || record.status === "configured"
          || record.status === "missing_secret"
          || record.status === "unsupported"
            ? record.status
            : fallbackStatus,
        authKind: normalizeToolConnectionAuthKind(
          record.auth_kind ?? record.authKind,
          registryDefinition?.authKind ?? (requiredEnv.length > 0 ? "api_key" : "none"),
        ),
        connectorType: normalizeToolConnectionType(
          record.connector_type ?? record.connectorType,
          registryDefinition ? "mcp" : "api",
        ),
        configSummary,
      } satisfies AgentToolConnection;
    })
    .filter((entry): entry is AgentToolConnection => Boolean(entry));

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTriggers(rawTriggers: unknown): AgentTriggerDefinition[] | undefined {
  if (!Array.isArray(rawTriggers)) return undefined;

  const normalized: AgentTriggerDefinition[] = rawTriggers.map((entry, index) => {
      const record = (entry ?? {}) as UnknownRecord;
      const title =
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : typeof record.name === "string" && record.name.trim()
            ? record.name.trim()
            : `Trigger ${index + 1}`;
      const triggerId =
        (typeof record.id === "string" && record.id.trim())
        || (typeof record.trigger_id === "string" && record.trigger_id.trim())
        || slugify(title);
      const kind = normalizeTriggerKind(record.kind, "manual");
      const schedule =
        typeof record.schedule === "string" && record.schedule.trim()
          ? record.schedule.trim()
          : typeof record.cron_expression === "string" && record.cron_expression.trim()
            ? record.cron_expression.trim()
            : undefined;

      return {
        id: triggerId,
        title,
        kind,
        status: normalizeTriggerStatus(
          record.status,
          defaultTriggerStatus(triggerId, kind),
        ),
        description:
          (typeof record.description === "string" && record.description.trim())
          || title,
        ...(schedule ? { schedule } : {}),
      } satisfies AgentTriggerDefinition;
    });

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeReadyForReview(parsed: UnknownRecord): UnknownRecord {
  const normalizedToolConnections = normalizeToolConnections(parsed.tool_connections);
  const normalizedTriggers = normalizeTriggers(parsed.triggers);
  if (!Array.isArray(parsed.skill_graph)) return parsed;

  const rawSkills = parsed.skill_graph as UnknownRecord[];
  const workflowDependencies = normalizeWorkflowDependencies(parsed.workflow);
  const systemName =
    typeof parsed.system_name === "string" && parsed.system_name.trim()
      ? parsed.system_name
      : typeof (parsed.agent_metadata as UnknownRecord | undefined)?.agent_name === "string"
        ? String((parsed.agent_metadata as UnknownRecord).agent_name)
        : `agent-${Date.now().toString(36)}`;

  const nodes: SkillGraphNode[] = rawSkills.map((skill, index) => ({
    skill_id: String(skill.skill_id ?? `skill-${index}`),
    name: String(skill.name ?? skill.skill_id ?? `Skill ${index + 1}`),
    source: normalizeSkillSource(skill),
    status: normalizeSkillSource(skill) === "native_tool" ? "always_included" : "generated",
    depends_on:
      workflowDependencies.get(String(skill.skill_id ?? `skill-${index}`)) ??
      (index > 0 ? [String(rawSkills[index - 1]?.skill_id ?? `skill-${index - 1}`)] : []),
    description: String(skill.purpose ?? skill.description ?? skill.name ?? skill.skill_id ?? "").trim(),
    native_tool:
      Array.isArray(skill.native_tools) && skill.native_tools.length > 0
        ? String(skill.native_tools[0])
        : null,
  }));

  const workflow: WorkflowDefinition = {
    name: `${systemName}-workflow`,
    description:
      typeof (parsed.workflow as UnknownRecord | undefined)?.orchestration === "string"
        ? String((parsed.workflow as UnknownRecord).orchestration)
        : `${systemName} workflow`,
    steps: nodes.map((node, index) => ({
      id: `step-${index}`,
      action: "execute",
      skill: node.skill_id,
      wait_for: node.depends_on,
    })),
  };

  return {
    ...parsed,
    system_name: systemName,
    ...(normalizedToolConnections ? { tool_connections: normalizedToolConnections } : {}),
    skill_graph: {
      system_name: systemName,
      nodes,
      workflow,
    },
    ...(normalizedTriggers ? { triggers: normalizedTriggers } : {}),
  };
}

function normalizeStructuredConfig(parsed: UnknownRecord): UnknownRecord {
  const normalizedToolConnections = normalizeToolConnections(parsed.tool_connections);
  const normalizedTriggers = normalizeTriggers(parsed.triggers);

  if (!normalizedToolConnections && !normalizedTriggers) {
    return parsed;
  }

  return {
    ...parsed,
    ...(normalizedToolConnections ? { tool_connections: normalizedToolConnections } : {}),
    ...(normalizedTriggers ? { triggers: normalizedTriggers } : {}),
  };
}

function normalizeDataSchemaProposal(parsed: UnknownRecord): UnknownRecord {
  if (parsed.type !== "data_schema_proposal") return parsed;

  const context =
    typeof parsed.context === "string" && parsed.context.trim()
      ? parsed.context
      : "The architect proposed a data schema step and needs confirmation before continuing.";

  return {
    type: "clarification",
    context,
    content: context,
    questions: [
      {
        id: "schema-approval",
        question: "Do you approve this schema/storage plan and want the architect to continue?",
        type: "select",
        options: [
          "Approve the schema/storage plan and continue.",
          "Revise the schema/storage plan before continuing.",
        ],
        required: true,
      },
    ],
  };
}

function normalizeClarification(parsed: UnknownRecord): UnknownRecord {
  if (parsed.type !== "clarification") return parsed;
  return {
    ...parsed,
    questions: normalizeClarificationQuestions(parsed.questions),
  };
}

export function normalizeArchitectResponse(parsed: UnknownRecord): UnknownRecord {
  const withSchemaProposal = normalizeDataSchemaProposal(parsed);
  const withClarifications = normalizeClarification(withSchemaProposal);
  const withStructuredConfig = normalizeStructuredConfig(withClarifications);
  return normalizeReadyForReview(withStructuredConfig);
}

export function toArchitectResponse(parsed: UnknownRecord): ArchitectResponse {
  return normalizeArchitectResponse(parsed) as unknown as ArchitectResponse;
}
