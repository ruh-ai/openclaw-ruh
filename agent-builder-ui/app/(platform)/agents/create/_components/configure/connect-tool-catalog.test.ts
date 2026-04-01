import { describe, expect, test } from "bun:test";

import type { ToolResearchResult } from "@/lib/tools/tool-integration";
import {
  buildConnectToolCatalog,
  buildSupportedToolCards,
} from "./connect-tool-catalog";

describe("buildConnectToolCatalog", () => {
  test("does not fall back to unrelated mock tools when no skill graph evidence exists", () => {
    const catalog = buildConnectToolCatalog({
      skillGraph: null,
      connections: [],
      latestRecommendation: null,
    });

    expect(catalog.map((tool) => tool.id).sort()).toEqual(
      buildSupportedToolCards().map((tool) => tool.id).sort(),
    );
    expect(catalog.map((tool) => tool.id)).not.toContain("jira");
    expect(catalog.map((tool) => tool.id)).not.toContain("zoho-crm");
  });

  test("keeps a researched unsupported manual-plan tool visible across reopen", () => {
    const catalog = buildConnectToolCatalog({
      skillGraph: null,
      connections: [
        {
          toolId: "google-ads",
          name: "Google Ads",
          description: "Inspect campaigns, keywords, budgets, and performance signals.",
          status: "unsupported",
          authKind: "none",
          connectorType: "api",
          configSummary: ["Use the Ads API through a manual integration plan."],
        },
      ],
      latestRecommendation: null,
    });

    expect(catalog.find((tool) => tool.id === "google-ads")).toMatchObject({
      id: "google-ads",
      status: "unsupported",
      connected: true,
    });
  });

  test("surfaces the direct Google Ads connector from the agent use case without restoring mock filler", () => {
    const catalog = buildConnectToolCatalog({
      skillGraph: null,
      agentUseCase: "Monitor Google Ads campaign pacing and budget drift.",
      connections: [],
      latestRecommendation: null,
    });

    expect(catalog.find((tool) => tool.id === "google-ads")).toMatchObject({
      id: "google-ads",
      status: "available",
      connected: false,
    });
    expect(catalog.map((tool) => tool.id)).not.toContain("jira");
  });

  test("prioritizes the Google Ads connector first when the live use case names it", () => {
    const catalog = buildConnectToolCatalog({
      skillGraph: null,
      agentUseCase: "Audit Google Ads search terms and rebalance paid media budgets.",
      connections: [],
      latestRecommendation: null,
    });

    expect(catalog[0]).toMatchObject({
      id: "google-ads",
      status: "available",
    });
  });

  test("prefers an explicit Google Ads connector hint from the skill graph over keyword fallback", () => {
    const catalog = buildConnectToolCatalog({
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance and budget pacing.",
          source: "custom",
          status: "generated",
          depends_on: [],
          tool_type: "mcp",
          tool_id: "google-ads",
          external_api: "Google Ads",
        },
      ],
      agentUseCase: "Research a Linear follow-up for paid media delivery issues.",
      connections: [],
      latestRecommendation: null,
    });

    expect(catalog[0]).toMatchObject({
      id: "google-ads",
      name: "Google Ads",
      status: "available",
      authKind: "oauth",
      connectorType: "mcp",
    });
    expect(catalog.map((tool) => tool.id).slice(0, 3)).not.toContain("linear");
  });

  test("surfaces an explicit registry-backed tool_id even when external_api text is omitted", () => {
    const catalog = buildConnectToolCatalog({
      skillGraph: [
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance and budget pacing.",
          source: "custom",
          status: "generated",
          depends_on: [],
          tool_type: "mcp",
          tool_id: "google-ads",
        },
      ],
      agentUseCase: "Research a Linear follow-up for paid media delivery issues.",
      connections: [],
      latestRecommendation: null,
    });

    expect(catalog[0]).toMatchObject({
      id: "google-ads",
      name: "Google Ads",
      status: "available",
      authKind: "oauth",
      connectorType: "mcp",
    });
    expect(catalog.map((tool) => tool.id).slice(0, 3)).not.toContain("linear");
  });

  test("surfaces a researched supported connector recommendation instead of unrelated filler", () => {
    const recommendation: ToolResearchResult = {
      type: "tool_recommendation",
      toolName: "Google Ads",
      recommendedMethod: "mcp",
      recommendedToolId: "google-ads",
      recommendedPackage: "@anthropic/google-ads-mcp",
      summary: "Use the direct Google Ads MCP connector.",
      rationale: "The current product supports Google Ads directly.",
      requiredCredentials: [],
      setupSteps: [],
      integrationSteps: [],
      validationSteps: [],
      alternatives: [],
      sources: [],
    };

    const catalog = buildConnectToolCatalog({
      skillGraph: null,
      connections: [],
      latestRecommendation: recommendation,
    });

    expect(catalog[0]).toMatchObject({
      id: "google-ads",
      name: "Google Ads",
      status: "available",
    });
    expect(catalog.map((tool) => tool.id)).not.toContain("jira");
  });

  test("keeps an already configured supported connector configured when the latest recommendation repeats it", () => {
    const recommendation: ToolResearchResult = {
      type: "tool_recommendation",
      toolName: "Google Ads",
      recommendedMethod: "mcp",
      recommendedToolId: "google-ads",
      recommendedPackage: "@anthropic/google-ads-mcp",
      summary: "Use the direct Google Ads MCP connector.",
      rationale: "The current product supports Google Ads directly.",
      requiredCredentials: [],
      setupSteps: [],
      integrationSteps: [],
      validationSteps: [],
      alternatives: [],
      sources: [],
    };

    const catalog = buildConnectToolCatalog({
      skillGraph: null,
      connections: [
        {
          toolId: "google-ads",
          name: "Google Ads",
          description: "Saved connector",
          status: "configured",
          authKind: "oauth",
          connectorType: "mcp",
          configSummary: ["Connected account: Acme Workspace"],
        },
      ],
      latestRecommendation: recommendation,
    });

    expect(catalog[0]).toMatchObject({
      id: "google-ads",
      name: "Google Ads",
      connected: true,
      status: "configured",
      authKind: "oauth",
      connectorType: "mcp",
      configSummary: ["Connected account: Acme Workspace"],
    });
  });
});
