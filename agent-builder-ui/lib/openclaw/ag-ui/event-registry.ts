/**
 * Event Registry — pure-function module that converts ArchitectResponse → BaseEvent[].
 *
 * No side effects, no Observable, no React. Each response type has a small
 * handler that returns an array of AG-UI events. This makes the response→event
 * mapping trivially unit-testable.
 *
 * Usage in builder-agent.ts:
 *   const events = processResponse(response, context);
 *   for (const event of events) observer.next(event);
 */

import { EventType } from "@ag-ui/core";
import type { BaseEvent } from "@ag-ui/core";
import type { ArchitectResponse } from "../types";
import type { SkillGraphReadyPayload } from "./types";
import { CustomEventName } from "./types";
import { parseWizardDirectives } from "../wizard-directive-parser";
import { detectChannelHintIds } from "../builder-hint-normalization";
import { tracer } from "./event-tracer";

// ─── Context passed to every handler ────────────────────────────────────────

export interface EventContext {
  messageId: string;
  isCopilot: boolean;
  hasStreamedDeltas: boolean;
  threadId: string;
  runId: string;
}

// ─── Handler type ───────────────────────────────────────────────────────────

type ResponseHandler = (
  response: ArchitectResponse,
  ctx: EventContext,
) => BaseEvent[];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function customEvent(name: string, value: unknown): BaseEvent {
  return { type: EventType.CUSTOM, name, value } as BaseEvent;
}

export function textMessageEvents(messageId: string, content: string): BaseEvent[] {
  return [
    { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" } as BaseEvent,
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: content } as BaseEvent,
    { type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent,
  ];
}

export function formatAgentName(systemName: string): string {
  if (systemName.includes("-")) {
    return systemName
      .split("-")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return systemName;
}

function extractNameFromContent(content: string): string | null {
  const patterns = [
    /\*?\*?(?:Agent Name|Name)\*?\*?\s*[:：]\s*\*?\*?(.{3,50}?)\*?\*?\s*(?:\n|$)/i,
    /(?:I'll call (?:this|the) agent|(?:Introducing|Meet)) [""]?(.{3,50}?)[""]?(?:\.|,|\n|$)/i,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractDescriptionFromContent(content: string): string | null {
  const patterns = [
    /\*?\*?(?:Description|Purpose)\*?\*?\s*[:：]\s*(.{10,200}?)(?:\n|$)/i,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

// ─── Normalize workflow (exact copy from builder-agent.ts) ─────────────────

function normalizeWorkflow(
  rawWorkflow: import("../types").WorkflowDefinition | { steps: string[] } | null | undefined,
  nodes: Array<{ skill_id: string }>,
  systemName: string | null,
): import("../types").WorkflowDefinition {
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
    } as import("../types").WorkflowDefinition;
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
      })),
    } as import("../types").WorkflowDefinition;
  }

  return rawWorkflow as import("../types").WorkflowDefinition;
}

// ─── Extract rules (moved from builder-agent.ts) ──────────────────────────

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

// ─── Emit metadata directives as events ─────────────────────────────────────

function directivesToEvents(response: ArchitectResponse, skipPhase = false, contentFallback?: string): BaseEvent[] {
  const events: BaseEvent[] = [];
  const directives = parseWizardDirectives(response);
  for (const directive of directives) {
    if (directive.type === "set_phase" && skipPhase) continue;
    switch (directive.type) {
      case "update_fields":
        events.push(customEvent(CustomEventName.WIZARD_UPDATE_FIELDS, {
          name: directive.name,
          description: directive.description ?? contentFallback ?? response.content,
          systemName: directive.systemName,
        }));
        break;
      case "set_skills":
        events.push(customEvent(CustomEventName.WIZARD_SET_SKILLS, {
          nodes: directive.nodes,
          workflow: directive.workflow,
          rules: directive.rules,
          skillIds: directive.skillIds,
        }));
        break;
      case "connect_tools":
        events.push(customEvent(CustomEventName.WIZARD_CONNECT_TOOLS, {
          toolIds: directive.toolIds,
          toolConnections: (directive as unknown as Record<string, unknown>).toolConnections,
        }));
        break;
      case "set_triggers":
        events.push(customEvent(CustomEventName.WIZARD_SET_TRIGGERS, {
          triggerIds: directive.triggerIds,
          triggers: (directive as unknown as Record<string, unknown>).triggers,
        }));
        break;
      case "set_rules":
        events.push(customEvent(CustomEventName.WIZARD_SET_RULES, {
          rules: directive.rules,
        }));
        break;
      case "set_phase":
        events.push(customEvent(CustomEventName.WIZARD_SET_PHASE, {
          phase: directive.phase,
        }));
        break;
    }
  }
  return events;
}

// ─── Response Handlers ──────────────────────────────────────────────────────

function handleDiscovery(response: ArchitectResponse, ctx: EventContext): BaseEvent[] {
  const events: BaseEvent[] = [];
  const raw = response as unknown as Record<string, unknown>;
  const prd = raw.prd;
  const trd = raw.trd;
  const systemName = (raw.system_name as string) || null;
  const content = response.content || "Requirements documents generated.";

  if (systemName) {
    const name = formatAgentName(systemName);
    events.push(customEvent(CustomEventName.WIZARD_UPDATE_FIELDS, {
      name, description: content, systemName: name,
    }));
  }

  if (prd && trd) {
    events.push(customEvent("discovery_documents", { prd, trd, systemName, content }));
  } else {
    tracer.drop("builder-agent", "CUSTOM", "discovery_documents", "prd or trd missing from response");
  }

  if (!ctx.isCopilot || !ctx.hasStreamedDeltas) {
    events.push(...textMessageEvents(ctx.messageId, content));
  }

  return events;
}

function handleReadyForReview(response: ArchitectResponse, ctx: EventContext): BaseEvent[] {
  const events: BaseEvent[] = [];

  if (!response.skill_graph) {
    if (!ctx.isCopilot || !ctx.hasStreamedDeltas) {
      events.push(...textMessageEvents(ctx.messageId, response.content || "Analysis complete."));
    }
    return events;
  }

  const systemName =
    response.system_name ||
    response.skill_graph.system_name ||
    (response.skill_graph.nodes[0]?.skill_id
      ? response.skill_graph.nodes[0].skill_id.replace(/_/g, "-").replace(/-skill$/, "")
      : null) ||
    null;

  const workflow = normalizeWorkflow(
    response.skill_graph.workflow,
    response.skill_graph.nodes,
    systemName,
  );

  const agentRules = extractRules(response);
  const directives = parseWizardDirectives(response);

  const toolConnectionHints = directives.flatMap((directive) =>
    directive.type === "connect_tools" ? directive.toolIds : [],
  );
  const explicitToolConnections = directives.flatMap((directive) =>
    directive.type === "connect_tools" ? directive.toolConnections : [],
  );
  const triggerHints = directives.flatMap((directive) =>
    directive.type === "set_triggers" ? directive.triggerIds : [],
  );
  const explicitTriggers = directives.flatMap((directive) =>
    directive.type === "set_triggers" ? directive.triggers : [],
  );
  const channelHints = detectChannelHintIds(response.skill_graph.nodes, response);

  const content =
    response.content
    || `I've analysed your requirements and generated a skill graph with ${response.skill_graph.nodes.length} skills. Review the configuration on the right and click Deploy when ready.`;

  const payload: SkillGraphReadyPayload = {
    skillGraph: response.skill_graph.nodes,
    workflow,
    systemName,
    agentRules,
    toolConnectionHints,
    toolConnections: explicitToolConnections as import("@/lib/agents/types").AgentToolConnection[],
    triggerHints,
    triggers: explicitTriggers as import("@/lib/agents/types").AgentTriggerDefinition[],
    channelHints,
    content,
  };

  // Main skill graph event
  events.push(customEvent(CustomEventName.SKILL_GRAPH_READY, payload));

  // Wizard directive events (skip set_phase — we emit it explicitly below)
  events.push(...directivesToEvents(response, /* skipPhase */ true, content));

  // Channel hints
  if (channelHints.length > 0) {
    events.push(customEvent(CustomEventName.WIZARD_SET_CHANNELS, { channelIds: channelHints }));
  }

  // Phase advance to Skills
  events.push(customEvent(CustomEventName.WIZARD_SET_PHASE, { phase: "skills" }));

  return events;
}

function handleClarification(response: ArchitectResponse, ctx: EventContext): BaseEvent[] {
  const events: BaseEvent[] = [];
  const raw = response as unknown as Record<string, unknown>;
  const content = (raw.context as string)
    || response.content
    || (response.questions ?? []).map((q) => {
      if (typeof q === "string") return q;
      const qObj = q as Record<string, unknown>;
      return (qObj.question as string) || String(q);
    }).join("\n\n")
    || "Could you provide more details?";

  if (!ctx.isCopilot || !ctx.hasStreamedDeltas) {
    events.push(...textMessageEvents(ctx.messageId, content));
  }

  // Push metadata directives (no phase advance)
  events.push(...directivesToEvents(response, /* skipPhase */ true));

  return events;
}

function handleAgentResponse(response: ArchitectResponse, ctx: EventContext): BaseEvent[] {
  const content = response.content || "I'm processing your request...";

  // Failsafe: the server-side parser may fail to extract embedded structured
  // JSON (discovery / architecture_plan) from the agent's text response,
  // returning type: "agent_response" with the raw text in content. Try to
  // re-parse it here so the Think/Plan stages still work.
  const embeddedResponse = tryExtractEmbeddedResponse(content);
  if (embeddedResponse) {
    const fakeResponse = { ...embeddedResponse, content } as unknown as ArchitectResponse;
    if (embeddedResponse.type === "discovery" && embeddedResponse.prd && embeddedResponse.trd) {
      tracer.emit("builder-agent", "CUSTOM", "discovery_documents", "agent_response-failsafe");
      return handleDiscovery(fakeResponse, ctx);
    }
    if (embeddedResponse.type === "architecture_plan" && embeddedResponse.architecture_plan) {
      tracer.emit("builder-agent", "CUSTOM", "architecture_plan_ready", "agent_response-failsafe");
      return handleArchitecturePlan(fakeResponse, ctx);
    }
    if (embeddedResponse.type === "ready_for_review" && embeddedResponse.skill_graph) {
      return handleReadyForReview({ ...fakeResponse, skill_graph: embeddedResponse.skill_graph } as unknown as ArchitectResponse, ctx);
    }
  }

  const events: BaseEvent[] = [];

  if (!ctx.isCopilot || !ctx.hasStreamedDeltas) {
    events.push(...textMessageEvents(ctx.messageId, content));
  }

  // Push metadata directives
  events.push(...directivesToEvents(response, /* skipPhase */ true));

  // Infer name/description from conversational text
  const inferredName = response.system_name
    || response.agent_metadata?.agent_name
    || extractNameFromContent(content);
  const inferredDescription = response.description
    || extractDescriptionFromContent(content);

  if (inferredName || inferredDescription) {
    events.push(customEvent(CustomEventName.WIZARD_UPDATE_FIELDS, {
      ...(inferredName ? { name: inferredName, systemName: inferredName } : {}),
      ...(inferredDescription ? { description: inferredDescription } : {}),
    }));
  }

  return events;
}

/**
 * Try to extract a structured response (discovery, architecture_plan, ready_for_review)
 * from raw text content. Handles code blocks and raw JSON.
 */
function tryExtractEmbeddedResponse(text: string): Record<string, unknown> | null {
  // Try code block: ```ready_for_review ... ``` or ```json ... ```
  const codeBlockMatch = text.match(/```(?:ready_for_review|discovery|architecture_plan|json)\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]) as Record<string, unknown>;
      if (typeof parsed.type === "string") return parsed;
    } catch { /* fall through */ }
  }

  // Try raw JSON with known types — use brace-counting for reliable extraction
  const KNOWN_TYPES = ["discovery", "architecture_plan", "ready_for_review"];
  for (const knownType of KNOWN_TYPES) {
    const marker = `"type"`;
    const typePattern = new RegExp(`"type"\\s*:\\s*"${knownType}"`);
    const typeMatch = typePattern.exec(text);
    if (!typeMatch) continue;

    // Walk backwards to find the opening `{`
    let startIdx = -1;
    for (let i = typeMatch.index; i >= 0; i--) {
      if (text[i] === "{") { startIdx = i; break; }
    }
    if (startIdx === -1) continue;

    // Walk forward counting braces to find the matching `}`
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(startIdx, i + 1)) as Record<string, unknown>;
          } catch { break; }
        }
      }
    }
  }

  return null;
}

function handleError(response: ArchitectResponse): BaseEvent[] {
  return [{
    type: EventType.RUN_ERROR,
    message: response.content || response.error || "Something went wrong. Please try again.",
  } as BaseEvent];
}

function handleDefault(response: ArchitectResponse, ctx: EventContext): BaseEvent[] {
  const raw = response as unknown as Record<string, unknown>;

  // Failsafe: discovery response that didn't match the typed switch
  if (raw.type === "discovery" && raw.prd && raw.trd) {
    tracer.emit("builder-agent", "CUSTOM", "discovery_documents", "default-failsafe");
    return handleDiscovery(response, ctx);
  }

  // Failsafe: architecture_plan response
  if (raw.type === "architecture_plan" && raw.architecture_plan) {
    tracer.emit("builder-agent", "CUSTOM", "architecture_plan_ready", "default-failsafe");
    return handleArchitecturePlan(response, ctx);
  }

  const events: BaseEvent[] = [];
  const content =
    response.content
    || (raw.message as string)
    || (raw.context as string)
    || JSON.stringify(response, null, 2);

  if (!ctx.isCopilot || !ctx.hasStreamedDeltas) {
    events.push(...textMessageEvents(ctx.messageId, content));
  }

  events.push(...directivesToEvents(response, /* skipPhase */ true));

  return events;
}

// ─── Handler registry ───────────────────────────────────────────────────────

function handleArchitecturePlan(response: ArchitectResponse, ctx: EventContext): BaseEvent[] {
  const events: BaseEvent[] = [];
  const raw = response as unknown as Record<string, unknown>;
  const plan = raw.architecture_plan ?? response.architecture_plan;
  const systemName = (raw.system_name as string) || null;
  const content = response.content || "Architecture plan generated.";

  if (systemName) {
    const name = formatAgentName(systemName);
    events.push(customEvent(CustomEventName.WIZARD_UPDATE_FIELDS, {
      name, description: content, systemName: name,
    }));
  }

  if (plan) {
    events.push(customEvent("architecture_plan_ready", { plan, systemName, content }));
  } else {
    tracer.drop("builder-agent", "CUSTOM", "architecture_plan_ready", "architecture_plan missing from response");
  }

  if (!ctx.isCopilot || !ctx.hasStreamedDeltas) {
    events.push(...textMessageEvents(ctx.messageId, content));
  }

  return events;
}

const handlers: Record<string, ResponseHandler> = {
  discovery: handleDiscovery,
  architecture_plan: handleArchitecturePlan,
  ready_for_review: handleReadyForReview,
  clarification: handleClarification,
  agent_response: handleAgentResponse,
  error: handleError,
};

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Convert an ArchitectResponse into an array of AG-UI BaseEvent objects.
 * Pure function — no side effects, no Observable, fully unit-testable.
 */
export function processResponse(
  response: ArchitectResponse,
  context: EventContext,
): BaseEvent[] {
  const responseType = response.type;
  const handler = handlers[responseType]
    // Fallback: check raw type (catches TypeScript narrowing mismatches)
    ?? handlers[(response as unknown as Record<string, unknown>).type as string]
    ?? handleDefault;

  tracer.emit("builder-agent", "processResponse", responseType);

  const events = handler(response, context);

  // Trace each event
  for (const event of events) {
    const name = (event as unknown as Record<string, unknown>).name as string | undefined;
    tracer.emit("builder-agent", (event as Record<string, string>).type, name);
  }

  return events;
}

// ─── Exported for testing ───────────────────────────────────────────────────

export const _handlers = handlers;
export { handleDiscovery, handleArchitecturePlan, handleReadyForReview, handleClarification, handleAgentResponse, handleError, handleDefault };
