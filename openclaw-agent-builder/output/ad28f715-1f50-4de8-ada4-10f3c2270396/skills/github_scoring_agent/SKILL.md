# github_scoring_agent

Computes per-developer scores from GitHub-ingested data (best-effort).

## Inputs

- `run_id` (string, required)
- `date` (string, optional, YYYY-MM-DD; default: today UTC)

## Outputs

```json
{
  "run_id": "...",
  "date": "2026-03-13",
  "result_developer_scores_rows": [ ... ],
  "result_metrics_rows": [ ... ],
  "aggregated_results": [ ... ],
  "warnings": [ ... ]
}
```

## Source tables (best-effort)

GitHub ingestion schemas vary. This skill tries tables in order:

- `github_pull_request`
- `github_pull_requests`
- `pull_request`

Preferred fields:
- `author_login`, `user_login`, `author`
- `merged_at`, `updated_at`, `created_at`

If none exist, the skill emits **zero-score** rows for mapped developers and includes TODO warnings.

## Writes

- `result_developer_scores`
- `result_metrics`

All rows include `run_id`.
