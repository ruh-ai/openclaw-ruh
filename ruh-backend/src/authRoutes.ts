/**
 * Auth routes — register, login, refresh, logout, profile.
 *
 * Refresh tokens are raw UUIDs stored in the session table.
 * Access tokens are short-lived JWTs (15 min).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { hashPassword, verifyPassword } from './auth/passwords';
import { signAccessToken } from './auth/tokens';
import { requireAuth } from './auth/middleware';
import { httpError } from './utils';
import { createLogger, createModuleLogger } from '@ruh/logger';
import * as userStore from './userStore';
import * as sessionStore from './sessionStore';

const logger = createModuleLogger(createLogger({ service: 'ruh-backend' }), 'auth');

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

// ── Rate limiting ────────────────────────────────────────────────────────────

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Too many requests. Please try again later.' },
});

const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Too many registration attempts. Please try again later.' },
});

// Rate limiting applied per-route below (register gets stricter limits)

// ── Password complexity ──────────────────────────────────────────────────────

function validatePasswordComplexity(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < 12) return 'Password must be at least 12 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character';
  return null;
}

// ── Account lockout (in-memory, resets on restart — production should use DB) ─

const LOGIN_ATTEMPTS = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function checkAccountLockout(email: string): void {
  const record = LOGIN_ATTEMPTS.get(email);
  if (record && record.lockedUntil > Date.now()) {
    const minutesLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    throw httpError(429, `Account locked. Try again in ${minutesLeft} minutes.`);
  }
}

function recordFailedLogin(email: string): void {
  const record = LOGIN_ATTEMPTS.get(email) ?? { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn({ email, attempts: record.count }, 'Account locked due to failed login attempts');
  }
  LOGIN_ATTEMPTS.set(email, record);
}

function clearFailedLogins(email: string): void {
  LOGIN_ATTEMPTS.delete(email);
}

// ── Register ─────────────────────────────────────────────────────────────────

router.post('/register', registerRateLimiter, asyncHandler(async (req, res) => {
  const { email, password, displayName, role } = req.body;

  if (!email || !password) {
    throw httpError(400, 'Email and password are required');
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    throw httpError(400, 'Invalid email format');
  }
  const passwordError = validatePasswordComplexity(password);
  if (passwordError) {
    throw httpError(400, passwordError);
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

  logger.info({ userId: user.id, email: user.email, role: user.role }, 'User registered');

  res.status(201).json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    accessToken,
    refreshToken,
  });
}));

// ── Login ────────────────────────────────────────────────────────────────────

router.post('/login', authRateLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw httpError(400, 'Email and password are required');
  }

  // Check account lockout before DB lookup
  checkAccountLockout(email);

  const user = await userStore.getUserByEmail(email);
  if (!user) {
    recordFailedLogin(email);
    logger.warn({ email }, 'Failed login attempt — user not found');
    throw httpError(401, 'Invalid email or password');
  }

  if (user.status !== 'active') {
    logger.warn({ email, status: user.status }, 'Failed login attempt — account not active');
    throw httpError(403, 'Account is not active');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    recordFailedLogin(email);
    logger.warn({ email }, 'Failed login attempt — wrong password');
    throw httpError(401, 'Invalid email or password');
  }

  // Successful login — clear lockout
  clearFailedLogins(email);

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

  logger.info({ userId: user.id, email: user.email }, 'User logged in');

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

  logger.info({ userId: req.user!.userId }, 'User logged out');

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

// ── GDPR: Data export (right to data portability, GDPR Art. 20) ──────────────

router.get('/me/export', requireAuth, asyncHandler(async (req, res) => {
  const user = await userStore.getUserById(req.user!.userId);
  if (!user) throw httpError(404, 'User not found');

  // Collect all user data across the platform
  const { withConn } = await import('./db');
  const userData = await withConn(async (client) => {
    const agents = await client.query(
      'SELECT id, name, description, status, created_at FROM agents WHERE created_by = $1',
      [user.id],
    );
    const sessions = await client.query(
      'SELECT id, user_agent, ip_address, created_at, expires_at FROM sessions WHERE user_id = $1',
      [user.id],
    );
    const installs = await client.query(
      'SELECT listing_id, version, installed_at FROM marketplace_installs WHERE user_id = $1',
      [user.id],
    );
    const reviews = await client.query(
      'SELECT listing_id, rating, title, body, created_at FROM marketplace_reviews WHERE user_id = $1',
      [user.id],
    );

    return {
      profile: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        orgId: user.orgId,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      agents: agents.rows,
      sessions: sessions.rows.map(s => ({ ...s, ip_address: s.ip_address ? '***' : null })),
      marketplaceInstalls: installs.rows,
      marketplaceReviews: reviews.rows,
    };
  });

  logger.info({ userId: user.id }, 'GDPR data export requested');

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="ruh-data-export-${user.id}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    platform: 'Ruh.ai',
    ...userData,
  });
}));

// ── GDPR: Data deletion (right to be forgotten, GDPR Art. 17) ───────────────

router.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const user = await userStore.getUserById(userId);
  if (!user) throw httpError(404, 'User not found');

  logger.info({ userId, email: user.email }, 'GDPR data deletion requested');

  // Delete all user data in correct order (respecting FK constraints)
  const { withConn } = await import('./db');
  await withConn(async (client) => {
    // Marketplace data
    await client.query('DELETE FROM marketplace_reviews WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM marketplace_installs WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM marketplace_listings WHERE publisher_id = $1', [userId]);
    // Sessions (cascade from users FK, but explicit for clarity)
    await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    // API keys
    await client.query('DELETE FROM api_keys WHERE user_id = $1', [userId]);
    // Agents created by user (set to NULL, don't delete — agents may be in use)
    await client.query('UPDATE agents SET created_by = NULL WHERE created_by = $1', [userId]);
    // Finally delete the user
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  // Clear cookies
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });

  logger.info({ userId }, 'GDPR data deletion completed');
  res.json({ message: 'Account and all associated data have been deleted' });
}));

export { router as authRouter };
