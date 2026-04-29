# SPEC: Agent Creation v3/v4 — Workspace-First Build Pipeline

[[000-INDEX|<- Index]] | [[008-agent-builder-ui]] | [[003-sandbox-lifecycle]] | [[011-key-flows]] | [[001-architecture]]

## Status

implemented

## Summary

Replaces the original single-prompt, markdown-only build phase with a workspace-first pipeline. Think produces research + PRD + TRD as workspace files via multi-step research. Plan produces structural decisions (no inline file content) via incremental markers. Build decomposes the architecture plan into a tracked task graph executed by specialist sub-agents that produce real code. The shipped GitHub repo becomes a self-contained, deployable agent template.

**v4 implementation (2026-04-04):** All three phases redesigned. Think is now a multi-step research agent with structured markers (`<think_step>`, `<think_research_finding>`, `<think_document_ready>`). Plan emits incremental structural decisions (`<plan_skills>`, `<plan_workflow>`, etc.) without inline `skillMd`/`soulContent`. Build uses a single v4 orchestrator with scaffold + specialist sub-agents + post-build validation. v1 (sequential) and v2 (parallel) build paths removed. Key files: `builder-agent.ts`, `build-orchestrator.ts`, `build-validator.ts`, `copilot-state.ts`, `event-consumer-map.ts`.

## Related Notes

- [[008-agent-builder-ui]] — Builder UI architecture, lifecycle stages, copilot state
- [[003-sandbox-lifecycle]] — How agent containers are created and managed
- [[011-key-flows]] — Agent creation flow end-to-end
- [[004-api-reference]] — Backend API endpoints
- [[005-data-models]] — ArchitecturePlan, SkillGraphNode, DataSchema types
- [[001-architecture]] — System overview, sandbox=container model
- [[SPEC-real-agent-evaluation]] — Test stage evaluation harness (downstream consumer)
- [[SPEC-copilot-config-workspace]] — Co-Pilot workspace layout
- [[SPEC-agent-discovery-doc-persistence]] — PRD/TRD persistence contract
- [[SPEC-agent-creation-lifecycle]] — Full 8-stage lifecycle reference (Think through Reflect)

## Problem

### Think phase: ephemeral and shallow

1. **Discovery outputs live only in browser memory.** The PRD and TRD are stored in the Zustand copilot store. A page refresh during Build loses them. The sandbox workspace has no record of what was decided.

2. **No research step.** The Think phase asks the user questions and generates documents from their answers. It does not browse the web, read API docs, study competitors, or examine real-world examples of the problem domain. The PRD/TRD are derived purely from user text input.

3. **No validation.** The generated PRD/TRD are not checked against any standard for completeness. A one-sentence answer produces a one-sentence PRD section — garbage in, garbage out.

### Plan phase: disconnected from workspace

1. **Architecture plan lives only in browser memory.** The `ArchitecturePlan` JSON is in the Zustand store. It is not written to the workspace. If the browser tab closes, it is gone.

2. **Rich fields are ignored.** The `ArchitecturePlan` type already defines `dataSchema`, `apiEndpoints`, `dashboardPages`, `vectorCollections`, `subAgents`, and `missionControl`. The Plan phase does not populate most of these, and the Build phase ignores all of them.

3. **No dependency analysis.** The plan does not model which skills depend on which API endpoints, which endpoints depend on which database tables, or which dashboard pages consume which endpoints. Build receives a flat list and figures it out (or doesn't).

### Build phase: single-shot prompt dump

1. **One LLM call does everything.** The entire architecture plan JSON is serialized into one massive chat prompt. A single architect agent linearly writes all files via shell commands. For complex agents with 8+ skills, backend routes, database tables, and dashboard pages, this exceeds what one context window can handle well.

2. **No task decomposition.** There is no build manifest, no task graph, no progress tracking against the plan. The architect writes files in whatever order it chooses and has no way to signal partial completion or retry a failed file.

3. **No specialist sub-agents.** Writing a PostgreSQL migration requires different expertise than writing a React dashboard page or an Express route handler. Today, one generalist architect writes all of them.

4. **No code generation.** The build writes SOUL.md, AGENTS.md, SKILL.md (all markdown) and JSON tool/trigger configs. It does not write TypeScript backend routes, SQL migrations, React components, Dockerfiles, or package.json. The "agent" is a folder of documentation.

5. **No validation.** After Build completes, nothing checks whether the workspace matches the plan. Missing skills, broken imports, or incomplete migrations pass silently.

### Ship phase: pushes an incomplete repo

The Ship step faithfully pushes whatever is in the workspace to GitHub. Since the workspace only contains markdown files, the GitHub repo is not a working agent template. It cannot be cloned, installed, or run.

## Specification

### Phase 1: Think — Research & Requirements

#### 1.1 Research step (new)

Before generating the PRD/TRD, the Think phase should research the problem domain:

```
Think phase flow:
  User describes agent purpose
      |
      v
  [Research Agent]
      |-- Browse web for domain knowledge (Google Ads API docs, competitor tools, best practices)
      |-- Identify relevant APIs, SDKs, data models
      |-- Note rate limits, auth methods, common pitfalls
      |-- Produce a Research Brief (3-5 key findings)
      |
      v
  [Requirements Agent]
      |-- Reads user description + research brief
      |-- Generates PRD (product requirements)
      |-- Generates TRD (technical requirements, informed by real API docs)
      |-- Validates completeness against a requirements checklist
      |
      v
  User reviews & edits PRD/TRD
      |
      v
  [Persist to workspace]
      |-- Writes ~/.openclaw/workspace/.openclaw/discovery/research-brief.md
      |-- Writes ~/.openclaw/workspace/.openclaw/discovery/PRD.md
      |-- Writes ~/.openclaw/workspace/.openclaw/discovery/TRD.md
      |-- Git commits: "think: approved requirements"
```

#### 1.2 Workspace persistence

At Think completion (user approves), write all outputs to the workspace:

```
~/.openclaw/workspace/.openclaw/discovery/
    research-brief.md     <- Domain research findings
    PRD.md                <- Product Requirements Document
    TRD.md                <- Technical Requirements Document
```

These files are versioned in the workspace git repo. They survive page refresh, session timeout, and browser crash.

#### 1.3 Requirements checklist

The Requirements Agent validates each PRD/TRD against a minimum completeness standard:

**PRD must include:**
- [ ] Problem statement (what pain does this agent solve?)
- [ ] Target users (who uses this agent?)
- [ ] Core capabilities (what can it do? — maps to skills)
- [ ] Success criteria (how do you know it's working?)
- [ ] Integration points (what external systems does it touch?)

**TRD must include:**
- [ ] Data model (what data does the agent read/write?)
- [ ] API dependencies (external APIs with auth methods)
- [ ] Infrastructure requirements (database, storage, cron)
- [ ] Security considerations (credentials, PII handling)
- [ ] Performance expectations (latency, throughput, rate limits)

Items that can't be inferred are flagged to the user, not silently skipped.

### Phase 2: Plan — Architecture & Task Graph

#### 2.1 Architecture plan generation

The Plan phase reads the persisted PRD/TRD from the workspace (not from browser memory) and generates a complete `ArchitecturePlan` that populates ALL fields:

```typescript
interface ArchitecturePlan {
  // Already defined in types.ts — all fields MUST be populated:
  skills: ArchitecturePlanSkill[];       // What the agent can do
  workflow: ArchitecturePlanWorkflow;     // Execution order
  integrations: ArchitecturePlanIntegration[]; // External tools (MCP/API/CLI)
  triggers: ArchitecturePlanTrigger[];    // When the agent activates
  channels: string[];                    // Communication channels
  envVars: ArchitecturePlanEnvVar[];     // Required credentials/config
  subAgents: SubAgentConfig[];           // Worker agents (if any)
  missionControl: MissionControlConfig;  // Dashboard layout

  // v2 fields — MUST be populated (currently ignored):
  dataSchema: DataSchema;                // PostgreSQL tables + relations
  apiEndpoints: ApiEndpoint[];           // Express routes for each skill
  dashboardPages: DashboardPage[];       // React pages with widgets
  dashboardPrototype?: DashboardPrototypeSpec; // Required if dashboardPages is non-empty; includes workflows, actions, pipeline, artifacts
  vectorCollections: VectorCollection[]; // RAG collections (if needed)
}
```

#### 2.2 Dependency graph

The plan must include a dependency graph that models build order:

```typescript
interface BuildDependency {
  from: string;   // e.g. "api:campaigns-list"
  to: string;     // e.g. "schema:campaigns-table"
  type: "requires" | "consumes" | "extends";
}

interface ArchitecturePlan {
  // ... existing fields ...
  buildDependencies: BuildDependency[];
  buildPhases: BuildPhase[];  // Ordered groups of parallelizable tasks
}

interface BuildPhase {
  name: string;          // e.g. "foundation", "core", "interface"
  tasks: BuildTask[];
  parallelizable: boolean;
}

interface BuildTask {
  id: string;
  type: "soul" | "schema" | "migration" | "skill" | "api-route" | "service" | "dashboard-page" | "tool-config" | "trigger-config" | "scaffold";
  description: string;
  specialist: "soul-writer" | "db-engineer" | "backend-engineer" | "skill-builder" | "frontend-engineer" | "integration-builder" | "scheduler-builder";
  inputs: string[];     // IDs of tasks or plan artifacts this depends on
  outputs: string[];    // File paths this task will produce
  status: "pending" | "in-progress" | "done" | "failed";
}
```

#### 2.3 Workspace persistence

At Plan approval, write the plan to the workspace:

```
~/.openclaw/workspace/.openclaw/plan/
    architecture.json       <- Full ArchitecturePlan (machine-readable)
    PLAN.md                 <- Human-readable summary with dependency diagram
    build-manifest.json     <- BuildPhase[] with task graph (build instructions)
```

The Build phase reads these files. It does NOT receive the plan via chat prompt.

`dashboardPrototype` is part of the Build contract, not only a frontend review artifact. Server-side Build must preserve it when writing the main workspace plan, and must merge the approved value from `creation_session.coPilot.architecturePlan.dashboardPrototype` if an older `.openclaw/plan/architecture.json` was written before the prototype stage existed. The deterministic dashboard scaffold then renders workflow steps, required actions, pipeline steps, generated artifacts, page acceptance criteria, revision prompts, and approval checklist content into the generated dashboard pages so the preview matches the reviewed prototype. It also generates seeded sandbox API state and mutation routes for the prototype actions, so the built dashboard can create/reset demo work, advance the pipeline, generate/approve/revise artifacts, resolve blockers, and run QA before deeper integration specialists replace the demo implementations. The Prototype UI uses the same fields to simulate create/run/review/approve flows before any Build specialist writes dashboard files.

#### 2.4 Plan validation

Before marking Plan as approved, validate:

- [ ] Every skill has at least one API endpoint that serves it
- [ ] Every API endpoint references at least one data schema table
- [ ] Every dashboard page references at least one API endpoint
- [ ] Every dashboard plan has an approved prototype spec with user workflows, required actions, pipeline/artifact tracking when the dashboard creates work, and acceptance checks
- [ ] Every planned fleet has `subAgents[]` entries that match the TRD Sub-Agent Ownership section
- [ ] Every integration has required env vars defined
- [ ] Every trigger references an existing skill or endpoint
- [ ] The dependency graph is acyclic
- [ ] All `dataSchema` tables have primary keys defined
- [ ] All `apiEndpoints` have request/response schemas defined

### Phase 3: Build — Task-Driven Specialist Execution

#### 3.1 Build Orchestrator

The Build phase reads `build-manifest.json` from the workspace and executes tasks in dependency order:

```
[Build Orchestrator]
    |
    |-- Reads .openclaw/plan/build-manifest.json
    |-- Reads .openclaw/plan/architecture.json
    |
    |-- Phase 1: Foundation (sequential)
    |   |-- Task: scaffold         -> package.json, Dockerfile, docker-compose.yml, .env.example, README.md
    |   |-- Task: soul             -> SOUL.md, AGENTS.md, IDENTITY.md
    |   |-- Task: schema           -> db/schema.sql, db/migrations/001_initial.sql, db/seed/
    |
    |-- Phase 2: Core (parallel)
    |   |-- Task: skill-1          -> skills/google-ads-audit/SKILL.md + skills/google-ads-audit/handler.ts
    |   |-- Task: skill-2          -> skills/budget-pacing/SKILL.md + skills/budget-pacing/handler.ts
    |   |-- Task: api-route-1      -> backend/routes/campaigns.ts + backend/services/campaignService.ts
    |   |-- Task: api-route-2      -> backend/routes/reports.ts + backend/services/reportService.ts
    |   |-- Task: tool-google-ads  -> tools/google-ads.json + tools/google-ads-client.ts
    |   |-- Task: trigger-daily    -> triggers/daily-audit.json
    |
    |-- Phase 3: Interface (depends on Phase 2)
    |   |-- Task: dashboard-overview  -> dashboard/pages/Overview.tsx + dashboard/hooks/useOverview.ts
    |   |-- Task: dashboard-campaigns -> dashboard/pages/Campaigns.tsx + dashboard/hooks/useCampaigns.ts
    |   |-- Task: mission-control     -> dashboard/layout.tsx + dashboard/components/
    |
    |-- Phase 4: Integration (depends on Phase 2)
    |   |-- Task: backend-index    -> backend/index.ts (wires all routes)
    |   |-- Task: backend-middleware -> backend/middleware/auth.ts, validation.ts
    |
    |-- Phase 5: Validation
    |   |-- Runs: migration dry-run against test DB
    |   |-- Runs: TypeScript compile check
    |   |-- Runs: plan-vs-workspace diff (every plan item has a file)
    |   |-- Reports: build pass/fail with per-task status
```

#### 3.2 Specialist sub-agents

Each task is executed by a specialist sub-agent that reads the architecture plan from the workspace and writes its output files:

| Specialist | Reads from plan | Writes to workspace |
|-----------|----------------|-------------------|
| **Scaffold Builder** | `envVars`, `integrations` | `package.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `tsconfig.json`, `README.md` |
| **Soul Writer** | `skills`, `workflow`, `channels` | `SOUL.md`, `AGENTS.md`, `IDENTITY.md` |
| **DB Engineer** | `dataSchema` | `db/schema.sql`, `db/migrations/*.sql`, `db/seed/*.sql`, `db/types.ts` |
| **Skill Builder** | `skills[i]`, `integrations` | `skills/<id>/SKILL.md`, `skills/<id>/handler.ts`, `skills/<id>/test.ts` |
| **Backend Engineer** | `apiEndpoints`, `dataSchema` | `backend/routes/<name>.ts`, `backend/services/<name>.ts`, `backend/middleware/*.ts`, `backend/index.ts` |
| **Frontend Engineer** | `dashboardPages`, `apiEndpoints`, `missionControl` | `dashboard/pages/<name>.tsx`, `dashboard/hooks/<name>.ts`, `dashboard/components/*.tsx`, `dashboard/layout.tsx` |
| **Integration Builder** | `integrations` | `tools/<id>.json`, `tools/<id>-client.ts` |
| **Scheduler Builder** | `triggers` | `triggers/<id>.json` |

Each specialist:
1. Reads `architecture.json` for full context
2. Reads its specific plan section for implementation details
3. Writes files to the workspace via shell commands
4. Updates `build-manifest.json` task status to `done`
5. Returns a summary of what it produced

#### 3.3 Task status tracking

The Build Orchestrator maintains `build-manifest.json` as the live task tracker:

```json
{
  "phases": [
    {
      "name": "foundation",
      "tasks": [
        {
          "id": "scaffold",
          "status": "done",
          "specialist": "scaffold-builder",
          "outputs": ["package.json", "Dockerfile", "docker-compose.yml"],
          "startedAt": "2026-04-03T12:00:00Z",
          "completedAt": "2026-04-03T12:01:30Z"
        },
        {
          "id": "schema",
          "status": "in-progress",
          "specialist": "db-engineer",
          "outputs": [],
          "startedAt": "2026-04-03T12:01:30Z"
        }
      ]
    }
  ]
}
```

The UI reads this file to show real progress. If a task fails, the orchestrator can retry just that task without re-running the entire build.

#### 3.4 Build validation

After all tasks complete, a Validation Agent runs:

1. **Plan coverage check:** Diff `architecture.json` against the workspace. Every skill, endpoint, table, page, and trigger in the plan must have a corresponding file.

2. **TypeScript compile:** Run `npx tsc --noEmit` in the workspace to catch import errors and type mismatches.

3. **Migration dry-run:** If `db/migrations/` exists, run migrations against a test database to verify they apply cleanly.

4. **Dependency check:** Verify `package.json` includes all packages imported in source files.

5. **Report:** Write `build-manifest.json` final status and `.openclaw/build/validation-report.json`.

### Phase 4: Ship — Self-Contained Template Repo

#### 4.1 Target workspace structure

After Build completes, the workspace must contain everything needed to clone, install, and run the agent:

```
~/.openclaw/workspace/
    .openclaw/
        discovery/
            research-brief.md       <- Think output: domain research
            PRD.md                  <- Think output: product requirements
            TRD.md                  <- Think output: technical requirements
        plan/
            architecture.json       <- Plan output: full architecture spec
            PLAN.md                 <- Plan output: human-readable summary
            build-manifest.json     <- Build output: task completion log
        build/
            validation-report.json  <- Build output: validation results
        config.json                 <- Agent runtime config

    SOUL.md                         <- Agent personality & rules
    AGENTS.md                       <- Agent manifest
    IDENTITY.md                     <- Agent identity card

    skills/
        <skill-id>/
            SKILL.md                <- Skill definition
            handler.ts              <- Skill implementation
            test.ts                 <- Skill tests

    backend/
        index.ts                    <- Express entry point
        routes/
            <name>.ts               <- Route handlers
        services/
            <name>.ts               <- Business logic
        middleware/
            auth.ts                 <- Auth middleware
            validation.ts           <- Request validation

    db/
        schema.sql                  <- Current schema snapshot
        types.ts                    <- Generated TypeScript types
        migrations/
            001_initial.sql         <- Versioned migrations
        seed/
            dev.sql                 <- Dev seed data

    dashboard/
        layout.tsx                  <- Dashboard shell
        pages/
            <name>.tsx              <- Dashboard pages
        hooks/
            <name>.ts               <- Data fetching hooks
        components/
            *.tsx                   <- Shared components (charts, tables)

    tools/
        <id>.json                   <- MCP/API/CLI tool configs
        <id>-client.ts              <- API client wrappers

    triggers/
        <id>.json                   <- Cron/webhook/manual trigger configs

    package.json                    <- Dependencies
    tsconfig.json                   <- TypeScript config
    Dockerfile                      <- Container definition
    docker-compose.yml              <- Local dev (agent + postgres + redis)
    .env.example                    <- Required environment variables
    README.md                       <- Auto-generated from AGENTS.md + PLAN.md
    .gitignore                      <- Standard ignores
```

#### 4.2 Ship step changes

The existing `ShipDialog.tsx` already pushes all workspace text files to GitHub. No changes needed to the ship mechanism — the improvement is that the workspace now contains a complete, runnable project instead of just markdown.

The README.md should be auto-generated during the scaffold task, combining:
- Agent name and description from AGENTS.md
- Quick start instructions (clone, install, configure .env, run)
- Architecture summary from PLAN.md
- Skill inventory from skills/
- Environment variable reference from .env.example

## Implementation Notes

### Key files to change

| Area | Files | Change |
|------|-------|--------|
| Think persistence | `CoPilotLayout.tsx`, new `workspace-writer.ts` | Write PRD/TRD/research to workspace on approval |
| Plan persistence | `CoPilotLayout.tsx`, `workspace-writer.ts` | Write architecture.json and build-manifest.json on approval |
| Build orchestrator | New `lib/openclaw/build-orchestrator.ts` | Reads manifest, dispatches tasks, tracks status |
| Build specialists | New `lib/openclaw/specialists/*.ts` | Prompt builders per specialist type |
| Build validation | New `lib/openclaw/build-validator.ts` | Plan-vs-workspace diff, compile check |
| Build UI | `LifecycleStepRenderer.tsx` StageTest section | Show task-level progress from manifest |
| Prompt changes | `generate-skills.ts` | Replace single-prompt with orchestrator dispatch |
| Types | `lib/openclaw/types.ts` | Add `BuildTask`, `BuildPhase`, `BuildDependency` |

### Workspace write API

All workspace writes go through `docker exec` commands via the existing sandbox bridge. The specialist prompt includes shell commands to write files, same as the current architect prompt. The change is in prompt decomposition (one specialist per task) not in the write mechanism.

### Sub-agent execution

Sub-agents are executed as separate `/api/openclaw` calls with the same `forge_sandbox_id`. Each call gets a specialist system prompt and the relevant slice of the architecture plan. They share the same container filesystem, so one specialist's output is immediately visible to the next.

### Backward compatibility

The current single-prompt build continues to work as a fallback. The v3 pipeline is opt-in via a feature flag (`parallelBuildEnabled` already exists in the copilot store). Once validated, it becomes the default.

## Proving case: Google Ads Agent

Every aspect of this spec should be validated against the Google Ads agent creation flow:

- **Think:** Research Google Ads API documentation, rate limits, OAuth flow. PRD covers campaign audit, budget pacing, billing alerts. TRD covers Google Ads API v17, refresh token auth, campaign/ad-group data model.
- **Plan:** Architecture includes `campaigns` and `reports` tables, `/api/campaigns/*` and `/api/reports/*` endpoints, Overview and Campaigns dashboard pages, `google-ads` MCP integration, daily audit cron trigger.
- **Build:** DB Engineer writes campaign/report migrations. Backend Engineer writes Express routes for campaign listing, report generation, billing queries. Skill Builder writes audit and pacing skill handlers that call the backend. Frontend Engineer writes dashboard pages with spend charts and pacing tables.
- **Ship:** GitHub repo can be cloned, `docker-compose up` starts the agent with Postgres, and the dashboard renders real campaign data.

## Test Plan

### Unit tests
- Build manifest parser and task status tracker
- Dependency graph cycle detection
- Plan validation rules (coverage checks)
- Specialist prompt builders (correct plan slice extracted)

### Integration tests
- Workspace writer: files appear in container after write
- Build orchestrator: tasks execute in dependency order
- Validation agent: detects missing files, broken migrations

### E2E tests
- Full create flow: Think -> Plan -> Prototype -> Build -> Review -> Ship
- Build progress UI shows per-task status
- Failed task retry without full rebuild
- Shipped GitHub repo has all expected files

### Manual verification
- Clone shipped repo, run `docker-compose up`, verify agent responds
- Google Ads agent: dashboard renders, API routes respond, skills execute
