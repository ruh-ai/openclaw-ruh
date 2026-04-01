import { describe, expect, test } from "bun:test";

import { detectToolHintIds, detectTriggerHintIds } from "./builder-hint-normalization";

describe("detectToolHintIds", () => {
  test("normalizes explicit Google Ads architect connection ids to the direct google-ads connector", () => {
    expect(
      detectToolHintIds(
        [],
        {
          type: "ready_for_review",
          tool_connections: [
            {
              tool_id: "Google Ads API",
              name: "Google Ads",
              description: "Use the direct Google Ads connector.",
              required_env: [],
            },
          ],
        },
      ),
    ).toEqual(["google-ads"]);
  });

  test("normalizes spaced Google Ads API metadata to the direct google-ads connector", () => {
    expect(
      detectToolHintIds([
        {
          skill_id: "campaign-auditor",
          name: "Campaign Auditor",
          description: "Inspect paid search performance",
          status: "generated",
          source: "custom",
          depends_on: [],
          external_api: "Google Ads API",
          native_tool: "Google Ads API",
        },
      ]),
    ).toEqual(["google-ads"]);
  });

  test("normalizes human-readable Google Workspace metadata to the supported google connector", () => {
    expect(
      detectToolHintIds([
        {
          skill_id: "workspace-sync",
          name: "Workspace Sync",
          description: "Read campaign planning materials from the shared workspace",
          status: "generated",
          source: "custom",
          depends_on: [],
          native_tool: "Google Workspace",
        },
      ]),
    ).toEqual(["google"]);
  });
});

describe("detectTriggerHintIds", () => {
  test("combines schedule and inbound webhook hints from requirements metadata", () => {
    expect(
      detectTriggerHintIds({
        type: "ready_for_review",
        requirements: {
          description: "Accept campaign alerts from Google Ads callbacks.",
          schedule: "Run every weekday morning.",
          data_sources: [
            {
              source_type: "campaign alerts",
              access_method: "callback URL",
            },
          ],
        },
      }),
    ).toEqual(["cron-schedule", "webhook-post"]);
  });
});
