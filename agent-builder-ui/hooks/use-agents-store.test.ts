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
  skillGraph: [{ skill_id: "old-skill", name: "Existing Skill", description: "Old graph" }],
  workflow: [{ step: "old-step", node_id: "old-skill" }] as unknown as SavedAgent["workflow"],
  agentRules: ["rule: old"],
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
        model: "claude-sonnet-4-6",
      }),
    ]);
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
            skill_graph: [{ skill_id: "old-skill", name: "Existing Skill", description: "Old graph" }],
            workflow: [{ step: "old-step", node_id: "old-skill" }],
            agent_rules: ["rule: old"],
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
            skill_graph: [{ skill_id: "new-skill", name: "Planner", description: "New graph" }],
            workflow: [{ step: "new-step", node_id: "new-skill" }],
            agent_rules: ["rule: new"],
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
      skillGraph: [{ skill_id: "new-skill", name: "Planner", description: "New graph" }],
      workflow: [{ step: "new-step", node_id: "new-skill" }] as unknown as SavedAgent["workflow"],
      agentRules: ["rule: new"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(saved.skillGraph).toEqual([{ skill_id: "new-skill", name: "Planner", description: "New graph" }]);
    expect(saved.workflow).toEqual([{ step: "new-step", node_id: "new-skill" }]);
    expect(saved.agentRules).toEqual(["rule: new"]);
    expect(saved.model).toBe("claude-sonnet-4-6");
    expect(useAgentsStore.getState().agents[0]).toEqual(saved);
  });
});
