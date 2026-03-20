---
name: lobster-gen
version: 1.0.0
description: "Generate Lobster workflow YAML files from a skill graph DAG. Creates deterministic, step-by-step pipelines with proper dependencies, approval gates, and mandatory write_results terminal step."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [python3]
---

# Lobster Workflow Generator

Generate deterministic Lobster workflow YAML from a skill graph.

## Input

A skill graph with nodes and dependency edges:
```json
{
  "system_name": "my-system",
  "nodes": [
    { "skill_id": "data-ingestion-openclaw", "depends_on": [] },
    { "skill_id": "process-data", "depends_on": ["data-ingestion-openclaw"] },
    { "skill_id": "analyze-results", "depends_on": ["process-data"] }
  ]
}
```

## Generation Rules

1. **Topological sort** the skill graph — respect all dependency edges
2. **Prepend standard steps**: `provision_schema` (run_once) -> `ingest_data` -> `poll_ingestion`
3. **Insert processing steps** in topological order
4. **Append terminal step**: `write_results` using `batch_write` — ALWAYS last
5. **Add approval gates** where the developer requested them (`type: human_approval`)
6. **Set timeouts**: Default 60s per step, 300s for ingestion polling

## Output Format

```yaml
name: "<system-name>-workflow"
description: "Generated workflow for <description>"
version: "1.0.0"

steps:
  - id: provision
    action: provision_schema
    skill: data-ingestion-openclaw
    input:
      organisation_id: "${env.DATA_INGESTION_ORG_ID}"
      agent_id: "${env.DATA_INGESTION_AGENT_ID}"
    run_once: true
    timeout_ms: 30000

  - id: ingest
    action: trigger_ingestion
    skill: data-ingestion-openclaw
    input:
      connector_type: "${config.connector_type}"
      connector_id: "${config.connector_id}"
      entities: "${config.entities}"
    wait_for: [provision]
    timeout_ms: 60000

  - id: poll_ingestion
    action: poll_job_status
    skill: data-ingestion-openclaw
    input:
      job_id: "${ingest.job_id}"
    wait_for: [ingest]
    timeout_ms: 300000
    poll_interval_ms: 5000

  # --- Processing steps (dynamically generated) ---

  - id: write_results
    action: batch_write
    skill: data-ingestion-openclaw
    input:
      items: "${aggregated_results}"
      atomic: true
    wait_for: ["${last_processing_step}"]
    timeout_ms: 60000
```

## Validation

Before outputting, validate:
- No cycles in the DAG
- Every step has a unique `id`
- All `wait_for` references point to existing step IDs
- `write_results` is the last step and depends on all processing steps
- `provision` step has `run_once: true`
