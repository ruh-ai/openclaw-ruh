# LEARNING: Connector Status Summaries Must Stay Mutually Exclusive

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-tool-integration-workspace]] | [[008-agent-builder-ui]]

## Context

`Tester-1` added focused coverage around the Google Ads MCP-first create-flow reopen path. The target was `agent-builder-ui/lib/tools/tool-integration.ts`, where connector metadata is reconciled against saved credential summaries before Configure, Review, and Deploy reuse the same `configSummary` strings.

## What Was Learned

When a credential-backed connector moves between `configured` and `missing_secret`, the summary copy must be normalized at the same time as the status flag. Leaving both `"Credentials stored securely"` and `"Credentials still required"` in `configSummary` makes reopen and review surfaces contradict the underlying connector state even when the status enum itself is correct.

## Evidence

- A new regression in `agent-builder-ui/lib/tools/tool-integration.test.ts` reproduced the downgrade case by reconciling a saved `google-ads` connector with no credential summary present.
- The failing red-state output showed `reconcileToolConnections()` returning `status: "missing_secret"` while keeping both summary strings.
- `agent-builder-ui/lib/tools/tool-integration.ts` now strips the opposite credential-status string before adding the current one, so downgrade and upgrade transitions keep summary copy aligned with the enum.
- Verification command: `bun test agent-builder-ui/lib/tools/tool-integration.test.ts`

## Implications For Future Agents

- Treat connector `status` and `configSummary` as one truthfulness contract; changing one without normalizing the other can leak contradictory UI state into reopen, review, and deploy summaries.
- Prefer helper-level regression coverage for connector-status transitions because both reopen reconciliation and post-save finalization share the same summary-normalization path.
- Future connector-readiness work should continue separating raw credential presence from runtime validation state, but should not reintroduce mixed summary strings during intermediate transitions.

## Links
- [[008-agent-builder-ui]]
- [[SPEC-tool-integration-workspace]]
- [Journal entry](../../journal/2026-03-28.md)
