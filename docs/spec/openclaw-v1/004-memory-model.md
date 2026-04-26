# 004 — Memory Model

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/memory.schema.json`](schemas/memory.schema.json)

Memory in OpenClaw is **tiered**, **lane-aware**, **role-attested**, and **status-tracked**. A flat "memory is memory" model — where any writer's text overwrites any other's — is forbidden. ECC's "Jim in Dallas" routing problem (regional estimator vs. lead-estimator co-founder vs. CEO authority) forced this design in v1; every future pipeline benefits.

---

## Purpose

A digital employee that lives in production accumulates knowledge from many sources: domain experts (the lead estimator), operations leads (the VP Ops), end users (regional estimators), the agent's own learnings during runs, and structured imports (rate tables, manuals). Without a model that distinguishes *who said what about what*:

- A regional estimator's drift in Dallas pollutes every estimate company-wide
- A correction by the CEO on commercial posture overwrites the lead estimator's mechanics
- The agent has no way to say "Jim suggested this — should it become a permanent rule?"
- Audit becomes impossible — the agent cannot defend a decision by citing its source

The memory model resolves all four. Every memory entry carries `{tier, lane, source_identity, status}` — and the runtime routes proposed writes to the right authority before commit.

## The four dimensions

### Tier — authority weight

Three levels:

| Tier | Meaning | Default write behavior |
|---|---|---|
| **1** | Authoritative writer for this lane | Lands in permanent memory immediately |
| **2** | Trusted writer; pending confirmation | Logged + flagged for Tier-1 confirmation |
| **3** | Proposing writer; not authoritative | Routed up as a proposal: "Jim thinks X — is he right?" |

A pipeline declares which identities are at which tier for which lanes. Memory writes carry the writer's tier; the runtime applies the tier's policy.

### Lane — named domain

A lane is a named domain of authority. Lanes are pipeline-defined (the spec doesn't enumerate them centrally) but follow a kebab-case convention:

```
estimating       — labor rates, coverage, scope buckets, paint-type bands
business         — pricing posture, market direction, deal types
operations       — deployment, process, user access, feedback workflows
deployment       — infrastructure, sandbox config, integration paths
regional-<id>    — region-scoped knowledge (e.g., regional-dallas)
```

The same person can be Tier-1 in one lane and Tier-2 in another. ECC's Scott (VP Ops) is **Tier-1 on operations** but **Tier-2 on estimating** (his estimating corrections are trusted input, but routed to the lead estimator for confirmation before becoming permanent rules).

### Source identity — who attested

Every memory write carries the writer's identity, attested by the runtime (not self-claimed):

- For email-driven writes: the verified `From:` address
- For dashboard-driven writes: the authenticated user's session identity
- For agent self-writes during runs: `agent://<pipeline-id>/agents/<agent-id>@<version>`
- For automated imports: the import source URI

The runtime never trusts a client-supplied source identity — it derives it from the inbound channel's authentication. A memory entry whose declared source doesn't match the inbound channel is rejected.

### Status — lifecycle of an entry

Every memory entry passes through these states:

| Status | Meaning | Visible to agent? |
|---|---|---|
| **proposed** | Tier-3 write; awaiting routing decision | No |
| **flagged** | Tier-2 write OR proposed write that the orchestrator has surfaced for review | No |
| **confirmed** | A Tier-1 writer (or the lane's authority) has approved | Yes (with `confirmed: true` flag) |
| **permanent** | Confirmed entry that has aged past the volatility threshold (default: 30 days) | Yes (treated as base knowledge) |
| **deprecated** | Superseded by a newer entry; preserved for audit | No (filtered from agent context) |

Status transitions are logged to the decision log (see [005](005-decision-log.md)) with the deciding identity.

## Filesystem layout

Inside an agent's `.openclaw/`:

```
.openclaw/
├── MEMORY.md                # required — index of all entries (≤200 lines)
└── memory/                  # one directory per type
    ├── project/
    │   ├── <slug>.md        # one file per memory entry
    │   └── ...
    ├── user/
    ├── feedback/
    └── reference/
```

`MEMORY.md` is loaded into every agent turn's context. Individual entry files are loaded on-demand by the loader (when the index entry's description matches the current task).

## `MEMORY.md` — the index

A compact, human-readable index, organized by type, that the agent reads at session start. Each entry is one line:

```markdown
# Architect Memory

<!-- updated: 2026-04-27T00:00:00Z -->

## Project

- [ECC labor rate baseline — Aurora CO 2026 Q2](memory/project/labor-aurora-2026q2.md) — Rates per sub × trade × prevailing-wage status. Tier 1, lane `estimating`, source `darrow@ecc.com`. {confirmed}
- [POC delta lessons](memory/project/poc-delta-lessons.md) — The $700K delta at Arterra was 100% labor + paint config. Tier 1, lane `estimating`, source `darrow@ecc.com`. {confirmed}

## User

- [Matt's response cadence preference](memory/user/matt-response-cadence.md) — CEO prefers weekly summary over daily. Tier 1, lane `business`, source `matt@ecc.com`. {confirmed}

## Feedback

- [LOXON family for masonry clubhouses](memory/feedback/loxon-masonry.md) — Always use LOXON family on brick clubhouses. Tier 2, lane `estimating`, source `scott@ecc.com`. {flagged}

## Reference

- [PCA P14 Level 2/3 spec](memory/reference/pca-p14.md) — Industry prep standards. Tier 1, lane `estimating`, source `import://pca-spec`. {permanent}
```

Each line follows: `- [<title>](<path>) — <description>. Tier <N>, lane <lane>, source <identity>. {<status>}`

The runtime parses these lines mechanically; humans read them as a digest of what the agent knows.

### Why ≤200 lines

The index ships into every prompt. Bloat = token cost = degraded performance. When the index exceeds 200 lines, the runtime emits a `memory_index_bloat` warning. Pipelines configure `max_entries_warning` in `architecture.json` to tune the threshold (default 200 lines, but always less than 200 *visible* entries since deprecated ones don't render).

Periodic compaction merges similar entries (e.g., 12 weekly check-ins into one summary). See **Compaction** below.

## Memory entry — the file format

Each entry in `memory/<type>/<slug>.md` is markdown with YAML frontmatter:

```yaml
---
id: labor-aurora-2026q2
type: project
title: ECC labor rate baseline — Aurora CO 2026 Q2
description: Rates per sub × trade × prevailing-wage status.
tier: 1
lane: estimating
source_identity: darrow@ecc.com
source_channel: email
status: confirmed
created_at: 2026-04-15T10:24:00Z
updated_at: 2026-04-15T10:24:00Z
expires_at: null
supersedes: []
superseded_by: null
related: ["poc-delta-lessons"]
spec_version: "1.0.0"
---

# ECC labor rate baseline — Aurora CO 2026 Q2

## Why this matters
The POC delta showed labor was 100% of the $700K variance. Aurora's
prevailing-wage zones change the rate dramatically.

## The numbers
| Trade | Standard | Prevailing-wage | Davis-Bacon |
|---|---|---|---|
| Painter (residential) | $48/hr | $58/hr | $66/hr |
| Painter (commercial)  | $54/hr | $64/hr | $72/hr |
| ...                   | ...    | ...    | ...     |

## Validity window
These rates are valid for Q2 2026. Update at the start of each quarter from
ECC's sub agreement files in `<sharepoint-path>`.
```

### Required frontmatter fields

- `id` — kebab-case, must match the filename (without `.md`)
- `type` — one of `project | user | feedback | reference`
- `title` — human-readable title (shows in the index)
- `description` — one-line summary (shows in the index)
- `tier`, `lane`, `source_identity`, `source_channel`, `status` — the four authority dimensions
- `created_at`, `updated_at` — ISO-8601 UTC
- `spec_version` — for forward compat

### Optional frontmatter fields

- `expires_at` — when the entry stops being valid (e.g., quarterly rates)
- `supersedes` — list of entry IDs this one replaces
- `superseded_by` — populated by the runtime when a newer entry replaces this one
- `related` — list of entry IDs the agent should consider together

### Body

The body is freeform markdown. The agent reads it whenever the index entry matches the current task. Brevity is rewarded; the body lives in the agent's context window during work.

## Write authority — who can write what

A pipeline manifest declares writers per `(tier, lane)`:

```json
{
  "memory_authority": [
    { "tier": 1, "lane": "estimating", "writers": ["darrow@ecc.com"] },
    { "tier": 1, "lane": "business", "writers": ["matt@ecc.com"] },
    { "tier": 1, "lane": "operations", "writers": ["scott@ecc.com"] },
    { "tier": 2, "lane": "estimating", "writers": ["scott@ecc.com"] },
    { "tier": 3, "lane": "estimating", "writers": [
      "amelia@ecc.com", "jim@ecc.com", "ramirez@ecc.com"
    ]}
  ]
}
```

When a memory write arrives:

1. **Resolve identity** — the runtime authenticates the inbound channel, derives the source identity
2. **Check authority** — match `(declared_tier, declared_lane)` against the manifest's `memory_authority`
3. **Apply tier policy:**
   - Tier 1 → status: `confirmed`, written immediately
   - Tier 2 → status: `flagged`, surfaced to the lane's Tier-1 writer for confirmation
   - Tier 3 → status: `proposed`, the orchestrator routes a question to the lane's authority
4. **Reject** — if the source isn't in the manifest's authority list for the declared `(tier, lane)`, the write is rejected with `category: permission_denied` (see [014](014-error-taxonomy.md))

### Routing for Tier-2 and Tier-3 writes

The runtime fires a `memory_write_review_required` hook (see [013](013-hooks.md)) carrying:

```ts
{
  pending_entry: MemoryEntry,
  routed_to: string[],     // identities at Tier-1 in the lane
  channel: "email" | "dashboard" | "teams-card" | ...
}
```

The pipeline's review path picks up the hook. ECC's pattern: email-card to Darrow with approve/reject buttons; the hook handler emits the actual email and listens for the response webhook.

### What the agent sees

Agents only see entries with status `confirmed` or `permanent`. Proposed and flagged entries are invisible — the agent must not act on unconfirmed knowledge. **This is non-negotiable.** A pipeline that lets the agent read flagged entries is non-conformant.

## Confirmation flow

Tier-2 writes example:

```
Scott emails the agent's mailbox: "Use LOXON family on brick clubhouses."
   ↓
Runtime authenticates: source = scott@ecc.com
Runtime classifies: tier=2 (per manifest), lane=estimating
Runtime writes: memory/feedback/loxon-masonry.md, status=flagged
Hook fires: memory_write_review_required, routed_to=[darrow@ecc.com]
   ↓
Pipeline review handler emails Darrow:
  Subject: Confirm: Use LOXON family on brick clubhouses?
  [Approve] [Reject] [Edit]
   ↓
Darrow clicks [Approve]
   ↓
Webhook → pipeline → memory write status flips to: confirmed
   ↓
Agent's next session loads the entry as confirmed knowledge
```

Tier-3 writes follow the same pattern but the prompt language differs: `"Jim suggests we should price railings differently — is he right?"` versus `"Confirm: Use LOXON family..."`.

## Compaction

Memory is finite. The runtime periodically compacts entries to keep the index manageable.

### Three strategies

Mirroring [014](014-error-taxonomy.md)'s context-overflow path, memory compaction has three modes the runtime applies in order of escalating aggressiveness:

#### `auto-compact` — proactive

Triggered when the index hits 80% of `max_entries_warning`. Merges similar entries (same lane, same source, similar titles, recent dates) into a single summary entry. Original entries get status `deprecated` but remain on disk.

```
Before: 12 weekly Tier-1 entries from darrow@ecc.com on estimating
After:  1 monthly summary entry + 12 deprecated originals
```

#### `reactive-compact` — after error

Triggered when a session hits `category: context_too_long`. More aggressive: drops entries that haven't been read in N sessions (default 30). Important entries (marked `important: true` in frontmatter) survive.

#### `snip-compact` — last resort

Triggered when reactive isn't enough (rare). Keeps only Tier-1 confirmed entries from the last 7 days plus all `important: true` entries. Everything else is deprecated.

### The summarizer

In v1, summarization is **string-truncation per entry** (cheap, deterministic, lossy). v2 will add LLM-based summarization with the original entries preserved as an audit trail. Pipelines that need fidelity now disable auto-compact and rely on manual curation; ECC's manifest disables auto-compact for the first 6 months.

## Read patterns

How agents read memory:

### `loadMemoryIndex(pipeline_id)` — at session start

Returns the full index. Cached for the session. The agent's system prompt includes the index verbatim.

### `readMemoryEntry(pipeline_id, entry_id)` — on demand

Returns the body of a single entry. Used when the agent decides "this index entry is relevant to my current task." A skill's prompt may include `read_memory(<entry_id>)` directives that the runtime resolves before the LLM call.

### `searchMemory(pipeline_id, query)` — semantic lookup (v1.1+)

Deferred to v1.1. v1 search is keyword over the index (titles + descriptions); v1.1 introduces vector embedding over entry bodies.

## Anti-example — common defects

**Writing without identity attestation:**

```ts
memory.write({
  tier: 1,
  lane: "estimating",
  content: "...",
  // ❌ no source_identity — runtime should reject
});
```

The runtime rejects this. Identity must be derived from the inbound channel; never client-supplied.

**Cross-lane writes:**

```ts
// Matt (Tier-1 business) writes a memory about estimating mechanics
memory.write({
  tier: 1,
  lane: "estimating",          // ❌ Matt is Tier-1 only on business, not estimating
  source_identity: "matt@ecc.com",
  ...
});
```

The runtime checks the manifest's `memory_authority` and rejects: Matt isn't a Tier-1 writer for `estimating`. The runtime instead routes this as a **Tier-2 write** in `estimating`, which surfaces to Darrow for confirmation. **Cross-lane Tier-1 attempts auto-downgrade to Tier-2.**

**Agent reading flagged entries:**

```ts
const all = memory.list({ statuses: ["confirmed", "permanent", "flagged"] });
// ❌ flagged entries are not approved knowledge — the agent must not see them
```

The `list()` API does not accept `flagged` or `proposed` in its `statuses` filter. The compiler/runtime rejects the call.

## Cross-references

- [[002-agent-manifest]] — `architecture.json` declares `memory.tier_lanes` and references `MEMORY.md`
- [[003-tool-contract]] — memory tools (read/write) flow through the same execution pipeline
- [[005-decision-log]] — every memory state transition (proposed → confirmed, etc.) is logged
- [[009-config-substrate]] — the difference between memory (situational knowledge) and config (operational data)
- [[011-pipeline-manifest]] — `memory_authority` lives in the pipeline manifest
- [[013-hooks]] — `memory_write_review_required` is the routing hook
- [[014-error-taxonomy]] — `permission_denied` for unauthorized writes; `context_too_long` triggers reactive compaction
- [[101-conformance]] — tests that verify agents never see unapproved entries

## Open questions for ECC pipeline

- Does Darrow's confirmation flow need explicit phrasing per lane (`"Should this become a permanent estimating rule?"`) or is one template enough? **Tentative**: per-lane phrasing in v1; consolidate after watching live use.
- For multi-region pipelines (ECC operates in 15 states), do lanes nest (`estimating/regional-aurora`)? **Tentative**: no — flatten with `regional-<id>` as a separate lane and let cross-lane reads be explicit. Nesting adds complexity for marginal value.
- The 30-day permanence threshold — should it be configurable per lane? Some lanes (operations) have stable rules; others (regional rates) churn quarterly. **Tentative**: yes, per-lane in v1.1; v1 is global.
