import { describe, expect, test, mock } from "bun:test";

mock.module("@/app/(platform)/agents/create/_config/mcp-tool-registry", () => ({
  getToolDefinition: (id: string) => {
    const tools: Record<string, { id: string; name: string }> = {
      "slack": { id: "slack", name: "Slack" },
      "github": { id: "github", name: "GitHub" },
      "jira": { id: "jira", name: "Jira" },
    };
    return tools[id] ?? null;
  },
}));

import { detectToolHintIds, detectTriggerHintIds, detectChannelHintIds } from "./builder-hint-normalization";

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

describe("detectToolHintIds — keyword matching", () => {
  test("detects Slack from node description", () => {
    const result = detectToolHintIds([
      { skill_id: "notify", name: "Notify", description: "Post to Slack channel", depends_on: [], source: "custom", status: "generated" },
    ]);
    expect(result).toContain("slack");
  });

  test("detects GitHub from external_api", () => {
    const result = detectToolHintIds([
      { skill_id: "pr-opener", name: "PR Opener", description: "Opens PRs", depends_on: [], source: "custom", status: "generated", external_api: "GitHub API" },
    ]);
    expect(result).toContain("github");
  });

  test("detects Jira from skill name", () => {
    const result = detectToolHintIds([
      { skill_id: "jira-sync", name: "Jira Sync", description: "Sync issues", depends_on: [], source: "custom", status: "generated" },
    ]);
    expect(result).toContain("jira");
  });

  test("returns empty array when no relevant keywords present", () => {
    const result = detectToolHintIds([
      { skill_id: "generic-skill", name: "Generic Skill", description: "Does stuff", depends_on: [], source: "custom", status: "generated" },
    ]);
    expect(result).toEqual([]);
  });

  test("handles empty skill graph", () => {
    expect(detectToolHintIds([])).toEqual([]);
  });
});

describe("detectChannelHintIds", () => {
  test("detects telegram from skill description", () => {
    const result = detectChannelHintIds(
      [{ skill_id: "tg-notify", name: "TG Notify", description: "Send Telegram message", depends_on: [], source: "custom", status: "generated" }],
      { type: "ready_for_review" },
    );
    expect(result).toContain("telegram");
  });

  test("detects discord from response content", () => {
    const result = detectChannelHintIds(
      [],
      { type: "ready_for_review", content: "Sends alerts via Discord webhook" },
    );
    expect(result).toContain("discord");
  });

  test("detects slack from agent_metadata primary_users", () => {
    const result = detectChannelHintIds(
      [],
      { type: "ready_for_review", agent_metadata: { primary_users: "Slack team" } },
    );
    expect(result).toContain("slack");
  });

  test("returns empty when no channel keywords present", () => {
    const result = detectChannelHintIds(
      [{ skill_id: "data-fetch", name: "Fetch Data", description: "Fetches CSV data", depends_on: [], source: "custom", status: "generated" }],
      { type: "ready_for_review", content: "This agent fetches CSV data" },
    );
    expect(result).toEqual([]);
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

  test("detects schedule from agent_metadata.cron_expression", () => {
    const result = detectTriggerHintIds({
      type: "ready_for_review",
      agent_metadata: { cron_expression: "0 9 * * 1-5" },
    });
    expect(result).toContain("cron-schedule");
  });

  test("detects schedule from agent_metadata.schedule_description", () => {
    const result = detectTriggerHintIds({
      type: "ready_for_review",
      agent_metadata: { schedule_description: "Every weekday morning" },
    });
    expect(result).toContain("cron-schedule");
  });

  test("detects webhook from trigger object with kind=webhook", () => {
    const result = detectTriggerHintIds({
      type: "ready_for_review",
      triggers: [{ kind: "webhook", id: "incoming-webhook", title: "Incoming Webhook" }],
    });
    expect(result).toContain("webhook-post");
  });

  test("detects schedule from trigger object with kind=schedule", () => {
    const result = detectTriggerHintIds({
      type: "ready_for_review",
      triggers: [{ kind: "schedule", id: "daily-run", title: "Daily Run" }],
    });
    expect(result).toContain("cron-schedule");
  });

  test("detects cron-schedule from cron_jobs array", () => {
    const result = detectTriggerHintIds({
      type: "ready_for_review",
      cron_jobs: [{ name: "morning-run", schedule: "0 9 * * 1-5", message: "Run" }],
    });
    expect(result).toContain("cron-schedule");
  });

  test("detects webhook from content text containing 'incoming request'", () => {
    const result = detectTriggerHintIds({
      type: "ready_for_review",
      content: "This agent will process an incoming request from external system.",
    });
    expect(result).toContain("webhook-post");
  });

  test("returns empty array when no triggers detected", () => {
    const result = detectTriggerHintIds({
      type: "ready_for_review",
      content: "This agent monitors data quality.",
    });
    expect(result).toEqual([]);
  });
});
