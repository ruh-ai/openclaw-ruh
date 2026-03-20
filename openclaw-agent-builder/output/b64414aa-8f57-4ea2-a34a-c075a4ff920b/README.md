# Jira Sprint Metrics (velocity + cycle time)

Daily workflow (09:00 UTC) that:
1. Triggers / verifies Jira ingestion (projects, users, sprints, issues)
2. Computes sprint velocity (story points) and cycle time (In Progress → Done)
3. Writes:
   - metrics to `result_metrics`
   - narrative summaries to `result_narratives`

## Prereqs

This system relies on the **data-ingestion-openclaw** skill and the ingestion service.

Required environment variables (provided by your OpenClaw deployment):
- `DATA_INGESTION_BASE_URL`
- `DATA_INGESTION_ORG_ID`
- `DATA_INGESTION_AGENT_ID`
- `DATA_INGESTION_TOKEN` (optional if your service is open)

## Run locally (manual)

```bash
cd /home/daytona/.openclaw/workspace/output/b64414aa-8f57-4ea2-a34a-c075a4ff920b
bash setup.sh

RUN_ID="manual-$(date -u +%Y%m%dT%H%M%SZ)"
python3 skills/jira_entity_sync_daily/skill.py --run-id "$RUN_ID"
python3 skills/compute_sprint_metrics/skill.py --run-id "$RUN_ID" > /tmp/metrics.json
python3 skills/write_results_metrics_narratives/skill.py --run-id "$RUN_ID" --input /tmp/metrics.json
```

To actually write to the ingestion service, pass `--write` to the `write_results_metrics_narratives` skill.

## Workflow

See `workflows/daily-0900-utc.yaml`.

## Notes / TODOs

Jira entity table names and Jira ingestion trigger payloads can vary by ingestion service implementation.
The sync and compute steps are implemented defensively:
- try multiple candidate table names
- proceed with empty datasets if unavailable

When you know the exact ingestion adapter payload and the canonical entity table names, update:
- `skills/jira_entity_sync_daily/skill.py` (trigger payload + mapping)
- `src/common/jira_schema_hints.py` (table candidates + field names)
