import { describe, expect, test } from 'bun:test';
import type { AgentRecord } from '../../src/agentStore';
import {
  buildConfigurePayloadFromAgent,
  buildCronJobsFromAgent,
  buildInstalledAgentSeed,
  buildPublishedRuntimeSnapshot,
  buildRuntimeSkillsFromAgent,
  buildSoulContentFromAgent,
} from '../../src/marketplaceRuntime';

function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agent-1',
    name: 'Ops Helper',
    avatar: 'ops.png',
    description: 'Handle internal operations requests',
    skills: ['Slack Reader', 'CSV Analyst'],
    trigger_label: 'Manual',
    status: 'active',
    sandbox_ids: [],
    forge_sandbox_id: null,
    forge_stage: null,
    skill_graph: null,
    workflow: { steps: ['collect', 'answer'] },
    agent_rules: [],
    runtime_inputs: [],
    tool_connections: [],
    triggers: [],
    improvements: [],
    channels: [],
    discovery_documents: null,
    workspace_memory: {
      instructions: '',
      continuity_summary: '',
      pinned_paths: [],
      updated_at: null,
    },
    paperclip_company_id: null,
    paperclip_workers: [],
    creation_session: null,
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('marketplaceRuntime.buildSoulContentFromAgent', () => {
  test('renders skill graph nodes, rules, and sanitized config context', () => {
    const content = buildSoulContentFromAgent(makeAgent({
      skill_graph: [
        {
          skill_id: 'slack-reader',
          name: 'Slack Reader',
          description: 'Read Slack channels and thread context.',
        },
        {
          skill_id: 'csv-analyst',
          name: 'CSV Analyst',
          description: 'Summarize CSV files.',
        },
      ],
      agent_rules: ['Do not post secrets', 'Escalate unclear billing changes'],
      runtime_inputs: [
        {
          key: 'workspace_id',
          label: 'Workspace ID',
          description: 'Slack workspace identifier',
          required: true,
          source: 'architect_requirement',
          value: 'team-123',
        },
        {
          key: 'channel_id',
          label: 'Channel ID',
          description: 'Default Slack channel',
          required: false,
          source: 'skill_requirement',
          value: '',
        },
      ],
      tool_connections: [
        {
          toolId: 'slack',
          name: 'Slack',
          description: 'Slack connector',
          status: 'configured',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: [
            'workspace: Ruh HQ',
            'callback URL https://ruh.ai/callback',
            'client secret present',
          ],
        },
        {
          toolId: 'github',
          name: 'GitHub',
          description: 'GitHub connector',
          status: 'missing_secret',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['repo: ruh-ai/openclaw-ruh'],
        },
      ],
      triggers: [
        {
          id: 'trigger-1',
          title: 'Daily sync',
          kind: 'schedule',
          status: 'supported',
          description: 'Runs every morning',
          schedule: '0 9 * * 1-5',
        },
        {
          id: 'trigger-2',
          title: 'Webhook fallback',
          kind: 'webhook',
          status: 'unsupported',
          description: 'Manual plan only',
        },
      ],
      trigger_label: 'Slack request',
    }));

    expect(content).toContain('# You are Ops Helper');
    expect(content).toContain('- **Slack Reader**: Read Slack channels and thread context.');
    expect(content).toContain('## Rules');
    expect(content).toContain('- Tool Slack: configured (workspace: Ruh HQ)');
    expect(content).toContain('- Tool GitHub: selected but missing credentials (repo: ruh-ai/openclaw-ruh)');
    expect(content).not.toContain('callback URL');
    expect(content).not.toContain('client secret');
    expect(content).toContain('- Runtime input Workspace ID: provided');
    expect(content).toContain('- Runtime input Channel ID: missing');
    expect(content).toContain('- Trigger Daily sync: supported; schedule 0 9 * * 1-5');
    expect(content).toContain('- Trigger Webhook fallback: manual plan only; not runtime-ready');
    expect(content).toContain('- Your trigger: Slack request');
  });

  test('falls back to the simple skill list when no skill graph exists', () => {
    const content = buildSoulContentFromAgent(makeAgent({
      skills: ['Slack Reader', 'CSV Analyst'],
      description: '',
    }));

    expect(content).toContain('- **Slack Reader**');
    expect(content).toContain('- **CSV Analyst**');
    expect(content).toContain('run the following skills: Slack Reader, CSV Analyst');
  });
});

describe('marketplaceRuntime.buildCronJobsFromAgent', () => {
  test('prefers supported schedule triggers', () => {
    const cronJobs = buildCronJobsFromAgent(makeAgent({
      name: 'Scheduler',
      triggers: [
        {
          id: 'schedule-1',
          title: 'Morning run',
          kind: 'schedule',
          status: 'supported',
          description: 'Daily job',
          schedule: '5 8 * * *',
        },
      ],
      agent_rules: ['schedule: 0 0 * * *'],
    }));

    expect(cronJobs).toEqual([
      {
        name: 'Scheduler-schedule',
        schedule: '5 8 * * *',
        message: 'Run Scheduler scheduled task',
      },
    ]);
  });

  test('falls back to cron expressions embedded in agent rules', () => {
    const cronJobs = buildCronJobsFromAgent(makeAgent({
      name: 'Rule Based Agent',
      agent_rules: ['cron: 15 6 * * 1'],
    }));

    expect(cronJobs).toEqual([
      {
        name: 'Rule Based Agent-schedule',
        schedule: '15 6 * * 1',
        message: 'Run Rule Based Agent scheduled task',
      },
    ]);
  });
});

describe('marketplaceRuntime.buildRuntimeSkillsFromAgent', () => {
  test('uses explicit skill graph content and generates fallback skill markdown when needed', () => {
    const skills = buildRuntimeSkillsFromAgent(makeAgent({
      skill_graph: [
        {
          skill_id: 'slack-reader',
          name: 'Slack Reader',
          description: 'Read Slack threads.',
          skill_md: '# Slack Reader\n\nUse Slack safely.',
        },
        {
          skill_id: 'csv-analyst',
          name: 'CSV Analyst',
          description: 'Summarize CSV files.',
        },
        {
          name: 'No Id Node',
        },
      ],
    }));

    expect(skills).toHaveLength(3);
    expect(skills[0]).toEqual({
      skillId: 'slack-reader',
      name: 'Slack Reader',
      description: 'Read Slack threads.',
      skillMd: '# Slack Reader\n\nUse Slack safely.',
    });
    expect(skills[1]).toEqual(expect.objectContaining({
      skillId: 'csv-analyst',
      name: 'CSV Analyst',
      description: 'Summarize CSV files.',
    }));
    expect(skills[1].skillMd).toContain('name: csv-analyst');
    expect(skills[1].skillMd).toContain('# TODO: Implement this skill');
    expect(skills[2]).toEqual(expect.objectContaining({
      skillId: 'no-id-node',
      name: 'No Id Node',
      description: '',
    }));
  });

  test('falls back to top-level agent skills when no graph exists', () => {
    const skills = buildRuntimeSkillsFromAgent(makeAgent({
      skills: ['Slack Reader'],
      skill_graph: null,
    }));

    expect(skills).toEqual([
      expect.objectContaining({
        skillId: 'slack-reader',
        name: 'Slack Reader',
        description: '',
      }),
    ]);
    expect(skills[0].skillMd).toContain('description: "Slack Reader"');
  });
});

describe('marketplaceRuntime snapshot builders', () => {
  test('buildPublishedRuntimeSnapshot sanitizes tool connection state for installed agents', () => {
    const snapshot = buildPublishedRuntimeSnapshot(makeAgent({
      skill_graph: [
        {
          skill_id: 'slack-reader',
          name: 'Slack Reader',
          description: 'Read Slack threads.',
          skill_md: '# Slack Reader',
        },
      ],
      runtime_inputs: [
        {
          key: 'workspace_id',
          label: 'Workspace ID',
          description: 'Slack workspace identifier',
          required: true,
          source: 'architect_requirement',
          value: 'team-123',
        },
      ],
      tool_connections: [
        {
          toolId: 'slack',
          name: 'Slack',
          description: 'Slack connector',
          status: 'configured',
          authKind: 'oauth',
          connectorType: 'mcp',
          configSummary: ['workspace: Ruh HQ'],
        },
        {
          toolId: 'custom-cli',
          name: 'Custom CLI',
          description: 'Manual CLI step',
          status: 'unsupported',
          authKind: 'none',
          connectorType: 'cli',
          configSummary: ['binary: helper'],
        },
      ],
      triggers: [
        {
          id: 'trigger-1',
          title: 'Manual',
          kind: 'manual',
          status: 'supported',
          description: 'Manual launch',
        },
      ],
      channels: [
        {
          kind: 'slack',
          status: 'configured',
          label: 'Team Slack',
          description: 'Primary Slack channel',
        },
      ],
      agent_rules: ['Be concise'],
    }));

    expect(snapshot.toolConnections).toEqual([
      expect.objectContaining({ toolId: 'slack', status: 'available', configSummary: [] }),
      expect.objectContaining({ toolId: 'custom-cli', status: 'unsupported', configSummary: [] }),
    ]);
    expect(snapshot.runtimeInputs).toHaveLength(1);
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.skills).toHaveLength(1);
  });

  test('buildInstalledAgentSeed and buildConfigurePayloadFromAgent map snapshot fields back into persisted payloads', () => {
    const agent = makeAgent({
      id: 'agent-99',
      name: 'Installed Helper',
      description: 'Assists with installs',
      skill_graph: [
        {
          skill_id: 'slack-reader',
          name: 'Slack Reader',
          description: 'Read Slack threads.',
          skill_md: '# Slack Reader',
        },
      ],
      runtime_inputs: [
        {
          key: 'workspace_id',
          label: 'Workspace ID',
          description: 'Slack workspace identifier',
          required: true,
          source: 'architect_requirement',
          value: 'team-123',
        },
      ],
    });

    const snapshot = buildPublishedRuntimeSnapshot(agent);
    const seed = buildInstalledAgentSeed(snapshot, {
      userId: 'user-1',
      orgId: 'org-1',
      fallbackName: 'Fallback Name',
      fallbackDescription: 'Fallback Description',
    });
    const configurePayload = buildConfigurePayloadFromAgent(agent);

    expect(seed).toEqual(expect.objectContaining({
      name: 'Installed Helper',
      description: 'Assists with installs',
      skills: ['Slack Reader'],
      triggerLabel: 'Manual',
      createdBy: 'user-1',
      orgId: 'org-1',
    }));
    expect(seed.skillGraph).toEqual([
      {
        skill_id: 'slack-reader',
        name: 'Slack Reader',
        description: 'Read Slack threads.',
        skill_md: '# Slack Reader',
      },
    ]);

    expect(configurePayload).toEqual({
      system_name: 'Installed Helper',
      soul_content: snapshot.soulContent,
      skills: [
        {
          skill_id: 'slack-reader',
          name: 'Slack Reader',
          description: 'Read Slack threads.',
          skill_md: '# Slack Reader',
        },
      ],
      cron_jobs: [],
      runtime_inputs: [
        {
          key: 'workspace_id',
          label: 'Workspace ID',
          description: 'Slack workspace identifier',
          required: true,
          source: 'architect_requirement',
          value: 'team-123',
        },
      ],
      agent_id: 'agent-99',
    });
  });
});
