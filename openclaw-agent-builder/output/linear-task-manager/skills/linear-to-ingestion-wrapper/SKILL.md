---
name: linear-to-ingestion-wrapper
version: 1.0.0
description: "Fetches Linear tasks via linear-cli and writes to data-ingestion entity_issues table."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [linear, curl, python3]
      env: [LINEAR_API_KEY, DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID, RUN_ID]
    primaryEnv: LINEAR_API_KEY
---

# Linear → Data Ingestion Wrapper

Fetches Linear tasks assigned to you (all statuses except "Done") and writes to entity_issues.

## Usage

### Step 1: Fetch Linear Tasks

```bash
linear issue list \
  --assignee @me \
  --filter "status:Backlog,Todo,In Progress,Canceled" \
  --json > /tmp/linear_tasks_${RUN_ID}.json
```

### Step 2: Transform to entity_issues Schema

```bash
python3 -c '
import json, sys, os

with open(f"/tmp/linear_tasks_{os.environ[\"RUN_ID\"]}.json") as f:
    tasks = json.load(f)

records = []
priority_map = {0: "None", 1: "P1", 2: "P2", 3: "P3", 4: "P4"}

for task in tasks:
    record = {
        "issue_id": task.get("id"),
        "issue_key": task.get("identifier"),
        "title": task.get("title"),
        "description": task.get("description", ""),
        "status": task.get("state", {}).get("name", "Unknown"),
        "priority": priority_map.get(task.get("priority", 0), "None"),
        "due_date": task.get("dueDate"),
        "estimate_hours": task.get("estimate"),
        "project": task.get("project", {}).get("name") if task.get("project") else None,
        "assignee": task.get("assignee", {}).get("name") if task.get("assignee") else None,
        "created_at": task.get("createdAt"),
        "updated_at": task.get("updatedAt")
    }
    records.append(record)

with open(f"/tmp/entity_issues_{os.environ[\"RUN_ID\"]}.json", "w") as f:
    json.dump(records, f)

print(f"Transformed {len(records)} tasks")
'
```

### Step 3: Write to Data Ingestion

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/write \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${DATA_INGESTION_ORG_ID}'",
    "agent_id": "'${DATA_INGESTION_AGENT_ID}'",
    "run_id": "'${RUN_ID}'",
    "table_name": "entity_issues",
    "schema_type": "shared",
    "operation": "upsert",
    "records": '"$(cat /tmp/entity_issues_${RUN_ID}.json)"',
    "conflict_columns": ["issue_id"]
  }'
```

### Step 4: Cleanup

```bash
rm -f /tmp/linear_tasks_${RUN_ID}.json /tmp/entity_issues_${RUN_ID}.json
```

## Expected Output

Writes Linear tasks to `entity_issues` table with these fields:
- `issue_id`: Linear issue ID
- `issue_key`: Identifier (e.g., "ENG-123")
- `title`: Task title
- `status`: Current status
- `priority`: P1-P4 or None
- `due_date`: Due date (ISO 8601)
- `estimate_hours`: Estimated hours/points

## Error Handling

- If `linear` CLI fails: Check LINEAR_API_KEY and linear-cli installation
- If data-ingestion write fails: Check DATA_INGESTION_BASE_URL and credentials
- Empty result set: Write empty array (not an error)

## Dependencies

Requires `linear-cli` to be installed:
```bash
npm install -g linear-cli
```
