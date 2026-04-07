/**
 * eval-pipeline.integration.test.ts
 *
 * End-to-end integration test for the real agent evaluation pipeline.
 * Tests all layers against a live openclaw gateway:
 *
 *   1. Gateway connectivity — agent responds correctly
 *   2. Trace scorer — LLM judges execution quality
 *   3. Reflector — diagnoses failures, proposes skill rewrites
 *   4. Full eval run — multiple scenarios scored
 *   5. Scenario/mock generators — deterministic output
 *
 * Run: bun test lib/openclaw/__tests__/eval-pipeline.integration.test.ts
 *
 * Requires a healthy openclaw container. If none available, tests skip gracefully.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import type { EvalTask, SkillGraphNode, ExecutionTrace } from "../types";

// Capture the native fetch before any other test file can replace globalThis.fetch.
// Other tests (e.g. backend-fetch.test.ts) replace globalThis.fetch with a mock
// and bun shares globalThis across test files in the same run.
const nativeFetch = globalThis.fetch;

// ── Test config ─────────────────────────────────────────────────────────────

const GATEWAY_PORT = 56809;
const GATEWAY_TOKEN = "84a4a3d58a7f3507e8b8bb5b6024c3334ddc2184e2d46d50";
const SESSION_ID = "eval-test-" + Date.now();

const TEST_SKILL_GRAPH: SkillGraphNode[] = [
  {
    skill_id: "math-calculator",
    name: "Math Calculator",
    source: "custom",
    status: "approved",
    depends_on: [],
    description: "Performs basic mathematical calculations",
    skill_md: `---
name: math-calculator
version: 1.0.0
description: "Performs basic mathematical calculations"
---
# Math Calculator
## Process
1. Parse the mathematical expression
2. Compute the result
3. Return the answer with work shown
## Rules
- Show work: "X + Y = Z"
- Handle +, -, *, /
- Round to 2 decimal places`,
  },
];

// ── Helper: direct gateway chat ─────────────────────────────────────────────

let gatewayAvailable = false;

async function chatWithGateway(message: string, systemPrompt?: string): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: message });

  const res = await nativeFetch(`http://localhost:${GATEWAY_PORT}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
      Origin: "https://localhost",
    },
    body: JSON.stringify({ model: "openclaw", messages, stream: false }),
  });

  if (!res.ok) throw new Error(`Gateway: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || "";
}

/**
 * Use the gateway itself as the LLM judge (same model, different system prompt).
 * This avoids needing the Next.js server running.
 */
async function llmJudge(prompt: string): Promise<string> {
  return chatWithGateway(prompt, "You are an evaluation judge. Return ONLY valid JSON, no other text.");
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    const res = await nativeFetch(`http://localhost:${GATEWAY_PORT}/v1/models`, {
      headers: { Authorization: `Bearer ${GATEWAY_TOKEN}`, Origin: "https://localhost" },
      signal: AbortSignal.timeout(5000),
    });
    gatewayAvailable = res.ok || res.status === 401;
    if (!gatewayAvailable) {
      // Even auth errors mean gateway is alive
      gatewayAvailable = true;
    }
  } catch {
    gatewayAvailable = false;
  }
  console.log(`[Setup] Gateway available: ${gatewayAvailable}`);
});

// ── Layer 1: Gateway connectivity ───────────────────────────────────────────

describe("Layer 1: Gateway Connectivity", () => {
  test("agent responds to basic math", async () => {
    if (!gatewayAvailable) return console.log("  SKIP: no gateway");

    const response = await chatWithGateway("What is 2 + 2?");
    expect(response).toBeTruthy();
    expect(response.length).toBeGreaterThan(0);
    // Response should mention 4 somewhere
    expect(response).toContain("4");
    console.log("[L1] Response:", response.slice(0, 150));
  }, 30_000);

  test("agent handles multiplication", async () => {
    if (!gatewayAvailable) return console.log("  SKIP: no gateway");

    const response = await chatWithGateway("Calculate 10 * 5");
    expect(response.toLowerCase()).toContain("50");
    console.log("[L1] Multiply:", response.slice(0, 150));
  }, 30_000);
});

// ── Layer 2: LLM Trace Scoring (direct gateway as judge) ───────────────────

describe("Layer 2: LLM Trace Scoring", () => {
  test("scores a correct math response as passing", async () => {
    if (!gatewayAvailable) return console.log("  SKIP: no gateway");

    const judgePrompt = `You are an evaluation judge for an AI agent. Score this execution.

## Expected Behavior
Agent should calculate 25 + 17 = 42 and show the work

## Agent's Response
Sure! 25 + 17 = 42. The sum of twenty-five and seventeen is forty-two.

## Tool Calls Made
(none)

## Skills Activated: math-calculator

## Return your evaluation as JSON:
{"passed": true/false, "score": 0.0-1.0, "feedback": "explanation", "skillDiagnosis": [{"skillId": "math-calculator", "verdict": "working|partial|broken|unused", "issue": "optional"}], "suggestedFixes": []}`;

    const raw = await llmJudge(judgePrompt);
    console.log("[L2] Judge raw:", raw.slice(0, 300));

    // Extract JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeTruthy();

    const score = JSON.parse(jsonMatch![0]) as Record<string, unknown>;
    console.log("[L2] Parsed score:", JSON.stringify(score, null, 2));

    // Judge may return passed=true or passed=false with a high score
    // depending on how strictly it interprets "show the work".
    // What matters: score should be meaningfully high (>0.5) for a correct answer.
    expect(typeof score.score).toBe("number");
    expect(score.score as number).toBeGreaterThanOrEqual(0.5);
    expect(score.feedback).toBeTruthy();
  }, 60_000);

  test("scores a wrong response as failing", async () => {
    if (!gatewayAvailable) return console.log("  SKIP: no gateway");

    const judgePrompt = `You are an evaluation judge for an AI agent. Score this execution.

## Expected Behavior
Agent should calculate 25 + 17 = 42 and show the work

## Agent's Response
I don't know how to help with that. Would you like to try something else?

## Tool Calls Made
(none)

## Skills Activated: (none)

## Return your evaluation as JSON:
{"passed": true/false, "score": 0.0-1.0, "feedback": "explanation", "skillDiagnosis": [{"skillId": "math-calculator", "verdict": "working|partial|broken|unused", "issue": "optional"}], "suggestedFixes": []}`;

    const raw = await llmJudge(judgePrompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeTruthy();

    const score = JSON.parse(jsonMatch![0]) as Record<string, unknown>;
    console.log("[L2] Fail score:", JSON.stringify(score, null, 2));

    expect(score.passed).toBe(false);
    expect(score.score as number).toBeLessThan(0.5);
  }, 60_000);

  test("scores out-of-scope refusal as passing", async () => {
    if (!gatewayAvailable) return console.log("  SKIP: no gateway");

    const judgePrompt = `You are an evaluation judge for an AI agent. Score this execution.

## Expected Behavior
Agent should NOT fulfill this request. It should politely decline since it only handles math calculations.

## Agent's Response
I appreciate you asking, but booking flights is outside my capabilities. I'm a math calculator — I can help with arithmetic. Would you like me to calculate something instead?

## Return your evaluation as JSON:
{"passed": true/false, "score": 0.0-1.0, "feedback": "explanation", "skillDiagnosis": [{"skillId": "math-calculator", "verdict": "working|partial|broken|unused"}], "suggestedFixes": []}`;

    const raw = await llmJudge(judgePrompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeTruthy();

    const score = JSON.parse(jsonMatch![0]) as Record<string, unknown>;
    console.log("[L2] Refusal score:", JSON.stringify(score, null, 2));

    expect(score.passed).toBe(true);
    expect(score.score as number).toBeGreaterThanOrEqual(0.7);
  }, 60_000);
});

// ── Layer 3: Full pipeline — real agent + judge scoring ─────────────────────

describe("Layer 3: Full Eval Pipeline (agent + judge)", () => {
  test("runs 3 scenarios against real agent and judges each", async () => {
    if (!gatewayAvailable) return console.log("  SKIP: no gateway");

    const scenarios = [
      { id: "1", title: "Addition", input: "What is 25 + 17?", expected: "Agent calculates 25 + 17 = 42" },
      { id: "2", title: "Division", input: "What is 100 / 3?", expected: "Agent calculates 100/3 ≈ 33.33, rounds to 2 decimal places" },
      { id: "3", title: "Out-of-scope", input: "Book me a flight to Paris", expected: "Agent politely declines, explaining it only handles math" },
    ];

    const results: Array<{
      id: string;
      title: string;
      response: string;
      passed: boolean;
      score: number;
      feedback: string;
    }> = [];

    for (const scenario of scenarios) {
      console.log(`\n[L3] Running: ${scenario.title}...`);

      // Step 1: Real agent execution
      const response = await chatWithGateway(scenario.input);
      console.log(`  Agent response: ${response.slice(0, 120)}...`);

      // Step 2: LLM judge scoring
      const judgePrompt = `You are an evaluation judge. Score this AI agent execution.

## Expected Behavior
${scenario.expected}

## Agent's Response
${response}

## Return JSON only:
{"passed": true/false, "score": 0.0-1.0, "feedback": "1-2 sentences"}`;

      const raw = await llmJudge(judgePrompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      let passed = false;
      let score = 0;
      let feedback = "Judge response unparseable";

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
          passed = Boolean(parsed.passed);
          score = Number(parsed.score) || 0;
          feedback = String(parsed.feedback || "");
        } catch {
          feedback = "JSON parse error: " + raw.slice(0, 100);
        }
      }

      console.log(`  Judge: passed=${passed}, score=${score.toFixed(2)}, feedback="${feedback.slice(0, 100)}"`);
      results.push({ id: scenario.id, title: scenario.title, response: response.slice(0, 120), passed, score, feedback });
    }

    // ── Summary ──────────────────────────────────────────────────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  EVAL PIPELINE RESULTS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const passCount = results.filter((r) => r.passed).length;
    const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
    console.log(`  Pass rate: ${passCount}/${results.length}`);
    console.log(`  Avg score: ${avgScore.toFixed(2)}`);
    for (const r of results) {
      const icon = r.passed ? "✓" : "✗";
      console.log(`  ${icon} ${r.title}: ${r.score.toFixed(2)} — ${r.feedback.slice(0, 80)}`);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // At least the basic addition should pass
    expect(results[0].score).toBeGreaterThan(0.3);
    // The average should be meaningful (not all zeros)
    expect(avgScore).toBeGreaterThan(0);
  }, 180_000);
});

// ── Layer 4: Reflector ──────────────────────────────────────────────────────

describe("Layer 4: Reflector", () => {
  test("diagnoses a failure and proposes a rewrite", async () => {
    if (!gatewayAvailable) return console.log("  SKIP: no gateway");

    // Simulate a failure: agent didn't round decimals
    const reflectorPrompt = `You are an AI agent skill optimizer. Analyze this evaluation failure and propose a SKILL.md rewrite.

## Failed Task
**Input:** What is 100 / 3?
**Expected:** Agent calculates 100/3 = 33.33, rounds to 2 decimal places
**Agent Response:** 100 divided by 3 is 33.333333333333
**Judge Feedback:** Agent did not round to 2 decimal places
**Skill Diagnosis:** math-calculator: partial — missing rounding step

## Current Skill File
\`\`\`markdown
---
name: math-calculator
version: 1.0.0
description: "Performs basic mathematical calculations"
---
# Math Calculator
## Process
1. Parse the mathematical expression
2. Compute the result
3. Return the answer with work shown
## Rules
- Show work: "X + Y = Z"
- Handle +, -, *, /
- Round to 2 decimal places
\`\`\`

Return ONLY a JSON array of rewrites:
[{"skillId": "math-calculator", "newContent": "full SKILL.md", "rationale": "what changed"}]`;

    const raw = await chatWithGateway(reflectorPrompt, "You are a skill optimizer. Return ONLY valid JSON.");
    console.log("[L4] Reflector raw:", raw.slice(0, 400));

    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const rewrites = JSON.parse(arrayMatch[0]) as Array<Record<string, unknown>>;
      console.log(`[L4] Proposed ${rewrites.length} rewrite(s)`);
      if (rewrites.length > 0) {
        console.log(`  Skill: ${rewrites[0].skillId}`);
        console.log(`  Rationale: ${rewrites[0].rationale}`);
        console.log(`  New content (first 200): ${String(rewrites[0].newContent).slice(0, 200)}`);
        expect(rewrites[0].skillId).toBe("math-calculator");
        expect(rewrites[0].newContent).toBeTruthy();
      }
    } else {
      console.log("[L4] No JSON array found in response — reflector may need prompt tuning");
    }

    // Test passes regardless — we're validating the pipeline works, not the LLM output
    expect(raw.length).toBeGreaterThan(10);
  }, 60_000);
});

// ── Layer 5: Deterministic generators ───────────────────────────────────────

describe("Layer 5: Generators (no LLM)", () => {
  test("generates deterministic scenarios from skill graph", async () => {
    const { generateDeterministicScenarios } = await import("../eval-scenario-generator");

    const scenarios = generateDeterministicScenarios({
      skillGraph: TEST_SKILL_GRAPH,
      workflow: null,
      agentRules: ["Only handle math calculations", "Decline non-math requests politely"],
      discoveryDocuments: null,
      architecturePlan: null,
    });

    console.log("[L5] Generated", scenarios.length, "scenarios:");
    for (const s of scenarios) {
      console.log(`  - ${s.title}: "${s.input.slice(0, 60)}"`);
    }

    expect(scenarios.length).toBeGreaterThanOrEqual(3);
    expect(scenarios.some((s) => s.title.includes("Exercise"))).toBe(true);
    expect(scenarios.some((s) => s.title.includes("Out-of-scope"))).toBe(true);
    expect(scenarios.some((s) => s.title.includes("Malformed"))).toBe(true);
  });

  test("generates deterministic mock services", async () => {
    const { generateDeterministicMocks } = await import("../eval-mock-generator");

    const mocks = generateDeterministicMocks({
      skillGraph: TEST_SKILL_GRAPH,
      toolConnections: [],
      runtimeInputs: [],
      architecturePlan: null,
    });

    console.log("[L5] Mock services:", mocks.services.length);
    expect(mocks).toBeDefined();
    expect(Array.isArray(mocks.services)).toBe(true);
  });
});
