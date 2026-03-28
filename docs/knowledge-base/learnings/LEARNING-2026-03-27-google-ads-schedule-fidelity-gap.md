# LEARNING: Google Ads schedule fidelity gap in the create flow

[[000-INDEX|← Index]] | [[SPEC-google-ads-agent-creation-loop]] | [[008-agent-builder-ui]]

## Context

The active [[SPEC-analyst-project-focus]] steering and [[SPEC-google-ads-agent-creation-loop]] treat a Google Ads agent with a truthful weekday schedule as the proving case for the current builder lane. During backlog analysis on 2026-03-27, the live create-flow code showed that trigger-id truthfulness had landed, but schedule-payload fidelity had not.

## What changed in my understanding

- `wizard-directive-parser.ts` and `builder-agent.ts` already receive architect schedule metadata such as `schedule_description`, `cron_expression`, and `requirements.schedule`, so the system has structured timing intent before Configure opens.
- The downstream trigger path still collapses that intent to the supported trigger id `cron-schedule`; `trigger-catalog.ts` seeds any supported schedule trigger with `existing?.schedule ?? "0 9 * * 1-5"`.
- `StepSetTriggers.tsx` exposes supported-vs-unsupported trigger state but no bounded editor or explicit truth surface for the actual schedule payload that save/reopen/deploy will use.
- `buildCronJobs()` already prefers `triggers[].schedule`, so the missing seam is frontend/state fidelity rather than backend deploy support.

## Why it matters

Google Ads operators can currently see a truthful supported trigger selection while still deploying the wrong cadence. That is a worse product failure than a purely decorative card because the builder appears correct, the review surface can stay plausible, and the runtime still receives the fallback default unless another path injected the real schedule.

## Guidance for future agents

- Treat supported-trigger truthfulness and schedule-payload fidelity as separate contracts. A truthful trigger id is not enough if the saved `schedule` value is still a generic fallback.
- Reuse one normalization path for architect schedule metadata across AG-UI, the advanced Configure flow, and the default Co-Pilot flow. Do not let each surface invent its own default cron.
- When adding schedule editing, keep review/reopen/deploy on the same `triggers[].schedule` source of truth rather than re-parsing prose rules.

## Related Notes

- [[SPEC-google-ads-agent-creation-loop]] — the proving-case schedule contract that this gap prevents from being fully truthful
- [[008-agent-builder-ui]] — the create-flow builder/configure surfaces where the schedule currently loses fidelity
- [[011-key-flows]] — the end-to-end Google Ads flow should preserve the same supported schedule through review, save, reopen, and deploy
