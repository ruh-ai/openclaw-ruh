/**
 * Extended tests for BuilderAgent covering run(), system instruction selection,
 * think/plan marker detection, feature mode, and error handling.
 */
import { describe, expect, test, mock, beforeEach } from "bun:test";
import { EventType } from "@ag-ui/core";

// ─── Mock dependencies before importing the module under test ─────────────────

const sendToArchitectStreamingMock = mock(async (
  _sessionId: string,
  _message: string,
  callbacks: Record<string, unknown>,
  _opts?: Record<string, unknown>,
) => {
  // Trigger onStatus so the STEP_STARTED events are emitted
  if (typeof callbacks?.onStatus === "function") {
    (callbacks.onStatus as (phase: string, msg: string) => void)("connecting", "Connecting...");
  }
  return {
    content: "Hello! I am the architect.",
    responseType: "conversational",
  };
});

mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: sendToArchitectStreamingMock,
}));

mock.module("@/lib/openclaw/wizard-directive-parser", () => ({
  parseWizardDirectives: () => [],
  buildWizardStateContext: () => "",
}));

mock.module("@/lib/openclaw/builder-hint-normalization", () => ({
  detectChannelHintIds: () => [],
}));

mock.module("./event-registry", () => ({
  processResponse: (_resp: unknown, _ctx: unknown) => [],
}));

mock.module("./event-tracer", () => ({
  tracer: {
    emit: () => {},
    receive: () => {},
    apply: () => {},
    drop: () => {},
    clear: () => {},
    enabled: true,
    getTraces: () => [],
    dump: () => [],
  },
}));

import {
  BuilderAgent,
  THINK_SYSTEM_INSTRUCTION,
  PLAN_SYSTEM_INSTRUCTION,
  REFINE_SYSTEM_INSTRUCTION,
  FEATURE_MODE_PREAMBLE,
} from "./builder-agent";
import type { RunAgentInput } from "@ag-ui/core";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<RunAgentInput> = {}): RunAgentInput {
  return {
    threadId: "thread-1",
    runId: "run-1",
    messages: [{ role: "user", content: "Build a Google Ads agent that manages campaigns", id: "m1" }],
    tools: [],
    context: [],
    ...overrides,
  };
}

function collectEvents(agent: BuilderAgent, input: RunAgentInput): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const events: Array<Record<string, unknown>> = [];
    const obs$ = agent.run(input);
    obs$.subscribe({
      next: (evt) => events.push(evt as Record<string, unknown>),
      complete: () => resolve(events),
      error: reject,
    });
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

describe("exported constants", () => {
  test("THINK_SYSTEM_INSTRUCTION is a non-empty string containing INSTRUCTION", () => {
    expect(typeof THINK_SYSTEM_INSTRUCTION).toBe("string");
    expect(THINK_SYSTEM_INSTRUCTION).toContain("[INSTRUCTION]");
    expect(THINK_SYSTEM_INSTRUCTION).toContain("THINK mode");
  });

  test("PLAN_SYSTEM_INSTRUCTION is a non-empty string containing PLAN mode", () => {
    expect(typeof PLAN_SYSTEM_INSTRUCTION).toBe("string");
    expect(PLAN_SYSTEM_INSTRUCTION).toContain("PLAN mode");
  });

  test("REFINE_SYSTEM_INSTRUCTION is a non-empty string containing REFINE mode", () => {
    expect(typeof REFINE_SYSTEM_INSTRUCTION).toBe("string");
    expect(REFINE_SYSTEM_INSTRUCTION).toContain("REFINE");
  });

  test("FEATURE_MODE_PREAMBLE contains FEATURE_BRANCH_MODE marker", () => {
    expect(FEATURE_MODE_PREAMBLE).toContain("FEATURE_BRANCH_MODE");
  });
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe("BuilderAgent constructor", () => {
  test("creates instance with run method", () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    expect(agent).toBeDefined();
    expect(typeof agent.run).toBe("function");
  });

  test("stageDelayMs defaults to 800", () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    expect(agent.stageDelayMs).toBe(800);
  });

  test("stageDelayMs can be overridden via config", () => {
    const agent = new BuilderAgent({ sessionId: "s1", stageDelayMs: 0 });
    expect(agent.stageDelayMs).toBe(0);
  });
});

// ─── run() basic flow ─────────────────────────────────────────────────────────

describe("run() basic observable flow", () => {
  beforeEach(() => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onStatus === "function") {
        (callbacks.onStatus as (p: string, m: string) => void)("connecting", "ok");
      }
      return { content: "Response", responseType: "conversational" };
    });
  });

  test("emits RUN_STARTED as the first event", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    const events = await collectEvents(agent, makeInput());
    expect(events[0].type).toBe(EventType.RUN_STARTED);
  });

  test("emits STEP_STARTED as the second event", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    const events = await collectEvents(agent, makeInput());
    expect(events[1].type).toBe(EventType.STEP_STARTED);
  });

  test("emits RUN_FINISHED as the last event before complete", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    const events = await collectEvents(agent, makeInput());
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe(EventType.RUN_FINISHED);
  });

  test("calls sendToArchitectStreaming once per run", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    await collectEvents(agent, makeInput());
    expect(sendToArchitectStreamingMock).toHaveBeenCalledTimes(1);
  });
});

// ─── System instruction selection ────────────────────────────────────────────

describe("system instruction selection via devStage in wizardState", () => {
  beforeEach(() => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      _callbacks: unknown,
    ) => ({ content: "ok", responseType: "conversational" }));
  });

  test("uses THINK instruction when devStage is 'think'", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "think" } } });
    await collectEvents(agent, input);
    const [, sentMessage] = sendToArchitectStreamingMock.mock.calls[0];
    expect((sentMessage as string)).toContain("[INSTRUCTION]");
  });

  test("uses PLAN instruction when devStage is 'plan'", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "plan" } } });
    await collectEvents(agent, input);
    const [, sentMessage] = sendToArchitectStreamingMock.mock.calls[0];
    expect((sentMessage as string)).toContain("[INSTRUCTION]");
  });

  test("uses REFINE instruction when devStage is 'build'", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "build" } } });
    await collectEvents(agent, input);
    const [, sentMessage] = sendToArchitectStreamingMock.mock.calls[0];
    expect((sentMessage as string)).toContain("[INSTRUCTION]");
  });

  test("uses REFINE instruction when devStage is 'review'", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "review" } } });
    await collectEvents(agent, input);
    const [, sentMessage] = sendToArchitectStreamingMock.mock.calls[0];
    expect((sentMessage as string)).toContain("[INSTRUCTION]");
  });

  test("feature mode prepends FEATURE_BRANCH_MODE preamble", async () => {
    const agent = new BuilderAgent({ sessionId: "s1" });
    const input = makeInput({
      forwardedProps: {
        wizardState: {
          devStage: "think",
          featureContext: { title: "Slack alerts" },
        },
      },
    });
    await collectEvents(agent, input);
    const [, sentMessage] = sendToArchitectStreamingMock.mock.calls[0];
    expect((sentMessage as string)).toContain("FEATURE_BRANCH_MODE");
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("error handling", () => {
  test("emits RUN_ERROR and completes when sendToArchitectStreaming throws", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async () => {
      throw new Error("Gateway unreachable");
    });

    const agent = new BuilderAgent({ sessionId: "s1" });
    const events = await collectEvents(agent, makeInput());
    const errorEvent = events.find((e) => e.type === EventType.RUN_ERROR);
    expect(errorEvent).toBeDefined();
    expect((errorEvent as Record<string, string>).message).toContain("Gateway unreachable");
  });

  test("calls onSessionRotate callback after error", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async () => {
      throw new Error("Connection refused");
    });

    const onSessionRotate = mock((_id: string) => {});
    const agent = new BuilderAgent({ sessionId: "s1", onSessionRotate });
    await collectEvents(agent, makeInput());
    expect(onSessionRotate).toHaveBeenCalledTimes(1);
    // Should receive a new session id (not the original)
    const [newId] = onSessionRotate.mock.calls[0];
    expect(newId).not.toBe("s1");
  });
});

// ─── Copilot mode ─────────────────────────────────────────────────────────────

describe("copilot mode", () => {
  beforeEach(() => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      // Simulate streaming deltas
      if (typeof callbacks?.onDelta === "function") {
        (callbacks.onDelta as (d: string) => void)("Hello ");
        (callbacks.onDelta as (d: string) => void)("world");
      }
      return { content: "Hello world", responseType: "conversational" };
    });
  });

  test("emits TEXT_MESSAGE_START in copilot mode", async () => {
    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const events = await collectEvents(agent, makeInput());
    const start = events.find((e) => e.type === EventType.TEXT_MESSAGE_START);
    expect(start).toBeDefined();
  });

  test("emits TEXT_MESSAGE_CONTENT events for each delta in copilot mode", async () => {
    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const events = await collectEvents(agent, makeInput());
    const contentEvents = events.filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT);
    expect(contentEvents.length).toBeGreaterThanOrEqual(2);
  });

  test("emits TEXT_MESSAGE_END after streaming in copilot mode", async () => {
    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const events = await collectEvents(agent, makeInput());
    const end = events.find((e) => e.type === EventType.TEXT_MESSAGE_END);
    expect(end).toBeDefined();
  });
});

// ─── Think stage copilot mode — name extraction ───────────────────────────────

describe("think stage: name extraction from user message", () => {
  beforeEach(() => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onDelta === "function") {
        (callbacks.onDelta as (d: string) => void)("I'll design the agent.");
      }
      return { content: "Agent ready", responseType: "conversational" };
    });
  });

  test("emits think_status generating when devStage is think in copilot mode", async () => {
    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({
      forwardedProps: { wizardState: { devStage: "think" } },
    });
    const events = await collectEvents(agent, input);
    const thinkStatus = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "think_status",
    );
    expect(thinkStatus).toBeDefined();
    expect((thinkStatus as any).value.status).toBe("generating");
  });

  test("emits WIZARD_UPDATE_FIELDS with extracted name from build message", async () => {
    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input: RunAgentInput = {
      threadId: "t1",
      runId: "r1",
      messages: [
        { role: "user", content: "Build an HR onboarding agent that sends welcome emails to new employees", id: "m1" },
      ],
      tools: [],
      context: [],
      forwardedProps: { wizardState: { devStage: "think" } },
    };
    const events = await collectEvents(agent, input);
    const fieldsUpdate = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "wizard_update_fields",
    );
    expect(fieldsUpdate).toBeDefined();
    expect((fieldsUpdate as any).value.name).toContain("Agent");
  });
});

// ─── Think marker detection in streaming ─────────────────────────────────────

describe("think marker detection during streaming", () => {
  test("emits think_step custom event when marker detected in delta", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onDelta === "function") {
        const delta = `Starting research...\n<think_step step="research" status="started"/>\nSearching APIs...`;
        (callbacks.onDelta as (d: string) => void)(delta);
      }
      return { content: "done", responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "think" } } });
    const events = await collectEvents(agent, input);

    const thinkStep = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "think_step",
    );
    expect(thinkStep).toBeDefined();
    expect((thinkStep as any).value.step).toBe("research");
  });

  test("emits think_research_finding when finding marker detected", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onDelta === "function") {
        const delta = `Found something.\n<think_research_finding title="Google Ads API" summary="REST API with OAuth" source="https://developers.google.com"/>\nContinuing...`;
        (callbacks.onDelta as (d: string) => void)(delta);
      }
      return { content: "ok", responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "think" } } });
    const events = await collectEvents(agent, input);

    const finding = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "think_research_finding",
    );
    expect(finding).toBeDefined();
    expect((finding as any).value.title).toBe("Google Ads API");
    expect((finding as any).value.summary).toBe("REST API with OAuth");
    expect((finding as any).value.source).toBe("https://developers.google.com");
  });

  test("emits think_document_ready when doc ready marker detected", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onDelta === "function") {
        const delta = `Writing document...\n<think_document_ready docType="prd" path=".openclaw/discovery/PRD.md"/>\n`;
        (callbacks.onDelta as (d: string) => void)(delta);
      }
      return { content: "ok", responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "think" } } });
    const events = await collectEvents(agent, input);

    const docReady = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "think_document_ready",
    );
    expect(docReady).toBeDefined();
    expect((docReady as any).value.docType).toBe("prd");
    expect((docReady as any).value.path).toBe(".openclaw/discovery/PRD.md");
  });
});

// ─── Plan marker detection in streaming ──────────────────────────────────────

describe("plan marker detection during streaming", () => {
  test("emits plan_skills custom event when plan_skills marker detected", async () => {
    const skillsJson = JSON.stringify([{ id: "fetch-data", name: "Fetch Data", description: "Fetch campaign data", dependencies: [], toolType: "api", envVars: [] }]);
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onDelta === "function") {
        const delta = `Designing skills...\n<plan_skills skills='${skillsJson}'/>\nContinuing...`;
        (callbacks.onDelta as (d: string) => void)(delta);
      }
      return { content: "done", responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "plan" } } });
    const events = await collectEvents(agent, input);

    const planSkills = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "plan_skills",
    );
    expect(planSkills).toBeDefined();
    expect(Array.isArray((planSkills as any).value.skills)).toBe(true);
  });

  test("emits plan_complete fallback when no plan events emitted and response is long", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onDelta === "function") {
        // Long response without any plan markers
        (callbacks.onDelta as (d: string) => void)("x".repeat(300));
      }
      return { content: "long response without markers".repeat(10), responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "plan" } } });
    const events = await collectEvents(agent, input);

    const planComplete = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "plan_complete",
    );
    expect(planComplete).toBeDefined();
  });
});

// ─── forgeSandboxId forwarding ────────────────────────────────────────────────

describe("forgeSandboxId forwarding", () => {
  test("passes forgeSandboxId to sendToArchitectStreaming opts", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async () => ({ content: "ok", responseType: "conversational" }));

    const agent = new BuilderAgent({ sessionId: "s1", forgeSandboxId: "forge-sb-123" });
    await collectEvents(agent, makeInput());

    const [, , , opts] = sendToArchitectStreamingMock.mock.calls[0];
    expect((opts as Record<string, unknown>).forgeSandboxId).toBe("forge-sb-123");
  });
});

// ─── onCustomEvent forwarding during think ────────────────────────────────────

describe("onCustomEvent think_activity forwarding", () => {
  test("emits think_activity for tool_start during think phase", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onCustomEvent === "function") {
        (callbacks.onCustomEvent as (name: string, data: unknown) => void)(
          "tool_start",
          { tool: "browser" },
        );
      }
      return { content: "ok", responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "think" } } });
    const events = await collectEvents(agent, input);

    const activity = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "think_activity"
        && (e as any).value?.type === "research",
    );
    expect(activity).toBeDefined();
    expect((activity as any).value.label).toContain("browser");
  });

  test("emits think_activity for tool_end during think phase", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onCustomEvent === "function") {
        (callbacks.onCustomEvent as (name: string, data: unknown) => void)(
          "tool_end",
          { tool: "browser" },
        );
      }
      return { content: "ok", responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "think" } } });
    const events = await collectEvents(agent, input);

    const activity = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "think_activity"
        && (e as any).value?.type === "tool",
    );
    expect(activity).toBeDefined();
    expect((activity as any).value.label).toContain("complete");
  });
});

// ─── extractAgentNameFromUserMessage — "I need/want" pattern ─────────────────

describe("extractAgentNameFromUserMessage — name extraction via run()", () => {
  beforeEach(() => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onDelta === "function") {
        (callbacks.onDelta as (d: string) => void)("Working on it.");
      }
      return { content: "Done", responseType: "conversational" };
    });
  });

  test("emits WIZARD_UPDATE_FIELDS when user says 'I need an X that...'", async () => {
    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input: RunAgentInput = {
      threadId: "t1",
      runId: "r1",
      messages: [
        { role: "user", content: "I need an inventory management agent that tracks stock levels and sends alerts", id: "m1" },
      ],
      tools: [],
      context: [],
      forwardedProps: { wizardState: { devStage: "think" } },
    };
    const events = await collectEvents(agent, input);
    const fieldsUpdate = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "wizard_update_fields",
    );
    expect(fieldsUpdate).toBeDefined();
    expect((fieldsUpdate as any).value.name).toBeDefined();
  });

  test("does NOT emit WIZARD_UPDATE_FIELDS when message is too short to match patterns", async () => {
    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input: RunAgentInput = {
      threadId: "t1",
      runId: "r1",
      messages: [
        { role: "user", content: "Hi", id: "m1" },
      ],
      tools: [],
      context: [],
      forwardedProps: { wizardState: { devStage: "think" } },
    };
    const events = await collectEvents(agent, input);
    const fieldsUpdate = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "wizard_update_fields",
    );
    // No wizard_update_fields emitted for short message
    expect(fieldsUpdate).toBeUndefined();
  });
});

// ─── Plan stage fallback — plan_complete auto-emit ────────────────────────────

describe("plan stage fallback — plan_complete auto-emit", () => {
  test("emits plan_complete when plan stage has >200 chars but no plan markers", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onDelta === "function") {
        // Send >200 chars of delta to trigger fallback — but no plan XML markers
        const longText = "Thinking about the architecture. ".repeat(10);
        (callbacks.onDelta as (d: string) => void)(longText);
      }
      return { content: "Architect response without markers.", responseType: "agent_response" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const input = makeInput({ forwardedProps: { wizardState: { devStage: "plan" } } });
    const events = await collectEvents(agent, input);

    const planComplete = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "plan_complete",
    );
    expect(planComplete).toBeDefined();
  });
});

// ─── onIntermediate — intermediate update types ───────────────────────────────

describe("onIntermediate — skill_discovered and tool_hint", () => {
  test("emits WIZARD_SET_SKILLS when skill_discovered intermediate arrives", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onIntermediate === "function") {
        (callbacks.onIntermediate as (u: Record<string, unknown>) => void)({
          kind: "skill_discovered",
          skillId: "campaign-fetch",
          name: "Campaign Fetch",
          description: "Fetches campaigns",
        });
      }
      return { content: "ok", responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const events = await collectEvents(agent, makeInput());
    const skillsEvent = events.find(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "wizard_set_skills",
    );
    expect(skillsEvent).toBeDefined();
  });

  test("emits WIZARD_CONNECT_TOOLS when tool_hint intermediate arrives (dedup)", async () => {
    sendToArchitectStreamingMock.mockClear();
    sendToArchitectStreamingMock.mockImplementation(async (
      _sessionId: string,
      _message: string,
      callbacks: Record<string, unknown>,
    ) => {
      if (typeof callbacks?.onIntermediate === "function") {
        const fn = callbacks.onIntermediate as (u: Record<string, unknown>) => void;
        fn({ kind: "tool_hint", toolId: "github" });
        fn({ kind: "tool_hint", toolId: "github" }); // duplicate — should be deduplicated
      }
      return { content: "ok", responseType: "conversational" };
    });

    const agent = new BuilderAgent({ sessionId: "s1", mode: "copilot" });
    const events = await collectEvents(agent, makeInput());
    const toolEvents = events.filter(
      (e) => e.type === EventType.CUSTOM && (e as any).name === "wizard_connect_tools",
    );
    // Only one unique tool_hint — so only one WIZARD_CONNECT_TOOLS event
    expect(toolEvents).toHaveLength(1);
  });
});
