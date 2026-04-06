/**
 * useGatewayWebSocket — bidirectional WebSocket to an OpenClaw gateway
 * via the backend proxy at /ws/gateway/:sandboxId.
 *
 * The backend handles gateway auth server-side. The browser sends/receives
 * OpenClaw WS protocol frames directly (chat.send, agent.turn.chunk, etc.).
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → 16s cap)
 * - Waits for `proxy_ready` before marking the connection as ready
 * - Message queue: sends buffered while connecting
 * - Clean teardown on unmount or sandboxId change
 */

import { useCallback, useEffect, useRef, useState } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") ?? "ws://localhost:8000";

const MAX_RECONNECT_DELAY_MS = 16_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export type GatewayReadyState = "connecting" | "ready" | "closed" | "error";

export interface GatewayMessage {
  type: string;
  [key: string]: unknown;
}

interface UseGatewayWebSocketReturn {
  /** Send a JSON frame to the gateway. Queued if not yet ready. */
  send: (msg: GatewayMessage) => void;
  /** Send a chat message using the OpenClaw chat.send method. */
  sendChat: (params: {
    sessionKey: string;
    message: string;
    requestId?: string;
    soulOverride?: string;
  }) => void;
  /** Last received message from the gateway. */
  lastMessage: GatewayMessage | null;
  /** Current connection state. */
  readyState: GatewayReadyState;
  /** Last error message, if any. */
  error: string | null;
  /** Subscribe to all incoming gateway messages. Returns unsubscribe fn. */
  subscribe: (handler: (msg: GatewayMessage) => void) => () => void;
  /** Force close and reconnect. */
  reconnect: () => void;
}

export function useGatewayWebSocket(
  sandboxId: string | null | undefined,
): UseGatewayWebSocketReturn {
  const [readyState, setReadyState] = useState<GatewayReadyState>("closed");
  const [lastMessage, setLastMessage] = useState<GatewayMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<string[]>([]);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const subscribersRef = useRef<Set<(msg: GatewayMessage) => void>>(new Set());
  const requestIdRef = useRef(0);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!sandboxId || !mountedRef.current) return;

    cleanup();
    setReadyState("connecting");
    setError(null);

    const url = `${BACKEND_URL}/ws/gateway/${sandboxId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // Connected to backend proxy — wait for proxy_ready
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;

      let msg: GatewayMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Proxy signals it's authenticated with the gateway
      if (msg.type === "proxy_ready") {
        setReadyState("ready");
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;

        // Flush queued messages
        const queued = queueRef.current.splice(0);
        for (const raw of queued) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(raw);
          }
        }
        return;
      }

      setLastMessage(msg);

      // Notify subscribers
      for (const handler of subscribersRef.current) {
        try {
          handler(msg);
        } catch (err) {
          console.warn("[gateway-ws] Subscriber error:", err);
        }
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;

      wsRef.current = null;

      if (event.code >= 4400 && event.code < 4500) {
        // Client error (auth, not found) — don't reconnect
        setReadyState("error");
        setError(event.reason || `Connection rejected (${event.code})`);
        return;
      }

      setReadyState("closed");

      // Auto-reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      // onclose will fire after this — handle reconnect there
    };
  }, [sandboxId, cleanup]);

  // Connect when sandboxId changes
  useEffect(() => {
    mountedRef.current = true;
    if (sandboxId) {
      connect();
    } else {
      cleanup();
      setReadyState("closed");
    }
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [sandboxId, connect, cleanup]);

  const send = useCallback((msg: GatewayMessage) => {
    const raw = JSON.stringify(msg);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    } else {
      // Queue for when proxy is ready
      queueRef.current.push(raw);
    }
  }, []);

  const sendChat = useCallback(
    (params: {
      sessionKey: string;
      message: string;
      requestId?: string;
      soulOverride?: string;
    }) => {
      requestIdRef.current += 1;
      const id = String(requestIdRef.current + 1); // +1 because "1" is reserved for connect

      const chatMessage = params.soulOverride
        ? `[SOUL_OVERRIDE]\n${params.soulOverride}\n[/SOUL_OVERRIDE]\n\n${params.message}`
        : params.message;

      send({
        type: "req",
        id,
        method: "chat.send",
        params: {
          sessionKey: params.sessionKey,
          message: chatMessage,
          idempotencyKey: params.requestId ?? `req-${Date.now()}`,
          deliver: false,
        },
      });
    },
    [send],
  );

  const subscribe = useCallback(
    (handler: (msg: GatewayMessage) => void) => {
      subscribersRef.current.add(handler);
      return () => {
        subscribersRef.current.delete(handler);
      };
    },
    [],
  );

  const reconnect = useCallback(() => {
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
    connect();
  }, [connect]);

  return { send, sendChat, lastMessage, readyState, error, subscribe, reconnect };
}
