---
name: jira_entity_sync_daily
version: 1.0.0
description: "Daily Jira entity sync (projects, users, sprints, issues) via data-ingestion service. Copies entities into agent-owned tables for stable downstream metrics computation."
user-invocable: false
metadata:
  openclaw:
    depends_on: [data-ingestion-openclaw]
    requires:
      env: [DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID]
---

# Jira Entity Sync (Daily)

## What it does

1) Best-effort triggers the ingestion adapter for `connector_type=jira`.
2) Queries Jira entities from the ingestion service (shared schema).
3) Upserts them into agent-owned tables:
- `jira_projects`
- `jira_users`
- `jira_sprints`
- `jira_issues`

This makes downstream computations resilient to changes in shared schema/table names.

## Inputs

- `run_id` (required)

## Environment variables

- `DATA_INGESTION_BASE_URL` (required)
- `DATA_INGESTION_ORG_ID` (required)
- `DATA_INGESTION_AGENT_ID` (required)
- `DATA_INGESTION_TOKEN` (optional)

## Output

JSON to stdout:
- `sync_summary`: counts per entity type
- `source_tables`: chosen shared-source tables

## Notes / TODOs

The ingestion trigger payload may differ across deployments.
This skill will continue even if triggering ingestion fails, and will attempt to query existing tables.

Update `src/common/jira_schema_hints.py` and the `trigger_ingestion()` payload in `skill.py` once your ingestion service conventions are known.
