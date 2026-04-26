# 007 — Sub-Agent Isolation and Result Merging

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/sub-agent.schema.json`](schemas/sub-agent.schema.json)

A **sub-agent** is a specialist agent that the orchestrator ([006](006-orchestrator.md)) spawns to handle a scoped piece of work. This section defines the isolation contract — how sub-agents are spawned, scoped, run, completed, and their results merged back into the parent pipeline session.

---

## Purpose

When an orchestrator hands off to a specialist, that specialist needs:

1. **A scoped workspace** — it can write only where the orchestrator authorized, and only in its own scope
2. **A unique session identity** — its tool calls, decision-log entries, and memory writes are all attributable to it, not to the orchestrator
3. **Inherited shared state** — pipeline-level memory (filtered to what the specialist needs) and pipeline-level config flow in
4. **A clean exit** — when it completes, results merge back through a typed contract, conflicts are detected, and the orchestrator can decide what to do

Without this isolation, multi-specialist pipelines collapse into one giant blob where every agent can write anywhere, every decision is unattributed, and every result merge is freeform. ECC's 11-specialist pipeline cannot exist without sub-agent isolation.

## Isolation is logical, not physical

In v1, sub-agent isolation is **logical**, not physical:

- All sub-agents in a pipeline share the same Docker container (the pipeline's tenant boundary)
- Sub-agents share the same gateway, the same Postgres database, the same memory store
- Isolation comes from: unique session IDs, scoped workspace paths, scoped memory lanes, and runtime-enforced permissions

True physical isolation (one container per sub-agent) is deferred to v2 if the cost/benefit ever favors it. For v1 — and ECC's deployment — logical isolation gives the operational guarantees we need without 11x container overhead.

What logical isolation guarantees:

- A sub-agent cannot read another sub-agent's in-flight workspace state (only completed, merged outputs)
- A sub-agent cannot write to another sub-agent's workspace scope (runtime rejects with `permission_denied`)
- A sub-agent's decision-log entries are tagged with its session ID and not mixed with the orchestrator's
- A sub-agent's memory writes carry its agent identity and route through the tier model

## Sub-agent identity

When the orchestrator spawns a specialist:

```ts
interface SubAgentConfig {
  specialist: string;            // agent_id of the specialist (must exist in pipeline manifest)
  parent_session_id: string;     // the orchestrator's session
  parent_decision_id: string;    // the decision-log entry that caused this spawn
  workspace_scope: string;       // where the specialist may write (relative path)
  context: HandoffContext;       // see 006-orchestrator
}

interface SubAgent {
  id: string;                    // ULID, unique across the pipeline
  specialist: string;
  agent_uri: string;             // openclaw://<pipeline>/agents/<specialist>@<version>
  session_id: string;            // sub-agent's own session, not the parent's
  sandbox_id: string;            // shared with parent (logical isolation)
  workspace_scope: string;
  status: SubAgentStatus;
  created_at: string;
  completed_at?: string;
  result?: SubAgentResult;
  parent_session_id: string;
  parent_decision_id: string;
}
```

The `session_id` is unique. Every tool call, memory write, and decision-log entry the sub-agent makes is tagged with it. The orchestrator can query "what did specialist X do?" by filtering decision log on `session_id`.

The `agent_uri` ensures stable identity across runs — the same `(pipeline, specialist, version)` produces identical behavior.

## Lifecycle states

```
   spawn (or skip)
     │
     ▼
  pending ──┐
     │      │ (orchestrator decides not to run)
     │      └─→ skipped
     │      
     │      (timeout or orchestrator stop)
     ▼      
  running ──┴─→ stopped
     │
     ▼
  completed (success: true or false)
     │
     ▼
  failed (synonym for completed with success: false)
```

| State | Meaning |
|---|---|
| `pending` | Spawned but not yet started; runtime is allocating session resources |
| `running` | Actively executing skill code |
| `completed` | Finished cleanly; result is populated (success may be true or false) |
| `failed` | Synonym for `completed` with `success: false`; runtime emits both for clarity |
| `stopped` | Orchestrator (or runtime) terminated the sub-agent **mid-run** before completion |
| `skipped` | Orchestrator decided **not to run** this sub-agent (per `failure_policy: skip` or routing decision); never transitions to `running` |

`stopped` and `skipped` are both terminal but distinct: `stopped` = work was started and aborted; `skipped` = work never started. The decision log distinguishes them so reviewers can audit *why* each terminal state was reached.

State transitions emit `sub_agent_spawn` and `sub_agent_complete` decision-log entries.

## Workspace scope enforcement

`workspace_scope` is a workspace-relative path. Scope enforcement is **the** load-bearing security boundary in OpenClaw — without it, a single misbehaving specialist breaks every isolation guarantee. The runtime enforces a formal path-safety contract (below); the conformance suite ([101](101-conformance.md)) validates implementations.

### Allowed-read surface

A specialist may read:

- **Within its own `workspace_scope`** — full read access to any file under the resolved scope path (post-normalization).
- **Pipeline-shared paths (read-only)** — exactly:
  - `pipeline-manifest.json` (just to know the pipeline shape; not the secret store)
  - `agents/<agent_id>/.openclaw/architecture.json` for any agent (the public manifest, never private memory)
  - `agents/<this_agent>/.openclaw/MEMORY.md` (only the index, only filtered to `confirmed`+`permanent` entries)
  - `config/<doc_id>/current.json` for any pipeline-declared config doc (read via `ctx.config`, not raw fs)
  - The eval suite reference (read-only)

Everything else fails the read with `permission_denied`.

### Allowed-write surface

A specialist may write only within its own `workspace_scope`. **No exceptions** in v1.

### Path-safety rules (mandatory for every read AND write)

The runtime applies these rules at every filesystem operation. Any rule violation → `permission_denied`:

1. **Reject absolute paths.** A path starting with `/` (POSIX) or `C:\` / `\\?\` (Windows-style) is rejected outright.
2. **Reject scheme-prefixed paths.** Paths like `file://`, `http://`, etc. are rejected.
3. **Lexical normalization.** `path.normalize()` resolves `.` and `..` segments and collapses redundant separators. After normalization, any `..` remaining (i.e., the path resolves above the workspace root) is rejected.
4. **Realpath resolution.** The runtime calls `realpath()` on the resolved path with **`O_NOFOLLOW`** semantics — symlinks anywhere in the path **fail the operation**. Pipelines that need symlink resolution must declare it explicitly per scope (rare; most don't).
5. **Scope containment check.** After realpath, the resolved path's prefix MUST equal the realpath of the workspace_scope. String prefix comparison is on the canonical path (no normalization differences).
6. **No-cross-device check.** The resolved path's filesystem device MUST match the workspace's device. Bind-mounts pointing outside the tenant boundary are rejected.
7. **Race-free write.** Writes use atomic-rename (`O_TMPFILE` + `linkat`, or write-then-rename) so concurrent reads see either the old or the new file, never a partial. Append operations use `O_APPEND` exclusively.
8. **Write-during-merge lock.** While the orchestrator merges sub-agent results, all writes within the affected scope acquire a write lock. Concurrent writes from the same scope are serialized. Writes from outside the scope are unaffected.

### Conformance fuzzer (mandatory test, see [101](101-conformance.md))

The platform ships a fuzzer that hammers each specialist with adversarial path inputs:

- `../../etc/passwd`, `../../../`, `..%2F..%2Fetc%2Fpasswd` (URL-encoded traversal)
- Symlinks: a workspace symlink pointing at `/etc/passwd`; the runtime must reject the read
- Absolute paths, UNC paths, scheme paths
- Long paths (>4096 chars) and path-component overflow
- Race: spawn 100 concurrent writes to the same path while a sub-agent merge is in progress
- Cross-device: a workspace volume bind-mounted from outside the tenant — fuzzer asserts reads are blocked

A specialist that passes any of these reads fails conformance.

### Scope examples for ECC

| Specialist | workspace_scope |
|---|---|
| intake | `scaffold/` |
| vision-manifest | `manifests/photos/` |
| takeoff | `deliverables/takeoff/` |
| pricing | `deliverables/pricing/` |
| rfq-sealant | `deliverables/rfq/sealant/` |
| narrative | `deliverables/narrative/` |
| pptx | `deliverables/presentation/` |
| qa | `deliverables/qa/` |
| decision-log-compiler | `deliverables/decision-log/` |

Scopes are non-overlapping. Two specialists never write to the same path.

### Privileged specialists

Some specialists need broader scope. ECC's training-loop *reflector* specialist must mutate `skills/` to evolve the skill file based on eval failures. The pipeline manifest declares this explicitly:

```json
{
  "agents": [
    {
      "id": "reflector-specialist",
      "privileged": true,
      "extended_scopes": ["skills/", ".openclaw/architecture.json"]
    }
  ]
}
```

`privileged: true` plus `extended_scopes` is auditable in the manifest. The conformance suite warns when privileged specialists are added (a manual review gate). Most pipelines have zero privileged specialists.

## Memory and config inheritance

A sub-agent inherits:

- **Memory reads**: filtered by lanes declared in the orchestrator's `HandoffContext.memory_lanes` (or all lanes if unspecified). Only `confirmed` and `permanent` entries — same as any agent.
- **Config reads**: full access to all config docs the pipeline declares. The handoff context may include a `config_filter` that pre-narrows queries (e.g., the pricing specialist gets `{ region: "aurora" }` baked into its `ctx.config`).
- **Decision log**: read access to the parent session's decisions (so the specialist can see why it was spawned and what context applies)

A sub-agent writes:

- **Memory**: to its own authority lane (declared in the agent's manifest). Tier-1 writes commit immediately; Tier-2/3 route per [004](004-memory-model.md). The sub-agent does not write to the orchestrator's lane.
- **Config**: never directly. Config writes always go through the review path; sub-agent proposals to mutate config are routed to the doc's owner.
- **Workspace**: scoped per the rules above
- **Decision log**: tagged with its session ID, with `parent_id` pointing at the spawning decision

## SubAgentResult — the return contract

When a sub-agent completes:

```ts
interface SubAgentResult {
  success: boolean;
  files_written: string[];        // workspace-relative paths
  output_summary: string;          // ≤500 chars, surfaced to orchestrator + dashboard
  emitted_events: AgUiEvent[];     // forwarded to dashboard
  decision_count: number;          // total decision-log entries this session produced
  error?: string;                  // populated when success === false
  error_category?: ErrorCategory;  // see 014; populated when failure was classified
  partial_completion?: {           // populated when success: false but progress was made
    completed_steps: string[];
    pending_steps: string[];
  };
}
```

The orchestrator receives `SubAgentResult` and decides next moves. `output_summary` is the one piece the orchestrator's merge logic relies on for human-readable rollups; everything else is structured data.

## Result merging

When multiple sub-agents complete (typically after a fan-out), the orchestrator's `merge-specialist-results` skill aggregates them.

### File conflict detection

```ts
interface FileConflict {
  path: string;
  agents: string[];                 // specialists that wrote to this path
  resolution: ConflictResolution;
}

type ConflictResolution =
  | "last-write-wins"
  | "explicit-merge"   // deferred to v1.1
  | "error";
```

The merger:

1. Collects all `files_written` arrays from completed sub-agents
2. Builds a `path → [agents]` map
3. Detects conflicts where `len(agents) > 1`
4. Applies pipeline-declared resolution policy ([006 merge_policy](006-orchestrator.md#file-conflicts))

### Aggregate status

```ts
interface MergeResult {
  success: boolean;                 // true iff all required sub-agents succeeded
  total_files: number;              // unique paths across all sub-agents
  conflicts: FileConflict[];
  agent_results: Array<{
    specialist: string;
    success: boolean;
    files_written: number;
    output_summary: string;
  }>;
  partial_completion: boolean;       // some succeeded, some failed
  failed_required: string[];         // specialists marked required=true that failed
  failed_optional: string[];          // specialists marked required=false that failed
}
```

A specialist's `required` flag is declared in routing rules. Failed required specialists abort the turn; failed optional specialists are noted but the turn continues.

## Sub-agent in the call tree

The decision log forms a tree. The orchestrator session is the root; each `sub_agent_spawn` creates a branch; tool calls and memory writes within a sub-agent are leaves. The dashboard renders this as a collapsible tree.

```
session_start (orchestrator)
├── turn_start
│   ├── orchestrator_handoff → intake-specialist
│   │   ├── sub_agent_spawn (intake)
│   │   │   ├── tool_execution_start (workspace-read)
│   │   │   ├── tool_execution_end (workspace-read)
│   │   │   ├── tool_execution_start (workspace-write)
│   │   │   └── tool_execution_end (workspace-write)
│   │   └── sub_agent_complete (intake)
│   ├── orchestrator_handoff → vision-manifest-specialist (fan-out)
│   │   ├── sub_agent_spawn (vision-batch-1)
│   │   │   └── ... (4 batches in parallel)
│   │   └── result_merge (vision)
│   └── ...
└── session_end
```

Reconstructing this tree from the decision log requires `parent_id` on every entry. The runtime sets it automatically based on execution context.

## Failure modes and recovery

### Sub-agent crash

If a specialist throws an unhandled exception, the runtime catches it, classifies via [014](014-error-taxonomy.md), emits `sub_agent_complete { success: false, error_category: ... }`, and returns to the orchestrator. The orchestrator decides per its failure policy.

### Sub-agent timeout

If a specialist exceeds its deadline, the runtime emits a `sub_agent_timeout` decision, transitions the sub-agent to `stopped`, and returns to the orchestrator. The orchestrator may retry, skip, abort, or escalate.

### Orchestrator crash mid-merge

If the orchestrator crashes after some sub-agents complete but before merge, the runtime checkpoints just-completed sub-agents (per [012](012-checkpoint.md) `reason: sub_agent_handoff`). Resume picks up the merge step using the persisted `SubAgentResult`s.

### Workspace state drift

If a sub-agent's `workspace_checksum` (per [012](012-checkpoint.md)) doesn't match between spawn and completion, the runtime suspects out-of-band modification and surfaces a `MANIFEST_DRIFT` error to the orchestrator. Pipelines may opt into stricter or looser drift policy.

## Anti-example — common defects

**Sub-agent reading another sub-agent's in-flight workspace:**

```ts
// inside takeoff-specialist
const photoManifest = await ctx.workspace.read(
  "manifests/photos/in-progress/batch-2.json"
);
// ❌ vision-manifest-specialist's workspace; not yet completed/merged
```

The runtime rejects: takeoff has no read access to `manifests/photos/`. The orchestrator merges photo manifests before takeoff sees them; takeoff reads the merged result.

**Sub-agent spawning another sub-agent:**

```ts
// inside takeoff-specialist
await ctx.spawn("rfq-specialist");
// ❌ specialists report results; orchestrator routes
```

Sub-agents do not call `ctx.spawn`. Only the orchestrator does. Specialists return results; the orchestrator decides next steps.

**Specialist writing to architecture.json:**

```ts
// inside narrative-specialist
await ctx.workspace.write(".openclaw/architecture.json", { ... });
// ❌ scope is deliverables/narrative/; .openclaw/ is orchestrator-only
```

The runtime rejects with `permission_denied`. The conformance suite fuzzes specialists with attempts to write the manifest.

**Privileged specialist without manifest declaration:**

```ts
// reflector tries to write to skills/
await ctx.workspace.write("skills/intake/SKILL.md", { ... });
// runtime checks: pipeline manifest doesn't list reflector as privileged for skills/
// ❌ rejected
```

Privileged scopes are explicit in the manifest. The architect refuses to author specialists with implicit privilege.

## Cross-references

- [[002-agent-manifest]] — sub-agents are agents; their manifest is per [002](002-agent-manifest.md)
- [[003-tool-contract]] — sub-agents call tools through the same execution pipeline
- [[004-memory-model]] — sub-agents inherit pipeline memory, write to their own lane
- [[005-decision-log]] — sub-agent lifecycle entries (`sub_agent_spawn`, `sub_agent_complete`, `result_merge`)
- [[006-orchestrator]] — the orchestrator that spawns, scopes, and merges sub-agents
- [[009-config-substrate]] — sub-agents read config; cannot write directly
- [[011-pipeline-manifest]] — privileged specialists, scopes, failure policy declared here
- [[012-checkpoint]] — sub-agent handoff triggers `reason: sub_agent_handoff` checkpoint
- [[013-hooks]] — `sub_agent_spawn`, `sub_agent_complete`, `result_merge` hooks
- [[014-error-taxonomy]] — sub-agent failures classify per the taxonomy
- [[101-conformance]] — fuzzer for scope enforcement and specialist purity

## Open questions for ECC pipeline

- Sub-agents can read pipeline-shared `manifests/photos/` after the vision-manifest's merge, but during the merge there's a window where reads might race. **Tentative**: the runtime gates reads on the merge being complete (a `pending_merge` lock); reads during the lock window block briefly.
- ECC's `qa-specialist` reads every other specialist's output to audit. That's the broadest scope. **Tentative**: declared as `extended_scopes: ["deliverables/"]` (read-only), with the manifest making the read scope explicit.
- The reflector's writes to `skills/` need a Tier-1 review before commit. **Tentative**: reflector's writes go through the same `memory_write_review_required` flow as Tier-2 memory writes, but for skill files. Surfaces in the dashboard's review queue.
