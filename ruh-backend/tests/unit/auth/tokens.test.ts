import { describe, expect, test, mock } from 'bun:test';

// Mock getConfig so JWT secrets are stable regardless of process.env mutations
// by other test files (e.g. startup.test.ts replaces the process.env object).
mock.module('../../../src/config', () => ({
  getConfig: () => ({
    jwtAccessSecret: 'test-access-secret-32chars-min!!',
    jwtRefreshSecret: 'test-refresh-secret-32chars-min!',
  }),
}));

import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from '../../../src/auth/tokens';

describe('tokens', () => {
  test('signAccessToken returns a JWT string', () => {
    const token = signAccessToken({ userId: 'u1', email: 'a@b.com', role: 'developer', orgId: null });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  test('verifyAccessToken roundtrips', () => {
    const payload = { userId: 'u1', email: 'a@b.com', role: 'admin', orgId: 'org1' };
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe('u1');
    expect(decoded!.email).toBe('a@b.com');
    expect(decoded!.role).toBe('admin');
    expect(decoded!.orgId).toBe('org1');
  });

  test('verifyAccessToken returns null for invalid token', () => {
    expect(verifyAccessToken('invalid.token.here')).toBeNull();
  });

  test('signRefreshToken + verifyRefreshToken roundtrip', () => {
    const token = signRefreshToken({ sessionId: 's1' });
    const decoded = verifyRefreshToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.sessionId).toBe('s1');
  });

  test('verifyRefreshToken returns null for invalid token', () => {
    expect(verifyRefreshToken('garbage')).toBeNull();
  });
});
