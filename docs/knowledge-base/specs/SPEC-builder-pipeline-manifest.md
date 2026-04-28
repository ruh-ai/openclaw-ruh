# SPEC: Builder Pipeline Manifest Emission + Conformance Gate

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[004-api-reference]] | [[SPEC-agent-creation-lifecycle]]

## Status

implemented

## Summary

The agent builder now derives a v1-conformant `pipeline-manifest.json`
from each completed `ArchitecturePlan` and writes it to the agent's
workspace alongside `architecture.json`. The Ship stage validates that
manifest against the OpenClaw v1 spec via `POST /api/conformance/check`
before deploy, blocking on substrate-level errors.

**Path A (shipped)** — single-agent pipelines: `len(agents) === 1`,
trivial orchestrator, one Tier-1 memory_authority row in a generic
`main` lane.

**Path B Slice 1 (shipped)** — multi-agent fleet emission: when
`plan.subAgents` is populated, the manifest grows into a fleet shape —
`agents[]` carries the main orchestrator plus one entry per sub-agent,
`routing.rules` are derived from each sub-agent's trigger,
`failure_policy` defaults to `retry-then-escalate` per sub-agent, and
`memory_authority` gets one Tier-1 row per sub-agent (lane = sub-agent
id, operator as the writer). Empty `subAgents` preserves the Path A
single-agent shape exactly.

**Path B Slice 2 (shipped)** — architect's Plan instruction now elicits
fleets. The `PLAN_SYSTEM_INSTRUCTION` includes a new `<plan_sub_agents>`
section that the architect emits ONLY when the TRD describes a workflow
needing separate specialist agents. `extractPlanMarkers` parses the
emission, `consumePlanSubAgents` routes it into the architecture plan's
`subAgents` field via `updateArchitecturePlanSection`, and Slice 1's
manifest builder picks it up automatically.

**Path B Slice 4 (shipped)** — per-role memory authority captured from
the TRD. The architect emits `<plan_memory_authority>` ONLY when the TRD
names domain authorities (e.g., ECC's "Darrow is the lead estimator").
Each row carries `tier` (1/2/3), `lane` (kebab-case domain), and
`writers[]` (identity strings). When elicited, the manifest carries the
rows verbatim; when absent, the manifest falls back to the previous
default (one Tier-1 'main' lane row with the operator as writer, plus
one row per sub-agent for fleets).

**Path B Slice 3 (shipped)** — Build pipeline decomposes across sub-agents.
When the architect emitted a fleet, the **identity** and **skills**
specialists run once per agent (main orchestrator + each sub-agent). Each
run targets `agents/<id>/SOUL.md`, `agents/<id>/AGENTS.md`,
`agents/<id>/skills/<skill-id>/SKILL.md` etc. instead of root paths. The
main orchestrator owns skills NOT claimed by any sub-agent; sub-agents
own the skills the architect assigned via `<plan_sub_agents>.skills[]`.
Pipeline-level specialists (database, backend, dashboard, verify, scaffold)
stay shared — one DB schema, one HTTP service, one dashboard for the
whole fleet. Single-agent pipelines (`subAgents` empty) preserve the
existing root-level paths exactly.

After Slice 3, fleet pipelines build end-to-end through the platform.
The remaining gap to ECC is customer-side assets (Darrow's interview,
photos, rates tables) — not platform work.

## Related Notes

- [[008-agent-builder-ui]] — Plan stage event flow + Ship stage UI
- [[004-api-reference]] — `POST /api/conformance/check` endpoint
- [[SPEC-agent-creation-lifecycle]] — full 7-stage lifecycle reference
- [[SPEC-agent-creation-v3-build-pipeline]] — Plan stage architecture.json contract
- The runtime substrate package (`packages/openclaw-runtime/`) — owns
  the canonical `PipelineManifest` shape and `runConformance()`

## Specification

### Manifest derivation

`agent-builder-ui/lib/openclaw/pipeline-manifest-builder.ts` exports:

```ts
export function buildPipelineManifest(
  args: BuildPipelineManifestArgs,
): unknown;
```

Pure function. No I/O, no LLM calls. Inputs:

| Field | Source |
|---|---|
| `agentName`, `agentDescription` | copilot store `name` + `description` |
| `plan` | `ArchitecturePlan` from copilot store |
| `operatorIdentity` | optional; defaults to `'operator'` |
| `llmProvider` + `llmModel` | optional; populate `runtime.llm_providers[0]` when both supplied. **When omitted, the builder defaults to a single `{ provider: "anthropic", model: "claude-opus-4-7", via: "tenant-proxy" }` entry** to keep the manifest schema-valid (the substrate's `RuntimeRequirements.llm_providers` requires a non-empty array). Path B replaces this default with the real per-agent selection once the agent record carries provider/model through to Plan-complete. |
| `tenancy`, `egress` | optional; default `'dedicated'` / `'open'` |
| `devStage` | optional; default `'drafted'` |

Output is a JSON object that matches the substrate's `PipelineManifest`
schema (`packages/openclaw-runtime/src/pipeline-manifest/types.ts`).

### Path A shape (single-agent — `plan.subAgents` empty)

- `agents`: exactly one entry — `{ id: 'main', path: 'agents/main/', role: 'Single-agent pipeline', is_orchestrator: true }`
- `orchestrator.skills`: mirrors `plan.skills[].id`
- `routing`: `{ rules: [], fallback: 'main' }`
- `memory_authority`: `[{ tier: 1, lane: 'main', writers: [operator] }]`
- `runtime.required_integrations`: derived from `plan.integrations[].toolId`; omitted when empty
- `dashboard`: stub reference to `dashboard/manifest.json` — Path B emits the actual manifest
- `hooks`, `custom_hooks`, `config_docs`, `imports`, `merge_policy`: empty
- `failure_policy`: `{}`
- `output_validator`: minimum substrate-acceptable shape with `layers: ['marker']`
- `checksum`: `sha256:<64 zeros>` placeholder; deploy recomputes the real digest

### Path B Slice 1 shape (fleet — `plan.subAgents` non-empty)

When the architect populates `plan.subAgents`, the manifest grows from
the Path A shape:

- **`agents`** = `[main, ...subAgents]`:
  - main flips its role from `'Single-agent pipeline'` to `'Pipeline orchestrator'`; `is_orchestrator: true` stays.
  - Each sub-agent contributes one entry: `{ id: sa.id, path: 'agents/<sa.id>/', version, role: sa.description || sa.name }`.
  - Sub-agents NEVER carry `is_orchestrator: true` — the substrate pins exactly one orchestrator per pipeline; main owns it.
- **`routing.rules`**: one rule per sub-agent with a non-empty `trigger`:
  ```json
  { "match": { "stage": "<sa.trigger>" }, "specialist": "<sa.id>" }
  ```
  Sub-agents with empty triggers fall through to `routing.fallback` (`'main'`).
- **`failure_policy`**: `{ <sa.id>: 'retry-then-escalate' }` per sub-agent. Path B Slice 2 will let the architect override per-agent.
- **`memory_authority`**: `[{tier:1, lane:'main', writers:[operator]}, ...{tier:1, lane:'<sa.id>', writers:[operator]}]`. Each sub-agent gets its own lane so writes from one specialist don't overwrite another's. Operator stays the only writer until Path B Slice 4 captures real per-role identity.

`plan.subAgents` is parsed by [`plan-formatter.ts`](../../../agent-builder-ui/lib/openclaw/plan-formatter.ts) as `SubAgentConfig[]` — id, name, description, type, skills, trigger, autonomy. **As of Slice 2** the architect's Plan instruction elicits sub-agents when the TRD describes a workflow needing separate specialists.

### Path B Slice 2 — `<plan_sub_agents>` marker (architect emits fleets)

`PLAN_SYSTEM_INSTRUCTION` now includes a sub-agents section. The architect emits ONLY when the TRD describes a multi-specialist workflow:

```
<plan_sub_agents subAgents='[{"id":"intake","name":"Intake","description":"Parse RFP","type":"specialist","skills":["parse-rfp"],"trigger":"intake","autonomy":"fully_autonomous"}]'/>
```

**Single-agent guardrail in the prompt:** *"Most agents are single-agent — leave subAgents empty and DO NOT emit this marker."* The instruction explicitly resists turning everything into a fleet.

Wiring:
- `PLAN_SUB_AGENTS_RE` regex in `extractPlanMarkers` (alongside `plan_skills`, `plan_workflow`, etc.)
- `CustomEventName.PLAN_SUB_AGENTS = "plan_sub_agents"`
- `consumePlanSubAgents` calls the existing `consumePlanSection` helper, routing the parsed array into `architecturePlan.subAgents` via `updateArchitecturePlanSection`
- The Slice 1 manifest builder picks it up automatically — no further plumbing required

### Path B Slice 4 — `<plan_memory_authority>` marker (per-role authority)

Same emission pattern, different domain. The architect emits ONLY when the TRD names domain authorities:

```
<plan_memory_authority memoryAuthority='[{"tier":1,"lane":"estimating","writers":["darrow@ecc.com"]},{"tier":1,"lane":"business","writers":["matt@ecc.com"]},{"tier":3,"lane":"estimating","writers":["regional-1@ecc.com"]}]'/>
```

**Single-operator guardrail in the prompt:** *"Do NOT make up authority figures; do NOT emit this marker for single-operator agents."*

`plan-formatter.ts::normalizeMemoryAuthority`:
- Validates each row (tier ∈ {1,2,3}, non-empty lane, non-empty writers)
- Drops malformed rows silently rather than failing the whole plan
- Returns `undefined` (NOT empty array) when nothing parseable is present, so the manifest builder distinguishes "elicited but empty" from "not emitted"

`pipeline-manifest-builder.ts`:
- When `plan.memoryAuthority` is non-empty, manifest carries the rows verbatim
- When absent or empty, falls back to Slice 1's default (one Tier-1 'main' lane row with operator + one row per sub-agent)
- Substrate's `MemoryAuthorityRow` shape and `ArchitecturePlanMemoryAuthorityRow` are structurally compatible — the rows pass through without translation

### Path B Slice 3 — Build pipeline decomposition

Implementation lives in `ruh-backend/src/agentBuild.ts` and
`ruh-backend/src/specialistPrompts.ts`. Frontend
`agent-builder-ui/lib/openclaw/build-orchestrator.ts` is vestigial and
not on the production path — it is intentionally NOT updated.

`getAgentTargets(plan, agentName)`:
- Returns `null` for single-agent (`plan.subAgents` empty) — preserves
  the existing one-task-per-specialist shape exactly.
- Returns `[{id:'main', isOrchestrator:true, …}, ...{from each sub-agent}]`
  for fleets.
- Main orchestrator owns the skills NOT claimed by any sub-agent.

`runAgentBuild` builds a `plannedTasks` list. For each pipeline-level
specialist (database, backend, dashboard, verify, scaffold) it adds one
entry. For each per-agent specialist (identity, skills) it adds one
entry per `TargetAgent` when fleet, one entry without target for
single-agent.

`BuildManifestTask.targetAgentId` is set on per-agent runs, absent for
pipeline-level. `findTask(specialist, targetId?)` matches on both fields
so multiple identity tasks (`identity-main`, `identity-intake`,
`identity-takeoff`) coexist in a single manifest without colliding.

`expectedFilesForSpecialist(specialist, plan, target?)` routes per-agent
specialists under `agents/<id>/` and filters skills by
`target.skills.includes(s.id)`. Pipeline-level specialists ignore the
target argument.

Both prompt builders (`buildIdentityPrompt`, `buildSkillHandlerPrompt`)
gain an optional `target` parameter:
- Without target: existing single-agent prompt (root paths, all skills).
- With target: prompt explicitly states the agent's id, role, and
  whether it's the orchestrator or a specialist; instructs the LLM to
  write files at `agents/<id>/`; for skills, restricts to the target's
  owned skills.

### Emission point

`agent-builder-ui/lib/openclaw/ag-ui/event-consumer-map.ts ::
consumePlanComplete` calls `emitPipelineManifest()` after the
`ArchitecturePlan` is loaded into the copilot store (whether from the
incremental markers or recovered from disk). The manifest is written to
`.openclaw/plan/pipeline-manifest.json` in the **copilot workspace**.
The existing `mergeWorkspaceCopilotToMain()` step in `ruh-backend`'s
build pipeline copies it into the main agent workspace alongside
`architecture.json`.

Failures in manifest emission are logged as
`plan_complete:pipeline_manifest_write_failed` traces but never throw —
the plan is still usable for Build, and the Ship-stage conformance
gate surfaces a missing/invalid manifest loudly.

### Ship-stage conformance gate

`StageShip` in
`agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`
calls `runDeployConformanceCheck()` (from
`agent-builder-ui/lib/openclaw/ship-conformance-check.ts`) as the first
action in `handleDeploy`, before the Save step. The gate returns a
discriminated outcome:

- `{ status: "ok" }` — manifest validates, deploy proceeds
- `{ status: "skipped" }` — manifest absent in workspace (Path A
  soft-skip; Path B will harden into a block)
- `{ status: "blocked", reasons: string[] }` — deploy MUST NOT proceed.
  Used both for substrate-reported errors AND for any infrastructure
  failure that prevented validation from running.

Internally the gate:

1. Reads `.openclaw/plan/pipeline-manifest.json` via
   `strictReadWorkspaceFile()` — copilot workspace first, falling back to
   main workspace
2. POSTs to `/api/conformance/check` with `{ pipelineManifest }`
3. Filters out the substrate's `dashboard-manifest-required` finding
   (Path A doesn't emit a dashboard manifest yet — Path B will)
4. Returns the remaining error messages

The gate **fails closed** on every infrastructure failure path:

| Failure | Outcome |
|---|---|
| Workspace read returns 404 in copilot AND main | `skipped` (legit absence) |
| Workspace read returns 401/403 (auth dropped) | `blocked` |
| Workspace read returns 5xx | `blocked` |
| Workspace returns 200 with non-JSON body | `blocked` |
| Workspace returns 200 with no `content` field | `blocked` |
| Manifest JSON parse fails | `blocked` |
| `/api/conformance/check` network failure | `blocked` |
| `/api/conformance/check` returns non-OK status | `blocked` |
| Conformance response not JSON / missing `report.findings[]` | `blocked` |
| Substrate reports any error finding (excl. `dashboard-manifest-required`) | `blocked` |

The gate intentionally does NOT use the shared
`workspace-writer.ts::readWorkspaceFile` helper. That helper collapses
every error to `null` so UI display callers can render a uniform "no
content" state. Reusing it here would let a 401 or 5xx mid-deploy
silently look like a missing manifest, which the gate would then treat
as a soft-skip — bypassing conformance without the operator ever
knowing.

### Authoring contract

This contract is intentionally narrow:

- The architect's prompts are unchanged. The manifest is derived, not
  emitted by the LLM.
- The substrate is the authority on what's valid. The builder does not
  re-implement validation rules — it calls `runConformance()` through
  the existing `/api/conformance/check` HTTP boundary.
- Path B work — multi-agent `agents[]`, real memory authority
  elicitation, dashboard manifest emission, removing the soft-skip
  semantics of the gate — replaces parts of this spec rather than
  extending it. Each Path B PR is expected to update this note.

## Tests

- `agent-builder-ui/lib/openclaw/pipeline-manifest-builder.test.ts`:

  Substrate conformance + derivation rules:
  - canonical (single-agent) shape passes `runConformance()` with no fatal findings
  - id derivation (kebab-case from agent name, fallback to `'pipeline'`)
  - `orchestrator.skills` mirrors `plan.skills[].id`
  - exactly one Tier-1 memory_authority row with the operator identity (single-agent)
  - operator identity defaults to `'operator'` when not supplied
  - integrations become `runtime.required_integrations`; omitted when empty
  - `llm_providers` defaults to `[{anthropic, claude-opus-4-7, tenant-proxy}]` when provider/model not supplied (substrate requires non-empty array)
  - default-emit (no llm args) round-trips through `runConformance()` with no fatal findings
  - tenancy/egress/dev_stage defaults + overrides
  - checksum carries `sha256:<64-hex>` placeholder
  - generated_at is stable when supplied

  Single-agent shape (Path A preserved):
  - empty `subAgents` → exactly one agent with role `'Single-agent pipeline'`
  - empty `subAgents` → empty `routing.rules`, empty `failure_policy`, single memory row in `'main'` lane
  - hooks / custom_hooks / config_docs / imports / merge_policy empty

  Multi-agent fleet (Path B Slice 1):
  - `agents[]` = main orchestrator + one entry per sub-agent (declaration order preserved)
  - main role flips from `'Single-agent pipeline'` to `'Pipeline orchestrator'` when fleet emerges
  - sub-agents NEVER carry `is_orchestrator: true`
  - `routing.rules` emitted only for sub-agents with non-empty trigger; rest fall through to fallback
  - `failure_policy` carries one entry per sub-agent (default `retry-then-escalate`)
  - `memory_authority` carries one row per agent (main + each sub-agent), operator as writer in every row (when no elicited authority)
  - multi-agent manifest passes `runConformance()` with no fatal findings

  Path B Slice 4 — elicited memory authority:
  - elicited authority is passed through verbatim in declaration order
  - default fallback when `plan.memoryAuthority` is undefined OR empty array
  - elicited authority overrides per-sub-agent default rows (fleet pipeline)
  - manifest with multi-tier elicited authority passes `runConformance()`

- `agent-builder-ui/lib/openclaw/plan-formatter.test.ts`:
  - subAgents normalized from architect's structured emission
  - subAgents accepted as string-shorthand with synthesized ids
  - missing subAgents → empty array
  - memoryAuthority normalized from a multi-tier emission, order preserved
  - missing memoryAuthority → undefined (manifest fallback path)
  - empty array memoryAuthority → undefined (treated as "not emitted")
  - rows with missing tier / out-of-range tier / no lane / no writers dropped
  - non-string writers filtered out at the row level
  - all-rows-invalid → undefined (no empty array leaks through)

- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts`:
  - `PLAN_SYSTEM_INSTRUCTION` instructs architect to emit `<plan_sub_agents>` ONLY for fleets (single-agent guardrail in the text)
  - `PLAN_SYSTEM_INSTRUCTION` instructs architect to emit `<plan_memory_authority>` ONLY when TRD names authorities (don't-make-up guardrail)
  - `CustomEventName.PLAN_SUB_AGENTS` and `PLAN_MEMORY_AUTHORITY` registered

- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts`:
  - `dispatchCustomEvent('plan_sub_agents', …)` updates `architecturePlan.subAgents`
  - `dispatchCustomEvent('plan_memory_authority', …)` updates `architecturePlan.memoryAuthority`

- `ruh-backend/tests/unit/agentBuildFleet.test.ts` (Path B Slice 3):
  - `getAgentTargets` returns `null` for single-agent, `[main, ...subs]` for fleet
  - main orchestrator owns skills NOT claimed by any sub-agent
  - sub-agent role falls back from description → name when description empty
  - `expectedFilesForSpecialist` returns root paths when no target (single-agent regression pin)
  - `expectedFilesForSpecialist` routes identity to `agents/<id>/SOUL.md` (et al.) with target
  - `expectedFilesForSpecialist` filters skills to `target.skills` AND uses `agents/<id>/skills/` prefix
  - pipeline-level specialists (database, backend) ignore target
  - identity prompt distinguishes `PIPELINE ORCHESTRATOR` from `SPECIALIST` based on `target.isOrchestrator`
  - skills prompt scoped to a target excludes other agents' skills
  - identity + skills prompts unchanged when no target supplied (single-agent regression pins)
  - database + backend prompts identical with/without target

## Out of scope (beyond Path B)

- **Backend-side conformance gate** at `POST /api/agents/:id/ship` — today the gate is frontend-only.
- **Real checksum** computation at deploy time over the resolved pipeline state — currently a placeholder.
- **Dashboard manifest emission** so the conformance gate validates the pair instead of filtering `dashboard-manifest-required`.
- **Routing rules richer than stage-match** — sequential `specialists`, parallel `fan_out`, `then` chains.
- **`merge_policy` rules** for cross-specialist merging in fleets.
- **Per-sub-agent failure policy** — today every sub-agent gets `retry-then-escalate`. Future slice could let the architect override per-agent.
- **Cross-agent integration tests** that actually boot a fleet sandbox and verify the orchestrator routes correctly.
- Dashboard manifest emission so `runConformance()` validates the pair
- Routing rules richer than stage-match (sequential `specialists`, `fan_out`, `then` chains)
- `merge_policy` rules when fleets actually need cross-specialist merging
- Backend-side conformance gate at `POST /api/agents/:id/ship` (today the gate is frontend-only)
- Real checksum computation at deploy time over the resolved pipeline state (placeholder for now)
