---
name: agent-builder
version: 1.0.0
description: |
  Playbook for designing and shipping high-quality digital employees on the
  openclaw-ruh-enterprise platform. Use when helping the user build a new
  agent, improve the Architect agent itself, review an architecture.json or
  SKILL.md, or refactor an agent's workspace files (SOUL.md, PRD.md, TRD.md,
  skills/*/SKILL.md). Covers the full Think → Plan → Build → Review → Test →
  Ship → Reflect pipeline and encodes the Claude Code patterns (progressive
  disclosure, description-first matching, strict tool scopes) that produce
  agents that actually work in production.
when_to_use: |
  "build an agent", "design an agent", "improve the architect", "write a
  skill", "review this SKILL.md", "new digital employee", "agent plan",
  "PRD for an agent", "architecture.json", "SOUL.md", "forge stage",
  "why is the agent stuck", "plan mode not advancing".
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
metadata:
  openclaw:
    requires:
      bins: [bash, jq]
      env: []
---

# /agent-builder — How to Build Good Digital Employees on Ruh

This skill is the **playbook** the Architect agent (and Claude Code in the IDE) follows when authoring or refactoring an agent on openclaw-ruh-enterprise. It encodes lessons from real debugging sessions and adapts Claude Code's skill-authoring patterns to OpenClaw's runtime.

**Two readers, one source of truth:**
- **Claude Code (IDE)** — auto-loaded when the user says "build an agent / improve the architect / write a skill". Reviews designs, proposes diffs, ships PRs.
- **The Architect** (OpenClaw agent inside a sandbox) — seeded via `sandboxManager.ts` alongside `task-planner`. Read at every turn of the creation conversation.

If you're Claude Code, use this when the user asks about any agent-authoring work. If you're the Architect, re-read this before every stage transition.

---

## Mental Model

```
┌─ Agent = Docker container (its own OpenClaw sandbox)
│  ├── SOUL.md        — who the agent IS (personality, mission, rules)
│  ├── AGENTS.md      — what the agent CAN DO (skill inventory, tools, triggers)
│  ├── IDENTITY.md    — short card: name, role, primary users
│  ├── .openclaw/
│  │   ├── discovery/      PRD.md, TRD.md, research-brief.md
│  │   └── plan/           architecture.json, PLAN.md
│  └── skills/
│      └── <skill-id>/SKILL.md   ← markdown the agent READS, not code it imports
│
└─ Skills are NOT code. They are LLM-readable documents. The agent reads
   SKILL.md at runtime, then uses bash/curl/exec tools to carry out the
   described procedure. Keep skills focused, procedural, and tool-aware.
```

**Multi-agent fleets are supported** when the workflow genuinely needs separate specialist agents coordinated by an orchestrator. Most agents stay single-agent — leave `subAgents` empty unless the TRD describes distinct roles with their own SOULs, skill sets, and hand-off boundaries.

**Heuristic:**
- One agent doing several things in sequence → SINGLE-AGENT (decompose into skills)
- Different agents with different SOULs/skills coordinated by an orchestrator → FLEET (emit `subAgents`)

**When to emit a fleet:** the TRD describes a workflow like "intake → takeoff → pricing → narrative" with each phase owned by a specialist, OR multiple roles coordinating around shared state (e.g., research agent + writer agent + publisher agent + orchestrator).

**Fleet shape (`architecture.json.subAgents[]`):** each entry has `id` (kebab-case), `name`, `description` (one sentence), `type` (`worker` | `specialist` | `monitor` | `orchestrator`), `skills` (skill ids this sub-agent owns), `trigger` (the orchestrator stage that routes to it — typically the sub-agent's own id), `autonomy` (`fully_autonomous` | `requires_approval` | `report_only`).

**The main orchestrator is implicit** — do NOT add it to `subAgents`. Skills NOT assigned to any sub-agent stay on the main orchestrator. The orchestrator owns routing, approvals, and any general-purpose skills.

**What the build pipeline does with this:** identity (`SOUL.md`, `AGENTS.md`, `IDENTITY.md`) and skills specialists run **once per agent** in the fleet, writing under `agents/<id>/`. Pipeline-level specialists (database, backend, dashboard, verify, scaffold) stay shared — one DB schema, one HTTP service, one UI for the whole fleet. Single-agent (empty `subAgents`) preserves the existing root-level paths exactly.

---

## The 7-Stage Creation Pipeline

Every agent is built through these stages (see `docs/knowledge-base/specs/SPEC-agent-creation-lifecycle.md`). The Architect drives a separate conversation mode at each stage with a dedicated system instruction.

| # | Stage | Goal | Writes | Gate to next |
|---|---|---|---|---|
| 1 | **Think** | Research domain, capture requirements | `.openclaw/discovery/{research-brief,PRD,TRD}.md` | User approves PRD+TRD |
| 2 | **Plan** | Lock architecture — skills, data, endpoints, workflow | `.openclaw/plan/{architecture.json,PLAN.md}` | User approves plan |
| 3 | **Build** | Run specialists (scaffold → identity → database ⇄ backend ⇄ skills) | `SOUL.md`, `AGENTS.md`, `skills/*/SKILL.md`, scaffold files, build-manifest.json | Build validator passes |
| 4 | **Review** | Inspect full config (read-only by default; user can jump back) | — | User clicks forward |
| 5 | **Test** | Reinforcement eval loop against the real sandbox | Skill mutations on failure, test report | Target score reached or budget hit |
| 6 | **Ship** | Save + push to GitHub | Agent row, repo | Deploy succeeds |
| 7 | **Reflect** | Post-deploy summary | Session notes | (terminal) |

**Rules of motion:**
- Never skip a stage. Every phase feeds the next.
- Going back is non-destructive. Forward motion requires explicit user approval at 1, 2, 3, 5.
- `PATCH /api/agents/:id/forge/stage` handles transitions. On plan↔build the backend now auto-syncs `architecture.json` + `discovery/*.md` into agent DB columns via `syncPlanFromWorkspace()` in [ruh-backend/src/app.ts](ruh-backend/src/app.ts).

---

## Stage 1: Think — What Belongs in the PRD

Keep it short and concrete. No speculative scope. The PRD is for humans and LLMs; both prefer ~2-5 pages.

Required sections (`## ` markdown headings — the backend parses these):

1. **Problem Statement** — one paragraph, name the pain
2. **Target Users** — primary + secondary, specific roles
3. **Core Capabilities** — numbered list, each one testable
4. **User Flows** — 3–6 happy-path flows, numbered steps
5. **Channels & Integrations** — which services it touches
6. **Data Requirements** — entities + expected volume + update frequency
7. **Dashboard Requirements** — pages the user will open in Mission Control
8. **Dashboard Prototype Expectations** — workflows, create/run actions, pipeline tracking, generated artifacts, approval gates, revision paths, blocker states, and acceptance checks the user must validate before Build
9. **Multi-Agent / Fleet Requirements** — specialist roles, ownership boundaries, handoffs, or an explicit single-agent decision
10. **Memory & Context** — what to remember, what to forget
11. **Success Criteria** — functional, operational, product

**Anti-patterns:** burying requirements in prose • promising features you can't test • omitting success criteria • skipping the memory section (agents with no memory model behave inconsistently).

---

## Stage 1: Think — What Belongs in the TRD

The TRD answers "how would a senior engineer build this?" Paired with the PRD, it's what the Plan stage reads to decide skills.

Required sections:

1. **Architecture Overview** — layers (conversation, orchestration, persistence, integration), data flow, launch-target choice
2. **Skills & Workflow** — proposed skill IDs in kebab-case + execution flow per capability
3. **Sub-Agent Ownership** — sub-agent ids, roles, owned skills, triggers, autonomy, handoffs, or an explicit single-agent decision
4. **External APIs & Tools** — one block per provider: base URL, docs link, auth method, key endpoints, rate limits, what we use it for
5. **Database Schema** — `CREATE TABLE` DDL in SQLite/Postgres with indexes
6. **API Endpoints** — `GET/POST /api/...` with request/response shapes
7. **Dashboard Pages** — path + components + which endpoints they consume
8. **Dashboard Prototype Contract** — page-to-workflow mapping, mutating dashboard actions, pipeline steps, generated artifacts, acceptance checks, revision prompts, approval checklist
9. **Vector Collections** — names + contents + "embedded when" + "used for"
10. **Triggers & Scheduling** — manual, scheduled (cron), event-style
11. **Environment Variables** — one line per var with example value
12. **Error Handling & Guardrails** — retry policy, rate-limit handling, dangerous-operation safeguards

**Rule:** every skill in §2 must correspond to a row in the architecture.json. Every sub-agent in §3 must appear in `architecture.json.subAgents`. Every env var in §11 must appear in `architecture.json.envVars` with a human-readable label.

---

## Stage 2: Plan — architecture.json Shape

This is the machine-readable contract between Plan and Build. Get it wrong and every downstream specialist produces garbage.

**Workspace contract:** read approved Think outputs from `~/.openclaw/workspace/.openclaw/discovery/{PRD.md,TRD.md,research-brief.md}`. Write `architecture.json` and `PLAN.md` to `~/.openclaw/workspace-copilot/.openclaw/plan/`, then mirror them to `~/.openclaw/workspace/.openclaw/plan/` so Prototype, Build, and backend sync consume the same plan.

```jsonc
{
  "name": "Test Marketplace Agent",
  "systemName": "Test Marketplace Agent",
  "description": "Short one-liner. Stored in agents.description.",

  "architectureDecisions": {
    "summary": "One-paragraph summary of the architectural bet.",
    "notes": ["Bullet rationale lines for the non-obvious choices."]
  },

  "skills": [
    {
      "id": "marketplace-account-connect",           // kebab-case, stable
      "name": "Marketplace Account Connect",         // human label
      "description": "One line — what this skill does.",
      "dependencies": ["other-skill-id"],            // topological order
      "toolType": "api",                             // api | cli | mcp | native
      "envVars": ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]
    }
  ],

  "workflow": {
    "steps": [
      { "skillId": "marketplace-account-connect", "purpose": "OAuth + store tokens", "parallel": false }
    ],
    "parallelGroups": []                             // optional
  },

  "dataSchema": { "tables": [ /* ... */ ] },
  "apiEndpoints": [ /* ... */ ],
  "dashboardPages": [ /* ... */ ],
  "dashboardPrototype": {
    "summary": "Interactive dashboard prototype contract.",
    "actions": [
      { "id": "create-work", "label": "Create work item", "type": "create", "target": "work_item", "primary": true },
      { "id": "run-pipeline", "label": "Run pipeline", "type": "run_pipeline", "target": "pipeline", "primary": true }
    ],
    "pipeline": {
      "name": "User-visible work pipeline",
      "triggerActionId": "run-pipeline",
      "steps": [{ "id": "intake", "name": "Intake", "producesArtifacts": ["source-evidence"] }],
      "completionCriteria": ["Artifacts are ready for approval"],
      "failureStates": ["Missing source evidence"]
    },
    "artifacts": [
      { "id": "source-evidence", "name": "Source evidence map", "type": "evidence", "reviewActions": ["approve_artifact", "request_revision"], "acceptanceCriteria": ["Evidence is traceable"] }
    ]
  },
  "vectorCollections": [ /* ... */ ],
  "triggers": [ /* ... */ ],
  "eventTriggers": [ /* ... */ ],

  "envVars": [
    {
      "key": "EBAY_CLIENT_ID",
      "label": "eBay Client ID",
      "description": "Application client ID from eBay Developer portal.",
      "required": true,
      "inputType": "text",                           // text | password | textarea | select
      "group": "Credentials",
      "example": "abc123-prod-client-id"
    }
  ]
}
```

**Frontend shape gotchas — violating these crashes the builder page:**

| Column | Expected shape | Wrong shape that broke the UI |
|---|---|---|
| `skill_graph` | `SkillGraphNode[]` array | Writing the raw architecture.json object blows up `runtime-inputs.ts` and `TabMissionControl.tsx` |
| `workflow` | `{ steps: [{skillId, parallel?, purpose?}] }` | Missing `steps` or using `step.skill` instead of `step.skillId` |
| `discovery_documents` | `{ prd: {title, sections[]}, trd: {title, sections[]} }` with both present | Missing either key or non-object |
| `agent_rules` / `runtime_inputs` / `skills` | Always arrays | Ever letting these become objects |

The DB→UI loader (`hooks/use-agents-store.ts:83-90`) casts these types but does not validate shape. A wrong shape produces `TypeError: object is not iterable` at first render.

**SkillGraphNode shape the UI expects** (from `agent-builder-ui/lib/openclaw/types.ts:11`):
```ts
{
  skill_id: string,
  name: string,
  source: "custom" | "clawhub" | "skills_sh" | "data_ingestion" | "native_tool" | "existing",
  status: "found" | "generating" | "generated" | "approved" | "rejected",
  depends_on: string[],
  description?: string,
  requires_env?: string[],
  tool_type?: "mcp" | "api" | "cli"
}
```

When you write architecture.json skills, the Architect must also emit a compatible SkillGraphNode projection (or the backend's `syncPlanFromWorkspace` does it — see [ruh-backend/src/app.ts](ruh-backend/src/app.ts)).

---

## Stage 3: Build — How to Write a Good SKILL.md

Each skill in `architecture.json.skills` becomes a file at `~/.openclaw/workspace/skills/<skill-id>/SKILL.md`. The **agent reads it at runtime** and follows it as instructions. It is not code.

### Frontmatter template (OpenClaw-compatible)

```yaml
---
name: marketplace-account-connect
version: 1.0.0
description: "OAuth flow for eBay/Etsy accounts + persists token metadata."
user-invocable: false
allowed-tools:
  - Bash
  - Read
  - Write
metadata:
  openclaw:
    requires:
      bins: [curl, jq]
      env: [EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REDIRECT_URI]
    primaryEnv: EBAY_CLIENT_ID
---
```

**Field discipline:**
- **`description` is the single most important field.** Front-load the trigger phrase. Combined with `when_to_use` it's capped at ~1,536 chars and Claude/Architect match on it first.
- **`user-invocable: false`** for skills only the agent triggers; `true` for ones the end-user can call as a command.
- **`allowed-tools`** — minimum viable set. If a skill doesn't need `Write`, don't list it. OpenClaw honors this to prune the agent's toolbelt for this skill.
- **`metadata.openclaw.requires.env`** — must match architecture.json envVars. Mismatch = silent failure at runtime.

### Body structure (5 sections, in this order)

```markdown
## Purpose
One sentence. The user request this skill responds to.

## Input
What the agent receives — session key, arguments, prior tool outputs.
Be specific. Say "a string email like `alice@example.com`" not "user info".

## Process
Numbered steps. Inline the bash/curl the agent should run.
Use `${ENV_VAR}` for secrets. Never hard-code.

1. Fetch access token:
   ```bash
   curl -sX POST "$EBAY_TOKEN_URL" \
     -u "${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}" \
     -d "grant_type=client_credentials&scope=..."
   ```
2. Persist to SQLite: `INSERT INTO marketplace_accounts ...`

## Output
What the skill returns. Shape of the JSON, where it's stored on disk.
If it writes to the DB, name the table + columns.

## Error Handling
- **401 / 403** → refresh token, retry once, else surface as `auth_error`
- **429** → honor `retry-after`, exponential backoff (max 5 attempts)
- **5xx** → retry with jitter, max 3, then `surface_error`
- **schema/validation** → do NOT retry, create a `validation_issue` row
```

### Write skills like Claude Code: progressive disclosure

Don't paste 500 lines of reference into SKILL.md. Put details in siblings and reference them:

```
skills/marketplace-account-connect/
├── SKILL.md                    ← under 200 lines, the playbook
├── reference/
│   ├── ebay-oauth-flow.md      ← full eBay OAuth spec, loaded only if the agent hits a branch that needs it
│   └── etsy-error-codes.md
└── scripts/
    └── refresh-token.sh        ← agent runs via bash, doesn't load into context
```

Reference them by relative path in SKILL.md:
> For the full OAuth redirect handshake, read `reference/ebay-oauth-flow.md`.

**SKILL.md should stay under 500 lines.** If it grows past that, the agent is trying to do too much — split the skill.

### Description quality checklist

A good description makes the architect/agent reach for this skill at the right time. Test yours:

- [ ] Starts with a verb or noun phrase, not "This skill..."
- [ ] Names at least one trigger phrase the user would actually type
- [ ] States the input type and the output type
- [ ] Fits in ~160 characters for the key line (front-loaded)
- [ ] Doesn't overlap another skill's description (ambiguity makes the agent pick wrong)

---

## Stage 3: Build — How to Write SOUL.md

SOUL.md is the agent's personality + behavior constitution. The agent reads it at every turn. Keep it opinionated and short.

Structure:

```markdown
# <Agent Name> — Identity

## Who I Am
One paragraph. First person. Role + core conviction.

## Mission
What I exist to do. Bullet list of 3-5.

## How I Work
- How I talk (tone, formality, emoji policy)
- How I make decisions (defer / propose / act)
- When I ask for help vs push back
- What I refuse to do

## Operating Rules
Non-negotiables. Keep to 5–10. Example:
- Never publish a listing without running `listing-validate-<marketplace>` first.
- Never store raw OAuth secrets in plain text; use `${CREDENTIAL_STORE}`.
- On publish failure, always create a `validation_issue` row before surfacing.

## Memory Discipline
- Remember: connected accounts, draft-to-remote mappings, user preferences
- Forget: transient API failures (unless repeated), raw request bodies

## Workflow
Optional: a short narrative of the typical day. Use only if the agent has clear rituals.
```

**Anti-patterns:** writing SOUL.md as tech spec (leave that to TRD) • generic personality fluff ("I'm here to help!") • rules contradicting each other (test them pairwise) • >600 lines (the LLM drifts).

---

## Stage 3: Build — AGENTS.md

The manifest. Machine-adjacent but human-readable. Generated from architecture.json during the identity specialist stage.

```markdown
# <Agent Name> — Agent Manifest

## Skills
- `marketplace-account-connect` — OAuth + token persistence
- `listing-validate-ebay` — validation against eBay rules
- ...  (one line per skill)

## Tools
- SQLite — `${DATABASE_URL}`
- eBay Sell API — `${EBAY_CLIENT_ID}`
- Etsy Open API v3 — `${ETSY_API_KEYSTRING}`

## Triggers
- Manual: "publish", "validate", "sync now"
- Scheduled:
  - `*/15 * * * *` — reconcile stale listings
  - `0 * * * *` — account health check
- Event: on draft save → queue validation

## Workflow
1. Connect account → 2. Validate → 3. Publish → 4. Sync → 5. Reconcile → 6. Triage issues
```

---

## Stage 5: Test — What a Real Eval Loop Looks Like

GEPA-style: **real sandbox, real tool calls, cost-bounded.**

1. Generate eval scenarios from PRD's user flows + common failure modes
2. Run each scenario against the agent's **own container** (not the architect's)
3. Score on: functional success, tool-call correctness, output shape, guardrail adherence
4. If failing threshold: propose a skill mutation (edit the offending SKILL.md), re-run
5. Cap total loop cost at `$1–$5` per agent; stop on budget hit or target score

**Red flags during test:**
- Agent keeps retrying a failed tool without changing approach → **circuit-breaker missing** in the skill
- Same error class across multiple scenarios → **TRD gap**, not a skill bug
- "Thinking forever" with no LLM call in the gateway log → tool is returning non-actionable error, LLM can't make progress. Inject a synthetic "no results, continue without X" response.

---

## Common Failures (from real debug sessions)

| Symptom | Cause | Fix |
|---|---|---|
| Plan stage "complete" but UI shows empty | Backend wrote to workspace files but never populated `skill_graph` / `discovery_documents` DB columns | `POST /api/agents/:id/forge/sync-plan` (now wired into `PATCH /forge/stage`) |
| Agent hangs in Plan mode thinking | `web_search` blocked by DuckDuckGo bot check + `web_fetch` 400s on target site | Swap search provider (Brave/SerpAPI) OR add a circuit-breaker that returns "continue without research" after 2 failures |
| WS proxy returns `token_mismatch` | v2026.4.14 CONNECT client params against v2026.3.24 gateway | Match `client.version` / `client.mode` to the actual gateway version |
| Agent in sandbox A produces content for agent B's workspace | `/api/openclaw/architect-sandbox` fallback picks "any sandbox with VNC" when `agent.forge_sandbox_id` is null | Scope the fallback to unclaimed sandboxes, or 404 and force explicit provision |
| Create page crashes with `TypeError: object is not iterable` | A JSONB column that should be an array is an object | `Array.isArray(...)` coerce in the consumer; write the right shape at the source |
| Stale `const agentLabel has already been declared` after the file is fixed | Next.js webpack in-memory module cache | `pkill -f "next dev" && rm -rf .next && next dev` — `rm -rf .next/cache/webpack/` + touch is not enough |

**General rule:** if two symptoms appeared at once during a session, they're usually one cause. Don't patch both surfaces; find the root.

---

## Adapting Claude Code Patterns to OpenClaw

Claude Code's skill system has conventions we should borrow. These are pulled both from the public skills docs and from what Anthropic actually ships in the `claude-code-main` repo at `~/Documents/workspace/work/projects/claude-code-main/` — specifically `Skill.md` and `agent.md` at that repo root, which are the canonical authoring guides.

| Claude Code pattern | Source | How it maps to OpenClaw |
|---|---|---|
| **Progressive disclosure** — SKILL.md under 500 lines, supporting files loaded only when referenced | docs + `Skill.md` layout | Same. Use `reference/` and `scripts/` subdirs. Agent reads only what it needs. |
| **Description-first matching** — the first ~160 chars of `description` decide whether the skill is picked | docs | Same, but even more critical: OpenClaw's embedded-run agent has fewer retries than Claude Code |
| **`allowed-tools` = minimum viable set** | docs + `Tool.ts` permission model | Same. OpenClaw's `metadata.openclaw.requires.bins` should be similarly minimal |
| **Granular permission rules** like `Bash(git *)`, `FileEdit(/src/*)` | `Skill.md` → "Permission System" section | OpenClaw `allowed-tools` supports glob-style. Don't list `Bash` wholesale if the skill only runs `git *` |
| **`disable-model-invocation: true`** for side-effect actions (deploy, send) | docs | Use `user-invocable: true` + a confirmation step in the skill body. OpenClaw doesn't have the same frontmatter, but the principle holds |
| **Subagent (`context: fork`) for isolated research** | docs | Not available on OpenClaw. Compensate by keeping research phases short and asking the user for context instead of autonomously crawling |
| **Hooks for deterministic post-tool behavior** | docs | Not yet wired into OpenClaw gateway. If you need a guarantee (e.g., always persist a sync_event), put it explicitly in the SKILL.md's Process section |
| **`paths` glob to limit when a skill activates** | docs | No direct equivalent. Use tight `description` phrasing instead. |

**Key lesson:** Claude Code's skill discovery works because skills are *documents with strong descriptions*, not APIs. Port that discipline. The Architect picks a skill by reading its description; if your description is vague, the wrong skill wins.

### Conventions from `claude-code-main/Skill.md` and `agent.md`

A few patterns visible in Anthropic's own repo conventions (not in the public docs) that are worth borrowing for our agents:

**1. Meta-skill vs domain-skill split.** The CLI ships ~16 bundled meta-skills (`batch`, `debug`, `loop`, `remember`, `simplify`, `stuck`, `verify`, `skillify`, `updateConfig`, etc.) separate from domain actions. These are *workflow* skills, not feature skills. For OpenClaw agents, mirror this: author a small set of meta-skills per agent (`reconcile-state`, `triage-failure`, `summarize-day`) alongside the domain skills from the architecture plan. The Architect's seeded skills (`task-planner`, `employee-reveal`, `agent-builder`) already follow this pattern.

**2. Safety classification as a skill-body marker.** Claude Code's `Tool` interface has `isReadOnly()` and `isConcurrencySafe()` as explicit fields (`Skill.md` → "Tool Definition" section). OpenClaw SKILL.md frontmatter doesn't carry these, but the concept is critical at runtime. **Add a `## Safety` block to the body** of every non-trivial skill:

```markdown
## Safety
- **Class:** mutating | read-only | irreversible
- **Concurrency:** serial-per-account (holds an advisory lock) | safe-parallel
- **Reversible?** yes — via `listing-revert-publish` | no — remote side-effect
- **Confirmation required?** yes when `quantity_delta > 10` or `price_delta > 20%`
```

This is what lets the Architect tell the agent "you can run this freely" vs "ask first". OpenClaw has no type system enforcing this — the discipline has to live in the skill body.

**3. Terse operating guides.** `claude-code-main/agent.md` is **34 lines total** — Purpose, Core Rules, Workflow, Code Style, Validation, Notes. Each section is 3-6 bullets. Our SOUL.md "Operating Rules" section should be held to the same tightness. If it grows past ~40 lines, the agent starts interpreting loosely. Move long explanations to separate reference files.

**4. Tech-stack fingerprint at the top of project skills.** `claude-code-main/Skill.md` opens with a "Tech Stack" table (language, runtime, UI library, CLI parser, API client, validation, linter, analytics, protocol). For generated agents, the equivalent is a **Runtime Fingerprint** at the top of `AGENTS.md` — what the agent runs on, what protocols it speaks, what secrets it holds. This is what lets the next session (or the next Claude) orient in 10 seconds instead of spelunking.

**5. Directory map over prose.** Both `Skill.md` and `agent.md` lead with structure tables instead of narrative. When writing `AGENTS.md` for a new agent, start with a directory-map table showing where skills, workflows, data, and docs live. Prose belongs in PLAN.md, not the manifest.

**6. Naming discipline.** From `Skill.md` → "Naming Conventions":
- Files: PascalCase for components (`BashTool.tsx`), kebab-case for commands (`commit-push-pr.ts`)
- Hooks: `use` prefix
- Constants: `SCREAMING_SNAKE_CASE`
- Types: PascalCase with `Props`/`State`/`Context` suffix

For OpenClaw skills, adopt: **skill ids in kebab-case** (`listing-publish-ebay`, not `ListingPublishEBay`), **env var refs in SCREAMING_SNAKE_CASE** (`${EBAY_CLIENT_ID}`), **skill names as verb-phrase** (`Listing Publish — eBay`, not `eBay Publisher`). The Architect has been inconsistent here; enforce it in review.

**7. Lazy-import and feature-flag gating.** The CLI uses `bun:bundle` feature flags to dead-code-eliminate experimental paths at build time. We don't bundle SKILL.md files, but the moral equivalent is: **don't ship half-finished skills in a new agent's workspace**. If a skill is aspirational (listed in architecture.json but not yet authored), leave it out of `skills/` entirely rather than shipping a stub. The Architect treats every SKILL.md it sees as loaded capability.

---

## Checklists

### Before shipping an agent (pre-Ship)

- [ ] PRD has all 11 required sections
- [ ] TRD has all 12 required sections + env vars and sub-agents match architecture.json
- [ ] architecture.json passes `skill_graph` shape validation (array of SkillGraphNode, not raw object)
- [ ] Each skill has a SKILL.md with frontmatter + 5-section body
- [ ] Each skill's `allowed-tools` is the minimum viable set
- [ ] SOUL.md has Mission + Operating Rules + Memory Discipline sections
- [ ] AGENTS.md manifest lists every skill + every env var
- [ ] `DATABASE_URL`, core auth vars, and at least one marketplace/API var are in `envVars`
- [ ] Test loop produced a green run (no manual "it looks fine")
- [ ] Dashboard pages resolve from the endpoints they reference
- [ ] Every trigger has a skillId that exists
- [ ] No skill references a tool the agent doesn't have

### Before approving a SKILL.md review

- [ ] Description has a trigger phrase a user would type
- [ ] Process section has inline commands (not vague "call the API")
- [ ] Error Handling covers 401/403, 429, 5xx, validation
- [ ] Secrets are `${VAR}` references, never literals
- [ ] File is under 500 lines; details pushed to `reference/` if larger
- [ ] Mentioned env vars appear in `metadata.openclaw.requires.env`
- [ ] No overlap with another skill's description
- [ ] `## Safety` block present for any mutating skill (class + concurrency + reversibility + confirmation threshold)
- [ ] Skill id is kebab-case; name is verb-phrase
- [ ] `allowed-tools` uses glob-scoped permissions where possible (`Bash(git *)` not bare `Bash`)

---

## Related

- `.claude/skills/openclaw-logs/SKILL.md` — use when debugging why an agent is stuck mid-stage
- `.claude/skills/kb/SKILL.md` — keep the KB updated when architecture changes
- `.claude/skills/gcp-server/SKILL.md` — production operations for deployed agents
- `docs/knowledge-base/specs/SPEC-agent-creation-lifecycle.md` — canonical lifecycle spec
- `ruh-backend/src/scaffoldTemplates.ts` — deterministic scaffold generators
- `ruh-backend/src/specialistPrompts.ts` — Identity / Skills / Backend specialist prompts
- `ruh-backend/src/app.ts` — `syncPlanFromWorkspace()` that turns workspace files into DB columns
- `ruh-backend/src/sandboxManager.ts` — seeds this skill into every new sandbox at bootstrap
