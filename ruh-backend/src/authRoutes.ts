/**
 * Auth routes — register, login, refresh, logout, profile.
 *
 * Refresh tokens are raw UUIDs stored in the session table.
 * Access tokens are short-lived JWTs (15 min).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword, verifyPassword } from './auth/passwords';
import { signAccessToken } from './auth/tokens';
import { requireAuth } from './auth/middleware';
import { httpError } from './utils';
import * as userStore from './userStore';
import * as sessionStore from './sessionStore';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const COOKIE_OPTS_ACCESS = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'lax' as const,
  maxAge: 15 * 60 * 1000, // 15 min
  path: '/',
};

const COOKIE_OPTS_REFRESH = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

const router = Router();

// ── Register ─────────────────────────────────────────────────────────────────

router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, displayName, role } = req.body;

  if (!email || !password) {
    throw httpError(400, 'Email and password are required');
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    throw httpError(400, 'Invalid email format');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw httpError(400, 'Password must be at least 8 characters');
  }

  const existing = await userStore.getUserByEmail(email);
  if (existing) {
    throw httpError(409, 'Email already registered');
  }

  const allowedRoles = ['developer', 'end_user'];
  const userRole = allowedRoles.includes(role) ? role : 'end_user';

  const passwordHash = await hashPassword(password);
  const user = await userStore.createUser(
    email,
    passwordHash,
    displayName || email.split('@')[0],
    userRole,
  );

  const refreshToken = uuidv4();
  await sessionStore.createSession(
    user.id,
    refreshToken,
    req.headers['user-agent'],
    req.ip,
  );

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
  });

  res.cookie('accessToken', accessToken, COOKIE_OPTS_ACCESS);
  res.cookie('refreshToken', refreshToken, COOKIE_OPTS_REFRESH);

  res.status(201).json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    accessToken,
    refreshToken,
  });
}));

// ── Login ────────────────────────────────────────────────────────────────────

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw httpError(400, 'Email and password are required');
  }

  const user = await userStore.getUserByEmail(email);
  if (!user) {
    throw httpError(401, 'Invalid email or password');
  }

  if (user.status !== 'active') {
    throw httpError(403, 'Account is not active');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw httpError(401, 'Invalid email or password');
  }

  const refreshToken = uuidv4();
  await sessionStore.createSession(
    user.id,
    refreshToken,
    req.headers['user-agent'],
    req.ip,
  );

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
  });

  res.cookie('accessToken', accessToken, COOKIE_OPTS_ACCESS);
  res.cookie('refreshToken', refreshToken, COOKIE_OPTS_REFRESH);

  res.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    accessToken,
    refreshToken,
  });
}));

// ── Refresh ──────────────────────────────────────────────────────────────────

router.post('/refresh', asyncHandler(async (req, res) => {
  const rawToken: string | undefined = req.cookies?.refreshToken || req.body.refreshToken;
  if (!rawToken) {
    throw httpError(400, 'Refresh token is required');
  }

  const session = await sessionStore.getSessionByRefreshToken(rawToken);
  if (!session) {
    throw httpError(401, 'Invalid refresh token');
  }

  const user = await userStore.getUserById(session.userId);
  if (!user || user.status !== 'active') {
    throw httpError(401, 'Account not found or inactive');
  }

  // Rotate: delete old session, create new one
  await sessionStore.deleteSession(session.id);
  const newRefreshToken = uuidv4();
  await sessionStore.createSession(user.id, newRefreshToken, req.headers['user-agent'], req.ip);

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
  });

  res.cookie('accessToken', accessToken, COOKIE_OPTS_ACCESS);
  res.cookie('refreshToken', newRefreshToken, COOKIE_OPTS_REFRESH);

  res.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    accessToken,
    refreshToken: newRefreshToken,
  });
}));

// ── Logout ───────────────────────────────────────────────────────────────────

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await sessionStore.deleteUserSessions(req.user!.userId);

  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });

  res.json({ message: 'Logged out successfully' });
}));

// ── Me ───────────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await userStore.getUserById(req.user!.userId);
  if (!user) {
    throw httpError(404, 'User not found');
  }

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    orgId: user.orgId,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  });
}));

// ── Update profile ───────────────────────────────────────────────────────────

router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const { displayName, avatarUrl } = req.body;
  const updated = await userStore.updateUser(req.user!.userId, { displayName, avatarUrl });
  if (!updated) {
    throw httpError(404, 'User not found');
  }

  res.json({
    id: updated.id,
    email: updated.email,
    displayName: updated.displayName,
    avatarUrl: updated.avatarUrl,
    role: updated.role,
  });
}));

export { router as authRouter };
