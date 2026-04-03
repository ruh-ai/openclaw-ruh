/**
 * Shared helpers used across route modules.
 * Extracted from app.ts to support route modularization.
 */

import type { Request, Response, NextFunction } from 'express';
import * as store from './store';
import { httpError } from './utils';

/** Validate sandbox exists and return the record, or throw 404. */
export async function getRecord(sandboxId: string): Promise<store.SandboxRecord> {
  const record = await store.getSandbox(sandboxId);
  if (!record) throw httpError(404, 'Sandbox not found');
  return record;
}

/** Wrap an async Express handler so rejected promises propagate to error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => fn(req, res, next).catch(next);
}

/** Parse a positive integer from a query parameter with fallback. */
export function parsePositiveIntParam(
  value: unknown,
  fallback: number,
  fieldName: string,
): number {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw httpError(400, `Invalid ${fieldName}`);
  }
  return parsed;
}

/** Context object injected into route modules from app.ts. */
export interface RouteContext {
  sandboxExec: (sandboxId: string, cmd: string, timeoutSec: number) => Promise<[number, string]>;
  recordAuditEvent: (req: Request, event: {
    action_type: string;
    target_type: string;
    target_id: string;
    outcome: string;
    details?: Record<string, unknown>;
  }) => Promise<void>;
}
