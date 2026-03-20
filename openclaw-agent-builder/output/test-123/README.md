# test-123

Generated OpenClaw system containing a single custom skill `test` plus required `data-ingestion-openclaw` integration.

## What’s Included
- `skills/test` — minimal custom skill implementation + docs
- `workflows/main-workflow.yaml` — Lobster workflow that provisions schema, runs the skill, then writes results via `data-ingestion-openclaw`

## Notes
- All result writes include `run_id` and use upsert semantics via the data-ingestion service.
