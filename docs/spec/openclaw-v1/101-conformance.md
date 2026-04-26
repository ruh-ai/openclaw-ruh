# 101 — Conformance

> **Since:** `1.0.0-alpha.1`
> **Status:** stable

How to verify that a pipeline conforms to OpenClaw Spec v1. Conformance is **not** a stamp granted at review time; it's a continuously-enforced property the runtime checks every load, plus a CI gate that runs structured tests, plus an architect-quality bar for the squishy parts that schemas can't catch.

---

## What conformance means

A pipeline is **conformant** when:

1. Its `pipeline-manifest.json` validates against the v1 schema and every cross-reference resolves
2. Each agent's `architecture.json` validates and reflects current workspace state (checksum match)
3. Every tool, hook, custom panel, and custom marker schema declared is actually present and correctly shaped
4. Tools don't lie about their flags (read-only tools don't write; concurrency-safe tools don't share mutable state)
5. Specialists respect workspace scope (no cross-specialist writes)
6. Memory writes flow through tier/lane authority routing (no unauthorized writes commit)
7. Every retry, classification, and recovery flows through the canonical pipeline (no ad-hoc try/catch)
8. The output validator surfaces diagnostics (no silent drops)
9. The decision log captures every meaningful action (the agent's behavior is reconstructible from the log alone)
10. The architect's quality bar is met for the parts schemas can't enforce (vague souls, missing constraints, generic anti-examples)

Conformance is binary: pipelines either pass all 10 or they don't ship. Partial conformance is non-conformance.

## Three layers of enforcement

### Layer 1 — Runtime validation (every load)

The runtime validates every artifact at load time:

- **Manifest schema validation** — pipeline manifest, agent manifests, tool refs, trigger refs, dashboard manifest
- **Cross-reference resolution** — every `agent_id` referenced exists; every `tool_kind` is registered; every `hook` handler file exists
- **Checksum validation** — manifest checksums match recomputed workspace state
- **Memory authority consistency** — every lane referenced in agents' `authority_lanes` has at least one Tier-1 writer in the pipeline manifest
- **Schema version compatibility** — `spec_version` is supported by the runtime per [100](100-versioning.md)

A failure here surfaces as `manifest_invalid` ([014](014-error-taxonomy.md)) and the pipeline does not load.

### Layer 2 — Conformance test suite (CI gate)

Every pipeline ships a conformance test suite that runs in CI before merge. Categories:

#### Schema conformance

```ts
// Walks every artifact in the workspace, validates against its schema.
test("every artifact validates", async () => {
  for (const path of workspaceArtifacts()) {
    const schema = resolveSchema(path);
    const data = await readArtifact(path);
    expect(validate(schema, data)).toBe(true);
  }
});
```

#### Tool flag honesty (fuzzer)

```ts
// For each read-only tool, snapshot workspace before+after invocation;
// diff = workspace mutation = lying flag.
test("read-only tools don't mutate workspace", async () => {
  for (const tool of toolsByFlag("isReadOnly", true)) {
    const before = await snapshotWorkspace();
    await invokeWithFuzzedInputs(tool);
    const after = await snapshotWorkspace();
    expect(diff(before, after)).toEqual({});
  }
});

// For each concurrency-safe tool, run N copies in parallel, assert deterministic output.
test("concurrency-safe tools tolerate parallel invocation", async () => {
  for (const tool of toolsByFlag("isConcurrencySafe", true)) {
    const inputs = fuzzedInputs(10);
    const results = await Promise.all(inputs.map((i) => tool.call(i, ctx())));
    expect(allDeterministic(results)).toBe(true);
  }
});
```

#### Workspace scope enforcement

```ts
// For each specialist, attempt to write outside its declared scope; assert rejection.
test("specialists cannot write outside scope", async () => {
  for (const specialist of pipelineSpecialists()) {
    const outOfScopePaths = generateOutOfScopePaths(specialist.workspace_scope);
    for (const path of outOfScopePaths) {
      await expect(specialist.write(path, "...")).rejects.toThrow("permission_denied");
    }
  }
});
```

#### Memory authority enforcement

```ts
// For each tier+lane, attempt writes from non-authorized identities; assert rejection.
test("unauthorized memory writes are rejected", async () => {
  for (const { tier, lane } of pipeline.memory_authority) {
    const unauthorized = generateUnauthorizedWriters(pipeline);
    for (const writer of unauthorized) {
      await expect(memory.write(tier, lane, writer, ...)).rejects.toThrow("permission_denied");
    }
  }
});
```

#### Decision-log completeness

```ts
// Run a representative session; assert the call tree is reconstructible.
test("decision log lets us reconstruct a turn", async () => {
  const session = await runRepresentativeSession();
  const decisions = await query.decisionLog({ session_id: session.id });
  const tree = buildCallTree(decisions);
  expect(tree.complete).toBe(true);
  expect(tree.orphans).toEqual([]);  // no parent_id pointing nowhere
  expect(tree.root.type).toBe("session_start");
});
```

#### Output-validator diagnostics

```ts
// Feed the validator malformed markers; assert diagnostics fire.
test("malformed markers produce diagnostics, not silent drops", async () => {
  const malformed = "<plan_skill id=\"\" name=\"X\"/>";
  const events = await output_validator.feed(malformed);
  expect(events).toEqual([]);  // no successful event
  const diagnostics = await query.decisionLog({ types: ["output_validation_failed"] });
  expect(diagnostics.length).toBeGreaterThan(0);
});
```

#### Idempotency of re-runnable skills

```ts
// Chaos test: interrupt random skills mid-execution; assert re-run produces same final state.
test("skills are idempotent across resume", async () => {
  for (const skill of pipelineSkills()) {
    const initialState = await snapshotState();
    const interruption = randomInterruption(skill);
    await runWithInterruption(skill, interruption);
    const finalStateA = await snapshotState();
    
    // Reset, run cleanly to compare
    await restore(initialState);
    await runCleanly(skill);
    const finalStateB = await snapshotState();
    
    expect(finalStateA).toEqual(finalStateB);
  }
});
```

#### Spec evolution (for spec PRs)

```ts
// Verify minor/patch bumps don't violate backward compatibility.
test("no required field added", () => {
  const prevSchema = loadSchemaAtVersion(previousVersion);
  const currSchema = loadSchemaAtVersion(currentVersion);
  expect(newRequiredFields(prevSchema, currSchema)).toEqual([]);
});

test("no enum value removed", () => {
  expect(removedEnumValues(prevSchema, currSchema)).toEqual([]);
});

test("no validation tightened", () => {
  expect(tightenedConstraints(prevSchema, currSchema)).toEqual([]);
});
```

### Layer 3 — Architect quality bar (for the squishy parts)

Schemas catch structural defects but not semantic ones:

- A SOUL with `tone: ["helpful"]` and `forbidden: []` passes the schema. The architect must refuse to ship souls this generic.
- An eval task with `acceptance_threshold: 0.1` passes the schema. The architect warns when thresholds are below 0.5.
- A skill with a one-word `## Methodology` passes the schema. The architect rejects skills without methodologies.

The architect (the coding agent producing OpenClaw artifacts) carries an explicit quality bar above the schema's. It refuses to ship artifacts that pass the schema but fail the bar:

| Rule | Check |
|---|---|
| **Specific tone** | `voice.tone` has ≥2 adjectives that aren't all generic ("helpful", "friendly") |
| **Non-empty forbidden** | `voice.forbidden` lists at least one concrete behavior |
| **Methodology depth** | Each `## Methodology` section is ≥3 sentences, not bullet-stub or one-liner |
| **Constraints declared** | `## Constraints` section is non-empty |
| **Eval thresholds reasonable** | `acceptance_threshold` ≥ 0.5 unless the task is exploratory |
| **Anti-examples present** | Every spec section has ≥1 anti-example illustrating the spirit (this spec does) |
| **Realistic deadlines** | `OrchestratorHandoff.deadline` is achievable based on the specialist's typical latency |
| **Identity-aware ingestion** | Memory writes from external channels (email) authenticate the channel before extracting source_identity |
| **No baked-in numbers** | Skill prompts don't contain literal labor rates, jurisdictional taxes, or any data that should be in config |

The architect emits warnings for soft violations and refuses for hard violations. The conformance suite includes a "architect quality" runner that re-runs the architect's checks externally.

## Custom-artifact security review

Pipelines may register **custom** tool kinds, hook payloads, dashboard panels, and marker schemas. Each goes through a security review before merge.

### Custom tool kinds

A custom tool kind exposes new capabilities (filesystem, network, compute) the canonical kinds don't. Review checks:

- Threat model documented (what damage could a malicious input cause?)
- Permission flags accurate (the fuzzer verifies)
- Credentials handling proper (no secrets in error messages, decision-log metadata, or panel data)
- Rate-limiting and abuse defenses in place

The architect refuses to register a custom tool kind without a `security_reviewed_by` and `security_reviewed_at` field.

### Custom panels

A custom panel is a UI component with its own React/Tailwind code. Review checks:

- No XSS surface (data sources properly escaped)
- Permission gating consistent with declared `role_visibility`
- Action handlers trace back to canonical action kinds (no raw HTTP calls bypassing the runtime API)
- No external network requests outside declared sources

### Custom hooks

A custom hook fires from skill code and is observed by handlers. Review checks:

- Payload schema declared and matches what's actually fired
- No secrets in payload (the redaction layer doesn't apply to custom hooks unless declared)
- Firing rate bounded (no unbounded loops emitting hooks)

## The conformance gate

A pipeline ships when:

1. **All Layer 1 validations pass** at runtime load (continuously checked)
2. **All Layer 2 tests pass** in CI (gated on every commit to the pipeline workspace)
3. **All Layer 3 architect-quality checks pass** at architect-run time (or the architect's warnings are explicitly waived by a human reviewer with the waiver logged)
4. **Eval suite passes its threshold** ([008](008-eval-task.md))
5. **Custom artifacts have security review** with timestamp + reviewer

Pipelines that pass become eligible for `dev_stage: shipped`. Pipelines that fail any item are blocked. There is no "partial ship" — the system is either conformant and live, or non-conformant and pre-ship.

## Conformance failures and fixes

When conformance fails:

1. **Runtime validation failure** → `manifest_invalid` error. The runtime surfaces the rule that failed and the divergent artifact. The architect (or human) regenerates the relevant manifests / files until validation passes. Re-load.

2. **CI test failure** → CI surfaces the failing test plus the reproduction. Common fixes:
   - Schema mismatch → fix the artifact
   - Tool flag dishonesty → fix the tool implementation OR fix the declared flag
   - Scope violation → fix the specialist's writes (most common: write to a path it shouldn't)
   - Memory authority violation → fix the manifest's `memory_authority` OR the specialist's `authority_lanes`

3. **Architect quality failure** → architect emits the warning + a fix proposal. Human reviewer either accepts the proposal or waives explicitly (waiver logged with reason).

4. **Eval suite failure** → either improve the agent until eval passes, OR adjust eval acceptance thresholds (with reviewer approval), OR mark some tasks as `manual` (human-evaluated, with rationale).

5. **Custom-artifact security review failure** → the artifact is rejected pending review. Pipeline can ship without it (if optional) or wait (if required).

## Examples — what passes, what fails

### Pass — minimal conformant single-agent pipeline

The example at `examples/single-agent-minimal/` (Phase 4 deliverable) walks through a complete pipeline that passes all conformance layers. ~30 files; ~500 LOC across all artifacts. Demonstrates that conformance is achievable without heroics.

### Pass — ECC estimator pipeline

The example at `examples/ecc-estimator-pipeline/` (Phase 4 deliverable) is the proving case. Multi-agent (12 agents), tier/lane memory, multi-dimensional config, 200-project eval suite, bespoke dashboard, on-prem runtime. Demonstrates that conformance scales to real customer pipelines.

### Fail — pipelines that look fine but aren't

Common patterns the conformance suite catches:

- **The "implicit Tier-2 writer" pattern.** A specialist's `authority_lanes: [estimating]` (declares Tier-1) but the pipeline manifest's `memory_authority` only lists this specialist at Tier-2. Failure: writes route as Tier-2 (flagged), but the specialist's prompt assumes its writes commit immediately. The conformance suite cross-checks `authority_lanes` declarations against `memory_authority` and surfaces the mismatch.

- **The "convenience overwrite" pattern.** A specialist needs to update `architecture.json` to reflect a runtime change. Direct write fails (scope). Specialist returns the change as part of `output_summary`. Orchestrator reads, regenerates manifest, commits. The conformance suite verifies no specialist writes `.openclaw/architecture.json` directly.

- **The "silent reflective" pattern.** A skill computes labor rates from "general knowledge" rather than reading config. Test passes deterministically because the LLM happens to answer correctly. The conformance suite includes a config-shadowing fuzzer: changes config, asserts agent output changes accordingly. Skills that ignore config are caught.

## Cross-references

- [[002-agent-manifest]] — manifest validation
- [[003-tool-contract]] — tool-flag fuzzer
- [[004-memory-model]] — memory-authority cross-checks
- [[005-decision-log]] — call-tree completeness
- [[006-orchestrator]], [[007-sub-agent]] — scope and merge enforcement
- [[008-eval-task]] — eval suite as part of conformance
- [[009-config-substrate]] — config-shadowing fuzzer
- [[010-dashboard-panels]] — custom-panel review
- [[011-pipeline-manifest]] — pipeline-level validation rules
- [[013-hooks]] — handler purity tests
- [[014-error-taxonomy]] — `manifest_invalid` and others
- [[015-output-validator]] — diagnostic-not-silent-drop tests
- [[100-versioning]] — schema-evolution tests gate spec PRs

## Open questions for v1 evolution

- The chaos-test fuzzer (idempotency under interruption) is expensive — a few minutes per skill. Run on every PR, or nightly, or per-release? **Tentative**: per-release for v1; v1.1 makes it incremental (only fuzz changed skills).
- Architect quality rules drift over time as we learn what fails in production. Keep them in this section, or move to a separate `quality-bar.md`? **Tentative**: keep in 101 for now; move when the list exceeds ~20 items.
- For pipelines targeting older minor versions (e.g., a `1.2.0` pipeline running on a `1.4.0` runtime), do we run the conformance suite at the pipeline's target version or the runtime's current version? **Tentative**: pipeline's target version; the runtime maintains schema definitions for every supported minor.
