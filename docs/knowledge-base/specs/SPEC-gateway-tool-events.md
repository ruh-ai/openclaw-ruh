# SPEC: Gateway Structured Tool Events

[[000-INDEX|← Index]] | [[004-api-reference|API Reference]] | [[008-agent-builder-ui|Agent Builder UI]]

## Status
draft — partially implemented (route.ts ready, blocked by gateway WebSocket auth)

## Implementation Findings (2026-03-27)

**What was implemented:**
- `route.ts`: Agent-mode approval policy (`evaluateAgentApprovalRequest`) — auto-allows all tools
- `route.ts`: `tool_start` / `tool_end` SSE events emitted when tools are approved
- `route.ts`: Agent mode wired into mode routing (`mode === "agent"`)
- `test-mode.ts`: `"agent"` added to `OpenClawRequestMode` with session key `agent:main:${sessionId}`
- `sandbox-agent.ts`: Route.ts SSE event handlers added (tool_start, tool_end, delta, status, result, error)

**Blocker:** The OpenClaw gateway's WebSocket protocol requires `CONTROL_UI_DEVICE_IDENTITY_REQUIRED` — HTTPS or localhost secure context. The `SandboxAgent` currently uses the backend HTTP proxy (`/api/sandboxes/:id/chat`) which doesn't have this restriction. Switching to the WebSocket bridge (`/api/openclaw`) fails with this auth error in local dev.

**Options to unblock:**
1. Run local dev with HTTPS (mkcert + next.config ssl)
2. Add a gateway config to disable device identity check for operator WebSocket connections
3. Have the backend (`ruh-backend`) use WebSocket to the gateway and forward tool events as SSE — the backend runs inside the same network as the gateway and can handle secure context differently

## Summary

The OpenClaw gateway executes tools internally during plan-mode tasks but only streams plain text summaries back to the UI. The UI needs structured tool execution events to drive workspace tab switching (Terminal, Code, Browser, Preview) and show real-time tool activity. This spec defines the SSE event format the gateway should emit for every tool invocation during a conversation.

## Problem

When an agent receives a complex task (e.g., "Build a todo list web app"), the gateway:
1. Creates a task plan
2. Executes tools internally (file_write, exec, browser_navigate, etc.)
3. Streams only `TEXT_MESSAGE_CONTENT` events with the final summary text

The UI has full support for structured tool events (`TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_RESULT`) — these drive tab auto-switching, the right-panel tool activity log, and the code editor file picker. But during plan-mode execution, none of these events are emitted.

**For simple/direct tasks** (e.g., "run ls -la"), the gateway streams the LLM's response which includes markdown code blocks (` ```bash `). The UI's code block extractor detects these and creates tool steps. This path works.

**For plan-mode tasks**, the LLM executes tools via function calls, the gateway runs them, and the LLM receives results — all internally. The final text sent to the UI is a summary with no code blocks. No tool steps are created.

## Related Notes
- [[008-agent-builder-ui]] — Agent builder chat UI architecture
- [[004-api-reference]] — API endpoint reference
- [[003-sandbox-lifecycle]] — Sandbox execution model

## Specification

### SSE Event Format

For every tool invocation during a conversation, the gateway should emit three SSE events **before** continuing with text content:

#### Tool Start
```json
{
  "tool": "file_write",
  "input": {
    "path": "index.html",
    "content": "<!DOCTYPE html>..."
  }
}
```

#### Tool Result
```json
{
  "result": "File written successfully",
  "output": ""
}
```

#### Required Fields
- `tool` (string): The tool name. Must be one of the standard OpenClaw tool names.
- `input` (object): The tool input arguments. Shape varies by tool.
- `result` / `output` (string): The tool execution result.

### Tool Name Registry

The gateway should use consistent tool names that the UI can categorize:

| Category | Tool Names | UI Tab |
|---|---|---|
| Terminal | `exec`, `bash`, `shell_exec` | Terminal |
| Code | `file_write`, `file_read`, `file_str_replace`, `create_file`, `edit_file` | Code |
| Browser | `browser_navigate`, `browser_click`, `browser_screenshot`, `browser_type`, `browser_fill` | Browser |

### Ordering

Tool events should be interleaved with text content in execution order:

```
data: {"choices":[{"delta":{"content":"Creating index.html..."}}]}
data: {"tool":"file_write","input":{"path":"index.html","content":"..."}}
data: {"result":"File written"}
data: {"choices":[{"delta":{"content":"Running the server..."}}]}
data: {"tool":"exec","input":{"command":"python3 -m http.server 8080"}}
data: {"result":"Server started on port 8080"}
```

### Backward Compatibility

The UI already handles these events in `SandboxAgent.run()` (sandbox-agent.ts, line 260):
```typescript
if ((parsed.tool || parsed.name) && !parsed.choices) {
  // Emits TOOL_CALL_START AG-UI event
}
```

No UI changes are needed. The existing event handlers in `use-agent-chat.ts` will automatically:
- Create tool steps in `liveSteps`
- Trigger tab auto-switching via the `CODE_TOOLS` / `BROWSER_TOOLS` / `TERMINAL_TOOLS` sets
- Populate the right-panel tool activity log
- Trigger `EDITOR_FILE_CHANGED` for code tools (auto-opens file in editor)

## Implementation Notes

### Gateway Changes Required
- In the chat proxy handler, intercept tool execution events from the LLM
- Emit `{tool, input}` SSE event before executing the tool
- Emit `{result}` SSE event after execution
- Continue streaming the LLM's text response

### Key Files
- Gateway chat proxy: `ruh-backend/src/` (routes handling `/api/sandboxes/:id/chat`)
- UI consumer: `agent-builder-ui/lib/openclaw/ag-ui/sandbox-agent.ts`
- Tab switching: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`

## Test Plan
- Send a complex multi-tool task to an agent
- Verify SSE stream includes `{tool, input}` and `{result}` events interleaved with text
- Verify UI tab switches to Code when `file_write` event arrives
- Verify UI tab switches to Terminal when `exec` event arrives
- Verify UI tab switches to Browser when `browser_navigate` event arrives
- Verify right-panel tool activity log shows all tool executions
- Verify backward compatibility: simple tasks with code blocks still work
