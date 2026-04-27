/**
 * Contract tests: POST /api/conformance/check — substrate adoption smoke test.
 *
 * The route is a thin adapter over @ruh/openclaw-runtime's runConformance().
 * The substrate has its own exhaustive validation tests (856 of them); these
 * tests verify the HTTP contract: status codes, response shape, auth gate,
 * and that the substrate's bad-input semantics ("findings, not 400") are
 * preserved through the route.
 */

import { describe, expect, test } from 'bun:test';
import { request } from '../helpers/app';
import { signAccessToken } from '../../src/auth/tokens';

function devToken() {
  return signAccessToken({ userId: 'usr-dev-001', email: 'dev@test.dev', role: 'developer', orgId: 'org-001' });
}

const SHA = `sha256:${'a'.repeat(64)}`;

// Mirrors the substrate's basePipeline() fixture from
// packages/openclaw-runtime/src/conformance/__tests__/runner.test.ts.
// Kept inline so this test does not depend on substrate test internals.
function validPipelineManifest() {
  return {
    id: 'ecc-estimator',
    spec_version: '1.0.0-rc.1',
    version: '0.1.0',
    name: 'ECC Estimator',
    description: 'Routine + edge estimates with autonomous cap.',
    agents: [
      { id: 'orchestrator', path: 'agents/orchestrator/', version: '0.1.0', role: 'Pipeline orchestrator', is_orchestrator: true },
      { id: 'intake', path: 'agents/intake/', version: '0.1.0', role: 'Parse RFP' },
    ],
    orchestrator: { agent_id: 'orchestrator', skills: ['route-user-input'] },
    routing: { rules: [{ match: { stage: 'intake' }, specialist: 'intake' }], fallback: 'orchestrator' },
    failure_policy: { intake: 'abort' },
    merge_policy: [],
    memory_authority: [{ tier: 1, lane: 'estimating', writers: ['darrow@ecc.com'] }],
    config_docs: [],
    imports: [],
    output_validator: { layers: ['marker'], heuristic_confidence_threshold: 0.6, schemas: [] },
    dashboard: { manifest_path: 'dashboard/manifest.json', title: 'ECC Estimator', default_landing_panel: 'orchestrator-chat' },
    eval_suite_ref: 'eval/tasks.json',
    hooks: [],
    custom_hooks: [],
    runtime: {
      tenancy: 'on-prem',
      egress: 'tenant-bounded',
      llm_providers: [{ provider: 'anthropic', model: 'claude-opus-4-7', via: 'tenant-proxy' }],
      sandbox: { image: 'openclaw-runtime:1.0.0', resources: { cpu_cores: 4, memory_gb: 16, disk_gb: 100 } },
      database: { kind: 'postgres' },
    },
    dev_stage: 'validated',
    generated_at: '2026-04-27T00:00:00Z',
    generated_by: 'architect@1.0.0',
    checksum: SHA,
  };
}

function validDashboardManifest() {
  return {
    spec_version: '1.0.0-rc.1',
    pipeline_id: 'ecc-estimator',
    title: 'ECC Estimator',
    description: 'Bespoke dashboard.',
    panels: [
      { kind: 'chat', id: 'orchestrator-chat', title: 'Talk' },
      { kind: 'queue', id: 'estimate-queue', title: 'Queue' },
    ],
    navigation: { layout: 'sidebar', groups: [{ label: 'Main', panels: ['orchestrator-chat', 'estimate-queue'] }] },
    default_landing_panel: 'orchestrator-chat',
    role_visibility: {
      roles: [
        {
          name: 'lead_estimator',
          description: 'Final estimating authority',
          granted_to: ['darrow@ecc.com'],
          permissions: [],
          visible_panels: ['orchestrator-chat', 'estimate-queue'],
        },
      ],
    },
  };
}

// ── POST /api/conformance/check ────────────────────────────────────────────

describe('POST /api/conformance/check', () => {
  test('200 — valid pipeline + dashboard pair returns ok=true with no errors', async () => {
    const res = await request()
      .post('/api/conformance/check')
      .set('Authorization', `Bearer ${devToken()}`)
      .send({
        pipelineManifest: validPipelineManifest(),
        dashboardManifest: validDashboardManifest(),
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('spec_version');
    expect(typeof res.body.spec_version).toBe('string');
    expect(res.body).toHaveProperty('report');
    expect(res.body.report.ok).toBe(true);
    expect(res.body.report.errors).toBe(0);
    expect(Array.isArray(res.body.report.findings)).toBe(true);
  });

  test('200 — dashboard-only validates the dashboard alone', async () => {
    const res = await request()
      .post('/api/conformance/check')
      .set('Authorization', `Bearer ${devToken()}`)
      .send({ dashboardManifest: validDashboardManifest() });

    expect(res.status).toBe(200);
    expect(res.body.report.ok).toBe(true);
  });

  test('200 — pipeline alone (with dashboard ref) surfaces dashboard-manifest-required (substrate semantics — partial conformance is non-conformance)', async () => {
    const res = await request()
      .post('/api/conformance/check')
      .set('Authorization', `Bearer ${devToken()}`)
      .send({ pipelineManifest: validPipelineManifest() });

    expect(res.status).toBe(200);
    expect(res.body.report.ok).toBe(false);
    const findings = res.body.report.findings as Array<{ rule: string }>;
    expect(findings.some((f) => f.rule === 'dashboard-manifest-required')).toBe(true);
  });

  test('200 — malformed pipeline manifest is a finding, not a 400 (substrate semantics)', async () => {
    const res = await request()
      .post('/api/conformance/check')
      .set('Authorization', `Bearer ${devToken()}`)
      .send({
        pipelineManifest: { id: 'broken' }, // missing every required field
        dashboardManifest: validDashboardManifest(),
      });

    expect(res.status).toBe(200);
    expect(res.body.report.ok).toBe(false);
    expect(res.body.report.errors).toBeGreaterThan(0);
  });

  test('400 — neither pipelineManifest nor dashboardManifest provided', async () => {
    const res = await request()
      .post('/api/conformance/check')
      .set('Authorization', `Bearer ${devToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('401 — missing auth token rejected', async () => {
    const res = await request()
      .post('/api/conformance/check')
      .send({ dashboardManifest: validDashboardManifest() });

    expect(res.status).toBe(401);
  });
});
