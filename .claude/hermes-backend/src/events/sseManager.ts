import type { Response } from 'express';
import { subscribe, type BusEvent } from '../eventBus';

const sseClients = new Set<Response>();

/**
 * Register an SSE client. Returns cleanup function.
 */
export function addSseClient(res: Response): () => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

  sseClients.add(res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30_000);

  return () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  };
}

/**
 * Broadcast an event to all connected SSE clients.
 */
export function broadcastSse(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

/**
 * Wire the event bus to SSE broadcasting.
 */
export function initSseBridge(): void {
  subscribe((event: BusEvent) => {
    broadcastSse(`${event.type}:${event.action}`, event.data);
  });
}

export function sseClientCount(): number {
  return sseClients.size;
}
