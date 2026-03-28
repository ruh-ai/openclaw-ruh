import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { getBackendReadiness, markBackendNotReady } from '../../src/backendReadiness';
import { parseBackendConfig } from '../../src/config';
import { startBackend, runPreflight } from '../../src/startup';

const silentLogger = { log: mock(() => {}), error: mock(() => {}), warn: mock(() => {}) };

describe('runPreflight', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  test('throws when DATABASE_URL is not set', () => {
    expect(() =>
      runPreflight(
        silentLogger,
        () => true,
        parseBackendConfig({
          PORT: '8000',
          DATABASE_URL: '',
        }),
      ),
    ).toThrow();
  });

  test('throws when Docker is not available', () => {
    const config = parseBackendConfig({
      DATABASE_URL: 'postgres://localhost/test',
    });
    expect(() => runPreflight(silentLogger, () => false, config)).toThrow('Docker is not available');
  });

  test('does not warn when no hosted LLM key is set because Ollama defaults remain available', () => {
    const logger = { log: mock(() => {}), error: mock(() => {}), warn: mock(() => {}) };
    runPreflight(logger, () => true, parseBackendConfig({
      DATABASE_URL: 'postgres://localhost/test',
    }));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('passes when all prerequisites are met', () => {
    const logger = { log: mock(() => {}), error: mock(() => {}), warn: mock(() => {}) };
    expect(() => runPreflight(logger, () => true, parseBackendConfig({
      DATABASE_URL: 'postgres://localhost/test',
      OPENAI_API_KEY: 'sk-test',
    }))).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('backend startup orchestration', () => {
  beforeEach(() => {
    markBackendNotReady();
  });

  test('marks the backend ready only after database initialization and listen succeed', async () => {
    const order: string[] = [];
    const config = parseBackendConfig({
      DATABASE_URL: 'postgres://localhost/test',
      PORT: '18821',
      OPENAI_API_KEY: 'sk-test',
    });
    await startBackend({
      config,
      logger: silentLogger,
      skipPreflight: true,
      initPool: () => { order.push('pool'); },
      initSchemaMigrations: async () => { order.push('migrations'); },
      listen: async () => { order.push('listen'); },
    });

    expect(order).toEqual(['pool', 'migrations', 'listen']);
    expect(getBackendReadiness().status).toBe('ready');
    expect(silentLogger.error).not.toHaveBeenCalled();
  });

  test('does not start listening and stays unready when database initialization fails', async () => {
    const order: string[] = [];
    const listen = mock(async () => { order.push('listen'); });
    const config = parseBackendConfig({
      DATABASE_URL: 'postgres://localhost/test',
      PORT: '18821',
      OPENAI_API_KEY: 'sk-test',
    });

    await expect(
      startBackend({
        config,
        logger: silentLogger,
        skipPreflight: true,
        initPool: () => { order.push('pool'); },
        initSchemaMigrations: async () => {
          order.push('migrations');
          throw new Error('db unavailable');
        },
        listen,
      }),
    ).rejects.toThrow('db unavailable');

    expect(order).toEqual(['pool', 'migrations']);
    expect(listen).not.toHaveBeenCalled();
    expect(getBackendReadiness().status).toBe('not_ready');
    expect(getBackendReadiness().reason).toContain('db unavailable');
  });
});
