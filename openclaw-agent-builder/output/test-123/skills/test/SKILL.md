---
name: test
version: 1.0.0
description: "Minimal custom skill used for factory smoke tests. Generates a tiny result payload and demonstrates mandatory data-ingestion-openclaw integration patterns (upsert + run_id)."
user-invocable: true
metadata:
  openclaw:
    always: true
    requires:
      bins: [python3]
      env: [DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID]
    primaryEnv: DATA_INGESTION_BASE_URL
---

# Test Skill

## Actions

### `run`
Generates a minimal result payload (including `run_id`) suitable for `data-ingestion-openclaw.batch_write`.

**Input**
- `run_id` (string, required)
- `message` (string, optional)

**Output**
- `aggregated_results` (array) — items for `data-ingestion-openclaw` batch writes

## Data-ingestion Integration (MANDATORY pattern)
- Use **upsert** semantics when writing.
- Always include `run_id` in any write.
- Target agent-owned tables (e.g. `result_test_runs`).

This skill includes a reference implementation in `skill.py` that can call `/data/write/batch` directly (or just print the payload if env vars are missing).
