import { describe, expect, test, mock } from "bun:test";

// Mock the architect API call used by generate-skills
mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: mock(() => Promise.resolve({ text: "" })),
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ),
}));

// --- agentChatSteps ---

describe("agentChatSteps", () => {
  test("exports AGENT_GREETING string", async () => {
    const { AGENT_GREETING } = await import("../_config/agentChatSteps");
    expect(typeof AGENT_GREETING).toBe("string");
    expect(AGENT_GREETING.length).toBeGreaterThan(0);
  });

  test("exports AGENT_GREETING_SUBTITLE string", async () => {
    const { AGENT_GREETING_SUBTITLE } = await import("../_config/agentChatSteps");
    expect(typeof AGENT_GREETING_SUBTITLE).toBe("string");
    expect(AGENT_GREETING_SUBTITLE.length).toBeGreaterThan(0);
  });

  test("exports AGENT_SUGGESTIONS array with valid options", async () => {
    const { AGENT_SUGGESTIONS } = await import("../_config/agentChatSteps");
    expect(Array.isArray(AGENT_SUGGESTIONS)).toBe(true);
    expect(AGENT_SUGGESTIONS.length).toBeGreaterThan(0);
    for (const suggestion of AGENT_SUGGESTIONS) {
      expect(typeof suggestion.label).toBe("string");
      expect(suggestion.label.length).toBeGreaterThan(0);
    }
  });

  test("exports AgentChatOption interface (importable)", async () => {
    // Type-only export — verify module loads
    const mod = await import("../_config/agentChatSteps");
    expect(mod).toBeDefined();
  });
});

// --- capabilities-context ---

describe("capabilities-context", () => {
  test("buildCapabilitiesContext returns a non-empty string", async () => {
    const { buildCapabilitiesContext } = await import(
      "../_config/capabilities-context"
    );
    const result = buildCapabilitiesContext();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("Platform Capabilities");
  });

  test("context includes MCP tools section", async () => {
    const { buildCapabilitiesContext } = await import(
      "../_config/capabilities-context"
    );
    const result = buildCapabilitiesContext();
    expect(result).toContain("MCP");
  });

  test("context includes channel descriptions", async () => {
    const { buildCapabilitiesContext } = await import(
      "../_config/capabilities-context"
    );
    const result = buildCapabilitiesContext();
    expect(result).toContain("Telegram");
    expect(result).toContain("Slack");
  });

  test("context includes trigger descriptions", async () => {
    const { buildCapabilitiesContext } = await import(
      "../_config/capabilities-context"
    );
    const result = buildCapabilitiesContext();
    expect(result).toContain("Cron Schedule");
    expect(result).toContain("Webhook");
  });
});

// --- generate-skills ---

describe("generate-skills", () => {
  test("exports generateSkillsFromArchitect function", async () => {
    const mod = await import("../_config/generate-skills");
    expect(mod.generateSkillsFromArchitect).toBeDefined();
    expect(typeof mod.generateSkillsFromArchitect).toBe("function");
  });

  test("exports buildSkillMarkdown function", async () => {
    const mod = await import("../_config/generate-skills");
    expect(mod.buildSkillMarkdown).toBeDefined();
    expect(typeof mod.buildSkillMarkdown).toBe("function");
  });

  test("exports generateDiscoveryQuestions function", async () => {
    const mod = await import("../_config/generate-skills");
    expect(mod.generateDiscoveryQuestions).toBeDefined();
    expect(typeof mod.generateDiscoveryQuestions).toBe("function");
  });
});

// --- mcp-tool-registry ---

describe("mcp-tool-registry", () => {
  test("exports listSupportedTools that returns an array", async () => {
    const { listSupportedTools } = await import("../_config/mcp-tool-registry");
    const tools = listSupportedTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  test("each supported tool has required fields", async () => {
    const { listSupportedTools } = await import("../_config/mcp-tool-registry");
    const tools = listSupportedTools();
    for (const tool of tools) {
      expect(typeof tool.toolId).toBe("string");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.mcpPackage).toBe("string");
    }
  });

  test("exports getToolDefinition function", async () => {
    const { getToolDefinition } = await import("../_config/mcp-tool-registry");
    expect(typeof getToolDefinition).toBe("function");
  });

  test("getToolDefinition returns nullish for unknown tool", async () => {
    const { getToolDefinition } = await import("../_config/mcp-tool-registry");
    const result = getToolDefinition("nonexistent-tool-xyz");
    expect(result).toBeNull();
  });

  test("exports buildSupportedToolsContext function", async () => {
    const { buildSupportedToolsContext } = await import(
      "../_config/mcp-tool-registry"
    );
    const context = buildSupportedToolsContext();
    expect(typeof context).toBe("string");
  });

  test("exports saveToolCredentials function", async () => {
    const { saveToolCredentials } = await import("../_config/mcp-tool-registry");
    expect(typeof saveToolCredentials).toBe("function");
  });
});

// --- wizard-templates ---

describe("wizard-templates", () => {
  test("exports AGENT_TEMPLATES array", async () => {
    const { AGENT_TEMPLATES } = await import("../_config/wizard-templates");
    expect(Array.isArray(AGENT_TEMPLATES)).toBe(true);
    expect(AGENT_TEMPLATES.length).toBeGreaterThan(0);
  });

  test("each template has required fields", async () => {
    const { AGENT_TEMPLATES } = await import("../_config/wizard-templates");
    for (const template of AGENT_TEMPLATES) {
      expect(typeof template.id).toBe("string");
      expect(typeof template.name).toBe("string");
      expect(typeof template.emoji).toBe("string");
      expect(typeof template.tagline).toBe("string");
      expect(typeof template.description).toBe("string");
      expect(typeof template.category).toBe("string");
      expect(Array.isArray(template.skills)).toBe(true);
      expect(Array.isArray(template.tools)).toBe(true);
      expect(typeof template.tone).toBe("string");
      expect(Array.isArray(template.triggerIds)).toBe(true);
      expect(Array.isArray(template.rules)).toBe(true);
    }
  });

  test("template IDs are unique", async () => {
    const { AGENT_TEMPLATES } = await import("../_config/wizard-templates");
    const ids = AGENT_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("Google Ads Optimizer template exists", async () => {
    const { AGENT_TEMPLATES } = await import("../_config/wizard-templates");
    const googleAds = AGENT_TEMPLATES.find((t) => t.id === "google-ads-optimizer");
    expect(googleAds).toBeDefined();
    expect(googleAds!.name).toBe("Google Ads Optimizer");
  });
});
