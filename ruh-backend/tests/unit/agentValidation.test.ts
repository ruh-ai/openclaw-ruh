import { describe, expect, test, mock, beforeEach } from 'bun:test';

const mockDockerExec = mock<(container: string, cmd: string, timeout?: number) => Promise<[boolean, string]>>();
mock.module('../../src/docker', () => ({
  dockerExec: mockDockerExec,
  dockerSpawn: mock(async () => [0, '']),
  dockerContainerRunning: mock(async () => true),
  getContainerName: (id: string) => `openclaw-${id}`,
  shellQuote: (v: string) => `'${v}'`,
  joinShellArgs: (args: Array<string | number>) => args.join(' '),
  normalizePathSegment: (v: string) => v,
  readContainerPorts: () => ({ gatewayPort: 18789 }),
  buildHomeFileWriteCommand: () => '',
  buildConfigureAgentCronAddCommand: () => '',
  buildCronDeleteCommand: () => '',
  buildCronRunCommand: () => '',
  parseManagedSandboxContainerList: () => [],
  listManagedSandboxContainers: mock(async () => []),
}));

const { runDeepValidation } = await import('../../src/agentValidation');

beforeEach(() => { mockDockerExec.mockReset(); });

const log = () => {};

describe('runDeepValidation', () => {
  test('returns pass when all checks succeed', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('find') && cmd.includes('.db')) return [true, '/root/.openclaw/workspace/db/app.db'];
      if (cmd.includes('sqlite3')) return [true, 'CREATE TABLE realms (id TEXT);'];
      if (cmd.includes('curl -sf') && cmd.includes('localhost:3100')) return [true, '{"metrics":{"total":5}}'];
      if (cmd.includes('ls') && cmd.includes('hooks')) return [true, 'useOverview.ts\n'];
      if (cmd.includes('cat') && cmd.includes('hooks')) return [true, 'return data?.metrics;'];
      if (cmd.includes('test -f') && cmd.includes('dist/index.html')) return [true, 'OK'];
      if (cmd.includes('curl -sf') && cmd.includes('localhost:3200')) return [true, '<html>OK</html>'];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      dataSchema: { tables: [{ name: 'realms' }] },
      apiEndpoints: [{ method: 'GET', path: '/api/overview' }],
    }, log);
    expect(report.overallStatus).toBe('pass');
    expect(report.failCount).toBe(0);
  });

  test('detects missing database tables', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('find') && cmd.includes('.db')) return [true, '/root/.openclaw/workspace/db/app.db'];
      if (cmd.includes('sqlite3')) return [true, ''];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      dataSchema: { tables: [{ name: 'missing_table' }] },
      apiEndpoints: [],
    }, log);
    const dbCheck = report.checks.find(c => c.check === 'db_schema' && c.status === 'fail');
    expect(dbCheck).toBeDefined();
    expect(dbCheck!.label).toContain('missing_table');
    expect(dbCheck!.fixContext).toBeDefined();
  });

  test('skips database check when no db files found', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('find') && cmd.includes('.db')) return [true, ''];
      if (cmd.includes('psql')) return [false, 'command not found'];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      dataSchema: { tables: [{ name: 'test' }] },
      apiEndpoints: [],
    }, log);
    expect(report.checks.find(c => c.check === 'db_schema')?.status).toBe('skip');
  });

  test('detects API endpoint failures', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('curl -sf') && cmd.includes('/api/broken')) return [false, ''];
      if (cmd.includes('test -f')) return [false, ''];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      apiEndpoints: [{ method: 'GET', path: '/api/broken' }],
    }, log);
    const apiCheck = report.checks.find(c => c.check === 'api_endpoint' && c.status === 'fail');
    expect(apiCheck).toBeDefined();
    expect(apiCheck!.endpoint).toBe('/api/broken');
  });

  test('detects invalid JSON from endpoints', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('curl -sf') && cmd.includes('/api/bad')) return [true, '<html>Error</html>'];
      if (cmd.includes('test -f')) return [false, ''];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      apiEndpoints: [{ method: 'GET', path: '/api/bad' }],
    }, log);
    expect(report.checks.find(c => c.label.includes('invalid JSON'))).toBeDefined();
  });

  test('detects contract mismatches', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('curl -sf') && cmd.includes('/api/campaigns'))
        return [true, '{"rows":[{"campaign_name":"Test"}]}'];
      if (cmd.includes('ls') && cmd.includes('hooks')) return [true, 'useCampaigns.ts\n'];
      if (cmd.includes('cat') && cmd.includes('useCampaigns'))
        return [true, 'data.rows.map(row => row.name + row.sentCount)'];
      if (cmd.includes('test -f')) return [false, ''];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      apiEndpoints: [{ method: 'GET', path: '/api/campaigns' }],
    }, log);
    const contractCheck = report.checks.find(c => c.check === 'contract' && c.status === 'fail');
    expect(contractCheck).toBeDefined();
    expect(contractCheck!.detail).toContain('name');
  });

  test('passes contract check when fields match', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('curl -sf') && cmd.includes('/api/items'))
        return [true, '{"rows":[{"title":"Test","price":10}]}'];
      if (cmd.includes('ls') && cmd.includes('hooks')) return [true, 'useItems.ts\n'];
      if (cmd.includes('cat') && cmd.includes('useItems'))
        return [true, 'data.rows.map(item => item.title + item.price)'];
      if (cmd.includes('test -f')) return [true, 'OK'];
      if (cmd.includes('curl -sf') && cmd.includes('localhost:3200')) return [true, '<html>OK</html>'];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      apiEndpoints: [{ method: 'GET', path: '/api/items' }],
    }, log);
    expect(report.checks.find(c => c.check === 'contract')?.status).toBe('pass');
  });

  test('validates dashboard build', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('test -f') && cmd.includes('dist/index.html')) return [false, ''];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', { apiEndpoints: [] }, log);
    const dashCheck = report.checks.find(c => c.check === 'dashboard_build' && c.status === 'fail');
    expect(dashCheck).toBeDefined();
    expect(dashCheck!.fixContext).toContain('vite build');
  });

  test('validates integration', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('curl -sf') && cmd.includes('localhost:3100')) return [true, 'OK'];
      if (cmd.includes('test -f')) return [true, 'OK'];
      if (cmd.includes('curl -sf') && cmd.includes('localhost:3200')) return [true, '<html>OK</html>'];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      apiEndpoints: [{ method: 'GET', path: '/api/health' }],
    }, log);
    expect(report.checks.find(c => c.check === 'integration')?.status).toBe('pass');
  });

  test('skips POST endpoints', async () => {
    mockDockerExec.mockImplementation(async () => [true, '']);
    const report = await runDeepValidation('sandbox-1', {
      apiEndpoints: [{ method: 'POST', path: '/api/create' }, { method: 'PUT', path: '/api/update' }],
    }, log);
    expect(report.checks.filter(c => c.check === 'api_endpoint').length).toBe(0);
  });

  test('report counts are correct', async () => {
    mockDockerExec.mockImplementation(async (_c: string, cmd: string) => {
      if (cmd.includes('curl -sf') && cmd.includes('/api/good')) return [true, '{"ok":true}'];
      if (cmd.includes('curl -sf') && cmd.includes('/api/bad')) return [false, ''];
      if (cmd.includes('test -f')) return [true, 'OK'];
      if (cmd.includes('curl -sf') && cmd.includes('localhost:3200')) return [true, '<html>OK</html>'];
      if (cmd.includes('ls') && cmd.includes('hooks')) return [true, ''];
      return [true, ''];
    });
    const report = await runDeepValidation('sandbox-1', {
      apiEndpoints: [{ method: 'GET', path: '/api/good' }, { method: 'GET', path: '/api/bad' }],
    }, log);
    expect(report.passCount + report.failCount + report.checks.filter(c => c.status === 'skip').length)
      .toBe(report.checks.length);
    expect(report.overallStatus).toBe('fail');
  });
});
