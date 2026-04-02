# SPEC: Self-Evolving Multi-Worker Agent Architecture

[[000-INDEX|← Index]] | [[001-architecture|Architecture]] | [[003-sandbox-lifecycle|Sandbox Lifecycle]] | [[016-marketplace|Marketplace]]

## Status
<!-- draft | approved | implemented | deprecated -->
draft

## Summary

Each Ruh.ai agent becomes an internally orchestrated **team of specialized workers** — not one monolithic agent, but a small company. Workers coordinate through artifact-based contracts (Anthropic harness pattern), each evolves domain-specific skills over time (OpenSpace), and the whole system operates under enterprise governance controls (Paperclip).

**Sources:**
- [Paperclip](https://github.com/paperclipai/paperclip) — organizational model, task assignment, budget enforcement, governance
- [OpenSpace](https://github.com/HKUDS/OpenSpace) — skill capture, evolution, quality monitoring, sharing
- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — artifact-based coordination, atomic progress, startup rituals, checkpoint recovery

**Key result from OpenSpace:** 4.2x better performance, 46% fewer tokens, 165 evolved skills from 50 tasks.

## Related Notes
- [[001-architecture]] — system architecture; this spec extends the sandbox model
- [[002-backend-overview]] — backend changes for worker orchestration, cost tracking, audit
- [[003-sandbox-lifecycle]] — container layout changes for multi-worker workspace
- [[005-data-models]] — new tables: workers, cost_events, skill_versions, task_board
- [[008-agent-builder-ui]] — builder UI for defining worker roles and reviewing skill evolution
- [[016-marketplace]] — skill-level sharing across agents
- [[SPEC-control-plane-audit-log]] — audit trail extended to per-worker granularity
- [[SPEC-agent-readable-system-events]] — execution recording extended for skill capture
- [[013-agent-learning-system]] — agent learning workflow now per-worker

---

## 1. Core Concept

### Today: One Agent = One Mind

```
User Request → Agent → (tries to do everything) → Response
```

The agent handles strategy, execution, analysis, and reporting in one context window. It doesn't learn. If it fails at bidding, it also drops the report it was writing. Context gets bloated because every capability competes for the same window.

### After: One Agent = One Team

```
User Request → Coordinator
                  ├── assigns "analyze CPA" → Report Writer
                  ├── assigns "identify bid targets" → Strategist
                  └── assigns "execute bid changes" → Bid Optimizer (blocked on Strategist)

Each worker:
  1. Reads its progress.json (where did I leave off?)
  2. Checks task-board.json (what's assigned to me?)
  3. Runs validation (is my workspace clean?)
  4. Does ONE atomic task
  5. Writes results to artifacts/
  6. Updates progress.json
  7. Commits

Platform watches each worker → captures skills → evolves them → tracks costs
```

The user still sees **one agent**. The multi-worker structure is internal — the user doesn't manage individual workers. They create "Google Ads Manager" and the platform determines the right worker composition based on the agent's purpose, skills, and tool connections.

---

## 2. Architecture

### 2.1 Container Layout

Each agent container (same Docker model as today) gets an internal workspace structure:

```
/agent-workspace/
│
├── SOUL.md                      — agent-level identity (unchanged)
├── coordinator.md               — task decomposition rules, delegation logic
│
├── workers/
│   ├── strategist/
│   │   ├── SOUL.md              — role-specific personality and capabilities
│   │   ├── skills/              — evolved skills specific to this worker
│   │   │   ├── campaign-planning.md
│   │   │   └── audience-segmentation.md
│   │   └── progress.json        — current state (Anthropic harness)
│   │
│   ├── bid-optimizer/
│   │   ├── SOUL.md
│   │   ├── skills/
│   │   │   └── smart-bidding-v3.md
│   │   └── progress.json
│   │
│   └── report-writer/
│       ├── SOUL.md
│       ├── skills/
│       └── progress.json
│
├── task-board.json              — Paperclip-style task list with assignments + locks
├── artifacts/                   — shared outputs between workers
├── cost-ledger.json             — per-worker token spend
└── execution-log/               — full recordings for skill capture
    ├── 2026-03-30-bid-optimizer-run-1.json
    └── 2026-03-30-report-writer-run-1.json
```

### 2.2 Worker Model

Each worker is a focused agent invocation with its own context, not a separate container or process. Workers share the same container but have isolated:

- **SOUL.md** — role, personality, domain expertise
- **Skills directory** — domain-specific evolved skills
- **Progress file** — state across sessions
- **Budget allocation** — portion of the agent's total budget

```typescript
interface Worker {
  id: string;                          // e.g., "bid-optimizer"
  agentId: string;                     // parent agent
  role: string;                        // "Bid Optimizer"
  capabilities: string;               // human-readable description
  soulPath: string;                    // path to worker SOUL.md in container
  skillsPath: string;                  // path to skills/ directory
  progressPath: string;               // path to progress.json
  status: "idle" | "running" | "blocked" | "error";
  budgetMonthlyCents: number;          // allocated from agent budget
  spentMonthlyCents: number;           // tracked per worker
  metrics: WorkerMetrics;              // success rate, avg tokens, task count
}

interface WorkerMetrics {
  tasksCompleted: number;
  tasksFailled: number;
  avgTokensPerTask: number;
  skillsEvolved: number;
  successRate: number;                 // rolling 30-day
}
```

### 2.3 Coordinator

The Coordinator is a special worker that receives all user requests and decomposes them into tasks. It does NOT execute domain work — it delegates.

**Coordinator responsibilities:**
1. Receive user request
2. Decompose into atomic tasks (one per worker)
3. Determine dependencies between tasks (which must finish before others start)
4. Assign tasks to workers via `task-board.json`
5. Monitor progress, handle failures, reassign if needed
6. Merge worker outputs into a coherent response to the user
7. Decide when to escalate to the user (blocked, ambiguous, over-budget)

**Coordinator does NOT:**
- Execute domain tasks itself
- Hold domain-specific skills
- Bypass worker budget limits

### 2.4 Task Board (Paperclip Pattern)

The task board is the single source of truth for work coordination. JSON format (per Anthropic's recommendation — models are less likely to corrupt JSON than Markdown).

```json
{
  "version": 1,
  "tasks": [
    {
      "id": "task-001",
      "title": "Analyze current CPA across all campaigns",
      "status": "done",
      "assignee": "report-writer",
      "checkoutRunId": "run-abc123",
      "priority": 1,
      "dependsOn": [],
      "createdAt": "2026-03-30T10:00:00Z",
      "startedAt": "2026-03-30T10:00:05Z",
      "completedAt": "2026-03-30T10:01:12Z",
      "artifactPath": "artifacts/cpa-analysis.json",
      "tokensCost": 4200
    },
    {
      "id": "task-002",
      "title": "Identify top 5 campaigns for bid adjustment",
      "status": "in_progress",
      "assignee": "strategist",
      "checkoutRunId": "run-def456",
      "priority": 2,
      "dependsOn": ["task-001"],
      "createdAt": "2026-03-30T10:00:00Z",
      "startedAt": "2026-03-30T10:01:15Z",
      "completedAt": null,
      "artifactPath": null,
      "tokensCost": 0
    },
    {
      "id": "task-003",
      "title": "Execute bid changes on selected campaigns",
      "status": "blocked",
      "assignee": "bid-optimizer",
      "checkoutRunId": null,
      "priority": 3,
      "dependsOn": ["task-002"],
      "createdAt": "2026-03-30T10:00:00Z",
      "startedAt": null,
      "completedAt": null,
      "artifactPath": null,
      "tokensCost": 0
    }
  ]
}
```

**Atomic task checkout** (from Paperclip): Only one worker can own a task at a time. The `checkoutRunId` acts as a lock. This prevents double-work when the coordinator retries or reassigns.

---

## 3. Execution Pattern (Anthropic Harness)

### 3.1 Worker Startup Ritual

Every time a worker wakes up, it follows this exact sequence before doing any new work:

```
1. Read progress.json         → "Where did I leave off?"
2. Read task-board.json       → "What's assigned to me?"
3. Read artifacts/            → "What have other workers produced that I need?"
4. Run validation             → "Is my workspace clean? Any broken state?"
5. Fix broken state           → If tests fail, fix before new work
6. Select highest-priority    → Pick ONE task from my assignments
   assigned task
7. Execute ONE atomic task    → Do the work
8. Write output to artifacts/ → Make results available to other workers
9. Update progress.json       → Record what happened
10. Update task-board.json    → Mark task done, update tokensCost
11. Commit                    → Git checkpoint for recovery
```

This is directly from the Anthropic article: "agents quickly identify if the app had been left in a broken state, and immediately fix any existing bugs" before starting new work.

### 3.2 Atomic Progress

**One task at a time.** From the Anthropic article: "the next iteration of the coding agent was then asked to work on only one feature at a time."

Workers never attempt to complete multiple tasks in one session. If a task is too large, the coordinator should have decomposed it further. If a worker realizes mid-task that the scope is too big, it updates `progress.json` with what it accomplished, commits, and leaves the rest for the next session.

### 3.3 Cross-Session Handoff

Workers don't share context windows. They share **artifacts**:

| Artifact | Purpose | Format |
|----------|---------|--------|
| `progress.json` | Worker's own state across sessions | JSON |
| `task-board.json` | Global coordination | JSON |
| `artifacts/*.json` | Output from completed tasks | JSON |
| Git commits | Checkpoint for recovery | Git |
| `execution-log/*.json` | Full recording for skill capture | JSON |

From the Anthropic article: "There was no memory of what came before" across context windows. The solution is explicit structural artifacts that let the next session reconstruct state without needing the prior conversation.

### 3.4 Failure and Recovery

When a worker fails:

1. **Coordinator detects** — task status doesn't update within timeout
2. **Coordinator reads** worker's `progress.json` for partial results
3. **Coordinator decides:**
   - If partial progress: leave task assigned, next session will pick up via startup ritual
   - If no progress: revert git to last good commit, reassign or retry
   - If repeated failure: escalate to user with full context
4. **Git revert is per-worker** — other workers' commits are not affected

---

## 4. Skill Evolution (OpenSpace Patterns)

### 4.1 Execution Recording

Every worker execution is fully recorded:

```json
{
  "runId": "run-abc123",
  "workerId": "bid-optimizer",
  "agentId": "google-ads-manager",
  "taskId": "task-003",
  "startedAt": "2026-03-30T10:02:00Z",
  "completedAt": "2026-03-30T10:03:45Z",
  "success": true,
  "toolCalls": [
    {
      "tool": "google-ads-api",
      "action": "updateBid",
      "input": { "campaignId": "123", "newBid": 2.50 },
      "output": { "status": "success", "previousBid": 3.10 },
      "latencyMs": 340,
      "success": true
    }
  ],
  "tokensUsed": { "input": 2800, "output": 1400 },
  "skillsApplied": ["smart-bidding-v3"],
  "skillsEffective": ["smart-bidding-v3"]
}
```

This recording powers all downstream learning. Nothing is discarded.

### 4.2 Post-Execution Skill Capture

After a worker completes a task, the platform analyzes the execution recording:

```
Execution Recording → LLM Analysis → Skill Proposal → Human Review → Skill Saved
```

**Analysis questions** (from OpenSpace's post-execution analysis):
1. Did the worker follow a repeatable pattern?
2. Was the pattern different from (better than) existing skills?
3. Would another worker or agent benefit from this pattern?

**Skill format** (adapted from OpenSpace):

```markdown
---
id: smart-bidding-v3
name: Smart Bidding Optimization
type: WORKFLOW
worker: bid-optimizer
version: 3
parent: smart-bidding-v2
evolution: DERIVED
metrics:
  applied: 47
  completed: 44
  effective: 41
  fallback: 3
created: 2026-03-30
---

## When to Use
When adjusting bids on Google Ads campaigns to optimize for target CPA.

## Steps
1. Pull current campaign performance (last 7 days)
2. Filter campaigns with CPA > target by >20%
3. Check daily budget utilization (skip if <50% utilized — underspend, not overbid)
4. Calculate bid adjustment: current_bid * (target_cpa / actual_cpa) * 0.9 (conservative)
5. Apply bid change via API
6. Verify change took effect (re-read bid after 5s)
7. Log old bid, new bid, expected CPA impact

## Recovery
- If API returns rate limit: wait 60s, retry once, then skip campaign
- If bid change doesn't verify: revert immediately, log warning
```

### 4.3 Three Evolution Types

| Type | Trigger | What Happens |
|------|---------|--------------|
| **CAPTURED** | Worker completes a task with a new successful pattern | Platform proposes a brand new skill |
| **FIX** | Tool success rate drops below threshold | Platform proposes repair to affected skills |
| **DERIVED** | Worker finds a better approach than existing skill | Platform proposes an enhanced version |

### 4.4 Quality Cascade Monitoring

Three monitoring layers, per worker:

**Layer 1 — Skill metrics:**
```
applied_rate:    how often a skill is selected for a task
completion_rate: how often it leads to task success
effective_rate:  how often the outcome was high quality
fallback_rate:   how often the worker abandoned the skill mid-task
```

**Layer 2 — Tool metrics:**
```
success_rate:    per-tool success/failure ratio
latency:         p50, p95, p99 response times
error_patterns:  clustered error messages
```

**Layer 3 — Cascade:**
When a tool's success rate drops below threshold (e.g., Google Ads API starts returning new errors), the platform:
1. Identifies all skills that depend on that tool
2. Flags them for FIX evolution
3. Surfaces a warning in the builder UI: "Google Ads API success rate dropped to 67%. 3 skills affected."

---

## 5. Enterprise Governance (Paperclip Patterns)

### 5.1 Cost Tracking

Every worker execution emits cost events:

```typescript
interface CostEvent {
  id: string;
  agentId: string;
  workerId: string;
  taskId: string;
  runId: string;
  model: string;                    // e.g., "claude-sonnet-4-6"
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  createdAt: Date;
}
```

**Budget enforcement:**
- Each agent has a monthly budget cap (set by the user)
- Budget is allocated across workers (coordinator decides allocation)
- **Hard-stop:** When a worker's allocation is exhausted, it pauses. Other workers keep running.
- **Agent-level hard-stop:** When the total agent budget is exhausted, all workers pause.
- User gets notified with: which worker hit the limit, what tasks are pending, option to increase budget or reallocate.

### 5.2 Audit Trail

Every business event is logged (extending [[SPEC-control-plane-audit-log]]):

```
agent.created          → who, when, initial config
worker.assigned        → which worker, which task, by coordinator
worker.started         → run began
worker.completed       → run finished, tokens used, success/failure
skill.proposed         → which skill, which worker, evolution type
skill.approved         → who approved, which version
skill.rejected         → who rejected, reason
budget.warning         → threshold reached
budget.hardstop        → worker or agent paused
task.escalated         → coordinator escalated to user, reason
```

### 5.3 Approval Gates

| Action | Gate | Who Approves |
|--------|------|-------------|
| Agent deployment | Required | Agent owner |
| Tool connection with write access | Required | Agent owner |
| Skill evolution (FIX/DERIVED) | Optional (configurable) | Agent owner or auto-approve |
| New skill capture | Required initially, auto-approve after trust established | Agent owner |
| Budget increase | Required | Agent owner |
| Worker addition/removal | Required | Agent owner |

---

## 6. How Workers Get Created

Workers are **not** manually configured by the user. The user creates an agent the same way they do today — through conversation with the Architect. The platform determines the worker composition.

### 6.1 During Agent Creation

```
User: "I want a Google Ads Manager that optimizes campaigns and sends weekly reports"

Architect (internal analysis):
  - Domain: Google Ads
  - Capabilities needed: campaign analysis, bid optimization, reporting
  - Tool connections: Google Ads API, Google Sheets (for reports)

Platform generates worker composition:
  - Coordinator (always present)
  - Strategist (campaign analysis + planning)
  - Bid Optimizer (bid management + budget allocation)
  - Report Writer (performance reports + client summaries)
```

The user sees: "Your Google Ads Manager has 3 specialized capabilities: strategy, bid optimization, and reporting."

They don't see: "You have 3 workers named Strategist, Bid Optimizer, and Report Writer." The internal structure is an implementation detail unless the user wants to inspect it (power user mode in the builder UI).

### 6.2 Worker Evolution Over Time

As the agent runs more tasks:
- Workers capture domain-specific skills
- The platform may propose **new workers** when it detects a capability gap: "Your agent frequently does audience segmentation as a side task. Propose adding a dedicated Audience Analyst worker?"
- Workers may be **merged** if they overlap: "Strategist and Bid Optimizer handle similar tasks. Merge into a single Campaign Manager worker?"

These proposals go through approval gates — the platform suggests, the user decides.

---

## 7. What the User Sees

### 7.1 Mission Control (Deployed Agent)

The existing Mission Control tab ([[SPEC-agent-mission-control-dashboard]]) gains:

- **Worker status panel:** Visual indicators for each worker (idle/running/blocked/error)
- **Task board view:** Current tasks, assignments, dependencies, progress
- **Cost breakdown:** Per-worker spend, trending, budget utilization
- **Skill evolution feed:** Recent skill proposals, approvals, version changes
- **Health alerts:** Tool degradation warnings, cascade notifications

### 7.2 Agent Builder (Creation)

During creation, the Architect conversation remains the same. After creation:

- **Workers tab** (power users): View and adjust worker roles, budget allocation
- **Skills tab:** Browse evolved skills per worker, approve/reject proposals
- **Performance tab:** Worker metrics, cost trends, skill effectiveness

### 7.3 Chat Interface (End User)

**No change.** The end user talks to one agent. They never see workers, task boards, or internal coordination. The Coordinator merges all worker outputs into a single coherent response.

If the agent is working on a complex request with multiple workers, the chat shows a progress indicator: "Working on your request... analyzing campaigns (done) → identifying targets (in progress) → executing changes (queued)."

---

## 8. Phased Implementation

### Phase 1 — Foundation: Execution Recording + Cost Tracking

**Goal:** Instrument what we have today so Phase 2 has data to work with.

| Component | What Changes | Where |
|-----------|-------------|-------|
| Execution recording | Every sandbox task captures tool calls, tokens, success/failure as structured JSON | `ruh-backend` — extend system events |
| Cost event table | New `cost_events` PostgreSQL table, emitted per execution | `ruh-backend` — new store + routes |
| Budget policies | New `budget_policies` table, per-agent monthly caps with hard-stop | `ruh-backend` — middleware on exec path |
| Cost dashboard | Per-agent spend widget in Mission Control | `agent-builder-ui` |
| Audit trail extension | Business events emitted at agent/execution level | `ruh-backend` — extend [[SPEC-control-plane-audit-log]] |

**No workers yet.** Single-agent model, but fully instrumented.

### Phase 2 — Workers: Multi-Worker Orchestration

**Goal:** Split the monolithic agent into coordinator + specialized workers.

| Component | What Changes | Where |
|-----------|-------------|-------|
| Worker model | New `workers` table, worker SOUL.md generation | `ruh-backend` + container workspace |
| Coordinator logic | Task decomposition, assignment, dependency resolution | Container — coordinator.md prompt |
| Task board | `task-board.json` inside container, read/write via sandbox exec | Container workspace |
| Startup ritual | Worker wakeup sequence (progress → validate → fix → execute → commit) | Container — worker prompt |
| Atomic checkout | `checkoutRunId` lock per task | `task-board.json` schema |
| Worker status | Status panel in Mission Control | `agent-builder-ui` |
| Architect integration | Architect auto-generates worker composition from purpose + skills | `agent-builder-ui` builder flow |

### Phase 3 — Evolution: Skill Capture + Self-Healing

**Goal:** Workers learn from their executions and self-repair when tools change.

| Component | What Changes | Where |
|-----------|-------------|-------|
| Post-execution analysis | LLM analyzes execution recordings, proposes skills | `ruh-backend` — new analysis service |
| Skill capture flow | Proposed skills surfaced in builder UI for approval | `agent-builder-ui` — skills tab |
| Skill versioning | Version DAG with full content snapshots per skill | `ruh-backend` — new `skill_versions` table |
| Quality monitoring | Per-skill and per-tool success metrics | `ruh-backend` — metrics aggregation |
| Quality cascade | Tool degradation → flag dependent skills → propose FIX | `ruh-backend` — cascade trigger |
| Evolution types | FIX, DERIVED, CAPTURED with lineage tracking | Skill metadata schema |
| Approval gates | Configurable gates for skill evolution, deployment, budget | `ruh-backend` — approval state machine |

### Phase 4 — Ecosystem: Skill Sharing + Network Effects

**Goal:** One agent's learning benefits all agents on the platform.

| Component | What Changes | Where |
|-----------|-------------|-------|
| Skill marketplace | Upload/download individual skills (not just whole agents) | [[016-marketplace]] extension |
| Skill discovery | Embedding-based search for relevant skills across platform | `ruh-backend` — search service |
| Portable templates | Export full agent config (workers + skills + tools) as package | Marketplace export/import |
| Platform MCP server | Expose `search_skills`, `get_agent_status` as MCP tools | `ruh-backend` — MCP endpoint |

---

## 9. Data Model Changes

### New Tables

```sql
-- Workers within an agent
CREATE TABLE workers (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  role TEXT NOT NULL,
  capabilities TEXT,
  soul_path TEXT,
  skills_path TEXT,
  status TEXT DEFAULT 'idle',
  budget_monthly_cents INTEGER DEFAULT 0,
  spent_monthly_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cost events per execution
CREATE TABLE cost_events (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  worker_id UUID REFERENCES workers(id),
  task_id TEXT,
  run_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_cents NUMERIC(10,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Budget policies
CREATE TABLE budget_policies (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  worker_id UUID REFERENCES workers(id),  -- NULL = agent-level
  monthly_cap_cents INTEGER NOT NULL,
  soft_warning_pct INTEGER DEFAULT 80,
  hard_stop BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Skill versions with lineage
CREATE TABLE skill_versions (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  worker_id UUID REFERENCES workers(id),
  skill_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  evolution_type TEXT,  -- 'CAPTURED', 'FIX', 'DERIVED'
  parent_version_id UUID REFERENCES skill_versions(id),
  content_snapshot JSONB NOT NULL,
  metrics JSONB DEFAULT '{}',
  status TEXT DEFAULT 'proposed',  -- 'proposed', 'approved', 'active', 'deprecated'
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Execution recordings
CREATE TABLE execution_recordings (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  worker_id UUID REFERENCES workers(id),
  task_id TEXT,
  run_id TEXT NOT NULL,
  success BOOLEAN,
  tool_calls JSONB DEFAULT '[]',
  tokens_used JSONB DEFAULT '{}',
  skills_applied TEXT[] DEFAULT '{}',
  skills_effective TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Modified Tables

```sql
-- agents: add worker-related fields
ALTER TABLE agents ADD COLUMN worker_composition JSONB DEFAULT NULL;
ALTER TABLE agents ADD COLUMN total_budget_monthly_cents INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN total_spent_monthly_cents INTEGER DEFAULT 0;
```

---

## 10. What This Enables (User Stories)

### Day 1: Agent Created
> User creates "Google Ads Manager." Platform generates Coordinator + 3 workers (Strategist, Bid Optimizer, Report Writer). Each has a focused SOUL.md. No skills yet — cold start.

### Week 1: Learning Begins
> Agent runs 20 campaigns. Execution recordings accumulate. Platform proposes first skill: "Campaign CPA Analysis (3-step workflow)" for Report Writer. User approves. Next report runs 40% faster.

### Week 4: Specialization Deepens
> Bid Optimizer has 5 evolved skills. Strategist has 3. Report Writer has 4. Token costs are down 35% from Week 1. Cost dashboard shows Bid Optimizer uses 60% of budget — user reallocates from underused Report Writer.

### Month 2: Self-Healing
> Google changes their Ads API bid endpoint. Bid Optimizer's `smart-bidding-v3` skill starts failing (success rate drops from 94% to 23%). Quality cascade detects it, proposes a FIX evolution. User approves. Skill self-repairs. No user intervention beyond one click.

### Month 3: Network Effects
> User creates a second agent: "Google Shopping Manager." It inherits 4 relevant skills from the Ads Manager's evolved library via skill marketplace. Day-one competence instead of cold start.

### Month 6: Compound Intelligence
> The Ads Manager has 40+ evolved skills across 3 workers. It handles edge cases that would stump a generic agent. It costs 50% less to run than Month 1. Every new agent on the platform benefits from the skill library. This is a moat.

---

## Implementation Notes

- Workers are **prompt-level constructs**, not separate processes or containers. Each worker is a focused invocation of the same LLM with different system prompts and skill injections. The container stays the same.
- `task-board.json` and `progress.json` are **files inside the container**, read/written via `sandboxExec()`. No new infrastructure.
- Cost tracking is a **new PostgreSQL table + middleware**, not a separate service.
- Skill evolution analysis runs **asynchronously after task completion**, not in the hot path.
- The Coordinator is **the only worker that talks to the user**. All other workers communicate through artifacts.
- Phase 1 ships value immediately (cost tracking, execution recording) even before workers exist.
- Worker composition is **generated by the Architect during creation**, not manually configured. Power users can adjust via the builder UI.

## Test Plan

### Phase 1
- [ ] Cost events: unit tests for event creation, budget threshold checks, hard-stop enforcement
- [ ] Execution recording: unit tests for recording creation, structured tool call capture
- [ ] Budget middleware: integration test that pauses agent execution at budget limit
- [ ] Cost dashboard: contract test for cost API response shape

### Phase 2
- [ ] Worker creation: unit test for Architect → worker composition generation
- [ ] Task decomposition: unit test for coordinator breaking request into atomic tasks
- [ ] Atomic checkout: integration test that prevents double-assignment
- [ ] Startup ritual: unit test for worker wakeup sequence (progress → validate → execute → commit)
- [ ] Cross-worker artifacts: integration test for worker A's output available to worker B
- [ ] Failure recovery: integration test for coordinator handling worker timeout

### Phase 3
- [ ] Skill capture: unit test for execution analysis → skill proposal
- [ ] Skill evolution: unit test for FIX/DERIVED/CAPTURED types with lineage
- [ ] Quality cascade: integration test for tool degradation → dependent skill flagging
- [ ] Approval flow: contract test for approval state machine (propose → approve/reject)
- [ ] Skill versioning: unit test for version DAG integrity, rollback

### Phase 4
- [ ] Skill marketplace: contract test for upload/download/search
- [ ] Skill discovery: integration test for embedding-based search relevance
- [ ] Template export: unit test for secret scrubbing on export

## Related Reviews

- [[REVIEW-paperclip-openspace-architecture]] — architecture review covering OpenSpace heuristic naming, fire-and-forget hook race conditions, shell injection risk, and Phase 2 coordinator gaps
