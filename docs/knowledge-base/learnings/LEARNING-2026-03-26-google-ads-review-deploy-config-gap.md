# LEARNING: Review and deploy still flatten the saved Google Ads config contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

This analyst run reviewed the active Google Ads creation-focus lane after the repo had already shipped structured `toolConnections[]`, secure credential summaries, and structured `triggers[]` persistence for saved agents. The goal was to identify the highest-value missing feature package that was still not already represented in `TODOS.md`.

## What Was Learned

The saved Google Ads config contract is now richer than the operator-facing review, improve, and deploy surfaces that are supposed to explain it.

- `ReviewAgent.tsx` still derives trigger rows from `workflow.steps.slice(0, 3)` and stores them as simple `{ icon, text }` items, so the review step cannot tell operators whether a trigger is supported, unsupported, scheduled, or webhook-based.
- The deploy page still summarizes an agent as skill count plus `triggerLabel`, which discards persisted connector readiness (`configured`, `missing_secret`, `unsupported`) immediately before deployment.
- The Google Ads proving-case focus now depends on structured tool and trigger state surviving save, reopen, deploy, and improve, so flattening those surfaces back into mock text makes the product look less truthful than the backend/runtime contract already is.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx` initializes `triggers` from `workflow.steps.slice(0, 3)` instead of from saved `triggers[]`.
- `agent-builder-ui/app/(platform)/agents/create/_components/review/types.ts` only models `TriggerItem` as `{ icon, text }`.
- `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` shows `agent.skills.length` and `agent.triggerLabel` in the summary card, with no connector or trigger-readiness surface.
- `agent-builder-ui/lib/openclaw/agent-config.ts` already applies structured triggers and MCP credentials, proving the runtime contract is more expressive than these operator-facing summaries.

## Implications For Future Agents

- Treat structured `toolConnections[]` and `triggers[]` as the canonical operator-facing config contract, not just a persistence detail.
- Do not add more Google Ads create-flow or Improve Agent work that relies on `triggerLabel` or workflow-step guesses for user-visible state.
- When extending review or deploy UX, keep credential values masked and surface only safe readiness/status metadata.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
