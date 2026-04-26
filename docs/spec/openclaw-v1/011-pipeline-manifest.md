# 011 — Pipeline Manifest

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/pipeline-manifest.schema.json`](schemas/pipeline-manifest.schema.json)

The **pipeline manifest** is the top-level artifact that defines a complete OpenClaw pipeline. It declares the agents, the orchestrator, shared memory authority, configuration docs, dashboard surface, eval suite, hooks, and runtime requirements — everything the runtime needs to load and execute the pipeline as a single unit.

A pipeline ships as: this manifest + the agent workspaces it references + the supporting files (panels, hooks, config docs, eval tasks, schemas).

---

## Purpose

Without a top-level manifest, a pipeline is a directory of independent agents that happen to live near each other. With it, a pipeline is a versioned, deployable, conformant unit:

- The runtime loads one file (`pipeline-manifest.json`), validates it against the schema, then resolves all references
- Coding agents authoring extensions know exactly what shape to produce
- Operators deploying to a customer tenant ship one artifact (the manifest + its workspace)
- Reviewers see a single document that summarizes the full pipeline

**Single agents are pipelines with `len(agents) == 1` and a trivial orchestrator.** The same machinery applies; the smallest case is one node.

## Filesystem layout

A pipeline workspace looks like:

```
<pipeline-workspace>/
├── pipeline-manifest.json        # required — this section
├── agents/
│   ├── orchestrator/             # one agent workspace per agent
│   │   ├── SOUL.md
│   │   ├── skills/
│   │   ├── tools/
│   │   ├── triggers/
│   │   └── .openclaw/
│   ├── intake-specialist/
│   ├── takeoff-specialist/
│   └── ...
├── config/                        # shared configuration docs (per 009)
│   ├── manifest.json
│   ├── labor-rates/
│   └── ...
├── eval/                          # eval suite (per 008)
│   ├── tasks.json
│   └── fixtures/
├── dashboard/                     # bespoke dashboard panels (per 010)
│   ├── manifest.json
│   └── panels/
├── hooks/                         # hook handler implementations (per 013)
│   └── *.ts
├── schemas/                       # custom schemas (deliverables, custom hooks, custom tools)
│   └── *.schema.json
└── tests/                         # contract + integration tests
    └── ...
```

The manifest references every directory above by relative path.

> **Path convention note.** Inside `pipeline-manifest.json` and other artifacts in the *pipeline workspace*, `schemas/X.schema.json` refers to **the pipeline's own** `schemas/` directory at the workspace root — for custom marker schemas, custom-hook payload schemas, custom config doc schemas, etc. Inside *spec markdown* (the documents you're reading), `schemas/X.schema.json` references the **spec's** `schemas/` directory (the canonical platform schemas). When a section quotes JSON manifest fragments, treat `schemas/...` paths as pipeline-local; when it quotes section text or cross-refs, treat them as spec-local. Custom marker / hook / config schemas referenced in pipeline manifests (e.g., `schemas/takeoff-reading.schema.json`, `schemas/rfq-shipped-payload.schema.json`, `schemas/deliverable.schema.json`) are pipeline-local and are not shipped as platform schemas.

## Top-level shape

```ts
interface PipelineManifest {
  // ── Identity ───────────────────────────────────────
  id: string;                              // kebab-case unique identifier (e.g., "ecc-estimator")
  spec_version: string;                    // OpenClaw spec version this pipeline targets
  version: string;                         // pipeline's own semver
  name: string;                            // human-readable
  description: string;                     // one-paragraph summary

  // ── Composition ────────────────────────────────────
  agents: AgentRef[];                      // every agent in the pipeline
  orchestrator: OrchestratorRef;           // pointer to the orchestrating agent

  // ── Routing & coordination ─────────────────────────
  routing: RoutingRules;                   // declarative rules the orchestrator consults
  failure_policy: Record<string, FailurePolicy>;  // per-specialist failure handling
  merge_policy: MergePolicyRule[];          // file-conflict resolution per path glob

  // ── Memory & config ────────────────────────────────
  memory_authority: MemoryAuthority[];     // tier+lane → identities mapping (per 004)
  config_docs: ConfigDocRef[];             // shared config docs (per 009)
  imports: ImportJob[];                    // scheduled config imports

  // ── Output validation ──────────────────────────────
  output_validator: OutputValidatorConfig; // marker schemas, layers, threshold (per 015)

  // ── Surface ────────────────────────────────────────
  dashboard: DashboardRef;                 // bespoke dashboard config (per 010)

  // ── Verification ───────────────────────────────────
  eval_suite_ref: string;                  // path to eval suite (per 008)
  convergence_loop?: ConvergenceLoopConfig; // when training-mode applies

  // ── Extensibility ──────────────────────────────────
  hooks: HookHandlerRegistration[];        // pipeline-scoped hooks (per 013)
  custom_hooks: CustomHookDeclaration[];   // custom hook namespace declarations
  custom_tool_kinds?: CustomToolKind[];    // custom tool kinds registered by this pipeline

  // ── Runtime ────────────────────────────────────────
  retry_overrides?: PipelineRetryOverrides; // per-category retry config overrides (per 014)
  runtime: RuntimeRequirements;             // tenancy, on-prem, image, resources

  // ── Lifecycle ──────────────────────────────────────
  dev_stage: AgentDevStage;                // current pipeline stage (drafted/validated/tested/shipped)

  // ── Provenance ─────────────────────────────────────
  generated_at: string;                    // ISO-8601
  generated_by: string;                    // architect@<spec-version>
  checksum: string;                        // sha256 of resolved pipeline state
}
```

Every field is documented in the JSON Schema; this section walks through the consequential ones.

## `agents[]` — the cast

```json
{
  "agents": [
    {
      "id": "orchestrator",
      "path": "agents/orchestrator/",
      "version": "0.1.0",
      "role": "Pipeline orchestrator",
      "is_orchestrator": true
    },
    {
      "id": "intake-specialist",
      "path": "agents/intake-specialist/",
      "version": "0.4.2",
      "role": "Parse incoming RFPs and seed the pipeline",
      "privileged": false
    },
    {
      "id": "reflector-specialist",
      "path": "agents/reflector-specialist/",
      "version": "0.2.0",
      "role": "Mutate skill files based on eval failures",
      "privileged": true,
      "extended_scopes": ["agents/*/skills/"]
    }
  ]
}
```

Each entry references an agent workspace with its own `architecture.json` ([002](002-agent-manifest.md)). The pipeline manifest's checksum incorporates each agent's checksum, so workspace drift in any specialist invalidates the whole pipeline.

`is_orchestrator: true` marks exactly one agent as the orchestrator. `privileged: true` agents (per [007](007-sub-agent.md)) declare `extended_scopes` for read/write access beyond their default workspace.

## `orchestrator` — pointer

```json
{
  "orchestrator": {
    "agent_id": "orchestrator",
    "skills": ["route-user-input", "merge-specialist-results", "handle-clarification"]
  }
}
```

Mirrors the orchestrator declaration from [006 orchestrator](006-orchestrator.md). The `skills` list constrains which orchestrator skills are exposed (the orchestrator may have additional skills used internally that aren't pipeline entry points).

## `routing` — the dispatch table

Per [006](006-orchestrator.md#routing-rules):

```json
{
  "routing": {
    "rules": [ /* ordered match → specialist mapping */ ],
    "fallback": "orchestrator-clarify",
    "fan_out_default_max_parallelism": 4
  }
}
```

Routing changes are the most common pipeline edits during the training loop. They live in the manifest (not in the orchestrator's skill code) so they can be mutated declaratively without changing the orchestrator agent itself.

## `failure_policy` — what to do when a specialist fails

```json
{
  "failure_policy": {
    "intake-specialist": "abort",
    "vision-manifest-specialist": "retry-then-escalate",
    "rfq-trade-sealant": "skip",
    "qa-specialist": "manual-review"
  }
}
```

Per [006 failure handling](006-orchestrator.md#failure-handling). Specialists not listed get the runtime default (`retry-then-escalate`).

## `merge_policy` — file conflict resolution

```json
{
  "merge_policy": [
    { "path_glob": ".openclaw/architecture.json", "resolution": "error" },
    { "path_glob": "deliverables/decision-log.md", "resolution": "explicit-merge" },
    { "path_glob": "deliverables/**", "resolution": "last-write-wins" }
  ]
}
```

Per [006 file conflicts](006-orchestrator.md#file-conflicts). Patterns evaluated in declaration order; first match wins.

## `memory_authority` — who can write what tier+lane

Per [004 memory model](004-memory-model.md#write-authority):

```json
{
  "memory_authority": [
    { "tier": 1, "lane": "estimating", "writers": ["darrow@ecc.com"] },
    { "tier": 1, "lane": "business", "writers": ["matt@ecc.com"] },
    { "tier": 1, "lane": "operations", "writers": ["scott@ecc.com"] },
    { "tier": 2, "lane": "estimating", "writers": ["scott@ecc.com"] },
    { "tier": 3, "lane": "estimating", "writers": [
      "amelia@ecc.com", "jim@ecc.com", "ramirez@ecc.com"
    ]},
    { "tier": 1, "lane": "orchestration", "writers": [
      "agent://ecc-estimator/agents/orchestrator@0.1.0"
    ]}
  ]
}
```

Both human and agent identities appear here. Agent self-writes (e.g., the orchestrator recording observations to its own lane) carry the agent URI as `source_identity`.

## `config_docs[]` — shared configuration

Per [009 config substrate](009-config-substrate.md):

```json
{
  "config_docs": [
    {
      "id": "labor-rates",
      "path": "config/labor-rates/",
      "owner": "darrow@ecc.com",
      "review_lane": "estimating"
    },
    {
      "id": "jurisdictional-tax",
      "path": "config/jurisdictional-tax/",
      "owner": "import://ecc-tax-feed",
      "review_lane": "operations"
    }
  ]
}
```

## `imports[]` — scheduled data imports

```json
{
  "imports": [
    {
      "doc_id": "jurisdictional-tax",
      "schedule": "0 3 * * *",
      "source": "https://api.taxjar.com/v2/...",
      "transformer": "imports/tax-jar-transformer.ts"
    },
    {
      "doc_id": "labor-rates",
      "schedule": "0 0 1 */3 *",
      "source": "sharepoint://ecc-tenant/sub-agreements/quarterly",
      "transformer": "imports/sub-agreement-parser.ts"
    }
  ]
}
```

## `output_validator` — marker schemas

Per [015 output validator](015-output-validator.md#pipeline-configuration):

```json
{
  "output_validator": {
    "layers": ["json", "marker", "heuristic"],
    "heuristic_confidence_threshold": 0.6,
    "schemas": [
      { "marker": "reveal", "schema_ref": "openclaw-v1:RevealSchema" },
      { "marker": "plan_skill", "schema_ref": "openclaw-v1:PlanSkillSchema" },
      { "marker": "ecc_takeoff_reading", "schema_ref": "schemas/takeoff-reading.schema.json" },
      { "marker": "ecc_deliverable", "schema_ref": "schemas/deliverable.schema.json" }
    ]
  }
}
```

Custom marker schemas live in the pipeline's `schemas/` directory and are referenced by relative path.

## `dashboard` — bespoke surface

Per [010 dashboard panels](010-dashboard-panels.md) (Phase 4 — manifest field is reserved here):

```json
{
  "dashboard": {
    "manifest_path": "dashboard/manifest.json",
    "title": "ECC Estimator",
    "branding": { "primary_color": "#1a3a5c", "secondary_color": "#d4a017" },
    "default_landing_panel": "estimate-queue"
  }
}
```

Phase 4 fills in the rest. v1 reserves the field shape so manifests are forward-compatible.

## `eval_suite_ref` — verification

```json
{
  "eval_suite_ref": "eval/tasks.json",
  "convergence_loop": {
    "max_iterations": 5,
    "max_consecutive_degradations": 2,
    "reload_pause_ms": 2000,
    "pass_rate_threshold": 0.75,
    "budget": {
      "max_llm_calls": 5000,
      "max_cost_usd": 1000
    }
  }
}
```

`convergence_loop` is optional — absent for pipelines that don't run the reinforcement loop (most), present for training-mode pipelines (ECC during M0-M2).

## `hooks[]` and `custom_hooks[]`

Per [013](013-hooks.md):

```json
{
  "hooks": [
    { "name": "memory_write_review_required", "handler": "hooks/route-via-email.ts", "fire_mode": "sync" },
    { "name": "eval_iteration_complete", "handler": "hooks/post-to-datadog.ts", "fire_mode": "fire_and_forget" },
    { "name": "custom:ecc:rfq-packet-shipped", "handler": "hooks/notify-procurement.ts", "fire_mode": "fire_and_forget" }
  ],
  "custom_hooks": [
    { "name": "custom:ecc:rfq-packet-shipped", "payload_schema": "schemas/rfq-shipped-payload.schema.json" }
  ]
}
```

## `runtime` — deployment requirements

```ts
interface RuntimeRequirements {
  tenancy: "shared" | "dedicated" | "on-prem";
  egress: "open" | "restricted" | "tenant-bounded";
  llm_providers: Array<{
    provider: "anthropic" | "openai" | "openrouter" | "gemini" | "ollama";
    model: string;
    via: "direct" | "tenant-proxy";
  }>;
  sandbox: {
    image: string;
    resources: {
      cpu_cores: number;
      memory_gb: number;
      disk_gb: number;
    };
    persistent_volumes?: string[];
  };
  database: {
    kind: "postgres" | "sqlite";
    connection_ref?: string;
  };
  required_integrations?: string[];   // e.g., ["sharepoint", "outlook", "netsuite"]
}
```

Example for ECC:

```json
{
  "runtime": {
    "tenancy": "on-prem",
    "egress": "tenant-bounded",
    "llm_providers": [
      { "provider": "anthropic", "model": "claude-opus-4-7", "via": "tenant-proxy" }
    ],
    "sandbox": {
      "image": "openclaw-runtime:1.0.0",
      "resources": { "cpu_cores": 4, "memory_gb": 16, "disk_gb": 100 }
    },
    "database": { "kind": "postgres" },
    "required_integrations": ["sharepoint-graph", "outlook", "company-cam"]
  }
}
```

The runtime requirements drive deployment validation: "this pipeline needs SharePoint Graph API access; does the tenant grant it?" Answers live in deployment-time checklists, not in the manifest itself.

## Validation rules

The runtime validates a pipeline manifest at every load. Failures:

| Rule | Failure |
|---|---|
| Schema | Missing required field, wrong type, malformed enum |
| Orchestrator existence | `orchestrator.agent_id` not in `agents[]` |
| Single orchestrator | More than one agent has `is_orchestrator: true` |
| Agent workspace exists | Each `agents[].path` is a valid agent workspace (with `.openclaw/architecture.json`) |
| Spec version compatible | `spec_version` is supported by the runtime |
| Custom marker schemas resolvable | Every `output_validator.schemas[*].schema_ref` resolves to an existing schema |
| Hook handlers exist | Every `hooks[*].handler` is a file in the workspace |
| Custom hook payload schemas exist | Every `custom_hooks[*].payload_schema` resolves |
| Memory authority complete | Every lane referenced in agents' `authority_lanes` has at least one Tier-1 writer |
| Routing rules valid | Every `specialist` referenced exists in `agents[]` |
| Failure policy targets exist | Every key in `failure_policy` is an `agents[].id` |
| Privileged scopes documented | Every `privileged: true` agent has non-empty `extended_scopes` |
| Eval suite resolvable | `eval_suite_ref` points to a file conforming to [008](008-eval-task.md) |
| Checksum match | Recomputed checksum equals declared `checksum` |

Failures emit `manifest_invalid` per [014](014-error-taxonomy.md). The pipeline does not load; the runtime surfaces the specific rule that failed.

## Lifecycle

A pipeline transitions:

| dev_stage | Means |
|---|---|
| `drafted` | Manifest exists; not yet validated |
| `validated` | Schema + integrity checks pass |
| `tested` | Eval suite runs at acceptable pass-rate |
| `shipped` | Deployed to a tenant; the runtime is loading it |

Stage transitions live alongside agent stages from [002](002-agent-manifest.md). A pipeline in `tested` requires every agent to be at least `tested`; promotion to `shipped` requires every agent to be at `shipped`.

> **Note — pipeline `dev_stage` is a strict 4-value subset of agent `dev_stage`.**
> Agent-level dev_stage adds three runtime states (`running`, `paused`, `archived`) that don't apply at the pipeline level. A pipeline doesn't transition to `running` — it stays at `shipped` and the *agents inside it* enter `running` when responding to triggers. Both fields use the same name `dev_stage` for symmetry, but the schema (`pipeline-manifest.schema.json`) constrains the pipeline-level enum to the 4-value set. See [002 lifecycle states](002-agent-manifest.md#lifecycle-states) for the full agent-level enum.

## Identity and addressing

A pipeline is uniquely identified by:

```
pipeline_uri = "openclaw://<pipeline-id>@<version>"
```

For example: `openclaw://ecc-estimator@1.4.2`. Within a tenant, a pipeline ID is unique. Across tenants, the same pipeline ID may exist (the same `ecc-estimator` deployed to different ECC tenants for staging vs. production).

## Minimal example — single-agent pipeline

```json
{
  "id": "hello-pipeline",
  "spec_version": "1.0.0",
  "version": "0.1.0",
  "name": "Hello Pipeline",
  "description": "The smallest possible OpenClaw pipeline.",

  "agents": [
    {
      "id": "hello-agent",
      "path": "agents/hello-agent/",
      "version": "0.1.0",
      "role": "Greets the user",
      "is_orchestrator": true
    }
  ],
  "orchestrator": {
    "agent_id": "hello-agent",
    "skills": ["greet"]
  },

  "routing": {
    "rules": [
      { "match": { "stage": "shipped" }, "specialist": "hello-agent" }
    ],
    "fallback": "hello-agent"
  },
  "failure_policy": {},
  "merge_policy": [],

  "memory_authority": [],
  "config_docs": [],
  "imports": [],

  "output_validator": {
    "layers": ["marker"],
    "heuristic_confidence_threshold": 0.6,
    "schemas": []
  },

  "dashboard": {
    "manifest_path": "dashboard/manifest.json",
    "title": "Hello",
    "default_landing_panel": "chat"
  },

  "eval_suite_ref": "eval/tasks.json",

  "hooks": [],
  "custom_hooks": [],

  "runtime": {
    "tenancy": "shared",
    "egress": "open",
    "llm_providers": [
      { "provider": "anthropic", "model": "claude-opus-4-7", "via": "direct" }
    ],
    "sandbox": {
      "image": "openclaw-runtime:1.0.0",
      "resources": { "cpu_cores": 1, "memory_gb": 2, "disk_gb": 10 }
    },
    "database": { "kind": "sqlite" }
  },

  "dev_stage": "validated",
  "generated_at": "2026-04-27T00:00:00Z",
  "generated_by": "architect@1.0.0-alpha.1",
  "checksum": "sha256:..."
}
```

When `agents[]` has one entry that's also the orchestrator, the pipeline is a single-agent flow. Same machinery, smallest case.

## ECC pipeline shape

The ECC estimator manifest is too long to embed verbatim, but the structure:

- **agents[]**: `orchestrator` + 11 specialists (intake, vision-manifest, takeoff, pricing, gap, rfq-template, narrative, pptx, qa, decision-log-compiler, reflector)
- **memory_authority**: 4 tiers across `estimating`, `business`, `operations`, `regional-<region>` lanes (one per region ECC operates in)
- **config_docs**: labor-rates, jurisdictional-tax, paint-bands, coverage-rates, response-slas
- **imports**: nightly tax-feed, quarterly sub-agreement parsing
- **eval_suite_ref**: 200 curated historical estimates from Rowena+Scott
- **convergence_loop**: 5 iterations max, $1000 budget cap, 75% pass-rate threshold
- **dashboard**: estimate queue, gap register, decision log explorer, memory write approval inbox, regional rate config editor, orchestrator chat
- **runtime**: on-prem, tenant-bounded, Anthropic via tenant-proxy, Postgres on the Lenovo box

The full manifest lives in `examples/ecc-estimator-pipeline/pipeline-manifest.json` (Phase 4).

## Anti-example — common defects

**Multiple orchestrators:**

```json
{ "agents": [{ ..., "is_orchestrator": true }, { ..., "is_orchestrator": true }] }
// ❌ exactly one orchestrator allowed
```

**Routing references a missing agent:**

```json
{ "agents": [{ "id": "a" }], "routing": { "rules": [{ "specialist": "b" }] } }
// ❌ "b" not in agents[]
```

**Missing Tier-1 writer for a lane the agent claims to write:**

```yaml
# specialist's SOUL.md
authority_lanes: [estimating]
# pipeline-manifest.json
memory_authority: [
  { tier: 1, lane: business, writers: ["matt@ecc.com"] }
  // ❌ no Tier-1 writer for estimating; the specialist's writes have nowhere to route
]
```

**Privileged agent without `extended_scopes`:**

```json
{ "id": "reflector", "privileged": true }
// ❌ schema requires non-empty extended_scopes when privileged: true
```

## Cross-references

Every section in the spec is referenced from the pipeline manifest:

- [[002-agent-manifest]] — `agents[].path` references agent workspaces
- [[003-tool-contract]] — `custom_tool_kinds` registers pipeline-specific tools
- [[004-memory-model]] — `memory_authority` declares writer tiers/lanes
- [[005-decision-log]] — implicitly used by the runtime; no manifest field
- [[006-orchestrator]] — `orchestrator`, `routing`, `failure_policy`, `merge_policy`
- [[007-sub-agent]] — `agents[].privileged` and `extended_scopes`
- [[008-eval-task]] — `eval_suite_ref`, `convergence_loop`
- [[009-config-substrate]] — `config_docs`, `imports`
- [[010-dashboard-panels]] — `dashboard` (Phase 4 fills in panel-level details)
- [[012-checkpoint]] — implicit, runtime applies based on pipeline-level config
- [[013-hooks]] — `hooks`, `custom_hooks`
- [[014-error-taxonomy]] — `retry_overrides`
- [[015-output-validator]] — `output_validator`
- [[100-versioning]] — `spec_version`, `version`
- [[101-conformance]] — manifest must pass conformance before `dev_stage` advances

## Open questions for ECC pipeline

- Pipeline-level secret management — ECC's Anthropic key, SharePoint OAuth tokens, etc. Do these live in the manifest (referenced) or entirely outside? **Tentative**: outside, in a runtime credential store; manifest only carries `credential_ref` strings.
- For multi-environment deployments (ECC staging + production), does each get its own pipeline ID, or is `version` enough? **Tentative**: separate pipeline IDs (`ecc-estimator-staging`, `ecc-estimator-prod`) so audit logs and metrics partition cleanly.
- Manifest evolution during a long-running training session — if an operator edits routing mid-loop, what happens? **Tentative**: training-mode locks the manifest; edits queue and apply on the next iteration boundary, with a decision log entry recording the lock.
