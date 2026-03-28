import type { SavedAgent } from "@/hooks/use-agents-store";
import type {
  AgentImprovement,
  AgentRuntimeInput,
  AgentToolConnection,
  AgentTriggerDefinition,
} from "@/lib/agents/types";
import type { SkillGraphNode, WorkflowDefinition } from "@/lib/openclaw/types";
import {
  extractRuntimeInputKeys,
  mergeRuntimeInputDefinitions,
} from "@/lib/agents/runtime-inputs";
import { getToolDefinition } from "./_config/mcp-tool-registry";
import type {
  ToolConnectionDraft,
  ToolCredentialDrafts,
  TriggerSelection,
} from "./_components/configure/types";
import type { TriggerItem } from "./_components/review/types";

export interface CreateSessionConfigState {
  toolConnections: ToolConnectionDraft[];
  toolConnectionsTouched: boolean;
  credentialDrafts: ToolCredentialDrafts;
  runtimeInputs: AgentRuntimeInput[];
  runtimeInputsTouched: boolean;
  selectedSkills: string[];
  triggers: TriggerSelection[];
  triggersTouched: boolean;
}

interface ReviewConfigProjectionInput {
  current: CreateSessionConfigState;
  skillGraph: SkillGraphNode[] | null | undefined;
  reviewSkills: string[];
  reviewTriggers: TriggerItem[];
  improvements?: AgentImprovement[] | null;
  fallbackToolConnections?: AgentToolConnection[] | null;
  fallbackTriggers?: AgentTriggerDefinition[] | null;
}

type CreateSessionConfigSeed = Pick<
  SavedAgent,
  "skills" | "skillGraph" | "agentRules" | "runtimeInputs" | "toolConnections" | "triggers" | "improvements"
> | null | undefined;

interface ImprovementProjectionInput {
  toolConnections: AgentToolConnection[];
  improvements?: AgentImprovement[] | null;
}

interface ImprovementProjectionResult {
  toolConnections: AgentToolConnection[];
}

interface SelectedSkillsProjectionInput {
  selectedSkillIds: string[] | undefined;
  skillGraph: SkillGraphNode[] | null | undefined;
  workflow: WorkflowDefinition | null | undefined;
  runtimeInputs?: AgentRuntimeInput[] | null;
  agentRules?: string[] | null;
}

interface SelectedSkillsProjectionResult {
  selectedSkillIds: string[];
  skillGraph: SkillGraphNode[] | undefined;
  workflow: WorkflowDefinition | null | undefined;
  runtimeInputs: AgentRuntimeInput[];
}

const TOOL_CONNECTION_STATUS_RANK: Record<AgentToolConnection["status"], number> = {
  configured: 3,
  missing_secret: 2,
  available: 1,
  unsupported: 0,
};

function normalizeProjectedToolTarget(improvement: AgentImprovement): string | null {
  if (improvement.kind !== "tool_connection" || improvement.status !== "accepted") {
    return null;
  }

  if (improvement.targetId?.trim()) {
    return improvement.targetId.trim();
  }

  if (improvement.id === "connect-google-workspace") {
    return "google";
  }

  if (improvement.id === "connect-google-ads") {
    return "google-ads";
  }

  return null;
}

function buildProjectedToolConnection(toolId: string): AgentToolConnection {
  const definition = getToolDefinition(toolId);

  if (definition) {
    const configSummary = ["Selected from accepted builder improvement"];
    if (definition.credentials.length > 0) {
      configSummary.push("Credentials still required");
    }

    return {
      toolId: definition.id,
      name: definition.name,
      description: definition.description,
      status: definition.credentials.length > 0 ? "missing_secret" : "available",
      authKind: definition.authKind,
      connectorType: "mcp",
      configSummary,
    };
  }

  return {
    toolId,
    name: toolId.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    description: "Manual integration plan accepted from builder guidance.",
    status: "unsupported",
    authKind: "none",
    connectorType: "api",
    configSummary: ["Manual setup required"],
  };
}

function mergeProjectedToolConnection(
  existing: AgentToolConnection | undefined,
  projected: AgentToolConnection,
): AgentToolConnection {
  if (!existing) {
    return projected;
  }

  if (TOOL_CONNECTION_STATUS_RANK[existing.status] >= TOOL_CONNECTION_STATUS_RANK[projected.status]) {
    return existing;
  }

  return {
    ...projected,
    configSummary: Array.from(new Set([...(existing.configSummary ?? []), ...(projected.configSummary ?? [])])),
  };
}

export function applyAcceptedImprovementsToConfig(
  input: ImprovementProjectionInput,
): ImprovementProjectionResult {
  const toolConnections = [...input.toolConnections];
  const connectionById = new Map(toolConnections.map((connection) => [connection.toolId, connection]));

  for (const improvement of input.improvements ?? []) {
    const projectedToolId = normalizeProjectedToolTarget(improvement);
    if (!projectedToolId) {
      continue;
    }

    const projectedConnection = buildProjectedToolConnection(projectedToolId);
    connectionById.set(
      projectedConnection.toolId,
      mergeProjectedToolConnection(
        connectionById.get(projectedConnection.toolId),
        projectedConnection,
      ),
    );
  }

  return {
    toolConnections: Array.from(connectionById.values()),
  };
}

function mapSelectedSkillIds(
  savedSkills: string[] | undefined,
  skillGraph: SkillGraphNode[] | null | undefined,
): string[] {
  if (!savedSkills || savedSkills.length === 0) {
    return skillGraph?.map((node) => node.skill_id) ?? [];
  }

  if (!skillGraph || skillGraph.length === 0) {
    return savedSkills;
  }

  const normalizedSkillIds = new Map<string, string>();
  for (const node of skillGraph) {
    normalizedSkillIds.set(node.skill_id.toLowerCase(), node.skill_id);
    normalizedSkillIds.set((node.name || node.skill_id).toLowerCase(), node.skill_id);
  }

  const resolved = savedSkills.map((skill) => normalizedSkillIds.get(skill.toLowerCase()) ?? skill);
  return Array.from(new Set(resolved));
}

function filterRuntimeInputsToActiveKeys(
  runtimeInputs: AgentRuntimeInput[],
  skillGraph: SkillGraphNode[] | undefined,
  agentRules: string[] | null | undefined,
): AgentRuntimeInput[] {
  const activeKeys = new Set(
    extractRuntimeInputKeys({
      skillGraph,
      agentRules: agentRules ?? undefined,
    }),
  );

  if (activeKeys.size === 0) {
    return [];
  }

  return runtimeInputs.filter((input) => activeKeys.has(input.key.trim().toUpperCase()));
}

export function projectSelectedSkillsRuntimeContract(
  input: SelectedSkillsProjectionInput,
): SelectedSkillsProjectionResult {
  const selectedSkillIds = mapSelectedSkillIds(input.selectedSkillIds, input.skillGraph);
  const selectedSkillIdSet = new Set(selectedSkillIds);

  if (!input.skillGraph || input.skillGraph.length === 0) {
    return {
      selectedSkillIds,
      skillGraph: input.skillGraph ?? undefined,
      workflow: input.workflow,
      runtimeInputs: input.runtimeInputs ? [...input.runtimeInputs] : [],
    };
  }

  const skillGraph = input.skillGraph
    .filter((node) => selectedSkillIdSet.has(node.skill_id))
    .map((node) => ({
      ...node,
      depends_on: node.depends_on.filter((dependency) => selectedSkillIdSet.has(dependency)),
    }));

  const workflow = input.workflow
    ? {
        ...input.workflow,
        steps: input.workflow.steps
          .filter((step) => selectedSkillIdSet.has(step.skill))
          .map((step) => ({
            ...step,
            wait_for: step.wait_for.filter((dependency) => selectedSkillIdSet.has(dependency)),
          })),
      }
    : input.workflow;

  const runtimeInputs = filterRuntimeInputsToActiveKeys(
    mergeRuntimeInputDefinitions({
      existing: input.runtimeInputs ?? undefined,
      skillGraph,
      agentRules: input.agentRules ?? undefined,
    }),
    skillGraph,
    input.agentRules,
  );

  return {
    selectedSkillIds,
    skillGraph,
    workflow,
    runtimeInputs,
  };
}

export function createInitialCreateSessionConfig(
  seed?: CreateSessionConfigSeed,
): CreateSessionConfigState {
  const projected = applyAcceptedImprovementsToConfig({
    toolConnections: seed?.toolConnections ?? [],
    improvements: seed?.improvements,
  });

  return {
    toolConnections: projected.toolConnections,
    toolConnectionsTouched: false,
    credentialDrafts: {},
    runtimeInputs: mergeRuntimeInputDefinitions({
      existing: seed?.runtimeInputs,
      skillGraph: seed?.skillGraph,
      agentRules: seed?.agentRules,
    }),
    runtimeInputsTouched: false,
    selectedSkills: mapSelectedSkillIds(seed?.skills, seed?.skillGraph),
    triggers: seed?.triggers ?? [],
    triggersTouched: false,
  };
}

export function deriveCreateSessionReviewState(
  session: CreateSessionConfigState,
  fallback?: Pick<SavedAgent, "runtimeInputs" | "toolConnections" | "triggers"> | null,
  improvements?: AgentImprovement[] | null,
) {
  const projected = applyAcceptedImprovementsToConfig({
    toolConnections: session.toolConnectionsTouched
      ? session.toolConnections
      : (fallback?.toolConnections ?? []),
    improvements,
  });

  return {
    toolConnections: projected.toolConnections,
    runtimeInputs: session.runtimeInputs,
    triggers: session.triggersTouched
      ? session.triggers
      : (fallback?.triggers ?? []),
  };
}

export function resolveConfiguredSkillNames(
  selectedSkillIds: string[] | undefined,
  skillGraph: SkillGraphNode[] | null | undefined,
  fallback: string[],
): string[] {
  if (!selectedSkillIds || selectedSkillIds.length === 0) {
    return fallback;
  }

  if (!skillGraph || skillGraph.length === 0) {
    return selectedSkillIds;
  }

  const skillNames = new Map(
    skillGraph.map((node) => [node.skill_id, node.name || node.skill_id]),
  );

  return selectedSkillIds.map((skillId) => skillNames.get(skillId) ?? skillId);
}

function normalizeSkillSelection(
  reviewSkills: string[],
  skillGraph: SkillGraphNode[] | null | undefined,
): string[] {
  if (reviewSkills.length === 0) {
    return [];
  }

  if (!skillGraph || skillGraph.length === 0) {
    return Array.from(new Set(reviewSkills));
  }

  const canonicalSkillIds = new Map<string, string>();
  for (const node of skillGraph) {
    canonicalSkillIds.set(node.skill_id.toLowerCase(), node.skill_id);
    canonicalSkillIds.set((node.name || node.skill_id).toLowerCase(), node.skill_id);
  }

  return Array.from(
    new Set(
      reviewSkills.map((skill) => canonicalSkillIds.get(skill.toLowerCase()) ?? skill),
    ),
  );
}

function slugifyTriggerTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildReviewTriggerSelections(
  reviewTriggers: TriggerItem[],
  fallbackTriggers: AgentTriggerDefinition[] | null | undefined,
): TriggerSelection[] {
  const selections = reviewTriggers.map((trigger): TriggerSelection | null => {
      const title = trigger.text.trim();
      if (!title) {
        return null;
      }

      const persisted = fallbackTriggers?.find(
        (candidate) =>
          (trigger.id && candidate.id === trigger.id) ||
          candidate.title === title,
      );

      return {
        id: trigger.id || persisted?.id || slugifyTriggerTitle(title),
        title,
        kind: trigger.kind || persisted?.kind || "manual",
        status: trigger.status || persisted?.status || "unsupported",
        description: persisted?.description || trigger.detail || title,
        ...(persisted?.schedule ? { schedule: persisted.schedule } : {}),
      } satisfies TriggerSelection;
    });

  return selections.filter((trigger): trigger is TriggerSelection => trigger !== null);
}

export function applyReviewOutputToCreateSessionConfig(
  input: ReviewConfigProjectionInput,
): CreateSessionConfigState {
  const projectedToolConnections = applyAcceptedImprovementsToConfig({
    toolConnections: input.current.toolConnectionsTouched
      ? input.current.toolConnections
      : (input.fallbackToolConnections ?? []),
    improvements: input.improvements,
  }).toolConnections;

  const fallbackTriggers = input.current.triggersTouched
    ? input.current.triggers
    : (input.fallbackTriggers ?? []);

  return {
    ...input.current,
    toolConnections: projectedToolConnections,
    toolConnectionsTouched: true,
    selectedSkills: normalizeSkillSelection(input.reviewSkills, input.skillGraph),
    triggers: buildReviewTriggerSelections(input.reviewTriggers, fallbackTriggers),
    triggersTouched: true,
  };
}
