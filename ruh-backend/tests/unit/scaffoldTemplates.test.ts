import { describe, expect, test } from 'bun:test';

import { generateScaffoldFiles, staleScaffoldFilesForPlan } from '../../src/scaffoldTemplates';

describe('generateScaffoldFiles', () => {
  test('normalizes loose architect plan shapes before generating scaffold files', () => {
    const files = generateScaffoldFiles({
      skills: ['flow-checker'],
      workflow: { steps: ['flow-checker'] },
      integrations: ['browser'],
      triggers: [],
      channels: ['web'],
      envVars: ['TEST_ACCOUNT_EMAIL'],
      subAgents: [],
      missionControl: null,
      dataSchema: {
        tables: [
          {
            name: 'test_runs',
            columns: ['id', 'status'],
            indexes: ['status'],
          },
        ],
      },
      apiEndpoints: [
        {
          method: 'GET',
          path: '/api/test-runs',
          purpose: 'List recent test runs',
        },
      ],
      dashboardPages: [
        {
          path: '/runs',
          name: 'Runs',
          components: ['runs table'],
        },
      ],
      vectorCollections: ['run_notes'],
    } as never, 'Flow QA Agent');

    const packageJson = JSON.parse(files.find((file) => file.path === 'package.json')!.content);
    expect(packageJson.scripts['db:seed']).toBe('tsx db/seed.ts');

    const setup = JSON.parse(files.find((file) => file.path === '.openclaw/setup.json')!.content);
    expect(setup.install).toBe('NODE_ENV=development npm install --include=dev');
    expect(setup.services).toContainEqual({
      name: 'dashboard',
      command: '',
      port: 3100,
      healthCheck: '/health',
      optional: true,
    });

    const route = files.find((file) => file.path === 'backend/routes/test-runs.ts');
    expect(route?.content).toContain('List recent test runs');

    const dashboardPage = files.find((file) => file.path === 'dashboard/pages/runs.tsx');
    expect(dashboardPage?.content).toContain('<DataTable');

    const uiHelpers = files.find((file) => file.path === 'dashboard/components/ui.tsx');
    expect(uiHelpers?.content).toContain('<div');

    const dashedHook = files.find((file) => file.path === 'dashboard/hooks/useTestRuns.ts');
    expect(dashedHook?.content).toContain('export function useTestRuns()');
  });

  test('reports obsolete scaffold files that break rerun typechecks', () => {
    const stale = staleScaffoldFilesForPlan({
      skills: [],
      workflow: { steps: [] },
      integrations: [],
      triggers: [],
      channels: [],
      envVars: [],
      subAgents: [],
      missionControl: null,
      apiEndpoints: [{ method: 'GET', path: '/api/test-runs', description: 'List runs' }],
      dashboardPages: [
        {
          path: '/runs',
          title: 'Runs',
          components: [{ type: 'data-table', title: 'Runs', dataSource: '/api/test-runs' }],
        },
      ],
    });

    expect(stale).toContain('dashboard/components/ui.ts');
    expect(stale).toContain('dashboard/hooks/useTest-runs.ts');
    expect(stale).not.toContain('dashboard/hooks/useTestRuns.ts');
  });
});
