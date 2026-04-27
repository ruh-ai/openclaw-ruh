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

This is **Path A** of the multi-step plan to make the builder produce
v1-conformant artifacts. Path A scope is **single-agent pipelines only**
— `len(agents) === 1`, trivial orchestrator, one Tier-1 memory_authority
row in a generic `main` lane. Multi-agent fleets (Path B) extend the
`agents[]` shape and elicit role-based memory authority; tracked
separately.

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
| `llmProvider` + `llmModel` | optional; appear in `runtime.llm_providers` when both supplied |
| `tenancy`, `egress` | optional; default `'dedicated'` / `'open'` |
| `devStage` | optional; default `'drafted'` |

Output is a JSON object that matches the substrate's `PipelineManifest`
schema (`packages/openclaw-runtime/src/pipeline-manifest/types.ts`).

### Path A shape (single-agent)

- `agents`: exactly one entry — `{ id: 'main', path: 'agents/main/', is_orchestrator: true }`
- `orchestrator.skills`: mirrors `plan.skills[].id`
- `routing`: `{ rules: [], fallback: 'main' }`
- `memory_authority`: `[{ tier: 1, lane: 'main', writers: [operator] }]`
- `runtime.required_integrations`: derived from `plan.integrations[].toolId`; omitted when empty
- `dashboard`: stub reference to `dashboard/manifest.json` — Path B emits the actual manifest
- `hooks`, `custom_hooks`, `config_docs`, `imports`, `merge_policy`: empty
- `failure_policy`: `{}`
- `output_validator`: minimum substrate-acceptable shape with `layers: ['marker']`
- `checksum`: `sha256:<64 zeros>` placeholder; deploy recomputes the real digest

`plan.subAgents` is intentionally ignored in Path A — the manifest stays
single-agent. A regression test pins this so Path B's lift into
`agents[]` lands as a deliberate change.

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
runs `runDeployConformanceCheck()` as the first action in
`handleDeploy`, before the Save step. The helper:

1. Reads `.openclaw/plan/pipeline-manifest.json` from the copilot workspace
2. POSTs to `/api/conformance/check` with `{ pipelineManifest }`
3. Filters out the substrate's `dashboard-manifest-required` finding
   (Path A doesn't emit a dashboard manifest yet — Path B will)
4. Returns the remaining error messages

If any errors remain, `handleDeploy` aborts with `setSaveError(...)`
listing every blocking finding. No Save / Deploy / GitHub work runs.

If the manifest file isn't found at all, the gate is a soft skip with a
console warning. Path B will turn this into a hard block once manifest
emission is on the critical path.

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
  - canonical shape passes `runConformance()` with no fatal findings
  - id derivation (kebab-case from agent name, fallback to `'pipeline'`)
  - `orchestrator.skills` mirrors `plan.skills[].id`
  - exactly one Tier-1 memory_authority row with the operator identity
  - operator identity defaults to `'operator'` when not supplied
  - integrations become `runtime.required_integrations`; omitted when empty
  - `llm_providers` empty when provider/model not supplied
  - tenancy/egress/dev_stage defaults + overrides
  - `subAgents` ignored — Path A still emits single-agent (regression pin)
  - hooks / custom_hooks / config_docs / imports / merge_policy empty
  - checksum carries `sha256:<64-hex>` placeholder
  - generated_at is stable when supplied

## Out of scope (Path B and beyond)

- Multi-agent `agents[]` extension when `plan.subAgents.length > 0`
- Memory model elicitation (per-role authority captured in Think/Plan)
- Dashboard manifest emission so `runConformance()` validates the pair
- Routing rules, merge policy, failure policy when fleets need them
- Backend-side conformance gate at `POST /api/agents/:id/ship` (today
  the gate is frontend-only)
- Real checksum computation at deploy time over the resolved pipeline
  state (placeholder for now)
