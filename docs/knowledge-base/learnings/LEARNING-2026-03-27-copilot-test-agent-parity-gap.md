# LEARNING: Co-Pilot review test chat should reuse the shared review snapshot contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-pre-deploy-agent-testing]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

During the 2026-03-27 focus-lane curation and follow-on `Worker-1` implementation run, the remaining review-gap question was whether the primary Co-Pilot review path could actually run the same builder-local pre-deploy test loop that the advanced Review screen already exposed, without inventing a second prompt or session contract.

## What Was Learned

The durable rule is not "duplicate the advanced Review drawer in Co-Pilot." The real contract is that every pre-deploy builder test surface should reuse one shared review snapshot helper plus the same `buildSoulContent()` prompt path, so the operator validates exactly the saved-config contract that deploy-time SOUL generation later writes.

- `agent-builder-ui/lib/openclaw/copilot-flow.ts` now owns `buildCoPilotReviewAgentSnapshot(...)`, which filters the selected skill graph, projects accepted improvements into the tool contract, preserves runtime inputs and structured triggers, and returns the same safe saved-agent snapshot both review surfaces can pass into `buildSoulContent(...)`.
- `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx` now delegates its isolated test-chat snapshot to that shared helper instead of maintaining a private divergent snapshot builder.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx` now exposes the same resettable `Test Agent` loop directly on the embedded review step, using the existing `sendToArchitectStreaming(..., { mode: "test", soulOverride })` path and keeping the transcript local to the review panel.
- [[SPEC-pre-deploy-agent-testing]], [[SPEC-google-ads-agent-creation-loop]], and [[008-agent-builder-ui]] should describe this as one shared review-test contract across both review surfaces, not as an advanced-only feature.

## Evidence

- `bun test agent-builder-ui/lib/openclaw/copilot-flow.test.ts agent-builder-ui/app/'(platform)'/agents/create/_components/review/ReviewAgent.test.ts`
- `npx playwright test e2e/copilot-workspace.spec.ts --grep 'embedded review test agent stays local to the copilot shell'` (blocked on this host by Chromium `MachPortRendezvousServer ... Permission denied (1100)`)
- `rg -n "Test Agent|buildCoPilotReviewAgentSnapshot|mode: \"test\"" agent-builder-ui/app/'(platform)'/agents/create/_components/review/ReviewAgent.tsx agent-builder-ui/app/'(platform)'/agents/create/_components/copilot/WizardStepRenderer.tsx agent-builder-ui/lib/openclaw/copilot-flow.ts`

## Implications For Future Agents

- When adding or changing builder-local test chat, update the shared snapshot helper first and let both review surfaces inherit the same prompt contract.
- Keep `mode: "test"` sessions isolated and resettable; the embedded Co-Pilot panel should remain local UI state, not builder transcript state.
- Browser coverage for this flow remains valuable, but current host runs can fail before app code executes because local Chromium launch is denied by the macOS sandbox.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-pre-deploy-agent-testing]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-27.md)
