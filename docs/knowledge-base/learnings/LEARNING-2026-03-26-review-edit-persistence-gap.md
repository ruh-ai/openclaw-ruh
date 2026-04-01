# LEARNING: Review edits must write back into canonical create-session state

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

The Google Ads create flow now has a page-owned in-flight config snapshot for tools, selected skills, and structured triggers. Review also exposes editable `Skills` and `Triggers` sections before the operator proceeds to Configure or deploy.

## What Was Learned

- `ReviewAgent.tsx` returns edited `skills[]` and `triggers[]` through `ReviewAgentOutput`, so the UI contract already treats those sections as operator-controlled state rather than read-only summaries.
- `page.tsx` currently handles `onConfirm()` by persisting only `name`, `rules`, and `improvements`; it does not project `output.skills` or `output.triggers` back into `createSessionConfig`.
- Final save/deploy still reads `createSessionConfig.selectedSkills` and `createSessionConfig.triggers`, which means Review-confirm can silently discard operator-approved edits and persist the stale pre-review defaults instead.
- The durable fix is a shared review-confirm projection helper in `create-session-config.ts`, not one-off mutations in `page.tsx`, so future Review edits can reuse the same canonical skill-id and trigger-definition mapping path.

## Evidence

- [`agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx) exposes editable `Skills` and `Triggers` sections and confirms the full `data` object through `onConfirm(data)`.
- [`agent-builder-ui/app/(platform)/agents/create/page.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/page.tsx) updates only review name/rules/improvements in the Review confirm handler, then later persists skills/triggers from `createSessionConfig` during completion.
- [`docs/knowledge-base/specs/SPEC-google-ads-agent-creation-loop.md`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/specs/SPEC-google-ads-agent-creation-loop.md) already says Review and Configure should share the same in-flight snapshot, which means a display-only Review fork is a contract violation.
- [`agent-builder-ui/app/(platform)/agents/create/create-session-config.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/create-session-config.ts) now contains `applyReviewOutputToCreateSessionConfig()`, which maps confirmed review skill labels back onto graph ids and rebuilds structured trigger selections before Configure/save read the session snapshot.

## Implications For Future Agents

- Treat editable Review sections as authoritative state. If Review allows edits, confirming Review must write those edits back into the canonical create-session contract immediately.
- Do not rely on display-only `reviewOutput` fields for anything that save/deploy, test chat, or Improve Agent reopen should honor later; project them into the page-owned state first.
- When Review edits need canonical ids, add one explicit mapping helper from user-visible labels back to saved skill ids or trigger definitions instead of silently falling back to stale defaults.
- Keep the canonical mapping logic close to the create-session contract, where tests can cover skill-id normalization and trigger rebuilding without depending on the whole page component tree.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
