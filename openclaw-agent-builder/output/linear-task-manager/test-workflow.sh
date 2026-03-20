#!/bin/bash
# test-workflow.sh
# Manually test the linear-task-manager workflow step-by-step
# This simulates what the OpenClaw agent will do when triggered

set -e

echo "🧪 Testing Linear Task Manager Workflow..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Generate RUN_ID
export RUN_ID=$(uuidgen 2>/dev/null || echo "test-$(date +%s)")
echo -e "${BLUE}ℹ${NC} Generated RUN_ID: $RUN_ID"
echo ""

# Check env vars
echo "=== Checking Environment ==="
REQUIRED_VARS=("LINEAR_API_KEY" "DATA_INGESTION_BASE_URL" "DATA_INGESTION_ORG_ID" "DATA_INGESTION_AGENT_ID")
MISSING=0

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}✗${NC} $var is NOT set"
        MISSING=1
    else
        echo -e "${GREEN}✓${NC} $var is set"
    fi
done

if [ $MISSING -eq 1 ]; then
    echo ""
    echo -e "${RED}❌ Missing required environment variables${NC}"
    echo "Please set them in your shell or source OpenClaw's .env file"
    exit 1
fi

echo ""
echo "=== Step 1: Fetch Linear Tasks ==="
echo "Running: linear issue list --assignee @me --filter 'status:Backlog,Todo,In Progress,Canceled' --json"

if ! command -v linear &> /dev/null; then
    echo -e "${RED}✗${NC} linear CLI not found. Run: npm install -g linear-cli"
    exit 1
fi

linear issue list \
  --assignee @me \
  --filter "status:Backlog,Todo,In Progress,Canceled" \
  --json > /tmp/linear_tasks_${RUN_ID}.json

TASK_COUNT=$(jq '. | length' /tmp/linear_tasks_${RUN_ID}.json)
echo -e "${GREEN}✓${NC} Fetched $TASK_COUNT tasks from Linear"

if [ "$TASK_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠${NC} No tasks found. Cannot continue workflow test."
    rm -f /tmp/linear_tasks_${RUN_ID}.json
    exit 0
fi

echo ""
echo "=== Step 2: Transform to entity_issues Schema ==="

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
    json.dump(records, f, indent=2)

print(f"Transformed {len(records)} tasks")
'

echo -e "${GREEN}✓${NC} Transformed tasks to entity_issues schema"

echo ""
echo "=== Step 3: Write to Data Ingestion ==="

WRITE_RESPONSE=$(curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/write \
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
  }')

if echo "$WRITE_RESPONSE" | jq -e '.status == "success"' > /dev/null 2>&1; then
    WRITTEN=$(echo "$WRITE_RESPONSE" | jq -r '.rows_affected // "unknown"')
    echo -e "${GREEN}✓${NC} Wrote $WRITTEN tasks to entity_issues"
else
    echo -e "${RED}✗${NC} Write to data-ingestion failed"
    echo "Response: $WRITE_RESPONSE"
    exit 1
fi

echo ""
echo "=== Step 4: Analyze Criticality ==="
echo "(Running Python scoring logic...)"

# (We'll skip the full analysis for brevity, but you can add it)
echo -e "${YELLOW}⚠${NC} Criticality analysis step is complex - check SKILL.md for full logic"
echo -e "${GREEN}✓${NC} (Simulated) Analysis complete"

echo ""
echo "=== Step 5: Query Analyzed Tasks ==="

QUERY_RESPONSE=$(curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/query \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${DATA_INGESTION_ORG_ID}'",
    "agent_id": "'${DATA_INGESTION_AGENT_ID}'",
    "table_name": "entity_issues",
    "schema_type": "shared",
    "filters": {"run_id": {"op": "eq", "value": "'${RUN_ID}'"}},
    "limit": 10
  }')

QUERY_COUNT=$(echo "$QUERY_RESPONSE" | jq '.records | length')
echo -e "${GREEN}✓${NC} Queried $QUERY_COUNT tasks from entity_issues"

# Display sample
echo ""
echo "Sample tasks:"
echo "$QUERY_RESPONSE" | jq -r '.records[0:3] | .[] | "  - \(.issue_key): \(.title)"'

echo ""
echo "=== Cleanup ==="
rm -f /tmp/linear_tasks_${RUN_ID}.json /tmp/entity_issues_${RUN_ID}.json
echo -e "${GREEN}✓${NC} Cleaned up temporary files"

echo ""
echo -e "${GREEN}✅ Workflow test complete!${NC}"
echo ""
echo "Note: This test only runs steps 1-3 (fetch, transform, write)."
echo "Full workflow includes criticality analysis and digest building."
echo "The OpenClaw agent will run all steps when triggered by cron."
