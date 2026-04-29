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
    expect(stale).toContain('BOOTSTRAP.md');
    expect(stale).not.toContain('dashboard/hooks/useTestRuns.ts');
  });

  test('generates cron install script without running cron installation during build setup', () => {
    const files = generateScaffoldFiles({
      skills: [],
      workflow: { steps: [] },
      integrations: [],
      triggers: [
        {
          type: 'cron',
          name: 'Daily Refresh',
          schedule: '0 9 * * *',
          skillId: 'refresh',
          message: 'Refresh dashboards',
        },
      ],
      channels: [],
      envVars: [],
      subAgents: [],
      missionControl: null,
      dataSchema: { tables: [] },
      apiEndpoints: [],
      dashboardPages: [],
    } as never, 'Cron Agent');

    const setup = JSON.parse(files.find((file) => file.path === '.openclaw/setup.json')!.content);
    expect((setup.setup as Array<{ name: string }>).some((step) => step.name === 'install-cron-jobs')).toBe(false);
    expect(files.find((file) => file.path === '.openclaw/install-crons.sh')?.content).toContain('openclaw cron add');
  });

  test('renders dashboard prototype workflows and actions into generated dashboard pages', () => {
    const files = generateScaffoldFiles({
      skills: [],
      workflow: { steps: [] },
      integrations: [],
      triggers: [],
      channels: [],
      envVars: [],
      subAgents: [],
      missionControl: null,
      dataSchema: { tables: [] },
      apiEndpoints: [
        { method: 'GET', path: '/api/estimator/projects', description: 'List projects' },
        { method: 'POST', path: '/api/estimator/projects/reset-demo', description: 'Create estimate' },
        { method: 'POST', path: '/api/estimator/pipeline/run-step', description: 'Run estimate pipeline' },
      ],
      dashboardPages: [
        {
          path: '/estimator/projects',
          title: 'Estimate Projects',
          components: [
            { type: 'data-table', title: 'Projects', dataSource: '/api/estimator/projects' },
          ],
        },
      ],
      dashboardPrototype: {
        summary: 'ECC estimator workspace',
        primaryUsers: ['Estimator'],
        workflows: [
          {
            id: 'project-review',
            name: 'Project Review',
            steps: ['Open estimate', 'Resolve blockers', 'Approve package'],
            requiredActions: ['resolve_blocker', 'approve_package'],
            successCriteria: ['Blocked projects cannot be approved'],
          },
        ],
        pages: [
          {
            path: '/estimator/projects',
            title: 'Estimate Projects',
            purpose: 'Select active estimates and review blockers.',
            supportsWorkflows: ['project-review'],
            requiredActions: ['open_estimate'],
            acceptanceCriteria: ['Shows blocker count'],
          },
        ],
        actions: [
          { id: 'create-estimate', label: 'Create estimate', type: 'create', target: 'work_item', primary: true },
          { id: 'run-estimate-pipeline', label: 'Run estimate pipeline', type: 'run_pipeline', target: 'pipeline', primary: true },
        ],
        pipeline: {
          name: 'Estimate build pipeline',
          triggerActionId: 'run-estimate-pipeline',
          steps: [
            { id: 'document-intake', name: 'Document intake', producesArtifacts: ['source-evidence-map'] },
            { id: 'approval-package', name: 'Approval package', requiresApproval: true },
          ],
          completionCriteria: ['Approval package is ready'],
          failureStates: ['Missing source evidence'],
        },
        artifacts: [
          {
            id: 'source-evidence-map',
            name: 'Source evidence map',
            type: 'evidence',
            reviewActions: ['approve_artifact', 'request_revision'],
            acceptanceCriteria: ['Every quantity links to source evidence'],
          },
        ],
        revisionPrompts: ['Does this match ECC project review?'],
        approvalChecklist: ['Prototype reviewed'],
      },
    } as never, 'Estimator');

    const page = files.find((file) => file.path === 'dashboard/pages/estimate-projects.tsx');
    expect(page?.content).toContain('Prototype approval gate');
    expect(page?.content).toContain('Project Review');
    expect(page?.content).toContain('prototypeActionEndpoints');
    expect(page?.content).toContain('onClick={() => runPrototypeAction(action)}');
    expect(page?.content).toContain('Create estimate');
    expect(page?.content).toContain('Estimate build pipeline');
    expect(page?.content).toContain('Source evidence map');
    expect(page?.content).toContain('resolve_blocker');
    expect(page?.content).toContain('Blocked projects cannot be approved');
    expect(page?.content).toContain('Does this match ECC project review?');

    const route = files.find((file) => file.path === 'backend/routes/estimator.ts');
    expect(route?.content).toContain('createInitialState');
    expect(route?.content).toContain("router.post('/projects/reset-demo'");
    expect(route?.content).toContain("router.post('/pipeline/run-step'");
    expect(route?.content).not.toContain('placeholder: true');
  });
});
