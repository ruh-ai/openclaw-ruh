# daily_orchestrator_report

Builds the final daily narrative report and persists it.

## Inputs

- `run_id` (string, required)
- `date` (string, optional, YYYY-MM-DD; default: today UTC)
- `no_write` (bool flag, optional): disable writes (default behavior is to write `result_narratives` and a couple rollup metrics).

## Reads

- `entity_developer_mapping`
- `result_developer_scores`

## Writes

- `result_narratives`
- `result_metrics` (rollups: total_score, active_developers)

All rows include `run_id` and deterministic `id`.

## Outputs

```json
{
  "run_id": "...",
  "date": "2026-03-13",
  "telegram_message": "...",
  "result_narratives_rows": [ ... ],
  "result_metrics_rows": [ ... ]
}
```
