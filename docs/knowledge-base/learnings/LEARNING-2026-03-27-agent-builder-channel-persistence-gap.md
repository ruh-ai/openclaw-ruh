[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

# LEARNING-2026-03-27: Agent builder channel selections are UI-only until the agent contract persists them

## Context

While reviewing the active create-flow focus lane, the repo already had dedicated builder surfaces for channel selection:
- discovery asks which communication channels the agent should use
- the default Co-Pilot stepper includes a `Channels` phase
- review/config summary components can display selected channels
- the Improve Agent seed helper already expects `agent.channels`

That looked like a finished contract from the UI side, so the next check was whether the saved agent and backend actually preserved the same state.

## What We Found

- `agent-builder-ui/lib/openclaw/copilot-state.ts` stores `channels` in the live Co-Pilot wizard state.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx` renders a dedicated `Channels` step and writes those selections into the store.
- `agent-builder-ui/app/(platform)/agents/create/_components/AgentConfigPanel.tsx`, `ReviewAgent.tsx`, and `buildCoPilotReviewData()` can all surface channel selections back to the operator.
- `agent-builder-ui/lib/openclaw/copilot-flow.ts:createCoPilotSeedFromAgent()` already tries to reopen saved `channels`.

But the persistence contract drops the field:
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` omits `channels` from both advanced and Co-Pilot completion payloads.
- `agent-builder-ui/hooks/use-agents-store.ts` defines `SavedAgent.channels`, but `fromBackend()`, `saveAgent()`, `saveAgentDraft()`, and update helpers do not round-trip it.
- `ruh-backend/src/agentStore.ts` and the agent API/data-model docs have no persisted `channels` field on `agents`.

## Why It Matters

This makes the shipped Channels step a false affordance on the main `/agents/create` journey. Operators can select Slack, Telegram, or Discord during creation, see those choices echoed in in-memory review/config UI, and then lose them on save, reopen, deploy, and Improve Agent. It directly conflicts with the current focus rule that configuration should stop being decorative.

It also leaves the builder disconnected from the repo's existing runtime channel-management surfaces. The backend and `ruh-frontend` already have real Telegram/Slack configuration and pairing flows, but the builder has no durable way to say which channels the operator intended to configure.

## Reuse Next Time

- Treat `channels[]` as part of the same saved-config truthfulness lane as `toolConnections[]`, `runtimeInputs[]`, and `triggers[]`; do not leave it as Co-Pilot-only state.
- Reuse existing runtime channel-management surfaces for token entry and pairing. The saved agent contract should carry safe channel intent/status metadata, not raw channel secrets.
- When a builder step already exists in discovery, review, and Improve Agent reopen helpers, verify the backend agent contract before assuming the feature is truly shipped.
