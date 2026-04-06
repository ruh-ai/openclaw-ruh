/**
 * Unit tests for src/auth/builderAccess.ts
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockGetOrg = mock(async (_id: string) => null as any);

mock.module('../../../src/orgStore', () => ({
  getOrg: mockGetOrg,
}));

import { requireActiveDeveloperOrg } from '../../../src/auth/builderAccess';

// ─────────────────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-123',
    email: 'dev@example.com',
    role: 'developer' as const,
    orgId: 'org-456',
    ...overrides,
  };
}

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-456',
    name: 'Dev Org',
    slug: 'dev-org',
    kind: 'developer' as const,
    plan: 'pro',
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  mockGetOrg.mockReset();
  mockGetOrg.mockImplementation(async () => null);
});

// ── requireActiveDeveloperOrg ────────────────────────────────────────────────

describe('requireActiveDeveloperOrg', () => {
  test('throws 401 when no user', async () => {
    try {
      await requireActiveDeveloperOrg(undefined);
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.status).toBe(401);
    }
  });

  test('throws 403 for non-developer, non-admin role', async () => {
    try {
      await requireActiveDeveloperOrg(makeUser({ role: 'end_user' }) as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('throws 403 when no orgId', async () => {
    try {
      await requireActiveDeveloperOrg(makeUser({ orgId: null }) as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('throws 403 when org not found', async () => {
    try {
      await requireActiveDeveloperOrg(makeUser() as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('throws 403 when org kind is not developer', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg({ kind: 'customer' }));

    try {
      await requireActiveDeveloperOrg(makeUser() as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });

  test('returns user and organization for developer role', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg());

    const result = await requireActiveDeveloperOrg(makeUser() as any);
    expect(result.user.userId).toBe('user-123');
    expect(result.organization.id).toBe('org-456');
    expect(result.organization.kind).toBe('developer');
  });

  test('returns user and organization for admin role', async () => {
    mockGetOrg.mockImplementation(async () => makeOrg());

    const result = await requireActiveDeveloperOrg(makeUser({ role: 'admin' }) as any);
    expect(result.user.role).toBe('admin');
    expect(result.organization.kind).toBe('developer');
  });
});
