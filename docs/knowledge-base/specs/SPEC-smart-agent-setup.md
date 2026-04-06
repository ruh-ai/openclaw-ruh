# SPEC: Smart Agent Setup with AI Auto-Population

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[018-ruh-app|Flutter App]] | [[004-api-reference|API Reference]]

## Status
implemented

## Summary

Runtime configuration was a friction point — users had to fill every environment variable before chatting with an agent. Most variables aren't secrets; they're behavioral settings the AI can infer. This feature introduces three-tier variable classification (`populationStrategy`), AI-powered auto-population, and a redesigned setup screen that only shows what the user truly needs to provide.

## Related Notes
- [[008-agent-builder-ui]] — Builder setup page redesign
- [[018-ruh-app]] — Flutter setup screen and launch gate
- [[004-api-reference]] — New `infer-inputs` endpoints
- [[011-key-flows]] — Agent install and launch flows affected
- [[003-sandbox-lifecycle]] — Launch validation now checks required inputs

## Specification

### Population Strategy (3 tiers)

Each `AgentRuntimeInput` now has an optional `populationStrategy` field:

| Strategy | Description | Setup Screen | Example |
|----------|-------------|-------------|---------|
| `user_required` | Secrets/credentials only the user can provide | Shown prominently | API keys, OAuth tokens |
| `ai_inferred` | Values the AI can suggest from agent context | Collapsed in "Smart Defaults" | Company name, timezone |
| `static_default` | Hardcoded defaults that rarely change | Collapsed in "Smart Defaults" | Log level, retry count |

When absent (backward compat), defaults to `user_required`.

### AI Auto-Population

Two backend endpoints call an LLM (OpenRouter → Anthropic → OpenAI priority) to suggest values:
- `POST /api/agents/:id/infer-inputs` — for existing agents (setup page, Flutter app)
- `POST /api/infer-inputs` — for creation flow (agent not yet saved)

Request: `{ agentName, agentDescription, variables: [{ key, label, description }] }`
Response: `{ values: { KEY: "suggested_value" } }`

### Setup Screen (all clients)

Only `user_required` inputs without values are shown prominently. AI-inferred and static-default values are collapsed in a "Smart Defaults" accordion. The chat/launch gate (`hasMissingRequiredInputs`) only blocks on `user_required` inputs.

### Launch Validation

`POST /api/agents/:id/launch` returns 400 if required `user_required` inputs have no value — safety net for clients that skip the setup gate.

### Architect Prompt

`PLAN_SYSTEM_INSTRUCTION` in `builder-agent.ts` now requires the Architect to classify every `envVar` with `populationStrategy`. Classification rules are embedded in the prompt.

## Implementation Notes

### Files Changed

**Types (3 files):**
- `agent-builder-ui/lib/agents/types.ts` — `AgentRuntimePopulationStrategy` type + field
- `agent-builder-ui/lib/openclaw/types.ts` — `ArchitecturePlanEnvVar.populationStrategy`
- `ruh-backend/src/agentStore.ts` — `AgentRuntimeInputRecord.populationStrategy`

**Architect:**
- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` — PLAN_SYSTEM_INSTRUCTION update

**Enrichment:**
- `agent-builder-ui/lib/agents/runtime-inputs.ts` — Propagation + gate logic

**Backend:**
- `ruh-backend/src/app.ts` — `inferInputValues()`, two routes, launch validation

**Builder UI:**
- `agent-builder-ui/app/(platform)/agents/[id]/setup/page.tsx` — Full redesign
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepRuntimeInputs.tsx` — Tiered
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx` — AI inference wiring

**Customer Web (ruh-frontend):**
- `ruh-frontend/app/agents/[agentId]/AgentWorkspaceClient.tsx` — Setup phase + SetupPanel

**Flutter (ruh_app):**
- `ruh_app/lib/models/agent.dart` — Full model update
- `ruh_app/lib/screens/agents/agent_setup_screen.dart` — New setup screen
- `ruh_app/lib/screens/agents/agent_list_screen.dart` — Launch gate
- `ruh_app/lib/screens/agents/agent_detail_screen.dart` — Launch gate
- `ruh_app/lib/config/routes.dart` — Setup route

## Test Plan

- [x] `agent-builder-ui/lib/agents/runtime-inputs.test.ts` — 12 tests (7 new for populationStrategy gate logic)
- [x] `ruh_app/test/models/agent_runtime_input_test.dart` — 13 tests (all new: fromJson, isFilled, isUserRequired, hasMissingRequiredInputs)
- [ ] Backend contract test for `POST /api/agents/:id/infer-inputs`
- [ ] E2E: Create agent → verify Architect classifies envVars → setup shows only user_required
- [ ] E2E: Flutter install from marketplace → setup gate → fill credentials → launch
