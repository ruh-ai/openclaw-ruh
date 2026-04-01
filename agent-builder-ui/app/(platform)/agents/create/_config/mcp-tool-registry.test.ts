import { describe, expect, test } from "bun:test";

import {
  areRequiredCredentialsFilled,
  getToolCredentialFields,
  getToolRuntimeInputGuidance,
} from "./mcp-tool-registry";

describe("mcp-tool-registry", () => {
  test("keeps Google Ads customer id out of encrypted credential fields", () => {
    expect(getToolCredentialFields("google-ads").map((field) => field.key)).toEqual([
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
    ]);
  });

  test("treats the Google Ads connector as complete when only the secret-bearing fields are present", () => {
    expect(
      areRequiredCredentialsFilled("google-ads", {
        GOOGLE_ADS_CLIENT_ID: "client-id",
        GOOGLE_ADS_CLIENT_SECRET: "client-secret",
        GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
        GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
      }),
    ).toBe(true);

    expect(
      areRequiredCredentialsFilled("google-ads", {
        GOOGLE_ADS_CLIENT_ID: "client-id",
        GOOGLE_ADS_CLIENT_SECRET: "client-secret",
        GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
      }),
    ).toBe(false);
  });

  test("points Google Ads operators to Runtime Inputs for the non-secret customer id", () => {
    expect(getToolRuntimeInputGuidance("google-ads")).toEqual({
      title: "Runtime input required separately",
      description:
        "Enter GOOGLE_ADS_CUSTOMER_ID in Runtime Inputs. Keep it operator-visible instead of storing it as an encrypted credential.",
    });
  });
});
