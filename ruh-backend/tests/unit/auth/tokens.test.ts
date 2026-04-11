import { describe, expect, test } from 'bun:test';
// JWT secrets are set by tests/helpers/env.ts preload — no config mock needed.
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

  test('verifyAccessToken returns null for token signed with wrong secret', () => {
    // Sign with a different secret by temporarily changing the env
    const saved = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = 'wrong-secret-for-this-test';
    const wrongToken = signAccessToken({ userId: 'u2', email: 'b@c.com', role: 'developer', orgId: null });
    process.env.JWT_ACCESS_SECRET = saved;
    // Now verify with the original secret — should reject
    expect(verifyAccessToken(wrongToken)).toBeNull();
  });

  test('verifyRefreshToken returns null for token signed with wrong secret', () => {
    const saved = process.env.JWT_REFRESH_SECRET;
    process.env.JWT_REFRESH_SECRET = 'wrong-refresh-secret';
    const wrongToken = signRefreshToken({ sessionId: 's-bad' });
    process.env.JWT_REFRESH_SECRET = saved;
    expect(verifyRefreshToken(wrongToken)).toBeNull();
  });

  test('verifyAccessToken returns null for a malformed JWT structure', () => {
    expect(verifyAccessToken('not.a.validjwt')).toBeNull();
    expect(verifyAccessToken('')).toBeNull();
    expect(verifyAccessToken('onlyone')).toBeNull();
  });

  test('verifyRefreshToken returns null for completely malformed input', () => {
    expect(verifyRefreshToken('x.y')).toBeNull();
    expect(verifyRefreshToken('')).toBeNull();
  });

  test('verifyAccessToken payload preserves null orgId', () => {
    const token = signAccessToken({ userId: 'u3', email: 'c@d.com', role: 'end_user', orgId: null });
    const decoded = verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.orgId).toBeNull();
  });
});
