import { describe, expect, test } from "bun:test";

import {
  buildToolResearchPlan,
  buildToolResearchResultFromPlan,
  reconcileToolConnections,
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
});
