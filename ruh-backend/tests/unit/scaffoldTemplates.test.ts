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
    // Single-port architecture: backend serves dashboard at /, so we register
    // only the backend service. A separate "dashboard" service with empty
    // command used to trigger spurious "Optional service unhealthy: dashboard"
    // warnings at setup time.
    expect(setup.services).toEqual([
      {
        name: 'backend',
        command: 'env PORT=3100 npx tsx backend/index.ts',
        port: 3100,
        healthCheck: '/health',
      },
    ]);

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

  test('production dashboard pages do NOT embed prototype-spec metadata (workflows, actions, artifacts, approval gate)', () => {
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
    // The prototype spec — workflow names, planned actions, generated
    // artifacts, approval-gate header, revision prompts — is process
    // metadata that belongs in the architect's plan and the prototype tab
    // in agent-builder. It must NOT appear on the operator's live
    // dashboard. Production pages render only live UI primitives
    // (PageHeader + MetricCard/DataTable/charts fed by useApi).
    expect(page?.content).not.toContain('Prototype approval gate');
    expect(page?.content).not.toContain('Project Review');
    expect(page?.content).not.toContain('prototypeActionEndpoints');
    expect(page?.content).not.toContain('runPrototypeAction');
    expect(page?.content).not.toContain('Create estimate');
    expect(page?.content).not.toContain('Estimate build pipeline');
    expect(page?.content).not.toContain('Source evidence map');
    expect(page?.content).not.toContain('Does this match ECC project review?');
    // But the page DOES still render the live primitives for its components.
    expect(page?.content).toContain("PageHeader title=\"Estimate Projects\"");
    expect(page?.content).toContain("DataTable");

    const route = files.find((file) => file.path === 'backend/routes/estimator.ts');
    expect(route?.content).toContain('createInitialState');
    expect(route?.content).toContain("router.post('/projects/reset-demo'");
    expect(route?.content).toContain("router.post('/pipeline/run-step'");
    expect(route?.content).not.toContain('placeholder: true');
  });
});
