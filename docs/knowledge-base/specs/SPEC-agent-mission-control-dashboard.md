# SPEC: Agent Mission Control Dashboard

[[000-INDEX|← Index]] | [[001-architecture]] | [[008-agent-builder-ui]]

## Status

draft

## Summary

A standalone Next.js frontend (`agent-dashboard`) that serves as each agent's mission control — a real-time operations center where users can track what an agent is doing, what it plans to do, review work reports, manage tasks, and view execution history. Each deployed agent gets its own dashboard URL. The dashboard connects to a dedicated backend API layer that aggregates data from the existing `ruh-backend` services (system events, conversations, sandbox status, agent config).

This is NOT a monitoring tool bolted onto the builder — it's the primary workspace where users interact with their deployed digital employee day-to-day.

## Related Notes

- [[001-architecture]] — New service added to the system topology
- [[002-backend-overview]] — Dashboard API extends the existing backend or runs as a separate service
- [[004-api-reference]] — New dashboard-specific endpoints
- [[005-data-models]] — New tables: agent_runs, agent_tasks, agent_reports
- [[008-agent-builder-ui]] — Builder hands off to dashboard after deployment
- [[009-ruh-frontend]] — Dashboard replaces/extends the current client app surface
- [[011-key-flows]] — New flow: deployed agent → daily operations via dashboard

## Product Vision

When a user deploys an agent, they don't want a chat window — they want to see their digital employee's desk. The dashboard is that desk:

- **What is it doing right now?** → Live activity feed, current task, browser view
- **What has it done?** → Work reports, conversation history, artifacts produced
- **What will it do next?** → Scheduled tasks, triggers, upcoming calendar items
- **Is it healthy?** → Gateway status, error rates, resource usage
- **How can I guide it?** → Task creation, priority changes, instruction updates

## Architecture

### Service Topology

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  agent-builder-ui│     │ agent-dashboard   │     │   ruh-frontend  │
│  (create/build)  │     │ (daily operations)│     │  (client app)   │
│  :3000           │     │  :3003            │     │  :3001          │
└────────┬─────────┘     └────────┬──────────┘     └────────┬────────┘
         │                        │                          │
         └────────────┬───────────┘──────────────────────────┘
                      │
              ┌───────▼────────┐
              │  ruh-backend   │
              │  :8000         │
              │  (unified API) │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  PostgreSQL    │
              │  :5432         │
              └────────────────┘
```

### Decision: Extend ruh-backend, don't create a separate backend

The dashboard API is new endpoints on `ruh-backend`, not a separate service. Reasons:
- Same database, same agent records, same sandbox connections
- Avoids service-to-service auth complexity
- Single deployment unit in dev
- Can extract later if scale demands it

### Decision: New Next.js app (`agent-dashboard/`)

Separate from `agent-builder-ui` because:
- Different user journey (daily ops vs one-time build)
- Different layout (dashboard panels vs chat-first)
- Independent deploy cycle
- Can be wrapped in desktop app later (like ruh-frontend)

## Specification

### 1. Dashboard Pages

#### 1.1 Agent Overview (`/agents/:id`)
The home screen for a deployed agent. Shows at a glance:

| Section | Content | Data Source |
|---------|---------|-------------|
| **Status Card** | Name, avatar, status (active/paused/error), uptime | `GET /api/agents/:id` |
| **Live Activity** | Current task label, thinking/writing/idle indicator | WebSocket from gateway |
| **Quick Stats** | Messages today, tasks completed, errors | `GET /api/agents/:id/dashboard/stats` |
| **Recent Activity** | Last 10 events (conversations, tasks, errors) | `GET /api/agents/:id/system-events?limit=10` |
| **Scheduled** | Next 3 upcoming triggers/cron jobs | Agent triggers config |

#### 1.2 Task Board (`/agents/:id/tasks`)
Kanban-style task manager:

| Column | Content |
|--------|---------|
| **Backlog** | User-created tasks, scheduled items not yet started |
| **In Progress** | Tasks the agent is actively working on |
| **Under Review** | Tasks needing user approval |
| **Done** | Completed tasks with outcomes |

Each task card shows: title, priority, created_at, estimated duration, skill used, outcome summary.

Users can:
- Create tasks manually ("Analyze last week's campaign performance")
- Drag to reorder priority
- Click to see full execution log
- Approve/reject tasks in review

#### 1.3 Work Reports (`/agents/:id/reports`)
Structured output from agent runs:

| Report Type | Content |
|-------------|---------|
| **Daily Summary** | Auto-generated end-of-day report: tasks done, decisions made, issues found |
| **Task Report** | Per-task detailed report: what was done, data analyzed, recommendations |
| **Error Report** | When things went wrong: what happened, what was tried, what needs human input |

Reports are markdown with embedded data (tables, charts references). Stored as agent artifacts.

#### 1.4 Calendar (`/agents/:id/calendar`)
Timeline view of agent activity:

- Scheduled triggers (cron jobs) shown as recurring events
- Completed runs shown as past events with duration
- Upcoming tasks shown as future events
- Click any event to see execution details

#### 1.5 Live View (`/agents/:id/live`)
Real-time window into the agent's workspace:

- Browser view (VNC stream from sandbox)
- Terminal output
- Current file being edited
- Task progress bar

#### 1.6 Settings (`/agents/:id/settings`)
Agent configuration surface:

- Workspace memory (instructions, continuity)
- Active skills toggle
- Trigger management
- Runtime inputs / credentials
- Channel connections

### 2. New Backend Endpoints

All under `GET /api/agents/:id/dashboard/...`

```
GET  /api/agents/:id/dashboard/stats
     → { messagestoday, tasksCompleted, tasksInProgress, errorsToday, uptime }

GET  /api/agents/:id/dashboard/activity?limit=20&before={cursor}
     → { items: [{ type, timestamp, summary, details }], cursor }

GET  /api/agents/:id/tasks
     → { tasks: [AgentTask] }

POST /api/agents/:id/tasks
     → Create a new task: { title, description, priority, dueAt? }

PATCH /api/agents/:id/tasks/:taskId
     → Update task: { status, priority, outcome }

GET  /api/agents/:id/reports
     → { reports: [AgentReport] }

GET  /api/agents/:id/reports/:reportId
     → Full report content

GET  /api/agents/:id/calendar?from={iso}&to={iso}
     → { events: [CalendarEvent] }
```

### 3. New Data Models

#### agent_tasks
```sql
CREATE TABLE agent_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog','in_progress','review','done','cancelled')),
  priority      INTEGER DEFAULT 0,
  skill_used    TEXT,
  outcome       TEXT,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  due_at        TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  metadata      JSONB DEFAULT '{}'
);

CREATE INDEX idx_agent_tasks_agent ON agent_tasks(agent_id, status);
CREATE INDEX idx_agent_tasks_due ON agent_tasks(agent_id, due_at) WHERE due_at IS NOT NULL;
```

#### agent_reports
```sql
CREATE TABLE agent_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id       UUID REFERENCES agent_tasks(id),
  type          TEXT NOT NULL CHECK (type IN ('daily_summary','task_report','error_report','custom')),
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  data          JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_reports_agent ON agent_reports(agent_id, created_at DESC);
```

#### agent_calendar_events
```sql
CREATE TABLE agent_calendar_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id       UUID REFERENCES agent_tasks(id),
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('trigger','run','scheduled','manual')),
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  recurrence    TEXT,
  status        TEXT DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','running','completed','failed','cancelled')),
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_calendar_agent ON agent_calendar_events(agent_id, starts_at);
```

### 4. Navigation Between Apps

| From | To | Trigger |
|------|----|---------|
| Agent Builder → Dashboard | After deploy completes | "Open Dashboard" button on success |
| Agents List → Dashboard | Click agent card | If agent is active, go to dashboard |
| Dashboard → Builder | Click "Improve" | Navigate to `/agents/create?agentId={id}` |
| Dashboard → Chat | Click "Chat" | Open chat panel or navigate to chat view |

### 5. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 15 (App Router) | Consistent with other frontends |
| Styling | Tailwind CSS + CSS variables | Match DESIGN.md brand system |
| State | Zustand | Consistent with agent-builder-ui |
| Charts | Recharts or lightweight SVG | Task completion, activity graphs |
| Real-time | Server-Sent Events | Same pattern as sandbox streaming |
| Calendar | Custom or @schedule-x | Lightweight, no heavy deps |

## Implementation Notes

### Phase 1: Foundation (MVP)
1. Create `agent-dashboard/` Next.js app with shared design tokens from DESIGN.md
2. Add dashboard API endpoints to ruh-backend
3. Create `agent_tasks` and `agent_reports` tables via schema migration
4. Build Agent Overview page with stats + activity feed
5. Build Task Board with CRUD
6. Wire "Open Dashboard" from deploy success and agents list

### Phase 2: Reports & Calendar
1. Build Work Reports page
2. Add daily summary auto-generation (triggered by cron or agent completion)
3. Build Calendar view
4. Add calendar events from trigger executions

### Phase 3: Live View & Real-time
1. Build Live View with VNC stream + terminal
2. Add WebSocket/SSE real-time activity updates
3. Add notification system for task completions and errors

### Key Files to Create
```
agent-dashboard/
  app/
    layout.tsx
    page.tsx                          → Redirects to /agents
    agents/
      page.tsx                        → Agent list (active agents only)
      [id]/
        page.tsx                      → Overview dashboard
        tasks/page.tsx                → Task board
        reports/page.tsx              → Work reports
        reports/[reportId]/page.tsx   → Single report
        calendar/page.tsx             → Calendar view
        live/page.tsx                 → Live view
        settings/page.tsx             → Agent settings
  components/
    dashboard/
      StatusCard.tsx
      ActivityFeed.tsx
      QuickStats.tsx
      TaskBoard.tsx
      TaskCard.tsx
      ReportCard.tsx
      CalendarView.tsx
      LiveView.tsx
    layout/
      DashboardSidebar.tsx
      AgentHeader.tsx
  hooks/
    use-agent-dashboard.ts
    use-agent-tasks.ts
    use-agent-reports.ts
  lib/
    api.ts                           → Backend API client
    types.ts                         → Dashboard-specific types
  package.json
  next.config.ts
  tailwind.config.ts
  tsconfig.json
```

## Test Plan

### Unit Tests
- Task status transitions (backlog → in_progress → review → done)
- Report generation from system events
- Calendar event computation from triggers
- Dashboard stats aggregation

### Integration Tests
- Backend: CRUD for tasks, reports, calendar events
- Backend: Stats endpoint aggregation accuracy
- Backend: Activity feed pagination

### E2E Tests
- Create task → agent picks it up → task moves to done
- Deploy agent → navigate to dashboard → verify data loads
- Calendar view shows scheduled triggers correctly

### Manual Verification
- Dashboard loads for a deployed agent with live data
- Task board drag-and-drop works
- Reports render markdown correctly
- Live view shows browser stream
