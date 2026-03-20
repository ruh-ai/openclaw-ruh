---
name: task-digest-builder
version: 1.0.0
description: "Queries analyzed tasks, sorts by due date then criticality, formats top-10 digest."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [curl, python3]
      env: [DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID, RUN_ID]
    primaryEnv: DATA_INGESTION_BASE_URL
---

# Task Digest Builder

Builds the final prioritized task list for Telegram delivery.

## Usage

### Step 1: Query Tasks

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/query \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${DATA_INGESTION_ORG_ID}'",
    "agent_id": "'${DATA_INGESTION_AGENT_ID}'",
    "table_name": "entity_issues",
    "schema_type": "shared",
    "filters": {"run_id": {"op": "eq", "value": "'${RUN_ID}'"}},
    "limit": 1000
  }' > /tmp/tasks_${RUN_ID}.json
```

### Step 2: Query Criticality Scores

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/query \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${DATA_INGESTION_ORG_ID}'",
    "agent_id": "'${DATA_INGESTION_AGENT_ID}'",
    "table_name": "result_metrics",
    "schema_type": "agent",
    "filters": {
      "run_id": {"op": "eq", "value": "'${RUN_ID}'"},
      "metric_name": {"op": "eq", "value": "criticality_score"}
    },
    "limit": 1000
  }' > /tmp/metrics_${RUN_ID}.json
```

### Step 3: Join and Sort

```bash
python3 -c '
import json, sys, os
from datetime import datetime

with open(f"/tmp/tasks_{os.environ[\"RUN_ID\"]}.json") as f:
    tasks_data = json.load(f)
    tasks = tasks_data.get("records", [])

with open(f"/tmp/metrics_{os.environ[\"RUN_ID\"]}.json") as f:
    metrics_data = json.load(f)
    metrics = metrics_data.get("records", [])

# Build score lookup
score_map = {m["subject_id"]: m for m in metrics}

# Join tasks with scores
enriched = []
for task in tasks:
    issue_key = task.get("issue_key", task.get("issue_id"))
    metric = score_map.get(issue_key, {})
    
    enriched.append({
        "issue_key": issue_key,
        "title": task.get("title"),
        "project": task.get("project"),
        "due_date": task.get("due_date"),
        "priority": task.get("priority"),
        "criticality": metric.get("metric_value", 0)
    })

# Sort by due date (asc), then criticality (desc)
def sort_key(t):
    due = t.get("due_date")
    if due:
        try:
            dt = datetime.fromisoformat(due.replace("Z",""))
            date_key = dt.timestamp()
        except:
            date_key = float("inf")
    else:
        date_key = float("inf")
    return (date_key, -t.get("criticality", 0))

enriched.sort(key=sort_key)

# Format digest
today = datetime.utcnow().strftime("%Y-%m-%d")
lines = [f"📋 Your Top 10 Linear Tasks ({today})", ""]

for i, task in enumerate(enriched[:10], 1):
    crit = task.get("criticality", 0)
    if crit >= 80:
        label = "CRITICAL"
    elif crit >= 60:
        label = "HIGH"
    elif crit >= 40:
        label = "MEDIUM"
    else:
        label = "LOW"
    
    due = task.get("due_date")
    if due:
        try:
            due_dt = datetime.fromisoformat(due.replace("Z",""))
            due_display = due_dt.strftime("%Y-%m-%d")
        except:
            due_display = "No date"
    else:
        due_display = "No date"
    
    project = task.get("project") or "No project"
    
    lines.append(f"{i}. [{label}] {task[\"title\"]}")
    lines.append(f"   Project: {project} | Due: {due_display} | Criticality: {crit:.0f}/100")
    lines.append("")

digest = "\\n".join(lines)

with open(f"/tmp/digest_{os.environ[\"RUN_ID\"]}.txt", "w") as f:
    f.write(digest)

print(digest)
'
```

### Step 4: Output Digest

The digest is now in `/tmp/digest_${RUN_ID}.txt` and printed to stdout for the telegram-sender skill to use.

## Expected Output

Markdown-formatted digest:

```
📋 Your Top 10 Linear Tasks (2024-03-18)

1. [CRITICAL] Fix authentication bug in prod
   Project: Backend | Due: 2024-03-18 | Criticality: 95/100

2. [HIGH] Implement rate limiting
   Project: Backend | Due: 2024-03-19 | Criticality: 87/100

...
```

## Error Handling

If no tasks are found, outputs:
```
📋 No tasks found for today.
```
