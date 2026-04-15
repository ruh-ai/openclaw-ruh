/**
 * WebSocket proxy: forwards bidirectional frames between the browser
 * and an OpenClaw gateway running inside a sandbox container.
 *
 * @kb: 004-api-reference 001-architecture
 *
 * The backend authenticates with the gateway server-side using the
 * stored gateway_token — the browser never sees the token.
 *
 * Usage: attach `handleGatewayUpgrade` to the HTTP server's 'upgrade' event.
 *
 * Follows the same pattern as vncProxy.ts.
 */

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import * as store from "./store";
import { verifyAccessToken } from "./auth/tokens";
import { GATEWAY_HOST } from "./utils";

// Match: /ws/gateway/<uuid>
const GATEWAY_PATH_RE = /^\/ws\/gateway\/([^/]+)$/;

const wss = new WebSocketServer({ noServer: true });

// Heartbeat interval — detect dead connections
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * Handle HTTP upgrade requests for the gateway proxy path.
 * Attach this to `server.on('upgrade', handleGatewayUpgrade)`.
 */
export function handleGatewayUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const match = GATEWAY_PATH_RE.exec(url.pathname);
  console.log(`[gateway-proxy] Upgrade request: ${url.pathname}, match: ${!!match}`);
  if (!match) return; // Not our path — let other handlers (VNC) deal with it

  const sandboxId = match[1];
  console.log(`[gateway-proxy] Sandbox: ${sandboxId}`);

  // Extract JWT from cookie header
  const cookieHeader = req.headers.cookie ?? "";
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)accessToken=([^;]*)/);
  const accessToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;

  if (!accessToken) {
    console.log("[gateway-proxy] No accessToken cookie found");
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const payload = verifyAccessToken(accessToken);
  if (!payload) {
    console.log("[gateway-proxy] JWT verification failed");
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  console.log(`[gateway-proxy] Auth OK: ${payload.email}`);

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    proxyToGateway(clientWs, sandboxId);
  });
}

// ─── Gateway Protocol Constants ──────────────────────────────────────────────

const CONNECT_REQUEST = (token: string) =>
  JSON.stringify({
    type: "req",
    id: "1",
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "openclaw-control-ui",
        version: "2026.4.14",
        platform: "web",
        mode: "webchat",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write"],
      auth: { token },
    },
  });

// ─── Proxy Core ──────────────────────────────────────────────────────────────

async function proxyToGateway(
  clientWs: WebSocket,
  sandboxId: string,
): Promise<void> {
  // 1. Look up sandbox
  let record: store.SandboxRecord | null;
  try {
    record = await store.getSandbox(sandboxId);
  } catch {
    clientWs.close(4500, "Database error");
    return;
  }

  if (!record) {
    clientWs.close(4404, "Sandbox not found");
    return;
  }

  if (!record.gateway_port) {
    clientWs.close(4503, "Gateway not available for this sandbox");
    return;
  }

  const gatewayToken = record.gateway_token ?? "";
  const targetUrl = `ws://${GATEWAY_HOST}:${record.gateway_port}`;

  // 2. Connect to the gateway inside the container
  // Origin header is required by the gateway — localhost is always in allowedOrigins.
  const gatewayWs = new WebSocket(targetUrl, { headers: { Origin: "http://localhost" } });
  let gatewayAuthenticated = false;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  // Cleanup helper
  const cleanup = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  // Start heartbeat after both sides are connected
  const startHeartbeat = () => {
    heartbeatInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.ping();
      }
      if (gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  // 3. Handle gateway connection
  gatewayWs.on("open", () => {
    // Wait for connect.challenge — don't send anything yet
  });

  gatewayWs.on("message", (data) => {
    const raw = data.toString();

    // During handshake: intercept protocol frames
    if (!gatewayAuthenticated) {
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(raw);
      } catch {
        return;
      }

      // Gateway sends connect.challenge → we respond with auth
      if (frame.type === "event" && frame.event === "connect.challenge") {
        gatewayWs.send(CONNECT_REQUEST(gatewayToken));
        return;
      }

      // Gateway responds to our connect request
      if (frame.type === "res" && frame.id === "1") {
        if (!frame.ok) {
          console.error(
            `[gateway-proxy] Auth failed for sandbox ${sandboxId}:`,
            frame.error ?? frame.payload,
          );
          clientWs.close(4401, "Gateway authentication failed");
          gatewayWs.close();
          cleanup();
          return;
        }

        // Auth succeeded — proxy is ready
        gatewayAuthenticated = true;
        console.log(`[gateway-proxy] Connected to sandbox ${sandboxId}`);

        // Tell the browser the proxy is ready
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({ type: "proxy_ready", sandboxId }),
          );
        }

        // Start heartbeat
        startHeartbeat();
        return;
      }
    }

    // After handshake: forward all gateway frames to the browser
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(raw);
    }
  });

  gatewayWs.on("error", (err) => {
    console.error(
      `[gateway-proxy] Gateway WS error (sandbox ${sandboxId}):`,
      err.message,
    );
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(4502, "Gateway connection failed");
    }
    cleanup();
  });

  gatewayWs.on("close", (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(
        4502,
        `Gateway closed: ${reason?.toString() || `code ${code}`}`,
      );
    }
    cleanup();
  });

  // 4. Forward browser frames to the gateway (after auth)
  clientWs.on("message", (data) => {
    if (!gatewayAuthenticated) {
      // Buffer or reject — gateway isn't ready yet
      // For now, queue isn't needed since the browser waits for proxy_ready
      return;
    }
    if (gatewayWs.readyState === WebSocket.OPEN) {
      gatewayWs.send(data.toString());
    }
  });

  clientWs.on("close", () => {
    if (gatewayWs.readyState === WebSocket.OPEN) {
      gatewayWs.close();
    }
    cleanup();
  });

  clientWs.on("error", () => {
    if (gatewayWs.readyState === WebSocket.OPEN) {
      gatewayWs.close();
    }
    cleanup();
  });
}
