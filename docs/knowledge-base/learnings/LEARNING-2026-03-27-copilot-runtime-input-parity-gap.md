# LEARNING: Default Co-Pilot flow must share the saved runtime-input contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-copilot-config-workspace]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the Google Ads proving-case focus was re-checked after TASK-2026-03-27-143 shipped the saved `runtimeInputs[]` contract, the advanced Runtime Inputs editor, and fail-closed deploy/apply behavior. The remaining question was whether the default `/agents/create` Co-Pilot shell, which the focus document treats as the primary builder path, had actually absorbed that runtime-input contract.

## What We Observed

The saved runtime-input model originally existed only in the Advanced Configure shell, which left the default Co-Pilot builder path behaving as if runtime inputs did not exist.

- `agent-builder-ui/lib/openclaw/copilot-state.ts` tracks tools, credential drafts, triggers, rules, and improvements, but it has no `runtimeInputs` field or action.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx` still renders `purpose → skills → tools → triggers → review`, so operators never see the shipped `StepRuntimeInputs` editor in the embedded Config tab.
- `agent-builder-ui/lib/openclaw/copilot-flow.ts` currently builds review readiness with `runtimeInputs: []`, which means the inline Co-Pilot review summary can claim `Ready to deploy` even when required values such as `GOOGLE_ADS_CUSTOMER_ID` are blank.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx` enables the final `Deploy Agent` CTA based on purpose metadata and skill-build status only, not the shared connector/trigger/runtime-input readiness contract.
- `agent-builder-ui/e2e/create-agent.spec.ts` still expects the default Google Ads Co-Pilot flow to become `Ready to deploy` without entering any runtime input even though the architect fixture declares `required_env_vars: ["GOOGLE_ADS_CUSTOMER_ID"]`.

## Resolution

TASK-2026-03-27-147 closed this gap by moving the same runtime-input contract into the default Co-Pilot shell instead of inventing a lighter parallel model.

- `agent-builder-ui/lib/openclaw/copilot-state.ts` and `createCoPilotSeedFromAgent()` now carry `runtimeInputs[]` through the Co-Pilot store and saved-agent reopen path.
- `WizardStepRenderer.tsx` now inserts a dedicated `Runtime Inputs` phase between `Tools` and `Triggers` and reuses the shipped `StepRuntimeInputs` editor.
- `buildCoPilotReviewData()` and `CoPilotLayout.tsx` now route readiness through the shared formatter/deploy-summary contract, so missing `GOOGLE_ADS_CUSTOMER_ID` keeps the embedded `Deploy Agent` CTA blocked before handoff.
- The Google Ads Playwright fixture now expects the runtime-input step, blocked review state, filled-value success path, and saved-agent reopen persistence in the default builder shell.

## Why It Matters

- `docs/project-focus.md` says the default Google Ads creation loop should be the proving case, so hiding runtime-input truthfulness in the Advanced fallback leaves the main operator path behind the shipped saved/deploy contract.
- The current split undermines the product's truthfulness: the same agent can look deploy-ready in the embedded Co-Pilot review while the deploy page and backend apply flow correctly fail closed on missing runtime inputs.
- Future Co-Pilot or AG-UI work should not assume tools/triggers parity is enough; every new readiness signal added to the saved config contract must land in the default builder shell too.

## Reusable Guidance

- Treat the default Co-Pilot shell as a first-class consumer of the saved config contract, not as a lighter-weight preview path.
- When a new readiness dimension is added to `buildDeployConfigSummary()` or the saved agent model, update both the Advanced flow and the embedded Co-Pilot review/deploy gating in the same package.
- Reuse the shipped `StepRuntimeInputs` editor and `mergeRuntimeInputDefinitions()` helper rather than inventing a second Co-Pilot-only runtime-input model.
- Keep the Google Ads Playwright proving case honest: if the fixture requires `GOOGLE_ADS_CUSTOMER_ID`, the default Co-Pilot assertions must exercise and verify that blocker.

## Resolution

Later the same day, `Worker-1` closed this gap without widening into the separate draft-autosave package. The default Co-Pilot store now owns `runtimeInputs[]`, `CoPilotLayout.tsx` continuously derives those inputs from architect skill/rule metadata with `mergeRuntimeInputDefinitions()`, `WizardStepRenderer.tsx` mounts the shared `StepRuntimeInputs` editor between Tools and Triggers, and the Co-Pilot review/deploy gate now stays on `Action needed before deploy` until required runtime inputs are filled. Improve Agent reopen also rehydrates saved runtime-input values through `createCoPilotSeedFromAgent()`, so runtime-input truthfulness now lands in both the advanced and default builder paths together.

## Related Notes

- [[008-agent-builder-ui]] — documents the current Co-Pilot shell, embedded Runtime Inputs phase, and shared readiness contract
- [[SPEC-copilot-config-workspace]] — the default Config-tab builder path should expose the same truthful contract the rest of the create flow uses
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving case already treats runtime inputs as part of the saved/deploy contract
- [[LEARNING-2026-03-27-agent-runtime-env-requirements-gap]] — the saved runtime-input model exists; this learning isolates the remaining default-Co-Pilot parity gap
- [Journal entry](../../journal/2026-03-27.md)
