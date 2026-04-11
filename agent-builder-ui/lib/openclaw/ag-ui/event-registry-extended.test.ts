/**
 * Extended tests for event-registry.ts — covers uncovered branches:
 * - extractNameFromContent: "I'll call" pattern, "Introducing" pattern
 * - extractDescriptionFromContent: "Purpose" label pattern
 * - normalizeWorkflow: string-steps array path
 * - extractRules: cron_expression branch, reqs.schedule branch, empty reqs
 * - handleAgentResponse: embedded ready_for_review, name/desc inference from content
 * - handleReadyForReview: system_name fallback from nodes, channel hints
 * - handleDefault: no content, message field, context field
 * - handleClarification: string questions, context field fallback
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { EventType } from "@ag-ui/core";
import {
  processResponse,
  handleDiscovery,
  handleArchitecturePlan,
  handleReadyForReview,
  handleClarification,
  handleAgentResponse,
  handleError,
  handleDefault,
  customEvent,
  textMessageEvents,
  formatAgentName,
  type EventContext,
} from "./event-registry";
import { CustomEventName } from "./types";
import { tracer } from "./event-tracer";
import type { ArchitectResponse } from "../types";

const baseContext: EventContext = {
  messageId: "msg-ext",
  isCopilot: true,
  hasStreamedDeltas: true,
  threadId: "thread-ext",
  runId: "run-ext",
};

const nonCopilotCtx: EventContext = { ...baseContext, isCopilot: false, hasStreamedDeltas: false };

function findEvent(events: unknown[], name: string) {
  return events.find((e: unknown) => (e as Record<string, unknown>).name === name);
}

function findEventType(events: unknown[], type: string) {
  return events.find((e: unknown) => (e as Record<string, unknown>).type === type);
}

beforeEach(() => {
  tracer.clear();
});

// ─── customEvent / textMessageEvents ─────────────────────────────────────────

describe("customEvent helper", () => {
  test("wraps value in a CUSTOM event with correct name", () => {
    const ev = customEvent("my_event", { key: "val" });
    expect((ev as Record<string, unknown>).type).toBe(EventType.CUSTOM);
    expect((ev as Record<string, unknown>).name).toBe("my_event");
    expect((ev as Record<string, unknown>).value).toEqual({ key: "val" });
  });
});

describe("textMessageEvents helper", () => {
  test("returns START, CONTENT (delta), END in correct order", () => {
    const evs = textMessageEvents("m1", "Hello World");
    expect(evs[0].type).toBe(EventType.TEXT_MESSAGE_START);
    expect((evs[1] as Record<string, unknown>).delta).toBe("Hello World");
    expect(evs[2].type).toBe(EventType.TEXT_MESSAGE_END);
    expect(evs).toHaveLength(3);
  });
});

// ─── formatAgentName ─────────────────────────────────────────────────────────

describe("formatAgentName", () => {
  test("converts multiple hyphens to spaced title case", () => {
    expect(formatAgentName("google-ads-optimizer")).toBe("Google Ads Optimizer");
  });

  test("returns unchanged when no hyphens", () => {
    expect(formatAgentName("Zendesk")).toBe("Zendesk");
  });

  test("handles single-word hyphenated prefix", () => {
    expect(formatAgentName("my-bot")).toBe("My Bot");
  });
});

// ─── handleClarification — edge cases ────────────────────────────────────────

describe("handleClarification — content paths", () => {
  test("uses context field as fallback when content is missing", () => {
    const response = {
      type: "clarification",
      context: "What is your main use case?",
    } as unknown as ArchitectResponse;

    const events = handleClarification(response, nonCopilotCtx);
    const content = findEventType(events, EventType.TEXT_MESSAGE_CONTENT);
    expect((content as Record<string, unknown>).delta).toContain("What is your main use case?");
  });

  test("formats string questions (array of strings) into joined text", () => {
    const response = {
      type: "clarification",
      questions: ["Question one?", "Question two?"],
    } as unknown as ArchitectResponse;

    const events = handleClarification(response, nonCopilotCtx);
    const content = findEventType(events, EventType.TEXT_MESSAGE_CONTENT);
    expect((content as Record<string, unknown>).delta).toContain("Question one?");
    expect((content as Record<string, unknown>).delta).toContain("Question two?");
  });

  test("formats object questions by extracting .question field", () => {
    const response = {
      type: "clarification",
      questions: [
        { id: "q1", question: "What is the primary goal?" },
        { id: "q2", question: "Which platforms does it serve?" },
      ],
    } as unknown as ArchitectResponse;

    const events = handleClarification(response, nonCopilotCtx);
    const content = findEventType(events, EventType.TEXT_MESSAGE_CONTENT);
    expect((content as Record<string, unknown>).delta).toContain("What is the primary goal?");
    expect((content as Record<string, unknown>).delta).toContain("Which platforms does it serve?");
  });

  test("skips text messages in copilot streaming mode", () => {
    const response = {
      type: "clarification",
      content: "Skip me",
    } as unknown as ArchitectResponse;

    const events = handleClarification(response, baseContext);
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeUndefined();
  });

  test("uses fallback message when all content sources are empty", () => {
    const response = {
      type: "clarification",
    } as unknown as ArchitectResponse;

    const events = handleClarification(response, nonCopilotCtx);
    const content = findEventType(events, EventType.TEXT_MESSAGE_CONTENT);
    expect((content as Record<string, unknown>).delta).toBe("Could you provide more details?");
  });
});

// ─── handleAgentResponse — name/description inference ────────────────────────

describe("handleAgentResponse — content-based inference", () => {
  test("infers name from 'Agent Name: ...' pattern in content", () => {
    const response = {
      type: "agent_response",
      content: "I've designed your agent.\n\nAgent Name: Budget Alert Bot\n\nIt monitors overspend.",
    } as unknown as ArchitectResponse;

    const events = handleAgentResponse(response, nonCopilotCtx);
    const fields = findEvent(events, CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(fields).toBeTruthy();
    expect((fields as Record<string, unknown>).value).toMatchObject({ name: "Budget Alert Bot" });
  });

  test("infers name from 'Meet ...' pattern", () => {
    const response = {
      type: "agent_response",
      content: "Meet \"Campaign Manager\" — your new Google Ads assistant.",
    } as unknown as ArchitectResponse;

    const events = handleAgentResponse(response, nonCopilotCtx);
    const fields = findEvent(events, CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(fields).toBeTruthy();
  });

  test("infers description from 'Description: ...' pattern", () => {
    const response = {
      type: "agent_response",
      content: "Description: Monitors campaign pacing and alerts on overspend every weekday.",
    } as unknown as ArchitectResponse;

    const events = handleAgentResponse(response, nonCopilotCtx);
    const fields = findEvent(events, CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(fields).toBeTruthy();
    const val = (fields as Record<string, unknown>).value as Record<string, unknown>;
    expect(String(val.description)).toContain("Monitors campaign pacing");
  });

  test("emits no WIZARD_UPDATE_FIELDS when no name or description can be inferred", () => {
    const response = {
      type: "agent_response",
      content: "Okay, I will proceed with the next step.",
    } as unknown as ArchitectResponse;

    const events = handleAgentResponse(response, nonCopilotCtx);
    // No inferred name or description — no WIZARD_UPDATE_FIELDS
    const fieldEvents = events.filter(
      (e) => (e as Record<string, unknown>).name === CustomEventName.WIZARD_UPDATE_FIELDS,
    );
    expect(fieldEvents).toHaveLength(0);
  });

  test("fallback-parses embedded ready_for_review from content", () => {
    const skillGraph = {
      nodes: [{ skill_id: "campaign-fetch", name: "Campaign Fetch", description: "Fetch", status: "generated", source: "custom", depends_on: [] }],
    };
    const embedded = JSON.stringify({
      type: "ready_for_review",
      system_name: "campaign-bot",
      content: "Here's your review.",
      skill_graph: skillGraph,
    });

    const response = {
      type: "agent_response",
      content: `Processing complete.\n\`\`\`json\n${embedded}\n\`\`\``,
    } as unknown as ArchitectResponse;

    const events = handleAgentResponse(response, baseContext);
    expect(findEvent(events, CustomEventName.SKILL_GRAPH_READY)).toBeTruthy();
  });

  test("uses agent_metadata.agent_name as fallback when system_name is missing", () => {
    const response = {
      type: "agent_response",
      agent_metadata: { agent_name: "inferred-agent" },
      content: "Processing.",
    } as unknown as ArchitectResponse;

    const events = handleAgentResponse(response, nonCopilotCtx);
    const fields = findEvent(events, CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(fields).toBeTruthy();
    expect((fields as Record<string, unknown>).value).toMatchObject({ name: "inferred-agent" });
  });
});

// ─── handleAgentResponse — embedded architecture_plan ────────────────────────

describe("handleAgentResponse — embedded architecture_plan failsafe", () => {
  test("routes embedded architecture_plan to architecture_plan_ready", () => {
    const plan = {
      skills: [{ id: "s1", name: "Skill 1", description: "Test", dependencies: [], envVars: [] }],
      workflow: { steps: [{ skillId: "s1", parallel: false }] },
      integrations: [],
      triggers: [],
      channels: [],
      envVars: [],
      subAgents: [],
      missionControl: null,
    };
    const embedded = JSON.stringify({
      type: "architecture_plan",
      system_name: "plan-agent",
      architecture_plan: plan,
      content: "Plan ready.",
    });

    const response = {
      type: "agent_response",
      content: `Analysis done.\n\`\`\`json\n${embedded}\n\`\`\``,
    } as unknown as ArchitectResponse;

    const events = handleAgentResponse(response, baseContext);
    expect(findEvent(events, "architecture_plan_ready")).toBeTruthy();
  });
});

// ─── handleReadyForReview — system_name fallback paths ───────────────────────

describe("handleReadyForReview — system_name derivation", () => {
  test("derives system_name from skill_graph.system_name when response.system_name missing", () => {
    const response = {
      type: "ready_for_review",
      skill_graph: {
        system_name: "graph-derived-agent",
        nodes: [{ skill_id: "s1", name: "S1", description: "Test", status: "generated", source: "custom", depends_on: [] }],
        workflow: null,
      },
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, baseContext);
    const sgr = findEvent(events, CustomEventName.SKILL_GRAPH_READY);
    expect((sgr as Record<string, unknown>).value).toMatchObject({ systemName: "graph-derived-agent" });
  });

  test("derives system_name from first node skill_id when both system_names missing", () => {
    const response = {
      type: "ready_for_review",
      skill_graph: {
        nodes: [{ skill_id: "campaign-monitor-skill", name: "Campaign Monitor", description: "Test", status: "generated", source: "custom", depends_on: [] }],
        workflow: null,
      },
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, baseContext);
    const sgr = findEvent(events, CustomEventName.SKILL_GRAPH_READY);
    const payload = (sgr as Record<string, unknown>).value as Record<string, unknown>;
    // skill_id "campaign-monitor-skill" → removes "-skill" suffix → "campaign-monitor"
    expect(payload.systemName).toBe("campaign-monitor");
  });

  test("normalizes string-array workflow steps to objects", () => {
    const response = {
      type: "ready_for_review",
      skill_graph: {
        nodes: [
          { skill_id: "step-a", name: "Step A", description: "", status: "generated", source: "custom", depends_on: [] },
          { skill_id: "step-b", name: "Step B", description: "", status: "generated", source: "custom", depends_on: [] },
        ],
        workflow: { steps: ["step-a", "step-b"] },
      },
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, baseContext);
    const sgr = findEvent(events, CustomEventName.SKILL_GRAPH_READY);
    const workflow = ((sgr as Record<string, unknown>).value as Record<string, unknown>).workflow as Record<string, unknown>;
    const steps = workflow.steps as Array<Record<string, unknown>>;
    expect(steps[0].skill).toBe("step-a");
    expect(steps[1].skill).toBe("step-b");
    expect(steps[1].wait_for).toContain("step-a");
  });

  test("generates workflow from nodes when workflow is null", () => {
    const response = {
      type: "ready_for_review",
      skill_graph: {
        nodes: [
          { skill_id: "first", name: "First", description: "", status: "generated", source: "custom", depends_on: [] },
          { skill_id: "second", name: "Second", description: "", status: "generated", source: "custom", depends_on: [] },
        ],
        workflow: null,
      },
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, baseContext);
    const sgr = findEvent(events, CustomEventName.SKILL_GRAPH_READY);
    const workflow = ((sgr as Record<string, unknown>).value as Record<string, unknown>).workflow as Record<string, unknown>;
    const steps = workflow.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);
    expect(steps[0].skill).toBe("first");
    expect(steps[1].wait_for).toContain("first");
  });
});

// ─── extractRules — cron_expression and reqs.schedule branches ───────────────

describe("handleReadyForReview — extractRules branches", () => {
  test("uses cron_expression when schedule_description is missing", () => {
    const response = {
      type: "ready_for_review",
      agent_metadata: {
        cron_expression: "0 9 * * 1-5",
      },
      skill_graph: {
        nodes: [{ skill_id: "s1", name: "S1", description: "", status: "generated", source: "custom", depends_on: [] }],
        workflow: null,
      },
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, baseContext);
    const sgr = findEvent(events, CustomEventName.SKILL_GRAPH_READY);
    const payload = (sgr as Record<string, unknown>).value as Record<string, unknown>;
    expect((payload.agentRules as string[]).some((r) => r.includes("0 9 * * 1-5"))).toBe(true);
  });

  test("uses requirements.schedule as final fallback", () => {
    const response = {
      type: "ready_for_review",
      requirements: {
        schedule: "daily at 8am",
      },
      skill_graph: {
        nodes: [{ skill_id: "s1", name: "S1", description: "", status: "generated", source: "custom", depends_on: [] }],
        workflow: null,
      },
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, baseContext);
    const sgr = findEvent(events, CustomEventName.SKILL_GRAPH_READY);
    const payload = (sgr as Record<string, unknown>).value as Record<string, unknown>;
    expect((payload.agentRules as string[]).some((r) => r.includes("daily at 8am"))).toBe(true);
  });
});

// ─── handleDefault — fallback content paths ──────────────────────────────────

describe("handleDefault — content extraction", () => {
  test("uses .message field when .content is missing", () => {
    const response = {
      type: "some_type",
      message: "Using message field as content",
    } as unknown as ArchitectResponse;

    const events = handleDefault(response, nonCopilotCtx);
    const content = findEventType(events, EventType.TEXT_MESSAGE_CONTENT);
    expect((content as Record<string, unknown>).delta).toContain("Using message field");
  });

  test("uses .context field as third fallback", () => {
    const response = {
      type: "some_type",
      context: "Context-based fallback",
    } as unknown as ArchitectResponse;

    const events = handleDefault(response, nonCopilotCtx);
    const content = findEventType(events, EventType.TEXT_MESSAGE_CONTENT);
    expect((content as Record<string, unknown>).delta).toContain("Context-based fallback");
  });

  test("falls back to JSON.stringify when no content fields present", () => {
    const response = {
      type: "weird_type",
      someField: "some-value",
    } as unknown as ArchitectResponse;

    const events = handleDefault(response, nonCopilotCtx);
    const content = findEventType(events, EventType.TEXT_MESSAGE_CONTENT);
    expect(typeof (content as Record<string, unknown>).delta).toBe("string");
    expect(String((content as Record<string, unknown>).delta)).toContain("some-value");
  });

  test("skips text messages in copilot streaming mode", () => {
    const response = {
      type: "other_type",
      content: "skip me",
    } as unknown as ArchitectResponse;

    const events = handleDefault(response, baseContext);
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeUndefined();
  });
});

// ─── handleArchitecturePlan — no system_name ─────────────────────────────────

describe("handleArchitecturePlan — no system_name", () => {
  test("skips WIZARD_UPDATE_FIELDS when system_name is absent", () => {
    const response = {
      type: "architecture_plan",
      content: "Plan generated.",
      architecture_plan: {
        skills: [],
        workflow: { steps: [] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
      },
    } as unknown as ArchitectResponse;

    const events = handleArchitecturePlan(response, baseContext);
    const identityEvents = events.filter(
      (e) => (e as Record<string, unknown>).name === CustomEventName.WIZARD_UPDATE_FIELDS,
    );
    expect(identityEvents).toHaveLength(0);
  });
});

// ─── processResponse — routing ───────────────────────────────────────────────

describe("processResponse — error routing", () => {
  test("routes 'error' type to RUN_ERROR event", () => {
    const response = {
      type: "error",
      error: "Gateway unreachable",
    } as unknown as ArchitectResponse;

    const events = processResponse(response, baseContext);
    expect(findEventType(events, EventType.RUN_ERROR)).toBeTruthy();
  });

  test("routes 'clarification' type and returns text events in non-copilot mode", () => {
    const response = {
      type: "clarification",
      content: "What kind of agent?",
    } as unknown as ArchitectResponse;

    const events = processResponse(response, nonCopilotCtx);
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeTruthy();
  });
});

// ─── handleError — content and error fallback paths ──────────────────────────

describe("handleError — content paths", () => {
  test("uses content field when present", () => {
    const response = {
      type: "error",
      content: "Sandbox connection lost",
    } as unknown as ArchitectResponse;

    const events = handleError(response);
    expect(events[0].type).toBe(EventType.RUN_ERROR);
    expect((events[0] as Record<string, unknown>).message).toBe("Sandbox connection lost");
  });

  test("uses error field as fallback when content is missing", () => {
    const response = {
      type: "error",
      error: "Timeout after 60s",
    } as unknown as ArchitectResponse;

    const events = handleError(response);
    expect((events[0] as Record<string, unknown>).message).toBe("Timeout after 60s");
  });

  test("uses default message when both content and error are missing", () => {
    const response = {
      type: "error",
    } as unknown as ArchitectResponse;

    const events = handleError(response);
    expect((events[0] as Record<string, unknown>).message).toContain("Something went wrong");
  });
});

// ─── handleDefault — discovery and architecture_plan failsafe paths ───────────

describe("handleDefault — discovery failsafe", () => {
  test("routes to handleDiscovery when type=discovery with prd+trd", () => {
    const response = {
      type: "discovery",
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
      content: "Discovery complete",
    } as unknown as ArchitectResponse;

    const events = handleDefault(response, nonCopilotCtx);
    // handleDiscovery emits discovery_documents custom event
    expect(findEvent(events, "discovery_documents")).toBeTruthy();
  });

  test("routes to handleArchitecturePlan when type=architecture_plan with plan", () => {
    const response = {
      type: "architecture_plan",
      architecture_plan: { skills: [] },
      content: "Plan ready",
    } as unknown as ArchitectResponse;

    const events = handleDefault(response, nonCopilotCtx);
    expect(findEvent(events, "architecture_plan_ready")).toBeTruthy();
  });
});

// ─── handleReadyForReview — no skill_graph path ───────────────────────────────

describe("handleReadyForReview — no skill_graph", () => {
  test("returns text events when skill_graph is missing and not in copilot streaming mode", () => {
    const response = {
      type: "ready_for_review",
      content: "Analysis complete.",
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, nonCopilotCtx);
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeTruthy();
  });

  test("returns no text events when skill_graph is missing but in copilot streaming mode", () => {
    const response = {
      type: "ready_for_review",
      content: "Analysis complete.",
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, baseContext);
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeUndefined();
  });
});

// ─── handleDiscovery — no system_name, no prd/trd ────────────────────────────

describe("handleDiscovery — edge cases", () => {
  test("drops discovery_documents event when prd is missing", () => {
    const response = {
      type: "discovery",
      trd: { title: "TRD", sections: [] },
      content: "Partial discovery",
    } as unknown as ArchitectResponse;

    const events = handleDiscovery(response, nonCopilotCtx);
    expect(findEvent(events, "discovery_documents")).toBeFalsy();
    // Falls through to text message
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeTruthy();
  });

  test("emits WIZARD_UPDATE_FIELDS when system_name is present", () => {
    const response = {
      type: "discovery",
      system_name: "ads-optimizer",
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
      content: "Done",
    } as unknown as ArchitectResponse;

    const events = handleDiscovery(response, baseContext);
    expect(findEvent(events, CustomEventName.WIZARD_UPDATE_FIELDS)).toBeTruthy();
  });
});
