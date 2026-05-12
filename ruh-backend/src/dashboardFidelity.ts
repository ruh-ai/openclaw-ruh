/**
 * dashboardFidelity.ts — verify the deployed dashboard matches the
 * architect's plan AND the prototype contract.
 *
 * This is a deterministic check (no LLM) that runs against the agent's
 * sandbox workspace AFTER the Build stage emits dashboard files. Catches
 * drift between:
 *   - what the plan declares (dashboardPages, dataSources, dashboardPrototype)
 *   - what the prototype previewed (Tasks tab, fixtures, horizontal nav)
 *   - what the Build template actually wrote to /root/.openclaw/workspace/dashboard/
 *
 * Reports per-rule findings with severity + suggested fix. Blocker-level
 * issues feed into buildReport.blockers so the lifecycle-advance guard
 * refuses Build → Review until fidelity passes.
 */

import { dockerExec, getContainerName } from './docker';

export type FidelitySeverity = 'blocker' | 'warning';

export interface FidelityCheck {
  rule: string;
  severity: FidelitySeverity;
  detail: string;
  fix?: string;
}

export interface FidelityReport {
  generatedAt: string;
  checks: FidelityCheck[];
  blockers: FidelityCheck[];
  warnings: FidelityCheck[];
  passed: boolean;
}

interface DashboardPageComponent {
  type: string;
  title?: string;
  dataSource: string;
}

interface DashboardPage {
  path: string;
  title: string;
  components: DashboardPageComponent[];
}

interface ArchitecturePlanShape {
  dashboardPages?: DashboardPage[];
  dashboardPrototype?: { pages?: Array<{ path: string }> };
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
}

async function readWorkspaceText(containerName: string, relPath: string): Promise<string | null> {
  const [ok, out] = await dockerExec(
    containerName,
    `cat "$HOME/.openclaw/workspace/${relPath.replace(/'/g, "'\\''")}" 2>/dev/null`,
    8_000,
  );
  return ok ? out : null;
}

async function fileExists(containerName: string, relPath: string): Promise<boolean> {
  const [ok, out] = await dockerExec(
    containerName,
    `if [ -f "$HOME/.openclaw/workspace/${relPath.replace(/'/g, "'\\''")}" ]; then echo Y; fi`,
    8_000,
  );
  return ok && out.trim() === 'Y';
}

export async function checkDashboardFidelity(
  sandboxId: string,
  plan: ArchitecturePlanShape,
): Promise<FidelityReport> {
  const containerName = getContainerName(sandboxId);
  const checks: FidelityCheck[] = [];

  // Collect declared resources from the plan
  const dashboardPages = plan.dashboardPages ?? [];
  const declaredDataSources = new Set<string>();
  for (const page of dashboardPages) {
    for (const comp of page.components ?? []) {
      if (comp.dataSource) declaredDataSources.add(comp.dataSource.split('?')[0]);
    }
  }

  // Rule 1: every planned page has a corresponding generated page file
  for (const page of dashboardPages) {
    const slug = slugify(page.title);
    const exists = await fileExists(containerName, `dashboard/pages/${slug}.tsx`);
    if (!exists) {
      checks.push({
        rule: 'missing-page',
        severity: 'blocker',
        detail: `Plan declares page "${page.title}" (${page.path}) but dashboard/pages/${slug}.tsx is not in the workspace.`,
        fix: 'Re-run the build pipeline or regenerate the dashboard scaffold.',
      });
    }
  }

  // Rule 2: fixtures.json exists and has the Layer 1 contract keys
  const fixturesRaw = await readWorkspaceText(containerName, 'dashboard/fixtures.json');
  let fixtures: Record<string, unknown> = {};
  if (!fixturesRaw) {
    checks.push({
      rule: 'fixtures-missing',
      severity: 'blocker',
      detail: 'dashboard/fixtures.json is not in the workspace — day-1 dashboard will be empty.',
      fix: 'Re-run the build pipeline (scaffold emits fixtures.json).',
    });
  } else {
    try {
      fixtures = JSON.parse(fixturesRaw);
    } catch {
      checks.push({
        rule: 'fixtures-invalid-json',
        severity: 'blocker',
        detail: 'dashboard/fixtures.json is not valid JSON.',
      });
    }
    if (!fixtures.__tasks) {
      checks.push({
        rule: 'fixtures-tasks-missing',
        severity: 'blocker',
        detail: 'fixtures.json has no __tasks entry — the Tasks tab will be empty on day 1.',
      });
    }
    if (!fixtures.__runs) {
      checks.push({
        rule: 'fixtures-runs-missing',
        severity: 'blocker',
        detail: 'fixtures.json has no __runs entry — the RunInspector will be empty on day 1.',
      });
    }
    // Rule 2b: every declared dataSource has a fixture entry
    for (const ds of declaredDataSources) {
      if (!fixtures[ds]) {
        checks.push({
          rule: 'fixture-datasource-missing',
          severity: 'warning',
          detail: `dataSource "${ds}" is declared in the plan but has no fixture entry — the component will render empty on day 1.`,
        });
      }
    }
  }

  // Rule 3: layout uses horizontal top nav (not 240px sidebar)
  const layoutRaw = await readWorkspaceText(containerName, 'dashboard/layout.tsx');
  if (!layoutRaw) {
    checks.push({
      rule: 'layout-missing',
      severity: 'blocker',
      detail: 'dashboard/layout.tsx is not in the workspace.',
    });
  } else if (layoutRaw.includes("gridTemplateColumns: '240px") || layoutRaw.includes('gridTemplateColumns: "240px')) {
    checks.push({
      rule: 'layout-old-sidebar',
      severity: 'blocker',
      detail: 'dashboard/layout.tsx still uses the 240px sidebar grid. The prototype shows a horizontal top nav.',
      fix: 'Re-run scaffold with the latest template.',
    });
  }

  // Rule 4: Tasks page + components present (Layer 1 contract)
  for (const required of [
    'dashboard/pages/tasks.tsx',
    'dashboard/components/TaskFeed.tsx',
    'dashboard/components/RunInspector.tsx',
    'dashboard/components/tasks-types.ts',
    'dashboard/hooks/useTasks.ts',
  ]) {
    const exists = await fileExists(containerName, required);
    if (!exists) {
      checks.push({
        rule: 'tasks-contract-missing',
        severity: 'blocker',
        detail: `Layer 1 Tasks contract requires ${required} but it is not in the workspace.`,
      });
    }
  }

  // Rule 5: production pages MUST NOT embed prototype-spec metadata
  for (const page of dashboardPages) {
    const slug = slugify(page.title);
    const content = await readWorkspaceText(containerName, `dashboard/pages/${slug}.tsx`);
    if (!content) continue;
    if (content.includes('PROTOTYPE APPROVAL GATE')) {
      checks.push({
        rule: 'prototype-text-leak',
        severity: 'blocker',
        detail: `dashboard/pages/${slug}.tsx contains "PROTOTYPE APPROVAL GATE" — process metadata leaking to production UI.`,
        fix: 'Re-run scaffold with the latest template (this leak was fixed in PR #164).',
      });
    }
    if (content.includes('<DashboardPrototypePanel') || content.includes('DashboardPrototypePanel /')) {
      checks.push({
        rule: 'prototype-panel-leak',
        severity: 'blocker',
        detail: `dashboard/pages/${slug}.tsx imports DashboardPrototypePanel — process metadata leaking to production UI.`,
        fix: 'Re-run scaffold with the latest template.',
      });
    }
  }

  // Rule 6: prototype.pages and dashboardPages should describe the same set of paths
  const protoPaths = new Set((plan.dashboardPrototype?.pages ?? []).map((p) => p.path));
  const planPaths = new Set(dashboardPages.map((p) => p.path));
  for (const planPath of planPaths) {
    if (protoPaths.size > 0 && !protoPaths.has(planPath)) {
      checks.push({
        rule: 'prototype-pages-drift',
        severity: 'warning',
        detail: `dashboardPages includes ${planPath} but dashboardPrototype.pages does not — prototype reviewers may have approved a different shape than what was built.`,
      });
    }
  }
  for (const protoPath of protoPaths) {
    if (!planPaths.has(protoPath)) {
      checks.push({
        rule: 'prototype-pages-drift',
        severity: 'warning',
        detail: `dashboardPrototype.pages includes ${protoPath} but dashboardPages does not — prototype previewed a page the Build can't render.`,
      });
    }
  }

  const blockers = checks.filter((c) => c.severity === 'blocker');
  const warnings = checks.filter((c) => c.severity === 'warning');
  return {
    generatedAt: new Date().toISOString(),
    checks,
    blockers,
    warnings,
    passed: blockers.length === 0,
  };
}
