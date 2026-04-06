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
}

export const streams = new Map<string, StreamEntry>();
