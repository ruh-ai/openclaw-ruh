import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { getBackendReadiness, markBackendNotReady } from '../../src/backendReadiness';
import { startBackend } from '../../src/startup';

describe('backend startup orchestration', () => {
  beforeEach(() => {
    markBackendNotReady();
  });

  test('marks the backend ready only after database initialization and listen succeed', async () => {
    const order: string[] = [];
    const logger = { log: mock(() => {}), error: mock(() => {}) };

    await startBackend({
      port: 18821,
      logger,
      initPool: () => { order.push('pool'); },
      initStoreDb: async () => { order.push('store'); },
      initConversationDb: async () => { order.push('conversation'); },
      initAgentDb: async () => { order.push('agent'); },
      initAuditDb: async () => { order.push('audit'); },
      listen: async () => { order.push('listen'); },
    });

    expect(order).toEqual(['pool', 'store', 'conversation', 'agent', 'audit', 'listen']);
    expect(getBackendReadiness().status).toBe('ready');
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('does not start listening and stays unready when database initialization fails', async () => {
    const order: string[] = [];
    const logger = { log: mock(() => {}), error: mock(() => {}) };
    const listen = mock(async () => { order.push('listen'); });

    await expect(
      startBackend({
        port: 18821,
        logger,
        initPool: () => { order.push('pool'); },
        initStoreDb: async () => {
          order.push('store');
          throw new Error('db unavailable');
        },
        initConversationDb: async () => { order.push('conversation'); },
        initAgentDb: async () => { order.push('agent'); },
        initAuditDb: async () => { order.push('audit'); },
        listen,
      }),
    ).rejects.toThrow('db unavailable');

    expect(order).toEqual(['pool', 'store']);
    expect(listen).not.toHaveBeenCalled();
    expect(getBackendReadiness().status).toBe('not_ready');
    expect(getBackendReadiness().reason).toContain('db unavailable');
    expect(logger.error).toHaveBeenCalled();
  });
});
