# SPEC: Agent LLM Provider & Model Settings

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[004-api-reference|API Reference]]

## Status
<!-- implemented -->
implemented

## Summary
Adds a Settings tab to the agent chat page (`/agents/[id]/chat`) where users can select the LLM provider and model their agent uses. Model selection is persisted in the agent store and passed as the `model` field in chat and conversation-creation requests. The tab also supports provider reconfiguration on a live sandbox and now prefers the sandbox's live `GET /api/sandboxes/:sandbox_id/models` list, falling back to a curated catalog only when model discovery is unavailable.

## Related Notes
- [[008-agent-builder-ui]] — the agent chat page and TabChat component being modified
- [[004-api-reference]] — `POST /api/sandboxes/:sandbox_id/chat` already accepts `model`; `POST /api/sandboxes/:sandbox_id/conversations` also accepts `model`
- [[005-data-models]] — `SavedAgent` type extended with `model?: string`
- [[007-conversation-store]] — conversation creation now includes the agent's model preference

## Specification

### New Tab: Settings
A 4th tab added to the agent chat page alongside Chat, All Chats, and Mission Control.

**Route:** `/agents/[id]/chat?tab=settings`

**UI:**
- Provider cards grouped by provider (Anthropic, OpenAI, Gemini, Ollama, OpenRouter)
- Each provider shows its available models as selectable cards
- Selected model shows a checkmark
- Dedicated "Configure Provider" panel
- Ephemeral API key input for cloud providers, base URL input for Ollama
- "Apply & Restart" action that updates the live sandbox and restarts the gateway
- Success/error feedback after provider reconfiguration

### Provider + Model Source
- `TabSettings` fetches `GET /api/sandboxes/:sandbox_id/models` after an active sandbox is selected.
- When the backend returns a real OpenAI-style model list, the Settings tab renders those models and groups them by inferred provider.
- When the backend returns `_synthetic: true`, the request fails, or the live list is empty, the Settings tab falls back to the curated catalog so the user can still pick a reasonable model.
- The provider configuration card metadata remains curated because the live model list does not include provider credential requirements or provider-default apply behavior.

### Data Flow
```
User selects model in TabSettings
        │
        ▼
GET /api/sandboxes/:sandbox_id/models
        │
        ├─ success with live data → render sandbox-returned models
        └─ synthetic/error/empty → render curated fallback catalog
        │
        ▼
useAgentsStore.updateAgent(id, { model: "claude-sonnet-4-6" })
        │ (persisted to localStorage)
        ▼
TabChat:sendMessage()
  ├─ ensureConversation() → POST /conversations { model: agent.model ?? "openclaw-default" }
  └─ POST /chat { model: agent.model ?? "openclaw-default", ... }

User configures provider in TabSettings
        │
        ▼
POST /api/sandboxes/:sandbox_id/reconfigure-llm
        │
        ▼
sandboxManager.reconfigureSandboxLlm()
  ├─ patch ~/.openclaw/openclaw.json
  ├─ rewrite auth-profiles.json
  ├─ rewrite ~/.openclaw/.env
  └─ restart gateway
        │
        ▼
TabSettings switches to provider default model if the current model belongs to a different provider
```

### SavedAgent Changes
```typescript
// hooks/use-agents-store.ts
export interface SavedAgent {
  // ...existing fields...
  model?: string;  // LLM model ID, e.g. "claude-sonnet-4-6". undefined = gateway default
}
```

### Files Changed
| File | Change |
|---|---|
| `hooks/use-agents-store.ts` | Add `model?: string` to `SavedAgent` |
| `agents/[id]/chat/page.tsx` | Add Settings tab to TABS array and render TabSettings |
| `agents/[id]/chat/_components/TabSettings.tsx` | Provider config panel + model selector |
| `agents/[id]/chat/_components/TabChat.tsx` | Pass `agent.model` in chat body and conversation creation |
| `ruh-backend/src/app.ts` | Add `POST /api/sandboxes/:sandbox_id/reconfigure-llm` |
| `ruh-backend/src/sandboxManager.ts` | Add live LLM reconfiguration helper for running sandboxes |

## Implementation Notes
- `TabSettings` uses `useAgentsStore()` directly (not prop-threaded) for consistency with the page pattern
- `TabSettings` keeps provider metadata local but treats sandbox model discovery as the source of truth for the model-card grid whenever the sandbox returns a real list
- `ensureConversation` in TabChat accesses `agent` via closure — no prop signature change needed
- Fallback: `agent.model ?? "openclaw-default"` used in both the chat body and conversation creation
- Provider secrets are ephemeral in the browser UI; they are not persisted to localStorage
- The backend mutates sandbox config in place and restarts the gateway instead of recreating the sandbox
- Successful provider apply keeps the selected model coherent by switching to the provider default when needed

## Test Plan
- Playwright e2e: verify backend-returned model IDs render in the Settings tab
- Playwright e2e: verify `model` field in chat request body when model is set
- Playwright e2e: verify fallback to `"openclaw-default"` when no model set
- Playwright e2e: verify model persists after page reload
- Playwright e2e: verify conversation creation passes model
- Playwright e2e: verify provider apply posts credentials and switches the active model to the provider default
- Backend unit test: verify live reconfiguration validates provider/model combinations and restarts the gateway
- Backend e2e test: verify `POST /api/sandboxes/:sandbox_id/reconfigure-llm` returns a masked success summary
