/**
 * Unit tests for src/marketplaceRuntime.ts — pure functions, no DB mocking needed.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildSoulContentFromAgent,
  buildCronJobsFromAgent,
  buildRuntimeSkillsFromAgent,
  buildPublishedRuntimeSnapshot,
  buildInstalledAgentSeed,
  buildConfigurePayloadFromAgent,
} from '../../../src/marketplaceRuntime';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-123',
    name: 'Test Agent',
    avatar: '🤖',
    description: 'A test agent for marketplace',
    skills: ['exec', 'browse'],
    trigger_label: 'Manual trigger',
    status: 'active',
    sandbox_ids: [],
    forge_sandbox_id: null,
    skill_graph: null,
    workflow: null,
    agent_rules: [],
    runtime_inputs: [],
    tool_connections: [],
    triggers: [],
    improvements: [],
    channels: [],
    discovery_documents: null,
    workspace_memory: { instructions: '', continuity_summary: '', pinned_paths: [], updated_at: null },
    paperclip_company_id: null,
    paperclip_workers: [],
    creation_session: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  } as any;
}

// ── buildSoulContentFromAgent ────────────────────────────────────────────────

describe('buildSoulContentFromAgent', () => {
  test('includes agent name and description', () => {
    const content = buildSoulContentFromAgent(makeAgent());
    expect(content).toContain('# You are Test Agent');
    expect(content).toContain('A test agent for marketplace');
  });

  test('lists skills from skills array when no skill_graph', () => {
    const content = buildSoulContentFromAgent(makeAgent({ skills: ['exec', 'browse'] }));
    expect(content).toContain('**exec**');
    expect(content).toContain('**browse**');
  });

  test('uses skill_graph nodes when present', () => {
    const agent = makeAgent({
      skill_graph: [
        { skill_id: 'analyze', name: 'Analyze Data', description: 'Analyzes data sources' },
        { skill_id: 'report', name: 'Generate Report', description: 'Creates reports' },
      ],
    });
    const content = buildSoulContentFromAgent(agent);
    expect(content).toContain('**Analyze Data**: Analyzes data sources');
    expect(content).toContain('**Generate Report**: Creates reports');
  });

  test('includes agent_rules section when rules exist', () => {
    const agent = makeAgent({ agent_rules: ['Always be polite', 'Never share secrets'] });
    const content = buildSoulContentFromAgent(agent);
    expect(content).toContain('## Rules');
    expect(content).toContain('- Always be polite');
    expect(content).toContain('- Never share secrets');
  });

  test('omits rules section when no rules', () => {
    const content = buildSoulContentFromAgent(makeAgent());
    expect(content).not.toContain('## Rules');
  });

  test('includes tool connections in config context', () => {
    const agent = makeAgent({
      tool_connections: [{
        toolId: 'google-ads',
        name: 'Google Ads',
        description: 'Manage ads',
        status: 'configured',
        authKind: 'oauth',
        connectorType: 'api',
        configSummary: ['account_id: 12345'],
      }],
    });
    const content = buildSoulContentFromAgent(agent);
    expect(content).toContain('Google Ads: configured');
  });

  test('filters secrets from configSummary', () => {
    const agent = makeAgent({
      tool_connections: [{
        toolId: 'tool-1',
        name: 'My Tool',
        description: 'desc',
        status: 'configured',
        authKind: 'api_key',
        connectorType: 'api',
        configSummary: ['api_key: sk-secret', 'region: us-east'],
      }],
    });
    const content = buildSoulContentFromAgent(agent);
    expect(content).not.toContain('sk-secret');
    expect(content).toContain('region');
  });

  test('includes trigger info', () => {
    const agent = makeAgent({
      triggers: [{
        id: 'trigger-1',
        title: 'Daily Check',
        kind: 'schedule',
        status: 'supported',
        schedule: '0 9 * * *',
      }],
    });
    const content = buildSoulContentFromAgent(agent);
    expect(content).toContain('Daily Check');
    expect(content).toContain('schedule 0 9 * * *');
  });

  test('includes trigger_label in behavior section', () => {
    const content = buildSoulContentFromAgent(makeAgent({ trigger_label: 'On webhook' }));
    expect(content).toContain('Your trigger: On webhook');
  });
});

// ── buildCronJobsFromAgent ───────────────────────────────────────────────────

describe('buildCronJobsFromAgent', () => {
  test('returns empty array when no schedule triggers', () => {
    const jobs = buildCronJobsFromAgent(makeAgent());
    expect(jobs).toHaveLength(0);
  });

  test('returns cron from configured schedule trigger', () => {
    const agent = makeAgent({
      triggers: [{
        id: 't-1',
        title: 'Daily',
        kind: 'schedule',
        status: 'supported',
        schedule: '0 9 * * *',
      }],
    });
    const jobs = buildCronJobsFromAgent(agent);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].schedule).toBe('0 9 * * *');
    expect(jobs[0].name).toBe('Test Agent-schedule');
  });

  test('ignores unsupported schedule triggers', () => {
    const agent = makeAgent({
      triggers: [{
        id: 't-1',
        title: 'Planned',
        kind: 'schedule',
        status: 'unsupported',
        schedule: '0 9 * * *',
      }],
    });
    const jobs = buildCronJobsFromAgent(agent);
    expect(jobs).toHaveLength(0);
  });

  test('falls back to agent_rules regex for cron pattern', () => {
    const agent = makeAgent({
      agent_rules: ['cron: 30 8 * * 1-5'],
    });
    const jobs = buildCronJobsFromAgent(agent);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].schedule).toBe('30 8 * * 1');
  });

  test('returns empty when no cron pattern in rules', () => {
    const agent = makeAgent({
      agent_rules: ['Be helpful', 'Answer quickly'],
    });
    const jobs = buildCronJobsFromAgent(agent);
    expect(jobs).toHaveLength(0);
  });
});

// ── buildRuntimeSkillsFromAgent ──────────────────────────────────────────────

describe('buildRuntimeSkillsFromAgent', () => {
  test('uses skill_graph nodes with skill_md', () => {
    const agent = makeAgent({
      skill_graph: [{
        skill_id: 'analyze',
        name: 'Analyze',
        description: 'Data analysis',
        skill_md: '# Analyze skill\nDoes analysis.',
      }],
    });
    const skills = buildRuntimeSkillsFromAgent(agent);
    expect(skills).toHaveLength(1);
    expect(skills[0].skillId).toBe('analyze');
    expect(skills[0].skillMd).toBe('# Analyze skill\nDoes analysis.');
  });

  test('generates fallback skill_md when missing', () => {
    const agent = makeAgent({
      skill_graph: [{
        skill_id: 'report',
        name: 'Report',
        description: 'Generate reports',
      }],
    });
    const skills = buildRuntimeSkillsFromAgent(agent);
    expect(skills).toHaveLength(1);
    expect(skills[0].skillMd).toContain('name: report');
    expect(skills[0].skillMd).toContain('# Report');
  });

  test('falls back to skills array when no skill_graph', () => {
    const agent = makeAgent({ skills: ['exec', 'browse'] });
    const skills = buildRuntimeSkillsFromAgent(agent);
    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('exec');
    expect(skills[1].name).toBe('browse');
  });

  test('filters out nodes without skillId or name', () => {
    const agent = makeAgent({
      skill_graph: [
        { skill_id: 'valid', name: 'Valid', description: 'ok' },
        { description: 'no id or name' },
      ],
    });
    const skills = buildRuntimeSkillsFromAgent(agent);
    expect(skills).toHaveLength(1);
    expect(skills[0].skillId).toBe('valid');
  });
});

// ── buildPublishedRuntimeSnapshot ────────────────────────────────────────────

describe('buildPublishedRuntimeSnapshot', () => {
  test('assembles snapshot with schemaVersion 1', () => {
    const snapshot = buildPublishedRuntimeSnapshot(makeAgent());
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.systemName).toBe('Test Agent');
    expect(snapshot.avatar).toBe('🤖');
    expect(snapshot.description).toBe('A test agent for marketplace');
  });

  test('strips configSummary from tool connections', () => {
    const agent = makeAgent({
      tool_connections: [{
        toolId: 'tool-1',
        name: 'Tool',
        description: 'desc',
        status: 'configured',
        authKind: 'api_key',
        connectorType: 'api',
        configSummary: ['key: value'],
      }],
    });
    const snapshot = buildPublishedRuntimeSnapshot(agent);
    expect(snapshot.toolConnections[0].configSummary).toEqual([]);
  });

  test('resets non-unsupported tool status to available', () => {
    const agent = makeAgent({
      tool_connections: [
        { toolId: 't1', name: 'T1', description: '', status: 'configured', authKind: 'none', connectorType: 'api', configSummary: [] },
        { toolId: 't2', name: 'T2', description: '', status: 'unsupported', authKind: 'none', connectorType: 'api', configSummary: [] },
      ],
    });
    const snapshot = buildPublishedRuntimeSnapshot(agent);
    expect(snapshot.toolConnections[0].status).toBe('available');
    expect(snapshot.toolConnections[1].status).toBe('unsupported');
  });

  test('includes soulContent from buildSoulContentFromAgent', () => {
    const snapshot = buildPublishedRuntimeSnapshot(makeAgent());
    expect(snapshot.soulContent).toContain('# You are Test Agent');
  });
});

// ── buildInstalledAgentSeed ──────────────────────────────────────────────────

describe('buildInstalledAgentSeed', () => {
  test('maps snapshot fields to saveAgent params', () => {
    const snapshot = buildPublishedRuntimeSnapshot(makeAgent());
    const seed = buildInstalledAgentSeed(snapshot, {
      userId: 'user-1',
      orgId: 'org-1',
      fallbackName: 'Fallback',
      fallbackDescription: 'Fallback desc',
    });
    expect(seed.name).toBe('Test Agent');
    expect(seed.avatar).toBe('🤖');
    expect(seed.status).toBe('active');
    expect(seed.createdBy).toBe('user-1');
    expect(seed.orgId).toBe('org-1');
  });

  test('uses fallback name/description when snapshot has empty values', () => {
    const snapshot = buildPublishedRuntimeSnapshot(makeAgent({ name: '', description: '' }));
    const seed = buildInstalledAgentSeed(snapshot, {
      userId: 'u',
      orgId: 'o',
      fallbackName: 'Default Name',
      fallbackDescription: 'Default Desc',
    });
    expect(seed.name).toBe('Default Name');
    expect(seed.description).toBe('Default Desc');
  });
});

// ── buildConfigurePayloadFromAgent ───────────────────────────────────────────

describe('buildConfigurePayloadFromAgent', () => {
  test('produces correct payload shape', () => {
    const payload = buildConfigurePayloadFromAgent(makeAgent());
    expect(payload.system_name).toBe('Test Agent');
    expect(payload.agent_id).toBe('agent-123');
    expect(payload.soul_content).toContain('# You are Test Agent');
    expect(Array.isArray(payload.skills)).toBe(true);
    expect(Array.isArray(payload.cron_jobs)).toBe(true);
    expect(Array.isArray(payload.runtime_inputs)).toBe(true);
  });

  test('includes skills with skill_md', () => {
    const agent = makeAgent({
      skill_graph: [{
        skill_id: 'my-skill',
        name: 'My Skill',
        description: 'Does stuff',
        skill_md: '# Skill content',
      }],
    });
    const payload = buildConfigurePayloadFromAgent(agent);
    expect(payload.skills).toHaveLength(1);
    expect(payload.skills[0].skill_id).toBe('my-skill');
    expect(payload.skills[0].skill_md).toBe('# Skill content');
  });
});
