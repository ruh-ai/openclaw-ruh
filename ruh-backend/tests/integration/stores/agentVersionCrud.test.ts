/**
 * Integration tests for agent version CRUD — requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as agentVersionStore from '../../../src/agentVersionStore';
import * as agentStore from '../../../src/agentStore';
import * as userStore from '../../../src/userStore';
import { hashPassword } from '../../../src/auth/passwords';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

async function createTestUser() {
  const hash = await hashPassword('TestPass1!');
  return userStore.createUser('test@example.com', hash, 'Test User', 'developer');
}

async function createTestAgent() {
  return agentStore.saveAgent({ name: 'Versioned Agent', avatar: '📦' });
}

describe('Agent Version CRUD (integration)', () => {
  test('create and retrieve agent version', async () => {
    const user = await createTestUser();
    const agent = await createTestAgent();
    const snapshot = { systemName: 'Versioned Agent', skills: ['exec'], config: { model: 'gpt-4' } };

    const version = await agentVersionStore.createAgentVersion({
      agentId: agent.id,
      version: '1.0.0',
      changelog: 'Initial release',
      snapshot,
      createdBy: user.id,
    });

    expect(version.id).toBeTruthy();
    expect(version.agentId).toBe(agent.id);
    expect(version.version).toBe('1.0.0');

    const fetched = await agentVersionStore.getAgentVersionByVersion(agent.id, '1.0.0');
    expect(fetched).not.toBeNull();
    expect(fetched!.changelog).toBe('Initial release');
    expect(fetched!.createdBy).toBe(user.id);
  });

  test('returns null for nonexistent version', async () => {
    const agent = await createTestAgent();
    const fetched = await agentVersionStore.getAgentVersionByVersion(agent.id, '99.0.0');
    expect(fetched).toBeNull();
  });

  test('multiple versions per agent', async () => {
    const user = await createTestUser();
    const agent = await createTestAgent();

    await agentVersionStore.createAgentVersion({
      agentId: agent.id,
      version: '1.0.0',
      snapshot: { v: 1 },
      createdBy: user.id,
    });
    await agentVersionStore.createAgentVersion({
      agentId: agent.id,
      version: '1.1.0',
      changelog: 'Bug fixes',
      snapshot: { v: 2 },
      createdBy: user.id,
    });

    const v1 = await agentVersionStore.getAgentVersionByVersion(agent.id, '1.0.0');
    const v2 = await agentVersionStore.getAgentVersionByVersion(agent.id, '1.1.0');

    expect(v1!.snapshot).toEqual({ v: 1 });
    expect(v2!.snapshot).toEqual({ v: 2 });
    expect(v2!.changelog).toBe('Bug fixes');
  });

  test('complex nested snapshot JSON fidelity', async () => {
    const user = await createTestUser();
    const agent = await createTestAgent();
    const complexSnapshot = {
      systemName: 'Complex',
      skills: [
        { skillId: 'analyze', name: 'Analyze', description: 'Analyze data', skillMd: '# Analyze' },
      ],
      toolConnections: [
        { toolId: 'google-ads', name: 'Google Ads', status: 'configured' },
      ],
      triggers: [
        { id: 'daily', kind: 'schedule', schedule: '0 9 * * *' },
      ],
      nested: { deep: { value: [1, 2, 3], flag: true, nullable: null } },
    };

    await agentVersionStore.createAgentVersion({
      agentId: agent.id,
      version: '2.0.0',
      snapshot: complexSnapshot,
      createdBy: user.id,
    });

    const fetched = await agentVersionStore.getAgentVersionByVersion(agent.id, '2.0.0');
    expect(fetched!.snapshot).toEqual(complexSnapshot);
  });
});
