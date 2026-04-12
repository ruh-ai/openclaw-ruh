/**
 * WebSocket proxy: forwards noVNC connections from the frontend
 * to a sandbox container's websockify endpoint.
 *
 * Usage: attach `handleVncUpgrade` to the HTTP server's 'upgrade' event.
 */

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import * as _ws from 'ws';
import * as store from './store';
import { GATEWAY_HOST } from './utils';

// Match: /api/sandboxes/<uuid>/vnc
const VNC_PATH_RE = /^\/api\/sandboxes\/([^/]+)\/vnc$/;

// Lazy getter so mock.module('ws', ...) updates take effect even after this
// module has been loaded (e.g. when startup.ts is imported before vncProxy
// mock is registered in tests).
function getWss(): _ws.WebSocketServer {
  return new (_ws as any).WebSocketServer({ noServer: true });
}
let _wss: _ws.WebSocketServer | null = null;
function wss(): _ws.WebSocketServer {
  if (!_wss) _wss = getWss();
  return _wss;
}

type WebSocketType = _ws.WebSocket;

/**
 * Handle HTTP upgrade requests for the VNC proxy path.
 * Attach this to `server.on('upgrade', handleVncUpgrade)`.
 */
export function handleVncUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const match = VNC_PATH_RE.exec(url.pathname);
  if (!match) return; // Not our path — let other handlers deal with it

  const sandboxId = match[1];

  wss().handleUpgrade(req, socket, head, (clientWs) => {
    proxyToContainer(clientWs, sandboxId);
  });
}

async function proxyToContainer(clientWs: WebSocketType, sandboxId: string): Promise<void> {
  let record: store.SandboxRecord | null;
  try {
    record = await store.getSandbox(sandboxId);
  } catch {
    clientWs.close(4500, 'Database error');
    return;
  }

  if (!record) {
    clientWs.close(4404, 'Sandbox not found');
    return;
  }

  if (!record.vnc_port) {
    clientWs.close(4503, 'VNC not available for this sandbox');
    return;
  }

  const targetUrl = `ws://${GATEWAY_HOST}:${record.vnc_port}`;
  const WS = (_ws as any).WebSocket ?? (_ws as any).default;
  const containerWs: WebSocketType = new WS(targetUrl, {
    // noVNC uses binary frames
    perMessageDeflate: false,
  });

  containerWs.on('open', () => {
    // Relay: client → container
    clientWs.on('message', (data, isBinary) => {
      if (containerWs.readyState === WS.OPEN) {
        containerWs.send(data, { binary: isBinary });
      }
    });

    // Relay: container → client
    containerWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === WS.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });
  });

  containerWs.on('error', (err) => {
    console.error(`[vnc-proxy] Container WS error (sandbox ${sandboxId}):`, err.message);
    if (clientWs.readyState === WS.OPEN) {
      clientWs.close(4502, 'Container VNC connection failed');
    }
  });

  containerWs.on('close', () => {
    if (clientWs.readyState === WS.OPEN) {
      clientWs.close(1000, 'Container VNC closed');
    }
  });

  clientWs.on('close', () => {
    if (containerWs.readyState === WS.OPEN) {
      containerWs.close();
    }
  });

  clientWs.on('error', () => {
    if (containerWs.readyState === WS.OPEN) {
      containerWs.close();
    }
  });
}
