# 008 — Eval Task and Convergence Loop

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/eval-task.schema.json`](schemas/eval-task.schema.json)

The eval suite is **the closed-loop verification mechanism** for OpenClaw pipelines. It combines:

- **Eval tasks** — single ground-truth scenarios with expected output and a scoring rubric
- **Eval suite** — a collection of tasks that exercises the pipeline
- **Judge** — an LLM that scores actual vs. expected output
- **Convergence loop** — `run → score → reflect → mutate → re-run` until pass-rate exceeds threshold or iterations exhaust

This is the contract that makes ECC's 200-project recursive training loop work. It's also what gives every pipeline a precise, automated answer to "is this still working?"

---

## Purpose

Two distinct uses of evals in OpenClaw:

### 1. Conformance / regression testing (every pipeline)

A pipeline ships with an eval suite that exercises all its skills against representative inputs. CI runs the suite on every change. Pass-rate thresholds gate merges. This is standard practice — what makes it interesting in OpenClaw is that the same machinery handles use #2.

### 2. Skill-file evolution (the 200-project pattern)

When a pipeline is in *training* (e.g., ECC's training-batch phase), the eval suite drives a reinforcement loop that mutates the skill file based on observed deltas. Each iteration:

1. Run the suite against the agent
2. Score outputs against ground truth (ECC's actual final estimate)
3. Reflect on failures: identify deltas between agent output and ground truth
4. Mutate skill files to encode learnings
5. Re-run

The loop continues until pass-rate exceeds threshold (e.g., 75% of routine estimates), iterations exhaust (default 5), score degrades two consecutive rounds (revert mutations), or a budget cap is hit. Without this loop, ECC's pipeline can't reach M6's 75% autonomous target.

## Eval task — the format

```ts
interface EvalTask {
  id: string;                              // kebab-case unique within suite
  spec_version: string;
  name: string;                             // human-readable
  description: string;                      // what this task exercises
  source: EvalTaskSource;                   // where ground truth came from

  // Input to the pipeline
  input: {
    user_message?: string;                  // simulated user input
    files?: Array<{                         // files to seed in workspace
      path: string;
      content_ref: string;                  // path within fixtures/
    }>;
    initial_state?: Record<string, unknown>; // seed copilot state
  };

  // Ground-truth expected output
  expected: {
    output_summary?: string;                // what the agent should have said
    files_written: Array<{
      path: string;
      content_ref?: string;                 // exact-match expected file
      structural_match?: object;             // partial structural match (e.g., schema)
      semantic_match?: string;                // judge-evaluated description
    }>;
    decisions: Array<{
      type: DecisionType;
      metadata_constraints?: Record<string, unknown>;
    }>;
    must_call_tools?: string[];
    must_not_call_tools?: string[];
  };

  // Scoring
  judge: EvalJudge;
  acceptance_threshold: number;              // 0-1; below this the task fails

  // Lifecycle
  status?: EvalStatus;                       // populated by the runner
  confidence?: number;                       // populated by the judge
  iteration?: number;                        // which loop iteration produced this
  deltas?: EvalDelta[];                      // populated on failure for the reflector
}

type EvalStatus = "pending" | "running" | "pass" | "fail" | "manual" | "error";

type EvalTaskSource =
  | { kind: "synthetic"; author: string }
  | { kind: "historical"; pipeline_id: string; original_session_id: string }
  | { kind: "customer-curated"; customer: string; reference: string };
```

`EvalTaskSource` matters for the training loop: ECC's tasks are `customer-curated` from Rowena+Scott's curated set of 10-200 historical estimates. The source determines whether failures suggest an agent flaw or a ground-truth flaw.

## Judge — scoring contract

```ts
interface EvalJudge {
  kind: "exact" | "structural" | "semantic" | "composite";
  prompt?: string;                           // for kind=semantic: the judge LLM's instructions
  rubric?: EvalRubric;                       // for kind=semantic: scoring dimensions
  weights?: Record<string, number>;          // for kind=composite: weights for sub-judges
  sub_judges?: EvalJudge[];                  // for kind=composite
}

interface EvalRubric {
  dimensions: Array<{
    name: string;                            // e.g., "completeness", "accuracy", "format"
    description: string;
    scale: { min: number; max: number };     // typically 0-10
  }>;
  pass_threshold: number;                    // sum/average must exceed this
}
```

### Judge kinds

- **`exact`** — byte-equality between expected and actual file content. Used for deterministic outputs (config dumps, structured JSON the agent must produce verbatim).
- **`structural`** — parse both as JSON/YAML/markdown, compare structure (keys, types, nesting). Tolerates whitespace and ordering differences.
- **`semantic`** — LLM judge reads expected and actual, scores against rubric dimensions. Most flexible, most expensive, most variance.
- **`composite`** — weighted combination of sub-judges. Used when different parts of an output need different judging (e.g., the takeoff numbers are exact-match, but the proposal narrative is semantic).

### Composite example for ECC takeoff

```json
{
  "kind": "composite",
  "weights": { "quantities": 0.5, "scope_buckets": 0.3, "narrative": 0.2 },
  "sub_judges": [
    {
      "kind": "structural",
      "rubric": { "dimensions": [{ "name": "quantities_match", "description": "...", "scale": { "min": 0, "max": 10 } }], "pass_threshold": 9 }
    },
    {
      "kind": "exact"
    },
    {
      "kind": "semantic",
      "prompt": "Compare the proposal narrative against ECC's actual narrative. Score on completeness, accuracy, and tone.",
      "rubric": {
        "dimensions": [
          { "name": "completeness", "description": "Covers all scope buckets", "scale": { "min": 0, "max": 10 } },
          { "name": "accuracy", "description": "No fabricated quantities or product names", "scale": { "min": 0, "max": 10 } },
          { "name": "tone", "description": "Matches ECC's voice", "scale": { "min": 0, "max": 10 } }
        ],
        "pass_threshold": 24
      }
    }
  ]
}
```

The composite judge's score is `sum(weight * sub_judge.score)`. The composite passes if the weighted sum exceeds `acceptance_threshold` AND every sub-judge with `pass_threshold` passes its threshold.

## Eval suite

```ts
interface EvalSuite {
  spec_version: string;
  pipeline_id: string;
  name: string;
  description: string;
  tasks: EvalTask[];
  judge_model: string;                       // e.g., "claude-opus-4-7" for the LLM judge
  pass_rate_threshold: number;                // suite passes iff fraction(pass) >= threshold
}
```

The suite reference lives in `pipeline-manifest.json`'s `eval_suite_ref`. The orchestrator reads it at the start of an eval run.

## Eval runner

The runner is itself an orchestrator-driven flow. For each task:

1. **Setup** — seed the agent's workspace from `task.input.files`, set initial state
2. **Run** — invoke the pipeline with `task.input.user_message` (or a synthetic trigger)
3. **Capture** — collect `files_written`, `decisions`, `tools_called`, `output_summary`
4. **Score** — invoke the judge with expected vs. actual; populate `task.confidence` and `task.status`
5. **Cleanup** — restore workspace to clean state for the next task
6. **Log** — emit `eval_task_run` decision with full context

Runs are batched: all tasks in the suite run in sequence (or in parallel if marked `concurrent_safe: true`). The runner emits a final `eval_iteration` decision summarizing pass-rate, avg-score, and per-task results.

## Convergence loop

```
┌───────────────────────────────────────────────────────────────┐
│  for iteration in 1..max_iterations:                          │
│    1. RUN — eval all tasks (or only failures from prior iter) │
│    2. SCORE — judge produces confidence per task              │
│    3. CHECK STOP CONDITIONS:                                  │
│       - pass_rate == 1.0 → all_passed                          │
│       - pass_rate < previous && consecutive_degradations >= N  │
│         → revert mutations; degraded                            │
│       - iteration == max_iterations → max_iterations            │
│    4. REFLECT — analyze failures; produce skill-file rewrites  │
│    5. MUTATE — apply rewrites to skill files                   │
│    6. PAUSE — wait for the runtime to reload skills             │
└───────────────────────────────────────────────────────────────┘
```

### Configuration

```ts
interface ConvergenceLoopConfig {
  max_iterations: number;                    // default 5
  max_consecutive_degradations: number;       // default 2
  reload_pause_ms: number;                    // default 2000
  pass_rate_threshold: number;                // typically 1.0 for "all pass"; lower for partial-success runs
  budget: {
    max_llm_calls: number;
    max_cost_usd: number;
  };
}
```

### Cost tracking

Reinforcement loops are expensive. The runner tracks:

```ts
interface EvalCostEstimate {
  agent_calls: number;                       // tasks × iterations × specialists
  judge_calls: number;                        // tasks × iterations
  reflector_calls: number;                    // iterations - 1 (no reflection on the last iteration)
  total_llm_calls: number;
  estimated_cost_usd: number;
}
```

Typical budget for a 200-project ECC training run: $200-1000 across 5 iterations. Pipelines configure `budget` per ECC's actual constraints.

### Stop conditions

| Reason | When |
|---|---|
| `all_passed` | `pass_rate >= pass_rate_threshold` |
| `max_iterations` | Iteration cap reached without convergence |
| `degraded` | Score dropped below previous iteration `max_consecutive_degradations` times in a row; mutations reverted |
| `no_actionable_changes` | Reflector returned zero proposed mutations |
| `mutation_failed` | Mutations were proposed but couldn't be applied (skill file write failure, schema invalid, etc.) |
| `budget_exhausted` | LLM call count or USD spent exceeds budget |
| `aborted` | User or runtime aborted via signal |

Each stop reason emits an `eval_iteration` decision with `metadata.stop_reason`.

### Reflector

The reflector is a privileged specialist (per [007](007-sub-agent.md)) that:

1. Reads failed tasks' deltas from the runner
2. Identifies patterns across failures (e.g., "agent consistently uses wrong labor rates for prevailing-wage zones")
3. Proposes skill-file rewrites: which skill, which section, what change

```ts
interface ReflectorOutput {
  rewrites: SkillRewrite[];
  reasoning: string;                          // explanation surfaced in the dashboard
  confidence: number;
}

interface SkillRewrite {
  skill_id: string;
  rewrite_kind: "section_replace" | "section_append" | "frontmatter_update";
  target_section?: string;                    // markdown heading or YAML key
  new_content: string;
}
```

The reflector's writes route through the same review path as Tier-2 memory writes (see [004 memory model](004-memory-model.md)). Skill-file changes during a training run can either auto-apply (when ECC trusts the loop) or require human approval per pipeline.

### Mutation reverting

When score degrades two consecutive rounds:

1. The runner identifies the last set of mutations (last reflector output)
2. Each rewrite is reverted (skill file restored to pre-mutation state)
3. The next iteration runs against the restored state
4. The decision log records `eval_iteration { stop_reason: "degraded", reverted_mutations: [...] }`

This prevents runaway mutation chains where each iteration moves the agent further from the truth.

## Integration

### With orchestrator

Eval suites enter through the orchestrator. The runner is a special "eval mode" the orchestrator's session enters; routing rules and skill behavior remain identical to production. The only difference: the eval suite's input drives the session, not real user input.

### With memory and config

Eval runs read memory and config at their state at the start of the run. Mutations to skill files during the convergence loop do **not** mutate memory or config — those have their own write paths.

For time-travel evaluation (running tasks against historical config to compare with historical agent output), the runner uses `ctx.config.at_version()` (per [009](009-config-substrate.md)).

### With checkpoints

Each iteration's start emits a `checkpoint { reason: stage_transition }`. If an iteration fails (mutation_failed, runtime crash), resume picks up from the last completed iteration.

### With decision log

Every stage of the loop emits typed entries:

- `eval_task_run` per task (with status, confidence, deltas)
- `eval_iteration` per iteration (with pass_rate, avg_score, mutations_count, stop_reason if final)
- `sub_agent_spawn` for the reflector
- Skill mutation entries via the standard memory/config write decisions

The dashboard's eval panel reads these to render the convergence trajectory.

## Anti-example — common defects

**Eval task without ground truth:**

```json
{ "id": "produce-some-estimate", "expected": {} }  // ❌ nothing to score against
```

The schema requires `expected.files_written` to have at least one entry, or `expected.output_summary` to be non-empty, or `must_call_tools` / `must_not_call_tools` to be specified. Tasks without measurable expectations cannot be evaluated.

**Acceptance threshold too lenient:**

```json
{ "acceptance_threshold": 0.1 }  // ❌ everything passes; the loop never converges meaningfully
```

The conformance suite warns when acceptance thresholds are below 0.5 — that's a signal the task is too vague.

**Reflector mutating outside skill files:**

```ts
// reflector tries to mutate config or memory directly
await ctx.config.commit(...);  // ❌ outside reflector's authority
```

Reflectors only mutate skill files. Other state changes route through their normal paths (memory writes through Tier-2 review, config commits through manual editor or import).

**Loop without budget cap:**

```ts
{ max_iterations: 100 }  // ❌ no budget; runaway cost
```

The schema requires `budget.max_llm_calls` and `budget.max_cost_usd`. Loops that hit budget stop with `stop_reason: budget_exhausted`.

## Cross-references

- [[002-agent-manifest]] — `eval_suite_ref` field
- [[003-tool-contract]] — eval tasks may assert `must_call_tools` and `must_not_call_tools`
- [[004-memory-model]] — reflector writes route through memory's Tier-2 review path
- [[005-decision-log]] — `eval_task_run`, `eval_iteration` entries
- [[006-orchestrator]] — orchestrator dispatches eval runs through standard routing
- [[007-sub-agent]] — reflector is a privileged specialist
- [[009-config-substrate]] — time-travel reads via `at_version()`
- [[011-pipeline-manifest]] — eval suite reference and convergence-loop config
- [[012-checkpoint]] — iteration boundaries trigger checkpoints
- [[013-hooks]] — `eval_task_complete`, `eval_iteration_complete` hooks
- [[014-error-taxonomy]] — `eval_failure` category for tasks below threshold
- [[101-conformance]] — every pipeline ships an eval suite; conformance gate

## Open questions for ECC pipeline

- For ECC's customer-curated 200-project loop, the ground truth is "ECC's actual final estimate." But ECC's estimates have noise (different estimators produce different numbers). Should the judge tolerate ±N% on quantities? **Tentative**: yes, the takeoff sub-judge has a tolerance field per dimension; e.g., `quantities_match` accepts ±5% as a pass.
- The reflector mutating skill files — every mutation needs Darrow's approval per the spec. With 200 projects × 5 iterations × ~10 mutations per iteration = 10,000 approval prompts. **Tentative**: training-mode pipelines opt into auto-approval for reflector mutations, with a daily summary email to Darrow that lists the day's mutations and lets him roll back.
- Cost budgeting for the loop — should a pipeline that exceeds budget abort or halve the iteration count and continue? **Tentative**: abort cleanly with `budget_exhausted`; the human reviews and either widens budget or accepts current convergence.
