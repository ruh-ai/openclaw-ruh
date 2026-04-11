/**
 * Extended tests for agent-config.ts — covers branches missed by agent-config.test.ts:
 * - describeToolStatus: missing_secret, unsupported, available branches
 * - buildSoulContent: skills fallback when no skillGraph, improvements lines, missing runtime input
 * - buildCronJobs: no triggers, no matching rule, multiple triggers
 * - deployFromPlan: happy path, non-ok response, soulContent override
 * - pushAgentConfig: non-JSON response, http error without json body
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import { buildSoulContent, buildCronJobs, pushAgentConfig, deployFromPlan } from "./agent-config";
import type { SavedAgent } from "@/hooks/use-agents-store";
import type { ArchitecturePlan } from "./types";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ─── Base agent fixture ───────────────────────────────────────────────────────

const baseAgent: SavedAgent = {
  id: "agent-1",
  name: "Test Agent",
  avatar: "",
  description: "Does stuff",
  skills: ["skill-a", "skill-b"],
  triggerLabel: "Manual",
  status: "draft",
  createdAt: "2026-01-01T00:00:00.000Z",
  sandboxIds: [],
  agentRules: [],
  skillGraph: undefined,
  runtimeInputs: [],
  toolConnections: [],
  triggers: [],
  improvements: [],
  channels: [],
};

// ─── buildSoulContent — skills fallback ──────────────────────────────────────

describe("buildSoulContent — skills fallback", () => {
  test("falls back to skills[] when skillGraph is empty or undefined", () => {
    const soul = buildSoulContent({
      ...baseAgent,
      skillGraph: undefined,
      skills: ["google-ads-audit", "budget-pacing"],
    });
    expect(soul).toContain("**google-ads-audit**");
    expect(soul).toContain("**budget-pacing**");
  });

  test("uses skillGraph when present", () => {
    const soul = buildSoulContent({
      ...baseAgent,
      skillGraph: [
        { skill_id: "sg-1", name: "Campaign Monitor", description: "Fetches campaign data", source: "custom", status: "approved", depends_on: [] },
      ],
    });
    expect(soul).toContain("**Campaign Monitor**: Fetches campaign data");
  });

  test("omits description suffix for skills without description", () => {
    const soul = buildSoulContent({
      ...baseAgent,
      skillGraph: [
        { skill_id: "sg-1", name: "Bare Skill", description: "", source: "custom", status: "approved", depends_on: [] },
      ],
    });
    // Should have "- **Bare Skill**" without a colon
    expect(soul).toContain("- **Bare Skill**");
    expect(soul).not.toContain("- **Bare Skill**:");
  });

  test("includes accepted improvements in soul content", () => {
    const soul = buildSoulContent({
      ...baseAgent,
      improvements: [
        { id: "imp-1", title: "Add urgency scoring", summary: "Rank alerts by urgency", status: "accepted" },
        { id: "imp-2", title: "Draft improvement", summary: "Not accepted yet", status: "draft" },
      ],
    });
    expect(soul).toContain("Accepted improvement: Add urgency scoring");
    expect(soul).not.toContain("Draft improvement");
  });

  test("marks runtime inputs as missing when value is empty", () => {
    const soul = buildSoulContent({
      ...baseAgent,
      runtimeInputs: [
        { key: "API_KEY", label: "API Key", description: "Auth key", required: true, source: "architect_requirement", value: "" },
      ],
    });
    expect(soul).toContain("Runtime input API Key: missing");
  });
});

// ─── describeToolStatus — all branches ───────────────────────────────────────

describe("buildSoulContent — tool status branches", () => {
  test("missing_secret shows correct status description", () => {
    const soul = buildSoulContent({
      ...baseAgent,
      toolConnections: [
        { toolId: "google-ads", name: "Google Ads", description: "Ads tool", status: "missing_secret", authKind: "oauth", connectorType: "mcp", configSummary: [] },
      ],
    });
    expect(soul).toContain("selected but missing credentials");
  });

  test("unsupported shows correct status description", () => {
    const soul = buildSoulContent({
      ...baseAgent,
      toolConnections: [
        { toolId: "custom-erp", name: "Custom ERP", description: "ERP", status: "unsupported", authKind: "none", connectorType: "api", configSummary: [] },
      ],
    });
    expect(soul).toContain("manual plan only; not runtime-ready");
  });

  test("available shows correct status description", () => {
    const soul = buildSoulContent({
      ...baseAgent,
      toolConnections: [
        { toolId: "slack", name: "Slack", description: "Slack integration", status: "available", authKind: "oauth", connectorType: "mcp", configSummary: [] },
      ],
    });
    expect(soul).toContain("available but not configured");
  });

  test("no tools/triggers/improvements returns empty config lines section", () => {
    const soul = buildSoulContent({ ...baseAgent });
    expect(soul).not.toContain("## Configured Tools And Triggers");
  });
});

// ─── buildCronJobs ────────────────────────────────────────────────────────────

describe("buildCronJobs", () => {
  test("returns empty array when no triggers and no cron rule", () => {
    const jobs = buildCronJobs({ ...baseAgent, triggers: [], agentRules: [] });
    expect(jobs).toEqual([]);
  });

  test("returns empty array when rule has no valid cron expression", () => {
    const jobs = buildCronJobs({ ...baseAgent, agentRules: ["schedule: every day"] });
    expect(jobs).toEqual([]);
  });

  test("uses schedule from supported trigger before falling back to rules", () => {
    const jobs = buildCronJobs({
      ...baseAgent,
      triggers: [
        { id: "t1", title: "Morning run", kind: "schedule", status: "supported", description: "Daily", schedule: "0 8 * * 1-5" },
      ],
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].schedule).toBe("0 8 * * 1-5");
  });

  test("extracts cron from agentRules when triggers have no supported schedule", () => {
    const jobs = buildCronJobs({
      ...baseAgent,
      triggers: [
        { id: "wh", title: "Webhook", kind: "webhook", status: "supported", description: "Webhook trigger" },
      ],
      agentRules: ["cron: 30 2 * * *"],
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].schedule).toBe("30 2 * * *");
  });
});

// ─── pushAgentConfig — error handling ────────────────────────────────────────

describe("pushAgentConfig — error paths", () => {
  test("returns ok:false with status code detail when server returns non-JSON error", async () => {
    globalThis.fetch = mock(async () =>
      new Response("Internal Server Error", { status: 500, headers: { "content-type": "text/plain" } }),
    ) as typeof fetch;

    const result = await pushAgentConfig("sb-1", baseAgent);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.detail).toContain("500");
  });

  test("returns ok:false with detail from json body when server returns structured error", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ detail: "Permission denied" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const result = await pushAgentConfig("sb-1", baseAgent);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("Permission denied");
  });

  test("includes skill-creator meta-skill in push payload", async () => {
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ ok: true, applied: true, steps: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await pushAgentConfig("sb-1", {
      ...baseAgent,
      skillGraph: [{ skill_id: "my-skill", name: "My Skill", description: "Does things", source: "custom", status: "approved", depends_on: [] }],
    });

    const skillIds = (capturedBody.skills as Array<{ skill_id: string }>).map((s) => s.skill_id);
    expect(skillIds).toContain("skill-creator");
    expect(skillIds).toContain("my-skill");
  });
});

// ─── deployFromPlan ───────────────────────────────────────────────────────────

const basePlan: ArchitecturePlan = {
  agentName: "google-ads",
  skills: [
    { id: "campaign-fetch", name: "Campaign Fetch", description: "Fetch campaign data", dependencies: [], envVars: ["GOOGLE_ADS_TOKEN"] },
    { id: "budget-alert", name: "Budget Alert", description: "Alert on budget overspend", dependencies: ["campaign-fetch"], envVars: [] },
  ],
  workflow: {
    steps: [
      { skillId: "campaign-fetch", parallel: false },
      { skillId: "budget-alert", parallel: false },
    ],
  },
  integrations: [{ toolId: "google-ads", name: "Google Ads", type: "api", authKind: "oauth" }],
  triggers: [{ id: "cron-daily", type: "cron", config: "0 9 * * 1-5", description: "Weekdays at 9am" }],
  channels: ["slack"],
  envVars: [{ key: "GOOGLE_ADS_TOKEN", label: "Google Ads Token", description: "OAuth token", required: true }],
  apiEndpoints: [],
  dashboardPages: [],
  dataSchema: { tables: [] },
  subAgents: [],
  missionControl: null,
};

describe("deployFromPlan", () => {
  test("happy path returns ok:true with nodes and workflow", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ ok: true, applied: true, steps: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const { result, nodes, workflow } = await deployFromPlan("sb-1", "Google Ads Agent", "Manages ads", basePlan, "agent-1");
    expect(result.ok).toBe(true);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].skill_id).toBe("campaign-fetch");
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0].skill).toBe("campaign-fetch");
  });

  test("maps plan dependencies and envVars onto SkillGraphNodes", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ ok: true, applied: true, steps: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const { nodes } = await deployFromPlan("sb-1", "Test Agent", "desc", basePlan);
    expect(nodes[0].depends_on).toEqual([]);
    expect(nodes[0].requires_env).toContain("GOOGLE_ADS_TOKEN");
    expect(nodes[1].depends_on).toContain("campaign-fetch");
  });

  test("returns ok:false when backend returns non-ok status", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ detail: "Sandbox not ready" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const { result } = await deployFromPlan("sb-1", "My Agent", "desc", basePlan);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("Sandbox not ready");
    expect(result.nodes).toBeUndefined(); // result.nodes is on the outer object
  });

  test("uses provided soulContent override instead of generating", async () => {
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ ok: true, applied: true, steps: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const planWithSoul = { ...basePlan, soulContent: "# Custom Soul Content" };
    await deployFromPlan("sb-1", "My Agent", "desc", planWithSoul);
    expect(capturedBody.soul_content).toBe("# Custom Soul Content");
  });

  test("workflow has correct wait_for chains for sequential steps", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ ok: true, applied: true, steps: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const { workflow } = await deployFromPlan("sb-1", "My Agent", "desc", basePlan);
    expect(workflow.steps[0].wait_for).toEqual([]);
    expect(workflow.steps[1].wait_for).toContain("campaign-fetch");
  });

  test("returns ok:false with status code detail when server returns non-JSON", async () => {
    globalThis.fetch = mock(async () =>
      new Response("Bad Gateway", { status: 502, headers: { "content-type": "text/plain" } }),
    ) as typeof fetch;

    const { result } = await deployFromPlan("sb-1", "My Agent", "desc", basePlan);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("502");
  });
});
