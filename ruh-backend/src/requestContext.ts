/**
 * Request context via AsyncLocalStorage.
 *
 * Allows any code within a request lifecycle to access request metadata
 * (requestId, userId, traceId) without prop drilling through function args.
 *
 * Usage:
 *   import { getRequestContext } from './requestContext';
 *   const ctx = getRequestContext();
 *   if (ctx) logger.info({ requestId: ctx.requestId }, 'doing work');
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context, or undefined if called outside a request.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
