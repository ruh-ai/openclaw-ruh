# Dev Productivity Scoreboard (OpenClaw)

Automates periodic developer scoring from Jira + GitHub using the **data-ingestion-openclaw** service, produces:

- `result_developer_scores` (intermediate per-source scores)
- `result_metrics` (dashboard rollups)
- `result_narratives` (daily narrative report)

## Requirements

Environment variables:

- `DATA_INGESTION_BASE_URL`
- `DATA_INGESTION_ORG_ID`
- `DATA_INGESTION_AGENT_ID`
- `DATA_INGESTION_TOKEN` (optional)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Optional:
- `DEV_MAPPING_JSON` - JSON array of developer mappings to seed `entity_developer_mapping`.

Example `DEV_MAPPING_JSON`:

```json
[
  {"email":"alice@company.com","jira_username":"alice","github_username":"alice-gh","display_name":"Alice"},
  {"email":"bob@company.com","jira_username":"bob","github_username":"bob-gh","display_name":"Bob"}
]
```

## Workflows (UTC)

- `workflows/jira-every-6h.yaml` (cron: `0 */6 * * *`)
- `workflows/github-daily.yaml` (cron: `15 0 * * *`)
- `workflows/orchestrator-daily-0700.yaml` (cron: `0 7 * * *`)

## Notes

- Skills are written to be runnable locally; when `DATA_INGESTION_BASE_URL` is missing they will no-op and return stub output.
- IDs are deterministic hashes and writes use upserts with conflict keys.
- GitHub adapter/table names can vary by ingestion setup; the GitHub scoring skill uses best-effort reads and emits TODOs when source tables are missing.
