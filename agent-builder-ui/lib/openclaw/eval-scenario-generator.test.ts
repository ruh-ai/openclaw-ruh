import { describe, it, expect } from "vitest";
import { generateDeterministicScenarios } from "./eval-scenario-generator";
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
});
