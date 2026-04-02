import { describe, expect, test, mock, beforeEach } from 'bun:test';

// Mock getConfig so JWT secrets are stable regardless of process.env mutations
// by other test files (e.g. startup.test.ts replaces the process.env object).
mock.module('../../../src/config', () => ({
  getConfig: () => ({
    jwtAccessSecret: 'test-access-secret-32chars-min!!',
    jwtRefreshSecret: 'test-refresh-secret-32chars-min!',
  }),
}));

import { signAccessToken } from '../../../src/auth/tokens';
import { requireAuth, optionalAuth, requireRole } from '../../../src/auth/middleware';

function mockReq(headers: Record<string, string> = {}): any {
  return { headers, user: undefined };
}

function mockRes(): any {
  const res: any = {};
  res.status = mock((code: number) => res);
  res.json = mock((body: any) => res);
  return res;
}

const mockNext = mock(() => {});

beforeEach(() => {
  mockNext.mockClear();
});

describe('requireAuth', () => {
  test('rejects missing authorization header', () => {
    const req = mockReq();
    const res = mockRes();
    requireAuth(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('rejects non-Bearer scheme', () => {
    const req = mockReq({ authorization: 'Basic abc123' });
    const res = mockRes();
    requireAuth(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('rejects invalid token', () => {
    const req = mockReq({ authorization: 'Bearer invalid.token.here' });
    const res = mockRes();
    requireAuth(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('passes with valid token and sets req.user', () => {
    const token = signAccessToken({ userId: 'u1', email: 'a@b.com', role: 'developer', orgId: null });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    requireAuth(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('u1');
    expect(req.user.email).toBe('a@b.com');
    expect(req.user.role).toBe('developer');
    expect(req.user.orgId).toBeNull();
  });

  test('passes with valid token that has orgId', () => {
    const token = signAccessToken({ userId: 'u2', email: 'b@c.com', role: 'admin', orgId: 'org-123' });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    requireAuth(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user.orgId).toBe('org-123');
  });
});

describe('optionalAuth', () => {
  test('passes without token, user remains undefined', () => {
    const req = mockReq();
    const res = mockRes();
    optionalAuth(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  test('passes with invalid token, user remains undefined', () => {
    const req = mockReq({ authorization: 'Bearer garbage' });
    const res = mockRes();
    optionalAuth(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  test('sets user with valid token', () => {
    const token = signAccessToken({ userId: 'u2', email: 'b@c.com', role: 'admin', orgId: 'org1' });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    optionalAuth(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('u2');
    expect(req.user.orgId).toBe('org1');
  });

  test('ignores non-Bearer authorization header', () => {
    const req = mockReq({ authorization: 'Basic xyz' });
    const res = mockRes();
    optionalAuth(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});

describe('requireRole', () => {
  test('rejects when no user is set (401)', () => {
    const req = mockReq();
    const res = mockRes();
    const middleware = requireRole('admin');
    middleware(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('rejects when user has wrong role (403)', () => {
    const req = mockReq();
    req.user = { userId: 'u1', email: 'a@b.com', role: 'end_user', orgId: null };
    const res = mockRes();
    const middleware = requireRole('admin');
    middleware(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('passes when user has one of the allowed roles', () => {
    const req = mockReq();
    req.user = { userId: 'u1', email: 'a@b.com', role: 'admin', orgId: null };
    const res = mockRes();
    const middleware = requireRole('admin', 'developer');
    middleware(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('passes when user has exact matching role', () => {
    const req = mockReq();
    req.user = { userId: 'u1', email: 'a@b.com', role: 'developer', orgId: null };
    const res = mockRes();
    const middleware = requireRole('developer');
    middleware(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
