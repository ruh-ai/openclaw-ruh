import { describe, expect, test, mock } from "bun:test";

const mockSendToArchitectStreaming = mock(async () => ({
  type: "tool_recommendation",
  tool_name: "TestTool",
  recommended_method: "api",
  summary: "summary",
  rationale: "rationale",
  required_credentials: [],
  setup_steps: [],
  integration_steps: [],
  validation_steps: [],
  alternatives: [],
  sources: [],
}));

mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
}));

import {
  buildToolResearchPlan,
  buildToolResearchResultFromPlan,
  reconcileToolConnections,
  finalizeCredentialBackedToolConnections,
  normalizeToolResearchResponse,
  buildToolResearchPrompt,
  type ToolResearchResult,
} from "./tool-integration";

const researchResult: ToolResearchResult = {
  type: "tool_recommendation",
  toolName: "Linear",
  recommendedMethod: "api",
  recommendedToolId: undefined,
  recommendedPackage: "@linear/sdk",
  summary: "Use the API for stable ticket workflows.",
  rationale: "The API gives better control over issue lifecycle automation.",
  requiredCredentials: [
    { name: "LINEAR_API_KEY", reason: "Authenticate API requests." },
  ],
  setupSteps: ["Create a Linear API key.", "Store the key in the agent connector vault."],
  integrationSteps: ["Wrap issue create/update calls in a builder tool."],
  validationSteps: ["Create a test issue in a sandbox workspace."],
  alternatives: [
    {
      method: "cli",
      summary: "Use a local wrapper script.",
      pros: ["Fast prototype"],
      cons: ["Harder to host"],
    },
  ],
  sources: [{ title: "Linear API docs", url: "https://linear.app/docs/api" }],
};

describe("tool research plan helpers", () => {
  test("buildToolResearchPlan keeps the bounded structured guidance", () => {
    expect(buildToolResearchPlan(researchResult)).toEqual({
      toolName: "Linear",
      recommendedMethod: "api",
      recommendedToolId: undefined,
      recommendedPackage: "@linear/sdk",
      summary: "Use the API for stable ticket workflows.",
      rationale: "The API gives better control over issue lifecycle automation.",
      requiredCredentials: [
        { name: "LINEAR_API_KEY", reason: "Authenticate API requests." },
      ],
      setupSteps: ["Create a Linear API key.", "Store the key in the agent connector vault."],
      integrationSteps: ["Wrap issue create/update calls in a builder tool."],
      validationSteps: ["Create a test issue in a sandbox workspace."],
      alternatives: [
        {
          method: "cli",
          summary: "Use a local wrapper script.",
          pros: ["Fast prototype"],
          cons: ["Harder to host"],
        },
      ],
      sources: [{ title: "Linear API docs", url: "https://linear.app/docs/api" }],
    });
  });

  test("buildToolResearchResultFromPlan rehydrates persisted plans for reopen flows", () => {
    const persisted = buildToolResearchPlan(researchResult);

    expect(buildToolResearchResultFromPlan(persisted)).toEqual(researchResult);
  });
});

describe("reconcileToolConnections", () => {
  test("removes stale stored-credential copy when a saved connector reopens without credentials", () => {
    expect(
      reconcileToolConnections(
        [
          {
            toolId: "google-ads",
            name: "Google Ads",
            description: "Manage campaigns.",
            status: "configured",
            authKind: "oauth",
            connectorType: "mcp",
            configSummary: ["Connected account: Acme Ads", "Credentials stored securely"],
          },
        ],
        [],
        { credentialBackedToolIds: new Set(["google-ads"]) },
      ),
    ).toEqual([
      {
        toolId: "google-ads",
        name: "Google Ads",
        description: "Manage campaigns.",
        status: "missing_secret",
        authKind: "oauth",
        connectorType: "mcp",
        configSummary: ["Connected account: Acme Ads", "Credentials still required"],
      },
    ]);
  });

  test("marks connection as configured when credential summary exists", () => {
    const result = reconcileToolConnections(
      [
        {
          toolId: "slack",
          name: "Slack",
          description: "Messaging",
          status: "missing_secret",
          authKind: "api_key",
          connectorType: "mcp",
          configSummary: ["Credentials still required"],
        },
      ],
      [{ toolId: "slack", hasCredentials: true, createdAt: "2024-01-01" }],
      { credentialBackedToolIds: new Set(["slack"]) },
    );
    expect(result[0].status).toBe("configured");
    expect(result[0].configSummary).toContain("Credentials stored securely");
    expect(result[0].configSummary).not.toContain("Credentials still required");
  });

  test("passes through connection unchanged when not credential-backed", () => {
    const connection = {
      toolId: "no-auth-tool",
      name: "No Auth",
      description: "No credentials needed",
      status: "available" as const,
      authKind: "none" as const,
      connectorType: "cli" as const,
      configSummary: [],
    };
    const result = reconcileToolConnections([connection], [], {
      credentialBackedToolIds: new Set(["other-tool"]),
    });
    expect(result[0]).toBe(connection);
  });

  test("passes through unsupported connection unchanged", () => {
    const connection = {
      toolId: "google-ads",
      name: "Google Ads",
      description: "Manage campaigns",
      status: "unsupported" as const,
      authKind: "oauth" as const,
      connectorType: "mcp" as const,
      configSummary: [],
    };
    const result = reconcileToolConnections([connection], [], {
      credentialBackedToolIds: new Set(["google-ads"]),
    });
    expect(result[0]).toBe(connection);
  });

  test("leaves available connections unchanged when no credentials exist", () => {
    const connection = {
      toolId: "google-ads",
      name: "Google Ads",
      description: "Manage campaigns",
      status: "available" as const,
      authKind: "oauth" as const,
      connectorType: "mcp" as const,
      configSummary: [],
    };
    const result = reconcileToolConnections([connection], [], {
      credentialBackedToolIds: new Set(["google-ads"]),
    });
    expect(result[0]).toBe(connection);
  });

  test("uses empty set when no credentialBackedToolIds provided", () => {
    const connection = {
      toolId: "google-ads",
      name: "Google Ads",
      description: "Manage campaigns",
      status: "configured" as const,
      authKind: "oauth" as const,
      connectorType: "mcp" as const,
      configSummary: ["Credentials stored securely"],
    };
    const result = reconcileToolConnections([connection], []);
    expect(result[0]).toBe(connection);
  });
});

describe("finalizeCredentialBackedToolConnections", () => {
  test("marks connection configured when commitResults is true", () => {
    const result = finalizeCredentialBackedToolConnections(
      [
        {
          toolId: "slack",
          name: "Slack",
          description: "Messaging",
          status: "available" as const,
          authKind: "api_key" as const,
          connectorType: "mcp" as const,
          configSummary: [],
        },
      ],
      { slack: true },
      { credentialBackedToolIds: new Set(["slack"]) },
    );
    expect(result[0].status).toBe("configured");
    expect(result[0].configSummary).toContain("Credentials stored securely");
  });

  test("marks connection missing_secret when commitResults is false", () => {
    const result = finalizeCredentialBackedToolConnections(
      [
        {
          toolId: "slack",
          name: "Slack",
          description: "Messaging",
          status: "configured" as const,
          authKind: "api_key" as const,
          connectorType: "mcp" as const,
          configSummary: ["Credentials stored securely"],
        },
      ],
      { slack: false },
      { credentialBackedToolIds: new Set(["slack"]) },
    );
    expect(result[0].status).toBe("missing_secret");
    expect(result[0].configSummary).toContain("Credentials still required");
  });

  test("leaves connection unchanged when not in commitResults", () => {
    const connection = {
      toolId: "slack",
      name: "Slack",
      description: "Messaging",
      status: "available" as const,
      authKind: "api_key" as const,
      connectorType: "mcp" as const,
      configSummary: [],
    };
    const result = finalizeCredentialBackedToolConnections(
      [connection],
      {},
      { credentialBackedToolIds: new Set(["slack"]) },
    );
    expect(result[0]).toBe(connection);
  });

  test("passes through non-credential-backed connections unchanged", () => {
    const connection = {
      toolId: "no-auth",
      name: "No Auth",
      description: "None",
      status: "available" as const,
      authKind: "none" as const,
      connectorType: "cli" as const,
      configSummary: [],
    };
    const result = finalizeCredentialBackedToolConnections(
      [connection],
      { "no-auth": true },
      { credentialBackedToolIds: new Set(["other-tool"]) },
    );
    expect(result[0]).toBe(connection);
  });
});

describe("normalizeToolResearchResponse", () => {
  test("normalizes a full raw response correctly", () => {
    const raw = {
      tool_name: "Stripe",
      recommended_method: "api",
      recommended_tool_id: "stripe-mcp",
      recommended_package: "@stripe/stripe-node",
      summary: "Use the Stripe API",
      rationale: "Stripe has excellent API documentation",
      required_credentials: [{ name: "STRIPE_SECRET_KEY", reason: "Authenticate API calls" }],
      setup_steps: ["Create Stripe account", "Get API keys"],
      integration_steps: ["Call /charges endpoint"],
      validation_steps: ["Create test charge"],
      alternatives: [{ method: "mcp", summary: "Use Stripe MCP", pros: ["Easy setup"], cons: ["Limited"] }],
      sources: [{ title: "Stripe Docs", url: "https://stripe.com/docs" }],
    };
    const result = normalizeToolResearchResponse(raw);
    expect(result.type).toBe("tool_recommendation");
    expect(result.toolName).toBe("Stripe");
    expect(result.recommendedMethod).toBe("api");
    expect(result.recommendedToolId).toBe("stripe-mcp");
    expect(result.recommendedPackage).toBe("@stripe/stripe-node");
    expect(result.requiredCredentials).toHaveLength(1);
    expect(result.setupSteps).toHaveLength(2);
    expect(result.alternatives).toHaveLength(1);
    expect(result.sources).toHaveLength(1);
  });

  test("defaults empty/missing fields", () => {
    const result = normalizeToolResearchResponse({});
    expect(result.toolName).toBe("");
    expect(result.recommendedMethod).toBe("api");
    expect(result.recommendedToolId).toBeUndefined();
    expect(result.recommendedPackage).toBeUndefined();
    expect(result.requiredCredentials).toEqual([]);
    expect(result.setupSteps).toEqual([]);
    expect(result.alternatives).toEqual([]);
    expect(result.sources).toEqual([]);
  });

  test("normalizes mcp and cli method values", () => {
    const mcp = normalizeToolResearchResponse({ recommended_method: "mcp" });
    expect(mcp.recommendedMethod).toBe("mcp");
    const cli = normalizeToolResearchResponse({ recommended_method: "cli" });
    expect(cli.recommendedMethod).toBe("cli");
    const other = normalizeToolResearchResponse({ recommended_method: "unknown" });
    expect(other.recommendedMethod).toBe("api");
  });

  test("filters credentials with empty names", () => {
    const result = normalizeToolResearchResponse({
      required_credentials: [
        { name: "VALID_KEY", reason: "needed" },
        { name: "", reason: "should be filtered" },
        { name: 123, reason: "non-string name" },
        "not-an-object",
      ],
    });
    expect(result.requiredCredentials).toHaveLength(1);
    expect(result.requiredCredentials[0].name).toBe("VALID_KEY");
  });

  test("filters alternatives with empty summaries", () => {
    const result = normalizeToolResearchResponse({
      alternatives: [
        { method: "mcp", summary: "Valid alternative", pros: ["a"], cons: [] },
        { method: "api", summary: "", pros: [], cons: [] },
        "not-an-object",
      ],
    });
    expect(result.alternatives).toHaveLength(1);
  });

  test("filters sources missing title or url", () => {
    const result = normalizeToolResearchResponse({
      sources: [
        { title: "Good doc", url: "https://example.com" },
        { title: "Missing url", url: "" },
        { title: "", url: "https://example.com" },
      ],
    });
    expect(result.sources).toHaveLength(1);
  });

  test("filters whitespace-only tool_id and package", () => {
    const result = normalizeToolResearchResponse({
      recommended_tool_id: "  ",
      recommended_package: "  ",
    });
    expect(result.recommendedToolId).toBeUndefined();
    expect(result.recommendedPackage).toBeUndefined();
  });
});

describe("buildToolResearchPrompt", () => {
  test("includes tool name in prompt", () => {
    const prompt = buildToolResearchPrompt({ toolName: "GitHub" });
    expect(prompt).toContain("GitHub");
    expect(prompt).toContain("[INSTRUCTION]");
    expect(prompt).toContain("tool_recommendation");
  });

  test("includes use case when provided", () => {
    const prompt = buildToolResearchPrompt({ toolName: "GitHub", useCase: "Create issues from chat" });
    expect(prompt).toContain("Create issues from chat");
  });

  test("includes supported tools context when provided", () => {
    const prompt = buildToolResearchPrompt({
      toolName: "GitHub",
      supportedToolsContext: "- google-ads-mcp: Google Ads",
    });
    expect(prompt).toContain("google-ads-mcp");
    expect(prompt).toContain("Current one-click supported tools:");
  });

  test("omits use case section when not provided", () => {
    const prompt = buildToolResearchPrompt({ toolName: "GitHub" });
    expect(prompt).not.toContain("Use case:");
  });
});

describe("buildToolResearchPlan edge cases", () => {
  test("uses fallback tool name when result toolName is empty", () => {
    const result: ToolResearchResult = {
      type: "tool_recommendation",
      toolName: "",
      recommendedMethod: "api",
      summary: "summary",
      rationale: "rationale",
      requiredCredentials: [],
      setupSteps: [],
      integrationSteps: [],
      validationSteps: [],
      alternatives: [],
      sources: [],
    };
    const plan = buildToolResearchPlan(result, "FallbackTool");
    expect(plan.toolName).toBe("FallbackTool");
  });

  test("filters credentials with empty names in plan builder", () => {
    const result: ToolResearchResult = {
      type: "tool_recommendation",
      toolName: "Tool",
      recommendedMethod: "api",
      summary: "s",
      rationale: "r",
      requiredCredentials: [
        { name: "KEY", reason: "needed" },
        { name: "  ", reason: "whitespace name" },
      ],
      setupSteps: [],
      integrationSteps: [],
      validationSteps: [],
      alternatives: [],
      sources: [],
    };
    const plan = buildToolResearchPlan(result);
    expect(plan.requiredCredentials).toHaveLength(1);
  });

  test("filters alternatives without summary in plan builder", () => {
    const result: ToolResearchResult = {
      type: "tool_recommendation",
      toolName: "Tool",
      recommendedMethod: "api",
      summary: "s",
      rationale: "r",
      requiredCredentials: [],
      setupSteps: [],
      integrationSteps: [],
      validationSteps: [],
      alternatives: [
        { method: "mcp", summary: "Valid", pros: [], cons: [] },
        { method: "cli", summary: "  ", pros: [], cons: [] },
      ],
      sources: [],
    };
    const plan = buildToolResearchPlan(result);
    expect(plan.alternatives).toHaveLength(1);
  });
});

describe("buildToolResearchResultFromPlan", () => {
  test("returns null when plan is undefined", () => {
    expect(buildToolResearchResultFromPlan(undefined)).toBeNull();
  });

  test("uses fallback tool name when plan toolName is empty", () => {
    const result = buildToolResearchResultFromPlan(
      {
        toolName: "",
        recommendedMethod: "api",
        summary: "summary",
        rationale: "rationale",
        requiredCredentials: [],
        setupSteps: [],
        integrationSteps: [],
        validationSteps: [],
        alternatives: [],
        sources: [],
      },
      "FallbackFromPlan",
    );
    expect(result?.toolName).toBe("FallbackFromPlan");
  });
});

describe("researchToolIntegration", () => {
  test("calls sendToArchitectStreaming and returns normalized result", async () => {
    const { researchToolIntegration } = await import("./tool-integration");
    const result = await researchToolIntegration({ toolName: "TestTool", sessionId: "session-1" });
    expect(result.type).toBe("tool_recommendation");
    expect(result.toolName).toBe("TestTool");
  });

  test("throws when architect returns non-tool_recommendation type", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "error",
      content: "Architect error: not supported",
    });
    const { researchToolIntegration } = await import("./tool-integration");
    await expect(
      researchToolIntegration({ toolName: "SomeTool" }),
    ).rejects.toThrow("Architect error: not supported");
  });

  test("throws generic message when architect returns unknown type with no content/error", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "unknown",
      content: undefined,
      error: undefined,
    });
    const { researchToolIntegration } = await import("./tool-integration");
    await expect(
      researchToolIntegration({ toolName: "SomeTool" }),
    ).rejects.toThrow("The architect did not return a structured tool recommendation.");
  });

  test("passes useCase and supportedToolsContext to architect", async () => {
    const { researchToolIntegration } = await import("./tool-integration");
    await researchToolIntegration({
      toolName: "Google Analytics",
      useCase: "Track ad conversion",
      supportedToolsContext: "- google-ads-mcp",
    });
    const calls = mockSendToArchitectStreaming.mock.calls;
    const lastPrompt = calls[calls.length - 1][1] as string;
    expect(lastPrompt).toContain("Track ad conversion");
    expect(lastPrompt).toContain("google-ads-mcp");
  });
});

describe("buildToolResearchPlan — non-array inputs to normalizers", () => {
  test("handles non-array requiredCredentials gracefully", () => {
    const result: ToolResearchResult = {
      type: "tool_recommendation",
      toolName: "Tool",
      recommendedMethod: "api",
      summary: "s",
      rationale: "r",
      requiredCredentials: null as any,
      setupSteps: null as any,
      integrationSteps: null as any,
      validationSteps: null as any,
      alternatives: null as any,
      sources: null as any,
    };
    const plan = buildToolResearchPlan(result);
    expect(plan.requiredCredentials).toEqual([]);
    expect(plan.setupSteps).toEqual([]);
    expect(plan.alternatives).toEqual([]);
    expect(plan.sources).toEqual([]);
  });
});
