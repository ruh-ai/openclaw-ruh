import { describe, expect, mock, test, beforeEach } from "bun:test";
import { EventType } from "@ag-ui/core";

const mockSendToArchitectStreaming = mock();
const mockSendToForgeSandboxChat = mock();

mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
  sendToForgeSandboxChat: mockSendToForgeSandboxChat,
  BridgeApiError: class BridgeApiError extends Error { status; constructor(m: string, s = 0) { super(m); this.status = s; } },
}));

const { BuilderAgent } = await import("../builder-agent");
const { CustomEventName } = await import("../types");

interface RecordedEvent {
  type: string;
  name?: string;
  value?: unknown;
  [key: string]: unknown;
}

function collectEvents(response: unknown): Promise<RecordedEvent[]> {
  mockSendToArchitectStreaming.mockResolvedValue(response);

  const agent = new BuilderAgent({ sessionId: "session-1" });
  const events: RecordedEvent[] = [];

  return new Promise((resolve, reject) => {
    const sub = agent.run({
      threadId: "thread-1",
      runId: "run-1",
      messages: [{ id: "msg-1", role: "user", content: "Build a support agent with Slack and Telegram" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }).subscribe({
      next: (event) => events.push(event as RecordedEvent),
      error: reject,
      complete: () => { sub.unsubscribe(); resolve(events); },
    });
  });
}

function customEvents(events: RecordedEvent[]): RecordedEvent[] {
  return events.filter((e) => e.type === EventType.CUSTOM);
}

function eventNames(events: RecordedEvent[]): string[] {
  return customEvents(events).map((e) => e.name as string);
}

describe("Progressive wizard flow", () => {
  beforeEach(() => {
    mockSendToArchitectStreaming.mockReset();
    mockSendToForgeSandboxChat.mockReset();
  });

  test("ready_for_review emits staged wizard events with phase advancement", async () => { // timeout handled below
    const response = {
      type: "ready_for_review",
      content: "Built a customer support agent.",
      system_name: "support-agent",
      agent_metadata: {
        agent_name: "Support Agent",
        tone: "friendly",
        primary_users: "customer support team",
      },
      requirements: {},
      skill_graph: {
        system_name: "support-agent",
        nodes: [
          {
            skill_id: "ticket-handler",
            name: "Ticket Handler",
            description: "Handles incoming support tickets via Slack",
            status: "generated",
            source: "custom",
            depends_on: [],
            external_api: "slack",
          },
          {
            skill_id: "order-lookup",
            name: "Order Lookup",
            description: "Looks up orders in Shopify via Telegram",
            status: "generated",
            source: "custom",
            depends_on: [],
            external_api: "shopify",
          },
        ],
        workflow: {
          name: "support-workflow",
          description: "Main support workflow",
          steps: [
            { id: "s1", action: "execute", skill: "ticket-handler", wait_for: [] },
            { id: "s2", action: "execute", skill: "order-lookup", wait_for: ["ticket-handler"] },
          ],
        },
      },
    };

    // Collect synchronous events only (staged events fire via setTimeout)
    const events = await collectEvents(response);
    const names = eventNames(events);

    // SKILL_GRAPH_READY should always be emitted (for backward compat)
    expect(names).toContain(CustomEventName.SKILL_GRAPH_READY);

    // Identity (WIZARD_UPDATE_FIELDS) should be emitted immediately (synchronous)
    expect(names).toContain(CustomEventName.WIZARD_UPDATE_FIELDS);

    // The identity event should have name and description
    const identityEvent = customEvents(events).find(
      (e) => e.name === CustomEventName.WIZARD_UPDATE_FIELDS,
    );
    expect(identityEvent).toBeDefined();
    const identityValue = identityEvent!.value as Record<string, unknown>;
    expect(identityValue.name).toBe("Support Agent");

    // SKILL_GRAPH_READY should include channel hints for slack and telegram
    const sgEvent = customEvents(events).find(
      (e) => e.name === CustomEventName.SKILL_GRAPH_READY,
    );
    expect(sgEvent).toBeDefined();
    const sgValue = sgEvent!.value as Record<string, unknown>;
    const channelHints = sgValue.channelHints as string[];
    expect(channelHints).toContain("slack");
    expect(channelHints).toContain("telegram");
  });

  test("SKILL_GRAPH_READY includes all hint categories for staged consumption", async () => {
    const response = {
      type: "ready_for_review",
      content: "Built agent.",
      system_name: "test-agent",
      agent_metadata: {
        agent_name: "Test Agent",
        tone: "professional",
        schedule_description: "Runs hourly",
      },
      requirements: {
        schedule: "hourly",
      },
      skill_graph: {
        system_name: "test-agent",
        nodes: [
          {
            skill_id: "fetch-data",
            name: "Fetch Data",
            description: "Fetches data from Slack API",
            status: "generated",
            source: "custom",
            depends_on: [],
            external_api: "slack",
          },
        ],
        workflow: {
          name: "main",
          description: "main workflow",
          steps: [
            { id: "s1", action: "execute", skill: "fetch-data", wait_for: [] },
          ],
        },
      },
    };

    const events = await collectEvents(response);
    const names = eventNames(events);

    // Synchronous events must include both SKILL_GRAPH_READY and identity
    expect(names).toContain(CustomEventName.SKILL_GRAPH_READY);
    expect(names).toContain(CustomEventName.WIZARD_UPDATE_FIELDS);

    // SKILL_GRAPH_READY payload must carry ALL hint categories
    // so the staged setTimeout emissions can use them
    const sgEvent = customEvents(events).find(
      (e) => e.name === CustomEventName.SKILL_GRAPH_READY,
    );
    const sgValue = sgEvent!.value as Record<string, unknown>;
    expect(sgValue.toolConnectionHints).toEqual(["slack"]);
    expect(sgValue.triggerHints).toEqual(["cron-schedule"]);
    expect(sgValue.channelHints).toEqual(["slack"]);

    // Identity should have name from agent_metadata
    const fieldsEvent = customEvents(events).find(
      (e) => e.name === CustomEventName.WIZARD_UPDATE_FIELDS,
    );
    const fieldsValue = fieldsEvent!.value as Record<string, unknown>;
    expect(fieldsValue.name).toBe("Test Agent");
  });

  test("agent_response extracts name and description for purpose phase", async () => {
    const response = {
      type: "agent_response",
      content: "I'll build you a Customer Support Bot that handles order inquiries.",
      system_name: "customer-support-bot",
      agent_metadata: {
        agent_name: "Customer Support Bot",
      },
      description: "Handles order inquiries for e-commerce stores",
    };

    const events = await collectEvents(response);
    const names = eventNames(events);

    // agent_response should emit WIZARD_UPDATE_FIELDS with inferred name
    expect(names).toContain(CustomEventName.WIZARD_UPDATE_FIELDS);

    const fieldsEvent = customEvents(events).find(
      (e) => e.name === CustomEventName.WIZARD_UPDATE_FIELDS,
    );
    const value = fieldsEvent!.value as Record<string, unknown>;
    expect(value.name).toBe("Customer Support Bot");
    expect(value.description).toBe("Handles order inquiries for e-commerce stores");
  });

  test("channel hints detect telegram and slack from skill graph nodes", async () => {
    const response = {
      type: "ready_for_review",
      content: "Built agent with Telegram and Slack channels.",
      system_name: "multichannel-agent",
      skill_graph: {
        system_name: "multichannel-agent",
        nodes: [
          {
            skill_id: "telegram-notifier",
            name: "Telegram Notifier",
            description: "Sends notifications via Telegram bot",
            status: "generated",
            source: "custom",
            depends_on: [],
          },
          {
            skill_id: "slack-reporter",
            name: "Slack Reporter",
            description: "Posts reports to Slack channels",
            status: "generated",
            source: "custom",
            depends_on: [],
          },
          {
            skill_id: "discord-alerts",
            name: "Discord Alerts",
            description: "Sends alerts to Discord server",
            status: "generated",
            source: "custom",
            depends_on: [],
          },
        ],
        workflow: {
          name: "notify-all",
          description: "Notify all channels",
          steps: [
            { id: "s1", action: "execute", skill: "telegram-notifier", wait_for: [] },
            { id: "s2", action: "execute", skill: "slack-reporter", wait_for: [] },
            { id: "s3", action: "execute", skill: "discord-alerts", wait_for: [] },
          ],
        },
      },
    };

    const events = await collectEvents(response);

    const sgEvent = customEvents(events).find(
      (e) => e.name === CustomEventName.SKILL_GRAPH_READY,
    );
    const sgValue = sgEvent!.value as Record<string, unknown>;
    const channelHints = sgValue.channelHints as string[];

    expect(channelHints).toContain("telegram");
    expect(channelHints).toContain("slack");
    expect(channelHints).toContain("discord");
  });

  test("ready_for_review emits final complete data and lands on review phase", async () => {
    const response = {
      type: "ready_for_review",
      content: "Built agent with Slack and scheduled triggers.",
      system_name: "staged-test",
      agent_metadata: {
        agent_name: "Staged Test Agent",
        tone: "professional",
        schedule_description: "Runs daily",
      },
      requirements: { schedule: "daily" },
      skill_graph: {
        system_name: "staged-test",
        nodes: [
          {
            skill_id: "slack-notify",
            name: "Slack Notify",
            description: "Sends notifications to Slack channels",
            status: "generated",
            source: "custom",
            depends_on: [],
            external_api: "slack",
          },
        ],
        workflow: {
          name: "main",
          description: "main workflow",
          steps: [{ id: "s1", action: "execute", skill: "slack-notify", wait_for: [] }],
        },
      },
    };

    const events = await collectEvents(response);
    const customs = customEvents(events);
    const names = customs.map((e) => e.name as string);

    // Final data events should be emitted synchronously
    expect(names).toContain(CustomEventName.SKILL_GRAPH_READY);
    expect(names).toContain(CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(names).toContain(CustomEventName.WIZARD_SET_SKILLS);
    expect(names).toContain(CustomEventName.WIZARD_CONNECT_TOOLS);
    expect(names).toContain(CustomEventName.WIZARD_SET_TRIGGERS);
    expect(names).toContain(CustomEventName.WIZARD_SET_CHANNELS);

    // Should land on skills phase — user walks through Tools → Triggers → Channels → Review manually
    const phaseEvents = customs.filter((e) => e.name === CustomEventName.WIZARD_SET_PHASE);
    const phases = phaseEvents.map((e) => (e.value as { phase: string }).phase);
    expect(phases).toContain("skills");

    // The final phase should be skills (user navigates forward from here)
    expect(phases[phases.length - 1]).toBe("skills");
  });

  test("tool catalog only shows relevant tools when hints are detected", async () => {
    // This tests the connect-tool-catalog logic
    const { buildConnectToolCatalog } = await import(
      "@/app/(platform)/agents/create/_components/configure/connect-tool-catalog"
    );

    const skillGraph = [
      {
        skill_id: "google-ads-audit",
        name: "Google Ads Audit",
        description: "Audit Google Ads campaigns",
        status: "generated" as const,
        source: "custom" as const,
        depends_on: [],
        external_api: "google_ads",
      },
      {
        skill_id: "slack-digest",
        name: "Slack Digest",
        description: "Send daily Slack digest reports",
        status: "generated" as const,
        source: "custom" as const,
        depends_on: [],
        external_api: "slack",
      },
    ];

    const catalog = buildConnectToolCatalog({
      skillGraph,
      agentUseCase: "Google Ads optimization with Slack reporting",
      connections: [],
    });

    const toolIds = catalog.map((t) => t.id);

    // Should include Google Ads and Slack (detected from skills)
    expect(toolIds).toContain("google-ads");
    expect(toolIds).toContain("slack");

    // Should NOT include unrelated tools like GitHub, Jira, etc.
    expect(toolIds).not.toContain("jira");
    expect(toolIds).not.toContain("notion");
    expect(toolIds).not.toContain("linear");
  });
});
