import { describe, expect, test } from "bun:test";

import {
  extractRuntimeInputKeys,
  getRuntimeInputDetails,
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
});
