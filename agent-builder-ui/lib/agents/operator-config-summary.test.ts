import { describe, expect, test } from "bun:test";

import {
  buildDeployConfigSummary,
  buildReviewRuntimeInputItems,
  buildReviewToolItems,
  buildReviewTriggerItems,
} from "./operator-config-summary";
import type { AgentRuntimeInput, AgentToolConnection, AgentTriggerDefinition } from "./types";

describe("buildReviewToolItems", () => {
  test("surfaces persisted research-plan notes and sources", () => {
    const items = buildReviewToolItems([
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
          setupSteps: ["Create a Linear API key.", "Store it in the connector vault."],
          integrationSteps: ["Add issue create/update calls to the builder tool."],
          validationSteps: ["Create a test issue in a sandbox workspace."],
          alternatives: [],
          sources: [{ title: "Linear API docs", url: "https://linear.app/docs/api" }],
        },
      } satisfies AgentToolConnection,
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        id: "linear",
        detail: "Manual integration still required",
        planNotes: [
          "Recommended path: API",
          "Package or command: @linear/sdk",
          "Setup: Create a Linear API key.",
          "Setup: Store it in the connector vault.",
          "Validate: Create a test issue in a sandbox workspace.",
        ],
        sources: [{ title: "Linear API docs", url: "https://linear.app/docs/api" }],
      }),
    ]);
  });

  test("keeps older saved tool connections readable without a research plan", () => {
    const items = buildReviewToolItems([
      {
        toolId: "google-ads",
        name: "Google Ads",
        description: "Manage campaigns.",
        status: "configured",
        authKind: "oauth",
        connectorType: "mcp",
        configSummary: ["Credentials stored securely"],
      } satisfies AgentToolConnection,
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        id: "google-ads",
        planNotes: [],
        sources: [],
      }),
    ]);
  });
});

describe("buildReviewTriggerItems", () => {
  test("keeps schedule detail and unsupported webhook status truthful in the create-flow review summary", () => {
    const triggers: AgentTriggerDefinition[] = [
      {
        id: "cron-schedule",
        title: "Weekday pacing run",
        kind: "schedule",
        status: "supported",
        description: "Runs every weekday morning.",
        schedule: "0 9 * * 1-5",
      },
      {
        id: "webhook-post",
        title: "Incoming Ads webhook",
        kind: "webhook",
        status: "unsupported",
        description: "Waits for inbound campaign alerts.",
      },
    ];

    expect(buildReviewTriggerItems(triggers)).toEqual([
      {
        id: "cron-schedule",
        text: "Weekday pacing run",
        kind: "schedule",
        status: "supported",
        statusLabel: "Supported schedule",
        detail: "0 9 * * 1-5",
      },
      {
        id: "webhook-post",
        text: "Incoming Ads webhook",
        kind: "webhook",
        status: "unsupported",
        statusLabel: "Unsupported webhook",
        detail: "Waits for inbound campaign alerts.",
      },
    ]);
  });
});

describe("buildReviewRuntimeInputItems", () => {
  test("marks required Google Ads inputs as provided or missing without losing the saved labels", () => {
    const runtimeInputs: AgentRuntimeInput[] = [
      {
        key: "GOOGLE_ADS_CUSTOMER_ID",
        label: "Customer ID",
        description: "Primary Google Ads account id.",
        required: true,
        source: "architect_requirement",
        value: "123-456-7890",
      },
      {
        key: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
        label: "Manager Account ID",
        description: "Needed for MCC-scoped calls.",
        required: true,
        source: "architect_requirement",
        value: "",
      },
    ];

    expect(buildReviewRuntimeInputItems(runtimeInputs)).toEqual([
      {
        key: "GOOGLE_ADS_CUSTOMER_ID",
        label: "Customer ID",
        required: true,
        statusLabel: "Provided",
        detail: "Primary Google Ads account id.",
      },
      {
        key: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
        label: "Manager Account ID",
        required: true,
        statusLabel: "Missing value",
        detail: "Needed for MCC-scoped calls.",
      },
    ]);
  });
});

describe("buildDeployConfigSummary", () => {
  test("keeps create-flow readiness blocked until missing credentials, unsupported triggers, and runtime gaps are resolved", () => {
    const toolConnections: AgentToolConnection[] = [
      {
        toolId: "google-ads",
        name: "Google Ads",
        description: "Inspect campaigns, budgets, and search terms.",
        status: "missing_secret",
        authKind: "oauth",
        connectorType: "mcp",
        configSummary: ["Google Ads OAuth credentials still required"],
      },
    ];
    const triggers: AgentTriggerDefinition[] = [
      {
        id: "cron-schedule",
        title: "Weekday pacing run",
        kind: "schedule",
        status: "supported",
        description: "Runs every weekday morning.",
        schedule: "0 9 * * 1-5",
      },
      {
        id: "webhook-post",
        title: "Incoming Ads webhook",
        kind: "webhook",
        status: "unsupported",
        description: "Waits for inbound campaign alerts.",
      },
    ];
    const runtimeInputs: AgentRuntimeInput[] = [
      {
        key: "GOOGLE_ADS_CUSTOMER_ID",
        label: "Customer ID",
        description: "Primary Google Ads account id.",
        required: true,
        source: "architect_requirement",
        value: "123-456-7890",
      },
      {
        key: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
        label: "Manager Account ID",
        description: "Needed for MCC-scoped calls.",
        required: true,
        source: "architect_requirement",
        value: "",
      },
    ];

    expect(
      buildDeployConfigSummary({
        toolConnections,
        triggers,
        runtimeInputs,
      }),
    ).toEqual({
      toolSummary: "1 needs credentials",
      runtimeInputSummary: "1 runtime input ready, 1 missing runtime input",
      triggerSummary: "1 supported, 1 unsupported",
      readinessLabel: "Action needed before deploy",
    });
  });
});
