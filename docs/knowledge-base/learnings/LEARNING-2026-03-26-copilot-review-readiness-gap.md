# LEARNING: The default Co-Pilot review step still hides saved-config readiness details

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-copilot-config-workspace]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run reviewed the active Google Ads create-flow lane after the repo had already shipped persisted `toolConnections[]`, structured `triggers[]`, saved-config Review truthfulness, and deploy summaries. The goal was to identify the single highest-value missing feature package that was still not represented in `TODOS.md`.

## What Was Learned

The product's default Co-Pilot review surface is now the main `/agents/create` path, but it still reduces saved config to plain connector and trigger names. That means the operator cannot tell from the default review step whether a Google connector is `configured`, still `missing_secret`, or only a manual-plan entry, nor whether a trigger is supported or unsupported, even though the repo already has shared formatter helpers that expose exactly those states for the richer Review and Deploy surfaces.

- `WizardStepRenderer.tsx` summarizes tools with `store.connectedTools.map((t) => t.name).join(", ")` and triggers with `store.triggers.map((t) => t.title || t.id).join(", ")`.
- The same review step only shows a blocker banner for unresolved custom skills; it does not project connector or trigger readiness.
- `ReviewAgent.tsx` already uses `buildReviewToolItems()` and `buildReviewTriggerItems()` from `operator-config-summary.ts`, so the repo already has one safe structured display contract for `configured`, `missing_secret`, `unsupported`, and supported-vs-unsupported triggers.
- The KB/spec layer now describes Review as showing persisted tool/trigger readiness, which means the shipped default Co-Pilot review path has drifted behind the documented contract.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx` uses plain text `SummaryRow` values for tools and triggers in `ReviewSummary()`.
- `agent-builder-ui/lib/agents/operator-config-summary.ts` already formats `ReviewToolItem`, `ReviewTriggerItem`, and `DeployConfigSummary` with safe readiness labels and detail text.
- `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx` consumes those formatter helpers directly for the richer review surface.
- `docs/knowledge-base/008-agent-builder-ui.md` and `docs/knowledge-base/specs/SPEC-google-ads-agent-creation-loop.md` describe Review as showing persisted connector readiness and trigger support/runtime details.

## Implications For Future Agents

- Treat Co-Pilot review parity as a distinct feature package, not as a side note under deploy gating. The operator needs truthful readiness detail before the deploy button logic matters.
- Reuse the shared formatter/readiness helpers instead of adding a third review-specific summary model.
- Keep future deploy-blocking work and Co-Pilot review copy on the same blocker categories so the default Google Ads flow teaches one readiness contract from review through deploy.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-copilot-config-workspace]]
- [Journal entry](../../journal/2026-03-26.md)
