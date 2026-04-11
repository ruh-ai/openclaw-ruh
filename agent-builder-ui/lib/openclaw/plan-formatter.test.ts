/**
 * plan-formatter.test.ts
 * Tests for normalizePlan, formatPRD, formatTRD, renderPlanSummary.
 * All pure string/object transforms — no mocks needed.
 */
import { describe, expect, test } from "bun:test";
import type { ArchitecturePlan, DiscoveryDocuments } from "./types";
import { normalizePlan, formatPRD, formatTRD, renderPlanSummary } from "./plan-formatter";

// ─── normalizePlan ───────────────────────────────────────────────────────────

describe("normalizePlan", () => {
  test("fills missing arrays with empty arrays", () => {
    const result = normalizePlan({});
    expect(result.skills).toEqual([]);
    expect(result.integrations).toEqual([]);
    expect(result.triggers).toEqual([]);
    expect(result.channels).toEqual([]);
    expect(result.envVars).toEqual([]);
    expect(result.subAgents).toEqual([]);
    expect(result.apiEndpoints).toEqual([]);
    expect(result.dashboardPages).toEqual([]);
    expect(result.vectorCollections).toEqual([]);
  });

  test("fills missing workflow with empty steps", () => {
    const result = normalizePlan({});
    expect(result.workflow).toEqual({ steps: [] });
  });

  test("fills missionControl and dataSchema with null", () => {
    const result = normalizePlan({});
    expect(result.missionControl).toBeNull();
    expect(result.dataSchema).toBeNull();
  });

  test("preserves provided values", () => {
    const input = {
      skills: [{ name: "reporting", description: "Reports", dependencies: [], envVars: [] }],
      channels: ["telegram"],
      envVars: [{ key: "API_KEY", description: "key", required: true }],
    };
    const result = normalizePlan(input);
    expect(result.skills).toHaveLength(1);
    expect(result.channels).toEqual(["telegram"]);
    expect(result.envVars).toHaveLength(1);
  });

  test("includes soulContent when present", () => {
    const result = normalizePlan({ soulContent: "You are a helpful assistant." });
    expect((result as { soulContent?: string }).soulContent).toBe("You are a helpful assistant.");
  });

  test("omits soulContent key when absent", () => {
    const result = normalizePlan({});
    expect("soulContent" in result).toBe(false);
  });
});

// ─── formatPRD ───────────────────────────────────────────────────────────────

describe("formatPRD", () => {
  test("produces a markdown heading and sections", () => {
    const prd: DiscoveryDocuments["prd"] = {
      title: "Google Ads Agent PRD",
      sections: [
        { heading: "Overview", content: "Manages ad campaigns." },
        { heading: "Goals", content: "Increase ROI." },
      ],
    };
    const output = formatPRD(prd);
    expect(output).toContain("# Google Ads Agent PRD");
    expect(output).toContain("## Overview");
    expect(output).toContain("Manages ad campaigns.");
    expect(output).toContain("## Goals");
    expect(output).toContain("Increase ROI.");
    expect(output).toContain("---");
  });

  test("handles a single section with no separator", () => {
    const prd: DiscoveryDocuments["prd"] = {
      title: "Simple PRD",
      sections: [{ heading: "Summary", content: "A simple agent." }],
    };
    const output = formatPRD(prd);
    expect(output).toContain("## Summary");
    // Single section — no --- divider
    expect(output).not.toContain("---");
  });
});

// ─── formatTRD ───────────────────────────────────────────────────────────────

describe("formatTRD", () => {
  test("produces correct markdown structure", () => {
    const trd: DiscoveryDocuments["trd"] = {
      title: "TRD",
      sections: [
        { heading: "Stack", content: "TypeScript + Express" },
        { heading: "Data model", content: "campaigns table" },
      ],
    };
    const output = formatTRD(trd);
    expect(output).toContain("# TRD");
    expect(output).toContain("## Stack");
    expect(output).toContain("## Data model");
    expect(output).toContain("---");
    expect(output.endsWith("\n")).toBe(true);
  });
});

// ─── renderPlanSummary ────────────────────────────────────────────────────────

describe("renderPlanSummary", () => {
  const basePlan: ArchitecturePlan = {
    skills: [],
    workflow: { steps: [] },
    integrations: [],
    triggers: [],
    channels: [],
    envVars: [],
    subAgents: [],
    missionControl: null,
    dataSchema: null,
    apiEndpoints: [],
    dashboardPages: [],
    vectorCollections: [],
  };

  test("renders a heading and returns string", () => {
    const out = renderPlanSummary(basePlan);
    expect(out).toContain("# Architecture Plan");
  });

  test("renders skills table when skills present", () => {
    const plan: ArchitecturePlan = {
      ...basePlan,
      skills: [
        { name: "Reporting", description: "Generates reports", dependencies: ["axios"], envVars: ["API_KEY"] },
      ],
    };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## Skills");
    expect(out).toContain("Reporting");
    expect(out).toContain("axios");
    expect(out).toContain("API_KEY");
  });

  test("renders workflow steps", () => {
    const plan: ArchitecturePlan = {
      ...basePlan,
      workflow: { steps: [{ skillId: "reporting", parallel: false }, { skillId: "notify", parallel: true }] },
    };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## Workflow");
    expect(out).toContain("reporting");
    expect(out).toContain("notify (parallel)");
  });

  test("renders integrations table", () => {
    const plan: ArchitecturePlan = {
      ...basePlan,
      integrations: [{ name: "Slack", method: "webhook", envVars: ["SLACK_TOKEN"] }],
    };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## Integrations");
    expect(out).toContain("Slack");
    expect(out).toContain("webhook");
    expect(out).toContain("SLACK_TOKEN");
  });

  test("renders triggers with config", () => {
    const plan: ArchitecturePlan = {
      ...basePlan,
      triggers: [{ id: "daily", type: "cron", description: "Daily job", config: "0 9 * * *" }],
    };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## Triggers");
    expect(out).toContain("**daily**");
    expect(out).toContain("cron");
    expect(out).toContain("0 9 * * *");
  });

  test("renders env vars table", () => {
    const plan: ArchitecturePlan = {
      ...basePlan,
      envVars: [
        { key: "API_KEY", description: "The API key", required: true },
        { key: "DEBUG", description: "Enable debug", required: false },
      ],
    };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## Environment Variables");
    expect(out).toContain("`API_KEY`");
    expect(out).toContain("yes");
    expect(out).toContain("no");
  });

  test("renders data schema with columns", () => {
    const plan: ArchitecturePlan = {
      ...basePlan,
      dataSchema: {
        tables: [
          {
            name: "campaigns",
            description: "Ad campaigns",
            columns: [
              { name: "id", type: "uuid", nullable: false, description: "Primary key" },
              { name: "name", type: "text", nullable: true, description: "Campaign name" },
            ],
          },
        ],
      },
    };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## Data Schema");
    expect(out).toContain("campaigns");
    expect(out).toContain("uuid");
    expect(out).toContain("yes"); // nullable column
    expect(out).toContain("no");  // non-nullable column
  });

  test("renders API endpoints", () => {
    const plan: ArchitecturePlan = {
      ...basePlan,
      apiEndpoints: [{ method: "GET", path: "/api/campaigns", description: "List campaigns" }],
    };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## API Endpoints");
    expect(out).toContain("GET");
    expect(out).toContain("/api/campaigns");
    expect(out).toContain("List campaigns");
  });

  test("renders dashboard pages", () => {
    const plan: ArchitecturePlan = {
      ...basePlan,
      dashboardPages: [
        {
          title: "Overview",
          path: "/",
          components: [{ type: "metric-cards", title: "Metrics" }],
        },
      ],
    };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## Dashboard Pages");
    expect(out).toContain("**Overview**");
    expect(out).toContain("`/`");
    expect(out).toContain("metric-cards");
  });

  test("renders channels", () => {
    const plan: ArchitecturePlan = { ...basePlan, channels: ["telegram", "slack"] };
    const out = renderPlanSummary(plan);
    expect(out).toContain("## Channels");
    expect(out).toContain("telegram");
    expect(out).toContain("slack");
  });

  test("omits empty sections", () => {
    const out = renderPlanSummary(basePlan);
    expect(out).not.toContain("## Skills");
    expect(out).not.toContain("## Workflow");
    expect(out).not.toContain("## Integrations");
  });
});
