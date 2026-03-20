---
name: task-criticality-analyzer
version: 1.0.0
description: "Analyzes Linear task impact and complexity. Writes criticality scores to result_metrics."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [curl, python3]
      env: [DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID, RUN_ID]
    primaryEnv: DATA_INGESTION_BASE_URL
---

# Task Criticality Analyzer

Scores tasks on impact (urgency keywords + priority + due date) and complexity (subtasks + estimates).

## Usage

### Step 1: Query Tasks from Data Ingestion

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

### Step 2: Calculate Criticality Scores

```bash
python3 -c '
import json, sys, os
from datetime import datetime

with open(f"/tmp/tasks_{os.environ[\"RUN_ID\"]}.json") as f:
    data = json.load(f)
    tasks = data.get("records", [])

metrics = []

for task in tasks:
    # Impact score (0-50)
    impact = 0
    text = f"{task.get(\"title\",\"\")} {task.get(\"description\",\"\")}".lower()
    if any(kw in text for kw in ["urgent","immediate","critical","blocker","asap"]):
        impact += 20
    
    priority_scores = {"P1":30,"P2":20,"P3":10,"P4":5,"None":0}
    impact += priority_scores.get(task.get("priority","None"), 0)
    
    # Due date proximity
    due_date_str = task.get("due_date")
    if due_date_str:
        try:
            due_date = datetime.fromisoformat(due_date_str.replace("Z",""))
            days_until = (due_date - datetime.now()).days
            if days_until < 0:
                impact += 25  # Overdue
            elif days_until == 0:
                impact += 15  # Due today
            elif days_until <= 7:
                impact += 10  # Due this week
        except:
            pass
    
    # Complexity score (0-50)
    complexity = 0
    estimate = task.get("estimate_hours") or 0
    if estimate == 0:
        complexity += 10
    elif estimate <= 3:
        complexity += 15
    elif estimate <= 8:
        complexity += 25
    else:
        complexity += 40
    
    desc_len = len(task.get("description",""))
    if desc_len < 100:
        complexity += 5
    elif desc_len < 500:
        complexity += 15
    else:
        complexity += 30
    
    criticality = min(impact + complexity, 100)
    
    metric = {
        "subject_type": "task",
        "subject_id": task.get("issue_key", task.get("issue_id")),
        "period_type": "daily",
        "period_key": datetime.utcnow().strftime("%Y-%m-%d"),
        "metric_name": "criticality_score",
        "metric_value": criticality,
        "confidence": 0.85,
        "provenance_json": {
            "impact_score": impact,
            "complexity_score": complexity,
            "priority": task.get("priority"),
            "due_date": task.get("due_date")
        }
    }
    metrics.append(metric)

with open(f"/tmp/metrics_{os.environ[\"RUN_ID\"]}.json", "w") as f:
    json.dump(metrics, f)

print(f"Analyzed {len(metrics)} tasks")
'
```

### Step 3: Write Metrics to Data Ingestion

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/results/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${DATA_INGESTION_ORG_ID}'",
    "agent_id": "'${DATA_INGESTION_AGENT_ID}'",
    "run_id": "'${RUN_ID}'",
    "metrics": '"$(cat /tmp/metrics_${RUN_ID}.json)"'
  }'
```

### Step 4: Cleanup

```bash
rm -f /tmp/tasks_${RUN_ID}.json /tmp/metrics_${RUN_ID}.json
```

## Expected Output

Writes criticality scores (0-100) to `result_metrics` with:
- `metric_name`: "criticality_score"
- `metric_value`: Combined impact + complexity score
- `provenance_json`: Breakdown of scoring components

## Scoring Logic

**Impact (0-50):**
- Urgent keywords (+20)
- Priority P1 (+30), P2 (+20), P3 (+10), P4 (+5)
- Due date: Overdue (+25), Today (+15), This week (+10)

**Complexity (0-50):**
- Estimate: None (+10), 1-3 (+15), 4-8 (+25), 9+ (+40)
- Description length: Short (+5), Medium (+15), Long (+30)

## Error Handling

If data-ingestion query fails, the curl command will exit with non-zero. Check logs for details.
