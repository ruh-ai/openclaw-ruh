/**
 * Unit tests for src/agentDiagnostics.ts — pure parsing + report assembly.
 * No docker exec, no fetch. The route handler integration is tested via the
 * existing route test patterns when we wire e2e coverage.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildAgentDiagnosticsReport,
  buildWorkspaceListingCommand,
  parseLsListing,
  parseStuckSessions,
  parseWorkspaceListing,
} from '../../src/agentDiagnostics';

describe('parseStuckSessions', () => {
  test('extracts the diagnostic fields from a real gateway log line', () => {
    const line =
      '2026-05-09T06:27:35.952+00:00 [diagnostic] stuck session: sessionId=copilot ' +
      'sessionKey=agent:copilot:copilot-plan:ffa658af-180e-4cd5-9de8-760d65a1b322 ' +
      'state=processing age=215s queueDepth=1';

    const sessions = parseStuckSessions([line]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      session_id: 'copilot',
      session_key: 'agent:copilot:copilot-plan:ffa658af-180e-4cd5-9de8-760d65a1b322',
      state: 'processing',
      age_seconds: 215,
      queue_depth: 1,
    });
  });

  test('keeps the most recent (highest age) entry per session_key', () => {
    const lines = [
      '...stuck session: sessionId=copilot sessionKey=agent:copilot:abc state=processing age=125s queueDepth=1',
      '...stuck session: sessionId=copilot sessionKey=agent:copilot:abc state=processing age=155s queueDepth=1',
      '...stuck session: sessionId=copilot sessionKey=agent:copilot:abc state=processing age=185s queueDepth=1',
    ].map((l) => `2026-05-09T06:27:35.952+00:00 [diagnostic] ${l.replace('...', '')}`);

    const sessions = parseStuckSessions(lines);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].age_seconds).toBe(185);
  });

  test('sorts multiple stuck sessions by age descending', () => {
    const lines = [
      '...stuck session: sessionId=a sessionKey=key:short state=processing age=60s queueDepth=1',
      '...stuck session: sessionId=b sessionKey=key:long state=processing age=300s queueDepth=2',
    ].map((l) => `2026-05-09T06:27:35.952+00:00 [diagnostic] ${l.replace('...', '')}`);

    const sessions = parseStuckSessions(lines);

    expect(sessions.map((s) => s.session_key)).toEqual(['key:long', 'key:short']);
  });

  test('ignores lines that are not stuck-session diagnostics', () => {
    const lines = [
      '2026-05-09T06:11:02.020+00:00 [ws] webchat connected conn=abc remote=192.168.65.1',
      '2026-05-09T06:24:00.498+00:00 [exec] elevated command python3 -',
    ];

    expect(parseStuckSessions(lines)).toEqual([]);
  });

  test('skips entries without a sessionKey to avoid bogus rows', () => {
    const lines = [
      '2026-05-09T06:27:35.952+00:00 [diagnostic] stuck session: state=processing age=125s queueDepth=1',
    ];

    expect(parseStuckSessions(lines)).toEqual([]);
  });
});

describe('parseLsListing', () => {
  test('returns empty for ENOENT output', () => {
    expect(parseLsListing('ls: cannot access /foo: No such file or directory')).toEqual([]);
  });

  test('strips the `total N` header and dot entries', () => {
    const output = ['total 40', '.', '..', 'PRD.md', 'TRD.md', ''].join('\n');
    expect(parseLsListing(output)).toEqual(['PRD.md', 'TRD.md']);
  });

  test('handles ls -1 plain output', () => {
    expect(parseLsListing('PRD.md\nTRD.md\nresearch-brief.md')).toEqual([
      'PRD.md',
      'TRD.md',
      'research-brief.md',
    ]);
  });

  test('returns empty on empty input', () => {
    expect(parseLsListing('')).toEqual([]);
  });
});

describe('parseWorkspaceListing', () => {
  test('parses the three-section ls output', () => {
    const output = [
      '===root===',
      'workspace-state.json',
      '===discovery===',
      'PRD.md',
      'TRD.md',
      '===plan===',
      'architecture.json',
      'PLAN.md',
    ].join('\n');

    const listing = parseWorkspaceListing(output);

    expect(listing).toEqual({
      root: ['workspace-state.json'],
      discovery: ['PRD.md', 'TRD.md'],
      plan: ['architecture.json', 'PLAN.md'],
    });
  });

  test('treats ENOENT in a single section as an empty section', () => {
    const output = [
      '===root===',
      'workspace-state.json',
      '===discovery===',
      'ls: cannot access /root/.openclaw/workspace-architect/.openclaw/discovery/: No such file or directory',
      '===plan===',
      'ls: cannot access /root/.openclaw/workspace-architect/.openclaw/plan/: No such file or directory',
    ].join('\n');

    const listing = parseWorkspaceListing(output);

    expect(listing).toEqual({
      root: ['workspace-state.json'],
      discovery: [],
      plan: [],
    });
  });

  test('returns null when no section markers exist (workspace dir doesnt exist)', () => {
    expect(parseWorkspaceListing('ls: cannot access /root/.openclaw/workspace-foo: No such file or directory')).toBeNull();
  });
});

describe('buildWorkspaceListingCommand', () => {
  test('produces a shell command that emits three sections separated by markers', () => {
    const cmd = buildWorkspaceListingCommand('workspace-copilot');
    expect(cmd).toContain('===root===');
    expect(cmd).toContain('===discovery===');
    expect(cmd).toContain('===plan===');
    expect(cmd).toContain('/root/.openclaw/workspace-copilot/.openclaw');
    // Each ls falls back to `|| true` so a missing dir doesn't fail the
    // whole composite command (we want partial output, not an empty result).
    expect(cmd).toMatch(/ls -1 .*\|\| true/);
  });
});

describe('buildAgentDiagnosticsReport', () => {
  const baseAgent = {
    id: 'agent-1',
    name: 'Google Ads Manager',
    forge_stage: 'plan',
    forge_sandbox_id: 'sandbox-1',
    status: 'forging',
    created_at: new Date('2026-05-08T11:56:53Z'),
    updated_at: new Date('2026-05-09T06:24:15Z'),
  };

  test('reports a healthy plan stage with all artifacts present', () => {
    const report = buildAgentDiagnosticsReport({
      agent: baseAgent,
      sandbox: {
        sandbox_id: 'sandbox-1',
        gateway_port: 54258,
        standard_url: 'http://localhost:54258',
        approved: false,
        created_at: new Date('2026-05-08T11:59:20Z'),
      },
      containerInspect: { running: true, uptimeSeconds: 67000 },
      workspaceListings: {
        workspace: '===root===\n\n===discovery===\nPRD.md\nTRD.md\n===plan===\narchitecture.json\nPLAN.md',
        workspace_copilot: '===root===\n\n===discovery===\nPRD.md\nTRD.md\n===plan===\narchitecture.json\nPLAN.md',
        workspace_architect: '===root===\nworkspace-state.json\n===discovery===\n===plan===',
      },
      gatewayLogTail: '',
      systemEvents: [],
      errors: [],
    });

    expect(report.agent.forge_stage).toBe('plan');
    expect(report.sandbox?.container_running).toBe(true);
    expect(report.workspace_artifacts.workspace?.plan).toEqual(['architecture.json', 'PLAN.md']);
    expect(report.workspace_artifacts.workspace_copilot?.plan).toEqual(['architecture.json', 'PLAN.md']);
    expect(report.workspace_artifacts.workspace_architect?.root).toEqual(['workspace-state.json']);
    expect(report.workspace_artifacts.workspace_architect?.plan).toEqual([]);
    expect(report.stuck_sessions).toEqual([]);
    expect(report.errors).toEqual([]);
  });

  test('surfaces stuck sessions and gateway log tail when present', () => {
    const stuckLine =
      '2026-05-09T06:27:35.952+00:00 [diagnostic] stuck session: sessionId=copilot ' +
      'sessionKey=agent:copilot:copilot-plan:abc state=processing age=215s queueDepth=1';

    const report = buildAgentDiagnosticsReport({
      agent: baseAgent,
      sandbox: null,
      containerInspect: null,
      workspaceListings: { workspace: null, workspace_copilot: null, workspace_architect: null },
      gatewayLogTail: `prior log line\n${stuckLine}\nlater log line`,
      systemEvents: [],
      errors: [],
    });

    expect(report.stuck_sessions).toHaveLength(1);
    expect(report.stuck_sessions[0].age_seconds).toBe(215);
    expect(report.gateway_log_tail).toHaveLength(3);
    expect(report.sandbox).toBeNull();
  });

  test('preserves errors so partial failures are visible to the caller', () => {
    const report = buildAgentDiagnosticsReport({
      agent: baseAgent,
      sandbox: {
        sandbox_id: 'sandbox-1',
        gateway_port: null,
        standard_url: null,
        approved: false,
        created_at: new Date(),
      },
      containerInspect: { running: false, uptimeSeconds: null },
      workspaceListings: { workspace: null, workspace_copilot: null, workspace_architect: null },
      gatewayLogTail: '',
      systemEvents: [],
      errors: ['container_not_running'],
    });

    expect(report.sandbox?.container_running).toBe(false);
    expect(report.errors).toContain('container_not_running');
  });
});
