# 006 — Orchestrator Protocol

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/orchestrator.schema.json`](schemas/orchestrator.schema.json)

The orchestrator is the agent that **routes** user input to the specialists in a pipeline, **coordinates** their work (sequentially, in parallel, or both), and **merges** their results back into a single response. ECC's pipeline has one orchestrator and 11 specialists; a minimal pipeline (single-agent flow) has one orchestrator wrapping one specialist.

---

## Purpose

Three jobs:

1. **Routing.** The user's first message arrives at the orchestrator, not at a specialist. The orchestrator decides which specialist owns this turn — based on the message, the current pipeline stage, and pipeline-declared routing rules.
2. **Coordination.** When a single user turn requires multiple specialists (intake → takeoff → pricing → narrative), the orchestrator sequences them. When specialists can run independently (parallel vision-call batches over photo chunks), the orchestrator fans out and joins.
3. **Merging.** Specialist results — typed deliverables, file writes, decision-log entries, memory writes — flow back through the orchestrator. It combines them into a single coherent response to the user, surfacing conflicts (file overwrites, contradictory recommendations) for human review.

The orchestrator is **itself an agent** ([002](002-agent-manifest.md)) with one special property: it has no domain skills of its own. Its skills are routing, coordination, and merging — meta-skills, not estimating skills. ECC's orchestrator agent never produces an estimate directly; it dispatches to specialists who do.

## The orchestrator agent

A pipeline's orchestrator is declared in `pipeline-manifest.json`:

```json
{
  "orchestrator": {
    "agent_id": "orchestrator",
    "skills": ["route-user-input", "merge-specialist-results", "handle-handoff"]
  }
}
```

`agent_id` references one of the agents in the manifest's `agents[]` array. That agent's `SOUL.md` has `role: "Pipeline orchestrator"` and its `tools/` are restricted to coordination tools — never domain tools.

Conventions:

- Exactly **one** orchestrator per pipeline (no nested orchestration in v1)
- The orchestrator has read-only access to all specialists' workspaces
- The orchestrator may write to a shared `orchestrator/` workspace section but never writes inside specialist workspaces directly
- The orchestrator's authority is `tier: 1, lane: orchestration` in the memory model

## Routing

The user's input arrives at the orchestrator. It runs its `route-user-input` skill, which:

1. Inspects the message + current pipeline state (current dev stage, in-flight specialists, recent decision log)
2. Consults pipeline-declared routing rules (declarative + LLM-mediated)
3. Picks one or more specialists
4. Hands off (see below)

### Routing rule shapes

The pipeline manifest declares routing rules:

```json
{
  "routing": {
    "rules": [
      {
        "match": { "stage": "intake", "message_kind": "rfp_received" },
        "specialist": "intake-specialist"
      },
      {
        "match": { "stage": "takeoff", "input_has": ["photos", "notes"] },
        "specialist": "vision-manifest-specialist",
        "then": "takeoff-specialist"
      },
      {
        "match": { "stage": "pricing", "regions": ["aurora", "denver"] },
        "specialists": ["pricing-specialist"],
        "context": { "config_doc": "labor-rates", "filter": { "region": "aurora" } }
      }
    ],
    "fallback": "orchestrator-clarify"
  }
}
```

`match` is a declarative filter; the orchestrator evaluates it against the current state. The first matching rule wins. `fallback` runs when no rule matches — typically a clarifying-question skill on the orchestrator itself.

### Match clauses

Match clauses can include:

| Field | Type | Example |
|---|---|---|
| `stage` | enum | `"intake" \| "takeoff" \| "pricing" \| "review" \| ...` |
| `message_kind` | string (pipeline-defined) | `"rfp_received"`, `"correction_received"` |
| `input_has` | array of input types | `["photos", "notes", "drawings"]` |
| `regions` | array of region IDs | `["aurora", "denver"]` |
| `agent_status` | object | `{ "specialist-id": "completed" \| "failed" \| "running" }` |
| `decision_count` | comparison | `{ "<": 100 }` |
| `custom` | pipeline-defined predicate | `"customMatcher.ts"` |

### LLM-mediated routing

When declarative rules don't fit, the orchestrator's `route-user-input` skill calls the LLM to pick a specialist from the list. The skill prompt includes:

- The user's message
- The current pipeline state summary
- The specialists' descriptions (from each agent's `SOUL.md` role)

The LLM returns a structured `<route specialist="..." reason="..."/>` marker (validated per [015](015-output-validator.md)). LLM-mediated routing is the fallback when the declarative rules can't decide; it's not the primary path.

## Handoff protocol

Once routing decides, the orchestrator hands off to a specialist via this protocol:

```ts
interface OrchestratorHandoff {
  to_specialist: string;            // agent_id of the target
  context: {
    user_message?: string;            // the original input, if relevant
    upstream_results?: Record<string, unknown>;  // results from prior specialists in this turn
    config_filter?: Record<string, unknown>;     // narrows config-substrate reads
    memory_lanes?: string[];                      // narrows memory reads to specific lanes
    workspace_scope: string;                       // where the specialist may write (relative path)
    deadline?: string;                              // ISO-8601, when to give up
  };
  parent_session_id: string;
  parent_decision_id: string;
}
```

The orchestrator emits a `orchestrator_handoff` decision-log entry ([005](005-decision-log.md)) with this payload. The runtime spawns the specialist's session, scoped to the handoff context. Specialist execution is documented in [007 sub-agent](007-sub-agent.md).

### Workspace scope

The `workspace_scope` field constrains where the specialist may write. Examples:

- `scaffold/` — the intake specialist writes the initial workspace structure
- `deliverables/takeoff/` — the takeoff specialist writes its takeoff report
- `deliverables/rfq/<trade>/` — each RFQ specialist writes one trade's RFQ packet

The runtime enforces scope: a specialist that tries to write outside its scope hits `permission_denied`. The orchestrator owns the rest of the workspace.

### Deadline

`deadline` lets the orchestrator give a specialist a soft deadline. If the specialist hasn't completed by the deadline, the orchestrator can either kill it (treating it as a failed specialist), wait (with a warning logged), or trigger checkpoint-and-resume. Pipeline declares the policy.

## Coordination patterns

### Sequential

The orchestrator runs specialists one after another, passing each one's output into the next:

```
user input → [orchestrator] → [intake] → [vision-manifest] → [takeoff] → [pricing] → [orchestrator merge] → response
```

Use when:
- Each step depends on the prior (takeoff depends on vision-manifest output)
- The order matters (RFP intake must precede pricing)

The orchestrator emits one `orchestrator_handoff` decision per step, and a `result_merge` decision when all complete.

### Parallel (fan-out / join)

The orchestrator runs multiple specialists simultaneously, then merges results:

```
user input → [orchestrator] → ┬ [vision-batch-1]  ┐
                              ├ [vision-batch-2]  ├ → [orchestrator merge] → response
                              ├ [vision-batch-3]  ┤
                              └ [vision-batch-4]  ┘
```

Use when:
- Specialists are independent (no upstream dependency)
- The work is naturally batchable (photo chunks, RFQ-per-trade)
- Latency matters (ECC's 500-photo job needs parallel vision calls)

The pipeline declares fan-out in routing:

```json
{
  "match": { "stage": "vision-pre-pass", "input_has": ["photos"] },
  "fan_out": {
    "specialist": "vision-manifest-specialist",
    "split_input": "chunk_photos",
    "max_parallelism": 4
  },
  "then": "merge-photo-manifests"
}
```

`split_input` references a pipeline-supplied function that produces N input chunks. `max_parallelism` caps concurrency (Anthropic rate limits, sandbox CPU).

### Pipelined (overlap)

A more advanced pattern: specialist B starts processing partial output from specialist A before A finishes. v1 supports sequential and parallel only; pipelined (true streaming between specialists) is deferred to v1.1.

## Result merging

After specialists complete, the orchestrator merges their output into a single response. The merger handles:

### File conflicts

When two specialists write to the same path:

```ts
interface FileConflict {
  path: string;
  agents: string[];          // which specialists wrote to this path
  resolution: "last-write-wins" | "explicit-merge" | "error";
}
```

v1 supports `last-write-wins` and `error` (fail the turn, surface conflict to human). `explicit-merge` (3-way merge with conflict markers) is deferred to v1.1. Pipelines declare per-path policy:

```json
{
  "merge_policy": [
    { "path_glob": "deliverables/decision-log.md", "resolution": "explicit-merge" },
    { "path_glob": "deliverables/**/*.md", "resolution": "last-write-wins" },
    { "path_glob": ".openclaw/architecture.json", "resolution": "error" }
  ]
}
```

The runtime applies the first matching policy. `error` is appropriate for files where any conflict indicates a bug (e.g., the manifest itself).

### Result aggregation

Specialists return `OrchestratorResult`:

```ts
interface OrchestratorResult {
  specialist: string;
  success: boolean;
  files_written: string[];
  decision_log_entries: number;     // count, for telemetry
  output_summary: string;           // ≤200 chars, surfaced to user
  emitted_events: AgUiEvent[];       // forwarded to dashboard
  error?: string;
}
```

The orchestrator's `merge-specialist-results` skill takes an array of `OrchestratorResult` plus the user's original input and produces:

```ts
interface MergedResponse {
  user_message: string;             // what to show the user
  files_written: string[];           // dedup'd union, with conflicts noted
  conflicts: FileConflict[];
  follow_up_actions?: Array<{
    label: string;
    next_specialist: string;
    context?: Record<string, unknown>;
  }>;
}
```

`follow_up_actions` are suggestions the orchestrator surfaces in the dashboard (e.g., "Generate the RFQ packet for the missing trade?"). Users click; the orchestrator handles the click via the same handoff protocol.

## Failure handling

When a specialist fails:

```ts
{
  type: "sub_agent_complete",
  metadata: { specialist: "takeoff-specialist", success: false, error: "..." }
}
```

The orchestrator decides:

- **Retry** the specialist (up to retry config per [014](014-error-taxonomy.md))
- **Skip** and continue with other specialists (typed `partial_completion: true` in MergedResponse)
- **Abort** the whole turn (when this specialist is required and unrecoverable)
- **Escalate** to human review (pause the turn, surface to dashboard)

The pipeline manifest declares default policy per specialist:

```json
{
  "failure_policy": {
    "vision-manifest-specialist": "retry-then-escalate",
    "rfq-trade-sealant": "skip",
    "takeoff-specialist": "abort"
  }
}
```

`retry-then-escalate` retries per the error taxonomy; if retries exhaust, escalates. `skip` records the failure but continues. `abort` ends the turn.

## Memory and config in the orchestrator

The orchestrator reads pipeline-shared memory (across all lanes) and pipeline-shared config. It writes memory only to its own lane (`tier: 1, lane: orchestration`). It does **not** write to specialists' lanes — that authority belongs to the specialists themselves and to human reviewers.

When a specialist completes, its memory writes have already been routed and either committed (Tier-1 specialist) or flagged (Tier-2 specialist). The orchestrator does not re-route them.

## Integration with hooks

The orchestrator fires hooks at coordination points:

- `orchestrator_handoff` (data event, also a decision-log entry)
- `sub_agent_spawn`, `sub_agent_complete` (per [007](007-sub-agent.md))
- `result_merge` when merging completes
- `custom:<pipeline>:turn_complete` for pipeline-specific telemetry

## ECC orchestrator example

ECC's orchestrator routes a typical estimate:

```
User emails: "Estimate this property: <photos>, <notes>, <RFP.pdf>"
   ↓
Orchestrator receives email at agent's mailbox trigger.
   ↓
Routes to intake-specialist (declarative match: stage=intake, message_kind=rfp_received)
   ↓ (intake completes; results: { property_id, scope_keywords, building_count })
Routes to vision-manifest-specialist FAN-OUT 4 batches of 125 photos each
   ↓ (4 batches complete in parallel; results merged into one photo manifest)
Routes to takeoff-specialist (with photo manifest + handwritten notes from intake)
   ↓ (takeoff completes; produces takeoff report)
Routes to pricing-specialist (with takeoff + config_filter: { region: aurora })
   ↓ (pricing completes; produces cost breakdown)
Routes to gap-specialist (looks at takeoff + pricing for missing scope)
   ↓ (gap analysis completes; flags 3 RFI items)
Routes to rfq-specialists FAN-OUT (one per specialty trade) for sealant, sheet metal, fence
   ↓ (3 RFQ packets in parallel)
Routes to narrative-specialist (consumes all prior outputs)
   ↓ (proposal narrative completes)
Routes to pptx-specialist (generates 11-slide deck from narrative + takeoff)
   ↓ (PPTX completes)
Routes to qa-specialist (audits all deliverables against ECC standards)
   ↓ (QA produces self-audit checklist)
Routes to decision-log-specialist (compiles all decisions across the turn)
   ↓ (decision log produced)
Orchestrator MERGES: 10 deliverables, 0 conflicts, 47 follow-up actions surfaced
   ↓
Email reply to user with deliverable links + dashboard URL for review
```

That's a single user turn, ~30-90 minutes wall clock, ~3 hours of LLM-equivalent work because of parallelism. The orchestrator is the spine.

## Anti-example — common defects

**Orchestrator with domain skills:**

```yaml
# orchestrator's SOUL.md
role: "ECC estimator AND pipeline orchestrator"  # ❌ mixing roles
```

The orchestrator must not produce domain output. If estimating logic is in the orchestrator, sharing/swapping specialists across pipelines becomes impossible.

**Specialists writing outside scope:**

```ts
// pricing-specialist
await ctx.workspace.write(".openclaw/architecture.json", ...);
// ❌ scope was deliverables/pricing/; manifest is orchestrator territory
```

The runtime rejects with `permission_denied`. The conformance suite fuzzes specialists with attempts to write outside scope.

**Routing inside specialists:**

```ts
// inside intake-specialist
if (looks_like_takeoff_data) await spawn_specialist("takeoff");
// ❌ specialist is making routing decisions; orchestrator's job
```

Specialists report results; the orchestrator routes. Specialists that spawn other specialists fragment the call tree and break the audit log.

**Implicit fan-out without explicit cap and no pipeline default:**

```json
{ "fan_out": { "specialist": "vision-manifest", "split_input": "..." } }
// (no max_parallelism here AND no RoutingRules.fan_out_default_max_parallelism)
```

If neither this fan-out's `max_parallelism` nor the pipeline-wide `RoutingRules.fan_out_default_max_parallelism` is set, the runtime defaults to **4** (conservative; protects against unbounded Anthropic concurrency). Either declare it inline (preferred when this fan-out has different concurrency needs than the rest of the pipeline) or set the pipeline-wide default in `RoutingRules`.

## Cross-references

- [[002-agent-manifest]] — the orchestrator IS an agent with restricted skills/tools
- [[003-tool-contract]] — orchestrator-only coordination tools
- [[005-decision-log]] — `orchestrator_handoff`, `result_merge`, `sub_agent_*` entries
- [[007-sub-agent]] — specialists are sub-agents the orchestrator spawns
- [[008-eval-task]] — eval suite runs through the orchestrator (orchestrator is the entry point)
- [[011-pipeline-manifest]] — orchestrator declaration, routing rules, failure policy live here
- [[013-hooks]] — `result_merge` is hookable for telemetry / external integration
- [[014-error-taxonomy]] — specialist failures classify per the taxonomy
- [[101-conformance]] — verifier that ensures orchestrator has no domain skills

## Open questions for ECC pipeline

- Routing decisions when the user's input could plausibly go to multiple specialists — does the orchestrator ask a clarifying question, or pick a primary and route subsequent rules to others? **Tentative**: declarative `priority` field on rules; ties broken by LLM-mediated routing.
- For the 200-project training loop, the orchestrator dispatches to a "reflector" specialist that mutates skill files. Is the reflector a regular specialist (with workspace write to skills/) or a privileged one? **Tentative**: privileged — its scope includes `skills/` which other specialists never have. Declared explicitly in pipeline manifest.
- Long-running specialists (vision-manifest on 500 photos) hitting deadline mid-batch — kill or extend? **Tentative**: extend once with a hook for human notification; kill on second deadline.
