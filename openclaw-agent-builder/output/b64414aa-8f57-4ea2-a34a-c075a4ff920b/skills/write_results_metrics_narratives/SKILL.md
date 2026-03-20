---
name: write_results_metrics_narratives
version: 1.0.0
description: "Prepare (and optionally write) result_metrics and result_narratives upserts via data-ingestion service. Emits aggregated_results for workflow terminal batch_write step."
user-invocable: false
metadata:
  openclaw:
    depends_on: [compute_sprint_metrics]
    requires:
      env: [DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID]
---

# Write Results (metrics + narratives)

## What it does

- Accepts computed rows from `compute_sprint_metrics`
- Builds `/data/write/batch` items for:
  - `result_metrics`
  - `result_narratives`
- Emits `aggregated_results` for the workflow's terminal `write_results` step (which calls `data-ingestion-openclaw` skill `batch_write`).

Optionally, it can write directly to the ingestion service when run manually (`--write`).

## Inputs

- `run_id` (required)
- `--input <path>`: JSON output from `compute_sprint_metrics` (optional; defaults to stdin)
- `--metrics-json <json>` and `--narratives-json <json>`: workflow-friendly JSON array strings (override stdin)

## Env

- `DATA_INGESTION_BASE_URL`
- `DATA_INGESTION_ORG_ID`
- `DATA_INGESTION_AGENT_ID`
- `DATA_INGESTION_TOKEN` (optional)

## Output

JSON to stdout with:
- `aggregated_results`: items suitable for `/data/write/batch`
