/**
 * streamRegistry.ts — Shared SSE stream registry.
 *
 * Extracted from app.ts to avoid circular imports when
 * marketplace routes need to create provisioning streams.
 */

export interface StreamEntry {
  status: string;
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  /** Buffered build events for replay/reconnection support. */
  events?: Array<{ type: string; data: unknown; timestamp: number }>;
  /** AbortController for build cancellation. */
  abortController?: AbortController;
}

export const streams = new Map<string, StreamEntry>();
