import { describe, it, test, expect, mock } from "bun:test";

mock.module("./api", () => ({
  sendToArchitectStreaming: mock(async (_sessionId: string, _prompt: string, callbacks: Record<string, unknown>) => {
    if (typeof callbacks?.onDelta === "function") {
      (callbacks.onDelta as (t: string) => void)('[{"title":"Test Scenario","input":"Do this","expectedBehavior":"Agent does this"}]');
    }
    return {
      content: '[{"title":"Test Scenario","input":"Do this","expectedBehavior":"Agent does this"}]',
    };
  }),
}));

import { generateDeterministicScenarios, generateLLMScenarios } from "./eval-scenario-generator";
import type { SkillGraphNode, WorkflowDefinition } from "./types";

const GOOGLE_ADS_SKILLS: SkillGraphNode[] = [
  {
    skill_id: "campaign-performance",
    name: "Campaign Performance",
    source: "custom",
    status: "built",
    depends_on: [],
    description: "Fetch campaign performance data from Google Ads API",
    external_api: "Google Ads API",
    requires_env: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"],
  },
  {
    skill_id: "ad-group-optimizer",
    name: "Ad Group Optimizer",
    source: "custom",
    status: "built",
    depends_on: ["campaign-performance"],
    description: "Analyze and optimize ad group performance",
  },
  {
    skill_id: "budget-manager",
    name: "Budget Manager",
    source: "custom",
    status: "built",
    depends_on: [],
    description: "Manage campaign budgets and bid strategies",
  },
];

const WORKFLOW: WorkflowDefinition = {
  name: "Google Ads Management",
  description: "End-to-end campaign management",
  steps: [
    { id: "step-1", action: "analyze", skill: "campaign-performance", wait_for: [] },
    { id: "step-2", action: "optimize", skill: "ad-group-optimizer", wait_for: ["step-1"] },
    { id: "step-3", action: "adjust", skill: "budget-manager", wait_for: ["step-2"] },
  ],
};

const GOOGLE_ADS_SKILLS_TYPED = GOOGLE_ADS_SKILLS;

describe("generateDeterministicScenarios", () => {
  it("generates one scenario per skill", () => {
    const tasks = generateDeterministicScenarios({
      skillGraph: GOOGLE_ADS_SKILLS,
      workflow: null,
      agentRules: [],
      discoveryDocuments: null,
      architecturePlan: null,
    });

    const skillTasks = tasks.filter((t) => t.title.startsWith("Exercise:"));
    expect(skillTasks.length).toBe(3);
    expect(skillTasks[0].title).toContain("Campaign Performance");
    expect(skillTasks[0].expectedBehavior).toContain("campaign-performance");
  });

  it("generates workflow scenario when workflow has multiple steps", () => {
    const tasks = generateDeterministicScenarios({
      skillGraph: GOOGLE_ADS_SKILLS,
      workflow: WORKFLOW,
      agentRules: [],
      discoveryDocuments: null,
      architecturePlan: null,
    });

    const wfTask = tasks.find((t) => t.id === "eval-auto-workflow");
    expect(wfTask).toBeDefined();
    expect(wfTask!.title).toBe("Multi-step workflow execution");
    expect(wfTask!.input).toContain("Campaign Performance");
  });

  it("always includes out-of-scope and error handling scenarios", () => {
    const tasks = generateDeterministicScenarios({
      skillGraph: [],
      workflow: null,
      agentRules: [],
      discoveryDocuments: null,
      architecturePlan: null,
    });

    expect(tasks.find((t) => t.id === "eval-auto-oos")).toBeDefined();
    expect(tasks.find((t) => t.id === "eval-auto-error")).toBeDefined();
    expect(tasks.length).toBe(2); // just oos + error when no skills
  });

  it("includes env var info in expected behavior", () => {
    const tasks = generateDeterministicScenarios({
      skillGraph: GOOGLE_ADS_SKILLS,
      workflow: null,
      agentRules: [],
      discoveryDocuments: null,
      architecturePlan: null,
    });

    const campTask = tasks.find((t) => t.title.includes("Campaign Performance"));
    expect(campTask!.expectedBehavior).toContain("GOOGLE_ADS_DEVELOPER_TOKEN");
  });

  it("caps at 5 skill scenarios", () => {
    const manySkills = Array.from({ length: 10 }, (_, i) => ({
      skill_id: `skill-${i}`,
      name: `Skill ${i}`,
      source: "custom" as const,
      status: "built" as const,
      depends_on: [],
      description: `Does thing ${i}`,
    }));

    const tasks = generateDeterministicScenarios({
      skillGraph: manySkills,
      workflow: null,
      agentRules: [],
      discoveryDocuments: null,
      architecturePlan: null,
    });

    const skillTasks = tasks.filter((t) => t.title.startsWith("Exercise:"));
    expect(skillTasks.length).toBe(5);
  });

  it("filters out rejected skills", () => {
    const skills = [
      { skill_id: "active", name: "Active Skill", source: "custom" as const, status: "built" as const, depends_on: [], description: "Active" },
      { skill_id: "rejected", name: "Rejected Skill", source: "custom" as const, status: "rejected" as const, depends_on: [], description: "Rejected" },
    ];
    const tasks = generateDeterministicScenarios({
      skillGraph: skills,
      workflow: null,
      agentRules: [],
      discoveryDocuments: null,
      architecturePlan: null,
    });
    const skillTasks = tasks.filter((t) => t.title.startsWith("Exercise:"));
    expect(skillTasks).toHaveLength(1);
    expect(skillTasks[0].title).toContain("Active Skill");
  });

  it("does not generate workflow scenario for single-step workflow", () => {
    const singleStepWorkflow: WorkflowDefinition = {
      name: "Single Step",
      description: "One step",
      steps: [{ id: "step-1", action: "run", skill: "campaign-performance", wait_for: [] }],
    };
    const tasks = generateDeterministicScenarios({
      skillGraph: GOOGLE_ADS_SKILLS,
      workflow: singleStepWorkflow,
      agentRules: [],
      discoveryDocuments: null,
      architecturePlan: null,
    });
    expect(tasks.find((t) => t.id === "eval-auto-workflow")).toBeUndefined();
  });

  it("includes agent rule hint in out-of-scope scenario", () => {
    const tasks = generateDeterministicScenarios({
      skillGraph: [],
      workflow: null,
      agentRules: ["Only respond to Google Ads related questions"],
      discoveryDocuments: null,
      architecturePlan: null,
    });
    const oos = tasks.find((t) => t.id === "eval-auto-oos");
    expect(oos?.expectedBehavior).toContain("Only respond to Google Ads");
  });

  it("resolves skill name from workflow step or falls back to skill_id", () => {
    const workflow: WorkflowDefinition = {
      name: "Multi-step",
      description: "Multi-step workflow",
      steps: [
        { id: "step-1", action: "analyze", skill: "campaign-performance", wait_for: [] },
        { id: "step-2", action: "optimize", skill: "unknown-skill-id", wait_for: ["step-1"] },
      ],
    };
    const tasks = generateDeterministicScenarios({
      skillGraph: GOOGLE_ADS_SKILLS,
      workflow,
      agentRules: [],
      discoveryDocuments: null,
      architecturePlan: null,
    });
    const wf = tasks.find((t) => t.id === "eval-auto-workflow");
    expect(wf).toBeDefined();
    expect(wf!.input).toContain("Campaign Performance");
    expect(wf!.input).toContain("unknown-skill-id");
  });
});

describe("generateLLMScenarios", () => {
  test("returns parsed scenarios from LLM response", async () => {
    const tasks = await generateLLMScenarios("session-123", {
      skillGraph: GOOGLE_ADS_SKILLS,
      agentRules: [],
      discoveryDocuments: null,
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Test Scenario");
    expect(tasks[0].input).toBe("Do this");
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].id).toMatch(/^eval-llm-/);
  });

  test("returns empty array when LLM response is not parseable", async () => {
    const { sendToArchitectStreaming } = await import("./api");
    (sendToArchitectStreaming as ReturnType<typeof mock>).mockResolvedValueOnce({
      content: "This is not JSON",
    });
    const tasks = await generateLLMScenarios("session-456", {
      skillGraph: [],
      agentRules: [],
      discoveryDocuments: null,
    });
    expect(tasks).toEqual([]);
  });

  test("builds generation prompt with PRD summary when discoveryDocuments provided", async () => {
    const capturedPrompts: string[] = [];
    const { sendToArchitectStreaming } = await import("./api");
    (sendToArchitectStreaming as ReturnType<typeof mock>).mockImplementationOnce(
      async (_id: string, prompt: string, callbacks: Record<string, unknown>) => {
        capturedPrompts.push(prompt);
        return { content: "[]" };
      }
    );
    await generateLLMScenarios("session-789", {
      skillGraph: GOOGLE_ADS_SKILLS,
      agentRules: ["Be helpful"],
      discoveryDocuments: {
        prd: {
          id: "prd1",
          title: "PRD",
          sections: [{ heading: "Overview", content: "Google Ads optimization platform" }],
        } as any,
        trd: null as any,
      },
    });
    expect(capturedPrompts[0]).toContain("Be helpful");
    expect(capturedPrompts[0]).toContain("Google Ads optimization platform");
  });
});
