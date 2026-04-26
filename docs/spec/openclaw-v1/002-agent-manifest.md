# 002 — Agent Manifest

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/agent-manifest.schema.json`](schemas/agent-manifest.schema.json)

The agent manifest is the contract for what an agent **is** in OpenClaw. Every agent shipped in any pipeline conforms to this manifest. A pipeline (see [011](011-pipeline-manifest.md)) is one or more agents composed by an orchestrator; this section defines the agent itself.

---

## Purpose

An agent in OpenClaw has a **soul** (who it is), **skills** (what it can do), **tools** (what it reaches out to), **triggers** (what wakes it up), and **runtime metadata** (how the platform manages it). The manifest captures all of these as a typed, schema-validated, filesystem-resident artifact.

The manifest is:

- **Source-of-truth** for the agent's behavior. The runtime loads from the manifest; nothing else.
- **Machine-readable.** The platform validates it on every load.
- **Version-stamped.** Every manifest declares its target spec version.
- **Authored by coding agents under human review.** Humans don't typically write manifests by hand; they review what the architect produced.
- **Portable.** A conformant manifest plus its referenced files can be moved between sandboxes (and pipelines) without modification.

## Required filesystem layout

Every agent lives in a workspace with this exact structure:

```
<agent-workspace>/
├── SOUL.md                        # required — identity contract (003.1)
├── skills/                        # required — at least one skill
│   ├── <skill-id>/
│   │   └── SKILL.md               # required per skill
│   └── ...
├── tools/                         # required (may be empty)
│   ├── <tool-id>.json             # one file per registered tool reference
│   └── ...
├── triggers/                      # required (may be empty)
│   ├── <trigger-id>.json
│   └── ...
└── .openclaw/                     # required — runtime metadata, never hand-edited
    ├── architecture.json          # required — the canonical manifest (this section)
    ├── MEMORY.md                  # required — memory index (see 004)
    ├── memory/                    # optional — memory entries (see 004)
    ├── decisions/                 # optional — decision log (see 005)
    └── checkpoints/               # optional — state snapshots (see 012)
```

Anything outside this structure is ignored by the runtime. Anything missing required structure fails validation and the agent will not load.

### Why this exact shape

- **`SOUL.md`** sits at the workspace root because it's read by humans (and the architect) more often than any other file. Top-level visibility = top-level importance.
- **`skills/` is a directory of directories** (not a flat list of files) so each skill can carry supporting files (tests, fixtures, prompts) alongside its `SKILL.md`.
- **`tools/` and `triggers/` use single JSON files per entry** because they're reference data, not behavior — the actual tool implementation lives in the runtime, the actual trigger lives in the orchestrator. The agent only declares what it uses.
- **`.openclaw/` is reserved for the runtime.** Humans and the architect read it; only the runtime writes it. The dot-prefix marks it as not-typically-of-interest.

## `SOUL.md` — identity contract

`SOUL.md` is markdown with a YAML frontmatter block. The frontmatter is machine-validated; the body is free-form prose read by the agent's LLM at session start.

### Frontmatter (required fields)

```yaml
---
name: <agent display name>           # human-readable, e.g. "ECC Estimator"
slug: <kebab-case-id>                # stable id, e.g. "ecc-estimator"
spec_version: "1.0.0"                # OpenClaw spec version this agent targets
version: <semver>                    # the agent's own version, e.g. "0.4.2"
role: <one-line description>          # e.g. "Multifamily exterior renovation estimator"
authority_lanes:                     # which memory lanes (see 004) this agent writes to
  - estimating
  - operations
voice:
  tone: <list of adjectives>          # e.g. ["methodical", "transparent", "curious"]
  forbidden: <list of behaviors>       # e.g. ["fabricating quantities", "skipping decision log"]
---
```

### Body (required content)

The markdown body MUST contain at least these H2 sections, in this order:

1. **`## Identity`** — who the agent is in one paragraph
2. **`## Methodology`** — how the agent approaches its work (the "brain" patterns)
3. **`## Constraints`** — what the agent never does
4. **`## Communication`** — how it talks to humans (handoff format, escalation patterns)

The body is not schema-validated beyond the section heading check, but it is read into the agent's system prompt verbatim. Brevity is rewarded; padding is punished by token budget.

### Why YAML frontmatter

Human-friendly to read, machine-friendly to parse, broadly tooled in markdown editors. Avoids the alternative — a separate `soul.json` next to `SOUL.md` — which forces humans to read two files and risks drift between them.

## `skills/<skill-id>/SKILL.md` — capability contract

Each skill is a directory. The directory name is the skill ID (kebab-case, must match `^[a-z][a-z0-9-]*$`). Inside, `SKILL.md` is required; other files are optional supporting context.

### `SKILL.md` frontmatter (required)

```yaml
---
id: <kebab-case-id>                  # MUST match directory name
name: <human-readable name>
spec_version: "1.0.0"
description: <one-line summary>       # used in the architect's tool listings
inputs:                               # what triggers / arguments this skill expects
  - name: <input-id>
    type: <text | json | file | image | audio>
    required: <true | false>
    description: <one line>
outputs:                              # what this skill produces
  - name: <output-id>
    type: <text | json | file | structured>
    schema_ref: <optional path to JSON schema>
    description: <one line>
tools:                                # which tool IDs this skill may call
  - <tool-id>
  - ...
estimated_duration: <ISO-8601 duration>  # e.g. "PT5M" — informational, not enforced
---
```

### `SKILL.md` body

Markdown body with these required sections:

1. **`## When to use this skill`** — natural-language conditions
2. **`## Process`** — the agent's procedure (numbered or as a flowchart)
3. **`## Outputs`** — what the agent commits to producing
4. **`## Failure modes`** — known ways this skill fails and how the agent recovers

The body is the primary instruction surface for the skill. The architect reads it whenever this skill is selected.

### Why one directory per skill

Skills carry test fixtures, example inputs, golden outputs, and supporting prompts. Pinning everything to a directory keeps related material local. The architect reads the directory, not just the `SKILL.md`, when generating examples or tests.

## `tools/<tool-id>.json` — tool reference

Each tool the agent uses is declared as a single JSON file. **The file is a reference, not an implementation.** The runtime resolves `tool-id` against its registered tool catalog (see [003 tool contract](003-tool-contract.md)) and provides the actual implementation.

```json
{
  "id": "<kebab-case-id>",
  "spec_version": "1.0.0",
  "name": "<human-readable name>",
  "description": "<one-line summary>",
  "tool_kind": "workspace-read | workspace-write | sandbox-exec | research | plan-validate | <custom-id>",
  "permissions": {
    "stages": ["plan", "build", "review", "test", "ship"],
    "modes": ["agent", "copilot", "build"],
    "destructive": false,
    "concurrency_safe": true,
    "requires_approval": false
  },
  "credentials": {
    "ref": "<credential-store-key>",
    "schema_ref": "<optional path>"
  },
  "config": { /* tool-specific configuration; validated against tool's own schema */ }
}
```

`tool_kind` MUST match a tool registered in the runtime's `ToolRegistry` (see [003](003-tool-contract.md)). The runtime rejects manifests referencing unknown tools at load time.

## `triggers/<trigger-id>.json` — activation contract

A trigger is a condition that wakes the agent up. Triggers are declarative; the orchestrator owns the actual scheduling/eventing.

```json
{
  "id": "<kebab-case-id>",
  "spec_version": "1.0.0",
  "name": "<human-readable name>",
  "kind": "schedule | webhook | inbox | manual | upstream-agent",
  "config": { /* kind-specific config */ },
  "skills": ["<skill-id>", "..."],
  "auth_required": false
}
```

The fields under `config` depend on `kind`:

- **`schedule`** — `{ "cron": "0 9 * * *", "tz": "America/Denver" }`
- **`webhook`** — `{ "path": "/webhooks/<id>", "secret_ref": "<credential-key>" }`
- **`inbox`** — `{ "mailbox": "<address>", "filter": "<optional rule>" }`
- **`manual`** — `{ "label": "<button label>" }` — surfaces in the dashboard
- **`upstream-agent`** — `{ "agent_id": "<id>", "event": "<event-name>" }` — wakes when another agent in the pipeline emits

`skills` lists which skill IDs this trigger may invoke. The orchestrator consults this list when routing.

## `.openclaw/architecture.json` — the canonical manifest

This is the single file that ties everything in the workspace into one validated artifact. The runtime loads this file first; everything else is loaded by reference from it. **`architecture.json` is generated by the architect from the workspace contents — it is not hand-authored.**

```json
{
  "spec_version": "1.0.0",
  "agent": {
    "id": "<kebab-case-id>",                 // matches SOUL.md frontmatter slug
    "name": "<display name>",
    "version": "<semver>",
    "role": "<one-line>",
    "authority_lanes": ["<lane>", "..."],
    "voice": { "tone": [...], "forbidden": [...] }
  },
  "skills": [
    {
      "id": "<kebab-case-id>",
      "path": "skills/<skill-id>/SKILL.md",
      "version": "<semver>",
      "depends_on": ["<other-skill-id>", "..."],
      "tools": ["<tool-id>", "..."]
    }
  ],
  "tools": [
    { "id": "<tool-id>", "path": "tools/<tool-id>.json" }
  ],
  "triggers": [
    { "id": "<trigger-id>", "path": "triggers/<trigger-id>.json" }
  ],
  "memory": {
    "index_path": ".openclaw/MEMORY.md",
    "max_entries_warning": 200,
    "tier_lanes": [
      { "tier": 1, "lane": "estimating", "writers": ["lead-estimator@example.com"] }
    ]
  },
  "config_refs": [
    { "id": "labor-rates", "path": ".openclaw/config/labor-rates.json", "schema_ref": "..." }
  ],
  "eval_suite_ref": "tests/eval/eval-tasks.json",
  "checksum": "<sha256 of resolved workspace state>",
  "generated_at": "<ISO-8601 timestamp>",
  "generated_by": "architect@<spec-version>"
}
```

### Why a single canonical file

Without it, an agent's behavior is determined by 50+ files scattered across `skills/`, `tools/`, `triggers/`, `.openclaw/`. The runtime would have to scan, parse, and reconcile on every load. With it, the runtime loads one file, validates it once, and resolves references lazily.

The `checksum` field lets the runtime detect drift between `architecture.json` and the workspace contents. If they diverge, the runtime refuses to load the agent and emits a `MANIFEST_DRIFT` error pointing at the divergent files.

### Who writes `architecture.json`

Only the architect (the coding agent that authored or last modified the workspace). Humans never edit `architecture.json` directly — they edit the upstream files (`SOUL.md`, skill files, tool refs) and the architect regenerates the manifest. The runtime treats hand-edits as drift.

## Identity and addressing

An agent is uniquely identified by:

```
agent_uri = "openclaw://<pipeline-id>/agents/<agent-id>@<version>"
```

For example: `openclaw://ecc-estimator-v1/agents/takeoff-specialist@0.3.1`.

Within a pipeline manifest, agents are referenced by `<agent-id>` (the local id). Across pipelines (e.g., when shipping the takeoff-specialist into a different fleet), the full URI is used.

The `<pipeline-id>` and `<version>` together form the **stable identity**. An agent at the same pipeline + same version MUST behave identically across runs. Behavioral differences require a version bump.

## Lifecycle states

An agent transitions through these states. The runtime tracks state per-agent; the orchestrator coordinates state across agents in a pipeline.

| State | What it means | Who can transition out |
|---|---|---|
| `drafted` | Architect generated the manifest; not yet validated | Architect (after passing schema) |
| `validated` | Manifest passes schema + integrity checks | Architect or human (to start tests) |
| `tested` | Eval suite runs at acceptable pass rate | Architect or human (to ship) |
| `shipped` | Deployed to a pipeline tenant; runtime is loading it | Runtime (auto-transitions on container start) |
| `running` | Actively responding to triggers | Runtime, human (pause), orchestrator (kill) |
| `paused` | Temporarily not responding; manifest preserved | Human, orchestrator |
| `archived` | Replaced by a newer version; kept for audit/rollback | Human (delete after retention period) |

State transitions are logged to the decision log (see [005](005-decision-log.md)).

## Validation rules

The runtime validates a manifest at every load. A manifest fails validation if:

1. **Schema mismatch** — any required field missing, any field type wrong
2. **Manifest drift** — `checksum` does not match recomputed checksum of workspace files
3. **Tool reference broken** — any `tool_kind` not registered in the runtime
4. **Skill dependency cycle** — `depends_on` graph contains a cycle
5. **Authority lane unauthorized** — agent declares lane it has no writers for in pipeline manifest
6. **Spec version unsupported** — `spec_version` not in the runtime's supported range

A failed validation surfaces a typed error (see [014 error taxonomy](014-error-taxonomy.md), category `manifest_invalid`) and the agent is not loaded. The pipeline orchestrator marks the agent as `validated: false` and refuses to route to it.

## Minimal valid example

The smallest agent that conforms. (See [`examples/single-agent-minimal/`](examples/single-agent-minimal/) for the complete tree.)

**`SOUL.md`:**

```markdown
---
name: Hello Agent
slug: hello-agent
spec_version: "1.0.0"
version: "0.1.0"
role: "Greets the user"
authority_lanes: []
voice:
  tone: ["friendly", "concise"]
  forbidden: ["asking unrelated questions"]
---

## Identity
I greet users by name and ask what they want to do.

## Methodology
I read the user's first message, extract a name if present, then respond with a single greeting plus an open question.

## Constraints
I never engage on topics beyond greeting and routing.

## Communication
I keep replies under three sentences and always end with a question.
```

**`skills/greet/SKILL.md`:**

```markdown
---
id: greet
name: Greet user
spec_version: "1.0.0"
description: "Produce a friendly greeting and route the user."
inputs:
  - name: message
    type: text
    required: true
    description: "The user's first message"
outputs:
  - name: reply
    type: text
    description: "Greeting + open question"
tools: []
estimated_duration: "PT1S"
---

## When to use this skill
Whenever the agent receives its first message in a session.

## Process
1. Extract a name from the message if present.
2. Compose: "Hi <name>, how can I help today?"

## Outputs
A single sentence greeting plus a follow-up question.

## Failure modes
- No name extractable → use "there" as fallback.
```

**`tools/`:** empty directory (skill declares no tools).

**`triggers/manual.json`:**

```json
{
  "id": "manual",
  "spec_version": "1.0.0",
  "name": "Manual",
  "kind": "manual",
  "config": { "label": "Say hi" },
  "skills": ["greet"],
  "auth_required": false
}
```

**`.openclaw/MEMORY.md`:** empty index (`# Memory\n` only).

**`.openclaw/architecture.json`:**

```json
{
  "spec_version": "1.0.0",
  "agent": {
    "id": "hello-agent",
    "name": "Hello Agent",
    "version": "0.1.0",
    "role": "Greets the user",
    "authority_lanes": [],
    "voice": { "tone": ["friendly", "concise"], "forbidden": ["asking unrelated questions"] }
  },
  "skills": [
    { "id": "greet", "path": "skills/greet/SKILL.md", "version": "0.1.0", "depends_on": [], "tools": [] }
  ],
  "tools": [],
  "triggers": [
    { "id": "manual", "path": "triggers/manual.json" }
  ],
  "memory": { "index_path": ".openclaw/MEMORY.md", "max_entries_warning": 200, "tier_lanes": [] },
  "config_refs": [],
  "checksum": "sha256:...",
  "generated_at": "2026-04-27T00:00:00Z",
  "generated_by": "architect@1.0.0-alpha.1"
}
```

That's a complete, conformant agent.

## Anti-example — what *not* to do

A common mistake the architect must avoid:

```markdown
---
name: Bad Agent
slug: bad-agent
spec_version: "1.0.0"
version: "0.1.0"
role: "Multipurpose"        # ❌ "multipurpose" is not a role; it's an absence of one
authority_lanes:
  - all                     # ❌ "all" is not a lane; lanes are named domains
voice:
  tone: ["helpful"]         # ❌ generic; doesn't constrain anything
  forbidden: []             # ❌ empty forbidden list = unconstrained voice
---

## Identity
I help with anything.       # ❌ vague identity = drift in production

## Methodology
I do my best.               # ❌ no methodology = no reproducibility

## Constraints
None.                       # ❌ explicit "none" is worse than missing

## Communication
Friendly.                   # ❌ one-word non-answer
```

**Why this fails the spirit of the spec even if it passes the schema:**

- The agent has no constrained behavior — it can drift unboundedly
- The architect cannot generate consistent skills against a vague soul
- The eval loop has nothing to converge against
- Reviewers cannot tell if the agent is doing the right thing

The schema can't catch all of these (you can write "I help with anything" and it's structurally valid markdown), but the **architect must refuse to author manifests like this** — see [101 conformance](101-conformance.md) for the architect's quality bar.

## Cross-references

- [[003-tool-contract]] — the contract every tool referenced by `tools/<tool-id>.json` conforms to
- [[004-memory-model]] — the tier/lane model that `authority_lanes` and `memory.tier_lanes` plug into
- [[005-decision-log]] — what state transitions and runtime events get logged
- [[008-eval-task]] — the format of the eval suite referenced by `eval_suite_ref`
- [[011-pipeline-manifest]] — how multiple agent manifests compose into a pipeline
- [[012-checkpoint]] — how `.openclaw/checkpoints/` works
- [[013-hooks]] — extension points fired during agent lifecycle transitions
- [[101-conformance]] — the architect's quality bar for manifests

## Open questions for ECC pipeline

- Does ECC's lead estimator (Darrow) appear as an `authority_lanes` writer in the pipeline manifest, or in a separate `authority_table.json` referenced from the pipeline? **Tentative**: in the pipeline manifest, since it's a pipeline-wide concern, not per-agent.
- Should `tools/<tool-id>.json` include hash of the tool's spec version it was generated against (forward compatibility)? **Tentative**: defer to v1.1.

These will be revisited when [011 pipeline-manifest](011-pipeline-manifest.md) lands.
