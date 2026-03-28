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
  formatAgentName,
  type EventContext,
} from "../event-registry";
import { CustomEventName } from "../types";
import { tracer } from "../event-tracer";
import type { ArchitectResponse } from "../../types";

const baseContext: EventContext = {
  messageId: "msg-1",
  isCopilot: true,
  hasStreamedDeltas: true,
  threadId: "thread-1",
  runId: "run-1",
};

function findEvent(events: unknown[], name: string) {
  return events.find((e: unknown) => (e as Record<string, unknown>).name === name);
}

function findEventType(events: unknown[], type: string) {
  return events.find((e: unknown) => (e as Record<string, unknown>).type === type);
}

beforeEach(() => {
  tracer.clear();
});

// ─── formatAgentName ────────────────────────────────────────────────────────

describe("formatAgentName", () => {
  test("converts kebab-case to Title Case", () => {
    expect(formatAgentName("my-cool-agent")).toBe("My Cool Agent");
  });

  test("returns plain name as-is", () => {
    expect(formatAgentName("MyAgent")).toBe("MyAgent");
  });
});

// ─── handleDiscovery ────────────────────────────────────────────────────────

describe("handleDiscovery", () => {
  test("emits discovery_documents + identity when prd and trd present", () => {
    const response = {
      type: "discovery",
      system_name: "feedback-monitor",
      content: "Research summary...",
      prd: { title: "PRD", sections: [{ heading: "Problem", content: "..." }] },
      trd: { title: "TRD", sections: [{ heading: "Arch", content: "..." }] },
    } as unknown as ArchitectResponse;

    const events = handleDiscovery(response, baseContext);

    // Should emit WIZARD_UPDATE_FIELDS with formatted name
    const identity = findEvent(events, CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(identity).toBeTruthy();
    expect((identity as Record<string, unknown>).value).toMatchObject({
      name: "Feedback Monitor",
      systemName: "Feedback Monitor",
    });

    // Should emit discovery_documents
    const docs = findEvent(events, "discovery_documents");
    expect(docs).toBeTruthy();
    expect((docs as Record<string, unknown>).value).toMatchObject({
      prd: { title: "PRD" },
      trd: { title: "TRD" },
      systemName: "feedback-monitor",
    });
  });

  test("drops discovery_documents when prd is missing", () => {
    const response = {
      type: "discovery",
      system_name: "test-agent",
      content: "No docs",
    } as unknown as ArchitectResponse;

    const events = handleDiscovery(response, baseContext);

    expect(findEvent(events, "discovery_documents")).toBeUndefined();
    // Tracer should record the drop
    const drops = tracer.getTraces().filter((t) => t.status === "dropped");
    expect(drops.length).toBeGreaterThan(0);
    expect(drops[0].reason).toContain("prd or trd missing");
  });

  test("emits text message events when not in copilot streaming mode", () => {
    const response = {
      type: "discovery",
      content: "Requirements generated.",
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
    } as unknown as ArchitectResponse;

    const ctx = { ...baseContext, isCopilot: false };
    const events = handleDiscovery(response, ctx);

    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeTruthy();
    expect(findEventType(events, EventType.TEXT_MESSAGE_CONTENT)).toBeTruthy();
    expect(findEventType(events, EventType.TEXT_MESSAGE_END)).toBeTruthy();
  });

  test("skips text message events in copilot streaming mode", () => {
    const response = {
      type: "discovery",
      content: "Requirements generated.",
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
    } as unknown as ArchitectResponse;

    const events = handleDiscovery(response, baseContext);

    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeUndefined();
  });
});

// ─── handleReadyForReview ───────────────────────────────────────────────────

describe("handleReadyForReview", () => {
  test("emits SKILL_GRAPH_READY + WIZARD_SET_PHASE when skill_graph present", () => {
    const response = {
      type: "ready_for_review",
      system_name: "test-agent",
      content: "Skills generated.",
      skill_graph: {
        system_name: "test-agent",
        nodes: [
          { skill_id: "skill-1", name: "Skill 1", description: "Test" },
        ],
        workflow: null,
      },
    } as unknown as ArchitectResponse;

    const events = handleReadyForReview(response, baseContext);

    const sgr = findEvent(events, CustomEventName.SKILL_GRAPH_READY);
    expect(sgr).toBeTruthy();
    const payload = (sgr as Record<string, unknown>).value as Record<string, unknown>;
    expect((payload.skillGraph as unknown[]).length).toBe(1);

    const phase = findEvent(events, CustomEventName.WIZARD_SET_PHASE);
    expect(phase).toBeTruthy();
    expect((phase as Record<string, unknown>).value).toMatchObject({ phase: "skills" });
  });

  test("emits text message when no skill_graph", () => {
    const response = {
      type: "ready_for_review",
      content: "Analysis complete.",
    } as unknown as ArchitectResponse;

    const ctx = { ...baseContext, isCopilot: false };
    const events = handleReadyForReview(response, ctx);

    expect(findEvent(events, CustomEventName.SKILL_GRAPH_READY)).toBeUndefined();
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeTruthy();
  });
});

// ─── handleClarification ────────────────────────────────────────────────────

describe("handleClarification", () => {
  test("emits text message with question content", () => {
    const response = {
      type: "clarification",
      content: "What tools should this agent use?",
      questions: [],
    } as unknown as ArchitectResponse;

    const ctx = { ...baseContext, isCopilot: false };
    const events = handleClarification(response, ctx);

    const content = findEventType(events, EventType.TEXT_MESSAGE_CONTENT);
    expect(content).toBeTruthy();
    expect((content as Record<string, unknown>).delta).toContain("What tools");
  });
});

// ─── handleAgentResponse ────────────────────────────────────────────────────

describe("handleAgentResponse", () => {
  test("infers name from system_name", () => {
    const response = {
      type: "agent_response",
      system_name: "my-bot",
      content: "I'll build that for you.",
    } as unknown as ArchitectResponse;

    const events = handleAgentResponse(response, baseContext);
    const fields = findEvent(events, CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(fields).toBeTruthy();
    expect((fields as Record<string, unknown>).value).toMatchObject({ name: "my-bot" });
  });
});

// ─── handleError ────────────────────────────────────────────────────────────

describe("handleError", () => {
  test("emits RUN_ERROR event", () => {
    const response = {
      type: "error",
      content: "Gateway down",
    } as unknown as ArchitectResponse;

    const events = handleError(response);
    expect(events.length).toBe(1);
    expect((events[0] as Record<string, unknown>).type).toBe(EventType.RUN_ERROR);
    expect((events[0] as Record<string, unknown>).message).toBe("Gateway down");
  });
});

// ─── handleArchitecturePlan ──────────────────────────────────────────────────

describe("handleArchitecturePlan", () => {
  const makePlanResponse = (overrides?: Record<string, unknown>) =>
    ({
      type: "architecture_plan",
      system_name: "shopify-monitor",
      content: "Architecture designed.",
      architecture_plan: {
        skills: [
          { id: "inventory-fetch", name: "Inventory Fetch", description: "Fetch stock", dependencies: [], envVars: ["SHOPIFY_TOKEN"] },
        ],
        workflow: { steps: [{ skillId: "inventory-fetch", parallel: false }] },
        integrations: [{ toolId: "shopify", name: "Shopify", method: "api", envVars: ["SHOPIFY_TOKEN"] }],
        triggers: [{ id: "cron-check", type: "cron", config: "*/15 * * * *", description: "Every 15 min" }],
        channels: ["slack"],
        envVars: [{ key: "SHOPIFY_TOKEN", description: "Shopify API token", required: true }],
        subAgents: [],
        missionControl: null,
      },
      ...overrides,
    }) as unknown as ArchitectResponse;

  test("emits architecture_plan_ready + identity when plan present", () => {
    const events = handleArchitecturePlan(makePlanResponse(), baseContext);

    const identity = findEvent(events, CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(identity).toBeTruthy();
    expect((identity as Record<string, unknown>).value).toMatchObject({
      name: "Shopify Monitor",
      systemName: "Shopify Monitor",
    });

    const planReady = findEvent(events, "architecture_plan_ready");
    expect(planReady).toBeTruthy();
    const payload = (planReady as Record<string, unknown>).value as Record<string, unknown>;
    expect(payload.systemName).toBe("shopify-monitor");
    expect((payload.plan as Record<string, unknown>).skills).toHaveLength(1);
  });

  test("drops architecture_plan_ready when plan missing", () => {
    const response = makePlanResponse({ architecture_plan: undefined });
    (response as unknown as Record<string, unknown>).architecture_plan = undefined;
    const events = handleArchitecturePlan(response, baseContext);

    expect(findEvent(events, "architecture_plan_ready")).toBeUndefined();
    const drops = tracer.getTraces().filter((t) => t.status === "dropped");
    expect(drops.some((d) => d.reason?.includes("architecture_plan missing"))).toBe(true);
  });

  test("emits text message events when not in copilot streaming mode", () => {
    const ctx = { ...baseContext, isCopilot: false };
    const events = handleArchitecturePlan(makePlanResponse(), ctx);

    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeTruthy();
    expect(findEventType(events, EventType.TEXT_MESSAGE_CONTENT)).toBeTruthy();
    expect(findEventType(events, EventType.TEXT_MESSAGE_END)).toBeTruthy();
  });

  test("skips text message events in copilot streaming mode", () => {
    const events = handleArchitecturePlan(makePlanResponse(), baseContext);
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeUndefined();
  });
});

// ─── handleDefault ──────────────────────────────────────────────────────────

describe("handleDefault", () => {
  test("catches discovery response via failsafe", () => {
    const response = {
      type: "discovery",
      system_name: "fallback-agent",
      content: "Fallback research",
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
    } as unknown as ArchitectResponse;

    const events = handleDefault(response, baseContext);

    expect(findEvent(events, "discovery_documents")).toBeTruthy();
  });

  test("catches architecture_plan response via failsafe", () => {
    const response = {
      type: "architecture_plan",
      system_name: "failsafe-agent",
      content: "Failsafe plan",
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

    const events = handleDefault(response, baseContext);
    expect(findEvent(events, "architecture_plan_ready")).toBeTruthy();
  });

  test("falls back to JSON for unknown types", () => {
    const response = {
      type: "some_unknown_type",
      content: "Mystery response",
    } as unknown as ArchitectResponse;

    const ctx = { ...baseContext, isCopilot: false };
    const events = handleDefault(response, ctx);

    expect(findEventType(events, EventType.TEXT_MESSAGE_CONTENT)).toBeTruthy();
  });
});

// ─── processResponse (main entry) ───────────────────────────────────────────

describe("processResponse", () => {
  test("routes discovery to handleDiscovery", () => {
    const response = {
      type: "discovery",
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
    } as unknown as ArchitectResponse;

    const events = processResponse(response, baseContext);
    expect(findEvent(events, "discovery_documents")).toBeTruthy();
  });

  test("routes architecture_plan to handleArchitecturePlan", () => {
    const response = {
      type: "architecture_plan",
      system_name: "plan-agent",
      architecture_plan: {
        skills: [{ id: "s1", name: "S1", description: "Skill", dependencies: [], envVars: [] }],
        workflow: { steps: [] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
      },
    } as unknown as ArchitectResponse;

    const events = processResponse(response, baseContext);
    expect(findEvent(events, "architecture_plan_ready")).toBeTruthy();
  });

  test("routes ready_for_review to handleReadyForReview", () => {
    const response = {
      type: "ready_for_review",
      skill_graph: {
        nodes: [{ skill_id: "s1", name: "S1", description: "Test" }],
      },
    } as unknown as ArchitectResponse;

    const events = processResponse(response, baseContext);
    expect(findEvent(events, CustomEventName.SKILL_GRAPH_READY)).toBeTruthy();
  });

  test("falls to default for unknown types", () => {
    const response = {
      type: "weird_type",
      content: "Hello",
    } as unknown as ArchitectResponse;

    const ctx = { ...baseContext, isCopilot: false };
    const events = processResponse(response, ctx);
    expect(findEventType(events, EventType.TEXT_MESSAGE_START)).toBeTruthy();
  });

  test("traces all emitted events", () => {
    const response = {
      type: "discovery",
      system_name: "traced-agent",
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
    } as unknown as ArchitectResponse;

    processResponse(response, baseContext);

    const traces = tracer.getTraces();
    expect(traces.length).toBeGreaterThan(0);
    expect(traces.some((t) => t.source === "builder-agent")).toBe(true);
  });
});
