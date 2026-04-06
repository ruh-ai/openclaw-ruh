---
name: hermes-task-runner
version: 1.0.0
description: "Create and monitor Hermes tasks through the queue API with reproducible curl commands."
user-invocable: true
metadata:
  openclaw:
    requires:
      bins: [curl, jq]
      env: [HERMES_BASE_URL]
    primaryEnv: HERMES_BASE_URL
---

# Hermes Task Runner

## Purpose
Use this skill when you need to create, route, and monitor Hermes queue work. It wraps the Hermes APIs into a small, repeatable workflow.

## Variables
- `HERMES_BASE_URL` (required): Base URL for Hermes backend, e.g. `http://localhost:8100`.

```bash
export HERMES_BASE_URL="${HERMES_BASE_URL:-http://localhost:8100}"
```

## 1) Create a Hermes Task
### Payload fields
- `description` (string): What the task should do.
- `agentName` (optional): `auto`, `backend`, `frontend`, `flutter`, `test`, `sandbox`, `reviewer`, `hermes`, `analyst`, `strategist`.
- `priority` (optional): `1` critical, `5` normal, `10` low.
- `goalId` (optional): Associate with an existing goal.

### Command
```bash
curl -X POST "$HERMES_BASE_URL/api/queue/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Fix sandbox stream cleanup edge case",
    "agentName": "backend",
    "priority": 5
  }'
```

### Goal-specific assignment
```bash
curl -X POST "$HERMES_BASE_URL/api/queue/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Investigate auth lockout persistence gaps",
    "agentName": "backend",
    "priority": 1,
    "goalId": "<goal-id>"
  }'
```

## 2) Check System Health
```bash
curl -sS "$HERMES_BASE_URL/health"
curl -sS "$HERMES_BASE_URL/api/queue/health"
curl -sS "$HERMES_BASE_URL/api/queue/stats"
curl -sS "$HERMES_BASE_URL/api/dashboard/stats"
```

## 3) Track Tasks
```bash
curl -sS "$HERMES_BASE_URL/api/tasks?limit=20" | jq '.items[] | {id, description, status, delegatedTo, priority}'
curl -sS "$HERMES_BASE_URL/api/tasks?status=running&limit=20"
curl -sS "$HERMES_BASE_URL/api/agents"
```

## 4) Goals
```bash
curl -sS "$HERMES_BASE_URL/api/goals"
curl -X POST "$HERMES_BASE_URL/api/goals" \
  -H "Content-Type: application/json" \
  -d '{"title":"Improve queue reliability","description":"Investigate and fix recurring execution failures."}'
```

## 5) Mission Control Notes
- Mission Control UI: `http://localhost:3333/dashboard`
- Backend returns a normal JSON 404 response for unknown frontend paths; use API endpoints directly.
- Typical healthy worker set includes `hermes-ingestion`, `hermes-execution`, `hermes-learning`, `hermes-evolution`, `hermes-factory`, `hermes-analyst`.

## 6) Recommended Operating Loop
1. Check health and queue stats.
2. Submit task(s).
3. Poll running tasks every 20-60 seconds until status changes.
4. For long-running or blocking tasks, file follow-up goals and split scope.
