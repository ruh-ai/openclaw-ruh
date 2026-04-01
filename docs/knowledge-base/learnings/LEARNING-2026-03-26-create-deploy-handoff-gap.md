# LEARNING: `/agents/create` still does not hand off into the real first-deploy flow

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-agent-builder-gated-skill-tool-flow]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run re-checked the active Google Ads creation-focus lane after the repo had already added AG-UI draft autosave, saved config truthfulness, persisted improvements, and deploy-readiness backlog coverage. The goal was to find the single highest-value missing feature package that still was not captured in `TODOS.md`.

## What Was Learned

The create flow still does not enter the real deployment workflow after the operator presses a deploy-labeled action.

- For a brand-new agent, both completion handlers in `agent-builder-ui/app/(platform)/agents/create/page.tsx` save or promote the agent, commit any first-save credentials, and then route directly to `/agents`.
- The actual sandbox-create and config-apply runtime still lives in `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, but `/agents/create` never hands off into that route for the first deployment.
- This is now a product-contract mismatch, not just a UX nit: the final CTA is labeled `Deploy Agent`, and `[[011-key-flows]]` documents the create journey as if deployment happens after Review/Configure.
- Existing deploy-readiness work is adjacent but not sufficient. A deploy blocker contract matters only after the create flow actually enters the deploy surface or launch path.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` ends both `handleComplete()` and `handleCoPilotComplete()` with `router.push("/agents")` after save and credential-commit work.
- The same file never routes a newly created agent to `app/(platform)/agents/[id]/deploy/page.tsx` and never starts a sandbox-create stream itself.
- `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` owns the real first-deploy behavior through `startDeploy()`: create sandbox, stream provisioning logs, push agent config, and attach the sandbox to the saved agent.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx` renders the final action as `Deploy Agent`, reinforcing the operator expectation that deployment will begin from the create flow.
- `docs/knowledge-base/011-key-flows.md` still describes create as a continuous build → review → configure → deploy flow.

## Implications For Future Agents

- Treat the missing create-to-deploy handoff as its own worker package rather than assuming deploy-readiness or deploy-summary tasks already cover it.
- Keep new-agent first deployment distinct from Improve Agent hot-push behavior; those flows should not be collapsed into one generic completion path.
- When this handoff is implemented, update the KB flow notes so the documented first-deploy behavior matches the shipped route and confirmation semantics exactly, then link the shipped contract from [[SPEC-agent-create-deploy-handoff]].

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-agent-create-deploy-handoff]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-agent-builder-gated-skill-tool-flow]]
- [Journal entry](../../journal/2026-03-26.md)
