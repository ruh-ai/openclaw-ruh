# SPEC: Backend Gateway WebSocket Proxy

[[000-INDEX|<- Index]] | [[002-backend-overview]] | [[001-architecture]] | [[008-agent-builder-ui]] | [[003-sandbox-lifecycle]]

## Status

draft

## Summary

Moves the OpenClaw gateway WebSocket connection from the Next.js API route (`/api/openclaw`) into the ruh-backend Express server as a bidirectional WS proxy at `/ws/gateway/:sandboxId`. The backend already holds the gateway token and host port — it authenticates with the gateway server-side, then proxies frames between the browser and the container. This eliminates the protocol translation layer (WS-to-SSE), the HTTP fallback with fake progress, and the gateway auth failures that cause builds to stall silently.

## Related Notes

- [[002-backend-overview]] — Backend module map, startup sequence, existing VNC WS proxy
- [[001-architecture]] — System diagram, key design decisions including current bridge
- [[008-agent-builder-ui]] — Builder UI, current `/api/openclaw` bridge route
- [[003-sandbox-lifecycle]] — Sandbox creation, gateway port assignment, token storage
- [[004-api-reference]] — Backend API endpoints
- [[011-key-flows]] — Agent creation flow end-to-end
- [[SPEC-agent-creation-v3-build-pipeline]] — Build pipeline that depends on reliable gateway events

## Problem

The current architecture routes all agent chat through a Next.js API route that:

1. **Translates protocols** — receives HTTP POST, opens a WebSocket to the gateway, converts WS frames to SSE events back to the browser. This 1100+ line bridge is the most complex file in the builder.
2. **Fails silently on WS auth** — when the gateway rejects the WebSocket ("pairing required"), the bridge falls back to an HTTP chat proxy with hardcoded fake progress timers ("Working..."), giving the user no real-time visibility into what the agent is doing.
3. **Is one-directional** — SSE streams server-to-client only. The browser cannot send follow-up messages on the same connection; each message requires a new HTTP POST.
4. **Runs in a serverless-ish environment** — Next.js API routes are not designed for long-lived WebSocket connections. They want to return quickly.
5. **Duplicates auth** — the Next.js route must fetch the sandbox record from the backend to get the gateway URL/token, then separately authenticate with the gateway. The backend already has this information.

## Specification

### New endpoint: `/ws/gateway/:sandboxId`

A WebSocket upgrade endpoint on the ruh-backend (Express, port 8000) that proxies bidirectional frames between the browser and the OpenClaw gateway running inside the sandbox container.

### Connection flow

```
Browser                         ruh-backend (:8000)                Gateway (:random)
  |                                    |                                |
  |--- WS upgrade ------------------>|                                 |
  |    /ws/gateway/:sandboxId         |                                |
  |    Cookie: accessToken=...        |                                |
  |                                   |-- validate JWT from cookie     |
  |                                   |-- look up sandbox record       |
  |                                   |-- get gateway_port + token     |
  |                                   |                                |
  |                                   |--- WS connect --------------->|
  |                                   |    ws://localhost:${port}      |
  |                                   |                                |
  |                                   |<-- connect.challenge ---------|
  |                                   |--- connect (token) ---------->|
  |                                   |<-- hello-ok ------------------|
  |                                   |                                |
  |<-- { type: "proxy_ready" } ------|                                |
  |                                   |                                |
  |--- chat.send ------------------->|--- chat.send ----------------->|
  |<-- agent.turn.chunk -------------|<-- agent.turn.chunk -----------|
  |<-- tool_start -------------------|<-- tool_start -----------------|
  |<-- tool_end ---------------------|<-- tool_end -------------------|
  |<-- agent.turn.done --------------|<-- agent.turn.done ------------|
  |                                   |                                |
  |--- close ----------------------->|--- close --------------------->|
```

### Authentication

1. **Browser → Backend:** Validated via the existing JWT `accessToken` cookie (same auth as REST endpoints). The `requireAuth` middleware extracts the user from the cookie. The sandbox must belong to the authenticated user's organization.

2. **Backend → Gateway:** Authenticated using the `gateway_token` stored in the sandboxes DB table. The backend performs the full OpenClaw handshake (connect.challenge → connect with token → hello-ok) before marking the proxy as ready.

The browser never sees the gateway token. Auth is fully server-side.

### Frame proxying

After the gateway handshake completes:

- **Browser → Gateway:** All client frames are forwarded verbatim. The proxy does not parse, modify, or filter them. The browser sends `chat.send`, `chat.abort`, etc. directly in the OpenClaw WS protocol format.
- **Gateway → Browser:** All gateway frames are forwarded verbatim. Tool events (`tool_start`, `tool_end`), deltas (`agent.turn.chunk`), file writes (`file_written`), and completion (`agent.turn.done`) flow directly to the browser.

The proxy is transparent after handshake — it does not interpret, buffer, or transform frames.

### Error handling

| Scenario | Behavior |
|----------|----------|
| Sandbox not found | Close with code 4404, reason "Sandbox not found" |
| Gateway unreachable | Close with code 4502, reason "Gateway connection failed" |
| Gateway auth rejected | Close with code 4401, reason "Gateway authentication failed" |
| Gateway closes unexpectedly | Close client with code 4502, reason from gateway |
| Client closes | Close gateway connection |
| JWT expired / missing | Close with code 4403, reason "Authentication required" |
| Sandbox not owned by user | Close with code 4403, reason "Access denied" |

### Heartbeat / keepalive

The proxy sends WebSocket ping frames every 30 seconds to both the client and gateway connections. If either side fails to respond within 10 seconds, the proxy closes both connections.

### Backend implementation

New file: `ruh-backend/src/gatewayProxy.ts`

Follows the same pattern as the existing `vncProxy.ts`:
- Uses `ws` library with `noServer: true`
- Mounted via `server.on('upgrade', ...)` in `startup.ts`
- Matches path `/ws/gateway/:sandboxId`
- Looks up sandbox record via `store.getSandbox()`
- Connects upstream WS to `ws://localhost:${gateway_port}`

### Frontend changes

New hook: `agent-builder-ui/hooks/use-gateway-ws.ts`

```typescript
function useGatewayWebSocket(sandboxId: string | null) {
  // Returns: { send, lastMessage, readyState, error }
  // Connects to: ws://localhost:8000/ws/gateway/${sandboxId}
  // Handles reconnection with exponential backoff
}
```

The builder chat (`TabChat.tsx`) and build flow (`generate-skills.ts`) switch from calling `/api/openclaw` (HTTP POST → SSE) to using this WebSocket hook for all gateway communication.

### What gets removed

| Dead code | Reason |
|-----------|--------|
| `/api/openclaw` route POST handler for chat | Replaced by WS proxy |
| `forwardToGateway()` (1100+ line WS→SSE bridge) | No longer needed |
| `resolveForgeGateway()` (fetch sandbox from backend) | Backend already has it |
| HTTP fallback with fake progress timers | No fallback needed |
| `_forgeWsAuthFailures` cache | Auth is server-side |
| `sendToArchitectStreaming()` in `api.ts` | Replaced by WS send |
| `sendToForgeSandboxChat()` in `api.ts` | Replaced by WS send |

The `/api/openclaw` route remains for:
- `forge-chat-traced` endpoint (eval trace collection — separate concern)
- `github-export` endpoint (ship to GitHub)

### Migration path

1. **Phase 1:** Add `/ws/gateway/:sandboxId` to the backend alongside existing HTTP routes
2. **Phase 2:** Add `useGatewayWebSocket` hook, wire into builder chat behind a feature flag
3. **Phase 3:** Validate all event types flow correctly (think, plan, build, test, ship)
4. **Phase 4:** Remove the `/api/openclaw` POST chat handler and related dead code

## Implementation Notes

### Key files to create

| File | Purpose |
|------|---------|
| `ruh-backend/src/gatewayProxy.ts` | WS proxy (follows `vncProxy.ts` pattern) |
| `agent-builder-ui/hooks/use-gateway-ws.ts` | Frontend WS hook |

### Key files to modify

| File | Change |
|------|--------|
| `ruh-backend/src/startup.ts` | Mount `handleGatewayUpgrade` alongside VNC handler |
| `agent-builder-ui/lib/openclaw/api.ts` | Replace HTTP streaming with WS send |
| `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` | Use WS hook |
| `agent-builder-ui/app/(platform)/agents/create/_config/generate-skills.ts` | Use WS for build |
| `agent-builder-ui/app/api/openclaw/route.ts` | Remove chat POST handler (keep traced + export) |

### Gateway WS protocol reference

The OpenClaw gateway uses a JSON-RPC-like protocol over WebSocket:

1. Gateway sends `{ type: "event", event: "connect.challenge" }`
2. Client responds with `{ type: "req", id: "1", method: "connect", params: { auth: { token }, client: {...}, role: "operator", scopes: [...] } }`
3. Gateway responds with `{ type: "res", id: "1", ok: true }` or `{ ok: false, error: "..." }`
4. Client sends `{ type: "req", id: "2", method: "chat.send", params: { sessionKey, message, ... } }`
5. Gateway streams `{ type: "event", event: "agent.turn.chunk" | "tool_start" | "tool_end" | "agent.turn.done", ... }`

## Test Plan

### Unit tests
- `gatewayProxy.ts`: sandbox lookup, JWT validation, error codes for missing/unauthorized
- Mock WS server simulating gateway protocol

### Integration tests
- Full proxy flow: browser WS → backend proxy → gateway WS → response back
- Auth rejection: expired JWT, wrong org
- Gateway unavailable: connection refused

### E2E tests
- Create agent flow: Think → Plan → Build with real-time tool events visible
- Build progress shows actual file writes instead of fake timers
- Chat in deployed agent works through WS proxy

### Manual verification
- Open builder, create agent, verify tool events appear in real-time during Build
- Compare build experience: old (HTTP fallback + "Working...") vs new (live tool events)
- Verify VNC proxy still works (regression check)
