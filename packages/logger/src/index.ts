/**
 * @ruh/logger — Structured JSON logging for all Ruh.ai services.
 *
 * Built on pino for fast, structured JSON output.
 * Integrates with existing OTEL traces via requestId/traceId context.
 */

import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  /** Additional base fields merged into every log line */
  base?: Record<string, unknown>;
}

/** Sensitive field paths to redact from log output */
const REDACT_PATHS = [
  'password',
  'passwordHash',
  'secret',
  'token',
  'authorization',
  'apiKey',
  'api_key',
  'cookie',
  'refreshToken',
  'accessToken',
  'credentials',
];

/**
 * Create a structured JSON logger for a service.
 *
 * Usage:
 * ```ts
 * import { createLogger } from '@ruh/logger';
 * const logger = createLogger({ service: 'ruh-backend' });
 * logger.info({ requestId: 'abc' }, 'Request received');
 * const authLogger = logger.child({ module: 'auth' });
 * authLogger.warn('Token expired');
 * ```
 */
export function createLogger(options: LoggerOptions): pino.Logger {
  const level = options.level ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info';

  return pino({
    level,
    name: options.service,
    base: {
      service: options.service,
      ...options.base,
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

/**
 * Convenience: create a child logger scoped to a module.
 */
export function createModuleLogger(parent: pino.Logger, module: string): pino.Logger {
  return parent.child({ module });
}

export type Logger = pino.Logger;
