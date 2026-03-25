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
- Gateway health check timeout → WARNING logged, sandbox still saved

---

## Flow 2: Chat with a Sandbox

**UI path:** ruh-frontend → select sandbox → ChatPanel

```
1. User selects sandbox in SandboxSidebar → onSelect(record)
2. ChatPanel loads: POST /api/sandboxes/:id/conversations → ConversationRecord
3. User types message, submits
4. ChatPanel: POST /api/sandboxes/:id/chat
   Body: { conversation_id, messages: [{role:"user", content}], model, stream: true }
5. Backend:
   a. Looks up SandboxRecord (gateway URL + token)
   b. If `conversation_id` is present, verifies the ConversationRecord belongs to that sandbox
   c. Looks up ConversationRecord → openclaw_session_key
   d. Builds gateway URL: standard_url + /v1/chat/completions
   e. Adds headers: Authorization + x-openclaw-session-key
   f. Streams response from gateway back to client, preserving any top-level browser-workspace SSE frames unchanged
6. Client displays streamed response and, when browser-workspace frames are present, updates the Browser tab timeline / preview / takeover state on the deployed-agent chat page
7. Operator can open the deployed-agent Files tab, which calls `GET /api/sandboxes/:sandbox_id/workspace/files` and `GET /api/sandboxes/:sandbox_id/workspace/file` to inspect generated workspace outputs without leaving the chat page
8. Operator can download a selected artifact through `GET /api/sandboxes/:sandbox_id/workspace/file/download`
9. ChatPanel: POST .../messages { messages: [user, assistant] }  ← persist exchange
```

Cross-sandbox `conversation_id` reuse now fails with `404` before the backend calls the gateway.

---

## Flow 3: Build an Agent (Agent Builder)

**UI path:** agent-builder-ui → /agents/create

```
1. User navigates to /agents/create
2. useOpenClawChat initializes with greeting message
3. User types: "I want a daily news summarizer that posts to Slack"
4. sendMessage() → POST /api/openclaw { session_id, message, agent: "architect" }
5. Bridge route opens WebSocket to OPENCLAW_GATEWAY_URL:
   a. Receives connect.challenge
   b. Sends connect { role: "operator", auth: { token } }
   c. Receives hello-ok
   d. Sends chat.send { sessionKey: "agent:architect:main", message }
   e. Collects agent lifecycle events → SSE status events to client
   f. Receives chat { state: "final" } → finalizeResponse()
6. Response parsed as ArchitectResponse:
   - type: "clarification" → asks follow-up questions
   - type: "ready_for_review" → skillGraph + workflow extracted
7. User answers clarifications → repeat from step 3
8. When ready_for_review:
   - skillGraph stored in useOpenClawChat
   - User clicks "Proceed to Review"
9. Configure phase: user approves/rejects skills, sets up tools/triggers
10. Review phase: user reviews full agent spec and can optionally open "Test Agent"
    a. POST /api/openclaw { session_id, message, agent: "architect", mode: "test", soul_override }
    b. Bridge sends chat.send { sessionKey: "agent:test:<session_id>", message: "[SYSTEM] ... [USER] ..." }
    c. Test chat stays isolated from the architect build session
11. Deploy: POST /api/sandboxes/:id/configure-agent
    { system_name, soul_content, skills[], cron_jobs[] }
    → writes SOUL.md + skill SKILL.md files inside container
    → registers cron jobs via openclaw cron add
    → deploy UI only attaches the sandbox to the agent after this route returns `ok: true` and `applied: true`
    → failed apply returns non-2xx with structured step results and leaves the deploy flow in an error state
```

---

## Flow 4: Configure Telegram Channel

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

## Flow 5: Schedule a Cron Job

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

## Common Debugging

| Problem | Check |
|---|---|
| Gateway unreachable | `docker ps` — is container running? `docker exec openclaw-<id> openclaw gateway status` |
| Chat returns 503 | `standard_url` / `dashboard_url` in DB — is gateway_port correct? |
| Cron not running | `docker exec openclaw-<id> openclaw cron list --json` |
| Channel not connecting | Check bot token, run `openclaw channels status --probe` in container |
| SSE stream hangs | Check `/tmp/screen_teach_ffmpeg.log` inside container (wrong file — check `/tmp/openclaw-gateway.log`) |

---

## Related Learnings

- [[LEARNING-2026-03-25-deployed-chat-cancellation-gap]] — both deployed sandbox chat surfaces currently lack a cancelation contract, so tab closes or route changes can still leave gateway/model work running upstream

---

## Related Specs

- [[SPEC-agent-config-apply-contract]] — sandbox deploy and runtime config push must fail closed instead of reporting success on partial writes
- [[SPEC-chat-conversation-boundaries]] — keeps sandbox chat confined to conversations owned by the target sandbox
- [[SPEC-deployed-chat-browser-workspace]] — defines the structured browser-workspace SSE frames consumed by the deployed-agent Browser tab
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — defines the bounded workspace list/read/download contract used by the deployed-agent Files tab
- [[SPEC-agent-builder-architect-protocol-normalization]] — keeps the create-agent flow stable when the architect emits newer clarification, schema-proposal, or `ready_for_review` payload shapes
- [[SPEC-pre-deploy-agent-testing]] — adds the review-phase test loop that injects SOUL content into isolated `agent:test:*` builder sessions before deployment
