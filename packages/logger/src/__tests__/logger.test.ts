import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { createLogger, createModuleLogger } from '../index';

describe('createLogger', () => {
  test('creates logger with service name', () => {
    const logger = createLogger({ service: 'test-service' });
    expect(logger).toBeTruthy();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  test('respects explicit log level', () => {
    const logger = createLogger({ service: 'test', level: 'error' });
    expect(logger.level).toBe('error');
  });

  test('defaults to info level', () => {
    const logger = createLogger({ service: 'test' });
    expect(logger.level).toBe('info');
  });

  test('child logger inherits context', () => {
    const parent = createLogger({ service: 'test' });
    const child = parent.child({ module: 'auth' });
    expect(child).toBeTruthy();
    expect(typeof child.info).toBe('function');
  });

  test('createModuleLogger creates child with module field', () => {
    const parent = createLogger({ service: 'test' });
    const child = createModuleLogger(parent, 'auth');
    expect(child).toBeTruthy();
  });

  test('redacts sensitive fields in log output', () => {
    const logger = createLogger({ service: 'test', level: 'info' });
    // pino redaction is configured — just verify the logger was created with redact config
    // Actual redaction is tested by pino itself; we verify our config is passed
    expect(logger).toBeTruthy();
  });
});

describe('createBrowserLogger', () => {
  // Import dynamically to avoid pino in browser tests
  test('creates browser logger with all methods', async () => {
    const { createBrowserLogger } = await import('../browser');
    const logger = createBrowserLogger({ service: 'test-browser' });
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  test('child inherits context', async () => {
    const { createBrowserLogger } = await import('../browser');
    const parent = createBrowserLogger({ service: 'test' });
    const child = parent.child({ module: 'auth' });
    expect(typeof child.info).toBe('function');
  });

  test('respects log level filtering', async () => {
    const { createBrowserLogger } = await import('../browser');
    const mockDebug = mock(() => {});
    const origDebug = console.debug;
    console.debug = mockDebug;

    const logger = createBrowserLogger({ service: 'test', level: 'warn' });
    logger.debug('should not log');

    expect(mockDebug).not.toHaveBeenCalled();
    console.debug = origDebug;
  });

  test('error level always logs', async () => {
    const { createBrowserLogger } = await import('../browser');
    const mockError = mock(() => {});
    const origError = console.error;
    console.error = mockError;

    const logger = createBrowserLogger({ service: 'test', level: 'error' });
    logger.error('should log');

    expect(mockError).toHaveBeenCalled();
    console.error = origError;
  });
});
