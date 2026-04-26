# 009 — Configuration Substrate

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/config-substrate.schema.json`](schemas/config-substrate.schema.json)

The configuration substrate is a **multi-dimensional, versioned, hot-swappable store of operational data the agent reads at runtime** — labor rates, jurisdictional taxes, paint-type bands, response-time SLAs, support tier definitions, allowlists, regional pricing, anything that's "data" rather than "agent reasoning." Per [001 principle 3](001-overview.md#3-configuration-is-data-not-prompt): **numbers do not get baked into prompts.**

---

## Why this is a separate section from memory

Memory and config look similar (both are persistent typed knowledge the agent uses) but answer different questions:

| | Memory ([004](004-memory-model.md)) | Config (this section) |
|---|---|---|
| **Question answered** | "What did I learn from a person about a domain?" | "What are the actual numbers/rules I operate under right now?" |
| **Source** | Domain experts, agent's runs, user corrections | Imports, sub agreements, regulatory data, manual entry |
| **Authority** | Tier/lane attestation per writer | Editor permissions per config doc |
| **Update cadence** | Conversational; sporadic | Scheduled or import-driven; periodic |
| **Lookup pattern** | Index → entry by topic | Multi-dimensional key (region × trade × season × ...) |
| **Validity** | Long-lived unless deprecated | Often time-bounded (Q2 rates, current tax tables) |
| **Format** | Markdown bodies, free-form | Strictly schema-validated structured data |
| **Reading pattern** | Agent loads index, optionally reads bodies | Agent looks up specific keys |

ECC's `LOXON family for masonry clubhouses` = **memory** (estimating wisdom from Scott).
ECC's `Aurora CO Q2 2026 painter labor rate = $48/hr` = **config** (operational data with multi-dimensional key).

Conflating the two cripples both. The config substrate exists to keep numbers out of memory bodies and out of prompts.

## Filesystem layout

```
.openclaw/config/
├── <doc-id>/
│   ├── manifest.json           # required — metadata for this config doc
│   ├── schema.json              # required — JSON Schema for entries
│   ├── current.json             # required — currently-live data
│   └── versions/
│       ├── v0001.json           # historical; immutable once landed
│       ├── v0002.json
│       └── ...
└── manifest.json                # required — index of all config docs
```

A pipeline may have many config documents. ECC's might include:

```
.openclaw/config/
├── labor-rates/                 # multi-dimensional: region × trade × wage-type
├── jurisdictional-tax/          # by jurisdiction
├── paint-bands/                 # by substrate × tier
├── coverage-rates/              # by substrate × condition
├── response-slas/               # by deliverable type
└── manifest.json
```

## Top-level `config/manifest.json`

```json
{
  "spec_version": "1.0.0",
  "docs": [
    {
      "id": "labor-rates",
      "path": "labor-rates/",
      "owner": "darrow@ecc.com",
      "review_lane": "estimating"
    },
    {
      "id": "jurisdictional-tax",
      "path": "jurisdictional-tax/",
      "owner": "import://ecc-tax-feed",
      "review_lane": "operations"
    }
  ]
}
```

`owner` is the authoritative editor for that config document. Edits from anyone else are rejected (or routed to the owner for confirmation, per the same flow as [004 memory model](004-memory-model.md)). `review_lane` ties config edits to the same lane authority as memory writes.

## Per-doc `manifest.json`

```json
{
  "id": "labor-rates",
  "spec_version": "1.0.0",
  "name": "ECC labor rates",
  "description": "Per-region, per-trade, per-wage-type labor rates for ECC's subcontracted workforce.",
  "schema_path": "schema.json",
  "current_version": 17,
  "current_path": "current.json",
  "dimensions": [
    { "name": "region", "type": "enum", "values": ["aurora", "denver", "kansas-city", "..."] },
    { "name": "trade", "type": "enum", "values": ["painter-residential", "painter-commercial", "roofer", "..."] },
    { "name": "wage_type", "type": "enum", "values": ["standard", "prevailing", "davis-bacon"] },
    { "name": "effective_quarter", "type": "string", "pattern": "^[0-9]{4}-Q[1-4]$" }
  ],
  "lookup_function": "rate_by(region, trade, wage_type, effective_quarter)",
  "version_history_path": "versions/",
  "owner": "darrow@ecc.com",
  "last_updated_at": "2026-04-15T10:24:00Z",
  "last_updated_by": "darrow@ecc.com"
}
```

`dimensions` declares the lookup keys. The runtime indexes the config doc on these dimensions for O(1) lookup. `lookup_function` is the canonical lookup signature exposed to skills.

## `schema.json` — entry shape

A standard JSON Schema describing each entry in `current.json`. Example for labor-rates:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["region", "trade", "wage_type", "effective_quarter", "rate", "currency", "unit"],
    "additionalProperties": false,
    "properties": {
      "region": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
      "trade": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
      "wage_type": { "enum": ["standard", "prevailing", "davis-bacon"] },
      "effective_quarter": { "type": "string", "pattern": "^[0-9]{4}-Q[1-4]$" },
      "rate": { "type": "number", "minimum": 0 },
      "currency": { "const": "USD" },
      "unit": { "const": "per-hour" },
      "source_ref": { "type": "string", "description": "Sub agreement ID or import lineage." }
    }
  }
}
```

**The schema is part of the contract.** Edits that don't conform to schema are rejected at write time. The runtime never trusts the editor to produce valid data — it always validates.

## `current.json` — the live data

Just an array of entries conforming to `schema.json`:

```json
[
  {
    "region": "aurora",
    "trade": "painter-residential",
    "wage_type": "standard",
    "effective_quarter": "2026-Q2",
    "rate": 48,
    "currency": "USD",
    "unit": "per-hour",
    "source_ref": "ecc-sub-agreement-aurora-painters-2026"
  },
  {
    "region": "aurora",
    "trade": "painter-residential",
    "wage_type": "prevailing",
    "effective_quarter": "2026-Q2",
    "rate": 58,
    "currency": "USD",
    "unit": "per-hour",
    "source_ref": "ecc-sub-agreement-aurora-painters-2026"
  }
  // ... ~600 entries for ECC's full labor-rate matrix
]
```

## `versions/vNNNN.json` — history

Every change to `current.json` is preserved as an immutable version. The version number increments by 1 each commit. Files are named `vNNNN.json` zero-padded to 4 digits (handles 9999 versions without lexical sort issues).

Each version file mirrors the structure of `current.json` plus an envelope:

```json
{
  "version": 17,
  "spec_version": "1.0.0",
  "committed_at": "2026-04-15T10:24:00Z",
  "committed_by": "darrow@ecc.com",
  "summary": "Q2 2026 quarterly rate update for Aurora + Denver",
  "supersedes_version": 16,
  "data": [ /* same shape as current.json */ ]
}
```

The runtime serves `current.json` to skills by default. Skills may explicitly query historical versions for time-travel reads (e.g., "what was the Q1 2026 rate for Aurora?").

## Read API

Skills look up config via `ctx.config` ([003 tool context](003-tool-contract.md#toolcontext--what-the-runtime-passes-in)):

```ts
interface ConfigHandle {
  get(doc_id: string, key: Record<string, unknown>): Promise<unknown>;
  query(doc_id: string, filter: Record<string, unknown>): Promise<unknown[]>;
  at_version(doc_id: string, version: number): VersionedConfigHandle;
  current_version(doc_id: string): Promise<number>;
}
```

### Single-key lookup

```ts
const rate = await ctx.config.get("labor-rates", {
  region: "aurora",
  trade: "painter-residential",
  wage_type: "standard",
  effective_quarter: "2026-Q2",
});
// → { rate: 48, currency: "USD", unit: "per-hour", source_ref: "..." }
```

If exactly one entry matches the keys, returns it. If zero or multiple match, throws (the lookup keys must uniquely identify an entry per `dimensions`).

### Filter query

```ts
const all_aurora_painters = await ctx.config.query("labor-rates", {
  region: "aurora",
  trade: "painter-residential",
});
// → array of all matching entries (different wage_types, different quarters)
```

Useful when the agent doesn't yet know which key value applies (e.g., "find all rate types for this region and pick the right one based on the property's prevailing-wage status").

### Time-travel

```ts
const handle = ctx.config.at_version("labor-rates", 12);
const old_rate = await handle.get("labor-rates", { ... });
```

Used for re-running historical estimates against the rates that applied at the time. ECC's training-loop pattern uses this to compare the agent's output against the rates ECC's human estimator used.

## Write paths

Config writes happen through three channels:

### Manual editor (dashboard)

Authorized editors (the `owner` in `manifest.json`) edit via the dashboard's config panel. The panel:

1. Loads `schema.json`
2. Renders an appropriate editor (table for arrays, form for objects)
3. Validates on save against schema
4. Submits as `commit_config` event with diff
5. Runtime increments version, writes new `vNNNN.json`, replaces `current.json`, emits decision-log entries

### Import (scheduled)

Pipelines may register import jobs that pull data from external sources (NetSuite, supplier APIs, regulatory feeds):

```json
{
  "imports": [
    {
      "doc_id": "jurisdictional-tax",
      "schedule": "0 3 * * *",
      "source": "https://api.taxjar.com/...",
      "transformer": "imports/tax-jar-transformer.ts"
    }
  ]
}
```

The transformer normalizes external data to the doc's schema. Import failures emit `error_classified` entries with category `tool_execution_failure`; subsequent runs retry per [014](014-error-taxonomy.md).

### Programmatic (orchestrator-driven)

Rare. An orchestrator may stage a config update derived from an agent run (e.g., the eval loop converged on a new coverage assumption). These writes always go through the **review path** — they're proposed, surfaced to the owner via [013 hooks](013-hooks.md), and only commit on approval. Programmatic writes that bypass review are a defect.

## Hot-swap — config changes propagate without restart

The runtime caches `current.json` per doc. When a write commits a new version:

1. Runtime invalidates cache for `(pipeline_id, doc_id)`
2. Next `ctx.config.get(...)` call reads the new version
3. In-flight calls finish against the version they started with (no half-applied state)

**No agent restart, no sandbox recreate.** The agent sees the new config on its next read.

This is critical for ECC's training loop: when the eval reflector proposes a new paint-band entry and the lead estimator approves, the *next* training-iteration run uses the new config without redeploying anything.

## Authority for edits

Config edits use a simpler authority model than memory:

- **Manual edits** must come from the doc's `owner` or be approved by them
- **Imports** must declare a registered import job (the source URL is allowlisted in the pipeline manifest)
- **Programmatic edits** are always Tier-2 — they go through the review path

Edits that fail authority checks are rejected with `permission_denied`.

## Audit

Every config commit produces a decision-log entry:

```ts
{
  type: "config_commit",
  metadata: {
    doc_id: "labor-rates",
    version: 17,
    supersedes_version: 16,
    committed_by: "darrow@ecc.com",
    diff_summary: "Updated 14 entries; added 2; removed 0.",
    schema_validated: true
  }
}
```

The dashboard's config history panel renders this as a timeline. Reviewers click through to see the full diff between any two versions. Customers receive the timeline as part of the audit trail in their final deliverables.

## Anti-example — common defects

**Numbers in the prompt:**

```python
prompt = f"""
You are an estimator. Aurora painter rate is $48/hr standard, $58 prevailing.
Calculate labor for {sf} square feet.
"""
# ❌ rates are baked in; updating requires changing code
```

The fix:

```python
prompt = f"""
You are an estimator. Use ctx.config.get("labor-rates", ...) to look up
the applicable rate for the property's location and prevailing-wage status.
Calculate labor for {sf} square feet.
"""
# ✅ rate is a runtime lookup
```

**Mutable `current.json` without versioning:**

```ts
fs.writeFile(".openclaw/config/labor-rates/current.json", newData);
// ❌ no version snapshot, no audit trail, no rollback
```

The runtime's commit API writes both `vNNNN.json` and `current.json` atomically. Direct file writes outside the API are rejected (the conformance suite asserts the version-history is monotonically increasing).

**Skipping schema validation:**

```ts
const rates = JSON.parse(rawImport);
await config.commit("labor-rates", rates);
// ❌ rates may not conform to schema; commit succeeds with malformed data
```

The runtime always validates against `schema.json` before commit. The defect here is at the import boundary — bad data should fail at import time, not after it's already corrupted the live config.

## Cross-references

- [[002-agent-manifest]] — agents reference config docs via `config_refs[]`
- [[003-tool-contract]] — tools read config via `ctx.config`
- [[004-memory-model]] — distinguishing memory (knowledge) from config (data)
- [[005-decision-log]] — `config_commit` entries
- [[008-eval-task]] — eval loop's time-travel reads use historical config versions
- [[011-pipeline-manifest]] — pipeline declares import jobs and `owner` mapping
- [[013-hooks]] — `config_review_required` hook for programmatic-write proposals
- [[014-error-taxonomy]] — `permission_denied` for unauthorized edits

## Open questions for ECC pipeline

- ECC's labor-rates config is ~600 entries × quarterly updates × 5+ years of history. Postgres or filesystem? **Tentative**: filesystem in workspace for portability + Postgres mirror for query performance.
- Cross-doc references (e.g., `paint-bands` references `coverage-rates` for the substrate column) — does the schema allow `$ref` cross-doc? **Tentative**: yes, with explicit `$ref: openclaw-config:<doc_id>:<schema_path>`.
- Import retries when an external source is down — does the prior version stay live, or does the agent get a "config stale, retry" error? **Tentative**: prior version stays live; the runtime emits a `config_import_stale` warning to the dashboard so reviewers know the data is older than expected.
