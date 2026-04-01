# SPEC: Google Ads Agent Creation Loop

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Status

implemented

## Summary

The Google Ads agent is the proving-case path for the current builder focus window. This slice upgrades the `/agents/create` configure flow from throwaway string arrays to a persisted contract that carries MCP-oriented tool-connection metadata, per-agent runtime inputs, and supported trigger definitions through save, reload, and deploy-time config generation.

Operator-facing Review, Improve Agent, and Deploy surfaces must read from that same persisted contract instead of falling back to `workflow.steps` guesses or the legacy `triggerLabel` summary, and deploy/runtime config must fail closed when required runtime inputs are still missing.

## Related Notes

- [[008-agent-builder-ui]] — the create flow, configure step, and builder review UX live here
- [[011-key-flows]] — documents the end-to-end builder journey and what save/deploy now preserve
- [[004-api-reference]] — `POST /api/agents`, `PATCH /api/agents/:id/config`, and `GET /api/agents/:id` now round-trip structured tool/trigger metadata
- [[005-data-models]] — the `agents` record now stores `runtime_inputs`, `tool_connections`, and `triggers` JSON alongside existing architect config
- [[013-agent-learning-system]] — later automation and follow-on runs should treat this persisted shape as the durable builder contract
- [[SPEC-agent-create-deploy-handoff]] — the Google Ads create path now uses this saved contract to enter the first-deploy route truthfully
- [[SPEC-agent-webhook-trigger-runtime]] — later webhook runtime work should extend the persisted `triggers[]` contract instead of inventing a second trigger model
- [[SPEC-selected-tool-mcp-runtime-apply]] — deploy/runtime MCP config must honor the same saved selected connector contract that Review and Deploy surface

## Specification

### Goal

Ship one operator-testable Google Ads creation slice that:
- produces a Google Ads-specific review/configure path in `/agents/create`
- persists connector metadata in a safe read model with no raw secret material
- persists required non-secret runtime inputs in a dedicated saved contract instead of burying them in `agentRules`
- persists supported trigger definitions instead of relying only on `triggerLabel`
- rehydrates that metadata when the saved agent is reopened or deployed later
- writes runtime inputs into the sandbox environment during deploy and hot-push only when the required values are present

### Tool Connection Contract

Saved agents may now store `toolConnections[]` / `tool_connections[]` entries with:
- `toolId`
- `name`
- `description`
- `status` (`available`, `configured`, `missing_secret`, `unsupported`)
- `authKind` (`oauth`, `api_key`, `service_account`, `none`)
- `connectorType` (`mcp`)
- `configSummary[]`

Rules:
- This slice stores metadata only. Raw credentials, tokens, refresh secrets, and similar secret values must not be returned from normal agent read APIs.
- Direct-connection credentials now live behind the dedicated encrypted `/api/agents/:id/credentials/:toolId` endpoints; `toolConnections[]` is the safe readiness/read-model layer rather than the credential store itself.
- Google Ads is the proving-case connector. The first UI slice may model a configured connection without implementing the final secret-entry UX, as long as the persisted shape remains compatible with later secret storage work.

### Trigger Contract

Saved agents may now store `triggers[]` with:
- `id`
- `title`
- `kind` (`manual`, `schedule`, `webhook`)
- `status` (`supported`, `unsupported`)
- `description`
- optional `schedule`

Rules:
- The first shipped supported runtime path is `cron-schedule`.
- Unsupported trigger cards may remain visible in the UI, but they must be clearly marked unavailable and must not be presented as deployable behavior.
- Trigger suggestion and reopen/save normalization must flow through one shared runtime-backed catalog so legacy `chat-command` selections are not treated as deployable.
- Architect-to-builder metadata must keep explicit Google Ads connector hints on the truthful direct connector identity (`google-ads`) before AG-UI state, review defaults, or autosaved recommendations consume them. Google Workspace (`google`) remains a separate connector for Workspace-specific intent.
- Deploy-time cron generation should prefer the structured `triggers[]` schedule when present and only fall back to rule-text parsing for older agents.

### Runtime Input Contract

Saved agents may now store `runtimeInputs[]` / `runtime_inputs[]` entries with:
- `key`
- `label`
- optional `description`
- `required`
- `source` (`architect_requirement`, `skill_requirement`)
- optional `value`

Rules:
- Runtime inputs are for non-secret operator-supplied parameters such as `GOOGLE_ADS_CUSTOMER_ID`. They are distinct from encrypted connector credentials and must not reuse the credential endpoints.
- The currently shipped persisted source enum is only `architect_requirement` or `skill_requirement`. A first-class operator-added `operator_defined` branch is still follow-on work rather than live backend/frontend contract.
- The Google Ads direct connector must not render or require `GOOGLE_ADS_CUSTOMER_ID` inside Connect Tools. The sidebar may explain that the value is still required, but the only editable owner of that value is `runtimeInputs[]`.
- The first dedicated editing UX landed in the Advanced `/agents/create` Configure flow, and the same editor now also appears in the default embedded Co-Pilot flow as a separate `Runtime Inputs` step between `Connect Tools` and `Set Triggers`.
- Review and Deploy must summarize runtime-input completeness separately from connector readiness so a `configured` Google Ads connector can still be blocked by a missing customer/account id.
- `POST /api/sandboxes/:sandbox_id/configure-agent` must reject missing required runtime inputs with a deterministic `runtime_env` step result before it writes any partial runtime env payload.
- When present, saved runtime inputs are written into `~/.openclaw/.env` before MCP config and the rest of the agent runtime contract is applied.

### Google Ads Proving Case

The builder acceptance path should use a Google Ads-oriented architect fixture so operators can:
1. ask for a Google Ads optimizer agent
2. review Google Ads-specific skills
3. configure a Google Ads MCP connection
4. enter a required runtime input such as `GOOGLE_ADS_CUSTOMER_ID`
5. keep a supported weekday schedule trigger through save
6. reopen the saved agent without losing the connection/runtime-input/trigger metadata

### Pre-save Create-session Contract

Before the first save, `/agents/create` must still treat Configure choices as first-class state:
- one page-owned session snapshot carries `toolConnections[]`, ephemeral `credentialDrafts`, selected skill ids, and `triggers[]`
- Review and Configure both render from that same in-flight snapshot instead of falling back to the last persisted `workingAgent` record
- backing out of Configure to Review, then reopening Configure, must preserve the same unsaved Google Ads connector plan and trigger selections
- the final save/deploy handler must read that same in-flight snapshot so the persisted payload matches what Review displayed immediately beforehand

### Operator-facing Saved Config Contract

- Review must show persisted tool readiness and persisted trigger support/runtime details from `toolConnections[]` and `triggers[]`.
- Chosen skills must project into the canonical saved runtime contract, not just the display `skills[]` list: completion must filter `skillGraph`, prune `workflow.steps` plus dependency edges to the selected subset, and recompute runtime-input requirements from that filtered graph before save, deploy, or Improve Agent hot-push.
- Review and Deploy must also show persisted runtime-input completeness from `runtimeInputs[]`, using explicit status labels such as `Required value missing` vs `Saved value present`.
- The default embedded Co-Pilot review step in `/agents/create` must consume the same shared formatter/readiness contract as the richer Review and Deploy surfaces so the operator sees identical connector status labels, runtime-input completeness, trigger support details, and deploy-readiness summary before clicking `Deploy Agent`.
- `/agents/create` must not expose an alternate new-agent entry point that bypasses this saved-config and deploy handoff contract; unsupported legacy modes should be retired or fail closed back to the Co-Pilot path until they honor the same runtime-truthful state model.
- The default Co-Pilot Config tab must expose the same runtime-input editor and saved-value reopen path as the Advanced Configure shell, with `Runtime Inputs` inserted between `Tools` and `Triggers` so the Google Ads proving case can enter `GOOGLE_ADS_CUSTOMER_ID` without leaving the primary builder path.
- The default embedded Co-Pilot flow must also carry `runtimeInputs[]` in its own store/seed path, show those fields in-step, and fail closed on missing required values before the inline `Deploy Agent` CTA can complete.
- The default embedded Co-Pilot Tools step must pass the live purpose description into `StepConnectTools` so the Google Ads connector shortlist and the embedded `ToolResearchWorkspace` auto-research use the same context as the Advanced Configure shell.
- Accepting the shipped Google Ads builder recommendation must project that decision into the same saved/session `toolConnections[]` contract immediately, using the truthful `google-ads` connector id and a fail-closed `missing_secret` status until credentials are present.
- Improve Agent must reopen in the same Co-Pilot workspace contract used by new-agent creation, and route entry must seed that workspace from the saved agent snapshot so purpose, selected skills, tool connections, triggers, and accepted improvements appear immediately instead of only as fallback display props.
- Existing-agent completion from that Co-Pilot workspace must preserve Improve Agent semantics: persist edits, hot-push running sandboxes when applicable, and return to `/agents` rather than entering the new-agent first-deploy handoff route.
- Deploy must summarize connector readiness and supported-vs-unsupported triggers from the saved contract before sandbox creation, instead of only showing `triggerLabel`.
- Review-mode `Test Agent` on both the advanced Review screen and the default embedded Co-Pilot review step, plus deploy-time `SOUL.md` writes, must consume that same saved contract through one safe prompt-summary path, so the operator validates the same connector/trigger/improvement state the runtime later receives.

## Implementation Notes

- Backend persistence uses new `agents.runtime_inputs`, `agents.tool_connections`, and `agents.triggers` JSONB columns added by ordered schema migrations.
- Validation accepts the new structured config fields on create and config-patch routes while still rejecting unknown keys.
- Frontend state now maps backend `runtime_inputs`, `tool_connections`, and `triggers` to `SavedAgent.runtimeInputs`, `SavedAgent.toolConnections`, and `SavedAgent.triggers`.
- `agents/create/page.tsx` owns the pre-save create-session config state, and `ConfigureAgent.tsx` is controlled from that page instead of owning local-only tool/trigger/credential draft state.
- `create-session-config.ts` now also owns `projectSelectedSkillsRuntimeContract()`, which canonicalizes the selected skill ids, filters `skillGraph`, prunes `workflow` dependencies, and removes runtime-input definitions that only belonged to deselected skills before either completion path persists the agent.
- `runtime-inputs.ts` centralizes requirement extraction, merge rules, Google Ads labeling, and completeness checks so create-session seeding, store persistence, and review/deploy summaries do not drift.
- `mcp-tool-registry.ts` now keeps the Google Ads encrypted credential set secret-only and exports the sidebar guidance that points `GOOGLE_ADS_CUSTOMER_ID` back to Runtime Inputs.
- Review-confirm must project editable Review skill and trigger changes back into that same page-owned create-session state; otherwise Review becomes a display-only fork that save/deploy can silently ignore.
- The shipped review-confirm projection helper now performs that write-back explicitly: review skill labels normalize to canonical skill ids, confirmed trigger cards rebuild structured `triggers[]`, and accepted improvement projections are reapplied to the same session snapshot before Configure or completion runs.
- `StepSetTriggers.tsx` now reads a shared trigger-catalog helper so only `cron-schedule` is deployable today, `webhook-post` stays manual-plan until [[SPEC-agent-webhook-trigger-runtime]] lands, and legacy saved `chat-command` metadata normalizes back to `unsupported` on reopen.
- `wizard-directive-parser.ts` now applies the same truthfulness rules upstream: Google Ads builder hints normalize to `google-ads`, Workspace hints normalize to `google`, webhook ideas normalize to `webhook-post`, and the AG-UI metadata layer no longer injects `chat-command` as a default runtime path.
- [[SPEC-architect-structured-config-handoff]] now covers the upstream seam where architect-emitted `tool_connections` and `triggers` become the same saved-agent config objects the Google Ads loop already persists and reopens.
- `buildCronJobs()` now prefers structured schedule triggers before falling back to regex extraction from `agentRules`.
- `buildSoulContent()` now includes a safe config-context section derived from persisted `toolConnections[]`, `runtimeInputs[]`, structured `triggers[]`, and accepted improvements; sensitive summary entries such as tokens or callback URLs are stripped before browser-visible test-chat injection or deploy-time prompt writes.
- `POST /api/sandboxes/:sandbox_id/configure-agent` now enforces runtime-input readiness, writes the saved key/value pairs into `~/.openclaw/.env`, and returns a `runtime_env` step in both success and failure cases so deploy/hot-push logs stay truthful.
- `POST /api/sandboxes/:sandbox_id/configure-agent` now also rewrites `~/.openclaw/mcp.json` to the exact selected configured MCP set, including the empty-state case when all direct connectors were deselected, and fails closed on selected-tool MCP materialization errors.
- Review and deploy UI consume a shared formatter layer so persisted connector and trigger metadata stays consistent across operator-facing surfaces.
- Existing-agent Co-Pilot entry now relies on one explicit saved-agent seed helper plus a separate completion-kind helper so Improve Agent reuses the Co-Pilot workspace without losing its save/hot-push contract.
- The Co-Pilot seed/store contract now also carries `runtimeInputs[]`, so saved-agent reopen and review/gating logic read the same non-secret env metadata the deploy/apply contract already enforces.
- Accepted Google Ads tool improvements now flow through one bounded projection helper so review acceptance, Co-Pilot acceptance, seed/reopen, and AG-UI draft autosave all converge on the same truthful connector state instead of leaving accepted improvements as disconnected badges.
- The original task sketch that expected raw credential values to round-trip inside `tool_connections` is obsolete. The shipped contract intentionally separates safe connector metadata from encrypted credential writes so ordinary agent reads stay secret-free while deploy/runtime config still has what it needs.

## Test Plan

- `ruh-backend/tests/unit/validation.test.ts`
- `ruh-backend/tests/unit/agentStore.test.ts`
- `ruh-backend/tests/integration/agentCrud.test.ts`
- `agent-builder-ui/hooks/use-agents-store.test.ts`
- `agent-builder-ui/lib/openclaw/agent-config.test.ts`
- `agent-builder-ui/e2e/create-agent.spec.ts`
- `agent-builder-ui/lib/agents/operator-config-summary.test.ts`
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepRuntimeInputs.tsx`
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/trigger-catalog.test.ts`
- `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.test.ts`

Manual/operator verification:
- Open `/agents/create`
- Build a Google Ads optimizer agent
- Edit skills or triggers in Review, confirm them, and verify Configure opens with the same confirmed state
- Connect the Google Ads tool in Configure
- Enter `GOOGLE_ADS_CUSTOMER_ID` in Configure → Runtime Inputs
- Navigate Review → Configure → Review → Configure before saving and confirm the unsaved Google Ads connector plan plus trigger selection persist
- Save or reopen the agent and confirm the runtime input value plus readiness status return
- Keep the default supported schedule trigger
- Save, reopen, and confirm Review/Deploy show connector + trigger metadata without exposing secrets
- Clear the runtime input and confirm Deploy/config-apply blocks with a `runtime_env` failure before the agent can report success
- From `/agents`, click `Build` on the saved Google Ads agent and confirm the page opens in Co-Pilot with the saved purpose, skills, tools, triggers, and improvements already visible
- Complete that Improve Agent flow and confirm it returns to `/agents` after save/hot-push instead of routing into `/agents/[id]/deploy`

## Related Learnings

- [[LEARNING-2026-03-26-copilot-draft-config-persistence-gap]] — Co-Pilot draft autosave must persist the latest safe selected skills, tool metadata, and trigger metadata or draft recovery will overstate what survives
- [[LEARNING-2026-03-26-review-edit-persistence-gap]] — Review-edit controls must write back into the same canonical create-session state used by Configure, test chat, and save/deploy
- [[LEARNING-2026-03-26-soul-config-context-gap]] — review-mode test chat and deploy-time SOUL generation must reuse one safe saved-config summary instead of drifting from Review/Deploy truthfulness
- [[LEARNING-2026-03-26-configure-step-contract-evolution]] — the original configure-step package closed under a metadata-plus-encrypted-credential split rather than the earlier inline-secret sketch
- [[LEARNING-2026-03-27-selected-tool-mcp-apply-gap]] — deploy/runtime config must materialize only the selected configured connectors and clear stale MCP state instead of treating all stored credentials as active runtime tools
- [[LEARNING-2026-03-27-google-ads-connector-contract-split]] — the backend already provisions `google-ads` directly, so the builder should stop remapping explicit Google Ads intent onto Google Workspace/manual-plan paths
- [[LEARNING-2026-03-27-agent-builder-channel-persistence-gap]] — captured the earlier saved-agent gap before planned messaging channels started persisting through save, reopen, and deploy handoff
- [[LEARNING-2026-03-27-copilot-connect-tools-use-case-gap]] — the default Co-Pilot Tools step must pass the live Google Ads purpose into the embedded research workspace or connector recommendations weaken on the primary create surface
- [[LEARNING-2026-03-27-selected-skills-runtime-contract-gap]] — persisted selected-skill ids are insufficient unless save/deploy also project the actual `skillGraph`, `workflow`, and runtime-input contract to the kept subset
- [[LEARNING-2026-03-27-agent-runtime-env-requirements-gap]] — runtime env requirements need a first-class saved contract and fail-closed config-apply step rather than advisory `Requires env:` rule text
- [[LEARNING-2026-03-27-google-ads-customer-id-contract-split]] — `GOOGLE_ADS_CUSTOMER_ID` must remain on the runtime-input contract instead of being duplicated in the encrypted Google Ads credential form
- [[LEARNING-2026-03-27-operator-defined-runtime-input-gap]] — documents the follow-on gap for first-class operator-added runtime inputs; agents should treat that branch as planned, not shipped
- [[LEARNING-2026-03-27-copilot-runtime-input-parity-gap]] — future readiness work must land in both the Advanced and default Co-Pilot shells together so the primary Google Ads create path stays truthful
- [[LEARNING-2026-03-27-google-ads-schedule-fidelity-gap]] — a truthful supported trigger id is still insufficient until the create flow preserves and edits the actual `triggers[].schedule` payload instead of collapsing back to the default cron
- [[LEARNING-2026-03-27-copilot-credential-handoff-after-draft-gap]] — once Co-Pilot autosave creates a real draft id, pending connector credentials must hand off to the encrypted saved-credential route instead of remaining stuck in ephemeral draft state
- [[LEARNING-2026-03-27-guided-mode-contract-bypass]] — the legacy Guided mode used to bypass the saved config, credential, trigger, and deploy-readiness contract, so the live new-agent mode toggle now fails closed to Co-Pilot/Advanced only
