# SPEC: AG-UI Protocol Adoption (Option C)

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[011-key-flows|Key Flows]]

## Status
<!-- draft | approved | implemented | deprecated -->
draft

## Summary

Replace the custom `ChatEvent` / `ChatTransport` abstraction in `agent-builder-ui` with the [AG-UI protocol](https://docs.ag-ui.com) — an open, event-based standard for agent-frontend communication. This gives us 16 standardized event types, event-sourced shared state (replacing `BuilderState`), middleware for protocol bridging, and future interop with CopilotKit, assistant-ui, and Vercel AI SDK consumers.

AG-UI is transport-agnostic (HTTP SSE, binary protocol, WebSocket). It standardizes the event semantics, not the wire format. Our two existing transports (architect SSE bridge + sandbox chat proxy) become AG-UI transport adapters that emit standard events.

## Related Notes

- [[008-agent-builder-ui]] — Primary consumer of this migration
- [[004-api-reference]] — Backend endpoints that feed the transports
- [[003-sandbox-lifecycle]] — Sandbox chat proxy is one of the two transport backends
- [[011-key-flows]] — Agent creation and deployed chat flows will use AG-UI events
- [[SPEC-deployed-chat-browser-workspace]] — Browser workspace events become AG-UI custom events
- [[SPEC-deployed-chat-task-mode]] — Task plan events become AG-UI custom events
- [[SPEC-deployed-chat-workspace-memory]] — Workspace memory becomes part of AG-UI shared state

## Why Option C

The user evaluated three approaches:

| Option | Approach | Trade-off |
|--------|----------|-----------|
| A | MCP Apps (iframe-based) | Best for agents generating dynamic UI at runtime. Overhead: iframe sandbox, postMessage bridge. |
| B | A2UI-style declarative components | Fastest path. Agent returns JSON blueprints, we render our own components. ~80% of what we need already exists. |
| **C** | **AG-UI protocol adoption** | Most work upfront, but replaces custom abstractions with a standard. Future-proofs architecture. Enables ecosystem interop. |

Option C was chosen because it's more interesting architecturally and provides the strongest foundation for the platform's evolution.

---

## Specification

### 1. AG-UI Event Types → Current ChatEvent Mapping

The AG-UI protocol defines 16 core event types. Here's how they map to our current `ChatEvent` union:

| AG-UI Event | Our Current ChatEvent | Notes |
|---|---|---|
| `RunStarted` | _(implicit — stream opens)_ | New: explicit run lifecycle tracking with `threadId` + `runId` |
| `RunFinished` | `{ type: "done" }` | Direct replacement |
| `RunError` | `{ type: "error", message }` | Direct replacement, adds `code` field |
| `StepStarted` | `{ type: "tool_call", id, toolName }` | Maps to our `AgentStep` concept |
| `StepFinished` | `{ type: "tool_call_finish", id }` | Maps to step completion |
| `TextMessageStart` | _(implicit)_ | New: explicit message lifecycle |
| `TextMessageContent` | `{ type: "text_delta", content }` | Direct replacement. `delta` field instead of `content` |
| `TextMessageEnd` | _(implicit)_ | New: explicit message completion |
| `TextMessageChunk` | _(convenience — expands to Start+Content+End)_ | Simplifies streaming |
| `ToolCallStart` | `{ type: "tool_call", id, toolName }` | `toolCallId` + `toolCallName` fields |
| `ToolCallArgs` | `{ type: "tool_result", id, output }` | Streams tool arguments incrementally |
| `ToolCallEnd` | `{ type: "tool_call_finish", id }` | Direct replacement |
| `ToolCallResult` | _(new — tool output after execution)_ | Separates args from results |
| `ToolCallChunk` | _(convenience — expands to Start+Args+End)_ | Simplifies tool call streaming |
| `StateSnapshot` | `{ type: "skill_graph_ready", ... }` | Replaces our custom builder state event |
| `StateDelta` | _(new)_ | JSON Patch (RFC 6902) incremental state updates |

**Events without direct AG-UI equivalent (become Custom events):**

| Current ChatEvent | AG-UI Handling |
|---|---|
| `{ type: "thinking", content }` | AG-UI has draft `ReasoningMessageContent` events; use those or `Custom` |
| `{ type: "status", phase, message }` | `StepStarted` / `StepFinished` with step metadata |
| `{ type: "clarification", ... }` | `Custom` event with structured payload, or model as `TextMessageContent` + `StateDelta` |
| `{ type: "browser_event", event }` | `Custom` event preserving `BrowserWorkspaceEvent` shape |

Reasoning lifecycle rule:
- whichever combination of `Custom("reasoning")` and AG-UI `REASONING_*` events the transport emits, the frontend must treat them as one logical thinking step with one persistent step id so the live reasoning list and footer status can finish the same row cleanly.

### 2. Shared State (Replacing BuilderState)

Current `BuilderState`:
```typescript
interface BuilderState {
  sessionId: string;
  skillGraph: SkillGraphNode[] | null;
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  agentRules: string[];
}
```

AG-UI shared state model:
```typescript
// The AG-UI state object — replaces BuilderState and adds agent-mode state
interface AgentUIState {
  // Builder mode state
  sessionId: string;
  skillGraph: SkillGraphNode[] | null;
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  agentRules: string[];

  // Agent mode state (new — unified)
  browserWorkspace: BrowserWorkspaceState | null;
  taskPlan: TaskPlan | null;
  workspaceMemory: WorkspaceMemoryState | null;

  // Shared
  conversationId: string | null;
  runStatus: "idle" | "running" | "error";
}
```

State synchronization:
- **Agent → Frontend**: `StateSnapshot` on run start, `StateDelta` (JSON Patch) during streaming
- **Frontend → Agent**: State included in `RunAgentInput` on next `send()`
- **Library**: `fast-json-patch` for atomic patch application (same as AG-UI reference impl)

This replaces the current `useBuilderState()` hook with an AG-UI-native state store. Both builder and agent modes share the same state shape.

### 3. Transport Adapters

#### 3.1 Builder Transport Adapter

Wraps the existing architect SSE bridge (`POST /api/openclaw`) and translates `ArchitectResponse` objects into AG-UI events.

```
ArchitectResponse.type          → AG-UI Events
─────────────────────────────── ──────────────────────────────────
"clarification"                 → TextMessageChunk (conversational text)
"ready_for_review"              → StateSnapshot (full builder state)
                                  + TextMessageChunk (summary)
"agent_response"                → TextMessageChunk
"error"                         → RunError
```

Implementation: `lib/openclaw/agui-builder-transport.ts`
- Extends AG-UI `AbstractAgent`
- `run(input: RunAgentInput)` → calls `sendToArchitectStreaming()` → emits AG-UI events
- Session management (rotation on error) preserved
- The shared `/api/openclaw` bridge and the forge-chat fallback must both emit the same bounded `intermediate` SSE contract during text streaming so the builder transport can surface truthful progressive `identity`, `skill_discovered`, `tool_hint`, `trigger_hint`, and `channel_hint` updates on the default create flow instead of only at terminal review.
- For `ready_for_review`, the emitted `skill_graph_ready` snapshot should carry the normalized `skillGraph`, `workflow`, `systemName`, `agentRules`, plus `toolConnectionHints` and `triggerHints` derived from the same architect response so downstream builder state and draft autosave can consume one canonical event payload.
- The follow-on wizard control events still emit `wizard_update_fields`, `wizard_set_skills`, `wizard_connect_tools`, `wizard_set_triggers`, and `wizard_set_rules` so legacy Co-Pilot UI projections can stay synchronized while the new canonical metadata path lands.
- The shipped `/agents/create` draft slice keeps `useAgentChat()` as the autosave owner: it reduces those canonical builder events into safe draft metadata, debounces `saveAgentDraft()` once the builder has meaningful identity + graph state, mirrors `draftAgentId` / `draftSaveStatus` back into create-page builder state, and lets final deploy promote the same saved draft record to `active` instead of creating a duplicate agent.

#### 3.2 Agent Transport Adapter

Wraps the existing sandbox chat proxy (`POST /api/sandboxes/{id}/chat` SSE) and translates OpenAI-format SSE chunks into AG-UI events.

```
SSE Chunk Type                  → AG-UI Events
─────────────────────────────── ──────────────────────────────────
choices[0].delta.content        → TextMessageContent
choices[0].delta.reasoning      → Custom("reasoning", { content })
choices[0].delta.tool_calls     → ToolCallStart / ToolCallArgs
finish_reason: "tool_calls"     → ToolCallEnd (for each active call)
finish_reason: "stop"           → TextMessageEnd
{ phase }                       → StepStarted / StepFinished
{ tool, input }                 → ToolCallStart + ToolCallArgs
{ result }                      → ToolCallResult + ToolCallEnd
browser workspace events        → Custom("browser_event", { event })
[DONE]                          → RunFinished
```

Implementation: `lib/openclaw/agui-agent-transport.ts`
- Extends AG-UI `AbstractAgent`
- Preserves all existing SSE parsing logic (OpenAI format, custom gateway events, browser tool synthesis)
- `run(input: RunAgentInput)` → POST to chat proxy → parse SSE → emit AG-UI events

### 4. Client-Side Integration

#### 4.1 Packages

```json
{
  "@ag-ui/core": "^0.x",
  "@ag-ui/client": "^0.x",
  "fast-json-patch": "^3.x"
}
```

Optional (if we adopt CopilotKit rendering):
```json
{
  "@copilotkit/react-core": "^1.50",
  "@copilotkit/react-ui": "^1.50"
}
```

#### 4.2 React Hook

Replace the streaming logic in `TabChat.tsx` with an AG-UI subscriber pattern:

```typescript
// Simplified — actual implementation will handle all event types
function useAgentRun(agent: AbstractAgent) {
  const [state, setState] = useState<AgentUIState>(initialState);
  const [messages, setMessages] = useState<Message[]>([]);

  const run = useCallback(async (input: string) => {
    const runInput: RunAgentInput = {
      threadId: state.conversationId ?? uuid(),
      runId: uuid(),
      messages: [...messages, { role: "user", content: input }],
      state: state,
      tools: [], // frontend-executable tools if any
    };

    const subscriber = agent.subscribe({
      onRunStarted: (e) => { /* set runStatus */ },
      onTextMessageContent: (e) => { /* append delta */ },
      onToolCallStart: (e) => { /* push AgentStep */ },
      onToolCallEnd: (e) => { /* finish step */ },
      onStateSnapshot: (e) => { setState(e.snapshot); },
      onStateDelta: (e) => { setState(prev => applyPatch(prev, e.delta)); },
      onRunFinished: (e) => { /* finalize */ },
      onRunError: (e) => { /* handle error */ },
      onCustom: (e) => { /* browser_event, reasoning, etc. */ },
    });

    await agent.run(runInput);
    subscriber.unsubscribe();
  }, [agent, state, messages]);

  return { state, messages, run };
}
```

#### 4.3 TabChat Migration

The current `TabChat.tsx` (~600 lines) does three things:
1. **Message management** — `messages` state, persistence via API
2. **Stream consumption** — `for await (const event of transport.send(...))` loop
3. **Step tracking** — `pushStep()`, `finishStep()`, elapsed timers

Migration plan:
- Extract stream consumption into `useAgentRun()` hook
- `AgentStep` tracking becomes `StepStarted` / `StepFinished` event handling
- Message management stays in TabChat but uses AG-UI `Message` type
- Browser workspace, task plan, and code editor events handled via `onCustom`

### 5. Middleware Layer

AG-UI middleware transforms event streams. We use this for:

1. **Compact events**: `compactEvents()` utility reduces verbose streaming into efficient batches
2. **Browser event extraction**: Middleware that intercepts `Custom("browser_event")` and updates browser workspace state
3. **Task plan extraction**: Middleware that parses `<plan>` tags from text deltas and emits `StateDelta` with task updates
4. **Logging/debugging**: Development middleware that logs all events

### 6. Migration Phases

#### Phase 1: Foundation (Days 1-3)
- Install `@ag-ui/core`, `@ag-ui/client`, `fast-json-patch`
- Define `AgentUIState` type
- Create `agui-agent-transport.ts` — wrap existing SSE parsing in AG-UI `AbstractAgent`
- Create `agui-builder-transport.ts` — wrap architect bridge in AG-UI `AbstractAgent`
- Create `useAgentRun()` hook
- **Gate**: Both transports emit correct AG-UI events (unit tests)

#### Phase 2: TabChat Migration (Days 4-6)
- Replace `ChatTransport` consumption in TabChat with `useAgentRun()`
- Migrate `ChatMessage` to AG-UI `Message` type
- Migrate `AgentStep` tracking to `StepStarted`/`StepFinished` events
- Migrate `BuilderState` to `AgentUIState` with `StateSnapshot`/`StateDelta`
- **Gate**: Builder flow (create agent) and agent flow (deployed chat) work end-to-end

#### Phase 3: State Unification (Days 7-8)
- Move browser workspace state into `AgentUIState`
- Move task plan state into `AgentUIState`
- Move workspace memory into `AgentUIState`
- Remove standalone `useBuilderState()` hook
- **Gate**: All side panels (browser, files, task plan, code editor) driven by shared state

#### Phase 4: Middleware & Polish (Days 9-10)
- Add browser event extraction middleware
- Add task plan extraction middleware
- Add `compactEvents()` for production efficiency
- Remove old `ChatEvent`, `ChatTransport`, `BuilderChatTransport`, `AgentChatTransport` files
- Update E2E tests
- **Gate**: Old abstractions fully removed, all tests pass

### 7. Files Changed

| File | Change |
|---|---|
| `lib/openclaw/chat-transport.ts` | **Delete** — replaced by AG-UI types |
| `lib/openclaw/builder-chat-transport.ts` | **Delete** — replaced by `agui-builder-transport.ts` |
| `lib/openclaw/agent-chat-transport.ts` | **Delete** — replaced by `agui-agent-transport.ts` |
| `lib/openclaw/builder-state.ts` | **Delete** — replaced by `AgentUIState` in AG-UI shared state |
| `lib/openclaw/agui-builder-transport.ts` | **New** — AG-UI AbstractAgent wrapping architect bridge |
| `lib/openclaw/agui-agent-transport.ts` | **New** — AG-UI AbstractAgent wrapping sandbox chat proxy |
| `lib/openclaw/agui-state.ts` | **New** — `AgentUIState` type, initial state, patch helpers |
| `lib/openclaw/agui-hooks.ts` | **New** — `useAgentRun()` React hook |
| `lib/openclaw/agui-middleware.ts` | **New** — Browser event, task plan, logging middleware |
| `agents/[id]/chat/_components/TabChat.tsx` | **Major refactor** — consume `useAgentRun()` instead of raw transport |
| `agents/create/page.tsx` | **Refactor** — use `AgentUIState` instead of `useBuilderState()` |
| `agents/create/_components/configure/*.tsx` | **Minor** — read from `AgentUIState` |
| `agents/create/_components/review/ReviewAgent.tsx` | **Minor** — read from `AgentUIState` |
| `package.json` | **Add** `@ag-ui/core`, `@ag-ui/client`, `fast-json-patch` |

### 8. Backward Compatibility

- The backend endpoints (`POST /api/openclaw`, `POST /api/sandboxes/{id}/chat`) are **unchanged**. The AG-UI adapters live entirely in the frontend.
- The `ArchitectResponse` type from the OpenClaw gateway is **unchanged**. The builder transport adapter normalizes it.
- The OpenAI SSE format from the sandbox chat proxy is **unchanged**. The agent transport adapter parses it.
- No backend migration required.

### 9. Future Opportunities

Once on AG-UI:
- **CopilotKit integration**: Drop in `<CopilotChat>` component backed by our AG-UI agents
- **assistant-ui rendering**: Use assistant-ui's pre-built chat components
- **Multi-agent**: AG-UI's `parentRunId` supports agent-to-agent delegation natively
- **Generative UI (A2UI)**: AG-UI has a draft spec for generative UI components — agents can return UI blueprints
- **Interrupts (Human-in-the-loop)**: AG-UI draft spec for native pause/resume during tool execution
- **Serialization**: AG-UI event streams are serializable — enables conversation replay, branching, and history

---

## Implementation Notes

- The AG-UI JS SDK is at `@ag-ui/core` (types + events) and `@ag-ui/client` (AbstractAgent, HttpAgent, middleware, subscriber)
- AG-UI uses `Observable<BaseEvent>` pattern — our adapters yield events into this observable
- `TextMessageChunk` is a convenience event that auto-expands to `Start + Content + End` — prefer it for simple cases
- `ToolCallChunk` similarly auto-expands — use for OpenAI-format tool call streaming
- State patches use RFC 6902 JSON Patch format — `fast-json-patch` is the reference implementation
- AG-UI events inherit from `BaseEvent` which includes `type`, `timestamp`, and optional metadata
- The current shipped create-flow slice uses `skill_graph_ready` plus wizard custom events as the canonical builder-metadata stream for `/agents/create`, and `useAgentChat()` debounces `saveAgentDraft()` from that stream so the backend draft agent is created or updated before review without autosaving secrets
- [[LEARNING-2026-03-26-agui-state-snapshot-gap]] documents the remaining migration seam: builder metadata is still flowing through those custom events and the legacy `BuilderState` bridge instead of real AG-UI `StateSnapshot` / `StateDelta` events, so future AG-UI work should treat snapshot adoption as a prerequisite rather than optional cleanup
- [[LEARNING-2026-03-27-agui-forge-state-gap]] documents the next blocker after snapshot adoption: forge sandbox identity and readiness still live only on the legacy builder-state hook, so the AG-UI cutover is not actually complete until that workspace lifecycle moves onto the shared builder contract too

## Test Plan

- **Unit tests**: Each transport adapter emits correct AG-UI event sequence for known inputs
- **Unit tests**: `AgentUIState` patch application is correct and atomic
- **Unit tests**: Middleware correctly extracts browser events and task plans from event stream
- **Integration tests**: Builder flow (describe agent → skill graph ready → review) produces correct state snapshots
- **Integration tests**: Agent flow (send message → tool calls → response) produces correct event sequence
- **E2E tests**: `create-agent.spec.ts` still passes after migration
- **E2E tests**: `tab-chat-terminal.spec.ts` still passes after migration
- **E2E tests**: `tab-chat-task-plan.spec.ts` still passes after migration
