# LEARNING: Google Ads runtime env requirements need their own saved runtime-input contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[005-data-models]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active focus still centered on the Google Ads proving case and the create/deploy/improve loop. After reading the current KB, `TODOS.md`, and the live builder/runtime code, the repo was re-checked for the next missing feature package that materially advances that focus without duplicating existing connector, draft, review, or AG-UI tasks.

## What Was Learned

Required runtime env inputs such as `GOOGLE_ADS_CUSTOMER_ID` need their own first-class saved contract that stays separate from encrypted connector credentials and from free-form `agentRules`.

- Architect `required_env_vars` and skill-level `requires_env` metadata are useful discovery sources, but flattening them into `Requires env: ...` prose is not enough for readiness, reopen, or deploy.
- The durable contract is one metadata-plus-value model on the saved agent (`runtimeInputs[]` / `runtime_inputs[]`) that can be merged from architect requirements, edited by operators, and reused by review/deploy summaries.
- Backend config apply must fail closed on missing required runtime inputs and write the saved values into `~/.openclaw/.env` before the runtime starts, otherwise a connector-ready Google Ads agent can still be non-runnable.
- Runtime inputs and connector credentials serve different jobs: customer ids and account ids belong in the saved runtime-input model, while OAuth tokens and API secrets stay behind the encrypted credential endpoints.

## Evidence

- [`agent-builder-ui/lib/agents/runtime-inputs.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/agents/runtime-inputs.ts) now centralizes runtime-input extraction, merge, labeling, and completeness checks so builder/runtime requirements resolve into one shared contract instead of drifting between rule text and UI-only hints.
- [`agent-builder-ui/app/(platform)/agents/create/_components/configure/StepRuntimeInputs.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/configure/StepRuntimeInputs.tsx) provides the first dedicated operator editing surface for those inputs in the Advanced Configure flow.
- [`agent-builder-ui/hooks/use-agents-store.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/hooks/use-agents-store.ts) now persists `runtimeInputs` through create, config patch, draft save, and reopen.
- [`ruh-backend/src/agentStore.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/agentStore.ts) and [`ruh-backend/src/schemaMigrations.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/schemaMigrations.ts) add and normalize the persisted `runtime_inputs` JSONB column.
- [`ruh-backend/src/app.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts) `POST /api/sandboxes/:sandbox_id/configure-agent` now rejects missing required runtime inputs and writes saved key/value pairs into `~/.openclaw/.env` before MCP config and the rest of the apply flow continue.

## Implications For Future Agents

- Do not regress required runtime inputs back into free-form rules or connector summaries. Extend `runtimeInputs[]` when new non-secret runtime parameters are introduced.
- Keep connector credentials and runtime inputs separate. Encrypted connector secrets should stay on the credential endpoints, while account ids and similar operator-supplied runtime parameters stay in the saved runtime-input model.
- Extend the same readiness path when adding new runtime-backed features: Review, Deploy, and backend config apply should all agree on missing-runtime-input blockers.
- The remaining parity gap is the default Co-Pilot editing surface and browser coverage, not the saved contract itself.

## Links

- [[005-data-models]]
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-27.md)
