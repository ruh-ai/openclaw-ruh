import { describe, it, expect } from "vitest";
import { generateDeterministicMocks } from "./eval-mock-generator";
import type { SkillGraphNode } from "./types";
import type { AgentToolConnection } from "@/lib/agents/types";

const GOOGLE_ADS_SKILLS: SkillGraphNode[] = [
  {
    skill_id: "campaign-performance",
    name: "Campaign Performance",
    source: "custom",
    status: "built",
    depends_on: [],
    description: "Fetch campaign performance data from Google Ads API",
    external_api: "Google Ads API",
  },
  {
    skill_id: "ad-group-optimizer",
    name: "Ad Group Optimizer",
    source: "custom",
    status: "built",
    depends_on: ["campaign-performance"],
    description: "Analyze and optimize Google Ads ad group performance",
  },
];

const ZENDESK_SKILLS: SkillGraphNode[] = [
  {
    skill_id: "ticket-triage",
    name: "Ticket Triage",
    source: "custom",
    status: "built",
    depends_on: [],
    description: "Triage incoming Zendesk support tickets",
    external_api: "Zendesk Support API",
  },
];

describe("generateDeterministicMocks", () => {
  it("detects Google Ads from skill descriptions and generates mock", () => {
    const result = generateDeterministicMocks({
      skillGraph: GOOGLE_ADS_SKILLS,
      toolConnections: [],
      runtimeInputs: [],
      architecturePlan: null,
    });

    const googleAds = result.services.find((s) => s.serviceId === "google-ads");
    expect(googleAds).toBeDefined();
    expect(googleAds!.endpoints.length).toBeGreaterThan(0);
    expect(googleAds!.endpoints[0].sampleResponse).toBeDefined();

    // Should have env overrides for Google Ads
    expect(result.envOverrides.GOOGLE_ADS_DEVELOPER_TOKEN).toBeDefined();
    expect(result.envOverrides.GOOGLE_ADS_CUSTOMER_ID).toBeDefined();
  });

  it("detects Zendesk from skill descriptions", () => {
    const result = generateDeterministicMocks({
      skillGraph: ZENDESK_SKILLS,
      toolConnections: [],
      runtimeInputs: [],
      architecturePlan: null,
    });

    const zendesk = result.services.find((s) => s.serviceId === "zendesk");
    expect(zendesk).toBeDefined();
    expect(zendesk!.endpoints.length).toBeGreaterThan(0);
    expect(result.envOverrides.ZENDESK_API_TOKEN).toBeDefined();
  });

  it("generates generic mocks for unknown tool connections", () => {
    const tools: AgentToolConnection[] = [
      {
        toolId: "custom-erp",
        name: "Custom ERP Integration",
        description: "Connect to the company's internal ERP system",
        status: "configured",
        authKind: "api_key",
        connectorType: "api",
        configSummary: [],
      },
    ];

    const result = generateDeterministicMocks({
      skillGraph: [],
      toolConnections: tools,
      runtimeInputs: [],
      architecturePlan: null,
    });

    const erp = result.services.find((s) => s.serviceId === "custom-erp");
    expect(erp).toBeDefined();
    expect(erp!.endpoints.length).toBe(2); // GET data + POST action
    expect(erp!.serviceName).toBe("Custom ERP Integration (Mock)");
  });

  it("generates env overrides for credential-like runtime inputs", () => {
    const result = generateDeterministicMocks({
      skillGraph: [],
      toolConnections: [],
      runtimeInputs: [
        { key: "CUSTOM_API_TOKEN", label: "API Token", description: "Auth token", required: true, source: "architect_requirement", value: "" },
        { key: "MAX_RESULTS", label: "Max Results", description: "Pagination limit", required: false, source: "skill_requirement", value: "50" },
      ],
      architecturePlan: null,
    });

    expect(result.envOverrides.CUSTOM_API_TOKEN).toContain("MOCK");
    expect(result.envOverrides.MAX_RESULTS).toBeUndefined(); // not a credential
  });

  it("returns empty context when no tools or skills", () => {
    const result = generateDeterministicMocks({
      skillGraph: [],
      toolConnections: [],
      runtimeInputs: [],
      architecturePlan: null,
    });

    expect(result.services).toEqual([]);
    expect(Object.keys(result.envOverrides)).toEqual([]);
  });

  it("detects multiple APIs from mixed skills", () => {
    const result = generateDeterministicMocks({
      skillGraph: [...GOOGLE_ADS_SKILLS, ...ZENDESK_SKILLS],
      toolConnections: [],
      runtimeInputs: [],
      architecturePlan: null,
    });

    expect(result.services.length).toBe(2);
    expect(result.services.map((s) => s.serviceId).sort()).toEqual(["google-ads", "zendesk"]);
  });
});
