# LEARNING: Builder improvements still stop at connector advice

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-improvement-persistence]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active Google Ads focus was re-checked after the repo had already shipped persisted `improvements[]`, accepted-improvement connector projection, trigger truthfulness, Co-Pilot review readiness, and runtime-input persistence. The remaining question was whether the "iterative and self-improving" focus area was now represented end to end, or whether the improvement system still stopped short of turning builder advice into saved config outside the connector case.

## What Was Learned

The saved improvement model is broader than the live implementation. The repo can persist `trigger` and `workflow` improvement categories, but the current builder derivation and config projector still only handle `tool_connection`.

## Evidence

- `agent-builder-ui/lib/agents/types.ts` defines `AgentImprovement.kind` as `tool_connection | trigger | workflow`.
- `docs/knowledge-base/specs/SPEC-agent-improvement-persistence.md` explicitly documents those same improvement kinds in the saved contract.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` derives only `connect-google-ads` and `connect-google-workspace` recommendations from `toolConnectionHints[]`; it does not derive any trigger or workflow improvements from `triggerHints[]` or schedule metadata.
- `agent-builder-ui/app/(platform)/agents/create/create-session-config.ts` projects accepted improvements only into `toolConnections[]`; it never materializes accepted trigger guidance into structured `triggers[]`.
- `agent-builder-ui/lib/openclaw/wizard-directive-parser.ts` and `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` already normalize `schedule_description`, `cron_expression`, `requirements.schedule`, and trigger hints such as `cron-schedule`, so the missing piece is projection/decision logic rather than missing raw metadata.

## Implications For Future Agents

- Do not assume the shipped improvement system already fulfills the full "self-improving creation loop" focus. Today it only makes connector advice durable.
- When adding new builder recommendation categories, reuse the existing `improvements[]` contract and accepted-improvement projection path instead of inventing recommendation-specific side channels.
- Treat trigger recommendations as the next credible proving-case slice because the Google Ads flow already carries structured schedule metadata and a truthful trigger catalog; the remaining gap is turning accepted advice into saved `triggers[]` state.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agent-improvement-persistence]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-27.md)
