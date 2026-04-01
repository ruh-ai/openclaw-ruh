/**
 * @ruh/logger/browser — Browser-compatible structured logging.
 *
 * Same interface as the server logger but uses console.* methods.
 * Suitable for Next.js client components and browser environments.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export interface BrowserLoggerOptions {
  service: string;
  level?: LogLevel;
  context?: Record<string, unknown>;
}

export interface BrowserLogger {
  debug: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  info: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  warn: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  error: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  child: (context: Record<string, unknown>) => BrowserLogger;
}

export function createBrowserLogger(options: BrowserLoggerOptions): BrowserLogger {
  const currentLevel = options.level ?? 'info';
  const baseContext = { service: options.service, ...options.context };

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
  }

  function formatLog(level: LogLevel, msgOrObj: string | Record<string, unknown>, msg?: string): [string, Record<string, unknown>] {
    const timestamp = new Date().toISOString();
    if (typeof msgOrObj === 'string') {
      return [msgOrObj, { timestamp, level, ...baseContext }];
    }
    return [msg ?? '', { timestamp, level, ...baseContext, ...msgOrObj }];
  }

  const methods: Record<string, typeof console.log> = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  function log(level: LogLevel, msgOrObj: string | Record<string, unknown>, msg?: string): void {
    if (!shouldLog(level)) return;
    const [message, context] = formatLog(level, msgOrObj, msg);
    const method = methods[level] ?? console.log;
    method(`[${options.service}] ${message}`, context);
  }

  return {
    debug: (msgOrObj, msg) => log('debug', msgOrObj, msg),
    info: (msgOrObj, msg) => log('info', msgOrObj, msg),
    warn: (msgOrObj, msg) => log('warn', msgOrObj, msg),
    error: (msgOrObj, msg) => log('error', msgOrObj, msg),
    child: (context) => createBrowserLogger({
      ...options,
      context: { ...baseContext, ...context },
    }),
  };
}
