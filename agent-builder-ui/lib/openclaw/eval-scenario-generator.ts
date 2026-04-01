import type {
  ArchitecturePlan,
  DiscoveryDocuments,
  EvalTask,
  SkillGraphNode,
  WorkflowDefinition,
} from "./types";
import { sendToArchitectStreaming } from "./api";

// ── Deterministic scenario generation (instant, no LLM) ─────────────────────

export interface DeterministicScenarioConfig {
  skillGraph: SkillGraphNode[];
  workflow: WorkflowDefinition | null;
  agentRules: string[];
  discoveryDocuments: DiscoveryDocuments | null;
  architecturePlan: ArchitecturePlan | null;
}

function skillToScenario(skill: SkillGraphNode, index: number): EvalTask {
  const desc = skill.description ?? skill.name;
  const api = skill.external_api ? ` using ${skill.external_api}` : "";

  return {
    id: `eval-auto-${index + 1}`,
    title: `Exercise: ${skill.name}`,
    input: `Please ${desc.charAt(0).toLowerCase() + desc.slice(1).replace(/\.$/, "")}${api}.`,
    expectedBehavior: `Agent activates the ${skill.name} skill (${skill.skill_id}). ${desc}${skill.requires_env?.length ? ` Requires env vars: ${skill.requires_env.join(", ")}.` : ""}`,
    status: "pending",
  };
}

function workflowScenario(workflow: WorkflowDefinition, skills: SkillGraphNode[]): EvalTask | null {
  if (workflow.steps.length < 2) return null;

  const stepNames = workflow.steps
    .map((s) => {
      const skill = skills.find((sk) => sk.skill_id === s.skill);
      return skill?.name ?? s.skill;
    })
    .slice(0, 3);

  return {
    id: "eval-auto-workflow",
    title: "Multi-step workflow execution",
    input: `Run the full workflow: ${stepNames.join(", then ")}.`,
    expectedBehavior: `Agent executes the workflow in order: ${stepNames.join(" → ")}. Each step should complete before the next begins.`,
    status: "pending",
  };
}

function outOfScopeScenario(agentRules: string[]): EvalTask {
  const ruleHint = agentRules.length > 0
    ? ` Agent rules include: "${agentRules[0].slice(0, 80)}..."`
    : "";

  return {
    id: "eval-auto-oos",
    title: "Out-of-scope request handling",
    input: "Can you book me a flight to Tokyo next week and also order pizza for the office?",
    expectedBehavior: `Agent should NOT fulfill this request. It should politely explain this is outside its capabilities and suggest the appropriate channel.${ruleHint}`,
    status: "pending",
  };
}

function errorHandlingScenario(): EvalTask {
  return {
    id: "eval-auto-error",
    title: "Malformed input handling",
    input: "",
    expectedBehavior: "Agent handles empty or malformed input gracefully — asks for clarification or provides usage guidance instead of crashing.",
    status: "pending",
  };
}

export function generateDeterministicScenarios(config: DeterministicScenarioConfig): EvalTask[] {
  const tasks: EvalTask[] = [];

  // One happy-path per skill (max 5)
  const skills = config.skillGraph.filter((s) => s.status !== "rejected");
  for (const skill of skills.slice(0, 5)) {
    tasks.push(skillToScenario(skill, tasks.length));
  }

  // Multi-step workflow test
  if (config.workflow) {
    const wf = workflowScenario(config.workflow, config.skillGraph);
    if (wf) tasks.push(wf);
  }

  // Out-of-scope guardrail
  tasks.push(outOfScopeScenario(config.agentRules));

  // Error handling
  tasks.push(errorHandlingScenario());

  return tasks;
}

// ── LLM-powered scenario generation (sends prompt to architect) ──────────────

export interface LLMScenarioConfig {
  skillGraph: SkillGraphNode[];
  agentRules: string[];
  discoveryDocuments: DiscoveryDocuments | null;
}

function buildGenerationPrompt(config: LLMScenarioConfig): string {
  const skillList = config.skillGraph
    .map((s) => `- ${s.name} (${s.skill_id}): ${s.description ?? "no description"}`)
    .join("\n");

  const ruleList = config.agentRules.length > 0
    ? config.agentRules.map((r) => `- ${r}`).join("\n")
    : "- No explicit rules defined";

  const prdSummary = config.discoveryDocuments?.prd?.sections
    ?.slice(0, 3)
    .map((s) => `${s.heading}: ${s.content.slice(0, 150)}`)
    .join("\n") ?? "No PRD available";

  return `You are generating evaluation test scenarios for an AI agent.

## Agent Configuration

### Skills
${skillList}

### Rules
${ruleList}

### Product Requirements (summary)
${prdSummary}

## Task

Generate 5-8 evaluation scenarios as a JSON array. Each scenario tests a different aspect of the agent.

**Required scenario types:**
1. One happy-path test per major skill (test that the skill works correctly)
2. One edge case (unusual input that should still work)
3. One out-of-scope test (request the agent should refuse)
4. One multi-step test (requires multiple skills working together)

**Output format — return ONLY a JSON array:**
\`\`\`json
[
  {
    "title": "Short descriptive title",
    "input": "The exact user message to send to the agent",
    "expectedBehavior": "What the agent should do — mention specific skills, actions, and outputs expected"
  }
]
\`\`\`

Return ONLY the JSON array, no other text.`;
}

function parseScenarioResponse(content: string): EvalTask[] {
  // Try to extract JSON array from response
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: Record<string, unknown>) => item.title && item.input && item.expectedBehavior)
      .map((item: Record<string, unknown>, i: number) => ({
        id: `eval-llm-${i + 1}`,
        title: String(item.title),
        input: String(item.input),
        expectedBehavior: String(item.expectedBehavior),
        status: "pending" as const,
      }));
  } catch {
    return [];
  }
}

export async function generateLLMScenarios(
  sessionId: string,
  config: LLMScenarioConfig,
  options?: { signal?: AbortSignal },
): Promise<EvalTask[]> {
  const prompt = buildGenerationPrompt(config);
  let accumulated = "";

  const response = await sendToArchitectStreaming(
    sessionId,
    prompt,
    {
      onDelta: (text) => {
        accumulated += text;
      },
    },
    {
      mode: "test",
      signal: options?.signal,
    },
  );

  // Use full response content, falling back to accumulated deltas
  const content = response.content || accumulated;
  const tasks = parseScenarioResponse(content);

  // Fallback to deterministic if LLM generation fails
  if (tasks.length === 0) {
    return [];
  }

  return tasks;
}
