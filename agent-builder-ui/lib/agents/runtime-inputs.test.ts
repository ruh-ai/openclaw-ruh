import { describe, expect, test } from "bun:test";

import {
  enrichRuntimeInputsFromPlan,
  extractRuntimeInputKeys,
  getRuntimeInputDetails,
  hasMissingRequiredInputs,
  isRuntimeInputFilled,
  mergeRuntimeInputDefinitions,
} from "./runtime-inputs";

describe("getRuntimeInputDetails", () => {
  test("returns the Google Ads label copy for the proving-case runtime env", () => {
    expect(getRuntimeInputDetails(" google_ads_customer_id ")).toEqual({
      label: "Google Ads Customer ID",
      description: "Google Ads customer ID for the target account.",
    });
  });
});

describe("extractRuntimeInputKeys", () => {
  test("dedupes rule and skill requirements into canonical uppercase keys", () => {
    expect(
      extractRuntimeInputKeys({
        agentRules: [
          "Requires env: google_ads_customer_id, google_ads_login_customer_id",
          "requires env: GOOGLE_ADS_CUSTOMER_ID",
          "Use concise pacing summaries",
        ],
        skillGraph: [
          {
            skill_id: "google-ads-audit",
            name: "Google Ads Audit",
            description: "Inspect campaign pacing",
            requires_env: [" google_ads_customer_id ", "google_ads_refresh_token"],
          },
          {
            skill_id: "budget-pacing-report",
            name: "Budget Pacing Report",
            description: "Escalate overspend risk",
            requires_env: ["GOOGLE_ADS_REFRESH_TOKEN"],
          },
        ],
      }),
    ).toEqual([
      "GOOGLE_ADS_CUSTOMER_ID",
      "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
      "GOOGLE_ADS_REFRESH_TOKEN",
    ]);
  });
});

describe("mergeRuntimeInputDefinitions", () => {
  test("preserves saved Google Ads metadata while merging new architect requirements", () => {
    expect(
      mergeRuntimeInputDefinitions({
        existing: [
          {
            key: " google_ads_customer_id ",
            label: "Saved customer id",
            description: "Stored on the agent already.",
            required: false,
            source: "saved_config",
            value: "123-456-7890",
          },
        ],
        agentRules: ["Requires env: GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_LOGIN_CUSTOMER_ID"],
      }),
    ).toEqual([
      {
        key: "GOOGLE_ADS_CUSTOMER_ID",
        label: "Saved customer id",
        description: "Stored on the agent already.",
        required: false,
        source: "saved_config",
        value: "123-456-7890",
      },
      {
        key: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
        label: "Google Ads Login Customer Id",
        description: "Google Ads Login Customer Id required at runtime.",
        required: true,
        source: "architect_requirement",
        value: "",
      },
    ]);
  });

  test("keeps saved runtime inputs even when they are no longer inferred by the current graph", () => {
    expect(
      mergeRuntimeInputDefinitions({
        existing: [
          {
            key: "google_ads_developer_token",
            label: "Developer token",
            description: "Persisted from an earlier configure pass.",
            required: false,
            source: "saved_config",
            value: "secretless-token",
          },
        ],
        skillGraph: [],
        agentRules: [],
      }),
    ).toEqual([
      {
        key: "GOOGLE_ADS_DEVELOPER_TOKEN",
        label: "Developer token",
        description: "Persisted from an earlier configure pass.",
        required: false,
        source: "saved_config",
        value: "secretless-token",
      },
    ]);
  });
});

describe("isRuntimeInputFilled", () => {
  test("treats whitespace-only values as unfilled", () => {
    expect(
      isRuntimeInputFilled({
        key: "GOOGLE_ADS_CUSTOMER_ID",
        label: "Google Ads Customer ID",
        description: "Google Ads customer ID for the target account.",
        required: true,
        source: "architect_requirement",
        value: "   ",
      }),
    ).toBe(false);
  });

  test("considers a defaultValue as filled even when value is empty", () => {
    expect(
      isRuntimeInputFilled({
        key: "LOG_LEVEL",
        label: "Log Level",
        description: "Logging verbosity",
        required: true,
        source: "architect_requirement",
        value: "",
        defaultValue: "info",
      }),
    ).toBe(true);
  });
});

describe("enrichRuntimeInputsFromPlan", () => {
  test("skips malformed plan env vars instead of crashing the create page", () => {
    expect(
      enrichRuntimeInputsFromPlan(
        [
          {
            key: "MICROSOFT_CLIENT_SECRET",
            label: "Old label",
            description: "Old description",
            required: true,
            source: "architect_requirement",
            value: "",
          },
        ],
        [
          { description: "Bad entry", required: true } as never,
          {
            key: "MICROSOFT_CLIENT_SECRET",
            label: "Microsoft Client Secret",
            description: "Client secret for Graph auth.",
            required: false,
            inputType: "password" as never,
            group: "Microsoft Graph Auth",
            populationStrategy: "user_required",
          },
        ],
      ),
    ).toEqual([
      {
        key: "MICROSOFT_CLIENT_SECRET",
        label: "Microsoft Client Secret",
        description: "Client secret for Graph auth.",
        required: true,
        source: "architect_requirement",
        value: "",
        inputType: "text",
        group: "Microsoft Graph Auth",
        populationStrategy: "user_required",
      },
    ]);
  });

  test("leaves malformed runtime inputs untouched instead of throwing", () => {
    const malformedInput = {
      label: "Missing key",
      description: "Bad saved input",
      required: true,
      source: "architect_requirement",
      value: "",
    } as never;

    expect(
      enrichRuntimeInputsFromPlan(
        [malformedInput],
        [
          {
            key: "API_KEY",
            description: "API key",
            required: true,
          },
        ],
      ),
    ).toEqual([malformedInput]);
  });
});

describe("hasMissingRequiredInputs", () => {
  test("returns true when user_required input has no value", () => {
    expect(
      hasMissingRequiredInputs({
        runtimeInputs: [
          {
            key: "API_KEY",
            label: "API Key",
            description: "Secret key",
            required: true,
            source: "architect_requirement",
            value: "",
            populationStrategy: "user_required",
          },
        ],
      }),
    ).toBe(true);
  });

  test("returns false when user_required input has a value", () => {
    expect(
      hasMissingRequiredInputs({
        runtimeInputs: [
          {
            key: "API_KEY",
            label: "API Key",
            description: "Secret key",
            required: true,
            source: "architect_requirement",
            value: "sk-abc123",
            populationStrategy: "user_required",
          },
        ],
      }),
    ).toBe(false);
  });

  test("does NOT block on ai_inferred inputs even when empty", () => {
    expect(
      hasMissingRequiredInputs({
        runtimeInputs: [
          {
            key: "COMPANY_NAME",
            label: "Company Name",
            description: "Name of the company",
            required: true,
            source: "architect_requirement",
            value: "",
            populationStrategy: "ai_inferred",
          },
        ],
      }),
    ).toBe(false);
  });

  test("does NOT block on static_default inputs even when empty", () => {
    expect(
      hasMissingRequiredInputs({
        runtimeInputs: [
          {
            key: "LOG_LEVEL",
            label: "Log Level",
            description: "Logging verbosity",
            required: true,
            source: "architect_requirement",
            value: "",
            populationStrategy: "static_default",
            defaultValue: "info",
          },
        ],
      }),
    ).toBe(false);
  });

  test("treats missing populationStrategy as user_required", () => {
    expect(
      hasMissingRequiredInputs({
        runtimeInputs: [
          {
            key: "OLD_KEY",
            label: "Old Key",
            description: "Legacy input",
            required: true,
            source: "architect_requirement",
            value: "",
          },
        ],
      }),
    ).toBe(true);
  });

  test("returns false when no runtime inputs exist", () => {
    expect(hasMissingRequiredInputs({ runtimeInputs: [] })).toBe(false);
  });
});
