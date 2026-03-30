# Key Flows

[[000-INDEX|← Index]] | [[010-deployment|Deployment]]

End-to-end walkthroughs of the most important user journeys.

---

## Flow 1: Create a Sandbox

**UI path:** ruh-frontend → "New" button → SandboxForm

```
1. User clicks "+ New" in SandboxSidebar
2. SandboxForm renders — user enters sandbox_name
3. POST /api/sandboxes/create → { stream_id }
4. Client opens EventSource to GET /api/sandboxes/stream/:stream_id
5. SSE events display in progress log:
   - log: "Pulling node:22-bookworm..."
   - log: "Creating container 'openclaw-<uuid>'..."
   - log: "Installing OpenClaw..."
   - log: "Running OpenClaw onboarding..."
   - log: "LLM provider: OpenRouter" (or whichever key is set)
   - log: "Starting OpenClaw gateway..."
   - log: "Gateway is listening!"
   - result: { sandbox_id, gateway_url, gateway_token, ... }  ← persisted to DB
   - log: "Waiting for device pairing..."
   - approved: { message }  ← set approved=TRUE in DB
   - done
6. SandboxSidebar refreshes, shows new sandbox with green/yellow dot
```

**Duration:** ~2-5 minutes (npm install + onboarding takes the bulk)

**What can go wrong:**
- Docker not running → error on container create
- LLM keys missing → Ollama fallback (may not be running)
- Required bootstrap or gateway-start verification failure → sandbox create emits `error` and no sandbox row is persisted
- Optional browser/VNC enrichment failure → warning logs may still appear while ordinary chat-capable sandbox creation succeeds

---

## Flow 2: Chat with a Sandbox

**UI path:** ruh-frontend → select sandbox → ChatPanel

```
1. User selects sandbox in SandboxSidebar → onSelect(record)
2. ChatPanel loads: POST /api/sandboxes/:id/conversations → ConversationRecord
3. User types message, submits
4. ChatPanel: POST /api/sandboxes/:id/chat/ws
   Body: { conversation_id, messages: [{role:"user", content}] }
5. Backend:
   a. Looks up SandboxRecord (gateway URL + token)
   b. If `conversation_id` is present, verifies the ConversationRecord belongs to that sandbox
   c. Looks up ConversationRecord → openclaw_session_key
   d. Connects to the gateway over WebSocket and translates gateway frames back into SSE for the browser
   e. Adds the same conversation-scoped workspace rule and session key used by the plain `/chat` proxy
   f. Emits SSE `status`, tool start/end frames, assistant text deltas, and terminal `data: [DONE]`
6. Client displays streamed response, tool activity, and status labels such as `Thinking...`, `Planning...`, or `Using tool: ...`
7. Backend persists the delivered user + assistant exchange itself once the reply completes; if streamed persistence fails after content emission it sends `event: persistence_error` before the terminal `data: [DONE]`
8. HistoryPanel later reloads the newest paginated transcript window through `GET /api/sandboxes/:id/conversations/:conv_id/messages` and uses explicit `Load more` requests for older history
```

Cross-sandbox `conversation_id` reuse now fails with `404` before the backend calls the gateway.

When the deployed agent has saved workspace memory and the operator starts a brand-new conversation, the chat request prepends one bounded system-context message derived from that memory. Existing conversation transcripts are not rewritten.

---

## Flow 3: Research and Connect a Tool

**UI path:** agent-builder-ui → /tools or `/agents/create` → Connect Tools

```
1. Operator opens /tools or clicks "Research & Connect" from the builder Configure step
2. ToolResearchWorkspace sends a structured architect request through POST /api/openclaw
3. The architect returns a `tool_recommendation` result with one primary method: `mcp`, `api`, or `cli`
4. The UI renders the recommendation summary, rationale, credentials/env vars, setup steps, integration steps, validation steps, alternatives, and source links
5. If the result maps to a first-party direct connector, the sidebar can also collect credentials
6. For a brand-new agent, entered credential values stay only in ephemeral in-memory draft state until the first save returns a real agent id
7. Save then commits pending drafts through PUT /api/agents/:id/credentials/:toolId and patches connector status to `configured` only for the commits that actually succeeded
8. Unsupported/manual tools currently persist only the base saved connector metadata (`toolId`, readiness, auth kind, connector type, `configSummary`) with `status: "unsupported"` so the agent keeps a truthful manual-setup marker without claiming a live connection
9. Reopening the agent later reconciles `toolConnections[]` metadata against `GET /api/agents/:id/credentials` summary so the UI shows `configured` vs `missing_secret` truthfully
10. The richer `researchPlan` object already exists in frontend types/specs, but backend validator/store support has not landed yet, so agents should treat durable manual-plan persistence as intended behavior rather than current saved-agent truth
```

---

## Flow 4: Build an Agent (Agent Builder)

**UI path:** agent-builder-ui → /agents/create

```
1. User navigates to /agents/create
2. useOpenClawChat initializes with greeting message
3. User types: "I want a daily news summarizer that posts to Slack"
4. sendMessage() → POST /api/openclaw { session_id, request_id, message, agent: "architect" }
5. Bridge route opens WebSocket to OPENCLAW_GATEWAY_URL:
   a. Receives connect.challenge
   b. Sends connect { role: "operator", auth: { token } }
   c. Receives hello-ok
   d. Sends chat.send { sessionKey, message, idempotencyKey: request_id }
   e. Collects agent lifecycle events → SSE status events to client
   f. If the gateway asks for `exec.approval.requested`, the bridge auto-allows only a narrow safe inspection set; other requests emit `approval_required` / `approval_denied` and fail closed
   g. Receives chat { state: "final" } → finalizeResponse()
   h. If transport drops before `chat.send` acknowledgement, the bridge may retry with the same `request_id`; if transport drops after acknowledgement, the bridge fails closed with a typed error instead of resending the run
6. Response parsed as ArchitectResponse:
   - type: "clarification" → asks follow-up questions
   - type: "ready_for_review" → skillGraph + workflow extracted
7. User answers clarifications → repeat from step 3
8. When ready_for_review:
   - skillGraph stored in useOpenClawChat
   - AG-UI builder metadata is also reduced into the canonical safe draft payload, and `useAgentChat()` debounces `saveAgentDraft()` so a backend `draft` agent exists before the operator reaches Review
   - if the route is reopening a forge-backed draft, autosave preserves `status: forging` while patching metadata instead of forcing an artificial status transition
   - once approved discovery docs exist, the same saved draft is patched with `discoveryDocuments` so the PRD/TRD pair survives refresh and Improve Agent reopen
   - the Co-Pilot header and builder snapshot surface `Saving draft…`, `Draft saved`, or `Draft save failed` from that autosave loop
   - per [[SPEC-agent-create-session-resume]], route re-entry on `/agents/create?agentId=<id>` re-fetches that backend draft and overlays a safe local create-session cache, so refreshes recover in-progress non-secret state and forge linkage instead of reopening blank
   - per [[SPEC-create-flow-lifecycle-navigation]], that restored lifecycle keeps a separate furthest-unlocked stage, so the operator can click Build/Plan/Think in the stepper to inspect prior work and still return to Review without re-triggering the plan/build loop
   - User clicks "Proceed to Review"
   - the default Co-Pilot layout keeps a single `Agent's Computer` panel on the right; its `Config` tab shows the builder snapshot, phase stepper, and active step content instead of a separate wizard rail
   - in the shipped Co-Pilot path from [[SPEC-agent-builder-gated-skill-tool-flow]], the builder can also auto-generate the skill graph after debounced `name + description` entry; downstream builder tabs stay locked until that graph exists
9. Configure phase: user approves/rejects skills, sets up tools/triggers
   - when the operator approves the reviewed Plan stage, the build helper now sends the approved PRD/TRD plus the exact `architecture_plan` back through the architect and expects `skill_graph.nodes[].skill_md` in the build response, so the built skills stay aligned with the approved plan and draft autosave can persist real custom skill content
   - the `Skills` step now resolves each generated skill to `native`, `registry_match`, `needs_build`, or `custom_built` against the read-only backend registry
   - missing skills expose `Build Custom Skill`, which accepts an agent-local SKILL.md draft and clears the deploy blocker for that skill
   - tool connections now persist as structured metadata (`toolConnections[]`) rather than transient local booleans
   - required non-secret runtime env values now persist as `runtimeInputs[]`, with the first dedicated editor living in the Advanced Configure flow for values such as `GOOGLE_ADS_CUSTOMER_ID`
   - before the first save, Configure writes into one page-owned in-flight session snapshot, so Review ↔ Configure back-navigation preserves unsaved tool, runtime-input, trigger, credential-draft, and skill-selection choices instead of resetting to the last persisted agent record
   - the Connect Tools sidebar now embeds the same research workspace used by `/tools`, so the architect can recommend `mcp`, `api`, or `cli` before the operator connects anything
   - new-agent credential drafts stay ephemeral until the first agent save returns an id; the UI marks a connector `configured` only after the secure credential commit succeeds
   - supported triggers persist as `triggers[]` definitions, so deploy can prefer structured schedule metadata over regex-scraping rule prose
   - builder-surfaced `improvements[]` now persist as safe metadata with `pending` / `accepted` / `dismissed` state, so accepted Google Ads recommendations survive save, Improve Agent reopen, and deploy summary views
   - the current proving-case path is a Google Ads optimizer agent with a Google Ads MCP connection and weekday schedule trigger
   - the create-flow workspace now stays on the operator-selected tab during Co-Pilot; builder runtime activity no longer auto-switches focus to `terminal`, `code`, `browser`, or `preview`
   - manual commands entered in the builder `Terminal` tab now run as workspace activity and stay out of the left chat transcript unless the run produced no structured workspace artifact to replay
   - once the operator has entered a real name and description, the builder empty-state prompt chips become agent-specific follow-ups instead of unrelated canned ideas
10. Review phase: user reviews full agent spec and can optionally open "Test Agent"
    a. POST /api/openclaw { session_id, message, agent: "architect", mode: "test", soul_override }
    b. Bridge sends chat.send { sessionKey: "agent:test:<session_id>", message: "[SYSTEM] ... [USER] ..." }
    c. Test chat stays isolated from the architect build session
    c1. Non-test builder chat after Think/Plan/Build now re-seeds the architect with a refine-mode instruction plus current tools, runtime inputs, triggers/heartbeat, channels, architecture-plan summary, and SOUL summary so follow-up changes stay grounded in the current agent
    d. In the embedded Co-Pilot stepper, the final footer CTA is now `Deploy Agent` instead of a disabled `Next`, and it calls the same completion handler as the page-level header action
    d1. The stepper itself is non-destructive navigation, while the footer `Back` button is the destructive rewind/reset control for reopening an earlier phase
    e. Review reads persisted `toolConnections[]`, `runtimeInputs[]`, and `triggers[]` directly so connector readiness, runtime-input blockers, and trigger support details stay visible when the saved agent is reopened
11. First-deploy handoff:
    - for a new agent or autosaved draft, the create completion path now saves or promotes that same agent id, finalizes any pending first-save connector credential commits, and routes to `/agents/<id>/deploy?source=create`
    - when the saved config summary is already ready, that handoff includes `autoStart=1` so the deploy page immediately starts provisioning; otherwise the operator lands on the deploy page with a truthful saved/blocked summary instead of being dropped back to `/agents`
    - when the page is reopening an existing saved agent through `Build`, the same Co-Pilot workspace is seeded from that saved snapshot but completion remains on the Improve Agent contract: persist edits, hot-push running sandboxes when present, then return to `/agents`
    - both the page-level `Deploy Agent` CTA and the embedded Ship-stage `Save & Activate` button now fail closed on missing required runtime inputs, matching the backend `configure-agent` contract instead of treating blank runtime inputs as advisory-only
    - the Ship-stage callback must also stop on `pushAgentConfig().ok === false`; a failed forge config push is an activation failure, not a successful ship with a hidden warning
12. Deploy: POST /api/sandboxes/:id/configure-agent
    { system_name, soul_content, skills[], runtime_inputs[], cron_jobs[] }
    → writes SOUL.md + runtime env + skill SKILL.md files inside container
    → registers cron jobs via openclaw cron add
    → if `/agents/create` already autosaved a draft, the final create/deploy path upgrades that same `draftAgentId` record to `active` instead of creating a second agent
    → deploy UI only attaches the sandbox to the agent after this route returns `ok: true` and `applied: true`
    → missing required runtime inputs now fail closed with a `runtime_env` step before the route reports success
    → failed apply returns non-2xx with structured step results and leaves the deploy flow in an error state
    → deploy UI summarizes saved connector readiness, runtime-input completeness, and supported-vs-unsupported triggers from the persisted contract before sandbox creation begins
```

---

## Flow 5: Configure Telegram Channel

**UI path:** ruh-frontend → select sandbox → ChannelsPanel

```
1. ChannelsPanel loads: GET /api/sandboxes/:id/channels → current config (tokens masked)
2. User enters bot token, toggles enabled
3. PUT /api/sandboxes/:id/channels/telegram { enabled: true, botToken: "..." }
4. channelManager.setTelegramConfig():
   - openclaw config set channels.telegram.enabled true
   - openclaw config set channels.telegram.botToken <token>
   - restartGateway(): stop → sleep 2s → start
5. User starts Telegram conversation with the bot
6. GET /api/sandboxes/:id/channels/telegram/pairing → { codes: ["ABCD1234"] }
7. User enters code in UI
8. POST .../pairing/approve { code: "ABCD1234" }
   → openclaw pairing approve telegram ABCD1234
9. Pairing complete — Telegram user linked to agent
```

---

## Flow 6: Schedule a Cron Job

**UI path:** ruh-frontend → select sandbox → CronsPanel

```
1. CronsPanel: GET /api/sandboxes/:id/crons → list via openclaw cron list --json
2. User clicks "+ Add", fills form: name, schedule (cron/every/at), message
3. POST /api/sandboxes/:id/crons
   { name, schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
     payload: { kind: "agentTurn", message: "..." } }
4. Backend builds: openclaw cron add --json --name "..." --cron "0 9 * * *" --message "..." --session isolated --wake now
5. Runs in container → returns job record
6. Job now appears in cron list
7. At 9:00 UTC daily: openclaw triggers the agent with the message
```

---

## Flow 7: Deliver a Signed Webhook

**Caller path:** external service → `POST /api/triggers/webhooks/:public_id`

```
1. Caller sends JSON to the provisioned webhook URL
2. Headers include:
   - x-openclaw-webhook-secret: the one-time shared secret from deploy
   - x-openclaw-delivery-id: caller-managed stable delivery id for this event
3. Backend validates the secret against the stored hash
4. Backend validates the delivery id shape and payload size (max 64 KiB)
5. Backend reserves { public_id, delivery_id } in the replay ledger
6. If the same pair was already seen, backend returns 409 duplicate/replayed without invoking the sandbox
7. Backend resolves the agent's active sandbox
8. Backend forwards the payload into /v1/chat/completions with session key agent:trigger:<agent_id>:<trigger_id>
9. Backend updates safe trigger delivery metadata plus replay-ledger status to delivered or failed
10. Caller receives:
    - 202 on first accepted delivery
    - 409 on duplicate/replayed delivery or no active sandbox
    - 413 on oversized payload
```

---

## Common Debugging

| Problem | Check |
|---|---|
| Gateway unreachable | `docker ps` — is container running? `docker exec openclaw-<id> openclaw gateway status` |
| Chat returns 503 | `standard_url` / `dashboard_url` in DB — is gateway_port correct? |
| Cron not running | `docker exec openclaw-<id> openclaw cron list --json` |
| Channel not connecting | Check bot token, run `openclaw channels status --probe` in container |
| SSE stream hangs | Check `/tmp/openclaw-gateway.log` inside container |

For broader lifecycle drift, use `GET /api/admin/sandboxes/reconcile` with the admin token before trusting DB-only sandbox inventory or deleting rows by hand.

---

## Related Learnings

- [[LEARNING-2026-03-26-create-deploy-handoff-gap]] — captured the earlier handoff gap before new-agent completion started entering the first-deploy route
- [[LEARNING-2026-03-26-improve-agent-copilot-contract]] — Improve Agent now shares the Co-Pilot workspace, but it still requires a saved-agent seed and a separate completion branch from new-agent deploy handoff
- [[LEARNING-2026-03-27-agent-builder-channel-persistence-gap]] — captured the earlier saved-agent gap before planned messaging channels started persisting through save, reopen, and deploy handoff
- [[LEARNING-2026-03-25-deployed-chat-cancellation-gap]] — both deployed sandbox chat surfaces currently lack a cancelation contract, so tab closes or route changes can still leave gateway/model work running upstream
- [[LEARNING-2026-03-26-agent-create-session-hang]] — the live `/agents/create` Co-Pilot path can stall after the architect bridge reports `start`, so browser checks should verify the same builder `session_id` directly against `POST /api/openclaw`
- [[LEARNING-2026-03-30-forging-status-draft-autosave-gap]] — forge-backed create sessions keep `status: forging`, so metadata PATCH validation must accept that persisted state or `Draft save failed` appears on ordinary builder edits
- [[LEARNING-2026-03-27-tool-research-plan-persistence-gap]] — the saved connector contract still drops most structured tool research details after the operator saves a manual plan

---

## Related Specs

- [[SPEC-agent-config-apply-contract]] — sandbox deploy and runtime config push must fail closed instead of reporting success on partial writes
- [[SPEC-agent-create-deploy-handoff]] — create completion for new agents now hands off into `/agents/[id]/deploy` instead of exiting to the list
- [[SPEC-chat-conversation-boundaries]] — keeps sandbox chat confined to conversations owned by the target sandbox
- [[SPEC-atomic-chat-persistence]] — sandbox chat delivery now owns transcript persistence and explicit streamed commit-failure signaling
- [[SPEC-deployed-chat-browser-workspace]] — defines the structured browser-workspace SSE frames consumed by the deployed-agent Browser tab
- [[SPEC-deployed-chat-workspace-history]] — persists the versioned `workspace_state` envelope so Browser workspace state survives refresh and historical reopen
- [[SPEC-deployed-chat-task-and-terminal-history]] — extends the shared workspace-history envelope so task-progress and terminal replay survive refresh and historical reopen
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — defines the bounded workspace list/read/download contract used by the deployed-agent Files tab
- [[SPEC-deployed-chat-artifact-preview]] — extends the Files tab with artifact classification, rich previews, and gallery browsing
- [[SPEC-deployed-chat-code-control-handoff]] — defines the session-scoped handoff summary and bounded workspace bundle export layered on the Files tab
- [[SPEC-deployed-chat-workspace-memory]] — defines the persistent workspace-memory contract that Mission Control edits and new deployed chats apply
- [[SPEC-agent-builder-architect-protocol-normalization]] — keeps the create-agent flow stable when the architect emits newer clarification, schema-proposal, or `ready_for_review` payload shapes
- [[SPEC-architect-exec-approval-policy]] — the architect bridge no longer auto-allows every tool execution request and must surface approval outcomes truthfully
- [[SPEC-google-ads-agent-creation-loop]] — Google Ads is the proving-case builder path for persisted connector metadata and supported trigger definitions
- [[SPEC-agent-discovery-doc-persistence]] — approved PRD/TRD discovery docs now survive save, reopen, and Improve Agent review as part of the saved builder contract
- [[SPEC-agent-builder-channel-persistence]] — create and Improve Agent flows now preserve planned messaging channels through save and deploy handoff
- [[SPEC-agent-webhook-trigger-runtime]] — create/deploy flows can now provision `webhook-post` and accept signed inbound deliveries through the public webhook route
- [[SPEC-agent-improvement-persistence]] — keeps accepted builder recommendations visible after save, reopen, and deploy
- [[SPEC-tool-integration-workspace]] — `/tools` and builder Connect Tools now share a structured research flow plus fail-closed credential handoff
- [[SPEC-copilot-config-workspace]] — the default Co-Pilot create flow keeps a single Agent's Computer workspace and renders the active builder phase inside the Config tab
- [[SPEC-create-flow-static-workspace-tabs]] — create-flow Co-Pilot keeps workspace tabs static and user-controlled while the builder is active
- [[SPEC-builder-terminal-transcript-isolation]] — builder terminal commands stay in workspace history instead of echoing into the transcript
- [[SPEC-builder-contextual-refine-loop]] — builder suggestions become current-agent-specific and post-build architect runs use refine-mode with current config context
- [[SPEC-agent-builder-gated-skill-tool-flow]] — purpose metadata now gates the builder workspace, skills resolve through the registry, and unresolved custom skills block deploy
- [[SPEC-pre-deploy-agent-testing]] — adds the review-phase test loop that injects SOUL content into isolated `agent:test:*` builder sessions before deployment
- [[SPEC-sandbox-runtime-reconciliation]] — defines the operator reconcile/report flow for DB-only and container-only sandbox drift
