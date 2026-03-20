---
name: compute_sprint_metrics
version: 1.0.0
description: "Compute sprint velocity (story points) and cycle time (In Progress→Done) per sprint and per developer from Jira entities stored in the ingestion service."
user-invocable: false
metadata:
  openclaw:
    depends_on: [jira_entity_sync_daily]
    requires:
      env: [DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID]
---

# Compute Sprint Metrics

## What it does

Reads Jira entities (prefer agent-owned copies created by `jira_entity_sync_daily`) and computes:
- **Velocity**: total story points completed per sprint; also split by developer
- **Cycle time**: average days from first `In Progress` to first `Done`; also split by developer

## Inputs

- `run_id` (required)

## Environment

- `DATA_INGESTION_BASE_URL`
- `DATA_INGESTION_ORG_ID`
- `DATA_INGESTION_AGENT_ID`
- `DATA_INGESTION_TOKEN` (optional)

## Output

JSON to stdout:
- `result_metrics_rows`: rows for table `result_metrics`
- `result_narratives_rows`: rows for table `result_narratives`

These rows are *not* written by this skill; the next skill (`write_results_metrics_narratives`) is responsible for writing.

## Assumptions / TODOs

Because Jira field names differ by configuration, this skill uses best-effort field-name hints in `src/common/jira_schema_hints.py`.
Update those hints for your environment to improve accuracy.
