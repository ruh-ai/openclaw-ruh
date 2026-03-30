import { describe, expect, test } from "bun:test";
import type { ArchitecturePlan, DiscoveryDocuments } from "@/lib/openclaw/types";
import { buildSkillGenerationPrompt } from "./generate-skills";

const discoveryDocuments: DiscoveryDocuments = {
  prd: {
    title: "Product Requirements Document",
    sections: [
      {
        heading: "Core Capabilities",
        content: "Monitor campaign pacing, detect performance anomalies, and draft human-readable recommendations.",
      },
    ],
  },
  trd: {
    title: "Technical Requirements Document",
    sections: [
      {
        heading: "Skills & Workflow",
        content: "Use first-party Google Ads domain skills with explicit customer scoping and approval-first mutations.",
      },
    ],
  },
};

const architecturePlan: ArchitecturePlan = {
  skills: [
    {
      id: "google-ads-audit",
      name: "Google Ads Audit",
      description: "Inspect campaign performance and flag pacing or budget issues.",
      dependencies: [],
      toolType: "api",
      envVars: ["GOOGLE_ADS_CUSTOMER_ID"],
      externalApi: "Google Ads API",
    },
  ],
  workflow: {
    steps: [{ skillId: "google-ads-audit", parallel: false }],
  },
  integrations: [
    {
      toolId: "google-ads",
      name: "Google Ads",
      method: "api",
      envVars: ["GOOGLE_ADS_DEVELOPER_TOKEN"],
    },
  ],
  triggers: [
    {
      id: "weekday-audit",
      type: "cron",
      config: "0 9 * * 1-5",
      description: "Run a weekday campaign audit.",
    },
  ],
  channels: ["slack"],
  envVars: [
    {
      key: "GOOGLE_ADS_CUSTOMER_ID",
      description: "Ads account to inspect",
      required: true,
    },
  ],
  subAgents: [],
  missionControl: null,
};

describe("buildSkillGenerationPrompt", () => {
  test("includes the approved architecture plan and requires full built skill output", () => {
    const prompt = buildSkillGenerationPrompt(
      "Google Ads Campaign Manager",
      "Monitor campaigns and prepare approval-first optimizations.",
      undefined,
      discoveryDocuments,
      architecturePlan,
    );

    expect(prompt).toContain("Approved Architecture Plan");
    expect(prompt).toContain("google-ads-audit");
    expect(prompt).toContain("GOOGLE_ADS_CUSTOMER_ID");
    expect(prompt).toContain('"skill_md"');
    expect(prompt).toContain("Full SKILL.md content");
  });
});
