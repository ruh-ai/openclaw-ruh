import type { ArchitectResponse, ClarificationQuestion, SkillGraphNode, WorkflowDefinition } from "./types";

type UnknownRecord = Record<string, unknown>;

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

function normalizeReadyForReview(parsed: UnknownRecord): UnknownRecord {
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
    skill_graph: {
      system_name: systemName,
      nodes,
      workflow,
    },
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
  return normalizeReadyForReview(withClarifications);
}

export function toArchitectResponse(parsed: UnknownRecord): ArchitectResponse {
  return normalizeArchitectResponse(parsed) as unknown as ArchitectResponse;
}
