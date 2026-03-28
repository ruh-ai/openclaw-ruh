import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { useAgentsStore, type SavedAgent } from "./use-agents-store";

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;

const baseAgent: SavedAgent = {
  id: "agent-1",
  name: "Existing Agent",
  avatar: "🤖",
  description: "Original description",
  skills: ["Existing Skill"],
  triggerLabel: "Manual trigger",
  status: "active",
  createdAt: "2026-03-25T00:00:00.000Z",
  sandboxIds: ["sb-1"],
  runtimeInputs: [
    {
      key: "GOOGLE_ADS_CUSTOMER_ID",
      label: "Customer ID",
      description: "Google Ads customer ID for the target account.",
      required: true,
      source: "architect_requirement",
      value: "123-456-7890",
    },
  ],
  skillGraph: [{ skill_id: "old-skill", name: "Existing Skill", description: "Old graph" }],
  workflow: [{ step: "old-step", node_id: "old-skill" }] as unknown as SavedAgent["workflow"],
  agentRules: ["rule: old"],
  toolConnections: [
    {
      toolId: "google-ads",
      name: "Google Ads",
      description: "Manage campaigns and pull performance data.",
      status: "configured",
      authKind: "oauth",
      connectorType: "mcp",
      configSummary: ["Connected account: Acme Ads"],
    },
  ],
  triggers: [
    {
      id: "cron-schedule",
      title: "Cron Schedule",
      kind: "schedule",
      status: "supported",
      description: "Runs every weekday at 9 AM.",
      schedule: "0 9 * * 1-5",
    },
  ],
  channels: [
    {
      kind: "slack",
      status: "planned",
      label: "Slack",
      description: "Configure the workspace bot after deploy.",
    },
  ],
  workspaceMemory: {
    instructions: "Keep status updates short",
    continuitySummary: "Need to finish launch review",
    pinnedPaths: ["plans/launch.md"],
    updatedAt: "2026-03-25T17:30:00.000Z",
  },
  discoveryDocuments: {
    prd: {
      title: "Product Requirements Document",
      sections: [
        {
          heading: "Goal",
          content: "Build a Google Ads optimization copilot.",
        },
      ],
    },
    trd: {
      title: "Technical Requirements Document",
      sections: [
        {
          heading: "Integrations",
          content: "Use the Google Ads MCP connector.",
        },
      ],
    },
  },
  model: "claude-sonnet-4-6",
};

beforeEach(() => {
  let storage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage = new Map<string, string>();
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  } as Storage;

  useAgentsStore.setState({
    agents: [baseAgent],
    isLoading: false,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalLocalStorage;
  useAgentsStore.setState({
    agents: [],
    isLoading: false,
  });
});

describe("useAgentsStore", () => {
  test("fetchAgents preserves client-only model preferences during backend refresh", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/agents")) {
        return new Response(
          JSON.stringify([
            {
              id: "agent-1",
              name: "Existing Agent",
              avatar: "🤖",
              description: "Fresh from backend",
              skills: ["Planner"],
              trigger_label: "Manual trigger",
              status: "active",
              sandbox_ids: ["sb-1", "sb-2"],
              runtime_inputs: [
                {
                  key: "GOOGLE_ADS_CUSTOMER_ID",
                  label: "Customer ID",
                  description: "Google Ads customer ID for the target account.",
                  required: true,
                  source: "architect_requirement",
                  value: "123-456-7890",
                },
              ],
              tool_connections: [
                {
                  toolId: "google-ads",
                  name: "Google Ads",
                  description: "Manage campaigns and pull performance data.",
                  status: "configured",
                  authKind: "oauth",
                  connectorType: "mcp",
                  configSummary: ["Connected account: Acme Ads"],
                },
              ],
              triggers: [
                {
                  id: "cron-schedule",
                  title: "Cron Schedule",
                  kind: "schedule",
                  status: "supported",
                  description: "Runs every weekday at 9 AM.",
                  schedule: "0 9 * * 1-5",
                },
              ],
              channels: [
                {
                  kind: "slack",
                  status: "planned",
                  label: "Slack",
                  description: "Configure the workspace bot after deploy.",
                },
              ],
              created_at: "2026-03-25T00:00:00.000Z",
              updated_at: "2026-03-25T02:00:00.000Z",
            },
          ]),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;
    useAgentsStore.setState({
      agents: [{ ...baseAgent, model: "claude-sonnet-4-6" }],
      isLoading: false,
    });

    await useAgentsStore.getState().fetchAgents();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAgentsStore.getState().isLoading).toBe(false);
    expect(useAgentsStore.getState().agents).toEqual([
      expect.objectContaining({
        id: "agent-1",
        description: "Fresh from backend",
        skills: ["Planner"],
        sandboxIds: ["sb-1", "sb-2"],
        runtimeInputs: [
          expect.objectContaining({
            key: "GOOGLE_ADS_CUSTOMER_ID",
            value: "123-456-7890",
          }),
        ],
        toolConnections: [
          expect.objectContaining({
            toolId: "google-ads",
            status: "configured",
          }),
        ],
        triggers: [
          expect.objectContaining({
            id: "cron-schedule",
            status: "supported",
          }),
        ],
        channels: [
          expect.objectContaining({
            kind: "slack",
            status: "planned",
          }),
        ],
        model: "claude-sonnet-4-6",
      }),
    ]);
  });

  test("fetchAgent preserves persisted research plans on tool connections", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/agents/agent-1")) {
        return new Response(
          JSON.stringify({
            id: "agent-1",
            name: "Existing Agent",
            avatar: "🤖",
            description: "Fresh from backend",
            skills: ["Planner"],
            trigger_label: "Manual trigger",
            status: "active",
            sandbox_ids: ["sb-1"],
            runtime_inputs: [],
            tool_connections: [
              {
                toolId: "linear",
                name: "Linear",
                description: "Track engineering work.",
                status: "unsupported",
                authKind: "none",
                connectorType: "api",
                configSummary: ["Manual integration still required"],
                researchPlan: {
                  toolName: "Linear",
                  recommendedMethod: "api",
                  recommendedPackage: "@linear/sdk",
                  summary: "Use the API for durable issue workflows.",
                  rationale: "The API supports issue lifecycle operations.",
                  requiredCredentials: [],
                  setupSteps: ["Create a Linear API key."],
                  integrationSteps: ["Add issue create/update calls to the builder tool."],
                  validationSteps: ["Create a test issue in a sandbox workspace."],
                  alternatives: [],
                  sources: [{ title: "Linear API docs", url: "https://linear.app/docs/api" }],
                },
              },
            ],
            triggers: [],
            created_at: "2026-03-25T00:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const agent = await useAgentsStore.getState().fetchAgent("agent-1");

    expect(agent?.toolConnections).toEqual([
      expect.objectContaining({
        toolId: "linear",
        researchPlan: expect.objectContaining({
          recommendedPackage: "@linear/sdk",
          setupSteps: ["Create a Linear API key."],
          sources: [{ title: "Linear API docs", url: "https://linear.app/docs/api" }],
        }),
      }),
    ]);
  });

  test("saveAgentDraft creates a draft agent from safe metadata only", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/agents") && init?.method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}"));

        expect(body).toEqual(
          expect.objectContaining({
            name: "Draft Agent",
            avatar: "🤖",
            description: "Draft description",
            skills: ["Google Ads Audit", "Budget Pacing Report"],
            triggerLabel: "Cron Schedule",
            status: "draft",
            skillGraph: [
              { skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Inspect campaign performance" },
              { skill_id: "budget-pacing-report", name: "Budget Pacing Report", description: "Generate weekly summaries" },
            ],
            workflow: [{ step: "step-0", node_id: "google-ads-audit" }],
            agentRules: ["Communicate in an analytical tone"],
            runtimeInputs: [
              {
                key: "GOOGLE_ADS_CUSTOMER_ID",
                label: "Customer ID",
                description: "Google Ads customer ID for the target account.",
                required: true,
                source: "architect_requirement",
                value: "123-456-7890",
              },
            ],
            toolConnections: [
              {
                toolId: "google-ads",
                name: "Google Ads",
                description: "Manage campaigns and pull performance data.",
                status: "configured",
                authKind: "oauth",
                connectorType: "mcp",
                configSummary: ["Connected account: Acme Ads"],
              },
            ],
            triggers: [
              {
                id: "cron-schedule",
                title: "Cron Schedule",
                kind: "schedule",
                status: "supported",
                description: "Runs every weekday at 9 AM.",
                schedule: "0 9 * * 1-5",
              },
            ],
            channels: [
              {
                kind: "telegram",
                status: "planned",
                label: "Telegram",
                description: "Connect the bot token after deploy.",
              },
            ],
            discoveryDocuments: {
              prd: {
                title: "Product Requirements Document",
                sections: [
                  {
                    heading: "Goal",
                    content: "Build a Google Ads optimization copilot.",
                  },
                ],
              },
              trd: {
                title: "Technical Requirements Document",
                sections: [
                  {
                    heading: "Integrations",
                    content: "Use the Google Ads MCP connector.",
                  },
                ],
              },
            },
          }),
        );

        return new Response(
          JSON.stringify({
            id: "agent-draft",
            name: "Draft Agent",
            avatar: "🤖",
            description: "Draft description",
            skills: ["Google Ads Audit", "Budget Pacing Report"],
            trigger_label: "Cron Schedule",
            status: "draft",
            sandbox_ids: [],
            runtime_inputs: [
              {
                key: "GOOGLE_ADS_CUSTOMER_ID",
                label: "Customer ID",
                description: "Google Ads customer ID for the target account.",
                required: true,
                source: "architect_requirement",
                value: "123-456-7890",
              },
            ],
            skill_graph: [
              { skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Inspect campaign performance" },
              { skill_id: "budget-pacing-report", name: "Budget Pacing Report", description: "Generate weekly summaries" },
            ],
            workflow: [{ step: "step-0", node_id: "google-ads-audit" }],
            agent_rules: ["Communicate in an analytical tone"],
            tool_connections: [
              {
                toolId: "google-ads",
                name: "Google Ads",
                description: "Manage campaigns and pull performance data.",
                status: "configured",
                authKind: "oauth",
                connectorType: "mcp",
                configSummary: ["Connected account: Acme Ads"],
              },
            ],
            triggers: [
              {
                id: "cron-schedule",
                title: "Cron Schedule",
                kind: "schedule",
                status: "supported",
                description: "Runs every weekday at 9 AM.",
                schedule: "0 9 * * 1-5",
              },
            ],
            channels: [
              {
                kind: "telegram",
                status: "planned",
                label: "Telegram",
                description: "Connect the bot token after deploy.",
              },
            ],
            discovery_documents: {
              prd: {
                title: "Product Requirements Document",
                sections: [
                  {
                    heading: "Goal",
                    content: "Build a Google Ads optimization copilot.",
                  },
                ],
              },
              trd: {
                title: "Technical Requirements Document",
                sections: [
                  {
                    heading: "Integrations",
                    content: "Use the Google Ads MCP connector.",
                  },
                ],
              },
            },
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const saved = await useAgentsStore.getState().saveAgentDraft({
      name: "Draft Agent",
      description: "Draft description",
      skillGraph: [
        { skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Inspect campaign performance" },
        { skill_id: "budget-pacing-report", name: "Budget Pacing Report", description: "Generate weekly summaries" },
      ],
      workflow: [{ step: "step-0", node_id: "google-ads-audit" }] as unknown as SavedAgent["workflow"],
      agentRules: ["Communicate in an analytical tone"],
      runtimeInputs: [
        {
          key: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Customer ID",
          description: "Google Ads customer ID for the target account.",
          required: true,
          source: "architect_requirement",
          value: "123-456-7890",
        },
      ],
      toolConnections: [
        {
          toolId: "google-ads",
          name: "Google Ads",
          description: "Manage campaigns and pull performance data.",
          status: "configured",
          authKind: "oauth",
          connectorType: "mcp",
          configSummary: ["Connected account: Acme Ads"],
        },
      ],
      triggers: [
        {
          id: "cron-schedule",
          title: "Cron Schedule",
          kind: "schedule",
          status: "supported",
          description: "Runs every weekday at 9 AM.",
          schedule: "0 9 * * 1-5",
        },
      ],
      channels: [
        {
          kind: "telegram",
          status: "planned",
          label: "Telegram",
          description: "Connect the bot token after deploy.",
        },
      ],
      discoveryDocuments: {
        prd: {
          title: "Product Requirements Document",
          sections: [
            {
              heading: "Goal",
              content: "Build a Google Ads optimization copilot.",
            },
          ],
        },
        trd: {
          title: "Technical Requirements Document",
          sections: [
            {
              heading: "Integrations",
              content: "Use the Google Ads MCP connector.",
            },
          ],
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(expect.objectContaining({
      id: "agent-draft",
      name: "Draft Agent",
      avatar: "🤖",
      description: "Draft description",
      skills: ["Google Ads Audit", "Budget Pacing Report"],
      triggerLabel: "Cron Schedule",
      status: "draft",
      skillGraph: [
        { skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Inspect campaign performance" },
        { skill_id: "budget-pacing-report", name: "Budget Pacing Report", description: "Generate weekly summaries" },
      ],
      workflow: [{ step: "step-0", node_id: "google-ads-audit" }],
      agentRules: ["Communicate in an analytical tone"],
      toolConnections: [
        expect.objectContaining({ toolId: "google-ads", status: "configured" }),
      ],
      triggers: [
        expect.objectContaining({ id: "cron-schedule", status: "supported" }),
      ],
      channels: [
        expect.objectContaining({ kind: "telegram", status: "planned" }),
      ],
      discoveryDocuments: {
        prd: {
          title: "Product Requirements Document",
          sections: [
            {
              heading: "Goal",
              content: "Build a Google Ads optimization copilot.",
            },
          ],
        },
        trd: {
          title: "Technical Requirements Document",
          sections: [
            {
              heading: "Integrations",
              content: "Use the Google Ads MCP connector.",
            },
          ],
        },
      },
    }));
    expect(useAgentsStore.getState().agents[0]).toEqual(saved);
  });

  test("saveAgentDraft updates an existing active agent without changing its status", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/agents/agent-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body).toEqual(
          expect.objectContaining({
            name: "Updated Active Agent",
            description: "Refined description",
            skills: ["Google Ads Audit"],
            triggerLabel: "Manual trigger",
            status: "active",
          }),
        );

        return new Response(
          JSON.stringify({
            id: "agent-1",
            name: "Updated Active Agent",
            avatar: "🤖",
            description: "Refined description",
            skills: ["Google Ads Audit"],
            trigger_label: "Manual trigger",
            status: "active",
            sandbox_ids: ["sb-1"],
            tool_connections: [],
            triggers: [],
            skill_graph: [{ skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Updated graph" }],
            workflow: [{ step: "step-0", node_id: "google-ads-audit" }],
            agent_rules: ["rule: updated"],
            workspace_memory: {
              instructions: "Keep status updates short",
              continuity_summary: "Need to finish launch review",
              pinned_paths: ["plans/launch.md"],
              updated_at: "2026-03-25T17:30:00.000Z",
            },
            created_at: "2026-03-25T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/api/agents/agent-1/config") && init?.method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body).toEqual(
          expect.objectContaining({
            skillGraph: [{ skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Updated graph" }],
            workflow: [{ step: "step-0", node_id: "google-ads-audit" }],
            agentRules: ["rule: updated"],
            toolConnections: [],
            triggers: [],
          }),
        );

        return new Response(
          JSON.stringify({
            id: "agent-1",
            name: "Updated Active Agent",
            avatar: "🤖",
            description: "Refined description",
            skills: ["Google Ads Audit"],
            trigger_label: "Manual trigger",
            status: "active",
            sandbox_ids: ["sb-1"],
            tool_connections: [],
            triggers: [],
            skill_graph: [{ skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Updated graph" }],
            workflow: [{ step: "step-0", node_id: "google-ads-audit" }],
            agent_rules: ["rule: updated"],
            workspace_memory: {
              instructions: "Keep status updates short",
              continuity_summary: "Need to finish launch review",
              pinned_paths: ["plans/launch.md"],
              updated_at: "2026-03-25T17:30:00.000Z",
            },
            created_at: "2026-03-25T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const saved = await useAgentsStore.getState().saveAgentDraft({
      agentId: "agent-1",
      name: "Updated Active Agent",
      description: "Refined description",
      skillGraph: [{ skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Updated graph" }],
      workflow: [{ step: "step-0", node_id: "google-ads-audit" }] as unknown as SavedAgent["workflow"],
      agentRules: ["rule: updated"],
      toolConnections: [],
      triggers: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(saved.status).toBe("active");
    expect(saved.name).toBe("Updated Active Agent");
    expect(saved.skills).toEqual(["Google Ads Audit"]);
    expect(saved.triggerLabel).toBe("Manual trigger");
    expect(saved.skillGraph).toEqual([
      { skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Updated graph" },
    ]);
    expect(saved.workflow).toEqual([{ step: "step-0", node_id: "google-ads-audit" }]);
    expect(saved.agentRules).toEqual(["rule: updated"]);
    expect(useAgentsStore.getState().agents[0]).toEqual(saved);
  });

  test("saveAgentDraft refreshes the trigger label from updated structured triggers when editing an existing agent", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/agents/agent-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body).toEqual(
          expect.objectContaining({
            name: "Existing Agent",
            description: "Original description",
            triggerLabel: "Weekday Budget Pacing",
            status: "active",
          }),
        );

        return new Response(
          JSON.stringify({
            id: "agent-1",
            name: "Existing Agent",
            avatar: "🤖",
            description: "Original description",
            skills: ["Existing Skill"],
            trigger_label: "Weekday Budget Pacing",
            status: "active",
            sandbox_ids: ["sb-1"],
            tool_connections: baseAgent.toolConnections,
            triggers: [
              {
                id: "weekday-budget-pacing",
                title: "Weekday Budget Pacing",
                kind: "schedule",
                status: "supported",
                description: "Runs every weekday at 9 AM.",
                schedule: "0 9 * * 1-5",
              },
            ],
            skill_graph: baseAgent.skillGraph,
            workflow: baseAgent.workflow,
            agent_rules: baseAgent.agentRules,
            workspace_memory: {
              instructions: "Keep status updates short",
              continuity_summary: "Need to finish launch review",
              pinned_paths: ["plans/launch.md"],
              updated_at: "2026-03-25T17:30:00.000Z",
            },
            created_at: "2026-03-25T00:00:00.000Z",
            updated_at: "2026-03-26T00:10:00.000Z",
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/api/agents/agent-1/config") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            id: "agent-1",
            name: "Existing Agent",
            avatar: "🤖",
            description: "Original description",
            skills: ["Existing Skill"],
            trigger_label: "Weekday Budget Pacing",
            status: "active",
            sandbox_ids: ["sb-1"],
            tool_connections: baseAgent.toolConnections,
            triggers: [
              {
                id: "weekday-budget-pacing",
                title: "Weekday Budget Pacing",
                kind: "schedule",
                status: "supported",
                description: "Runs every weekday at 9 AM.",
                schedule: "0 9 * * 1-5",
              },
            ],
            skill_graph: baseAgent.skillGraph,
            workflow: baseAgent.workflow,
            agent_rules: baseAgent.agentRules,
            workspace_memory: {
              instructions: "Keep status updates short",
              continuity_summary: "Need to finish launch review",
              pinned_paths: ["plans/launch.md"],
              updated_at: "2026-03-25T17:30:00.000Z",
            },
            created_at: "2026-03-25T00:00:00.000Z",
            updated_at: "2026-03-26T00:10:00.000Z",
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const saved = await useAgentsStore.getState().saveAgentDraft({
      agentId: "agent-1",
      name: "Existing Agent",
      description: "Original description",
      skillGraph: baseAgent.skillGraph,
      workflow: baseAgent.workflow,
      agentRules: baseAgent.agentRules,
      toolConnections: baseAgent.toolConnections,
      triggers: [
        {
          id: "weekday-budget-pacing",
          title: "Weekday Budget Pacing",
          kind: "schedule",
          status: "supported",
          description: "Runs every weekday at 9 AM.",
          schedule: "0 9 * * 1-5",
        },
      ],
    });

    expect(saved.triggerLabel).toBe("Weekday Budget Pacing");
  });

  test("persistAgentEdits returns the merged saved snapshot and preserves the client-only model", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/agents/agent-1") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            id: "agent-1",
            name: "Updated Agent",
            avatar: "📋",
            description: "Updated description",
            skills: ["Planner"],
            trigger_label: "cron: 0 9 * * *",
            status: "active",
            sandbox_ids: ["sb-1"],
            tool_connections: [],
            triggers: [],
            skill_graph: [{ skill_id: "old-skill", name: "Existing Skill", description: "Old graph" }],
            workflow: [{ step: "old-step", node_id: "old-skill" }],
            agent_rules: ["rule: old"],
            workspace_memory: {
              instructions: "Keep status updates short",
              continuity_summary: "Need to finish launch review",
              pinned_paths: ["plans/launch.md"],
              updated_at: "2026-03-25T17:30:00.000Z",
            },
            created_at: "2026-03-25T00:00:00.000Z",
            updated_at: "2026-03-25T01:00:00.000Z",
          }),
          { status: 200 }
        );
      }

      if (url.endsWith("/api/agents/agent-1/config") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            id: "agent-1",
            name: "Updated Agent",
            avatar: "📋",
            description: "Updated description",
            skills: ["Planner"],
            trigger_label: "cron: 0 9 * * *",
            status: "active",
            sandbox_ids: ["sb-1"],
            tool_connections: [
              {
                toolId: "google-ads",
                name: "Google Ads",
                description: "Manage campaigns and pull performance data.",
                status: "configured",
                authKind: "oauth",
                connectorType: "mcp",
                configSummary: ["Connected account: Acme Ads"],
              },
            ],
            triggers: [
              {
                id: "cron-schedule",
                title: "Cron Schedule",
                kind: "schedule",
                status: "supported",
                description: "Runs every weekday at 9 AM.",
                schedule: "0 9 * * 1-5",
              },
            ],
            skill_graph: [{ skill_id: "new-skill", name: "Planner", description: "New graph" }],
            workflow: [{ step: "new-step", node_id: "new-skill" }],
            agent_rules: ["rule: new"],
            workspace_memory: {
              instructions: "Keep status updates short",
              continuity_summary: "Need to finish launch review",
              pinned_paths: ["plans/launch.md"],
              updated_at: "2026-03-25T17:30:00.000Z",
            },
            created_at: "2026-03-25T00:00:00.000Z",
            updated_at: "2026-03-25T01:05:00.000Z",
          }),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const saved = await useAgentsStore.getState().persistAgentEdits("agent-1", {
      name: "Updated Agent",
      avatar: "📋",
      description: "Updated description",
      skills: ["Planner"],
      triggerLabel: "cron: 0 9 * * *",
      toolConnections: [
        {
          toolId: "google-ads",
          name: "Google Ads",
          description: "Manage campaigns and pull performance data.",
          status: "configured",
          authKind: "oauth",
          connectorType: "mcp",
          configSummary: ["Connected account: Acme Ads"],
        },
      ],
      triggers: [
        {
          id: "cron-schedule",
          title: "Cron Schedule",
          kind: "schedule",
          status: "supported",
          description: "Runs every weekday at 9 AM.",
          schedule: "0 9 * * 1-5",
        },
      ],
      skillGraph: [{ skill_id: "new-skill", name: "Planner", description: "New graph" }],
      workflow: [{ step: "new-step", node_id: "new-skill" }] as unknown as SavedAgent["workflow"],
      agentRules: ["rule: new"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(saved.skillGraph).toEqual([{ skill_id: "new-skill", name: "Planner", description: "New graph" }]);
    expect(saved.workflow).toEqual([{ step: "new-step", node_id: "new-skill" }]);
    expect(saved.agentRules).toEqual(["rule: new"]);
    expect(saved.toolConnections).toEqual([
      expect.objectContaining({
        toolId: "google-ads",
        status: "configured",
      }),
    ]);
    expect(saved.triggers).toEqual([
      expect.objectContaining({
        id: "cron-schedule",
        status: "supported",
      }),
    ]);
    expect(saved.model).toBe("claude-sonnet-4-6");
    expect(useAgentsStore.getState().agents[0]).toEqual(saved);
  });

  test("updateAgentWorkspaceMemory persists memory while preserving the client-only model", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/agents/agent-1/workspace-memory") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            instructions: "Keep status updates concise",
            continuity_summary: "Need to finish launch review",
            pinned_paths: ["plans/launch.md", "reports/q1-summary.md"],
            updated_at: "2026-03-25T18:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const updated = await useAgentsStore.getState().updateAgentWorkspaceMemory("agent-1", {
      instructions: "Keep status updates concise",
      continuitySummary: "Need to finish launch review",
      pinnedPaths: ["plans/launch.md", "reports/q1-summary.md"],
    });

    expect(updated.workspaceMemory).toEqual({
      instructions: "Keep status updates concise",
      continuitySummary: "Need to finish launch review",
      pinnedPaths: ["plans/launch.md", "reports/q1-summary.md"],
      updatedAt: "2026-03-25T18:00:00.000Z",
    });
    expect(updated.model).toBe("claude-sonnet-4-6");
    expect(useAgentsStore.getState().agents[0]).toEqual(updated);
  });

  test("saveAgentDraft round-trips persisted improvement recommendations", async () => {
    const improvements = [
      {
        id: "connect-google-ads",
        kind: "tool_connection",
        status: "accepted",
        scope: "builder",
        title: "Connect Google Ads before deploy",
        summary: "Attach a Google Ads connection so the optimizer can read live account data.",
        rationale: "The generated Google Ads skills depend on account data that is not available yet.",
        targetId: "google-ads",
      },
    ];

    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/agents") && init?.method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body.improvements).toEqual(improvements);

        return new Response(
          JSON.stringify({
            id: "agent-improvements",
            name: "Draft Agent",
            avatar: "🤖",
            description: "Draft description",
            skills: ["Google Ads Audit"],
            trigger_label: "Cron Schedule",
            status: "draft",
            sandbox_ids: [],
            tool_connections: [],
            triggers: [],
            improvements,
            skill_graph: [
              { skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Inspect campaign performance" },
            ],
            workflow: [{ step: "step-0", node_id: "google-ads-audit" }],
            agent_rules: ["Communicate in an analytical tone"],
            workspace_memory: {},
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z",
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const saved = await useAgentsStore.getState().saveAgentDraft({
      name: "Draft Agent",
      description: "Draft description",
      skillGraph: [
        { skill_id: "google-ads-audit", name: "Google Ads Audit", description: "Inspect campaign performance" },
      ],
      workflow: [{ step: "step-0", node_id: "google-ads-audit" }] as unknown as SavedAgent["workflow"],
      agentRules: ["Communicate in an analytical tone"],
      improvements,
    });

    expect(saved.improvements).toEqual(improvements);
  });
});
