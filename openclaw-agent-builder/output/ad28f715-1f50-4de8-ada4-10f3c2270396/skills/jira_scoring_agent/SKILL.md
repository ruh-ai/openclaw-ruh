# jira_scoring_agent

Computes per-developer scores from Jira-ingested data.

## Inputs

- `run_id` (string, required)
- `date` (string, optional, YYYY-MM-DD; default: today UTC)

## Outputs

Returns workflow-friendly JSON with prebuilt upsert items:

```json
{
  "run_id": "...",
  "date": "2026-03-13",
  "result_developer_scores_rows": [ ... ],
  "result_metrics_rows": [ ... ],
  "aggregated_results": [ ... ]
}
```

## Writes

- `result_developer_scores` (intermediate Jira scores)
- `result_metrics` (basic Jira rollups)

All rows include `run_id`.

## Implementation notes

Jira table/field names vary by ingestion adapter. This skill uses best-effort heuristics:

- Preferred source table: `jira_issue`
- Preferred fields: `assignee_email`, `assignee`, `story_points`, `status_category`, `updated_at`

If no Jira table exists, the skill will still emit **zero-score** rows for mapped developers (so downstream reports stay stable).
