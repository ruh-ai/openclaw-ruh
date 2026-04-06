import { describe, test, expect } from "bun:test";
import {
  generateSkillTests,
  skillTestsToEvalTasks,
  type SkillTestCase,
} from "./skill-test-generator";
import type { SkillGraphNode } from "./types";

// ── Test helpers ───────────────────────────────────────────────────────────

function makeSkill(overrides: Partial<SkillGraphNode> = {}): SkillGraphNode {
  return {
    skill_id: "test_skill",
    name: "Test Skill",
    source: "custom",
    status: "generated",
    depends_on: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("generateSkillTests", () => {
  test("generates at least one test per skill", () => {
    const skills: SkillGraphNode[] = [
      makeSkill({ skill_id: "weather", name: "Weather Fetcher", description: "Fetch weather data for a given city" }),
      makeSkill({ skill_id: "email", name: "Email Sender", description: "Send emails to recipients" }),
    ];

    const tests = generateSkillTests(skills, "Test Agent");
    expect(tests.length).toBeGreaterThanOrEqual(2);
    expect(tests.some((t) => t.skillId === "weather")).toBe(true);
    expect(tests.some((t) => t.skillId === "email")).toBe(true);
  });

  test("generates domain-specific prompts for weather skill", () => {
    const skills = [makeSkill({
      skill_id: "weather_fetcher",
      name: "Weather Fetcher",
      description: "Fetch current weather and forecasts",
    })];

    const tests = generateSkillTests(skills, "Weather Agent");
    const weatherTest = tests.find((t) => t.skillId === "weather_fetcher");
    expect(weatherTest).toBeDefined();
    // Should NOT use generic "test skill X" language
    expect(weatherTest!.input.toLowerCase()).not.toContain("test skill");
    // Should contain weather-related content
    const input = weatherTest!.input.toLowerCase();
    expect(
      input.includes("weather") ||
      input.includes("forecast") ||
      input.includes("temperature"),
    ).toBe(true);
  });

  test("generates domain-specific prompts for Google Ads skill", () => {
    const skills = [makeSkill({
      skill_id: "google_ads_manager",
      name: "Google Ads Campaign Manager",
      description: "Manage Google Ads campaigns, budgets, and keyword performance",
    })];

    const tests = generateSkillTests(skills, "Google Ads Agent");
    const adsTest = tests.find((t) => t.skillId === "google_ads_manager");
    expect(adsTest).toBeDefined();
    const input = adsTest!.input.toLowerCase();
    expect(
      input.includes("campaign") ||
      input.includes("ads") ||
      input.includes("budget") ||
      input.includes("keyword"),
    ).toBe(true);
  });

  test("marks skills with requires_env as needsConfig", () => {
    const skills = [makeSkill({
      skill_id: "slack_notifier",
      name: "Slack Notifier",
      description: "Send notifications to Slack channels",
      requires_env: ["SLACK_BOT_TOKEN", "SLACK_CHANNEL"],
    })];

    const tests = generateSkillTests(skills, "Notification Agent");
    const slackTest = tests.find((t) => t.skillId === "slack_notifier");
    expect(slackTest).toBeDefined();
    expect(slackTest!.needsConfig).toBe(true);
    expect(slackTest!.missingEnv).toEqual(["SLACK_BOT_TOKEN", "SLACK_CHANNEL"]);
  });

  test("generates API connectivity test for api tool_type skills", () => {
    const skills = [makeSkill({
      skill_id: "stripe_payments",
      name: "Stripe Payments",
      description: "Process payments via Stripe",
      tool_type: "api",
      external_api: "Stripe API",
    })];

    const tests = generateSkillTests(skills, "Payment Agent");
    const connectivityTest = tests.find(
      (t) => t.skillId === "stripe_payments" && t.input.toLowerCase().includes("connect"),
    );
    expect(connectivityTest).toBeDefined();
    expect(connectivityTest!.input).toContain("Stripe API");
  });

  test("generates file operation test for file-related skills", () => {
    const skills = [makeSkill({
      skill_id: "csv_processor",
      name: "CSV Processor",
      description: "Read and process CSV files",
    })];

    const tests = generateSkillTests(skills, "Data Agent");
    const fileTest = tests.find(
      (t) => t.skillId === "csv_processor" && t.input.toLowerCase().includes("file"),
    );
    expect(fileTest).toBeDefined();
  });

  test("skips rejected skills", () => {
    const skills = [
      makeSkill({ skill_id: "active", name: "Active Skill", status: "generated" }),
      makeSkill({ skill_id: "rejected", name: "Rejected Skill", status: "rejected" }),
    ];

    const tests = generateSkillTests(skills, "Agent");
    expect(tests.some((t) => t.skillId === "rejected")).toBe(false);
    expect(tests.some((t) => t.skillId === "active")).toBe(true);
  });

  test("falls back to description-based prompt for unknown domains", () => {
    const skills = [makeSkill({
      skill_id: "quantum_sim",
      name: "Quantum Simulator",
      description: "Simulate quantum circuits and qubit states",
    })];

    const tests = generateSkillTests(skills, "Quantum Agent");
    expect(tests.length).toBeGreaterThanOrEqual(1);
    const test = tests[0];
    // Should derive from description, not be a generic "test skill"
    expect(test.input.toLowerCase()).toContain("quantum");
  });

  test("all generated tests have validateFn", () => {
    const skills = [
      makeSkill({ skill_id: "a", name: "Weather", description: "Get weather" }),
      makeSkill({ skill_id: "b", name: "Custom Thing", description: "Do something custom" }),
    ];

    const tests = generateSkillTests(skills, "Agent");
    for (const test of tests) {
      expect(test.validateFn).toBeDefined();
    }
  });
});

describe("skillTestsToEvalTasks", () => {
  test("converts SkillTestCases to EvalTask format", () => {
    const tests: SkillTestCase[] = [
      {
        id: "skill-smoke-1",
        skillId: "weather",
        skillName: "Weather Fetcher",
        testType: "smoke",
        input: "What's the weather in London?",
        expectedBehavior: "Returns temperature and conditions",
        timeout: 30000,
        needsConfig: false,
      },
    ];

    const evalTasks = skillTestsToEvalTasks(tests);
    expect(evalTasks).toHaveLength(1);
    expect(evalTasks[0].id).toBe("skill-smoke-1");
    expect(evalTasks[0].title).toContain("Smoke");
    expect(evalTasks[0].title).toContain("Weather Fetcher");
    expect(evalTasks[0].input).toBe("What's the weather in London?");
    expect(evalTasks[0].status).toBe("pending");
  });

  test("marks needsConfig tests as manual", () => {
    const tests: SkillTestCase[] = [
      {
        id: "skill-smoke-1",
        skillId: "slack",
        skillName: "Slack",
        testType: "smoke",
        input: "Send a message",
        expectedBehavior: "Sends message",
        timeout: 30000,
        needsConfig: true,
        missingEnv: ["SLACK_TOKEN"],
      },
    ];

    const evalTasks = skillTestsToEvalTasks(tests);
    expect(evalTasks[0].status).toBe("manual");
  });
});

describe("validateFn behavior", () => {
  test("weather validator passes on temperature mention", () => {
    const skills = [makeSkill({
      skill_id: "weather",
      name: "Weather",
      description: "Get weather forecasts",
    })];

    const tests = generateSkillTests(skills, "Agent");
    const test = tests[0];
    expect(test.validateFn).toBeDefined();

    const result = test.validateFn!(
      "The current weather in London is 15°C with partly cloudy skies. Expect rain later this afternoon with temperatures dropping to 12°C.",
    );
    expect(result.pass).toBe(true);
  });

  test("validator fails on very short response", () => {
    const skills = [makeSkill({
      skill_id: "weather",
      name: "Weather",
      description: "Get weather forecasts",
    })];

    const tests = generateSkillTests(skills, "Agent");
    const test = tests[0];
    const result = test.validateFn!("OK");
    expect(result.pass).toBe(false);
  });

  test("validator passes on config guidance when env vars needed", () => {
    const skills = [makeSkill({
      skill_id: "slack",
      name: "Slack Sender",
      description: "Send messages to Slack",
      requires_env: ["SLACK_TOKEN"],
    })];

    const tests = generateSkillTests(skills, "Agent");
    const test = tests.find((t) => t.skillId === "slack");
    expect(test).toBeDefined();

    const result = test!.validateFn!(
      "I need the SLACK_TOKEN API key to be configured before I can send messages. Please set the environment variable and try again.",
    );
    expect(result.pass).toBe(true);
  });

  test("API connectivity validator checks for connection-related words", () => {
    const skills = [makeSkill({
      skill_id: "stripe",
      name: "Stripe",
      description: "Process payments",
      tool_type: "api",
      external_api: "Stripe API",
    })];

    const tests = generateSkillTests(skills, "Agent");
    const connectTest = tests.find((t) => t.input.toLowerCase().includes("connect"));
    expect(connectTest).toBeDefined();

    const result = connectTest!.validateFn!(
      "Successfully connected to the Stripe API. The API key is valid and the account is active.",
    );
    expect(result.pass).toBe(true);
  });
});
