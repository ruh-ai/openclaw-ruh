# Agent Builder UI

[[000-INDEX|← Index]] | [[007-conversation-store|Conversation Store]] | [[009-ruh-frontend|Ruh Frontend →]]

---

## Overview

A Next.js 15 app (port 3000) providing a conversational UI for building AI agents. Users describe what they want; the system routes messages to an OpenClaw "architect" agent and returns structured skill graphs.

**Path:** `agent-builder-ui/`

---

## App Structure

```
app/
  (auth)/                         — Login flow (public entry that redirects back into the platform when a session already exists)
    authenticate/page.tsx
    _components/AuthButton.tsx, ImageCarousel.tsx
  (platform)/                     — Main authenticated area
    layout.tsx                    — Sidebar + main layout
    page.tsx                      — Redirects to /agents
    tools/
      page.tsx                    — Tool research workspace for MCP vs API vs CLI recommendations
    agents/
      page.tsx                    — Agent list
      [id]/
        chat/page.tsx             — Chat with deployed agent
        deploy/page.tsx           — Deploy agent to sandbox
      create/
        page.tsx                  — Agent creation flow
        _components/              — Chat UI + configure + review sub-flows
        _config/agentChatSteps.ts — Step config for creation wizard
  api/
    openclaw/route.ts             — WebSocket bridge to OpenClaw gateway (SSE out)
    auth.ts                       — Auth helpers
    user.ts                       — User endpoint
middleware.ts                     — Auth middleware for page-route gating (`/authenticate` stays public)
```

---

## Agent Creation Flow

3 phases rendered in `agents/create/`:

### Phase 1: Chat (`_components/` chat components)
User converses with the architect agent. `useOpenClawChat` hook manages state.

The default Co-Pilot shell now uses one builder workspace instead of a separate configure rail. Chat stays on the left, `TabChat.tsx` reuses its `Agent's Computer` panel on the right, and the `Config` tab hosts the live builder snapshot plus the active `purpose`/`skills`/`tools`/`runtime_inputs`/`triggers`/`review` step content from [[SPEC-copilot-config-workspace]]. The current create-flow focus contract is tightened by [[SPEC-create-flow-static-workspace-tabs]]: while Co-Pilot is active, the workspace stays on the operator-selected tab instead of auto-switching to terminal/code/browser/preview in response to builder runtime activity. Manual terminal commands also follow [[SPEC-builder-terminal-transcript-isolation]], so builder terminal output stays in the workspace terminal instead of echoing back into the transcript. The dev-only mock-stage banner is now hidden by default even in local development and only renders when `/agents/create` is opened with `?devMockBar=1`, which keeps routine QA/screenshots aligned with the real production shell.
The live new-agent mode contract is now intentionally narrower: `/agents/create` exposes only `Co-Pilot` and `Advanced` as selectable modes for new agents, and any legacy `wizard` mode request fails closed back to `copilot` so operators cannot create agents through the old shallow Guided save path.

The Co-Pilot path is now purpose-gated per [[SPEC-agent-builder-gated-skill-tool-flow]]. Until both `name` and `description` are filled and the architect has produced a real skill graph, only the `Config` tab and the `purpose` phase stay interactive. Once the graph exists, the skills step shows each generated skill as `native`, `registry_match`, `needs_build`, or `custom_built`, offers an inline `Build Custom Skill` path for missing registry entries, and blocks deploy until every selected required skill is resolved. The embedded Ship-stage `Save & Activate` CTA now reuses that same readiness contract instead of bypassing it, so missing required runtime inputs fail closed before any activation request is sent.

The same Co-Pilot chat now treats AG-UI builder metadata as the live safe draft source. `useAgentChat()` reduces `skill_graph_ready` plus the builder wizard custom events into canonical metadata, debounces `saveAgentDraft()` through the backend-backed agent store, and surfaces `Saving draft…`, `Draft saved`, or `Draft save failed` in the workspace chrome before the operator ever reaches Review. In copilot-mode `ready_for_review` streams, `BuilderAgent` now emits `skill_graph_ready` and wizard metadata before the delayed `TEXT_MESSAGE_END`, which keeps the review handoff metadata authoritative while the transcript reducer work from [[SPEC-agui-protocol-adoption]] is still in flight and avoids a duplicate assistant review-summary turn. The final deploy path reuses `draftAgentId` so the saved draft is promoted to `active` instead of creating a duplicate agent, and only safe metadata is autosaved in this slice. Forge-backed autosave now keeps the persisted `forging` status truthful as well: the metadata PATCH contract accepts `forging`, so resumed `/agents/create?agentId=...` drafts do not fail autosave just because the agent is still in its forge lifecycle. The same metadata layer now also persists `improvements[]` per [[SPEC-agent-improvement-persistence]], letting Review accept or dismiss a Google Ads recommendation and keeping that decision visible after save, Improve Agent reopen, and on the deploy page without reading chat history. Per [[SPEC-architect-structured-config-handoff]], that metadata path now also preserves explicit architect-emitted `tool_connections` and `triggers` objects instead of reducing everything back to keyword hints before draft save and reopen. Approved discovery documents now persist through the saved-agent contract as well per [[SPEC-agent-discovery-doc-persistence]], so the edited PRD/TRD pair survives draft autosave, final save, reopen, and Improve Agent review instead of disappearing with the transient Co-Pilot store. Route entry now also follows [[SPEC-agent-create-session-resume]]: `/agents/create?agentId=...` fetches the backend agent record on mount and merges it with a safe local create-session cache, so refreshes recover forge linkage plus in-progress non-secret builder state instead of reopening blank.
The lifecycle stepper now also follows [[SPEC-create-flow-lifecycle-navigation]]. The Co-Pilot store keeps both the currently viewed stage (`devStage`) and the furthest stage already reached (`maxUnlockedDevStage`), so a refresh-resumed Review draft can safely jump back to Build, Plan, or Think for inspection without losing access to Review. The footer `Back` button remains the destructive rewind path: it resets the previous stage back to `idle` and intentionally caps forward progress there.
The plan-to-build handoff is now stricter as well. When the operator clicks `Approve & Start Build`, the build helper forwards the approved PRD/TRD plus the full `architecturePlan` back into the architect request and explicitly requires `skill_graph.nodes[].skill_md` in the `ready_for_review` payload. That keeps Build aligned with the reviewed plan instead of re-inferring a detached skill list and gives draft autosave/deploy a durable custom-skill artifact to persist.
The same AG-UI layer now keeps reasoning-step lifecycle truthful as well. `event-consumer-map.ts` custom `reasoning` events and the standard `REASONING_*` events in `useAgentChat()` share one mutable thinking-step id through `reasoning-step.ts`, so the live reasoning list and `TaskProgressFooter` stop animating as soon as reasoning ends instead of leaving the builder stuck on a perpetual `Thinking` state.
The next builder-loop truthfulness slice now extends that same discipline to stage loading, prompt suggestions, and architect context. Later-stage Co-Pilot messages no longer regress `thinkStatus` back to `generating`, the left-chat empty state swaps from unrelated canned examples to stage-aware suggestions once `name + description` exist, and post-build architect runs now use a dedicated refine-mode instruction plus a richer `[WIZARD_STATE]` block that carries tools, runtime inputs, triggers/heartbeat, channels, architecture-plan summary, and SOUL summary forward. See [[SPEC-builder-contextual-refine-loop]].
That seeded metadata path also preserves `channelHints` from the page-owned builder state, so architect-suggested delivery channels survive remount or reopen long enough for the Co-Pilot store to rehydrate the same channel intent instead of silently clearing it during AG-UI session resets.
Accepted Google Ads tool improvements now project into the same truthful config contract instead of remaining passive badges. The bounded projector in `create-session-config.ts` maps the accepted recommendation onto the supported `google-ads` connector, preserves stronger saved states such as `configured`, and otherwise lands the connector as `missing_secret` so Review, Connect Tools, draft autosave, and Improve Agent reopen all show the same fail-closed runtime expectation.

### Phase 2: Configure (`_components/configure/`)
- `ConfigureAgent.tsx` — stepper wrapper
- `StepChooseSkills.tsx` — review/approve skill graph nodes
- `StepConnectTools.tsx` — configure tool connections
- `StepRuntimeInputs.tsx` — enter required non-secret runtime env values such as `GOOGLE_ADS_CUSTOMER_ID`
- `StepSetTriggers.tsx` — set up cron/triggers
- `ConnectToolsSidebar.tsx`, `SkillDetailPanel.tsx` — supporting panels

The current proving-case path for this flow is the Google Ads agent journey. The configure phase now persists MCP-oriented `toolConnections[]` metadata, `runtimeInputs[]`, structured `triggers[]` definitions, and builder-selected `channels[]` on the saved agent record instead of throwing the step away as string arrays. Read paths remain split by sensitivity: runtime inputs can round-trip as saved non-secret values, while raw connector credential values are intentionally excluded from ordinary agent responses. Before the first save, `agents/create/page.tsx` now owns one in-flight config snapshot for `toolConnections`, `runtimeInputs`, ephemeral `credentialDrafts`, selected skill ids, and `triggers`, and both Review plus Configure read that same state so back-navigation no longer drops unsaved Google Ads choices. That session snapshot now also tracks whether tools or triggers were explicitly edited, so an operator can intentionally clear those sections without Review resurrecting stale saved-agent config. The default Co-Pilot `Channels` phase now survives final save, Improve Agent reopen, and deploy handoff while still labeling messaging channels as `planned` until runtime bot credentials are configured after deploy. [[LEARNING-2026-03-28-copilot-channel-draft-persistence-gap]] documents the remaining draft-autosave gap: pre-completion `Draft saved` snapshots still omit live channel edits until the follow-on package lands.
`runtime-inputs.ts` is the shared contract layer for this package. It merges architect `required_env_vars`, skill-node `requires_env`, and saved operator-entered values into one runtime-input array, applies product-facing labels for the Google Ads proving case, and provides the completeness checks now used by review/deploy readiness. Both builder shells now reuse the same `StepRuntimeInputs.tsx` editor: the Advanced Configure stepper and the default Co-Pilot Config-tab phase both present required-vs-optional badges, persist entered values through save and reopen, and keep deploy readiness honest when a required runtime value is still blank. The same fail-closed contract now gates both the page-level `Deploy Agent` CTA and the embedded Ship-stage activation path, and a failed `pushAgentConfig()` result now surfaces as a real completion error instead of falling through to a false-success Ship state.

This shipped package intentionally supersedes the repo's earlier "store credentials directly on `tool_connections`" sketch. `toolConnections[]` is now the safe readiness/read-model layer, while direct connector secrets live behind the encrypted `GET/PUT/DELETE /api/agents/:id/credentials/:toolId` endpoints and are only rejoined during deploy/runtime config application. That runtime apply path now follows [[SPEC-selected-tool-mcp-runtime-apply]]: only selected configured MCP connectors are materialized, deselected/stale connectors are cleared from runtime config, and selected-tool MCP errors fail closed instead of reporting a successful apply.
For the Google Ads proving case, the direct connector now asks only for OAuth secrets plus the developer token. `GOOGLE_ADS_CUSTOMER_ID` no longer appears in the encrypted credential form; the sidebar instead points operators to the dedicated Runtime Inputs step so save/reopen/review/deploy keep one non-secret source of truth.
Review confirm now writes editable `skills[]` and `triggers[]` back into that same session snapshot instead of keeping them as display-only review data. The projection helper normalizes review skill labels back onto canonical graph ids, rebuilds structured trigger selections from the confirmed review cards, and keeps accepted-improvement tool projections aligned before Configure, test chat, save, or deploy read the state.
Selected-skill confirmation is now runtime-truthful as well. `projectSelectedSkillsRuntimeContract()` filters the saved `skillGraph` to the chosen subset, prunes `workflow.steps` and `depends_on`/`wait_for` edges to only kept skills, and recomputes runtime-input requirements from that filtered graph before either completion path persists the agent. Save, Improve Agent hot-push, review-mode test chat, and deploy-time config apply therefore all consume the same skill subset instead of letting deselected architect nodes survive only in `skillGraph`.
Registry-backed skills are now truthful at deploy time as well: when a selected skill resolves to a seeded backend registry entry, sandbox config apply writes that real `SKILL.md` payload instead of the old placeholder stub. Skills without a registry match still deploy with an explicit stub fallback so operators can tell that implementation work remains.

`/tools` is now the canonical tool-integration workspace for this product. `ToolResearchWorkspace.tsx` asks the architect to recommend `mcp`, `api`, or `cli`, renders setup/integration/validation steps plus source links, and is embedded directly inside `ConnectToolsSidebar.tsx` so operators research before they connect. One-click connectors only report `configured` after saved credentials exist or after a new-agent draft successfully commits right after the first save; unsupported tools keep a manual-integration plan with `status: "unsupported"` instead of pretending they are live. The frontend types and summary components already understand an optional richer `toolConnections[].researchPlan`, but the live backend validator/store path still accepts only the base connector metadata fields plus `configSummary`, so agents should treat durable research-plan persistence as intended/spec behavior rather than current saved-agent truth.
The Connect Tools list itself now follows that same truthfulness contract. `StepConnectTools.tsx` builds its catalog from the supported connector registry plus saved `toolConnections[]`, keeps Google Ads as its own first-class direct connector, and lets the latest architect recommendation reorder the shortlist without collapsing Ads onto Workspace. The default embedded Co-Pilot path now also threads the live purpose `description` into that same contract, so the shortlist and the sidebar's auto-research stay grounded in the current Google Ads use case instead of falling back to blank-context generic ordering. The live list no longer falls back to unrelated mock cards or a research-only placeholder for Google Ads, and `ConnectToolsSidebar.tsx` now saves direct `google-ads` credentials through the same encrypted credential route the backend already supports.
Upstream builder metadata now uses that same truthful connector and trigger contract before the operator opens Configure. `wizard-directive-parser.ts` and builder hint normalization keep Google Ads-specific architect hints on the real `google-ads` connector id, preserve `google` for Workspace-specific intent, and emit `webhook-post` as the runtime-backed inbound trigger alongside `cron-schedule`. `BuilderAgent` and AG-UI draft autosave reuse those normalized ids directly, so saved recommendations and accepted improvements no longer rewrite explicit Google Ads intent onto Workspace.

### Phase 3: Review (`_components/review/`)
- `ReviewAgent.tsx` — final review before deployment
- `DataFlowDiagram.tsx` — visual skill graph (using `FlowNode.tsx`)
- `SectionCard.tsx`, `InlineInput.tsx` — editable review sections

The review phase can also run a builder-local "Test Agent" chat that reuses the architect bridge transport with the generated SOUL prompt injected into an isolated `agent:test:<session_id>` gateway session. This lets operators sanity-check the in-progress agent behavior without polluting the main architect conversation or waiting for a real sandbox deploy. The injected SOUL now includes the same safe saved-config context that Review and Deploy already surface: persisted connector readiness, structured trigger support/runtime state, and accepted builder improvements, with raw secrets and callback URLs stripped before the prompt is shown in browser-visible testing or written at deploy time.

That test loop now exists on both review surfaces: the richer `ReviewAgent.tsx` drawer and the default embedded Co-Pilot review step inside `WizardStepRenderer.tsx`. Both surfaces build their test snapshot from one shared helper in `lib/openclaw/copilot-flow.ts`, so the default `/agents/create` path tests the same selected-skill, tool, runtime-input, trigger, and accepted-improvement contract that deploy-time SOUL generation later consumes.

Forge-backed `/agents/create` runs now also keep the create-page header's `Test Agent` / `Back to Build` toggle honest at the transport layer. When the forge container is in `live` mode, the page switches `TabChat` onto deployed-agent semantics (`SandboxAgent` via `/api/sandboxes/:id/chat`); when it returns to `building`, the page switches back to architect semantics (`BuilderAgent` via `/api/openclaw`). The earlier regression only flipped container mode and the header chrome, which left the page stuck on builder transport even while the UI claimed the agent was live.

In the embedded Co-Pilot flow from [[SPEC-copilot-config-workspace]], the final review step now exposes the real completion CTA inside the builder footer instead of a dead disabled `Next` button. `WizardStepRenderer.tsx` renders `Deploy Agent` on the review phase, wires it to the same create/deploy handler used by the Co-Pilot header, and reflects the shared loading/disabled state so operators can finish the flow directly from the review surface.

That same embedded Co-Pilot review step now reuses the shared saved-config formatter contract from `operator-config-summary.ts` instead of flattening tools and triggers into plain name lists. The default `/agents/create` review surface shows connector readiness such as `Configured`, `Needs credentials`, and `Manual setup`, shows trigger support/runtime state, and mirrors the same `Ready to deploy` vs `Action needed before deploy` summary already used by the richer Review and Deploy surfaces. The saved-config formatter now also understands `runtimeInputs[]`, so the richer Review and Deploy surfaces call out missing runtime values distinctly from missing connector credentials even when both exist on the same agent.

The default Co-Pilot stepper now also exposes the same `Runtime Inputs` editor used by the advanced Configure flow. `CoPilotLayout.tsx` continuously merges architect-required env vars into the shared Co-Pilot store with `mergeRuntimeInputDefinitions()`, `WizardStepRenderer.tsx` mounts `StepRuntimeInputs` between Tools and Triggers, and the final Co-Pilot `Deploy Agent` CTA now reads the shared deploy-readiness contract so missing required values such as `GOOGLE_ADS_CUSTOMER_ID` keep the primary builder path fail-closed until the operator fills them. Improve Agent reopen seeds those saved runtime inputs back into the same Co-Pilot workspace instead of only restoring them in the advanced fallback.

For new agents and autosaved drafts, that `Deploy Agent` action now follows [[SPEC-agent-create-deploy-handoff]] instead of a save-and-exit path. The create page saves or promotes the same agent record, finalizes any pending first-save credential-backed connectors, and routes into `/agents/[id]/deploy?source=create`. The deploy page shows the same saved connector/trigger/improvement summary immediately and auto-starts only when the saved config is already marked ready.

Review now treats persisted `toolConnections[]`, `runtimeInputs[]`, and `triggers[]` as the display source of truth for saved agents. Operators can see connector readiness (`configured`, `missing_secret`, `unsupported`), runtime-input completeness (`Saved value present`, `Required value missing`), and trigger support/runtime details directly in Review instead of inferred workflow-step chips only, and the deploy page mirrors the same saved-config contract with explicit readiness summaries before sandbox creation starts. The current persisted connector summary is still the base metadata contract (`toolId`, readiness, auth kind, connector type, `configSummary`); the richer `researchPlan` rendering helpers exist in the frontend but are ahead of the backend persistence boundary. For supported `webhook-post` triggers, deploy also shows the one-time webhook URL plus secret returned by config apply while later reloads keep only safe masked webhook metadata.

When the page is editing an existing agent, `/agents/create?agentId=<id>` now also enters the same Co-Pilot workspace by default instead of dropping into the legacy advanced-chat shell. Route entry seeds the shared Co-Pilot store from the saved agent snapshot so purpose, selected skills, tool connections, runtime inputs, triggers, and accepted improvements are visible immediately inside the `purpose` → `skills` → `tools` → `runtime_inputs` → `triggers` → `review` flow. Per [[SPEC-agent-create-session-resume]], that reopen path now also re-fetches the backend agent record and overlays a safe local create-session cache, so `Draft saved` work survives a hard refresh even before every field has made it into the persisted agent payload.

Existing-agent Co-Pilot completion now splits by deployment state. If the agent already has attached sandboxes, the flow persists both metadata and architect output through the backend-backed agent store, hot-pushes running sandboxes, and returns to `/agents`. If the saved agent has zero attached sandboxes, the same deploy-labeled CTA now hands off into `/agents/[id]/deploy` instead of dead-ending on a save-only return to the list. The running-sandbox config push still uses the merged saved snapshot rather than a transient in-memory object.
Runtime config apply is now fail closed: `pushAgentConfig()` only reports success when the backend returns `ok: true` and `applied: true`, the deploy page waits for that verified result before attaching a sandbox to the agent record, and Improve Agent / Mission Control no longer show blanket success when one or more running sandboxes reject the config update. `configure-agent` now also writes saved runtime inputs into `~/.openclaw/.env` and rejects missing required values with a dedicated `runtime_env` step instead of silently omitting them.
The same deploy/apply contract now also rewrites `~/.openclaw/mcp.json` to the exact selected configured MCP set on every push, including the empty-state case when no direct MCP connectors remain selected, so Review/Deploy connector truthfulness stays aligned with sandbox runtime state.

## Deployed Agent Chat Page

`app/(platform)/agents/[id]/chat/` is the deployed-agent UI, separate from the architect builder chat.

- `page.tsx` fetches sandbox records from the backend and selects the active sandbox.
- `TabChat.tsx` creates conversations and forwards chat requests through `ruh-backend`.
- `TabChat.tsx` now loads only the newest transcript window first and exposes explicit older-history fetches through the paginated message API.
- `TabChat.tsx` now exposes an `Agent's Computer` workspace panel with `terminal`, `code`, `files`, `browser`, and builder `config` tabs. Deployed-agent chat still auto-switches tabs based on active tool type (shell → terminal, file_write → code, browser_navigate → browser) with debounce and manual-override protection, but `/agents/create` Co-Pilot stays static per [[SPEC-create-flow-static-workspace-tabs]] so builder runtime activity no longer yanks focus away from the selected tab. The shared `Terminal` tab now uses a bounded provisioning-style shell with embedded command input so the prompt stays visually attached to the terminal output instead of appearing as a detached workspace footer. In builder mode, terminal submissions now run as workspace activity per [[SPEC-builder-terminal-transcript-isolation]], so the left chat transcript no longer echoes those command runs while the right pane keeps their terminal history. See [[SPEC-agent-computer-terminal-shell]].
- `TabChat.tsx` parses `<plan>` blocks and `<task_update>` tags from the agent's streamed response to render a structured `TaskPlanPanel` with numbered subtasks, progress bar, and checkbox indicators. Markdown checkbox lists (`- [ ]`/`- [x]`) are supported as a fallback.
- The `Code` tab (`CodeEditorPanel`) shows syntax-highlighted read-only code with line numbers, file tabs, mini file tree, and language badges. It auto-discovers workspace code files via the workspace API when no files were detected from SSE tool events. See [[SPEC-deployed-chat-task-mode]].
- The Files tab uses the bounded workspace routes in `ruh-backend` to list recent sandbox outputs under `~/.openclaw/workspace`, read inline-safe text previews, show image previews, and expose download links for generated artifacts.
- The Files tab now classifies outputs by artifact type (`webpage`, `document`, `data`, `code`, `image`, `archive`, `other`), surfaces optional session/turn metadata, and exposes a gallery-mode browse surface so operators can scan deliverables instead of raw file paths only.
- Rich previews now render HTML outputs in a sandboxed iframe with a source toggle, render markdown as formatted content, and show multi-image outputs in a thumbnail gallery strip while preserving the existing download flow.
- The Files tab now also exposes the first code-control handoff layer: a session-scoped workspace summary, suggested starting files, copy-for-text actions, and a bounded workspace-bundle export when the backend marks the current session folder archive-safe.
- The Browser tab now accepts structured browser-workspace frames from the sandbox chat SSE stream and renders browser timeline rows, preview URLs, screenshots, and operator takeover/resume state through `lib/openclaw/browser-workspace.ts`.
- Completed assistant turns can now persist a bounded `workspace_state` envelope through the conversation API. Historical conversation loads hydrate browser timeline, preview URL, and takeover state from that stored envelope so Browser workspace history survives refreshes and reopening older chats.
- The same `workspace_state` envelope now also carries bounded `taskPlan` plus terminal/process `steps` replay so historical deployed-chat conversations can restore task-progress and terminal history instead of leaving Agent's Computer empty after refresh or reopen.
- Browser parsing still keeps a heuristic markdown fallback for screenshots/URLs/localhost preview announcements when structured browser frames are absent, so future browser work should extend the structured event contract rather than doubling down on text scraping.
- Files workspace state is reset per sandbox/conversation selection, so the first slice avoids leaking one chat's selected file into another even though the backend does not yet persist per-run file snapshots.
- The deployed-agent chat page still has no connector-aware research workspace, source bundle, or result-deliverable surface, so sourced research runs remain trapped in assistant prose even when the workspace already shows browser and terminal activity.
- `TabMissionControl.tsx` is still a lightweight sandbox-ops panel for status and operator actions, but it now also owns the first Workspace Memory surface for deployed chat. Operators can save reusable instructions, a continuity summary, and safe pinned workspace-relative paths for the active agent.
- New deployed-agent conversations explicitly show when saved workspace memory will be applied, so operators can tell the next run is using durable context instead of a blank one-off chat.
- `TabChats.tsx` now loads the newest conversation page first and uses an explicit `Load more` affordance for older history instead of fetching every conversation on mount.
- `TabSettings.tsx` loads available models from `GET /api/sandboxes/:sandbox_id/models`, falls back to a curated catalog when discovery is unavailable, and controls the live provider reconfigure flow for non-shared sandboxes.
- `use-sandbox-health.ts` polls `GET /api/sandboxes/:sandbox_id/status` so the agent list and deployed-agent header surface running vs stopped vs unreachable sandboxes from explicit runtime signals.

When the active sandbox has `shared_codex_enabled=true`:

- the page clears stale local `agent.model` overrides unless they already use `openai-codex/...`
- `TabChat.tsx` always sends `openclaw-default` so the sandbox gateway resolves to its pinned shared model
- `TabSettings.tsx` shows the shared Codex model from sandbox metadata and disables the Apply & Restart provider flow

---

## State Management: `useOpenClawChat`

**File:** `hooks/use-openclaw-chat.ts`

Zustand store with `persist` middleware (stored in `localStorage` as `openclaw-chat-session`).

**State:**
- `sessionId` — uuid, persisted
- `messages: ChatMessage[]` — full conversation history, persisted
- `skillGraph: SkillGraphNode[] | null` — generated skill graph, persisted
- `workflow: WorkflowDefinition | null` — execution order, persisted
- `systemName: string | null` — agent name derived from first skill_id
- `agentRules: string[]` — derived from `agent_metadata` (tone, schedule, primary_users)
- `isLoading`, `statusMessage`, `error` — UI state, not persisted

**Key actions:**
- `sendMessage(text)` — calls `sendToArchitectStreaming()`, processes `ArchitectResponse`
- `initialize(agent)` — re-enter chat for an existing agent
- `reset()` — clear all state, new session

**Response processing by type:**
| Response type | Action |
|---|---|
| `clarification` | Normalize questions (string[] or object[]), display in chat |
| `ready_for_review` | Extract skill_graph, normalize workflow, derive rules, store in state |
| `agent_response` | Plain text message |
| `error` | Display error content |

---

## Gateway Bridge: `/api/openclaw/route.ts`

**What it does:** Bridges the Next.js frontend to the OpenClaw WebSocket gateway. Inputs from client via HTTP POST, outputs SSE stream.

**Environment variables:**
- `OPENCLAW_GATEWAY_URL` — WebSocket URL of the gateway
- `OPENCLAW_GATEWAY_TOKEN` — Bearer token for gateway transport auth
- `OPENCLAW_GATEWAY_ORIGIN` — Origin header (default: `https://clawagentbuilder.ruh.ai`)
- `OPENCLAW_TIMEOUT_MS` — Per-attempt timeout (default: 180000ms)
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` — optional; when both are set the bridge enables Langfuse tracing
- `LANGFUSE_BASE_URL`, `LANGFUSE_TRACING_ENVIRONMENT`, `LANGFUSE_RELEASE` — optional Langfuse export metadata

`OPENCLAW_GATEWAY_TOKEN` is still required even when the architect gateway itself was bootstrapped with shared Codex/OpenClaw OAuth. Shared Codex auth affects the gateway's downstream model calls inside the sandbox; it does not replace bridge-to-gateway authentication.

`/api/openclaw` is now an authenticated BFF boundary per [[SPEC-agent-builder-bridge-auth]]. Before any WebSocket handshake or retry loop starts, the route validates the current builder session against the backend `GET /users/me` contract using the access-token cookie and rejects mismatched browser `Origin` headers. Those auth failures return structured JSON (`unauthorized`, `forbidden_origin`, `auth_unavailable`) instead of the SSE gateway stream so the client can treat session expiry separately from gateway outages. In repo-only local development, the bridge now mirrors the existing page-auth bypass narrowly: when `NODE_ENV=development`, the request origin is localhost-only, and the configured backend URL is also localhost-only, the route skips backend `/users/me` validation so the shared bridge can run against the local backend without a production auth service.

For testability, the route now keeps session validation, approval classification, and final payload parsing in focused helper seams: `lib/openclaw/bridge-auth.ts`, `lib/openclaw/approval-policy.ts`, and `lib/openclaw/gateway-response.ts`. That keeps `app/api/openclaw/route.ts` focused on WebSocket/SSE orchestration while Bun unit tests cover auth failures, approval decisions, and parser edge cases without booting the full bridge route.

When that gateway is retrofitted to shared Codex, the retrofit must also clear any explicit `architect.model` override. Updating only `agents.defaults.model.primary` is insufficient for the builder flow, because the `/agents/create` chat still runs through the named `architect` agent and will keep using any stale provider-specific model pin until that override is rewritten.

**WebSocket Protocol (4 steps):**
1. Server sends `event: connect.challenge`
2. Client responds with `connect` request: `{ role: "operator", auth: { token } }`
3. Server responds `{ ok: true }` → send `chat.send { sessionKey, message, idempotencyKey: request_id }`
4. Collect streamed `agent` events + wait for `chat { state: "final" }`

The shared architect bridge now emits the same bounded `intermediate` SSE contract as `forge-chat`: as assistant text grows it can surface `identity`, `skill_discovered`, `tool_hint`, `trigger_hint`, and `channel_hint` frames before the terminal `ready_for_review` payload. `sendToArchitectStreaming()` forwards those frames and `BuilderAgent` projects them into progressive Co-Pilot wizard updates, so staged builder movement is now a shared-route contract rather than a forge-only fallback behavior. The scanner lives in `lib/openclaw/intermediate-updates.ts` and is reused across both architect routes to keep the producer logic aligned.

**Response format normalization** (in `finalizeResponse()`):
Tries in order:
1. Pure JSON parse
2. Embedded JSON matching type pattern (`clarification|ready_for_review|...`)
3. JSON in ` ```json ``` ` code block
4. YAML in typed code block (` ```ready_for_review ``` `)
5. Fallback: wrap as `agent_response`

**Retry logic:** 3 attempts, exponential backoff (2s, 4s), but only before the bridge knows the gateway accepted `chat.send`. Each user message now carries one stable client-generated `request_id`, and the bridge reuses that value as the gateway `idempotencyKey` across safe pre-accept retries. Once `chat.send` is acknowledged or a `runId` is assigned, transport loss becomes a fail-closed typed error instead of a blind resend.

**Exec approval policy:** `exec.approval.requested` events now go through a fail-closed bridge policy. A narrow read-only inspection allowlist is auto-approved and emitted as `approval_auto_allowed`; everything else emits structured `approval_required` plus `approval_denied` SSE events, resolves the gateway request with `decision: "deny"`, and returns a typed `approval_denied` result instead of silently running the tool.

**Tracing contract:** when Langfuse is configured, the route initializes a Node-based OpenTelemetry SDK with `LangfuseSpanProcessor`, starts one trace per architect request, and records bounded bridge milestones such as gateway resolution, retry attempts, run acceptance, approval allow/deny, socket errors, post-accept disconnects, and final outcome. Completed bridge runs now force-flush the Langfuse span processor before returning so local development and short-lived retry/error paths do not depend on background export timing. The terminal bridge `result` payload includes `trace_id` when available so downstream clients or operators can correlate that run with Langfuse without making tracing mandatory for local development.

**Progressive builder updates:** both the primary shared `/api/openclaw` bridge and the forge-chat fallback now run the same bounded intermediate-update scanner while architect text streams. They emit ordered `event: intermediate` frames for `identity`, `skill_discovered`, `tool_hint`, `trigger_hint`, and `channel_hint`, and `sendToArchitectStreaming()` forwards those events so `BuilderAgent` can progressively populate AG-UI wizard fields before `ready_for_review` arrives.

---

## OpenClaw Client Library

### `lib/openclaw/api.ts` — `sendToArchitectStreaming()`
HTTP client that calls `/api/openclaw`, consumes SSE, returns `ArchitectResponse`. The client request can now include a stable `requestId` and `AbortSignal` so one builder message maps to one logical architect run and route changes/reset can cancel the in-flight bridge call.

### Builder Test Contract
`agent-builder-ui/package.json` now exposes a first-class unit-test contract: `npm test` fans out into isolated Bun buckets (`test:unit:api`, `test:unit:store`, `test:unit:ag-ui`, `test:unit:core`) instead of relying on one giant `bun test` invocation. That split matters because Bun `mock.module(...)` state is process-global in this package, so suites that mock shared modules like `@/lib/openclaw/api` leak into each other when run in one process. Production `typecheck` also excludes `*.test.ts` plus `e2e/**` from the build-time TS program, and Playwright specs that hit non-dev platform routes must seed builder auth cookies plus mock `GET /users/me` before navigation because the auth gate now fails closed outside local development.

### `lib/openclaw/types.ts`
All TypeScript interfaces for the architect protocol. See [[005-data-models]].

### `lib/openclaw/agent-config.ts`
Agent configuration utilities.

---

## Auth State

Page-route auth gating is now active per [[SPEC-agent-builder-auth-gate]] and the broader [[SPEC-app-access-and-org-marketplace]] slice. `middleware.ts` protects non-auth pages by redirecting requests without auth cookies to `/authenticate?redirect_url=...`, and `SessionInitializationWrapper.tsx` fails closed after hydration when user bootstrap proves the session is missing or lacks `appAccess.builder`. Recoverable multi-org sessions now use the same tenant-switch seam as the customer app: builder bootstrap reuses `memberships[]` plus `POST /api/auth/switch-org` to move into the first eligible developer org before giving up. The auth page stays public, but existing sessions are redirected back into the requested platform route instead of remaining on the login screen. Local development no longer bypasses builder page auth; local testing now uses the shipped `/authenticate` local login/register fallback when no external auth provider is configured.

Builder data access is now fail-closed as well. The backend `GET/PATCH/DELETE /api/agents*` family is no longer a global developer catalog; those routes now require an active developer-org membership and only return or mutate agents owned by the current creator. To stay compatible with that contract, builder browser code now uses `lib/auth/backend-fetch.ts` for protected agent, forge, credential, and skill requests so cross-origin backend cookies or the current bearer token are always forwarded during local development and ordinary builder use.

The same auth/session layer now guards against redirect loops caused by stale builder routes or bad deep links. `lib/auth/session-guard.ts` only honors auth `redirect_url` values that resolve to known builder routes (`/`, `/agents`, `/agents/...`, `/tools`, `/activity`, `/settings`, `/marketplace`) and fails closed back to `/agents` for invalid targets or self-referential `/authenticate?...` redirects. The builder still carries explicit placeholder pages for `/activity` and `/settings`, and `/marketplace` now behaves as a forwarding surface: it exists to catch stale builder bookmarks, but it directs users to the actual customer marketplace destination instead of claiming the feature is unavailable. The forwarding target is controlled by `NEXT_PUBLIC_MARKETPLACE_URL`, with a local-development fallback to `http://localhost:3000/marketplace`.

That local testing path is sensitive to two setup details. First, `NEXT_PUBLIC_AUTH_URL` must stay blank in local builder env; if it points at another app, `/authenticate` renders the external login button instead of the seeded developer email/password form. Second, builder browser requests include `ngrok-skip-browser-warning`, so ruh-backend CORS must allow that header or the initial `/api/auth/me` bootstrap preflight will fail and the auth page will appear stuck on the loading spinner.

The builder user-profile dropdown now doubles as the manual developer-org switcher. When the current user belongs to multiple active developer orgs, the dropdown lists them and calls the same `switch-org` flow before refreshing the active builder session.

## Related Specs

- [[SPEC-agent-builder-auth-gate]] — current fail-closed page-auth contract while token hardening remains separate
- [[SPEC-app-access-and-org-marketplace]] — next program slice that removes the remaining local bypass and restricts builder access to developer-org sessions only

The current auth/session implementation is still intentionally browser-readable: `authCookies.ts` sets both auth cookies with `httpOnly: false`, `SessionInitializationWrapper.tsx` still copies the access token into the persisted `useUserStore`, and client axios interceptors read/refresh those tokens directly. That model remains transitional and should not be extended by future auth work; the hardening follow-up is [[SPEC-agent-builder-session-token-hardening]]. This run removes the old local page-bypass and now restores fail-closed developer-org gating under the current cookie model.

The remaining local-runtime caveat moved from the builder bridge to the self-hosted Langfuse stack itself: localhost development now reaches `/api/openclaw` without the production `/users/me` dependency, and completed bridge runs flush Langfuse spans deterministically. If local Langfuse still appears empty after that, the next place to inspect is the self-hosted Langfuse app or worker state rather than the builder bridge auth gate. See [[LEARNING-2026-03-28-local-builder-bridge-auth-gap]].

## Browser Security Headers

`next.config.ts` now emits an app-wide first-pass browser header policy from `lib/security-headers.ts`: CSP, anti-framing, `nosniff`, referrer policy, and a locked-down permissions policy. The builder's `connect-src` is still environment-aware because browser code directly calls `NEXT_PUBLIC_API_URL`, and `img-src` includes the same remote image hosts already allowed by Next image config.

The builder is now statically light-only at the app shell. `app/layout.tsx` no longer injects a theme-forcing inline script, and `Providers.tsx` no longer wraps the tree in `next-themes` because that package injects its own boot script even for a forced/light-only setup.

---

## Key Dependencies

- `zustand` + `zustand/middleware` — state management with persistence
- `ws` — WebSocket client in the bridge route
- `js-yaml` — YAML parsing for alternate response format
- `@tanstack/react-query` — data fetching (via `QueryProvider`)
- `shadcn/ui` — component library

---

## Feature Specs

- [[SPEC-agent-edit-config-persistence]] — Improve Agent now persists metadata plus architect config before hot-pushing running sandboxes
- [[SPEC-agent-create-deploy-handoff]] — new-agent create completion now hands off into the real first-deploy route
- [[SPEC-agent-config-apply-contract]] — deploy, hot-push, and Mission Control must treat sandbox config apply as a verified success/failure contract
- [[SPEC-agent-sandbox-health-surface]] — deployed-agent surfaces poll sandbox status and use explicit runtime/container signals instead of inferring liveness from persisted records
- [[SPEC-agent-model-settings]] — LLM provider & model selector (Settings tab on agent chat page)
- [[SPEC-agent-builder-architect-protocol-normalization]] — newer architect payloads are normalized into the stable builder create-flow contract
- [[SPEC-agent-builder-gateway-error-reporting]] — terminal provider-auth failures from the architect run are surfaced directly instead of being mislabeled as gateway outages
- [[SPEC-architect-bridge-retry-safety]] — create-flow architect requests use stable request IDs, support cancelation, and stop retrying after gateway acceptance
- [[SPEC-architect-exec-approval-policy]] — builder bridge classifies exec approval requests, emits structured approval events, and fails closed for unsafe tool runs
- [[SPEC-google-ads-agent-creation-loop]] — Google Ads is the proving-case create flow, with persisted MCP-style tool metadata and supported trigger definitions
- [[SPEC-agent-discovery-doc-persistence]] — approved PRD/TRD discovery docs now persist through autosave, save, reopen, and Improve Agent review
- [[SPEC-agent-builder-channel-persistence]] — builder-selected messaging channels now persist on the saved agent contract and stay visible through save, reopen, and deploy handoff
- [[SPEC-agent-webhook-trigger-runtime]] — signed inbound webhook runtime for `webhook-post`, including one-time deploy reveal plus masked persisted metadata on later reads
- [[LEARNING-2026-03-27-webhook-trigger-secret-redaction]] — deploy may reveal the full webhook secret once, but later agent reads must redact verifier material
- [[SPEC-agent-improvement-persistence]] — persists builder recommendations and operator decisions as saved agent metadata
- [[SPEC-tool-integration-workspace]] — `/tools` and the Connect Tools sidebar share one research contract and fail-closed credential handoff for `mcp`, `api`, and `cli`
- [[SPEC-selected-tool-mcp-runtime-apply]] — deploy/runtime apply writes only the selected configured MCP connectors and clears stale `.openclaw/mcp.json` state
- [[SPEC-copilot-config-workspace]] — default Co-Pilot mode renders its phase stepper and active step content inside the Agent's Computer Config tab instead of a standalone right-side rail
- [[SPEC-create-flow-static-workspace-tabs]] — create-flow Co-Pilot keeps the selected workspace tab static instead of auto-switching during builder activity
- [[SPEC-agent-computer-terminal-shell]] — the shared Agent's Computer terminal tab now uses a bounded provisioning-style shell with embedded prompt chrome
- [[SPEC-builder-terminal-transcript-isolation]] — builder terminal commands run as workspace-only activity and stay out of the visible transcript while their history remains replayable in Agent's Computer
- [[SPEC-builder-contextual-refine-loop]] — builder suggestions switch from canned examples to current-agent prompts, Think loading cannot regress after stage advancement, and post-build architect chat runs receive a richer refine-mode state snapshot
- [[SPEC-agent-builder-gated-skill-tool-flow]] — Co-Pilot stays locked on purpose metadata until the architect generates a real skill graph, resolves skills against the registry, and clears unresolved custom-skill blockers
- [[SPEC-pre-deploy-agent-testing]] — review mode can test an in-progress agent through the architect bridge with isolated test sessions and SOUL prompt injection
- [[SPEC-gateway-tool-events]] — structured sandbox tool events let live chat surfaces switch workspaces and render real-time tool activity
- [[SPEC-agent-builder-session-token-hardening]] — builder auth moves to `HttpOnly` token cookies, server-owned session checks, and no token persistence in browser state
- [[SPEC-agent-builder-auth-gate]] — builder routes and session bootstrap fail closed under the current transitional cookie model
- [[SPEC-agent-builder-bridge-auth]] — `/api/openclaw` validates the caller session server-side and rejects cross-site requests before opening the architect gateway
- [[SPEC-multi-tenant-auth-foundation]] — `/authenticate` gains a local login/register fallback for testing when no external auth provider is configured, while future org-aware session work stays backend-driven
- [[SPEC-web-security-headers]] — builder responses emit a documented first-pass CSP plus baseline anti-framing, referrer, nosniff, and permissions headers
- [[SPEC-agent-readable-system-events]] — architect bridge requests now correlate optional Langfuse traces with backend-owned system events for agent-readable observability
- [[SPEC-deployed-chat-browser-workspace]] — deployed-agent Browser tab consumes structured browser SSE frames for timeline, preview, and takeover state
- [[SPEC-deployed-chat-workspace-history]] — deployed-agent chat persists a bounded workspace replay envelope and rehydrates browser state from historical conversations
- [[SPEC-deployed-chat-task-and-terminal-history]] — deployed-agent chat also rehydrates bounded task-progress and terminal replay from the shared workspace envelope
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — deployed-agent Files tab lists recent workspace outputs, renders safe previews, and exposes artifact downloads
- [[SPEC-deployed-chat-artifact-preview]] — deployed-agent Files tab classifies outputs, renders HTML/markdown richly, and offers gallery-mode browsing plus optional artifact metadata
- [[SPEC-deployed-chat-code-control-handoff]] — deployed-agent Files tab adds session-scoped ownership cues, copy actions, and bounded workspace export
- [[SPEC-control-plane-audit-log]] — builder approval and bridge-side sensitive actions should emit the shared backend-owned audit event shape
- [[SPEC-shared-codex-oauth-bootstrap]] — the architect gateway can use the same shared Codex/OpenClaw auth convention as new sandboxes, but the bridge still uses gateway bearer auth
- [[SPEC-agui-protocol-adoption]] — Replace custom ChatEvent/ChatTransport with AG-UI protocol standard; migrate BuilderState to event-sourced shared state
- [[SPEC-shared-codex-retrofit]] — shared-Codex sandboxes are surfaced to the deployed-agent UI, which locks provider switching and routes chat through `openclaw-default`
- [[SPEC-conversation-history-pagination]] — deployed-agent history/chat load newest pages first and fetch older conversations/messages explicitly
- [[SPEC-deployed-chat-workspace-memory]] — deployed-agent chat persists bounded workspace memory and applies it only to new conversations
- [[SPEC-local-langfuse-docker]] — documents the local Langfuse stack and env overlay that make bridge trace export inspectable on localhost

## Related Learnings

- [[LEARNING-2026-03-28-repo-testability-audit]] — builder test cost is dominated by large route, hook, and page modules that couple network transport, autosave, workspace state, and UI composition
- [[LEARNING-2026-03-28-agent-readable-system-events]] — Langfuse belongs on the Node bridge as additive architect tracing, not as a replacement for backend-owned runtime event history
- [[LEARNING-2026-03-28-local-langfuse-docker-bootstrap]] — local bridge trace inspection works best through an isolated Langfuse stack and an ignored `LANGFUSE_*` overlay
- [[LEARNING-2026-03-28-agent-builder-test-bucketing-and-auth-fixture]] — Bun mock isolation and active builder auth gating require isolated unit-test buckets plus auth-aware Playwright fixtures
- [[LEARNING-2026-03-28-local-builder-bridge-auth-gap]] — local builder pages boot in development, but the shared bridge still fails without the external `/users/me` session-validation contract
- [[LEARNING-2026-03-26-create-deploy-handoff-gap]] — captured the earlier handoff gap before new-agent completion started entering the real first-deploy workflow
- [[LEARNING-2026-03-26-create-deploy-handoff-contract]] — first deploy must reuse the saved draft id plus finalized connector state rather than treating handoff as a simple route change
- [[LEARNING-2026-03-27-existing-agent-deploy-entrypoint-gap]] — the existing-agent Co-Pilot `Deploy Agent` CTA is still save-only, and the real `/agents/[id]/deploy` page depends on async store hydration before it can render the saved agent
- [[LEARNING-2026-03-26-create-draft-recovery-gap]] — `/agents/create` autosaves safe drafts, but route entry still needs an explicit resume-vs-fresh contract so stale Co-Pilot singleton state does not leak across sessions
- [[LEARNING-2026-03-30-create-agent-refresh-hydration-gap]] — `/agents/create` refresh recovery needs backend agent hydration plus a safe local resume cache; warm Zustand state alone is not sufficient
- [[LEARNING-2026-03-26-copilot-draft-config-persistence-gap]] — the default Co-Pilot shell claims `Draft saved`, but autosave still excludes the live selected-skill/tool/trigger Configure state until final completion
- [[LEARNING-2026-03-30-forging-status-draft-autosave-gap]] — forge-backed drafts keep `status: forging`, so backend metadata PATCH validation must accept that state or `/agents/create?agentId=...` autosave fails immediately
- [[LEARNING-2026-03-26-connect-tools-catalog-contract]] — Connect Tools must use registry-backed cataloging and let researched seeds promote into real supported connector ids
- [[LEARNING-2026-03-26-trigger-catalog-contract]] — trigger selection, suggestion, and reopen normalization should share one runtime-backed catalog helper
- [[LEARNING-2026-03-26-improve-agent-copilot-contract]] — Improve Agent needs an explicit saved-agent Co-Pilot seed and a separate completion branch from new-agent deploy handoff
- [[LEARNING-2026-03-26-architect-approval-policy]] — the bridge now denies non-allowlisted exec requests immediately and emits structured approval events instead of silently running tools
- [[LEARNING-2026-03-25-control-plane-audit-gap]] — bridge auth, approval policy, and secret-handling work still need a shared audit trail for architect-side sensitive actions
- [[LEARNING-2026-03-27-agent-builder-bridge-auth-contract]] — `/api/openclaw` must validate the current builder session and same-origin request integrity before spending server-held gateway credentials
- [[LEARNING-2026-03-27-agent-builder-channel-persistence-gap]] — captured the earlier saved-agent gap before planned messaging channels started persisting through save, reopen, and deploy handoff
- [[LEARNING-2026-03-27-agent-builder-channel-persistence-contract]] — shipped `channels[]` persistence keeps builder-selected messaging plans on the saved agent without exposing runtime secrets
- [[LEARNING-2026-03-27-architect-structured-config-gap]] — explicit architect `tool_connections` and `triggers` should normalize before AG-UI draft state instead of being reconstructed later from hints
- [[LEARNING-2026-03-25-control-plane-rate-limit-gap]] — the architect bridge currently has retry logic but no caller throttling or in-flight concurrency guard for the shared privileged gateway
- [[LEARNING-2026-03-25-conversation-history-pagination-gap]] — captured the earlier full-history read gap before the shared bounded pagination contract shipped
- [[LEARNING-2026-03-25-agent-builder-session-token-exposure]] — builder auth currently exposes access and refresh tokens to browser JavaScript and persisted Zustand state, so route-gating work should not finalize the auth model until token storage is hardened
- [[LEARNING-2026-03-25-web-security-headers-gap]] — captures the original missing-header gap and the follow-on implementation note that light-only builder shells should avoid `next-themes` because it injects an inline boot script
- [[LEARNING-2026-03-25-architect-bridge-retry-safety]] — bridge transport retries currently resend `chat.send` with a new idempotency key and no client abort path, so transient disconnects can duplicate architect runs or tool side effects
- [[LEARNING-2026-03-25-sse-heartbeat-idle-timeout-gap]] — the browser-facing architect SSE route can still be dropped by proxy idle timeouts during healthy long-running work because it emits no keepalive frames between lifecycle/result events
- [[LEARNING-2026-03-25-architect-sse-final-buffer]] — `sendToArchitectStreaming()` must process the leftover SSE buffer when the stream closes because the last `result` event may arrive without a trailing blank-line delimiter
- [[LEARNING-2026-03-25-architect-sse-crlf-framing]] — `sendToArchitectStreaming()` must normalize CRLF-framed SSE chunks before splitting event boundaries or multi-event streams collapse into one invalid parse block
- [[LEARNING-2026-03-25-architect-sse-multiline-data]] — `sendToArchitectStreaming()` must rejoin all `data:` lines within one SSE event before parsing JSON results
- [[LEARNING-2026-03-25-architect-workflow-normalization]] — `ready_for_review` normalization must preserve architect-supplied `workflow.steps[].wait_for` edges instead of flattening them into sequential dependencies
- [[LEARNING-2026-03-26-agent-create-session-hang]] — the live Co-Pilot create flow can stall after `start` for particular architect session ids even though mocked SSE rendering still works, so browser debugging should verify the bridge response with the same `session_id`
- [[LEARNING-2026-03-26-post-accept-run-recovery-gap]] — the bridge now fails closed after accepted architect runs disconnect, but the builder UI still drops that uncertainty context and gives operators no explicit fork-or-reset recovery path
- [[LEARNING-2026-03-26-create-flow-in-flight-config-gap]] — `/agents/create` still loses unsaved Configure choices across Review/back-navigation unless tool and trigger edits are lifted into page-owned session state
- [[LEARNING-2026-03-26-create-flow-pre-save-credentials-gap]] — captured the pre-fix gap that led to the shipped fail-closed credential handoff in [[SPEC-tool-integration-workspace]]
- [[LEARNING-2026-03-26-configure-step-contract-evolution]] — the original configure-step task closed under a safer metadata-plus-credential-endpoint split rather than the earlier inline-secret sketch
- [[LEARNING-2026-03-26-connect-tools-discovery-gap]] — the Google Ads create lane still enters Connect Tools through keyword heuristics and `MOCK_TOOLS` fallback instead of a truthful registry-and-research-driven connector catalog
- [[LEARNING-2026-03-25-agent-edit-config-drift]] — the Improve Agent flow currently saves display metadata without persisting the edited `skillGraph` / `workflow` / `agentRules`, so future deploys and hot-pushes cannot rely on the backend-backed agent snapshot yet
- [[LEARNING-2026-03-25-manus-parity-focus]] — the deployed-agent chat page is now the active project-focus target for Manus-style workspace parity across browser, editor/files, terminal, artifacts, connectors, and productization surfaces
- [[LEARNING-2026-03-25-deployed-chat-browser-event-pass-through]] — the deployed-agent Browser tab can reuse raw sandbox chat SSE and consume top-level `browser` / `browser_event` frames without a new backend route
- [[LEARNING-2026-03-25-deployed-chat-browser-workspace-gap]] — the deployed-agent chat page now has a heuristic Browser tab, but it still lacks a structured browser-workspace contract and broader runtime-workspace telemetry
- [[LEARNING-2026-03-25-deployed-chat-files-artifacts-workspace-gap]] — after the browser slice, the deployed-agent chat page still has no files/editor or artifact preview contract, so generated workspace outputs remain trapped in chat prose and terminal output
- [[LEARNING-2026-03-25-deployed-chat-research-workspace-gap]] — after browser/files/terminal slices are scoped, the next uncovered parity gap is a connector-aware research workspace with source provenance and result-bundle visibility on the deployed-agent chat page
- [[LEARNING-2026-03-25-deployed-chat-productization-surface-gap]] — after the research slice, the next uncovered parity gap is a productization/operator surface for preview, publish, access, analytics, and app/data visibility on the deployed-agent chat page
- [[LEARNING-2026-03-25-deployed-chat-persistent-workspace-memory-gap]] — after productization coverage is represented, the remaining focus-ordered parity gap is durable workspace memory for reusable instructions, pinned references, and continuity across deployed-agent chats
- [[LEARNING-2026-03-25-deployed-chat-workspace-memory-contract]] — the first shipped workspace-memory slice persists agent-level memory, edits it from Mission Control, and applies it only to new deployed-chat conversations
- [[LEARNING-2026-03-25-deployed-chat-code-control-gap]] — once the coarse parity slices are represented, the next missing operator-value package is code-control handoff: safe export, ownership cues, and workspace-bundle download from the deployed-agent page
- [[LEARNING-2026-03-25-deployed-chat-code-control-contract]] — the shipped handoff slice scopes summary and archive export to the active session workspace so ownership cues stay bounded per conversation
- [[LEARNING-2026-03-25-deployed-chat-editor-iteration-gap]] — after preview/export surfaces exist, the next missing code/editor loop is bounded write-back editing with diff visibility and preview-coupled validation on the deployed-agent page
- [[LEARNING-2026-03-26-deployed-chat-local-browser-gap]] — the next uncovered browser-parity gap is local-browser/operator handoff for logged-in or auth-blocked tasks that cloud browser mode cannot finish alone
- [[LEARNING-2026-03-26-deployed-chat-workspace-history-gap]] — structured deployed-chat workspace state still disappears on refresh because persisted conversations store raw text only
- [[LEARNING-2026-03-26-deployed-chat-workspace-history-contract]] — persist replay as a versioned per-message `workspace_state` envelope so future workspace tabs reuse one bounded model
- [[LEARNING-2026-03-27-deployed-chat-task-terminal-history-contract]] — task-progress and terminal continuity should extend the same shared `workspace_state` envelope rather than introducing another replay store
- [[LEARNING-2026-03-26-deployed-chat-task-terminal-history-gap]] — browser replay now survives, but task-plan and terminal/process context still disappear because historical messages do not hydrate those surfaces
- [[LEARNING-2026-03-26-agui-cutover-gap]] — the AG-UI migration is partially landed, but the live builder flow still depends on legacy transport/state seams and needs an explicit cutover package
- [[LEARNING-2026-03-26-agui-state-snapshot-gap]] — the builder still treats `skill_graph_ready` and wizard metadata custom events as its real state contract, so AG-UI snapshot/delta adoption needs its own worker-owned slice
- [[LEARNING-2026-03-27-agui-forge-state-gap]] — the browser-capable forge workspace path still keeps readiness and failure state on `builder-state.ts`, so the AG-UI cutover cannot safely retire that hook until forge lifecycle moves onto the shared builder contract
- [[LEARNING-2026-03-27-agui-message-lifecycle-gap]] — the AG-UI adapters already emit text-message lifecycle events, but `useAgentChat()` still rebuilds transcript turns outside that contract and needs a dedicated transcript-migration slice
- [[LEARNING-2026-03-27-shared-bridge-intermediate-update-gap]] — captured the pre-fix producer gap and the follow-up rule that shared and forge architect paths must keep one bounded intermediate-update contract
- [[LEARNING-2026-03-26-agui-delayed-tool-call-wrapper]] — AG-UI text parsing must ignore delayed `</tool_call>` chunks that can arrive after `</function>` in a later SSE delta
- [[LEARNING-2026-03-26-google-ads-review-deploy-config-gap]] — persisted Google Ads tool/trigger state now exists, but review/improve/deploy still flatten it back into text-only summaries and generic labels
- [[LEARNING-2026-03-26-copilot-review-readiness-gap]] — the default Co-Pilot review step still collapses tool/trigger readiness into plain names, so the primary create-flow review surface cannot explain deploy blockers even though shared formatter helpers already can
- [[LEARNING-2026-03-26-soul-config-context-gap]] — review-mode `Test Agent` and deploy-time `SOUL.md` should share one safe saved-config summary so prompt behavior stays aligned with Review and Deploy
- [[LEARNING-2026-03-26-google-ads-deploy-readiness-gap]] — deploy gating still ignores `missing_secret` Google Ads tools and unsupported trigger state even though the saved agent contract now knows when runtime config is not ready
- [[LEARNING-2026-03-26-trigger-selection-truthfulness-gap]] — the Configure trigger picker still labels `chat-command` as supported and defaults to it even though the current runtime only materializes schedule triggers
- [[LEARNING-2026-03-26-builder-hint-truthfulness-gap]] — upstream architect hint normalization still seeds fake connector and trigger ids into AG-UI metadata even after the visible Configure surfaces started moving toward truthful catalogs
- [[LEARNING-2026-03-26-builder-hint-normalization-contract]] — builder metadata, autosave, and Configure now share one truthful connector/trigger hint contract
- [[LEARNING-2026-03-27-google-ads-connector-contract-split]] — the backend already supports a direct `google-ads` MCP path, but the builder registry and hint normalization still collapse Google Ads onto Workspace/manual-plan behavior
- [[LEARNING-2026-03-27-connector-readiness-validation-gap]] — the current connector state model still equates "encrypted secrets exist" with "configured", so future MCP-first Google Ads work should separate stored secrets from verified connector readiness
- [[LEARNING-2026-03-27-copilot-connect-tools-use-case-gap]] — the embedded Co-Pilot Tools step still drops the live agent description before catalog inference and auto-research, so the main create path can give weaker connector recommendations than the advanced Configure fallback
- [[LEARNING-2026-03-27-trigger-improvement-projection-gap]] — improvement metadata already allows `trigger` recommendations, but live derivation and projection still stop at connector advice so accepted schedule guidance does not become saved trigger state
- [[LEARNING-2026-03-26-improvement-acceptance-config-gap]] — accepted builder improvements are persisted, but they still do not project into real connector/trigger config state
- [[LEARNING-2026-03-26-review-edit-persistence-gap]] — Review currently exposes editable skills/triggers, but confirming Review still drops those edits before Configure/save unless the session contract projects them back into canonical state
- [[LEARNING-2026-03-26-google-ads-improvement-state-gap]] — the Google Ads focus asks accepted builder improvements to become saved product state, but the current saved-agent and AG-UI contracts still have nowhere to persist those recommendations
- [[LEARNING-2026-03-27-agent-runtime-env-requirements-gap]] — runtime env requirements need a first-class saved contract and deploy-time `.openclaw/.env` write instead of advisory rule text
- [[LEARNING-2026-03-30-copilot-ship-runtime-input-readiness-gap]] — Ship-stage activation must honor the same required-runtime-input blockers and config-push success contract as backend `configure-agent`
- [[LEARNING-2026-03-27-google-ads-customer-id-contract-split]] — Google Ads `Customer ID` is non-secret runtime state and should not be duplicated inside the encrypted connector credential form
- [[LEARNING-2026-03-27-copilot-test-agent-parity-gap]] — Co-Pilot review test chat should reuse the same review snapshot and SOUL contract as the advanced Review screen
- [[LEARNING-2026-03-27-custom-built-skill-reopen-gap]] — persisted custom-built skill markdown must reopen as `custom_built` rather than regressing to unresolved state
- [[LEARNING-2026-03-27-selected-skills-runtime-contract-gap]] — Choose Skills currently rewrites only the shallow `skills[]` list, so deselected skills still survive in the saved `skillGraph` and deploy contract until runtime projection lands
- [[LEARNING-2026-03-27-guided-mode-contract-bypass]] — the old Guided mode used to bypass the saved-config/deploy contract, so `/agents/create` now retires that entry point and fails closed to Co-Pilot for new-agent creation
- [[LEARNING-2026-03-26-agent-improvement-persistence-contract]] — builder recommendations should persist as metadata-only saved agent state so review, reopen, and deploy read one source of truth
- [[LEARNING-2026-03-26-improve-agent-copilot-gap]] — existing-agent `Build` still enters the legacy advanced-chat shell because `/agents/create` defaults `editingAgentId` sessions to `chat`, bypassing the shipped Co-Pilot workspace entirely
