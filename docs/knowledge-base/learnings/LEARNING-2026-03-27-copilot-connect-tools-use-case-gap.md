# LEARNING: Default Co-Pilot Connect Tools can lose the live use-case context

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-tool-integration-workspace]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active Google Ads focus was re-checked after the repo had already shipped a truthful connector catalog, a reusable `ToolResearchWorkspace`, and the Improve Agent Co-Pilot entry path. The remaining question was whether the default Co-Pilot Tools step was actually using the same use-case context as the advanced Configure path when it asked the architect to research or recommend a connector.

## What We Observed

The embedded Co-Pilot Tools step has the agent description in state, but it does not pass that description into the tool-research surface.

- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx` mounts `StepConnectTools` without the `agentUseCase` prop.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConfigureAgent.tsx` does pass `agentDescription` into `StepConnectTools`, so the advanced path already has richer context than the default Co-Pilot path.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/connect-tool-catalog.ts` uses `agentUseCase` alongside the skill graph when it infers the focused research seed and shortlist ordering.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx` forwards `agentUseCase` into `ToolResearchWorkspace.initialUseCase`, so the sidebar's auto-research quality depends on that prop being present.

## Why It Matters

- The active focus says the default `/agents/create` Co-Pilot shell should be the primary Google Ads proving path. If that path drops the live description before research, the operator gets weaker recommendations on the main product surface than on the fallback.
- This is not just a display bug. The repo already routes tool research and shortlist behavior through `agentUseCase`, so omitting it changes which connector or integration path the operator sees first.
- Future Connect Tools work should not assume skill graph alone is enough context, especially for domains where the same graph could map to multiple integration strategies.

## Reusable Guidance

- Treat the Co-Pilot `description` field as first-class tool-research context. When the advanced Configure path receives `agentUseCase`, the embedded Co-Pilot path should too.
- Keep Connect Tools context parity between new-create, autosaved drafts, and Improve Agent reopen so recommendation quality does not change just because the operator used a different entry surface.
- When wiring `ToolResearchWorkspace`, prefer reusing existing purpose text over adding another "explain your use case" input inside the sidebar.

## Resolution

Worker-1 closed this gap on 2026-03-27 by threading the trimmed Co-Pilot `description` into `StepConnectTools` from `WizardStepRenderer.tsx` and by teaching the connect-tool catalog to treat Google Ads use-case text as focused evidence that should prioritize the direct `google-ads` connector. Future work should preserve that parity instead of reintroducing a blank-context embedded Tools step.

## Related Notes

- [[008-agent-builder-ui]] — documents the default Co-Pilot builder shell and the embedded Connect Tools surface
- [[SPEC-tool-integration-workspace]] — the canonical research-and-connect contract that expects the current use case to guide MCP vs API vs CLI recommendations
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving case depends on context-aware tool recommendations in the main create flow
- [Journal entry](../../journal/2026-03-27.md)
