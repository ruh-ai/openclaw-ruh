# SPEC: Agent Creation Lifecycle — Full 8-Stage Reference

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agent-creation-v3-build-pipeline]] | [[SPEC-real-agent-evaluation]] | [[011-key-flows]]

## Status

implemented

## Summary

The agent creation flow in `agent-builder-ui` follows an 8-stage development lifecycle after Reveal: **Think → Plan → Prototype → Build → Review → Test → Ship → Reflect**. Each stage has a hard gate — the user must approve before advancing. This spec documents what happens at each stage in detail: user interactions, system behavior, API calls, state management, and container lifecycle.

## Related Notes

- [[008-agent-builder-ui]] — Builder UI architecture, copilot state, gateway bridge
- [[SPEC-agent-creation-v3-build-pipeline]] — Deep spec on Think/Plan/Build v4 pipeline
- [[SPEC-real-agent-evaluation]] — Test stage evaluation harness, GEPA-inspired reinforcement loop
- [[SPEC-copilot-config-workspace]] — Co-Pilot workspace layout and tab behavior
- [[SPEC-agent-create-session-resume]] — Session resume on page refresh
- [[SPEC-create-flow-lifecycle-navigation]] — Stepper navigation without losing forward progress
- [[SPEC-agent-create-deploy-handoff]] — Ship stage deploy handoff contract
- [[003-sandbox-lifecycle]] — Sandbox container creation and management
- [[005-data-models]] — ArchitecturePlan, EvalTask, BuildManifest, BuildReport types
- [[011-key-flows]] — End-to-end creation walkthrough
- [[001-architecture]] — System overview

---

## Architecture Overview

### State Machine

```
AgentDevStage = "think" | "plan" | "prototype" | "build" | "review" | "test" | "ship" | "reflect"
```

Each stage has a `StageStatus`:
```
"idle" | "generating" | "ready" | "approved" | "building" | "running" | "done" | "failed"
```

The Zustand store (`copilot-state.ts`) tracks two key fields:
- `devStage` — the currently viewed stage
- `maxUnlockedDevStage` — the furthest stage the user has reached

Navigation: clicking earlier stages in the stepper is **non-destructive** (inspect only). The footer `Back` button is **destructive** — it resets the target stage to `idle` and caps forward progress.

### Key Files

| Component | File |
|-----------|------|
| Stage type definitions | `lib/openclaw/types.ts:196` |
| State store | `lib/openclaw/copilot-state.ts` |
| Lifecycle UI | `app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx` |
| Builder agent + system instructions | `lib/openclaw/ag-ui/builder-agent.ts` |
| API bridge | `lib/openclaw/api.ts` |
| Build orchestrator | `lib/openclaw/build-orchestrator.ts` |
| Eval loop | `lib/openclaw/eval-loop.ts` |
| Test readiness | `lib/openclaw/test-stage-readiness.ts` |
| Event consumers | `lib/openclaw/ag-ui/event-consumer-map.ts` |
| Specialist prompts | `app/(platform)/agents/create/_config/specialist-prompts.ts` |

### Container Lifecycle

Two sandbox types exist during creation:

1. **Forge Sandbox** (per-agent) — spins up when creation begins. Each agent gets its own Docker container. All Think/Plan/Build work happens inside this container. The architect agent runs here, writes workspace files, and executes tools. Fetched via `GET /api/agents/{agentId}/forge`.

2. **Agent Sandbox** (production) — the same forge container transitions from architect mode to agent mode for testing and deployment. No new container is created.

---

## Collaborative Checkpoints (2026-04-22)

The architect is a collaborator, not a silent worker. At defined checkpoints it **emits questions and ends its turn**, waiting for the user to answer before continuing. This replaces the earlier behavior where the architect would plow through Think/Plan in one shot and often produce the wrong agent.

### Checkpoint map

| Stage | ID | When it fires | Cap |
|---|---|---|---|
| Think | C0 — Scope | First turn, before any research | 3–5 questions |
| Think | C1 — Pre-PRD | After research brief, if ambiguity remains | up to 3 |
| Think | C2 — Pre-TRD | After PRD, for stack/auth/storage decisions | up to 3 |
| Plan | P0 — Skill boundaries | If skill split not obvious from TRD | up to 3 |

Checkpoint turns contain ONLY: brief framing, prose questions as a numbered list, `<ask_user>` markers, a one-line summary. No tool calls, no `<think_*>`/`<plan_*>` markers, no file writes.

### `<ask_user>` marker

Emitted in the architect's streamed text; parsed by `extractAskUserMarkers` in `lib/openclaw/ag-ui/builder-agent.ts`. Four types:

```
<ask_user id="q1" type="text" question="..."/>
<ask_user id="q2" type="select" question="..." options='["a","b","c"]'/>
<ask_user id="q3" type="multiselect" question="..." options='["a","b","c"]'/>
<ask_user id="q4" type="boolean" question="..."/>
```

Markers become `CustomEventName.ASK_USER` events (see `lib/openclaw/ag-ui/types.ts`) → consumed by `consumeAskUser` → push onto `coPilotStore.pendingQuestions`.

### PendingQuestionsPanel

Renders above the chat input in `TabChat` whenever `pendingQuestions.length > 0`. Each question shows as a labeled input: text field, yes/no buttons, pills (select), or toggle pills (multiselect). "Send answers" is disabled until all are answered; on submit the answers are composed into one user message and sent via the normal chat pipeline.

Clearing: `pendingQuestions` is cleared automatically by `use-agent-chat.ts` every time the user sends any message (architect's next turn either adds new questions or proceeds with work).

Component: `app/(platform)/agents/create/_components/copilot/PendingQuestionsPanel.tsx`

### Prompt source of truth

The runtime system prompts (`THINK_SYSTEM_INSTRUCTION`, `PLAN_SYSTEM_INSTRUCTION`, `REFINE_SYSTEM_INSTRUCTION` in `builder-agent.ts`) encode the checkpoint protocol. Mirror lives in `ruh-backend/skills/agent-builder/SKILL.md` — the architect reads both at runtime. Keep them in sync on any edit.

---

## Artifact-Targeted Revisions (2026-04-23)

Beyond inline document edits and regenerate-from-scratch, the user can ask the architect to **surgically revise a specific artifact** via a chat message:

```
[target: PRD#user-flows]
I'd like you to revise this. Add a step for Google Ads account linking.
```

### Supported targets

| Target prefix | File to edit |
|---|---|
| `PRD` / `PRD#<section>` | `.openclaw/discovery/PRD.md` |
| `TRD` / `TRD#<section>` | `.openclaw/discovery/TRD.md` |
| `Plan` / `Plan#<section>` | `.openclaw/plan/architecture.json` + `PLAN.md` |

### UI surface

`RequestChangesButton` (at `_components/copilot/RequestChangesButton.tsx`) — reusable ghost button that opens an inline textarea. Rendered in:
- `StepDiscovery` — one per PRD/TRD doc + one per section (section-targeted via `PRD#<heading>`)
- `StagePlan` — one "Ask architect to revise plan" next to "Approve Plan & Review Prototype"
- `StagePrototype` — prototype review surface with "Request Changes" and "Approve Prototype & Start Build"

### Prop flow

The chat's `sendChatMessage` lives in `TabChat`, so the callback flows top-down:

```
TabChat (owns sendChatMessage)
  → ComputerView (prop: onRequestArtifactChange)
    → LifecycleStepRenderer
      → StageThinkPlaceholder → StepDiscovery → RequestChangesButton
      → StagePlan → RequestChangesButton
```

On submit, `TabChat` composes `[target: …]\n\nI'd like you to revise this. <note>` and pushes through the existing chat pipeline. Architect receives it in REFINE mode, reads the target file, edits surgically, writes back, and replies with a 1–3 sentence summary. Plan targets also re-emit `<plan_*>` markers so the UI re-renders.

---

## Pause / Redirect — Deferred (cross-repo)

Not implemented. Design captured here for future work.

### Desired behavior

Mid-stream, the user wants to interrupt the architect and redirect. Example: architect is researching Google Ads budget APIs when the user realizes they actually need Meta Ads first. Today the user has to wait for the turn to finish, then chat "actually do Meta instead" — by which point a lot of irrelevant research has been written.

### What's missing

1. **Gateway-side** (`openclaw` repo): `chat.pause` / `chat.resume` RPCs. The gateway would interrupt the in-flight LLM call, save partial state, and wait for either a `resume` or a replacement `chat.send`.
2. **Backend-side** (`ruh-backend`): new SSE events `paused` / `resumed` forwarded from gateway → bridge.
3. **Frontend-side** (`agent-builder-ui`): a Pause button in the chat toolbar that fires a pause RPC; the user's next message while paused becomes a redirect.

### Frontend gap today

`use-agent-chat.ts` has no `AbortController` wired for the main architect stream — the only `cancel()` calls (lines 397, 414) target the autosave controller, not the run. A real pause requires either:
- Gateway support (preferred — preserves partial state), or
- A client-side abort that tears down the SSE connection and discards the in-flight turn (crude, loses partial output).

### Implementation order (when picked up)

1. Gateway: add `chat.pause` / `chat.resume` RPC. Define partial-state preservation contract.
2. Backend: forward new events through `gatewayProxy.ts`.
3. Frontend: wire Pause button in `TabChat` chat toolbar, handle `paused`/`resumed` events in `use-agent-chat.ts`, show a "paused — type to redirect" state above the input.

Until Phase 5 lands, the `PendingQuestionsPanel` gives the user a natural redirect point at each checkpoint — which covers the most common case without needing mid-stream interruption.

---

## Stage 1: Think

**Purpose:** Research the problem domain and produce foundational documents.

### What Happens

The architect agent (running inside the forge sandbox) executes a three-step research process:

1. **Research** — Uses browser and terminal tools to investigate:
   - APIs, SDKs, libraries in the domain
   - Auth methods, rate limits, pricing
   - ClawHub skills: `openclaw skills search <domain>`
   - Competitors and similar tools
   - Best practices

2. **PRD (Product Requirements Document)** — Written from research findings:
   - Problem statement, target users, core capabilities
   - User flows, channels & integrations
   - Data requirements, dashboard requirements
   - Memory & context, success criteria

3. **TRD (Technical Requirements Document)** — Written from research + PRD:
   - Architecture overview, skills & workflow
   - External APIs & tools with auth details
   - Database schema (SQLite CREATE TABLE statements)
   - API endpoints with response shapes
   - Dashboard pages with component types
   - Vector collections, triggers, env vars

### System Instruction

`THINK_SYSTEM_INSTRUCTION` in `builder-agent.ts` — strict research-only mode. The architect must NOT build anything. Only research and produce documents.

### Workspace Files Written

```
~/.openclaw/workspace/.openclaw/discovery/
  research-brief.md
  PRD.md
  TRD.md
```

### Progress Markers (streamed in text)

- `<think_step step="research|prd|trd" status="started|complete"/>`
- `<think_research_finding title="..." summary="..." source="..."/>`
- `<think_document_ready docType="research_brief|prd|trd" path="..."/>`

### State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `thinkStatus` | `StageStatus` | Overall Think stage status |
| `thinkStep` | `ThinkSubStep` | Current sub-step: `idle` → `research` → `prd` → `trd` → `complete` |
| `thinkActivity` | `ThinkActivityItem[]` | Activity feed items (research, tool, status, identity) |
| `researchFindings` | `ThinkResearchFinding[]` | Key findings discovered during research |
| `researchBriefPath` | `string \| null` | Path to research-brief.md in workspace |
| `prdPath` | `string \| null` | Path to PRD.md in workspace |
| `trdPath` | `string \| null` | Path to TRD.md in workspace |
| `userTriggeredThink` | `boolean` | Whether user explicitly started Think |
| `thinkRunId` | `string \| null` | Run ID for dedup |

### User Interaction

- Fill in agent name and description
- Click to start research (triggers `userTriggeredThink`)
- Watch research progress (activity feed + milestone bar)
- Review PRD and TRD documents
- Edit documents inline if needed
- Approve to advance to Plan

### Gate Condition

`thinkStatus === "approved" || thinkStatus === "done"`

---

## Stage 2: Plan

**Purpose:** Design the structural architecture from approved PRD/TRD.

### What Happens

The architect reads PRD/TRD from the workspace and produces structural decisions — **no file content** (no `skillMd`, no `soulContent`). Build generates all actual file content.

Decisions produced:

1. **Skills** — Unique kebab-case IDs, descriptions, dependencies, tool types (`mcp`/`api`/`cli`), env vars
2. **Workflow** — Execution order, parallelism flags
3. **Data Schema** — SQLite tables with columns, types, indexes
4. **API Endpoints** — Method, path, description, response shapes
5. **Dashboard Pages** — Page paths, component types (`metric-cards`, `data-table`, `line-chart`, etc.), data sources
6. **Dashboard Prototype** — Required when dashboard pages exist; maps pages to operator workflows, mutating actions, pipeline tracking, generated artifacts, review prompts, and acceptance checks
7. **Environment Variables** — All required env vars with labels, types, groups, population strategies
8. **Build Dependencies** — Dependency graph between plan artifacts (v4)

### System Instruction

`PLAN_SYSTEM_INSTRUCTION` in `builder-agent.ts`

### Workspace Files Written

```
~/.openclaw/workspace/.openclaw/plan/
  architecture.json    — Full structured plan
  PLAN.md              — Human-readable summary
```

### Progress Markers (streamed in text)

- `<plan_skills skills='[...]'/>`
- `<plan_workflow workflow='...'/>`
- `<plan_data_schema dataSchema='...'/>`
- `<plan_api_endpoints apiEndpoints='[...]'/>`
- `<plan_dashboard_pages dashboardPages='[...]'/>`
- `<plan_dashboard_prototype dashboardPrototype='{...}'/>`
- `<plan_env_vars envVars='[...]'/>`
- `<plan_complete/>`

### State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `architecturePlan` | `ArchitecturePlan \| null` | Full structured plan |
| `planStatus` | `StageStatus` | Overall Plan stage status |
| `planStep` | `PlanSubStep` | Current sub-step: `idle` → `skills` → `workflow` → `data` → `api` → `dashboard` → `envvars` → `complete` |
| `planActivity` | `PlanActivityItem[]` | Activity feed showing decided sections |
| `userTriggeredPlan` | `boolean` | Whether user approved Think to request plan |

### ArchitecturePlan Type (key fields)

```typescript
interface ArchitecturePlan {
  skills: ArchitecturePlanSkill[];
  workflow: ArchitecturePlanWorkflow;
  integrations: ArchitecturePlanIntegration[];
  triggers: ArchitecturePlanTrigger[];
  channels: string[];
  envVars: ArchitecturePlanEnvVar[];
  subAgents: SubAgentConfig[];
  missionControl: MissionControlConfig | null;
  dataSchema?: DataSchema | null;
  apiEndpoints?: ApiEndpoint[];
  dashboardPages?: DashboardPage[];
  dashboardPrototype?: DashboardPrototypeSpec;
  vectorCollections?: VectorCollection[];
  buildDependencies?: BuildDependency[];
  soulContent?: string;
}
```

### User Interaction

- Review architecture plan sections as they stream in
- For dashboard agents, review the Dashboard Prototype Gate summary and the Sub-Agent Ownership section when present
- If the prototype does not match the estimator workflow, use `Request Changes` in Plan to ask the architect to revise the dashboard design
- Edit skill definitions, env vars, etc. before approving
- Approve plan to advance to Prototype

### Gate Condition

`planStatus === "approved" || planStatus === "done"`

When `architecturePlan.dashboardPages.length > 0`, Plan also requires `architecturePlan.dashboardPrototype` with a summary plus at least one workflow and page. Operational dashboards should also include `actions`, `pipeline`, `artifacts`, and `emptyState` so Prototype can simulate real work before Build. The UI disables `Approve Plan & Review Prototype` and `copilot-state.ts` blocks stage advancement until the required prototype exists.

---

## Stage 3: Prototype

**Purpose:** Review the dashboard prototype before any Build specialists run.

### What Happens

`StagePrototype` renders a frontend-only prototype from `architecturePlan.dashboardPages`, `architecturePlan.dashboardPrototype`, and `architecturePlan.subAgents`. It shows page navigation, mock dashboard components, workflow steps, required actions, pipeline tracking, generated artifacts, approval/revision controls, acceptance checks, revision prompts, and sub-agent ownership. Prototype interactions are simulated in local UI state: the operator can create a sample work item, run or advance the planned pipeline, simulate blockers, and approve or request revision on generated artifacts. No dashboard files are generated and no preview server is started in this stage.

### User Interaction

- Switch between planned dashboard pages
- Inspect the workflow/action/checklist fit for ECC estimator work
- Simulate creating an estimate or work item
- Run the planned pipeline and inspect generated artifacts
- Approve artifacts or request revision before accepting the dashboard design
- Use `Request Changes` to revise `architecture.json` through the architect
- Click `Approve Prototype & Start Build` only when the prototype is acceptable

### Gate Condition

Prototype requires a usable architecture plan and, when dashboard pages exist, a valid `dashboardPrototype`. Build starts only from this stage.

---

## Stage 4: Build

**Purpose:** Generate all agent files from the approved architecture plan.

### What Happens

The v4 build orchestrator (`build-orchestrator.ts`) is the sole build path. It:

1. Reads the architecture plan (from workspace `architecture.json` or in-memory fallback), merging the approved `dashboardPrototype` from the persisted Co-Pilot session if the workspace plan is stale
2. Determines which specialists are needed
3. Executes them in dependency order
4. Writes `build-manifest.json` on every status change (live tracking)
5. Runs post-build validation

### Specialist Execution Order (Dependency Graph)

```
scaffold (deterministic, no LLM)
    ↓
identity
    ↓
database ─────→ backend ──→ dashboard
               ↗
skills (parallel with backend/dashboard)
```

| Specialist | Purpose |
|-----------|---------|
| `scaffold` | Create directory structure, base config files (no LLM) |
| `identity` | Generate `SOUL.md` — agent personality, tone, rules |
| `database` | Create SQLite schema from `dataSchema` |
| `backend` | Generate API endpoint handlers from `apiEndpoints` |
| `skills` | Generate `SKILL.md` files for each skill |
| `dashboard` | Generate Mission Control dashboard pages |

### Build Manifest

```typescript
interface BuildManifest {
  version: 3;
  agentName: string;
  createdAt: string;
  plan: string; // relative path to architecture.json
  tasks: BuildManifestTask[];
  completedAt?: string;
}

interface BuildManifestTask {
  id: string;
  specialist: BuildSpecialist;
  status: "pending" | "running" | "done" | "failed";
  files: string[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
```

### Post-Build Validation

`build-validator.ts` checks plan coverage and file existence:

```typescript
interface ValidationReport {
  planSkillsCovered: number;
  planSkillsMissing: string[];
  planEndpointsCovered: number;
  planEndpointsMissing: string[];
  planPagesCovered: number;
  planPagesMissing: string[];
  manifestFilesVerified: number;
  manifestFilesMissing: string[];
  overallStatus: "pass" | "warn" | "fail";
}
```

Failed tasks can be retried via `retryFailedTasks()`.

### State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `buildStatus` | `StageStatus` | Overall Build stage status |
| `buildActivity` | `BuildActivityItem[]` | Activity feed (file, skill, tool, task events) |
| `buildProgress` | `BuildProgress \| null` | Completed/total counts, current skill |
| `buildManifest` | `BuildManifest \| null` | Live manifest with task statuses |
| `buildValidation` | `ValidationReport \| null` | Post-build validation results |
| `agentSandboxId` | `string \| null` | Forge sandbox container ID (set during Build) |
| `parallelBuildEnabled` | `boolean` | Whether to fan out skill generation |
| `userTriggeredBuild` | `boolean` | Whether user approved plan to start build |

### API Calls

- `POST /api/openclaw` — with `forge_sandbox_id` to route to agent's own container
- Specialist prompts are sent as chat messages to the architect inside the forge sandbox

### User Interaction

- Watch build progress (specialist tasks completing)
- See files being created in real time
- View validation report
- Retry failed tasks if needed
- Advance to Review when build completes

### Gate Condition

`buildStatus === "done"`

---

## Stage 5: Review

**Purpose:** Inspect all configuration before deployment.

### What Happens

A comprehensive read-only summary of everything assembled:

1. **Agent Identity** — Name, description, skill count
2. **Skills** — All skills with built/pending status, descriptions, dependencies
3. **Integrations** — Connected tools with method (MCP/API/CLI), env vars
4. **Triggers** — Cron, webhook, manual triggers with schedules
5. **Channels** — Selected messaging channels (Telegram, Slack, etc.)
6. **Environment Variables** — All required vars with completion status
7. **Sub-Agents** — If any multi-agent configuration exists
8. **Workflow** — Execution order visualization
9. **Agent Rules** — Behavioral rules extracted from architect

### System Instruction

`REFINE_SYSTEM_INSTRUCTION` in `builder-agent.ts` — if the user chats during Review, the architect stays aligned to the current agent config and makes targeted refinements only.

### User Interaction

- Read the full configuration summary
- Click edit buttons to jump back to specific stages (non-destructive navigation)
- Chat with architect to make refinements
- Approve to advance to Test

### Gate Condition

`getStageIndex(currentStage) > getStageIndex("review")` (user navigated past Review)

---

## Stage 6: Test

**Purpose:** Run evaluations against the real agent container.

### What Happens

The Test stage executes a GEPA-inspired reinforcement loop:

```
Run eval suite → Score traces → Reflect on failures → Mutate skills → Re-run
```

#### Container Readiness

Tests are **blocked** until the forge sandbox container is ready (`agentSandboxId` is set). The `test-stage-readiness.ts` module provides:
- `"ready"` — Tests run against the real agent container
- `"container-not-ready"` — Tests stay blocked until sandbox finishes provisioning

No fallback to the shared architect — tests only run in the agent's own container.

#### Eval Loop (`eval-loop.ts`)

```typescript
interface EvalLoopConfig {
  maxIterations: number;          // default: 5
  maxConsecutiveDegradations: number; // default: 2
  reloadPauseMs: number;          // default: 2000ms
}
```

Loop phases per iteration:
1. **Running** — Execute all eval tasks (or only previously failed ones on iteration > 1)
2. **Scoring** — Calculate pass rate and average score
3. **Reflecting** — Analyze failures via `eval-reflector.ts`
4. **Mutating** — Apply skill mutations via `eval-mutator.ts`
5. **Reloading** — Pause for container to reload skills

Stop conditions:
- All scenarios pass → `"all_passed"`
- Max iterations reached → `"max_iterations"`
- Score degraded 2 consecutive rounds → `"degraded"` (reverts last mutation)
- Budget exhausted
- User abort → `"aborted"`

Typical cost: ~$1-5 per full loop (5 iterations, 8 scenarios).

#### Eval Task Type

```typescript
interface EvalTask {
  id: string;
  title: string;
  input: string;               // The prompt sent to the agent
  expectedBehavior: string;    // What should happen
  status: EvalTaskStatus;      // "pending" | "running" | "pass" | "fail" | "manual"
  trace?: ExecutionTrace;      // Full tool call trace
  traceScore?: TraceScore;     // LLM judge output with per-skill diagnosis
  iteration?: number;          // Which loop iteration produced this result
}
```

#### Execution Trace (captured from real container)

```typescript
interface ExecutionTrace {
  response: string;
  toolCalls: ToolCallTrace[];
  skillsActivated: string[];
  errors: string[];
  totalDurationMs: number;
}
```

#### Skill Mutations

When the reflector identifies broken skills, it produces mutations:

```typescript
interface SkillMutation {
  iteration: number;
  skillId: string;
  before: string;    // Original SKILL.md content
  after: string;     // Mutated SKILL.md content
  rationale: string;
  accepted: boolean; // Set true if next iteration improves
}
```

### State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `evalTasks` | `EvalTask[]` | All evaluation scenarios |
| `evalStatus` | `StageStatus` | Overall Test stage status |
| `agentSandboxId` | `string \| null` | Container ID for real eval |
| `evalLoopState` | `EvalLoopState` | Iteration count, scores, mutations, cost |

### User Interaction

- View eval task list with pass/fail status
- Watch reinforcement loop iterate
- See skill mutations and their rationale
- View execution traces and tool call details
- Approve/reject individual mutations
- Abort loop early if satisfied
- Advance to Ship

### Gate Condition

`evalStatus === "done"` or user navigates past Test

---

## Stage 7: Ship

**Purpose:** Deploy the agent and optionally push to GitHub.

### What Happens

Three sequential steps:

1. **Save** — Persist agent configuration to the backend
   - `store.setDeployStatus("running")`
   - Triggers the page-level `onComplete` handler
   - Saves agent metadata, skills, tools, triggers, channels, runtime inputs

2. **Deploy** — Activate the agent container
   - The forge sandbox transitions from building to live mode
   - Configuration is applied to the container
   - Agent becomes available for runtime use

3. **GitHub Export** (optional) — Push template to GitHub
   - Uses PAT-based GitHub authentication
   - User connects GitHub account with a token that has `repo` scope
   - Auto-generates repo name from agent name
   - Ships via `POST /api/agents/{agentId}/ship`
   - Sends: `{ githubToken, commitMessage }`
   - Creates/pushes to persistent repo

### Ship Steps

```typescript
type ShipStep = "save" | "deploy" | "github";
type ShipStepStatus = "pending" | "running" | "done" | "failed" | "skipped";
```

### API Calls

- `POST /api/agents` or `PUT /api/agents/{agentId}` — Save agent config
- `POST /api/agents/{agentId}/ship` — GitHub export with token

### State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `deployStatus` | `StageStatus` | Overall Ship stage status |

### User Interaction

- Connect GitHub account (PAT input)
- Configure repo name (auto-generated from agent name)
- Option to skip GitHub export
- Click "Ship Agent" to begin deployment
- Watch save → deploy → github progress
- See repo URL when GitHub push completes
- Advance to Reflect

### Gate Condition

`deployStatus === "done"` or user navigates past Ship

---

## Stage 8: Reflect

**Purpose:** Post-deployment build summary.

### What Happens

Displays a comprehensive summary of the completed agent:

1. **Stats Grid** — Skills count, integrations count, triggers count, sub-agents count
2. **Skills List** — All active skills with built/pending indicators
3. **Workflow Visualization** — Execution order as a flow of steps
4. **Triggers** — All configured triggers with types
5. **Channels** — Selected messaging channels
6. **Agent Rules** — Behavioral rules (first 5 shown, rest collapsed)

### Build Report Type

```typescript
interface BuildReport {
  agentName: string;
  createdAt: string;
  stages: BuildReportStage[];
  skillCount: number;
  subAgentCount: number;
  integrationCount: number;
  triggerCount: number;
  notes: string;
}

interface BuildReportStage {
  stage: AgentDevStage;
  status: "completed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  artifacts?: string[];
}
```

### State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `buildReport` | `BuildReport \| null` | Final summary data |

### User Interaction

- Review the build summary
- Click "Done" to navigate to the agent dashboard or chat page
- From here, the agent is live and ready for use

---

## Event Pipeline

All stages share a common event flow:

```
Architect text stream
  → Marker extraction (extractThinkMarkers / extractPlanMarkers / custom SSE events)
  → AG-UI custom events
  → event-consumer-map.ts consumers
  → copilot-state.ts Zustand store
  → UI re-renders
```

Key custom event names (from `ag-ui/types.ts`):
- `WIZARD_UPDATE_FIELDS` — Name/description updates
- `WIZARD_SET_SKILLS` — Skill graph from architect
- `WIZARD_CONNECT_TOOLS` — Tool connection suggestions
- `WIZARD_SET_TRIGGERS` — Trigger suggestions
- `WIZARD_SET_RULES` — Behavioral rules

### API Bridge

All architect communication goes through `POST /api/openclaw` which:
1. Validates builder session (auth)
2. Connects to the forge sandbox gateway via WebSocket
3. Sends the message with `forge_sandbox_id`
4. Streams back SSE events: `status`, `approval_required`, `intermediate`, `agent_response`, `custom`
5. Returns final `ArchitectResponse`

---

## Session Persistence

### Workspace-First Persistence

Think/Plan outputs survive page refresh via workspace files:
```
.openclaw/discovery/{research-brief,PRD,TRD}.md
.openclaw/plan/{architecture.json,PLAN.md,build-manifest.json}
.openclaw/build/validation-report.json
```

`CoPilotLayout.tsx` rehydrates from workspace on mount via `readWorkspaceFile()`.

Stage promotion via `PATCH /api/agents/{id}/forge/stage` also refreshes `creation_session.coPilot` with the committed lifecycle stage and prior-stage approvals. This keeps backend `forge_stage` and the durable Co-Pilot resume snapshot aligned even if the frontend autosave debounce does not fire after a gate transition.

### Draft Autosave

The Co-Pilot store auto-saves draft state to the backend via `saveAgentDraft()`. Page remount rehydrates from backend truth plus local cache per [[SPEC-agent-create-session-resume]].

### Lifecycle Cache

`copilot-lifecycle-cache.ts` provides session-scoped caching so lifecycle status fields survive remounts of the same agent without cross-agent leaks.

---

## Implementation Notes

### Stage-Status Reset Map

When the user clicks `Back`, the target stage and all downstream stages are reset:

```typescript
const STAGE_STATUS_RESET = {
  think: { thinkStatus: "idle", thinkActivity: [], researchFindings: [], ... },
  plan:  { planStatus: "idle", planActivity: [], ... },
  prototype: { userTriggeredBuild: false, buildRunId: null },
  build: { buildStatus: "idle", buildActivity: [], agentSandboxId: null, ... },
  test:  { evalStatus: "idle" },
  ship:  { deployStatus: "idle" },
};
```

### Stage Completion Logic

```typescript
function isLifecycleStageDone(stage, maxUnlockedDevStage, statuses) {
  think:   thinkStatus === "approved" || "done"
  plan:    planStatus === "approved" || "done"
  prototype: currentStage index > prototype index
  build:   buildStatus === "done"
  review:  currentStage index > review index
  test:    evalStatus === "done" || currentStage index > test index
  ship:    deployStatus === "done" || currentStage index > ship index
  reflect: always false (terminal stage)
}
```

## Test Plan

- **Unit tests**: Each stage status transition, gate logic, reset behavior
- **AG-UI event tests**: Marker extraction, event consumers, store updates
- **Build orchestrator tests**: Specialist ordering, manifest persistence, validation
- **Eval loop tests**: Iteration logic, degradation detection, mutation revert
- **E2E (Playwright)**: Full creation flow from Think through Reflect
- **Session resume tests**: Page refresh at each stage preserves progress
