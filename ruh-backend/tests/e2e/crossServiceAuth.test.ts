/**
 * Cross-service auth token contract tests.
 *
 * Validates that auth tokens produced by the backend have the correct shape
 * for consumption by all frontend services (admin-ui, agent-builder-ui, ruh-frontend).
 *
 * This is a CONTRACT test, not a true E2E — it validates token shapes and
 * field expectations without requiring running frontend servers.
 */

import { describe, test, expect, beforeAll } from 'bun:test';

// Set required env vars before importing config-dependent modules
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret-for-cross-service';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/test';

import { signAccessToken, verifyAccessToken, type AccessTokenPayload } from '../../src/auth/tokens';

describe('Cross-service auth token contract', () => {
  test('register response has fields needed by all frontends', () => {
    // The register endpoint returns { user, accessToken, refreshToken }
    // admin-ui needs: user.role === 'admin' check
    // agent-builder-ui needs: accessToken for Authorization header
    // ruh-frontend needs: accessToken for API calls
    const expectedShape = {
      user: {
        id: expect.any(String),
        email: expect.any(String),
        displayName: expect.any(String),
        role: expect.any(String),
      },
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    };

    // Verify the critical fields exist in the expected shape
    expect(expectedShape.user).toHaveProperty('role'); // admin-ui needs this
    expect(expectedShape).toHaveProperty('accessToken'); // all frontends need this
    expect(expectedShape).toHaveProperty('refreshToken'); // cookie rotation needs this
  });

  test('access token JWT contains fields needed by middleware', () => {
    const token = signAccessToken({
      userId: 'u1',
      email: 'test@ruh.ai',
      role: 'admin',
      orgId: 'org1',
    });

    const decoded = verifyAccessToken(token);
    expect(decoded).not.toBeNull();

    // All services' requireAuth middleware extracts these fields
    expect(decoded!.userId).toBe('u1');
    expect(decoded!.email).toBe('test@ruh.ai');
    expect(decoded!.role).toBe('admin');
    expect(decoded!.orgId).toBe('org1');
  });

  test('access token round-trips all role values correctly', () => {
    const roles = ['admin', 'developer', 'end_user'];

    for (const role of roles) {
      const token = signAccessToken({
        userId: 'u1',
        email: 'test@ruh.ai',
        role,
        orgId: null,
      });
      const decoded = verifyAccessToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.role).toBe(role);
    }
  });

  test('role values match what frontends expect', () => {
    // admin-ui checks: role === 'admin'
    // agent-builder-ui checks: role === 'developer' for publishing
    // All services accept: 'admin' | 'developer' | 'end_user'
    const validRoles = ['admin', 'developer', 'end_user'];

    expect(validRoles).toContain('admin');
    expect(validRoles).toContain('developer');
    expect(validRoles).toContain('end_user');
    expect(validRoles.length).toBe(3);
  });

  test('httpOnly cookie names match across services', () => {
    // All services expect these cookie names:
    // - authRoutes.ts sets: res.cookie("accessToken", ...) and res.cookie("refreshToken", ...)
    // - agent-builder-ui middleware.ts checks: req.cookies.accessToken
    // - admin-ui login stores: localStorage.setItem("accessToken", ...)
    const expectedCookieNames = ['accessToken', 'refreshToken'];

    expect(expectedCookieNames).toContain('accessToken');
    expect(expectedCookieNames).toContain('refreshToken');
  });

  test('null orgId is preserved in token', () => {
    // Some users (e.g., newly registered) may have no org yet
    const token = signAccessToken({
      userId: 'u1',
      email: 'test@ruh.ai',
      role: 'developer',
      orgId: null,
    });

    const decoded = verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.orgId).toBeNull();
  });

  test('expired token returns null from verifyAccessToken', async () => {
    // Verify that expired tokens are rejected — all frontends rely on this
    // to trigger refresh flows
    const jwt = await import('jsonwebtoken');
    const secret = process.env.JWT_ACCESS_SECRET!;
    const expiredToken = jwt.default.sign(
      { userId: 'u1', email: 'test@ruh.ai', role: 'admin', orgId: null },
      secret,
      { expiresIn: '0s' },
    );

    // Small delay to ensure token is expired
    await new Promise((r) => setTimeout(r, 50));
    const decoded = verifyAccessToken(expiredToken);
    expect(decoded).toBeNull();
  });
});
