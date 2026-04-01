# Agent Development Lifecycle — 7-Stage Sprint

> **Status:** Approved — Sprint 1 ready for implementation
> **Owner:** Prasanjit
> **Created:** 2026-03-27
> **Process:** gstack-inspired (Think → Plan → Build → Review → Test → Ship → Reflect)

---

## Context

Building an AI agent is building software. The current wizard tries to do everything in one shot — describe → build → deploy. This fails because:
1. The architect dumps everything at once with no user input between stages
2. No structured requirements gathering before building
3. No review/test cycle before shipping
4. No way to iterate or improve

We're replacing the linear wizard with a **7-stage development lifecycle** inspired by [gstack](https://github.com/garrytan/gstack)'s Think → Plan → Build → Review → Test → Ship → Reflect cycle, adapted for OpenClaw agent creation.

All stages run within a single copilot chat session with hard gates between them. Each stage has its own UI panel, produces specific artifacts, and requires user approval before advancing.

---

## gstack Process Mapping

| gstack Phase | Agent Lifecycle Stage | gstack Skill Equivalent | What Happens |
|---|---|---|---|
| **Think** (`/office-hours`) | THINK | Discovery + forcing questions | PRD/TRD generation, problem reframing |
| **Plan** (`/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`) | PLAN | CEO scope review + eng architecture lock + design audit | Architecture plan with skills, workflow, integrations, sub-agents, mission control |
| **Build** (implementation) | BUILD | Code generation guided by locked plan | Architect creates SOUL.md, SKILL.md files, config in sandbox |
| **Review** (`/review`, `/codex`) | REVIEW | Staff-level code inspection + second opinion | User inspects skills, tools, triggers, channels, sub-agents |
| **Test** (`/qa`) | TEST | Real browser testing + regression tests | Evaluation tasks with verifiable outcomes run against the agent |
| **Ship** (`/ship`) | SHIP | Automated release pipeline | Deploy to sandbox, promote forge sandbox |
| **Reflect** (`/retro`) | REFLECT | Weekly retrospective with metrics | Build report, configuration snapshot, learnings |

### gstack Principles Applied

1. **Process over prompts** — Each stage has a defined role, inputs, outputs, and gate. No stage can be skipped.
2. **Virtual team of specialists** — Think stage = product manager, Plan stage = architect, Build stage = engineer, Review stage = QA lead, Test stage = test engineer, Ship stage = DevOps, Reflect stage = team lead.
3. **Parallel sprints possible** — Multiple agents can be built simultaneously because the process prevents chaos.
4. **Iron Law: no fixes without root cause** — Test stage must identify WHY something fails, not just that it fails.

---

## The 7 Stages

```
┌─────────┐   ┌──────┐   ┌───────┐   ┌────────┐   ┌──────┐   ┌──────┐   ┌─────────┐
│  THINK   │→  │ PLAN │→  │ BUILD │→  │ REVIEW │→  │ TEST │→  │ SHIP │→  │ REFLECT │
│          │   │      │   │       │   │        │   │      │   │      │   │         │
│ PRD/TRD  │   │ Arch │   │Skills │   │Config  │   │ Eval │   │Deploy│   │ Build   │
│ Discovery│   │ Lock │   │SOUL.md│   │Inspect │   │Tasks │   │      │   │ Report  │
└─────────┘   └──────┘   └───────┘   └────────┘   └──────┘   └──────┘   └─────────┘
   Gate:         Gate:      Gate:       Gate:        Gate:      Gate:
  Approve      Lock Arch  Build Done  Approve Cfg  Pass Eval  Deploy OK
```

### Stage 1: THINK (Discovery)
**gstack equivalent:** `/office-hours` — six forcing questions that reframe the product
**Purpose:** Understand the problem and define requirements.
**Actor:** Architect LLM generates, user reviews and edits.
**Artifacts:**
- Product Requirements Document (PRD)
- Technical Requirements Document (TRD)

**Flow:**
1. User describes the agent in chat
2. Purpose fills immediately (name + description extracted from message)
3. Architect LLM generates PRD + TRD via forge sandbox chat
4. User reviews editable PRD/TRD in tabbed config panel
5. User clicks "Approve Requirements" to advance

**Gate:** User must approve PRD + TRD.

### Stage 2: PLAN (Architecture Lock)
**gstack equivalent:** `/plan-ceo-review` + `/plan-eng-review` + `/plan-design-review`
**Purpose:** Lock the technical architecture before building.
**Actor:** Architect LLM generates from approved PRD/TRD, user reviews.
**Artifacts:**
- Skill Architecture (names, descriptions, dependencies)
- Workflow Design (execution order, parallel vs sequential)
- Integration Map (APIs, tools, credentials)
- Trigger Configuration (cron expressions, webhook specs)
- Sub-Agent Definitions (worker, orchestrator, monitor, specialist)
- Mission Control Config (dashboard widgets and layout)
- Environment Variables list

**Flow:**
1. Send approved PRD/TRD to architect: "plan only, don't build yet"
2. Architect returns structured architecture plan (JSON)
3. User reviews in config panel — edit skill names, remove integrations, adjust triggers, configure sub-agents, preview mission control
4. User clicks "Lock Architecture" to advance

**Gate:** User must approve architecture plan.

### Stage 3: BUILD (Implementation)
**gstack equivalent:** Build phase — implementation guided by locked plan
**Purpose:** Architect builds the agent from the locked architecture.
**Actor:** Architect LLM executes in sandbox.
**Artifacts:**
- SOUL.md (agent identity)
- SKILL.md files (one per skill)
- Sub-agent SOUL.md files
- Workflow configuration
- Cron jobs
- ready_for_review output

**Flow:**
1. Send locked architecture + PRD/TRD: "build exactly this"
2. Architect creates files in sandbox (visible in terminal)
3. Config panel shows "Building..." with progressive skill detection
4. When architect finishes, auto-advance to Review

**Gate:** Architect must finish (ready_for_review received).

### Stage 4: REVIEW (Configuration Inspection)
**gstack equivalent:** `/review` — staff-level code inspection
**Purpose:** Inspect what was built before testing.
**Actor:** User reviews, can edit.
**Sections (sub-tabs):**
- Skills (editable — remove/rename)
- Tools & connections (editable — add/remove)
- Triggers (editable — modify cron, add webhooks)
- Channels (editable — add Telegram, Slack, etc.)
- Sub-Agents (editable — adjust boundaries, autonomy levels)
- Runtime Inputs (editable — add/remove env vars)
- Mission Control Preview

**Flow:**
1. Sub-tabs rendered using existing step components (StepChooseSkills, StepConnectTools, etc.)
2. User walks through each section
3. User clicks "Approve Configuration"

**Gate:** User must approve full configuration.

### Stage 5: TEST (Evaluation)
**gstack equivalent:** `/qa` — real testing with regression test generation
**Purpose:** Verify the agent works by running evaluation tasks with verifiable outcomes.
**Actor:** System runs eval tasks, user observes and judges results.
**Artifacts:**
- Eval report with pass/fail per task
- Agent response logs
- Tool usage traces

**Flow:**
1. Auto-generate 3-5 evaluation tasks from PRD/TRD with expected outcomes
2. Each task is sent to the agent as a test message
3. System tracks: did the agent use the right tools? Did it produce expected artifacts? Did it respect guardrails?
4. Each task shows pass/fail/manual-check status
5. User clicks "Approve Tests" or "Re-build" (back to Build)

**Gate:** User must approve test results. Can go back to Build or Review.

### Stage 6: SHIP (Deploy)
**gstack equivalent:** `/ship` — automated release pipeline
**Purpose:** Deploy the agent to production.
**Actor:** System deploys, user confirms.

**Flow:**
1. Deploy readiness summary (no blocking gates on runtime inputs)
2. User clicks "Deploy" — sandbox created or forge sandbox promoted
3. Progress via SSE stream
4. On success, deploy confirmation with sandbox URL + Mission Control link

**Gate:** Deploy must succeed.

### Stage 7: REFLECT (Build Summary)
**gstack equivalent:** `/retro` — retrospective with metrics
**Purpose:** Document what was built and capture learnings.
**Actor:** System generates, user annotates.
**Artifacts:**
- Build report (stages, decisions, timeline)
- Configuration snapshot
- Known limitations / future improvements

**Flow:**
1. Auto-generate build summary from all stage artifacts
2. Readable report with timeline
3. User adds notes/annotations
4. Save to agent record

---

## Sub-Agents

OpenClaw supports sub-agents — specialized agents the main agent delegates to.

### Sub-Agent Types

| Type | Use Case | Example |
|---|---|---|
| **Worker** | Handles a specific skill domain | Data enrichment, report generation |
| **Orchestrator** | Coordinates other sub-agents | Pipeline manager, task router |
| **Monitor** | Watches for events/anomalies | Health check, alert agent |
| **Specialist** | Deep expertise in one area | API integration, content formatting |

### Where They Appear

- **Plan:** Architect identifies sub-agents, user configures autonomy levels
- **Build:** Architect builds sub-agent SOUL.md + skills alongside main agent
- **Review:** Sub-agents tab shows skill ownership + communication patterns
- **Test:** Sub-agents tested independently + tested for proper delegation

### Data Model
```typescript
interface SubAgentConfig {
  id: string;
  name: string;
  description: string;
  type: "worker" | "orchestrator" | "monitor" | "specialist";
  skills: string[];
  trigger: string;
  autonomy: "fully_autonomous" | "requires_approval" | "report_only";
}
```

---

## Agent Backend Service

Each deployed agent gets a dedicated backend for persistent artifact storage, run history, and API access.

### Architecture
```
Agent Sandbox (Docker) ↔ Agent Backend Service ↔ Mission Control UI
                         ├─ Artifact Store
                         ├─ Run History + Logs
                         ├─ Webhook Ingress
                         └─ REST/GraphQL API
```

### Data Models
```typescript
interface AgentArtifact {
  id: string; agentId: string; runId: string;
  type: "report" | "data" | "analysis" | "notification" | "log";
  title: string; content: string | Record<string, unknown>;
  metadata: Record<string, unknown>; createdAt: string;
}

interface AgentRun {
  id: string; agentId: string;
  trigger: "cron" | "webhook" | "manual" | "sub-agent";
  status: "running" | "completed" | "failed";
  startedAt: string; completedAt?: string;
  skillsExecuted: string[]; artifacts: string[]; logs: string[];
}
```

### API Endpoints
```
GET    /api/agents/:id/artifacts
GET    /api/agents/:id/artifacts/:artId
GET    /api/agents/:id/runs
GET    /api/agents/:id/runs/:runId
POST   /api/agents/:id/webhook/:hookId
GET    /api/agents/:id/stats
```

---

## Mission Control UI

Each agent gets a custom dashboard composed of configurable widgets.

### Widget Types
| Widget | Description |
|---|---|
| Artifact Feed | Scrollable list of artifacts |
| Stats Cards | Key metrics in card layout |
| Chart | Time-series or bar charts |
| Table | Structured data view |
| Activity Log | Real-time event stream |
| Action Buttons | Manual triggers |

### Schema
```typescript
interface MissionControlConfig {
  agentId: string;
  layout: "single-column" | "two-column" | "dashboard-grid";
  widgets: Array<{
    id: string;
    type: "artifact-feed" | "stats-cards" | "chart" | "table" | "activity-log" | "action-buttons";
    title: string;
    position: { row: number; col: number; width: number; height: number };
    config: Record<string, unknown>;
    dataSource: { endpoint: string; refreshInterval?: number };
  }>;
}
```

### Lifecycle Integration
- **Think:** PRD defines what user wants to see
- **Plan:** Architect generates MissionControlConfig
- **Review:** User previews and rearranges widgets
- **Ship:** Deployed at `/agents/:id/mission-control`

---

## Implementation Sprints

### Sprint 1: Foundation (Types + State + Stepper)
| # | What | Effort |
|---|---|---|
| 1 | New types: `AgentDevStage`, `ArchitecturePlan`, `EvalTask`, `BuildReport`, `MissionControlConfig`, `AgentArtifact`, `AgentRun`, `SubAgentConfig` | M |
| 2 | Replace copilot state with lifecycle state | M |
| 3 | 7-stage stepper UI → `LifecycleStepRenderer.tsx` | M |

### Sprint 2: Think + Plan Stages
| # | What | Effort |
|---|---|---|
| 4 | StageThink (PRD/TRD editor) | S |
| 5 | StagePlan (architecture plan editor + sub-agents + mission control config) | L |
| 6 | Plan generation prompt | M |

### Sprint 3: Build + Review Stages
| # | What | Effort |
|---|---|---|
| 7 | StageBuild (progressive build with task tracking) | M |
| 8 | StageReview (tabbed: Skills, Tools, Triggers, Channels, Sub-Agents, Mission Control preview) | L |

### Sprint 4: Test + Ship + Reflect Stages
| # | What | Effort |
|---|---|---|
| 9 | StageTest (eval task generation + runner) | L |
| 10 | StageShip (deploy, no setup gate) | S |
| 11 | StageReflect (build report) | S |

### Sprint 5: Agent Backend Service
| # | What | Effort |
|---|---|---|
| 12 | Artifact + Run data models | M |
| 13 | Agent backend API endpoints | L |
| 14 | Webhook ingress endpoint | M |

### Sprint 6: Mission Control UI
| # | What | Effort |
|---|---|---|
| 15 | MissionControlRenderer | L |
| 16 | Widget components | L |
| 17 | Mission Control page | M |

### Sprint 7: Wire Everything Together
| # | What | Effort |
|---|---|---|
| 18 | Stage transitions in CoPilotLayout | L |
| 19 | End-to-end testing | M |

---

## Key Design Decisions

1. **Hard gates between stages** — user MUST approve before advancing. Prevents "dump everything at once."
2. **Each stage has clear inputs/outputs** — Think → Plan → Build → Review → Test → Ship → Reflect.
3. **Sub-agents are first-class** — planned, built, reviewed, and tested alongside the main agent.
4. **Mission Control is agent-specific** — configured during Plan, previewed during Review, deployed during Ship.
5. **Agent backend is persistent** — artifacts survive container restarts, queryable via API.
6. **gstack process throughout** — every stage maps to a gstack phase with the same rigor and specialist mindset.
