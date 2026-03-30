/**
 * HTTP request/response logging middleware.
 * Logs every request with method, path, status, latency, and request context.
 */

import type { Request, Response, NextFunction } from 'express';
import { createLogger, createModuleLogger } from '@ruh/logger';

const logger = createModuleLogger(
  createLogger({ service: 'ruh-backend' }),
  'http',
);

/** Paths to skip logging (high-frequency health checks) */
const SKIP_PATHS = new Set(['/health', '/ready']);

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  const start = Date.now();
  const requestId = (req as unknown as Record<string, unknown>).__requestId as string | undefined;
  const method = req.method;
  const path = req.originalUrl || req.path;

  logger.info({ requestId, method, path }, `→ ${method} ${path}`);

  res.on('finish', () => {
    const latency = Date.now() - start;
    const status = res.statusCode;
    const traceId = (req as unknown as Record<string, unknown>).__otelTraceId as string | undefined;
    const userId = (req as unknown as Record<string, unknown>).user
      ? ((req as unknown as Record<string, unknown>).user as Record<string, unknown>).userId as string
      : undefined;

    const logData = {
      requestId,
      traceId,
      userId,
      method,
      path,
      status,
      latency,
    };

    if (status >= 500) {
      logger.error(logData, `← ${status} ${method} ${path} ${latency}ms`);
    } else if (status >= 400) {
      logger.warn(logData, `← ${status} ${method} ${path} ${latency}ms`);
    } else {
      logger.info(logData, `← ${status} ${method} ${path} ${latency}ms`);
    }
  });

  next();
}
