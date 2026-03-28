import { describe, expect, mock, test, beforeEach } from "bun:test";
import { EventType } from "@ag-ui/core";

const mockSendToArchitectStreaming = mock();
const mockSendToForgeSandboxChat = mock();

mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
  sendToForgeSandboxChat: mockSendToForgeSandboxChat,
}));

const { BuilderAgent } = await import("../builder-agent");
const { CustomEventName } = await import("../types");

function collectBuilderEvents(response: unknown) {
  mockSendToArchitectStreaming.mockResolvedValue(response);

  const agent = new BuilderAgent({ sessionId: "session-1" });
  const events: unknown[] = [];

  return new Promise<unknown[]>((resolve, reject) => {
    const subscription = agent.run({
      threadId: "thread-1",
      runId: "run-1",
      messages: [{ id: "msg-1", role: "user", content: "Build a Google Ads optimizer" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }).subscribe({
      next: (event) => {
        events.push(event);
      },
      error: reject,
      complete: () => {
        subscription.unsubscribe();
        resolve(events);
      },
    });
  });
}

function collectBuilderEventsFromAgent(agent: InstanceType<typeof BuilderAgent>) {
  const events: unknown[] = [];

  return new Promise<unknown[]>((resolve, reject) => {
    const subscription = agent.run({
      threadId: "thread-1",
      runId: "run-1",
      messages: [{ id: "msg-1", role: "user", content: "Build a Google Ads optimizer" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }).subscribe({
      next: (event) => {
        events.push(event);
      },
      error: reject,
      complete: () => {
        subscription.unsubscribe();
        resolve(events);
      },
    });
  });
}

describe("BuilderAgent", () => {
  beforeEach(() => {
    mockSendToArchitectStreaming.mockReset();
    mockSendToForgeSandboxChat.mockReset();
  });

  test("normalizes object-shaped clarification questions into conversational text", async () => {
    const response = {
      type: "clarification",
      questions: [
        { id: "account-scope", question: "Which Google Ads account should this agent optimize first?" },
        { id: "budget-window", question: "Should it focus on daily pacing or monthly budget caps?" },
      ],
    };

    const events = await collectBuilderEvents(response);

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_START,
      role: "assistant",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: [
        "Which Google Ads account should this agent optimize first?",
        "Should it focus on daily pacing or monthly budget caps?",
      ].join("\n\n"),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_END,
    }));
  });

  test("emits builder metadata events and hint payloads on ready_for_review", async () => {
    const response = {
      type: "ready_for_review",
      content: "I've analysed your Google Ads requirements.",
      system_name: "google-ads-optimizer",
      agent_metadata: {
        agent_name: "Google Ads Optimizer",
        tone: "analytical",
        schedule_description: "Runs every weekday at 9am",
        primary_users: "paid media managers",
      },
      requirements: {
        schedule: "weekdays at 9am",
        required_env_vars: ["GOOGLE_ADS_CUSTOMER_ID"],
      },
      tool_connections: [
        {
          tool_id: "google-ads",
          name: "Google Ads",
          description: "Direct Google Ads connector",
          required_env: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_REFRESH_TOKEN"],
        },
      ],
      triggers: [
        {
          id: "weekday-pacing",
          kind: "schedule",
          title: "Weekday pacing check",
          schedule: "0 9 * * 1-5",
          description: "Run every weekday morning.",
        },
      ],
      skill_graph: {
        system_name: "google-ads-optimizer",
        nodes: [
          {
            skill_id: "google-ads-audit",
            name: "Google Ads Audit",
            description: "Inspect campaign performance and wasted spend",
            status: "generated",
            source: "custom",
            depends_on: [],
            requires_env: ["GOOGLE_ADS_CUSTOMER_ID"],
            external_api: "google_ads",
          },
          {
            skill_id: "budget-pacing-report",
            name: "Budget Pacing Report",
            description: "Generate weekly pacing summaries",
            status: "generated",
            source: "custom",
            depends_on: [],
          },
        ],
        workflow: {
          name: "main-workflow",
          description: "google-ads-optimizer workflow",
          steps: [
            { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
            { id: "step-1", action: "execute", skill: "budget-pacing-report", wait_for: ["google-ads-audit"] },
          ],
        },
      },
    };

    const events = await collectBuilderEvents(response);

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.SKILL_GRAPH_READY,
      value: expect.objectContaining({
        skillGraph: expect.arrayContaining([
          expect.objectContaining({ skill_id: "google-ads-audit" }),
        ]),
        workflow: expect.objectContaining({ name: "main-workflow" }),
        systemName: "google-ads-optimizer",
        agentRules: expect.arrayContaining([
          "Communicate in a analytical tone",
          "Schedule: Runs every weekday at 9am",
          "Intended for: paid media managers",
          "Requires env: GOOGLE_ADS_CUSTOMER_ID",
        ]),
        toolConnectionHints: ["google-ads"],
        toolConnections: [
          expect.objectContaining({
            toolId: "google-ads",
            connectorType: "mcp",
            status: "missing_secret",
          }),
        ],
        triggerHints: ["weekday-pacing"],
        triggers: [
          expect.objectContaining({
            id: "weekday-pacing",
            kind: "schedule",
            schedule: "0 9 * * 1-5",
          }),
        ],
      }),
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.WIZARD_UPDATE_FIELDS,
      value: expect.objectContaining({
        name: "Google Ads Optimizer",
        description: "I've analysed your Google Ads requirements.",
        systemName: "Google Ads Optimizer",
      }),
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.WIZARD_SET_SKILLS,
      value: expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ skill_id: "google-ads-audit" })]),
        workflow: expect.objectContaining({ name: "main-workflow" }),
        rules: expect.arrayContaining([
          "Communicate in a analytical tone",
          "Schedule: Runs every weekday at 9am",
          "Intended for: paid media managers",
          "Requires env: GOOGLE_ADS_CUSTOMER_ID",
        ]),
        skillIds: ["google-ads-audit", "budget-pacing-report"],
      }),
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.WIZARD_CONNECT_TOOLS,
      value: expect.objectContaining({
        toolIds: ["google-ads"],
        toolConnections: [
          expect.objectContaining({ toolId: "google-ads" }),
        ],
      }),
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.WIZARD_SET_TRIGGERS,
      value: expect.objectContaining({
        triggerIds: ["weekday-pacing"],
        triggers: [
          expect.objectContaining({ id: "weekday-pacing" }),
        ],
      }),
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.WIZARD_SET_RULES,
      value: expect.objectContaining({
        rules: expect.arrayContaining([
          "Communicate in a analytical tone",
          "Schedule: Runs every weekday at 9am",
          "Intended for: paid media managers",
          "Requires env: GOOGLE_ADS_CUSTOMER_ID",
        ]),
      }),
    }));
  });

  test("progressively applies shared-bridge intermediate updates before review payload completion", async () => {
    mockSendToArchitectStreaming.mockImplementation(async (_sessionId, _message, callbacks) => {
      callbacks?.onIntermediate?.({
        kind: "identity",
        name: "Google Ads Optimizer",
        description: "Optimizes campaign pacing",
      });
      callbacks?.onIntermediate?.({
        kind: "skill_discovered",
        skillId: "google-ads-audit",
        name: "Google Ads Audit",
        description: "Inspect campaign performance",
      });
      callbacks?.onIntermediate?.({
        kind: "tool_hint",
        toolId: "google-ads",
      });
      callbacks?.onIntermediate?.({
        kind: "trigger_hint",
        triggerId: "cron-schedule",
      });
      callbacks?.onIntermediate?.({
        kind: "channel_hint",
        channelId: "slack",
      });

      return {
        type: "ready_for_review",
        content: "Ready for review",
        system_name: "google-ads-optimizer",
        skill_graph: {
          system_name: "google-ads-optimizer",
          nodes: [
            {
              skill_id: "google-ads-audit",
              name: "Google Ads Audit",
              description: "Inspect campaign performance",
              status: "generated",
              source: "custom",
              depends_on: [],
            },
          ],
          workflow: null,
        },
      };
    });

    const agent = new BuilderAgent({ sessionId: "session-1", mode: "copilot" });
    const events = await collectBuilderEventsFromAgent(agent);

    const identityIndex = events.findIndex((event) =>
      event &&
      typeof event === "object" &&
      "name" in event &&
      (event as { name?: string }).name === CustomEventName.WIZARD_UPDATE_FIELDS
    );
    const skillsIndex = events.findIndex((event) =>
      event &&
      typeof event === "object" &&
      "name" in event &&
      (event as { name?: string }).name === CustomEventName.WIZARD_SET_SKILLS
    );
    const toolsIndex = events.findIndex((event) =>
      event &&
      typeof event === "object" &&
      "name" in event &&
      (event as { name?: string }).name === CustomEventName.WIZARD_CONNECT_TOOLS
    );
    const triggersIndex = events.findIndex((event) =>
      event &&
      typeof event === "object" &&
      "name" in event &&
      (event as { name?: string }).name === CustomEventName.WIZARD_SET_TRIGGERS
    );
    const channelsIndex = events.findIndex((event) =>
      event &&
      typeof event === "object" &&
      "name" in event &&
      (event as { name?: string }).name === CustomEventName.WIZARD_SET_CHANNELS
    );
    const skillGraphReadyIndex = events.findIndex((event) =>
      event &&
      typeof event === "object" &&
      "name" in event &&
      (event as { name?: string }).name === CustomEventName.SKILL_GRAPH_READY
    );

    expect(identityIndex).toBeGreaterThanOrEqual(0);
    expect(skillsIndex).toBeGreaterThan(identityIndex);
    expect(toolsIndex).toBeGreaterThan(skillsIndex);
    expect(triggersIndex).toBeGreaterThan(toolsIndex);
    expect(channelsIndex).toBeGreaterThan(triggersIndex);
    expect(skillGraphReadyIndex).toBeGreaterThan(channelsIndex);

    expect(events[toolsIndex]).toEqual(
      expect.objectContaining({
        name: CustomEventName.WIZARD_CONNECT_TOOLS,
        value: expect.objectContaining({
          toolIds: ["google-ads"],
        }),
      }),
    );
    expect(events[channelsIndex]).toEqual(
      expect.objectContaining({
        name: CustomEventName.WIZARD_SET_CHANNELS,
        value: expect.objectContaining({
          channelIds: ["slack"],
        }),
      }),
    );
  });

  test("preserves the architect review summary in the skill graph payload", async () => {
    const response = {
      type: "ready_for_review",
      content: "Focus this Google Ads agent on budget pacing, anomaly detection, and weekly stakeholder reporting.",
      skill_graph: {
        system_name: "google-ads-optimizer",
        nodes: [
          {
            skill_id: "google-ads-audit",
            name: "Google Ads Audit",
            description: "Inspect campaign performance and wasted spend",
            status: "generated",
            source: "custom",
            depends_on: [],
          },
        ],
        workflow: {
          name: "main-workflow",
          description: "google-ads-optimizer workflow",
          steps: [
            { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
          ],
        },
      },
    };

    const events = await collectBuilderEvents(response);

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.SKILL_GRAPH_READY,
      value: expect.objectContaining({
        content: response.content,
      }),
    }));
  });

  test("reuses the fallback review summary for wizard description when ready_for_review omits content", async () => {
    const response = {
      type: "ready_for_review",
      skill_graph: {
        system_name: "google-ads-optimizer",
        nodes: [
          {
            skill_id: "google-ads-audit",
            name: "Google Ads Audit",
            description: "Inspect campaign performance and wasted spend",
            status: "generated",
            source: "custom",
            depends_on: [],
          },
          {
            skill_id: "budget-pacing-report",
            name: "Budget Pacing Report",
            description: "Summarize pacing and anomalies",
            status: "generated",
            source: "custom",
            depends_on: [],
          },
        ],
        workflow: {
          name: "main-workflow",
          description: "google-ads-optimizer workflow",
          steps: [
            { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
            { id: "step-1", action: "execute", skill: "budget-pacing-report", wait_for: ["step-0"] },
          ],
        },
      },
    };

    const events = await collectBuilderEvents(response);
    const fallbackSummary = "I've analysed your requirements and generated a skill graph with 2 skills. Review the configuration on the right and click Deploy when ready.";

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.SKILL_GRAPH_READY,
      value: expect.objectContaining({
        content: fallbackSummary,
      }),
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: CustomEventName.WIZARD_UPDATE_FIELDS,
      value: expect.objectContaining({
        description: fallbackSummary,
      }),
    }));
  });

  test("rotates the builder session after architect bridge failures", async () => {
    const rotatedSessions: string[] = [];
    mockSendToArchitectStreaming
      .mockRejectedValueOnce(new Error("gateway timeout"))
      .mockResolvedValueOnce({
        type: "agent_response",
        content: "Recovered response",
      });

    const agent = new BuilderAgent({
      sessionId: "session-1",
      onSessionRotate: (newSessionId) => {
        rotatedSessions.push(newSessionId);
      },
    });

    const firstEvents = await collectBuilderEventsFromAgent(agent);
    const secondEvents = await collectBuilderEventsFromAgent(agent);

    expect(firstEvents).toContainEqual(expect.objectContaining({
      type: EventType.RUN_ERROR,
      message: expect.stringContaining("gateway timeout"),
    }));
    expect(rotatedSessions).toHaveLength(1);
    expect(rotatedSessions[0]).not.toBe("session-1");
    expect(mockSendToArchitectStreaming.mock.calls[0]?.[0]).toBe("session-1");
    expect(typeof mockSendToArchitectStreaming.mock.calls[0]?.[1]).toBe("string");
    expect(mockSendToArchitectStreaming.mock.calls[1]?.[0]).toBe(rotatedSessions[0]);
    expect(typeof mockSendToArchitectStreaming.mock.calls[1]?.[1]).toBe("string");
    expect(secondEvents).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "Recovered response",
    }));
  });

  test("injects Co-Pilot wizard state into the architect prompt", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: "I can refine that Google Ads agent.",
    });

    const agent = new BuilderAgent({
      sessionId: "session-1",
      mode: "copilot",
    });

    const wizardState = {
      phase: "tools",
      name: "Google Ads Optimizer",
      description: "Improve ROAS and pacing alerts",
      selectedSkillIds: ["google-ads-audit", "budget-pacing-report"],
      connectedTools: [{ toolId: "google" }, { name: "Google Sheets" }],
      triggers: [{ id: "cron-schedule" }, { title: "Chat Command" }],
      agentRules: ["Prioritize wasted spend", "Explain recommendations briefly"],
    };

    await new Promise<void>((resolve, reject) => {
      const subscription = agent.run({
        threadId: "thread-1",
        runId: "run-1",
        messages: [{ id: "msg-1", role: "user", content: "Add anomaly detection" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: { wizardState },
      }).subscribe({
        complete: () => {
          subscription.unsubscribe();
          resolve();
        },
        error: reject,
      });
    });

    expect(mockSendToArchitectStreaming).toHaveBeenCalledTimes(1);
    const prompt = mockSendToArchitectStreaming.mock.calls[0]?.[1];
    expect(typeof prompt).toBe("string");
    expect(prompt).toContain("[WIZARD_STATE]");
    expect(prompt).toContain("Phase: tools");
    expect(prompt).toContain('Name: "Google Ads Optimizer"');
    expect(prompt).toContain('Description: "Improve ROAS and pacing alerts"');
    expect(prompt).toContain("Skills: google-ads-audit, budget-pacing-report");
    expect(prompt).toContain("Connected Tools: google, Google Sheets");
    expect(prompt).toContain("Triggers: cron-schedule, Chat Command");
    expect(prompt).toContain("Rules: Prioritize wasted spend; Explain recommendations briefly");
    expect(prompt).toContain("Add anomaly detection");
  });

  test("routes forge builder runs through forge chat and sends the system instruction separately", async () => {
    mockSendToForgeSandboxChat
      .mockResolvedValueOnce({
        type: "agent_response",
        content: "Forge run one",
      })
      .mockResolvedValueOnce({
        type: "agent_response",
        content: "Forge run two",
      });

    const agent = new BuilderAgent({
      sessionId: "session-1",
      forgeSandboxId: "forge-sandbox-1",
    });

    const firstEvents = await collectBuilderEventsFromAgent(agent);
    const secondEvents = await collectBuilderEventsFromAgent(agent);

    expect(mockSendToArchitectStreaming).not.toHaveBeenCalled();
    expect(mockSendToForgeSandboxChat).toHaveBeenCalledTimes(2);
    expect(mockSendToForgeSandboxChat.mock.calls[0]).toEqual([
      "forge-sandbox-1",
      "session-1",
      "Build a Google Ads optimizer",
      expect.objectContaining({
        onDelta: undefined,
        onStatus: expect.any(Function),
      }),
      expect.objectContaining({
        systemInstruction: expect.stringContaining("You are the architect agent"),
      }),
    ]);
    expect(mockSendToForgeSandboxChat.mock.calls[1]).toEqual([
      "forge-sandbox-1",
      "session-1",
      "Build a Google Ads optimizer",
      expect.objectContaining({
        onDelta: undefined,
        onStatus: expect.any(Function),
      }),
      {},
    ]);

    expect(firstEvents).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "Forge run one",
    }));
    expect(secondEvents).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "Forge run two",
    }));
  });

  test("sends BUILDER_SYSTEM_INSTRUCTION on build-stage messages even after the first message", async () => {
    const { BUILDER_SYSTEM_INSTRUCTION } = await import("../builder-agent");

    // First call: think stage (consumes isFirstMessage)
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: "Thinking about your agent...",
    });
    // Second call: build stage (should still include BUILDER_SYSTEM_INSTRUCTION)
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: "Building your agent...",
    });

    const agent = new BuilderAgent({ sessionId: "session-1" });

    // Run 1: think stage — sets isFirstMessage = false
    await new Promise<void>((resolve, reject) => {
      const subscription = agent.run({
        threadId: "thread-1",
        runId: "run-1",
        messages: [{ id: "msg-1", role: "user", content: "Create a Google Ads optimizer" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: { wizardState: { devStage: "think", name: "", description: "", selectedSkillIds: [], connectedTools: [], triggers: [], agentRules: [] } },
      }).subscribe({ complete: () => { subscription.unsubscribe(); resolve(); }, error: reject });
    });

    // Run 2: build stage — should include BUILDER_SYSTEM_INSTRUCTION
    await new Promise<void>((resolve, reject) => {
      const subscription = agent.run({
        threadId: "thread-1",
        runId: "run-2",
        messages: [{ id: "msg-2", role: "user", content: "Generate the skills now" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: { wizardState: { devStage: "build", name: "", description: "", selectedSkillIds: [], connectedTools: [], triggers: [], agentRules: [] } },
      }).subscribe({ complete: () => { subscription.unsubscribe(); resolve(); }, error: reject });
    });

    expect(mockSendToArchitectStreaming).toHaveBeenCalledTimes(2);
    // The second call's message (arg index 1) should contain the builder system instruction
    const secondCallMessage = mockSendToArchitectStreaming.mock.calls[1]?.[1] as string;
    expect(secondCallMessage).toContain(BUILDER_SYSTEM_INSTRUCTION);
  });

  test("emits skill-graph-ready before closing a streamed copilot review summary", async () => {
    mockSendToArchitectStreaming.mockImplementationOnce(
      async (
        _sessionId: string,
        _message: string,
        callbacks?: { onDelta?: (delta: string) => void }
      ) => {
        callbacks?.onDelta?.("I analysed your Google Ads workflow.");

        return {
          type: "ready_for_review",
          content: "I analysed your Google Ads workflow.",
          skill_graph: {
            system_name: "google-ads-optimizer",
            nodes: [
              {
                skill_id: "google-ads-audit",
                name: "Google Ads Audit",
                description: "Inspect campaign performance and wasted spend",
                status: "generated",
                source: "custom",
                depends_on: [],
              },
            ],
            workflow: {
              name: "main-workflow",
              description: "google-ads-optimizer workflow",
              steps: [
                { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
              ],
            },
          },
        };
      }
    );

    const agent = new BuilderAgent({
      sessionId: "session-1",
      mode: "copilot",
    });

    const events = await collectBuilderEventsFromAgent(agent) as Array<Record<string, unknown>>;

    const skillGraphReadyIndex = events.findIndex(
      (event) =>
        event.type === EventType.CUSTOM
        && event.name === CustomEventName.SKILL_GRAPH_READY
    );
    const textMessageEndIndex = events.findIndex(
      (event) => event.type === EventType.TEXT_MESSAGE_END
    );

    expect(skillGraphReadyIndex).toBeGreaterThanOrEqual(0);
    expect(textMessageEndIndex).toBeGreaterThanOrEqual(0);
    expect(skillGraphReadyIndex).toBeLessThan(textMessageEndIndex);
  });
});

describe("BUILDER_SYSTEM_INSTRUCTION", () => {
  test("instructs the architect to use ready_for_review code block format", async () => {
    const { BUILDER_SYSTEM_INSTRUCTION } = await import("../builder-agent");
    expect(BUILDER_SYSTEM_INSTRUCTION).toContain("ready_for_review");
    expect(BUILDER_SYSTEM_INSTRUCTION).toContain("skill_graph");
    expect(BUILDER_SYSTEM_INSTRUCTION).toContain("system_name");
    expect(BUILDER_SYSTEM_INSTRUCTION).toContain("agent_metadata");
    expect(BUILDER_SYSTEM_INSTRUCTION).toContain("skill_id");
    expect(BUILDER_SYSTEM_INSTRUCTION).toContain("depends_on");
  });
});
