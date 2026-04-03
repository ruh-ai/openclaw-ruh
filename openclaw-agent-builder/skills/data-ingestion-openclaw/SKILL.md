---
name: data-ingestion-openclaw
version: 2.0.0
description: "Interact with the aget-data-ingestion FastAPI service: ingest data from external sources, query entity/result tables, write computed results. MANDATORY for every generated agent system."
user-invocable: true
metadata:
  openclaw:
    always: true
    requires:
      bins: [curl, python3]
      env: [DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID]
    primaryEnv: DATA_INGESTION_BASE_URL
---

# Data Ingestion Service — Complete API Reference

Base URL: `${DATA_INGESTION_BASE_URL}` (default: `https://ingestion-service-s45p.onrender.com`)

Every generated agent system MUST use this service for:
- **Reading** external data (entity_* tables) — via adapters or query API
- **Writing** computed results (result_*, feature_* tables) — via write API
- **Never** bypass this service for database operations

---

## 1. Health & Discovery

```bash
# Health check
curl -s ${DATA_INGESTION_BASE_URL}/health

# List available adapters (jira, github, etc.)
curl -s ${DATA_INGESTION_BASE_URL}/ingestion/adapters

# List writable tables in agent schema
curl -s "${DATA_INGESTION_BASE_URL}/data/schema/writable-tables?organisation_id=${ORG_ID}&agent_id=${AGENT_ID}"

# Get table columns
curl -s "${DATA_INGESTION_BASE_URL}/data/schema/result_metrics?organisation_id=${ORG_ID}&agent_id=${AGENT_ID}"
```

## 2. Schema Provisioning (one-time setup)

```bash
# Provision agent schema (creates result_* and feature_* tables)
curl -s -X POST ${DATA_INGESTION_BASE_URL}/admin/schema/provision/agent \
  -H "Content-Type: application/json" \
  -d '{"organisation_id": "'${ORG_ID}'", "agent_id": "'${AGENT_ID}'"}'
```

## 3. Data Ingestion (external sources)

```bash
# Trigger ingestion (e.g., Jira)
curl -s -X POST ${DATA_INGESTION_BASE_URL}/ingestion/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${ORG_ID}'",
    "agent_id": "'${AGENT_ID}'",
    "adapter": "jira",
    "config": {}
  }'
# Returns: {"job_id": "..."}

# Poll job status
curl -s "${DATA_INGESTION_BASE_URL}/ingestion/jobs/${JOB_ID}?organisation_id=${ORG_ID}&agent_id=${AGENT_ID}"
```

## 4. Query Data (read)

```bash
# Query entity tables (read-only, shared schema)
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/query \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${ORG_ID}'",
    "agent_id": "'${AGENT_ID}'",
    "table_name": "entity_commits",
    "schema_type": "shared",
    "filters": {"author_email": {"op": "eq", "value": "alice@example.com"}},
    "sort_by": "committed_at",
    "sort_order": "desc",
    "limit": 100
  }'

# Aggregation query
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/query/aggregate \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${ORG_ID}'",
    "agent_id": "'${AGENT_ID}'",
    "table_name": "result_metrics",
    "schema_type": "agent",
    "group_by": ["subject_id", "metric_name"],
    "aggregations": [{"column": "metric_value", "function": "avg"}],
    "filters": {"period_type": {"op": "eq", "value": "daily"}}
  }'
```

## 5. Write Results — THIS IS THE WRITE CONTRACT

### 5a. Write Metrics (POST /data/results/metrics)

Use for scores, numeric KPIs, quality ratings.

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/results/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${ORG_ID}'",
    "agent_id": "'${AGENT_ID}'",
    "run_id": "'${RUN_ID}'",
    "metrics": [
      {
        "subject_type": "developer",
        "subject_id": "alice",
        "period_type": "daily",
        "period_key": "2024-01-15",
        "metric_name": "commit_quality_score",
        "metric_value": 85.5,
        "confidence": 0.95
      },
      {
        "subject_type": "developer",
        "subject_id": "bob",
        "period_type": "daily",
        "period_key": "2024-01-15",
        "metric_name": "commit_quality_score",
        "metric_value": 72.0,
        "confidence": 0.90
      }
    ]
  }'
```

**MetricRecord fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| subject_type | string | yes | "developer", "repo", "sprint", "team" |
| subject_id | string | yes | Identifier (username, repo name, etc.) |
| period_type | string | no | "daily", "weekly", "monthly" (default: "daily") |
| period_key | string | yes | "2024-01-15", "2024-W03", "2024-01" |
| metric_name | string | yes | Snake_case metric name |
| metric_value | number | yes | The numeric value |
| confidence | float | no | 0.0–1.0 confidence score |
| provenance_json | object | no | Metadata about how the metric was computed |

### 5b. Write Artifacts (POST /data/results/artifacts)

Use for reports, charts, JSON snapshots, CSV data.

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/results/artifacts \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${ORG_ID}'",
    "agent_id": "'${AGENT_ID}'",
    "run_id": "'${RUN_ID}'",
    "artifacts": [
      {
        "artifact_type": "json",
        "artifact_key": "daily-report-2024-01-15",
        "period_type": "daily",
        "period_key": "2024-01-15",
        "data_json": {
          "title": "Daily Commit Quality Report",
          "generated_at": "2024-01-15T09:00:00Z",
          "authors": [
            {"name": "alice", "score": 85.5, "commits": 12},
            {"name": "bob", "score": 72.0, "commits": 5}
          ]
        }
      }
    ]
  }'
```

**ArtifactRecord fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| artifact_type | string | yes | "json", "csv", "chart_snapshot", "report" |
| artifact_key | string | yes | Unique key (e.g., "daily-report-2024-01-15") |
| data_json | object | yes | The artifact payload |
| period_type | string | no | "daily", "weekly", "monthly" |
| period_key | string | no | "2024-01-15" |

### 5c. Write Narratives (POST /data/results/narratives)

Use for LLM-generated summaries, analysis text, recommendations.

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/results/narratives \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${ORG_ID}'",
    "agent_id": "'${AGENT_ID}'",
    "run_id": "'${RUN_ID}'",
    "narratives": [
      {
        "subject_type": "team",
        "subject_id": "engineering",
        "period_type": "daily",
        "period_key": "2024-01-15",
        "narrative_type": "manager_summary",
        "content": "Today the team made 42 commits across 8 repos. Average quality: 78/100. Top performer: alice (85.5). Action needed: bob's test coverage dropped below 60%.",
        "model_used": "gpt-5.2"
      }
    ]
  }'
```

### 5d. Generic Write (POST /data/write)

For any table (result_metrics, result_artifacts, feature_* tables).

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/write \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${ORG_ID}'",
    "agent_id": "'${AGENT_ID}'",
    "run_id": "'${RUN_ID}'",
    "table_name": "result_metrics",
    "operation": "upsert",
    "records": [
      {
        "subject_type": "developer",
        "subject_id": "alice",
        "period_type": "daily",
        "period_key": "2024-01-15",
        "metric_name": "commit_score",
        "metric_value": 85.5,
        "confidence": 0.95
      }
    ],
    "conflict_columns": ["subject_type", "subject_id", "period_type", "period_key", "metric_name"]
  }'
```

### 5e. Batch Write (POST /data/write/batch)

Atomic multi-table write — metrics + artifacts + narratives in one call.

```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/write/batch \
  -H "Content-Type: application/json" \
  -d '{
    "organisation_id": "'${ORG_ID}'",
    "agent_id": "'${AGENT_ID}'",
    "run_id": "'${RUN_ID}'",
    "atomic": true,
    "items": [
      {
        "table_name": "result_metrics",
        "operation": "upsert",
        "records": [{"subject_type":"developer","subject_id":"alice","metric_name":"score","metric_value":85,"period_key":"2024-01-15"}],
        "conflict_columns": ["subject_type","subject_id","metric_name","period_key"]
      },
      {
        "table_name": "result_artifacts",
        "operation": "upsert",
        "records": [{"artifact_type":"json","artifact_key":"report-2024-01-15","data_json":{"title":"Daily Report"}}],
        "conflict_columns": ["artifact_type","artifact_key"]
      }
    ]
  }'
```

## 6. Available Tables

### Entity tables (read-only, schema_type: "shared")
| Table | Description |
|-------|-------------|
| entity_developers | Developer profiles |
| entity_repositories | Repository metadata |
| entity_commits | Git commits |
| entity_pull_requests | Pull requests |
| entity_issues | Issues (Jira, GitHub) |
| entity_sprints | Sprint data |

### Result tables (read-write, schema_type: "agent")
| Table | Description |
|-------|-------------|
| result_metrics | Numeric KPIs and scores |
| result_narratives | LLM-generated text summaries |
| result_artifacts | JSON/CSV/chart snapshots |
| result_developer_scores | Developer score breakdowns |
| result_commit_analysis | Per-commit analysis data |

### Feature tables (read-write, schema_type: "agent")
| Table | Description |
|-------|-------------|
| feature_developer_activity_daily | Daily developer activity features |
| feature_repo_activity_daily | Daily repo activity features |

## 7. Rules for Generated Systems

1. **ALWAYS** use upsert operation for writes (never insert — avoids duplicate errors)
2. **ALWAYS** include `run_id` in every write request (audit trail)
3. **ALWAYS** provision the agent schema on first run: `POST /admin/schema/provision/agent`
4. **NEVER** pass database credentials in API requests (env vars handle auth)
5. **schema_type: "shared"** for entity_* tables (read-only ingested data)
6. **schema_type: "agent"** for result_*/feature_* tables (agent-written data)
7. **conflict_columns** are required for upsert — choose columns that form a natural key
8. Env vars needed: `DATA_INGESTION_BASE_URL`, `DATA_INGESTION_ORG_ID`, `DATA_INGESTION_AGENT_ID`

## 8. Python Helper Pattern (for generated skills)

```python
import os, json, urllib.request, uuid

BASE_URL = os.environ["DATA_INGESTION_BASE_URL"]
ORG_ID = os.environ["DATA_INGESTION_ORG_ID"]
AGENT_ID = os.environ["DATA_INGESTION_AGENT_ID"]
RUN_ID = os.environ.get("RUN_ID", str(uuid.uuid4()))

def write_metrics(metrics: list[dict]) -> dict:
    """Write metric records to result_metrics via the ingestion API."""
    payload = {
        "organisation_id": ORG_ID,
        "agent_id": AGENT_ID,
        "run_id": RUN_ID,
        "metrics": metrics,
    }
    req = urllib.request.Request(
        f"{BASE_URL}/data/results/metrics",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def write_artifacts(artifacts: list[dict]) -> dict:
    """Write artifact records to result_artifacts via the ingestion API."""
    payload = {
        "organisation_id": ORG_ID,
        "agent_id": AGENT_ID,
        "run_id": RUN_ID,
        "artifacts": artifacts,
    }
    req = urllib.request.Request(
        f"{BASE_URL}/data/results/artifacts",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def write_narratives(narratives: list[dict]) -> dict:
    """Write narrative records to result_narratives via the ingestion API."""
    payload = {
        "organisation_id": ORG_ID,
        "agent_id": AGENT_ID,
        "run_id": RUN_ID,
        "narratives": narratives,
    }
    req = urllib.request.Request(
        f"{BASE_URL}/data/results/narratives",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def query_data(table_name: str, schema_type: str = "agent", filters: dict = None, limit: int = 100) -> dict:
    """Query data from entity or result tables."""
    payload = {
        "organisation_id": ORG_ID,
        "agent_id": AGENT_ID,
        "table_name": table_name,
        "schema_type": schema_type,
        "limit": limit,
    }
    if filters:
        payload["filters"] = filters
    req = urllib.request.Request(
        f"{BASE_URL}/data/query",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())
```

Generated skills SHOULD import or copy this pattern rather than writing raw curl/HTTP from scratch.
