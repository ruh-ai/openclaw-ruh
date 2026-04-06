# SPEC: Real Agent Evaluation with Reinforcement Loop

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[003-sandbox-lifecycle|Sandbox Lifecycle]] | [[011-key-flows|Key Flows]]

## Status
<!-- draft | approved | implemented | deprecated -->
draft

## Summary

Replace the current mock evaluation system (LLM pretending to be the agent, keyword-based scoring) with a real agent evaluation harness that runs the actual agent in its container, captures execution traces (tool calls, API requests, errors), scores them with an LLM judge, and iteratively improves failing skills through a GEPA-inspired reinforcement loop.

Inspired by [Hermes Agent Self-Evolution](https://github.com/NousResearch/hermes-agent-self-evolution) which uses DSPy + GEPA (Genetic-Pareto Prompt Evolution) to optimize skill text through reflection on full execution traces rather than collapsing to scalar rewards.

## Related Notes

- [[008-agent-builder-ui]] — Builder UI architecture, lifecycle stages
- [[003-sandbox-lifecycle]] — How agent containers are created and managed
- [[011-key-flows]] — Agent creation flow end-to-end
- [[004-api-reference]] — Backend API endpoints including sandbox chat
- [[SPEC-gateway-tool-events]] — Tool event SSE format from gateway

## Problem

The current Test stage is theater:

1. `eval-runner.ts` sends prompts to the **shared Architect container** with a fake `soulOverride`
2. The Architect LLM **pretends** to be the agent — no real skills, tools, or APIs are exercised
3. `eval-scorer.ts` uses **keyword matching** — counts how many expected words appear in the response
4. A confidence score ≥ 0.5 = pass — this measures text similarity, not execution correctness

**No skills are executed. No tools are called. No container runs the actual agent.**

An enterprise customer evaluating whether to deploy this agent gets zero signal about whether it actually works.

## Architecture

### Two-Layer Design

```
┌──────────────────────────────────────────────────────────┐
│  Layer 1: Real Agent Execution + Trace Scoring           │
│  (replaces current keyword-matching eval)                │
│                                                          │
│  Test prompt → Agent's own container → Capture traces    │
│  → LLM judge scores traces → Pass/Fail with feedback    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Layer 2: Reinforcement Loop (opt-in)                    │
│  (GEPA-inspired iterative skill improvement)             │
│                                                          │
│  Failed traces → Reflector diagnoses root causes         │
│  → Mutator rewrites SKILL.md → Hot-reload in container   │
│  → Re-run failed scenarios → Compare scores              │
│  → Repeat until quality threshold or budget exhausted    │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

```
EvalScenario[]
    │
    ▼
┌─────────────────────┐
│  Agent Container     │  ← real SOUL.md, real skills, real tools
│  (WS chat endpoint)  │  ← /api/sandboxes/:id/chat/ws
│  ┌───────────────┐   │
│  │ SOUL.md       │   │
│  │ skills/*.md   │   │  ← these get mutated by the reinforcement loop
│  │ tools/*.yml   │   │
│  └───────────────┘   │
└─────────┬───────────┘
          │ ExecutionTrace (tool calls, text, errors, duration)
          ▼
┌─────────────────────┐
│  LLM Trace Scorer    │  ← reads full trace + expected behavior
│  (eval-trace-scorer) │  ← returns score + natural language feedback
└─────────┬───────────┘
          │ TraceScore[]
          ▼
┌─────────────────────┐
│  Reflector           │  ← reads all failed traces + SKILL.md files
│  (eval-reflector)    │  ← proposes concrete SKILL.md rewrites
└─────────┬───────────┘
          │ SkillMutation[]
          ▼
┌─────────────────────┐
│  Mutator             │  ← writes diffs to SKILL.md in container
│  (eval-mutator)      │  ← via docker exec / forge-chat
└─────────┬───────────┘
          │
          ▼
    Re-run failed scenarios (back to top)
```

## Specification

### New Types

```typescript
// Captured from WebSocket chat endpoint tool events
interface ToolCallTrace {
  toolName: string;
  input: string;       // command/args passed to tool
  output: string;      // result from tool
  durationMs: number;
  approved: boolean;   // was tool auto-approved
}

// Full execution trace for one eval task
interface ExecutionTrace {
  response: string;              // Final text output from agent
  toolCalls: ToolCallTrace[];    // Ordered list of tool invocations
  skillsActivated: string[];     // Skill IDs referenced in response
  errors: string[];              // Error messages during execution
  totalDurationMs: number;
  tokenEstimate: number;         // Rough token count for cost tracking
}

// LLM judge output for one eval task
interface TraceScore {
  passed: boolean;
  score: number;                 // 0-1 continuous
  feedback: string;              // Natural language: WHY it failed/passed
  skillDiagnosis: Array<{
    skillId: string;
    verdict: "working" | "partial" | "broken" | "unused";
    issue?: string;
  }>;
  suggestedFixes: string[];
}

// Reinforcement loop state
interface EvalLoopState {
  iteration: number;
  maxIterations: number;
  scores: Array<{ iteration: number; passRate: number; avgScore: number }>;
  mutations: Array<{
    iteration: number;
    skillId: string;
    before: string;    // SKILL.md content before mutation
    after: string;     // SKILL.md content after mutation
    accepted: boolean; // did the mutation improve the score?
  }>;
  status: "idle" | "running" | "paused" | "completed" | "degraded";
  stopReason?: string;
}

// Extended EvalTask (replaces current)
interface EvalTask {
  id: string;
  title: string;
  input: string;
  expectedBehavior: string;
  status: EvalTaskStatus;
  response?: string;
  trace?: ExecutionTrace;        // NEW: full execution trace
  traceScore?: TraceScore;       // NEW: LLM judge result
  toolsUsed?: string[];
  duration?: number;
  confidence?: number;
  reasons?: string[];
  iteration?: number;            // NEW: which loop iteration produced this result
}
```

### New Files

| File | Purpose |
|------|---------|
| `eval-trace-collector.ts` | Parse WS chat SSE stream into ExecutionTrace |
| `eval-trace-scorer.ts` | LLM judge that reads traces and scores execution quality |
| `eval-reflector.ts` | Diagnose failures, propose SKILL.md rewrites |
| `eval-mutator.ts` | Apply SKILL.md mutations to container, hot-reload |
| `eval-loop.ts` | Orchestrate the reinforcement loop with stopping criteria |

### Modified Files

| File | Change |
|------|--------|
| `eval-runner.ts` | Route to real agent container via forge-chat, collect traces |
| `copilot-state.ts` | Add `agentSandboxId`, `evalLoopState`, and new actions |
| `types.ts` | Add new types (ExecutionTrace, TraceScore, EvalLoopState) |
| `LifecycleStepRenderer.tsx` | Update StageTest UI with trace viewer, iteration indicator, skill diffs |

### Routing Change

**Before:** `eval-runner.ts` → `sendToArchitectStreaming()` → shared architect container
**After:** `eval-runner.ts` → `sendToForgeSandboxChat()` → agent's own container

### Sandbox readiness gate

- The Test stage follows the same forge-only contract as [[SPEC-openclaw-bridge-forge-required]].
- When `agentSandboxId` is missing, `runEvalSuite()` keeps scenarios pending with an explicit container-not-ready reason instead of calling `sendToArchitectStreaming()`.
- `runSkillTest()` also fails closed: missing sandbox state returns a skipped result with the same container-not-ready reason instead of probing the retired shared architect path.
- `LifecycleStepRenderer.tsx` surfaces that state directly in the Test UI so operators see `Container not ready` while the dedicated agent sandbox is still provisioning.

The agent container already exists from the Build stage. Its `forgeSandboxId` is stored in copilot state. The `sendToForgeSandboxChat()` function already exists in `api.ts` and routes through `/api/openclaw/forge-chat` → `/api/sandboxes/:id/chat`.

For trace collection, we use the **WebSocket chat endpoint** (`/api/sandboxes/:id/chat/ws`) which emits `tool` and `result` events for every tool call. This is surfaced via a new frontend proxy endpoint at `/api/openclaw/forge-chat-traced`.

### LLM Trace Scorer

Replaces keyword matching. Sends the full trace to an LLM with this prompt structure:

```
You are an evaluation judge for an AI agent. Score this execution trace.

## Expected Behavior
{expectedBehavior}

## Agent's Response
{response}

## Tool Calls Made
{toolCalls formatted}

## Errors
{errors}

## Agent Skills Available
{skillGraph}

## Score this execution:
1. Did the agent produce the correct output? (0-1)
2. Did it use the right tools/skills? List which were used correctly, which were missed.
3. Were there unnecessary tool calls or errors?
4. What specific changes to the agent's skills would fix any issues?

Return JSON: { passed, score, feedback, skillDiagnosis, suggestedFixes }
```

### Reflector

Takes all failed TraceScores from one iteration and the current SKILL.md files. Produces concrete rewrites:

```
You are improving an AI agent's skills based on evaluation failures.

## Failed Tasks
{for each failed task: input, expectedBehavior, trace, score feedback}

## Current Skill Files
{for each skill: SKILL.md content}

## Instructions
For each failing skill, propose a rewritten SKILL.md that fixes the diagnosed issues.
- Only modify skills that were diagnosed as "partial" or "broken"
- Keep the skill's purpose and API connections unchanged
- Focus on fixing the process steps, error handling, or output format
- Preserve the YAML frontmatter

Return JSON array: [{ skillId, newContent, rationale }]
```

### Mutator

Applies SKILL.md rewrites to the agent container:

1. Read current SKILL.md from container via `docker exec cat`
2. Write new content via `docker exec` with heredoc
3. Trigger skill reload via `openclaw skills reload` (if available) or restart gateway

### Reinforcement Loop

```
function runEvalLoop(config):
  for iteration in 1..maxIterations:
    results = runEvalSuite(tasks, config)  // run all tasks against real agent

    passRate = results.filter(passed).length / results.length
    avgScore = mean(results.map(r => r.traceScore.score))

    record(iteration, passRate, avgScore)

    if passRate == 1.0:
      stop("all_passed")

    if iteration > 1 and avgScore < previousAvgScore:
      consecutiveDegradations++
      if consecutiveDegradations >= 2:
        revert last mutation
        stop("degraded")
    else:
      consecutiveDegradations = 0

    // Reflect on failures
    failures = results.filter(!passed)
    mutations = reflector.diagnose(failures, currentSkills)

    // Apply mutations
    for mutation in mutations:
      mutator.apply(mutation, containerId)
      record mutation (before/after)

    // Brief pause for container to reload
    await sleep(2000)

  stop("max_iterations")
```

### Stopping Criteria

| Criterion | Default | Configurable? |
|-----------|---------|---------------|
| All scenarios pass | — | No (always stops) |
| Max iterations | 5 | Yes |
| Score degraded 2 consecutive rounds | — | No (always stops) |
| Max eval budget (LLM calls) | 50 | Yes |
| Wall-clock timeout | 10 min | Yes |
| User abort | — | Always available |

### UI Changes (StageTest)

1. **Mode selector** — "Single Run" (one pass) vs "Auto-Improve" (reinforcement loop)
2. **Iteration indicator** — "Round 2/5 — 4/6 passing, avg score 0.72"
3. **Trace viewer** — expand task to see tool calls timeline, not just text
4. **Skill diff viewer** — side-by-side before/after for mutated skills
5. **Score trend** — mini sparkline showing score progression across iterations
6. **Stop controls** — pause, abort, accept current state

### Cost Estimate

Per reinforcement run (5 iterations, 8 scenarios):
- ~40 agent executions (8 × 5, some skipped)
- ~40 LLM judge calls (trace scoring)
- ~5 reflector calls
- ~5 mutator calls
- **Total: ~90 LLM calls → $1-5**

## Implementation Notes

### Phase 1: Route to real container + collect traces
- Modify `eval-runner.ts` to use `sendToForgeSandboxChat()` with `agentSandboxId`
- Create `eval-trace-collector.ts` to parse SSE tool events into ExecutionTrace
- Add `agentSandboxId` to copilot state

### Phase 2: LLM trace scorer
- Create `eval-trace-scorer.ts` replacing keyword-based `eval-scorer.ts`
- Keep `eval-scorer.ts` as fallback for when no container is available

### Phase 3: Reflector + Mutator
- Create `eval-reflector.ts` and `eval-mutator.ts`
- Wire into eval-runner for single-iteration improvement

### Phase 4: Reinforcement loop
- Create `eval-loop.ts` orchestrating multi-iteration cycles
- Add `evalLoopState` to copilot state

### Phase 5: UI updates
- Trace viewer, iteration indicator, skill diffs in StageTest

## Test Plan

- Unit tests for trace collector parsing (mock SSE data)
- Unit tests for trace scorer prompt construction
- Unit tests for reflector output parsing
- Integration test: run eval against a test container with known skills
- E2E: full reinforcement loop with a deliberately broken skill that gets fixed
