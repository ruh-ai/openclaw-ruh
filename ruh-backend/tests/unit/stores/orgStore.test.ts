/**
 * Unit tests for src/orgStore.ts — mocks withConn so no real DB is needed.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock withConn ─────────────────────────────────────────────────────────────

const mockQuery = mock(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockClient = { query: mockQuery };

mock.module('../../../src/db', () => ({
  withConn: async (fn: (c: typeof mockClient) => Promise<unknown>) => fn(mockClient),
}));

import * as orgStore from '../../../src/orgStore';

// ─────────────────────────────────────────────────────────────────────────────

function makeOrgRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-test-uuid',
    name: 'Test Org',
    slug: 'test-org',
    kind: 'customer',
    plan: 'free',
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

// ── createOrg ────────────────────────────────────────────────────────────────

describe('orgStore.createOrg', () => {
  test('inserts org and returns serialized OrgRecord', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeOrgRow()],
      rowCount: 1,
    }));

    const org = await orgStore.createOrg('Test Org', 'test-org');
    expect(org.name).toBe('Test Org');
    expect(org.slug).toBe('test-org');
    expect(org.kind).toBe('customer');
    expect(org.plan).toBe('free');
  });

  test('defaults kind to customer', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeOrgRow()],
      rowCount: 1,
    }));

    await orgStore.createOrg('Org', 'org');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('customer');
  });

  test('passes developer kind when specified', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeOrgRow({ kind: 'developer' })],
      rowCount: 1,
    }));

    const org = await orgStore.createOrg('Dev Org', 'dev-org', 'developer');
    expect(org.kind).toBe('developer');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('developer');
  });

  test('INSERT SQL includes RETURNING *', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeOrgRow()],
      rowCount: 1,
    }));

    await orgStore.createOrg('Org', 'org');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO organizations');
    expect(sql).toContain('RETURNING *');
  });
});

// ── getOrg ───────────────────────────────────────────────────────────────────

describe('orgStore.getOrg', () => {
  test('returns org when found', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeOrgRow({ id: 'org-abc' })],
      rowCount: 1,
    }));

    const org = await orgStore.getOrg('org-abc');
    expect(org).not.toBeNull();
    expect(org!.id).toBe('org-abc');
  });

  test('returns null when not found', async () => {
    const org = await orgStore.getOrg('nonexistent');
    expect(org).toBeNull();
  });
});

// ── listOrgs ─────────────────────────────────────────────────────────────────

describe('orgStore.listOrgs', () => {
  test('returns array of serialized OrgRecords', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [makeOrgRow(), makeOrgRow({ id: 'org-2', name: 'Org Two' })],
      rowCount: 2,
    }));

    const orgs = await orgStore.listOrgs();
    expect(orgs).toHaveLength(2);
    expect(orgs[0].name).toBe('Test Org');
    expect(orgs[1].name).toBe('Org Two');
  });

  test('returns empty array when no orgs', async () => {
    const orgs = await orgStore.listOrgs();
    expect(orgs).toHaveLength(0);
  });
});
