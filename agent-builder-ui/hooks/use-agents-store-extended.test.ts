/**
 * Extended tests for use-agents-store — covers branches missed by the base test:
 * deleteForge, addSandboxToAgent, removeSandboxFromAgent, updateAgentWorkspaceMemory,
 * updateAgentConfig, persistAgentEdits, promoteForge, and startForge (already-ready path).
 */
import { describe, expect, test, mock, beforeEach } from "bun:test";

// ─── Mock zustand/middleware (persist) before importing the store ────────────
mock.module("zustand/middleware", () => ({
  persist: (fn: unknown) => fn,
}));

const fetchMock = mock(async (_url: string, _init?: RequestInit) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: fetchMock,
}));

mock.module("@/lib/openclaw/workspace-memory", () => ({
  normalizeWorkspaceMemory: (v: unknown) => v ?? null,
}));

import { useAgentsStore } from "./use-agents-store";
import type { SavedAgent } from "./use-agents-store";

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

// ─── deleteForge ──────────────────────────────────────────────────────────────

describe("deleteForge", () => {
  test("removes agent from store on success", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1" }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse({ deleted: true }));

    await useAgentsStore.getState().deleteForge("a1");
    expect(useAgentsStore.getState().agents.find((a) => a.id === "a1")).toBeUndefined();
  });

  test("throws when deleteForge endpoint fails", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Not found" }, 404));
    await expect(useAgentsStore.getState().deleteForge("missing")).rejects.toThrow("Failed to delete forge");
  });
});

// ─── addSandboxToAgent ────────────────────────────────────────────────────────

describe("addSandboxToAgent", () => {
  test("updates agent in store with new sandbox data", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1", sandbox_ids: [] }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () =>
      makeFetchResponse(makeBackendAgent({ id: "a1", sandbox_ids: ["sb-new"] })),
    );

    await useAgentsStore.getState().addSandboxToAgent("a1", "sb-new");
    const agent = useAgentsStore.getState().agents.find((a) => a.id === "a1");
    expect(agent?.sandboxIds).toContain("sb-new");
  });

  test("throws when add sandbox fails", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Server error" }, 500));
    await expect(useAgentsStore.getState().addSandboxToAgent("a1", "sb-x")).rejects.toThrow("Failed to add sandbox to agent");
  });

  test("preserves client-side model when updating from backend", async () => {
    useAgentsStore.setState({
      agents: [{ ...(makeBackendAgent({ id: "a1" }) as unknown as SavedAgent), model: "claude-sonnet-4-6" }],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () =>
      makeFetchResponse(makeBackendAgent({ id: "a1" })),
    );

    await useAgentsStore.getState().addSandboxToAgent("a1", "sb-new");
    expect(useAgentsStore.getState().agents[0].model).toBe("claude-sonnet-4-6");
  });
});

// ─── removeSandboxFromAgent ───────────────────────────────────────────────────

describe("removeSandboxFromAgent", () => {
  test("updates agent in store after sandbox removal", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1", sandbox_ids: ["sb-1"] }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () =>
      makeFetchResponse(makeBackendAgent({ id: "a1", sandbox_ids: [] })),
    );

    await useAgentsStore.getState().removeSandboxFromAgent("a1", "sb-1");
    const agent = useAgentsStore.getState().agents.find((a) => a.id === "a1");
    expect(agent?.sandboxIds).toHaveLength(0);
  });

  test("throws when remove sandbox fails", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Server error" }, 500));
    await expect(useAgentsStore.getState().removeSandboxFromAgent("a1", "sb-x")).rejects.toThrow("Failed to remove sandbox from agent");
  });
});

// ─── updateAgentWorkspaceMemory ───────────────────────────────────────────────

describe("updateAgentWorkspaceMemory", () => {
  test("updates workspace memory for known agent", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1" }) as unknown as SavedAgent],
      isLoading: false,
    });
    const updatedMemory = { instructions: "Remember to check budget caps daily.", continuitySummary: "Active Google Ads campaigns" };
    fetchMock.mockImplementation(async () => makeFetchResponse(updatedMemory));

    const result = await useAgentsStore.getState().updateAgentWorkspaceMemory("a1", {
      instructions: "Remember to check budget caps daily.",
    });
    expect(result.workspaceMemory).toEqual(updatedMemory);
  });

  test("throws when agent is not in local store", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ instructions: "test" }));
    await expect(
      useAgentsStore.getState().updateAgentWorkspaceMemory("missing-agent", { instructions: "x" })
    ).rejects.toThrow("missing-agent");
  });

  test("throws when endpoint returns non-ok status", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1" }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Server error" }, 500));
    await expect(
      useAgentsStore.getState().updateAgentWorkspaceMemory("a1", { instructions: "x" })
    ).rejects.toThrow("Failed to update agent workspace memory");
  });
});

// ─── updateAgentConfig ────────────────────────────────────────────────────────

describe("updateAgentConfig", () => {
  test("updates agent config fields in store on success", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1" }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () =>
      makeFetchResponse(makeBackendAgent({ id: "a1", agent_rules: ["Rule 1"] })),
    );

    const updated = await useAgentsStore.getState().updateAgentConfig("a1", {
      agentRules: ["Rule 1"],
    });
    expect(updated.agentRules).toContain("Rule 1");
  });

  test("throws on 401 with human-readable message", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Unauthorized" }, 401));
    await expect(
      useAgentsStore.getState().updateAgentConfig("a1", { agentRules: [] })
    ).rejects.toThrow("Not authenticated");
  });

  test("uses detail field from server error body", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ detail: "Validation failed" }, 400));
    await expect(
      useAgentsStore.getState().updateAgentConfig("a1", { agentRules: [] })
    ).rejects.toThrow("Validation failed");
  });

  test("preserves client-side model when merging config response", async () => {
    useAgentsStore.setState({
      agents: [{ ...(makeBackendAgent({ id: "a1" }) as unknown as SavedAgent), model: "gpt-4" }],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse(makeBackendAgent({ id: "a1" })));

    const updated = await useAgentsStore.getState().updateAgentConfig("a1", {});
    expect(updated.model).toBe("gpt-4");
  });
});

// ─── persistAgentEdits ────────────────────────────────────────────────────────

describe("persistAgentEdits", () => {
  test("calls both updateAgent and updateAgentConfig and merges results", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1", name: "Old" }) as unknown as SavedAgent],
      isLoading: false,
    });

    // Both updateAgent and updateAgentConfig are called — mock returns updated agent each time
    fetchMock.mockImplementation(async () =>
      makeFetchResponse(makeBackendAgent({ id: "a1", name: "New", agent_rules: ["Be concise"] })),
    );

    const result = await useAgentsStore.getState().persistAgentEdits("a1", {
      name: "New",
      agentRules: ["Be concise"],
    });
    expect(result.name).toBe("New");
    // fetchMock called twice: once for updateAgent, once for updateAgentConfig
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── promoteForge ────────────────────────────────────────────────────────────

describe("promoteForge", () => {
  test("updates agent in store with promoted data", async () => {
    useAgentsStore.setState({
      agents: [
        { ...(makeBackendAgent({ id: "a1", status: "forging" }) as unknown as SavedAgent), model: "claude-opus" },
      ],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () =>
      makeFetchResponse(makeBackendAgent({ id: "a1", status: "active" })),
    );

    const result = await useAgentsStore.getState().promoteForge("a1");
    expect(result.status).toBe("active");
    // Model should be preserved
    expect(useAgentsStore.getState().agents[0].model).toBe("claude-opus");
  });

  test("throws with error from body when promote endpoint fails", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Promote failed" }, 500));
    await expect(useAgentsStore.getState().promoteForge("a1")).rejects.toThrow("Promote failed");
  });

  test("uses fallback message when body returns null error field", async () => {
    // When body has no error key, err.error is undefined and ?? fallback fires
    fetchMock.mockImplementation(async () => makeFetchResponse({ message: "other error" }, 502));
    await expect(useAgentsStore.getState().promoteForge("a1")).rejects.toThrow("Failed to promote forge");
  });

  test("uses error message from body when available", async () => {
    fetchMock.mockImplementation(async () =>
      makeFetchResponse({ error: "Sandbox not ready to promote" }, 409),
    );
    await expect(useAgentsStore.getState().promoteForge("a1")).rejects.toThrow("Sandbox not ready to promote");
  });
});

// ─── startForge — already-ready fast path ────────────────────────────────────

describe("startForge already-ready path", () => {
  test("returns existing forge_sandbox_id immediately when status is ready", async () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1" }) as unknown as SavedAgent],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () =>
      makeFetchResponse({ forge_sandbox_id: "sb-forge-existing", status: "ready" }),
    );

    const result = await useAgentsStore.getState().startForge("a1");
    expect(result).toBe("sb-forge-existing");
    // Store should be updated with the forge sandbox id
    const agent = useAgentsStore.getState().agents.find((a) => a.id === "a1");
    expect(agent?.forgeSandboxId).toBe("sb-forge-existing");
    expect(agent?.status).toBe("forging");
  });

  test("throws when init endpoint returns error", async () => {
    fetchMock.mockImplementation(async () =>
      makeFetchResponse({ error: "Forge capacity exceeded" }, 503),
    );
    await expect(useAgentsStore.getState().startForge("a1")).rejects.toThrow("Forge capacity exceeded");
  });
});

// ─── updateAgent — error body parsing ────────────────────────────────────────

describe("updateAgent error handling", () => {
  test("uses errBody.detail as the error message when present", async () => {
    fetchMock.mockImplementation(async () =>
      makeFetchResponse({ detail: "Agent locked by another process" }, 409),
    );
    await expect(useAgentsStore.getState().updateAgent("a1", { name: "x" })).rejects.toThrow("Agent locked by another process");
  });

  test("falls back to status code in message when body is empty", async () => {
    // Return non-JSON to trigger catch in .json()
    const res = new Response("Internal Server Error", { status: 500 });
    fetchMock.mockImplementation(async () => res);
    await expect(useAgentsStore.getState().updateAgent("a1", { name: "x" })).rejects.toThrow("500");
  });
});

// ─── fetchAgent — model preservation ─────────────────────────────────────────

describe("fetchAgent model preservation", () => {
  test("preserves model when agent with model is updated from backend", async () => {
    useAgentsStore.setState({
      agents: [{ ...(makeBackendAgent({ id: "a1" }) as unknown as SavedAgent), model: "claude-haiku" }],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () => makeFetchResponse(makeBackendAgent({ id: "a1", name: "Refreshed" })));

    await useAgentsStore.getState().fetchAgent("a1");
    expect(useAgentsStore.getState().agents[0].model).toBe("claude-haiku");
    expect(useAgentsStore.getState().agents[0].name).toBe("Refreshed");
  });
});

// ─── setAgentModel ────────────────────────────────────────────────────────────

describe("setAgentModel", () => {
  test("sets model for the specified agent", () => {
    useAgentsStore.setState({
      agents: [makeBackendAgent({ id: "a1" }) as unknown as SavedAgent],
      isLoading: false,
    });

    useAgentsStore.getState().setAgentModel("a1", "claude-opus");
    expect(useAgentsStore.getState().agents.find((a) => a.id === "a1")?.model).toBe("claude-opus");
  });

  test("sets model to undefined when undefined is passed", () => {
    useAgentsStore.setState({
      agents: [{ ...(makeBackendAgent({ id: "a1" }) as unknown as SavedAgent), model: "claude-sonnet-4-6" }],
      isLoading: false,
    });

    useAgentsStore.getState().setAgentModel("a1", undefined);
    expect(useAgentsStore.getState().agents.find((a) => a.id === "a1")?.model).toBeUndefined();
  });
});

// ─── restartSandbox ────────────────────────────────────────────────────────────
// restartSandbox uses raw fetch(), not fetchBackendWithAuth.
// We test the error-message extraction logic by mocking global fetch.

describe("restartSandbox", () => {
  const originalFetch = globalThis.fetch;

  test("throws with message from body when restart fails", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ message: "Container not found" }),
      { status: 404 },
    );
    try {
      await expect(useAgentsStore.getState().restartSandbox("sb-1")).rejects.toThrow("Container not found");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws 'Failed to restart sandbox' fallback when body has no message", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({}),
      { status: 500 },
    );
    try {
      await expect(useAgentsStore.getState().restartSandbox("sb-1")).rejects.toThrow("Failed to restart sandbox");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─── getForgeStatus ───────────────────────────────────────────────────────────

describe("getForgeStatus", () => {
  test("returns status data on success", async () => {
    fetchMock.mockImplementation(async () =>
      makeFetchResponse({ active: true, status: "running", forge_sandbox_id: "sb-forge-1" }),
    );
    const status = await useAgentsStore.getState().getForgeStatus("a1");
    expect(status.active).toBe(true);
    expect(status.status).toBe("running");
  });

  test("throws when endpoint returns non-ok", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Not found" }, 404));
    await expect(useAgentsStore.getState().getForgeStatus("a1")).rejects.toThrow("Failed to get forge status");
  });
});

// ─── bulkDeleteAgents ─────────────────────────────────────────────────────────

describe("bulkDeleteAgents", () => {
  test("removes deleted agents from store", async () => {
    useAgentsStore.setState({
      agents: [
        makeBackendAgent({ id: "a1" }) as unknown as SavedAgent,
        makeBackendAgent({ id: "a2" }) as unknown as SavedAgent,
      ],
      isLoading: false,
    });
    fetchMock.mockImplementation(async () =>
      makeFetchResponse({ deleted: ["a1"], failed: [], sandboxesCleaned: 0 }),
    );

    const result = await useAgentsStore.getState().bulkDeleteAgents(["a1"]);
    expect(result.deleted).toContain("a1");
    expect(useAgentsStore.getState().agents.find((a) => a.id === "a1")).toBeUndefined();
    expect(useAgentsStore.getState().agents.find((a) => a.id === "a2")).toBeDefined();
  });

  test("throws when bulk delete endpoint fails", async () => {
    fetchMock.mockImplementation(async () => makeFetchResponse({ error: "Server error" }, 500));
    await expect(useAgentsStore.getState().bulkDeleteAgents(["a1"])).rejects.toThrow("Failed to bulk delete agents");
  });
});
