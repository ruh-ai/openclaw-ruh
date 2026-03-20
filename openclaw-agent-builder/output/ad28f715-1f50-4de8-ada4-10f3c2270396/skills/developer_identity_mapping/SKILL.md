# developer_identity_mapping

Ensures the **identity mapping** table exists and (optionally) seeds it.

## Table

`entity_developer_mapping(email, jira_username, github_username, display_name)`

- `email` is the primary identity key used downstream.

## Inputs

- `run_id` (string, required)
- `seed_json` (string, optional): JSON array of mapping rows.
- `write` (bool, optional, default false): if true, writes the seed rows to ingestion.

If `seed_json` is omitted, the skill will look for `DEV_MAPPING_JSON` env var.

## Outputs

```json
{
  "run_id": "...",
  "existing_count": 0,
  "seed_count": 2,
  "wrote": true
}
```

## Notes

- Uses upsert with conflict key `email`.
- If the ingestion service/table is missing, the skill will emit a warning and no-op.
