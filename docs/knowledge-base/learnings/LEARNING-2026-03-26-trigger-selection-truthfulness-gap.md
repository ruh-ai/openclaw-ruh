# LEARNING: Trigger selection still over-promises runtime support before deploy

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-agent-webhook-trigger-runtime]] | [[013-agent-learning-system]]

## Context

During the 2026-03-26 Analyst-1 backlog review for the active Google Ads create-flow focus, the repo was re-inspected after the saved trigger contract, review/deploy summaries, connector truthfulness, and deploy-readiness packages were already represented. The remaining question was whether trigger selection itself had become truthful enough to support the focus document's "runtime-backed trigger options only" requirement.

## What Was Learned

Trigger persistence and deploy summaries have improved, but the Configure picker still over-promises the live runtime surface. `StepSetTriggers.tsx` continues to use `MOCK_TRIGGER_CATEGORIES`, still labels both `cron-schedule` and `chat-command` as supported, and defaults its AI-suggest path to `chat-command` when it cannot infer a schedule. That is not aligned with the current runtime contract: `buildCronJobs()` only materializes supported schedule triggers, and webhook runtime remains a separate active package. Future work should treat trigger selection truthfulness as its own feature package instead of assuming deploy-readiness alone fixes the operator-facing mismatch.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepSetTriggers.tsx` imports `MOCK_TRIGGER_CATEGORIES` and sets `SUPPORTED_TRIGGER_IDS = new Set(["cron-schedule", "chat-command"])`.
- The same file's `Suggest with AI` action adds `chat-command` whenever it finds no schedule keywords, making an unsupported runtime path the default fallback recommendation.
- `agent-builder-ui/lib/openclaw/agent-config.ts` only converts supported schedule triggers into deploy-time `cron_jobs`, so there is no matching runtime materialization for `chat-command`.
- [[SPEC-google-ads-agent-creation-loop]] already says unsupported trigger cards may remain visible only if they are clearly marked unavailable and are not presented as deployable behavior.
- [[SPEC-agent-webhook-trigger-runtime]] owns the future signed inbound webhook path, so selection-time truthfulness should compose with that task rather than pretending the webhook/runtime contract already exists.

## Implications For Future Agents

- Treat trigger selection truthfulness as a separate operator-facing package from deploy-readiness and from webhook runtime delivery.
- When modifying `StepSetTriggers.tsx`, prefer one shared runtime-backed trigger catalog over more hard-coded `SUPPORTED_TRIGGER_IDS` logic.
- Do not use `chat-command` or broad mock trigger categories as the default "AI suggested" create-flow path unless a real runtime owner has landed for that trigger.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-agent-webhook-trigger-runtime]]
- [Journal entry](../../journal/2026-03-26.md)
