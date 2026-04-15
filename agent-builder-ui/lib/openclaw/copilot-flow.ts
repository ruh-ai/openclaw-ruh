import type { SavedAgent } from "@/hooks/use-agents-store";
import type {
  AgentChannelSelection,
  AgentImprovement,
  AgentRuntimeInput,
  AgentToolConnection,
  AgentTriggerDefinition,
} from "@/lib/agents/types";
import {
  buildDeployConfigSummary,
  buildReviewRuntimeInputItems,
  buildReviewToolItems,
  buildReviewTriggerItems,
  type DeployConfigSummary,
  type ReviewRuntimeInputItem,
  type ReviewToolItem,
  type ReviewTriggerItem,
} from "@/lib/agents/operator-config-summary";
import type { SkillAvailability } from "@/lib/skills/skill-registry";
import { applyAcceptedImprovementsToConfig } from "@/app/(platform)/agents/create/create-session-config";
import type { CoPilotPhase, SkillGenerationStatus } from "./copilot-state";
import type { AgentDevStage, ArchitecturePlan, DiscoveryDocuments, SkillGraphNode, StageStatus, WorkflowDefinition } from "./types";

export function hasPurposeMetadata(name: string, description: string): boolean {
  return name.trim().length > 0 && description.trim().length > 0;
}

/**
 * Check if an architecture plan has inline content (skillMd + soulContent)
 * that enables instant deploy without a separate Build/architect call.
 */
export function planHasInlineContent(plan: ArchitecturePlan): boolean {
  if (!plan.soulContent?.trim()) return false;
  if (!plan.skills || plan.skills.length === 0) return false;
  // All skills must have skillMd content
  return plan.skills.every((s) => !!s.skillMd?.trim());
}

export function resolveCoPilotToolResearchUseCase(description: string): string | undefined {
  const trimmedDescription = description.trim();
  return trimmedDescription.length > 0 ? trimmedDescription : undefined;
}

export function getSelectedUnresolvedSkillIds(
  selectedSkillIds: string[],
  skillAvailability: SkillAvailability[],
): string[] {
  const availabilityBySkillId = new Map(
    skillAvailability.map((entry) => [entry.skillId, entry.status]),
  );

  return selectedSkillIds.filter((skillId) => availabilityBySkillId.get(skillId) === "needs_build");
}

export function countSkillAvailability(
  skillAvailability: SkillAvailability[],
): Record<SkillAvailability["status"], number> {
  return skillAvailability.reduce<Record<SkillAvailability["status"], number>>(
    (counts, entry) => {
      counts[entry.status] += 1;
      return counts;
    },
    {
      native: 0,
      registry_match: 0,
      needs_build: 0,
      custom_built: 0,
    },
  );
}

export interface CoPilotReviewData {
  skillSummary: string;
  ruleSummary: string;
  toolItems: ReviewToolItem[];
  runtimeInputItems: ReviewRuntimeInputItem[];
  triggerItems: ReviewTriggerItem[];
  channels: AgentChannelSelection[];
  channelSummary: string;
  deploySummary: DeployConfigSummary;
}

interface BuildCoPilotReviewAgentSnapshotInput {
  name: string;
  description: string;
  systemName?: string | null;
  selectedSkillIds: string[];
  skillGraph?: SkillGraphNode[] | null;
  workflow?: WorkflowDefinition | null;
  agentRules: string[];
  runtimeInputs: AgentRuntimeInput[];
  connectedTools: AgentToolConnection[];
  triggers: AgentTriggerDefinition[];
  improvements: AgentImprovement[];
}

interface EvaluateCoPilotDeployReadinessInput {
  purposeReady: boolean;
  skillGenerationStatus: SkillGenerationStatus;
  skillGraphCount: number;
  selectedSkillIds: string[];
  unresolvedSelectedSkills: string[];
  missingRequiredRuntimeInputKeys: string[];
  deploySummary: DeployConfigSummary;
}

interface CoPilotDeployReadiness {
  canDeploy: boolean;
  blockerMessage: string | null;
}

export function buildCoPilotReviewData({
  selectedSkillIds,
  totalSkillCount,
  agentRules,
  runtimeInputs,
  connectedTools,
  triggers,
  channels = [],
}: {
  selectedSkillIds: string[];
  totalSkillCount: number;
  agentRules: string[];
  runtimeInputs: NonNullable<SavedAgent["runtimeInputs"]>;
  connectedTools: NonNullable<SavedAgent["toolConnections"]>;
  triggers: NonNullable<SavedAgent["triggers"]>;
  channels?: AgentChannelSelection[];
}): CoPilotReviewData {
  const channelSummary = channels.length === 0
    ? "Web chat only"
    : channels.map((ch) => ch.label).join(", ");

  return {
    skillSummary: totalSkillCount > 0
      ? `${selectedSkillIds.length} of ${totalSkillCount} selected`
      : "None configured",
    ruleSummary: agentRules.length > 0 ? agentRules.join(" · ") : "None",
    toolItems: buildReviewToolItems(connectedTools),
    runtimeInputItems: buildReviewRuntimeInputItems(runtimeInputs),
    triggerItems: buildReviewTriggerItems(triggers),
    channels,
    channelSummary,
    deploySummary: buildDeployConfigSummary({
      runtimeInputs,
      toolConnections: connectedTools,
      triggers,
    }),
  };
}

export function buildCoPilotReviewAgentSnapshot({
  name,
  description,
  systemName,
  selectedSkillIds,
  skillGraph,
  workflow,
  agentRules,
  runtimeInputs,
  connectedTools,
  triggers,
  improvements,
}: BuildCoPilotReviewAgentSnapshotInput): SavedAgent {
  const selectedSkillIdSet = new Set(
    selectedSkillIds.map((skillId) => skillId.trim()).filter(Boolean),
  );
  const filteredSkillGraph = (skillGraph ?? []).filter((node) =>
    selectedSkillIdSet.size === 0 ? true : selectedSkillIdSet.has(node.skill_id),
  );
  const selectedSkills = filteredSkillGraph.length > 0
    ? filteredSkillGraph.map((node) => node.name || node.skill_id)
    : Array.from(selectedSkillIdSet);
  const projected = applyAcceptedImprovementsToConfig({
    toolConnections: connectedTools.map((tool) => ({ ...tool })),
    improvements,
  });
  const resolvedName = name.trim() || systemName?.trim() || "New Agent";

  return {
    id: "copilot-review-preview",
    name: resolvedName,
    avatar: "",
    description: description.trim(),
    skills: selectedSkills,
    triggerLabel:
      triggers.map((trigger) => trigger.title.trim()).filter(Boolean).join(", ") ||
      "Manual review",
    status: "draft",
    createdAt: new Date().toISOString(),
    sandboxIds: [],
    agentRules,
    runtimeInputs,
    skillGraph: filteredSkillGraph,
    workflow: workflow ?? null,
    toolConnections: projected.toolConnections,
    triggers,
    improvements,
  };
}

export function evaluateCoPilotDeployReadiness({
  purposeReady,
  skillGenerationStatus,
  skillGraphCount,
  selectedSkillIds,
  unresolvedSelectedSkills,
  missingRequiredRuntimeInputKeys,
  deploySummary,
}: EvaluateCoPilotDeployReadinessInput): CoPilotDeployReadiness {
  if (!purposeReady) {
    return {
      canDeploy: false,
      blockerMessage: "Add an agent name and description to unlock skills, tools, and runtime tabs.",
    };
  }

  if (skillGenerationStatus === "loading") {
    return {
      canDeploy: false,
      blockerMessage: "The architect is generating required skills and checking the registry.",
    };
  }

  if (skillGraphCount === 0 || selectedSkillIds.length === 0) {
    return {
      canDeploy: false,
      blockerMessage: "Select at least one resolved skill before deploy.",
    };
  }

  if (unresolvedSelectedSkills.length > 0) {
    return {
      canDeploy: false,
      blockerMessage: `Build or deselect ${unresolvedSelectedSkills.length} unresolved skill${unresolvedSelectedSkills.length > 1 ? "s" : ""} before deploy.`,
    };
  }

  // Runtime inputs are collected during first-chat onboarding, not at deploy time.

  return {
    canDeploy: true,
    blockerMessage: null,
  };
}

interface CoPilotAgentSeed {
  name: string;
  description: string;
  skillGraph: NonNullable<SavedAgent["skillGraph"]>;
  selectedSkillIds: string[];
  builtSkillIds: string[];
  workflow: SavedAgent["workflow"];
  skillGenerationStatus: SkillGenerationStatus;
  skillGenerationError: string | null;
  connectedTools: NonNullable<SavedAgent["toolConnections"]>;
  credentialDrafts: Record<string, Record<string, string>>;
  runtimeInputs: NonNullable<SavedAgent["runtimeInputs"]>;
  triggers: NonNullable<SavedAgent["triggers"]>;
  channels: AgentChannelSelection[];
  agentRules: string[];
  improvements: NonNullable<SavedAgent["improvements"]>;
  discoveryDocuments: DiscoveryDocuments | null;
  systemName: string;
  phase: CoPilotPhase;
  // Lifecycle overrides — set when restoring a forging agent so the UI
  // resumes at the correct stage instead of regressing to "think".
  devStage?: AgentDevStage;
  thinkStatus?: StageStatus;
  planStatus?: StageStatus;
  buildStatus?: StageStatus;
}

const STAGE_ORDER: AgentDevStage[] = ["reveal", "think", "plan", "build", "review", "test", "ship", "reflect"];
const REVIEW_STAGE_INDEX = STAGE_ORDER.indexOf("review");

function normalizeForgeStage(stage: string | null | undefined): AgentDevStage | null {
  const normalized = stage === "complete" ? "ship" : stage;
  if (!normalized) return null;
  return STAGE_ORDER.includes(normalized as AgentDevStage)
    ? (normalized as AgentDevStage)
    : null;
}

export function canPersistReviewOrLaterForgeStage(
  stage: AgentDevStage,
  skillGraphCount: number,
): boolean {
  const stageIdx = STAGE_ORDER.indexOf(stage);
  if (stageIdx < 0) return false;
  if (stageIdx < REVIEW_STAGE_INDEX) return true;
  return skillGraphCount > 0;
}

export function createCoPilotSeedFromAgent(agent: SavedAgent): CoPilotAgentSeed {
  const skillGraph = agent.skillGraph ?? [];
  const projected = applyAcceptedImprovementsToConfig({
    toolConnections: agent.toolConnections ?? [],
    improvements: agent.improvements,
  });
  const normalizedSkillIds = new Map<string, string>();

  for (const node of skillGraph) {
    normalizedSkillIds.set(node.skill_id.toLowerCase(), node.skill_id);
    normalizedSkillIds.set((node.name || node.skill_id).toLowerCase(), node.skill_id);
  }

  const selectedSkillIds = (agent.skills.length > 0 ? agent.skills : skillGraph.map((node) => node.skill_id))
    .map((skill) => {
      const normalizedSkill = skill.trim();
      return normalizedSkillIds.get(normalizedSkill.toLowerCase()) ?? normalizedSkill;
    })
    .filter((skill, index, all) => all.indexOf(skill) === index);

  // When an agent has a skill graph and is past the build stage, mark skills as built
  // so a page refresh doesn't regress the deploy-readiness check to "unresolved".
  const forgeStage = normalizeForgeStage(agent.forgeStage as string | null | undefined);
  const forgeStageIdx = forgeStage ? STAGE_ORDER.indexOf(forgeStage) : -1;
  const pastBuild = forgeStageIdx >= STAGE_ORDER.indexOf("review");
  const hasSkills = skillGraph.length > 0;

  const builtSkillIds = (pastBuild || agent.status === "active") && hasSkills
    ? skillGraph.map((node) => node.skill_id)
    : [];

  // Restore the viewed lifecycle stage AND preceding stage statuses from
  // persisted agent truth. Without this, a page reload resets all stage
  // statuses to "idle" even though the backend knows the agent has progressed,
  // causing the UI to show incomplete/stuck states.
  const lifecycleOverrides: Partial<CoPilotAgentSeed> = {};
  if (forgeStage && canPersistReviewOrLaterForgeStage(forgeStage, skillGraph.length)) {
    lifecycleOverrides.devStage = forgeStage;
    // Derive completion statuses for all stages the agent has already passed.
    // This ensures the stage pills show as done rather than idle on reload.
    const THINK_IDX = STAGE_ORDER.indexOf("think");
    const PLAN_IDX = STAGE_ORDER.indexOf("plan");
    const BUILD_IDX = STAGE_ORDER.indexOf("build");
    if (forgeStageIdx > THINK_IDX) {
      lifecycleOverrides.thinkStatus = "approved" as StageStatus;
    }
    if (forgeStageIdx > PLAN_IDX) {
      lifecycleOverrides.planStatus = "approved" as StageStatus;
    }
    if (forgeStageIdx > BUILD_IDX) {
      lifecycleOverrides.buildStatus = "done" as StageStatus;
    }
  } else if (agent.status === "active" && hasSkills) {
    // Older active agents without saved lifecycle state reopen in Review so the
    // operator can inspect current config, but we intentionally do not infer
    // earlier stage completion from "active" alone.
    lifecycleOverrides.devStage = "review";
  } else if (agent.status === "forging" && agent.forgeSandboxId && forgeStage) {
    // Forging agents with a forge_stage set have progressed past reveal.
    // Use the forge_stage as devStage so the page resumes at the right point.
    // Without the forgeStage guard, brand-new agents (forge_stage=null) would
    // skip the Meet/Reveal stage and jump straight to Think.
    lifecycleOverrides.devStage = forgeStage;
  }

  return {
    name: agent.name,
    description: agent.description,
    skillGraph,
    selectedSkillIds,
    builtSkillIds,
    workflow: agent.workflow ?? null,
    skillGenerationStatus: skillGraph.length > 0 ? "ready" : "idle",
    skillGenerationError: null,
    connectedTools: projected.toolConnections,
    credentialDrafts: {},
    runtimeInputs: agent.runtimeInputs ?? [],
    triggers: agent.triggers ?? [],
    channels: agent.channels ?? [],
    agentRules: agent.agentRules ?? [],
    improvements: agent.improvements ?? [],
    discoveryDocuments: agent.discoveryDocuments ?? null,
    systemName: agent.name,
    phase: skillGraph.length > 0 ? "review" : "purpose",
    // Wire forge sandbox ID so the eval system can route to the real agent container
    ...(agent.forgeSandboxId ? { agentSandboxId: agent.forgeSandboxId } : {}),
    ...lifecycleOverrides,
  };
}

export function resolveCoPilotCompletionKind({
  existingAgentId,
  draftAgentId,
}: {
  existingAgentId: string | null;
  draftAgentId: string | null;
}): "improve-existing" | "deploy-draft" | "deploy-new" {
  if (existingAgentId) {
    return "improve-existing";
  }

  if (draftAgentId) {
    return "deploy-draft";
  }

  return "deploy-new";
}
