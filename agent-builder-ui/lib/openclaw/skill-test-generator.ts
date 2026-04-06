/**
 * skill-test-generator.ts — Generates smoke test cases from skill metadata.
 *
 * After the Build stage creates skills, we analyze each skill's name,
 * description, tool_type, and environment requirements to produce
 * realistic test prompts that a real user would type. These are
 * automatically run before advancing to the Review stage.
 */

import type { SkillGraphNode, EvalTask } from "./types";

// ── Public types ───────────────────────────────────────────────────────────

export interface SkillTestCase {
  id: string;
  skillId: string;
  skillName: string;
  testType: "smoke" | "integration" | "edge-case";
  input: string;
  expectedBehavior: string;
  timeout: number;
  needsConfig: boolean;
  missingEnv?: string[];
  validateFn?: (response: string) => { pass: boolean; reason: string };
}

// ── Domain keyword maps for generating realistic prompts ───────────────────

interface DomainHint {
  keywords: string[];
  prompts: string[];
  expectations: string[];
}

const DOMAIN_HINTS: DomainHint[] = [
  {
    keywords: ["weather", "forecast", "temperature", "climate"],
    prompts: [
      "What's the weather like in London right now?",
      "Give me the 3-day forecast for San Francisco",
      "What's the temperature in Tokyo today?",
    ],
    expectations: [
      "response contains temperature, conditions, or forecast data",
      "response mentions a specific location and weather details",
    ],
  },
  {
    keywords: ["email", "mail", "send", "inbox", "compose"],
    prompts: [
      "Draft an email to team@example.com about the Q4 project status update",
      "Compose a follow-up email to sarah@example.com about the meeting notes",
      "Write a professional email declining a meeting invitation for next Thursday",
    ],
    expectations: [
      "response contains email-like structure with subject, greeting, body, and sign-off",
      "response mentions the recipient or topic specified in the prompt",
    ],
  },
  {
    keywords: ["slack", "message", "channel", "notify", "notification"],
    prompts: [
      "Send a status update to the #engineering channel about the deployment",
      "Post a message to #general saying the weekly standup is moved to 3pm",
      "Notify the #ops channel that the database migration completed successfully",
    ],
    expectations: [
      "response confirms message delivery or indicates the channel was targeted",
      "response references the message content or channel name",
    ],
  },
  {
    keywords: ["csv", "spreadsheet", "excel", "data", "table", "report"],
    prompts: [
      "Read the sales data file and show me the top 5 performing regions",
      "Analyze the Q3 report and summarize the key metrics",
      "Show me the first 5 rows of the customer data with column headers",
    ],
    expectations: [
      "response contains structured data like tables, lists, or numeric summaries",
      "response references specific data points or columns from the input",
    ],
  },
  {
    keywords: ["calendar", "schedule", "event", "meeting", "appointment"],
    prompts: [
      "What meetings do I have scheduled for tomorrow?",
      "Schedule a 30-minute call with the product team for next Tuesday at 2pm",
      "Show me my availability for the rest of the week",
    ],
    expectations: [
      "response references specific times, dates, or calendar events",
      "response provides scheduling information or confirms an action",
    ],
  },
  {
    keywords: ["search", "find", "lookup", "query", "retrieve"],
    prompts: [
      "Find the most recent customer tickets about payment failures",
      "Search for documentation about the authentication API",
      "Look up the latest performance metrics for the main dashboard",
    ],
    expectations: [
      "response returns relevant results or references to found items",
      "response addresses the search query with specific matches",
    ],
  },
  {
    keywords: ["ads", "campaign", "google ads", "advertising", "budget", "keyword"],
    prompts: [
      "Show me the performance of my active Google Ads campaigns this week",
      "What's the current budget utilization across all ad groups?",
      "List the top 5 keywords by click-through rate in the main campaign",
    ],
    expectations: [
      "response contains campaign metrics like impressions, clicks, CTR, or spend",
      "response references specific campaigns, ad groups, or keyword data",
    ],
  },
  {
    keywords: ["database", "sql", "query", "record", "crud"],
    prompts: [
      "Show me the 10 most recently created user accounts",
      "How many orders were placed in the last 24 hours?",
      "List the active subscriptions that expire this month",
    ],
    expectations: [
      "response contains structured data or record counts",
      "response addresses the specific query with relevant data",
    ],
  },
  {
    keywords: ["file", "read", "write", "upload", "download", "storage"],
    prompts: [
      "Read the configuration file and show me the current settings",
      "List the files in the project workspace directory",
      "Show me the contents of the README file",
    ],
    expectations: [
      "response contains file content or directory listing",
      "response demonstrates file system interaction",
    ],
  },
  {
    keywords: ["translate", "language", "i18n", "localize"],
    prompts: [
      'Translate "Thank you for your order" to Spanish, French, and German',
      "Help me write this error message in Japanese: 'Please try again later'",
      "What does 'Bitte warten' mean in English?",
    ],
    expectations: [
      "response contains translated text in the requested language(s)",
      "response provides accurate translation with context",
    ],
  },
  {
    keywords: ["image", "photo", "screenshot", "visual", "generate"],
    prompts: [
      "Describe what you see in the uploaded product screenshot",
      "Generate a thumbnail description for the team photo",
      "Analyze the chart image and extract the key data points",
    ],
    expectations: [
      "response references visual elements or image content",
      "response provides meaningful analysis of visual input",
    ],
  },
  {
    keywords: ["code", "programming", "debug", "refactor", "review"],
    prompts: [
      "Review this function for potential bugs and suggest improvements",
      "Help me debug why the API endpoint returns a 500 error",
      "Refactor this code to follow the repository's coding standards",
    ],
    expectations: [
      "response contains code analysis, suggestions, or corrected code",
      "response addresses specific programming concerns",
    ],
  },
];

// ── Matching logic ─────────────────────────────────────────────────────────

function matchDomain(skill: SkillGraphNode): DomainHint | null {
  const text = [
    skill.name,
    skill.skill_id,
    skill.description ?? "",
    skill.external_api ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let bestMatch: DomainHint | null = null;
  let bestScore = 0;

  for (const hint of DOMAIN_HINTS) {
    const score = hint.keywords.reduce(
      (acc, kw) => acc + (text.includes(kw) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestMatch = hint;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Tool-type specific tests ───────────────────────────────────────────────

function apiConnectivityTest(skill: SkillGraphNode, index: number): SkillTestCase {
  const api = skill.external_api ?? "the configured API";
  return {
    id: `skill-smoke-${index}`,
    skillId: skill.skill_id,
    skillName: skill.name,
    testType: "smoke",
    input: `Check the connection to ${api} and confirm it's reachable`,
    expectedBehavior: `Agent attempts to connect to ${api} and reports status. May report success or indicate missing credentials if API key is not configured.`,
    timeout: 30_000,
    needsConfig: (skill.requires_env?.length ?? 0) > 0,
    missingEnv: skill.requires_env,
    validateFn: (response: string) => {
      const lower = response.toLowerCase();
      const hasStatus =
        lower.includes("connect") ||
        lower.includes("reach") ||
        lower.includes("status") ||
        lower.includes("api") ||
        lower.includes("key") ||
        lower.includes("credential") ||
        lower.includes("success") ||
        lower.includes("configured");
      return {
        pass: hasStatus && response.length > 30,
        reason: hasStatus
          ? "Response addresses API connectivity"
          : "Response does not mention API connectivity status",
      };
    },
  };
}

function fileOperationTest(skill: SkillGraphNode, index: number): SkillTestCase {
  return {
    id: `skill-smoke-${index}`,
    skillId: skill.skill_id,
    skillName: skill.name,
    testType: "smoke",
    input: `List the files in the workspace that ${skill.name} can access`,
    expectedBehavior: `Agent lists accessible files or directories, demonstrating file system access for the ${skill.name} skill.`,
    timeout: 20_000,
    needsConfig: false,
    validateFn: (response: string) => {
      const hasFileRef =
        response.includes("/") ||
        response.includes(".") ||
        response.toLowerCase().includes("file") ||
        response.toLowerCase().includes("directory") ||
        response.toLowerCase().includes("workspace");
      return {
        pass: hasFileRef && response.length > 20,
        reason: hasFileRef
          ? "Response references file system paths or workspace"
          : "Response does not reference any files or directories",
      };
    },
  };
}

// ── Core generator ─────────────────────────────────────────────────────────

function generateTestsForSkill(
  skill: SkillGraphNode,
  agentName: string,
  startIndex: number,
): SkillTestCase[] {
  // Skip rejected or always-included skills (they're infrastructure, not user-facing)
  if (skill.status === "rejected") return [];

  const tests: SkillTestCase[] = [];
  let idx = startIndex;
  const needsConfig = (skill.requires_env?.length ?? 0) > 0;

  // 1. Domain-specific smoke test (realistic user prompt)
  const domain = matchDomain(skill);

  if (domain) {
    const prompt = pickRandom(domain.prompts);
    const expectation = pickRandom(domain.expectations);

    tests.push({
      id: `skill-smoke-${idx++}`,
      skillId: skill.skill_id,
      skillName: skill.name,
      testType: "smoke",
      input: prompt,
      expectedBehavior: `Agent uses the ${skill.name} skill to respond. Expected: ${expectation}.${needsConfig ? ` Note: requires ${skill.requires_env!.join(", ")} — may respond with config guidance if not set.` : ""}`,
      timeout: 30_000,
      needsConfig,
      missingEnv: skill.requires_env,
      validateFn: createDomainValidator(skill, domain),
    });
  } else {
    // Fallback: derive prompt from skill description
    const desc = skill.description ?? skill.name;
    const normalizedDesc =
      desc.charAt(0).toLowerCase() + desc.slice(1).replace(/\.$/, "");

    tests.push({
      id: `skill-smoke-${idx++}`,
      skillId: skill.skill_id,
      skillName: skill.name,
      testType: "smoke",
      input: `I need help with this: ${normalizedDesc}. Can you walk me through it?`,
      expectedBehavior: `Agent engages with the request using the ${skill.name} skill. Provides a substantive response that demonstrates understanding of the skill's purpose.${needsConfig ? ` May request configuration for ${skill.requires_env!.join(", ")}.` : ""}`,
      timeout: 30_000,
      needsConfig,
      missingEnv: skill.requires_env,
      validateFn: createGenericValidator(skill),
    });
  }

  // 2. Tool-type specific test (connectivity / file access)
  if (skill.tool_type === "api" && skill.external_api) {
    tests.push(apiConnectivityTest(skill, idx++));
  } else if (
    skill.tool_type === "cli" ||
    skill.name.toLowerCase().includes("file") ||
    skill.name.toLowerCase().includes("read") ||
    skill.name.toLowerCase().includes("write") ||
    skill.name.toLowerCase().includes("csv") ||
    skill.name.toLowerCase().includes("spreadsheet")
  ) {
    tests.push(fileOperationTest(skill, idx++));
  }

  return tests;
}

// ── Validators ─────────────────────────────────────────────────────────────

function createDomainValidator(
  skill: SkillGraphNode,
  domain: DomainHint,
): (response: string) => { pass: boolean; reason: string } {
  return (response: string) => {
    const lower = response.toLowerCase();

    // If env vars are needed, accepting a config guidance response is valid
    if (skill.requires_env?.length) {
      const configResponse =
        lower.includes("api key") ||
        lower.includes("credential") ||
        lower.includes("configure") ||
        lower.includes("environment") ||
        lower.includes("not set") ||
        lower.includes("missing");
      if (configResponse) {
        return {
          pass: true,
          reason: "Agent correctly identifies missing configuration",
        };
      }
    }

    // Check for domain-relevant content
    const hasKeywords = domain.keywords.some((kw) => lower.includes(kw));
    const isSubstantive = response.length > 50;
    const isNotError =
      !lower.includes("i cannot") &&
      !lower.includes("i'm unable") &&
      !lower.includes("error occurred");

    if (hasKeywords && isSubstantive) {
      return { pass: true, reason: "Response contains domain-relevant content" };
    }

    if (isSubstantive && isNotError) {
      return {
        pass: true,
        reason: "Response is substantive (domain keywords not required for pass)",
      };
    }

    return {
      pass: false,
      reason: `Response is ${isSubstantive ? "substantive but off-topic" : "too short"} — expected ${skill.name} domain content`,
    };
  };
}

function createGenericValidator(
  skill: SkillGraphNode,
): (response: string) => { pass: boolean; reason: string } {
  return (response: string) => {
    const lower = response.toLowerCase();

    // Config guidance is valid when env vars are needed
    if (skill.requires_env?.length) {
      const configResponse =
        lower.includes("api key") ||
        lower.includes("credential") ||
        lower.includes("configure") ||
        lower.includes("environment") ||
        lower.includes("not set");
      if (configResponse) {
        return {
          pass: true,
          reason: "Agent correctly identifies missing configuration",
        };
      }
    }

    // Heuristic: substantive, non-error response
    const isSubstantive = response.length > 50;
    const isError =
      lower.includes("error occurred") ||
      lower.includes("something went wrong") ||
      lower.includes("internal error");

    if (isSubstantive && !isError) {
      return { pass: true, reason: "Agent provided a substantive response" };
    }

    if (isError) {
      return { pass: false, reason: "Agent returned an error response" };
    }

    return {
      pass: false,
      reason: `Response too short (${response.length} chars) — expected substantive engagement`,
    };
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate smoke test cases from skill metadata.
 *
 * For each skill, produces 1-2 test cases with domain-specific prompts,
 * tool-type connectivity checks, and realistic validation functions.
 */
export function generateSkillTests(
  skills: SkillGraphNode[],
  agentName: string,
): SkillTestCase[] {
  const tests: SkillTestCase[] = [];
  let indexCounter = 1;

  for (const skill of skills) {
    const skillTests = generateTestsForSkill(skill, agentName, indexCounter);
    tests.push(...skillTests);
    indexCounter += skillTests.length;
  }

  return tests;
}

/**
 * Convert SkillTestCases to EvalTasks for integration with the existing
 * copilot store and LifecycleStepRenderer.
 */
export function skillTestsToEvalTasks(tests: SkillTestCase[]): EvalTask[] {
  return tests.map((test) => ({
    id: test.id,
    title: `${test.testType === "smoke" ? "Smoke" : "Integration"}: ${test.skillName}`,
    input: test.input,
    expectedBehavior: test.expectedBehavior,
    status: test.needsConfig ? "manual" : "pending",
  }));
}
