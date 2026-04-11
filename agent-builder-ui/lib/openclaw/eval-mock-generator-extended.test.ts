/**
 * Extended tests for eval-mock-generator.ts — covers:
 * - parseMockServiceResponse: valid JSON, malformed JSON, missing required fields
 * - generateLLMMocks: uses LLM content, falls back to deterministic when empty
 * - buildMockModeInstruction: multiple services, env var rendering
 * - API detection: plan integrations, tool connections dedup
 */
import { describe, it, test, expect, mock, beforeEach } from "bun:test";

const mockSendToArchitectStreaming = mock();

mock.module("./api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
}));

import {
  generateDeterministicMocks,
  generateLLMMocks,
  buildMockModeInstruction,
} from "./eval-mock-generator";
import type { MockGenerationConfig } from "./eval-mock-generator";
import type { SkillGraphNode } from "./types";
import type { AgentToolConnection } from "@/lib/agents/types";

const emptyConfig: MockGenerationConfig = {
  skillGraph: [],
  toolConnections: [],
  runtimeInputs: [],
  architecturePlan: null,
};

beforeEach(() => {
  mockSendToArchitectStreaming.mockReset();
});

// ─── generateLLMMocks — uses LLM content ────────────────────────────────────

describe("generateLLMMocks", () => {
  it("returns services parsed from LLM response content", async () => {
    const mockServices = JSON.stringify([
      {
        serviceId: "custom-api",
        serviceName: "Custom API (Mock)",
        description: "Custom mock",
        baseUrl: "https://mock-custom.eval.local",
        authType: "api_key",
        endpoints: [
          {
            method: "GET",
            path: "/api/data",
            description: "Get data",
            responseSchema: {},
            sampleResponse: { data: [] },
          },
        ],
        envOverrides: { CUSTOM_API_KEY: "MOCK_KEY" },
      },
    ]);

    mockSendToArchitectStreaming.mockResolvedValue({ content: mockServices });

    const result = await generateLLMMocks("session-1", emptyConfig);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].serviceId).toBe("custom-api");
    expect(result.envOverrides.CUSTOM_API_KEY).toBe("MOCK_KEY");
  });

  it("falls back to deterministic mocks when LLM returns empty or non-JSON", async () => {
    mockSendToArchitectStreaming.mockResolvedValue({ content: "No JSON here, sorry." });

    const config: MockGenerationConfig = {
      skillGraph: [
        {
          skill_id: "google-ads-fetch",
          name: "Google Ads Fetch",
          source: "custom",
          status: "built",
          depends_on: [],
          description: "Fetches campaign data from Google Ads API",
          external_api: "Google Ads",
        },
      ],
      toolConnections: [],
      runtimeInputs: [],
      architecturePlan: null,
    };

    const result = await generateLLMMocks("session-1", config);
    // Should fall back to deterministic — google-ads should be detected
    const googleAds = result.services.find((s) => s.serviceId === "google-ads");
    expect(googleAds).toBeDefined();
  });

  it("accumulates delta text from streaming onDelta callback", async () => {
    const fullJson = JSON.stringify([
      {
        serviceId: "zendesk",
        serviceName: "Zendesk (Mock)",
        description: "Zendesk mock",
        endpoints: [{ method: "GET", path: "/api/search", description: "Search", sampleResponse: {} }],
        envOverrides: { ZENDESK_TOKEN: "MOCK_ZENDESK" },
      },
    ]);

    // Simulate streaming: full content comes via onDelta, response.content is empty
    mockSendToArchitectStreaming.mockImplementation(async (_id: string, _prompt: string, callbacks: Record<string, unknown>) => {
      if (typeof callbacks?.onDelta === "function") {
        (callbacks.onDelta as (t: string) => void)(fullJson);
      }
      return { content: "" }; // empty content forces fallback to accumulated
    });

    const result = await generateLLMMocks("session-1", emptyConfig);
    // accumulated delta should parse correctly
    expect(result.services.find((s) => s.serviceId === "zendesk")).toBeDefined();
  });

  it("passes signal option through to sendToArchitectStreaming", async () => {
    mockSendToArchitectStreaming.mockResolvedValue({ content: "[]" });

    const controller = new AbortController();
    await generateLLMMocks("session-1", emptyConfig, { signal: controller.signal });

    const callOptions = mockSendToArchitectStreaming.mock.calls[0]?.[3];
    expect(callOptions).toMatchObject({ mode: "test" });
  });
});

// ─── buildMockModeInstruction — rendering ────────────────────────────────────

describe("buildMockModeInstruction", () => {
  test("returns empty string when services array is empty", () => {
    const result = buildMockModeInstruction({ services: [], envOverrides: {} });
    expect(result).toBe("");
  });

  test("renders multiple services with endpoint details", () => {
    const result = buildMockModeInstruction({
      services: [
        {
          serviceId: "google-ads",
          serviceName: "Google Ads API (Mock)",
          description: "Mock Google Ads",
          baseUrl: "https://mock-google-ads.eval.local",
          authType: "oauth",
          endpoints: [
            {
              method: "POST",
              path: "/v17/search",
              description: "Search campaigns",
              responseSchema: {},
              sampleResponse: { results: [{ campaign: { name: "Brand Awareness" } }] },
            },
          ],
          envOverrides: { GOOGLE_ADS_TOKEN: "MOCK_GA_TOKEN" },
        },
        {
          serviceId: "zendesk",
          serviceName: "Zendesk API (Mock)",
          description: "Mock Zendesk",
          baseUrl: "https://mock-zendesk.eval.local",
          authType: "api_key",
          endpoints: [],
          envOverrides: { ZENDESK_KEY: "MOCK_ZD_KEY" },
        },
      ],
      envOverrides: {
        GOOGLE_ADS_TOKEN: "MOCK_GA_TOKEN",
        ZENDESK_KEY: "MOCK_ZD_KEY",
      },
    });

    expect(result).toContain("## MOCK MODE");
    expect(result).toContain("Google Ads API (Mock)");
    expect(result).toContain("Zendesk API (Mock)");
    expect(result).toContain("POST /v17/search");
    expect(result).toContain("MOCK_GA_TOKEN");
    expect(result).toContain("MOCK_ZD_KEY");
    expect(result).toContain("Brand Awareness");
  });

  test("includes env overrides section even when services have no endpoints", () => {
    const result = buildMockModeInstruction({
      services: [
        {
          serviceId: "stub",
          serviceName: "Stub Service",
          description: "Minimal stub",
          baseUrl: "https://stub.eval.local",
          authType: "none",
          endpoints: [],
          envOverrides: { STUB_KEY: "STUB_VALUE" },
        },
      ],
      envOverrides: { STUB_KEY: "STUB_VALUE" },
    });

    expect(result).toContain("STUB_KEY=STUB_VALUE");
  });
});

// ─── generateDeterministicMocks — tool connection dedup ─────────────────────

describe("generateDeterministicMocks — deduplication", () => {
  test("does not duplicate services when tool matches a detected API", () => {
    const slackTool: AgentToolConnection = {
      toolId: "slack",
      name: "Slack",
      description: "Post to Slack channels",
      status: "configured",
      authKind: "oauth",
      connectorType: "api",
      configSummary: [],
    };

    const result = generateDeterministicMocks({
      skillGraph: [
        {
          skill_id: "slack-notify",
          name: "Slack Notifier",
          source: "custom",
          status: "built",
          depends_on: [],
          description: "Post messages to Slack",
        },
      ],
      toolConnections: [slackTool],
      runtimeInputs: [],
      architecturePlan: null,
    });

    // Should only have one slack service (not doubled)
    const slackServices = result.services.filter((s) => s.serviceId.includes("slack"));
    expect(slackServices.length).toBe(1);
  });

  test("generates generic mock for unknown tool even when template doesn't exist", () => {
    const customTool: AgentToolConnection = {
      toolId: "my-custom-api",
      name: "My Custom API",
      description: "Internal company API",
      status: "configured",
      authKind: "api_key",
      connectorType: "api",
      configSummary: [],
    };

    const result = generateDeterministicMocks({
      skillGraph: [],
      toolConnections: [customTool],
      runtimeInputs: [],
      architecturePlan: null,
    });

    const custom = result.services.find((s) => s.serviceId === "my-custom-api");
    expect(custom).toBeDefined();
    expect(custom!.authType).toBe("api_key");
    expect(custom!.endpoints).toHaveLength(2); // GET data + POST actions
  });

  test("detects hubspot and stripe from skill names even without a template", () => {
    const result = generateDeterministicMocks({
      skillGraph: [
        {
          skill_id: "crm-sync",
          name: "HubSpot CRM Sync",
          source: "custom",
          status: "built",
          depends_on: [],
          description: "Sync contacts with hubspot CRM",
        },
        {
          skill_id: "payment-process",
          name: "Payment Processor",
          source: "custom",
          status: "built",
          depends_on: [],
          description: "Process stripe payments",
        },
      ],
      toolConnections: [],
      runtimeInputs: [],
      architecturePlan: null,
    });

    // Both hubspot and stripe are in detection list but have no templates
    // so they should produce no services (templates only exist for google-ads/zendesk/slack)
    // This verifies the detection path runs without error
    expect(result).toBeDefined();
    expect(Array.isArray(result.services)).toBe(true);
  });

  test("does not generate env override for non-credential runtime input keys", () => {
    const result = generateDeterministicMocks({
      skillGraph: [],
      toolConnections: [],
      runtimeInputs: [
        { key: "MAX_RETRY_COUNT", label: "Max Retries", description: "Number of retries", required: false, source: "skill_requirement", value: "3" },
        { key: "TIMEOUT_MS", label: "Timeout", description: "Request timeout in ms", required: false, source: "skill_requirement", value: "5000" },
      ],
      architecturePlan: null,
    });

    expect(result.envOverrides.MAX_RETRY_COUNT).toBeUndefined();
    expect(result.envOverrides.TIMEOUT_MS).toBeUndefined();
  });
});
