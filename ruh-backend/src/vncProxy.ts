/**
 * WebSocket proxy: forwards noVNC connections from the frontend
 * to a sandbox container's websockify endpoint.
 *
 * Usage: attach `handleVncUpgrade` to the HTTP server's 'upgrade' event.
 */

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import * as store from './store';

// Match: /api/sandboxes/<uuid>/vnc
const VNC_PATH_RE = /^\/api\/sandboxes\/([^/]+)\/vnc$/;

const wss = new WebSocketServer({ noServer: true });

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

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    proxyToContainer(clientWs, sandboxId);
  });
}

async function proxyToContainer(clientWs: WebSocket, sandboxId: string): Promise<void> {
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

  const targetUrl = `ws://localhost:${record.vnc_port}`;
  const containerWs = new WebSocket(targetUrl, {
    // noVNC uses binary frames
    perMessageDeflate: false,
  });

  containerWs.on('open', () => {
    // Relay: client → container
    clientWs.on('message', (data, isBinary) => {
      if (containerWs.readyState === WebSocket.OPEN) {
        containerWs.send(data, { binary: isBinary });
      }
    });

    // Relay: container → client
    containerWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });
  });

  containerWs.on('error', (err) => {
    console.error(`[vnc-proxy] Container WS error (sandbox ${sandboxId}):`, err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(4502, 'Container VNC connection failed');
    }
  });

  containerWs.on('close', () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, 'Container VNC closed');
    }
  });

  clientWs.on('close', () => {
    if (containerWs.readyState === WebSocket.OPEN) {
      containerWs.close();
    }
  });

  clientWs.on('error', () => {
    if (containerWs.readyState === WebSocket.OPEN) {
      containerWs.close();
    }
  });
}
