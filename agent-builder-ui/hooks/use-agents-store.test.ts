/**
 * Tests for use-agents-store — covers fetchAgents, fetchAgent, saveAgent,
 * saveAgentDraft, updateAgent, deleteAgent, setAgentModel, and helper functions.
 */
import { describe, expect, test, mock, beforeEach } from "bun:test";

// ─── Mock zustand/middleware (persist) before importing the store ────────────
mock.module("zustand/middleware", () => ({
  persist: (fn: unknown) => fn,
}));

// ─── Mock fetchBackendWithAuth ────────────────────────────────────────────────
const fetchMock = mock(async (_url: string, _init?: RequestInit) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: fetchMock,
}));

// ─── Mock workspace-memory ───────────────────────────────────────────────────
mock.module("@/lib/openclaw/workspace-memory", () => ({
  normalizeWorkspaceMemory: (v: unknown) => v ?? null,
}));

import { useAgentsStore } from "./use-agents-store";
import type { SavedAgent } from "./use-agents-store";

// ─── Helper builders ──────────────────────────────────────────────────────────

function makeBackendAgent(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "agent-1",
    name: "Google Ads Agent",
    avatar: "🤖",
    description: "Manages campaigns",
    skills: ["campaign-monitor"],
    trigger_label: "Daily",
    status: "draft",
    created_at: "2026-01-01T00:00:00.000Z",
    sandbox_ids: [],
    runtime_inputs: [],
    skill_graph: null,
    workflow: null,
    agent_rules: [],
    tool_connections: [],
    triggers: [],
    improvements: [],
    channels: [],
    discovery_documents: null,
    workspace_memory: null,
    forge_sandbox_id: null,
    forge_stage: null,
    creation_session: null,
    service_ports: null,
    repo_url: null,
    active_branch: "main",
    ...overrides,
  };
}

function makeFetchResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockClear();
  useAgentsStore.setState({ agents: [], isLoading: false });
});

// ─── fromBackend mapping ──────────────────────────────────────────────────────

describe("fromBackend field mapping", () => {
  test("fetchAgents maps snake_case backend fields to camelCase", async () => {
    const backendData = [
      makeBackendAgent({ id: "a1", forge_sandbox_id: "sb-forge-1", active_branch: "feat/new-skill" }),
    ];
    fetchMock.mockImplementation(async () => makeFetchResponse(backendData));

    await useAgentsStore.getState().fetchAgents();
    const agents = useAgentsStore.getState().agents;
    expect(agents).toHaveLength(1);
    expect(agents[0].forgeSandboxId).toBe("sb-forge-1");
    expect(agents[0].activeBranch).toBe("feat/new-skill");
    expect(agents[0].id).toBe("a1");
  });

  test("fetchAgents keeps client-only model field from existing store", async () => {
    useAgentsStore.setState({
      agents: [{ ...(makeBackendAgent({ id: "a1" }) as unknown as SavedAgent), model: "claude-sonnet-4-6" }],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse([makeBackendAgent({ id: "a1" })]));

    await useAgentsStore.getState().fetchAgents();
    expect(useAgentsStore.getState().agents[0].model).toBe("claude-sonnet-4-6");
  });

  test("fetchAgents gracefully handles fetch failure by keeping existing state", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1" }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Server Error" }, 500));

    await useAgentsStore.getState().fetchAgents();
    expect(useAgentsStore.getState().agents).toHaveLength(1);
    expect(useAgentsStore.getState().isLoading).toBe(false);
  });
});

// ─── fetchAgent ───────────────────────────────────────────────────────────────

describe("fetchAgent", () => {
  test("adds agent to store when not present", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse(makeBackendAgent({ id: "a2" })));

    const agent = await useAgentsStore.getState().fetchAgent("a2");
    expect(agent?.id).toBe("a2");
    expect(useAgentsStore.getState().agents.find((a) => a.id === "a2")).toBeDefined();
  });

  test("updates agent in store when already present", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1", name: "Old Name" }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse(makeBackendAgent({ id: "a1", name: "New Name" })));

    await useAgentsStore.getState().fetchAgent("a1");
    expect(useAgentsStore.getState().agents[0].name).toBe("New Name");
  });

  test("returns null on fetch failure", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Not found" }, 404));

    const agent = await useAgentsStore.getState().fetchAgent("nonexistent");
    expect(agent).toBeNull();
  });

  test("returns null when fetch throws", async () => {
    fetchMock.mockImplementation(async () => { throw new Error("Network error"); });

    const agent = await useAgentsStore.getState().fetchAgent("a1");
    expect(agent).toBeNull();
  });
});

// ─── saveAgent ────────────────────────────────────────────────────────────────

describe("saveAgent", () => {
  test("adds new agent to the beginning of agents list", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse(makeBackendAgent({ id: "new-1" })));

    const id = await useAgentsStore.getState().saveAgent({
      name: "Test Agent",
      avatar: "🤖",
      description: "desc",
      skills: [],
      triggerLabel: "",
      status: "draft",
      agentRules: [],
    });
    expect(id).toBe("new-1");
    expect(useAgentsStore.getState().agents[0].id).toBe("new-1");
  });

  test("throws on 401 with human-readable message", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Unauthorized" }, 401));

    await expect(
      useAgentsStore.getState().saveAgent({
        name: "T",
        avatar: "",
        description: "",
        skills: [],
        triggerLabel: "",
        status: "draft",
        agentRules: [],
      }),
    ).rejects.toThrow("Not authenticated");
  });

  test("throws on non-401 error using message from server", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ message: "Quota exceeded" }, 429));

    await expect(
      useAgentsStore.getState().saveAgent({
        name: "T",
        avatar: "",
        description: "",
        skills: [],
        triggerLabel: "",
        status: "draft",
        agentRules: [],
      }),
    ).rejects.toThrow("Quota exceeded");
  });
});

// ─── saveAgentDraft ───────────────────────────────────────────────────────────

describe("saveAgentDraft", () => {
  test("creates a new agent when no agentId provided", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse(makeBackendAgent({ id: "draft-1" })));

    const agent = await useAgentsStore.getState().saveAgentDraft({
      name: "Draft Agent",
      description: "testing",
    });
    expect(agent.id).toBe("draft-1");
  });

  test("uses existing agent data when agentId matches a known agent", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "existing-1", name: "Existing", status: "active" }) as unknown as SavedAgent],
      isLoading: false,
    });

    fetchMock.mockImplementation(async () => {
      return makeFetchResponse(makeBackendAgent({ id: "existing-1", name: "Updated Name", status: "active" }));
    });

    const agent = await useAgentsStore.getState().saveAgentDraft({
      agentId: "existing-1",
      name: "Updated Name",
      description: "testing",
    });
    expect(agent.id).toBe("existing-1");
  });
});

// ─── updateAgent ──────────────────────────────────────────────────────────────

describe("updateAgent", () => {
  test("updates agent in store on success", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1", name: "Old" }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse(makeBackendAgent({ id: "a1", name: "New" })));

    const updated = await useAgentsStore.getState().updateAgent("a1", { name: "New" });
    expect(updated.name).toBe("New");
    expect(useAgentsStore.getState().agents[0].name).toBe("New");
  });

  test("throws on 401", async () => {
    useAgentsStore.setState({ agents: [], isLoading: false });
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Unauthorized" }, 401));

    await expect(useAgentsStore.getState().updateAgent("a1", { name: "x" })).rejects.toThrow("Not authenticated");
  });
});

// ─── deleteAgent ──────────────────────────────────────────────────────────────

describe("deleteAgent", () => {
  test("removes agent from store on success", async () => {
    useAgentsStore.setState({
      agents: [
        makeBackendAgent({ id: "a1" }) as unknown as SavedAgent,
        makeBackendAgent({ id: "a2" }) as unknown as SavedAgent,
      ],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse({ deleted: true }));

    await useAgentsStore.getState().deleteAgent("a1");
    const agents = useAgentsStore.getState().agents;
    expect(agents.find((a) => a.id === "a1")).toBeUndefined();
    expect(agents.find((a) => a.id === "a2")).toBeDefined();
  });

  test("throws when delete fails", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Not found" }, 404));
    await expect(useAgentsStore.getState().deleteAgent("missing")).rejects.toThrow("Failed to delete agent");
  });
});

// ─── bulkDeleteAgents ─────────────────────────────────────────────────────────

describe("bulkDeleteAgents", () => {
  test("removes deleted agents from store", async () => {
    useAgentsStore.setState({
      agents: [
        makeBackendAgent({ id: "a1" }) as unknown as SavedAgent,
        makeBackendAgent({ id: "a2" }) as unknown as SavedAgent,
        makeBackendAgent({ id: "a3" }) as unknown as SavedAgent,
      ],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () =>
      makeFetchResponse({ deleted: ["a1", "a2"], failed: [], sandboxesCleaned: 2 }),
    );

    const result = await useAgentsStore.getState().bulkDeleteAgents(["a1", "a2"]);
    expect(result.deleted).toEqual(["a1", "a2"]);
    expect(useAgentsStore.getState().agents).toHaveLength(1);
    expect(useAgentsStore.getState().agents[0].id).toBe("a3");
  });
});

// ─── updateAgentStatus ────────────────────────────────────────────────────────

describe("updateAgentStatus", () => {
  test("delegates to updateAgent with only the status field", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1", status: "draft" }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse(makeBackendAgent({ id: "a1", status: "active" })));

    await useAgentsStore.getState().updateAgentStatus("a1", "active");
    expect(useAgentsStore.getState().agents[0].status).toBe("active");
  });
});

// ─── setAgentModel ────────────────────────────────────────────────────────────

describe("setAgentModel", () => {
  test("updates the client-side model field without network call", () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1" }) as unknown as SavedAgent],
      isLoading: false,
    });

    useAgentsStore.getState().setAgentModel("a1", "claude-sonnet-4-6");
    expect(useAgentsStore.getState().agents[0].model).toBe("claude-sonnet-4-6");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sets model to undefined when undefined is passed", () => {
    useAgentsStore.setState({
      agents: [{ ...(makeBackendAgent({ id: "a1" }) as unknown as SavedAgent), model: "gpt-4" }],
      isLoading: false,
    });

    useAgentsStore.getState().setAgentModel("a1", undefined);
    expect(useAgentsStore.getState().agents[0].model).toBeUndefined();
  });
});

// ─── getForgeStatus ───────────────────────────────────────────────────────────

describe("getForgeStatus", () => {
  test("returns forge status from backend", async () => {
    const status = { active: true, status: "ready", forge_sandbox_id: "sb-forge-1" };
    fetchMock.mockImplementation(async () => makeFetchResponse(status));

    const result = await useAgentsStore.getState().getForgeStatus("a1");
    expect(result.forge_sandbox_id).toBe("sb-forge-1");
  });

  test("throws when status endpoint fails", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Not found" }, 404));
    await expect(useAgentsStore.getState().getForgeStatus("missing")).rejects.toThrow("Failed to get forge status");
  });
});

// ─── restartSandbox ───────────────────────────────────────────────────────────

describe("restartSandbox", () => {
  test("calls the restart endpoint directly (no auth wrapper)", async () => {
    const originalFetch = global.fetch;
    const fetchSpy = mock(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    try {
      await useAgentsStore.getState().restartSandbox("sb-123");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("sb-123/restart"),
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
