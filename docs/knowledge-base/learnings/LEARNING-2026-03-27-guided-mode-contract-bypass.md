# LEARNING: Retire Guided mode instead of letting it bypass create

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

The active focus on March 27, 2026 is the Google Ads/MCP-first agent creation lane on `/agents/create`, with emphasis on truthful saved config, encrypted connector handling, runtime-input persistence, and fail-closed deploy readiness. While reviewing the live create flow against `TODOS.md`, the repo still exposed a separate Guided mode alongside Co-Pilot and advanced chat. Worker follow-through in the same lane then retired that legacy entry point instead of widening scope into a full Guided-to-Co-Pilot parity rebuild.

## What Was Learned

The durable lesson is not merely that Guided used to be unsafe. It is that a first-class-looking creation mode must either share the same saved-config and deploy handoff contract as the primary flow or be removed from operator reach entirely.

- The old Guided branch saved only a shallow legacy payload and then routed directly back to `/agents`
- `WizardOutput` has no structured fields for `toolConnections[]`, `runtimeInputs[]`, `triggers[]`, `channels[]`, or `improvements[]`
- `PhaseBehavior.tsx` still derives trigger choices from `MOCK_TRIGGER_CATEGORIES`
- The safe near-term fix was to retire Guided from the live mode toggle and fail closed to `copilot` if any stale caller still requests `wizard`

That means future agents should prefer narrowing the visible contract over preserving a nostalgic UX path when the alternative would silently skip connector truthfulness, runtime-input persistence, encrypted credential handoff, and deploy/readiness routing.

## Evidence

- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/page.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/page.tsx) now limits the live new-agent mode contract to `copilot` and `chat`, normalizes legacy `wizard` requests back to `copilot`, and removes the old `handleWizardComplete()` save path entirely
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/create-mode.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/create-mode.ts) makes that fail-closed mode contract explicit for both the page and tests
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/create-mode.test.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/create-mode.test.ts) locks the retired-mode behavior with focused Bun coverage
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/e2e/create-agent-wizard.spec.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/e2e/create-agent-wizard.spec.ts) now defines the browser-facing retirement regression by asserting Guided is absent from `/agents/create`
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/wizard/WizardContext.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/wizard/WizardContext.tsx) defines `WizardOutput` without the structured config fields the rest of the create lane now treats as canonical
- [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/wizard/PhaseBehavior.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/wizard/PhaseBehavior.tsx) still builds trigger choices from `MOCK_TRIGGER_CATEGORIES`

## Implications For Future Agents

- Do not assume every visible `/agents/create` mode already honors the same Google Ads/MCP-focused contract
- Treat alternate create modes as product-contract surfaces, not as harmless legacy UI debt
- Prefer retiring or explicitly gating a visible mode unless the same run can move it onto the real saved config + deploy handoff contract
- If product later wants wizard templates back, re-home them inside the Co-Pilot contract instead of reviving a separate completion path

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-27.md)
