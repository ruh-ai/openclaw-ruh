/**
 * Wizard Directive Parser — extracts wizard-control directives from
 * ArchitectResponse structured data.
 *
 * This is data-driven, not text-parsing. It reads structured fields the
 * architect already returns (skill_graph, agent_metadata, requirements)
 * and converts them into wizard state updates.
 */

import type { AgentToolConnection, AgentTriggerDefinition } from "@/lib/agents/types";
import { getToolDefinition } from "@/app/(platform)/agents/create/_config/mcp-tool-registry";
import type { ArchitectResponse, SkillGraphNode, WorkflowDefinition, WorkflowStep } from "./types";
import type { CoPilotPhase } from "./copilot-state";
import { detectToolHintIds, detectTriggerHintIds } from "./builder-hint-normalization";

// ─── Directive types ─────────────────────────────────────────────────────────

export type WizardDirective =
  | { type: "set_phase"; phase: CoPilotPhase }
  | { type: "update_fields"; name?: string; description?: string; systemName?: string }
  | { type: "set_skills"; nodes: SkillGraphNode[]; workflow: WorkflowDefinition | null; rules: string[]; skillIds: string[] }
  | { type: "connect_tools"; toolIds: string[]; toolConnections: AgentToolConnection[] }
  | { type: "set_triggers"; triggerIds: string[]; triggers: AgentTriggerDefinition[] }
  | { type: "set_rules"; rules: string[] };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeExplicitToolConnections(
  rawConnections: unknown,
): AgentToolConnection[] {
  if (!Array.isArray(rawConnections)) {
    return [];
  }

  return rawConnections
    .map((entry, index) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const toolId =
        typeof record.toolId === "string" ? record.toolId.trim().replace(/_/g, "-")
          : typeof record.tool_id === "string" ? record.tool_id.trim().replace(/_/g, "-")
            : typeof record.name === "string" ? slugify(record.name)
              : `tool-${index + 1}`;
      if (!toolId) return null;

      const definition = getToolDefinition(toolId);
      const requiredEnv = Array.isArray(record.required_env)
        ? record.required_env.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];

      return {
        toolId,
        name:
          (typeof record.name === "string" && record.name.trim())
          || definition?.name
          || toolId.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        description:
          (typeof record.description === "string" && record.description.trim())
          || definition?.description
          || "Architect-recommended tool connection.",
        status:
          record.status === "available"
          || record.status === "configured"
          || record.status === "missing_secret"
          || record.status === "unsupported"
            ? record.status
            : (requiredEnv.length > 0 || (definition?.credentials.length ?? 0) > 0 ? "missing_secret" : "available"),
        authKind:
          record.authKind === "oauth"
          || record.authKind === "api_key"
          || record.authKind === "service_account"
          || record.authKind === "none"
            ? record.authKind
            : definition?.authKind ?? "none",
        connectorType:
          record.connectorType === "mcp"
          || record.connectorType === "api"
          || record.connectorType === "cli"
            ? record.connectorType
            : definition ? "mcp" : "api",
        configSummary: Array.isArray(record.configSummary)
          ? record.configSummary.map((value) => String(value))
          : requiredEnv.length > 0
            ? [`Required env: ${requiredEnv.join(", ")}`]
            : [],
      } satisfies AgentToolConnection;
    })
    .filter((entry): entry is AgentToolConnection => Boolean(entry));
}

function normalizeExplicitTriggers(rawTriggers: unknown): AgentTriggerDefinition[] {
  if (!Array.isArray(rawTriggers)) {
    return [];
  }

  return rawTriggers.map((entry, index) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const title =
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : typeof record.name === "string" && record.name.trim()
            ? record.name.trim()
          : `Trigger ${index + 1}`;
      return {
        id:
          (typeof record.id === "string" && record.id.trim())
          || (typeof record.trigger_id === "string" && record.trigger_id.trim())
          || slugify(title),
        title,
        kind:
          record.kind === "manual" || record.kind === "schedule" || record.kind === "webhook"
            ? record.kind
            : "manual",
        status:
          record.status === "supported" || record.status === "unsupported"
            ? record.status
            : "supported",
        description:
          (typeof record.description === "string" && record.description.trim())
          || title,
        ...((typeof record.schedule === "string" && record.schedule.trim())
          ? { schedule: record.schedule.trim() }
          : (typeof record.cron_expression === "string" && record.cron_expression.trim())
            ? { schedule: record.cron_expression.trim() }
            : {}),
      } satisfies AgentTriggerDefinition;
    });
}

// ─── Rule extraction ─────────────────────────────────────────────────────────

function extractRules(response: ArchitectResponse): string[] {
  const meta = response.agent_metadata;
  const reqs = response.requirements;
  const rules: string[] = [];

  if (meta?.tone) rules.push(`Communicate in a ${meta.tone} tone`);
  if (meta?.schedule_description) rules.push(`Schedule: ${meta.schedule_description}`);
  else if (meta?.cron_expression) rules.push(`Runs on cron: ${meta.cron_expression}`);
  else if (reqs?.schedule) rules.push(`Schedule: ${reqs.schedule}`);
  if (meta?.primary_users) rules.push(`Intended for: ${meta.primary_users}`);
  if (reqs?.required_env_vars && reqs.required_env_vars.length > 0) {
    rules.push(`Requires env: ${reqs.required_env_vars.join(", ")}`);
  }

  return rules;
}

// ─── Workflow normalization ──────────────────────────────────────────────────

function normalizeWorkflow(
  rawWorkflow: WorkflowDefinition | { steps: string[] } | null | undefined,
  nodes: SkillGraphNode[],
  systemName: string | null,
): WorkflowDefinition {
  if (!rawWorkflow) {
    return {
      name: "main-workflow",
      description: `${systemName || "agent"} workflow`,
      steps: nodes.map((node, i) => ({
        id: `step-${i}`,
        action: "execute",
        skill: node.skill_id,
        wait_for: i > 0 ? [nodes[i - 1].skill_id] : [],
      })),
    };
  }

  const rawSteps = (rawWorkflow as { steps: unknown }).steps;
  if (Array.isArray(rawSteps) && rawSteps.length > 0 && typeof rawSteps[0] === "string") {
    return {
      name: "main-workflow",
      description: `${systemName || "agent"} workflow`,
      steps: (rawSteps as string[]).map((skill, i) => ({
        id: `step-${i}`,
        action: "execute",
        skill,
        wait_for: i > 0 ? [(rawSteps as string[])[i - 1]] : [],
      })) as WorkflowStep[],
    };
  }

  return rawWorkflow as WorkflowDefinition;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseWizardDirectives(response: ArchitectResponse): WizardDirective[] {
  const directives: WizardDirective[] = [];

  // Name / metadata
  const name = response.agent_metadata?.agent_name
    || response.system_name
    || response.skill_graph?.system_name
    || null;

  if (name || response.description) {
    directives.push({
      type: "update_fields",
      name: name ?? undefined,
      description: response.description ?? undefined,
      systemName: name ?? undefined,
    });
  }

  // Skill graph
  if (response.skill_graph?.nodes && response.skill_graph.nodes.length > 0) {
    const nodes = response.skill_graph.nodes;
    const systemName = name || nodes[0]?.skill_id?.replace(/_/g, "-").replace(/-skill$/, "") || null;
    const workflow = normalizeWorkflow(response.skill_graph.workflow, nodes, systemName);
    const rules = extractRules(response);

    directives.push({
      type: "set_skills",
      nodes,
      workflow,
      rules,
      skillIds: nodes.map((n) => n.skill_id),
    });

    // Detect tools from skills
    const explicitToolConnections = normalizeExplicitToolConnections(response.tool_connections);
    const toolIds = explicitToolConnections.length > 0
      ? explicitToolConnections.map((tool) => tool.toolId)
      : detectToolHintIds(nodes, response);
    if (toolIds.length > 0) {
      directives.push({
        type: "connect_tools",
        toolIds,
        toolConnections: explicitToolConnections,
      });
    }

    // Rules
    if (rules.length > 0) {
      directives.push({ type: "set_rules", rules });
    }
  }

  // Triggers
  const explicitTriggers = normalizeExplicitTriggers(response.triggers);
  const triggerIds = explicitTriggers.length > 0
    ? explicitTriggers.map((trigger) => trigger.id)
    : detectTriggerHintIds(response);
  if (triggerIds.length > 0) {
    directives.push({
      type: "set_triggers",
      triggerIds,
      triggers: explicitTriggers,
    });
  }

  // Phase advancement
  if (response.type === "ready_for_review" && response.skill_graph?.nodes) {
    directives.push({ type: "set_phase", phase: "skills" });
  }

  return directives;
}

// ─── Build wizard state context for architect ────────────────────────────────

export function buildWizardStateContext(state: {
  devStage?: string;
  phase: string;
  name: string;
  description: string;
  systemName?: string | null;
  selectedSkillIds: string[];
  builtSkillIds?: string[];
  skillGraph?: Array<{ skill_id?: string; name?: string }>;
  connectedTools: Array<{ toolId?: string; name?: string; status?: string }>;
  runtimeInputs?: Array<{ key?: string; required?: boolean; value?: string | null }>;
  triggers: Array<{ id?: string; title?: string; schedule?: string }>;
  channels?: Array<{ kind?: string; label?: string; status?: string }>;
  improvements?: Array<{ title?: string; status?: string }>;
  architecturePlan?: {
    skills?: Array<{ id?: string; name?: string }>;
    integrations?: Array<{ toolId?: string; name?: string }>;
    triggers?: Array<{ id?: string; description?: string }>;
    channels?: string[];
    envVars?: Array<{ key?: string }>;
  } | null;
  agentRules: string[];
  featureContext?: { title: string; description: string; baselineAgent: { name: string; skillCount: number; skills: string[] } } | null;
}): string {
  const parts = [
    `[WIZARD_STATE]`,
    ...(state.devStage ? [`Dev Stage: ${state.devStage}`] : []),
    `Phase: ${state.phase}`,
  ];

  // Feature branch context
  if (state.featureContext) {
    const fc = state.featureContext;
    parts.push(`[FEATURE_MODE]`);
    parts.push(`Mode: Adding a feature to an existing agent — do NOT rebuild from scratch`);
    parts.push(`Feature: "${fc.title}"`);
    if (fc.description) parts.push(`Feature Description: ${fc.description}`);
    parts.push(`Baseline Agent: "${fc.baselineAgent.name}" with ${fc.baselineAgent.skillCount} existing skills`);
    if (fc.baselineAgent.skills.length > 0) parts.push(`Existing Skills: ${fc.baselineAgent.skills.join(", ")}`);
    parts.push(`Instructions: Only create NEW skills/tools needed. Do not modify existing unless required.`);
    parts.push(`[/FEATURE_MODE]`);
  }

  // For Plan stage, include workspace paths instead of full document content.
  // The Plan instruction tells the architect to read files from workspace.
  if (state.devStage === "plan") {
    parts.push(`[WORKSPACE CONTEXT]`);
    parts.push(`Read these files from the workspace before generating the plan:`);
    parts.push(`- .openclaw/discovery/PRD.md`);
    parts.push(`- .openclaw/discovery/TRD.md`);
    parts.push(`- .openclaw/discovery/research-brief.md`);
    parts.push(`[/WORKSPACE CONTEXT]`);
  }

  if (state.name) parts.push(`Name: "${state.name}"`);
  if (state.systemName) parts.push(`System Name: ${state.systemName}`);
  if (state.description) parts.push(`Description: "${state.description}"`);
  if (state.selectedSkillIds.length > 0) parts.push(`Selected Skills: ${state.selectedSkillIds.join(", ")}`);
  if (state.builtSkillIds && state.builtSkillIds.length > 0) {
    parts.push(`Built Skills: ${state.builtSkillIds.join(", ")}`);
  }
  if (state.skillGraph && state.skillGraph.length > 0) {
    parts.push(
      `Skill Graph: ${state.skillGraph.map((skill) => skill.name || skill.skill_id || "unknown").join(", ")}`,
    );
  }
  if (state.connectedTools.length > 0) {
    parts.push(
      `Connected Tools: ${state.connectedTools
        .map((tool) => {
          const label = tool.toolId || tool.name || "unknown";
          return tool.status ? `${label} (${tool.status})` : label;
        })
        .join(", ")}`,
    );
  }
  if (state.runtimeInputs && state.runtimeInputs.length > 0) {
    const requiredInputs = state.runtimeInputs.filter((input) => input.required);
    const filledRequired = requiredInputs.filter((input) => String(input.value ?? "").trim().length > 0).length;
    const runtimeSummary = state.runtimeInputs
      .map((input) => `${input.key || "unknown"} (${String(input.value ?? "").trim().length > 0 ? "filled" : "missing"})`)
      .join(", ");
    parts.push(`Runtime Inputs: required ${filledRequired}/${requiredInputs.length} filled | ${runtimeSummary}`);
  }
  if (state.triggers.length > 0) {
    parts.push(`Triggers: ${state.triggers.map((trigger) => trigger.id || trigger.title || "unknown").join(", ")}`);
    const heartbeat = state.triggers.find((trigger) => trigger.schedule)?.title || state.triggers.find((trigger) => trigger.schedule)?.schedule;
    if (heartbeat) {
      parts.push(`Heartbeat: ${heartbeat}`);
    }
  }
  if (state.channels && state.channels.length > 0) {
    parts.push(
      `Channels: ${state.channels
        .map((channel) => {
          const label = channel.kind || channel.label || "unknown";
          return channel.status ? `${label} (${channel.status})` : label;
        })
        .join(", ")}`,
    );
  }
  if (state.improvements && state.improvements.length > 0) {
    const accepted = state.improvements.filter((item) => item.status === "accepted").map((item) => item.title).filter(Boolean);
    if (accepted.length > 0) {
      parts.push(`Accepted Improvements: ${accepted.join(", ")}`);
    }
  }
  if (state.architecturePlan) {
    const planParts: string[] = [];
    if (state.architecturePlan.skills?.length) planParts.push(`skills=${state.architecturePlan.skills.length}`);
    if (state.architecturePlan.integrations?.length) planParts.push(`integrations=${state.architecturePlan.integrations.length}`);
    if (state.architecturePlan.triggers?.length) planParts.push(`triggers=${state.architecturePlan.triggers.length}`);
    if (state.architecturePlan.channels?.length) planParts.push(`channels=${state.architecturePlan.channels.join(", ")}`);
    if (state.architecturePlan.envVars?.length) {
      planParts.push(`env=${state.architecturePlan.envVars.map((env) => env.key).filter(Boolean).join(", ")}`);
    }
    if (planParts.length > 0) {
      parts.push(`Architecture Plan: ${planParts.join(" | ")}`);
    }
  }
  if (state.agentRules.length > 0) {
    parts.push(`Rules: ${state.agentRules.join("; ")}`);
  }
  if (state.name || state.description || state.agentRules.length > 0) {
    const soulBits = [
      state.name ? `${state.name}` : null,
      state.description ? state.description : null,
      state.agentRules.length > 0 ? `Rules: ${state.agentRules.join("; ")}` : null,
    ].filter(Boolean);
    parts.push(`SOUL Summary: ${soulBits.join(" | ")}`);
  }

  parts.push(`[/WIZARD_STATE]`);
  return parts.join("\n");
}
