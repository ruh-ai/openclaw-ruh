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
import {
  deriveSessionAppAccess,
  type ActiveMembershipContext,
} from './auth/appAccess';
import { requireAuth } from './auth/middleware';
import { httpError } from './utils';
import { createLogger, createModuleLogger } from '@ruh/logger';
import type { OrgRecord } from './orgStore';
import type { OrganizationMembershipRecord } from './organizationMembershipStore';
import * as userStore from './userStore';
import * as sessionStore from './sessionStore';
import * as orgStore from './orgStore';
import * as organizationMembershipStore from './organizationMembershipStore';
import * as authIdentityStore from './authIdentityStore';
import * as accountLockoutStore from './accountLockoutStore';

const logger = createModuleLogger(createLogger({ service: 'ruh-backend' }), 'auth');
const AUTH_COOKIE_SECURE = process.env.NODE_ENV === 'production';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const COOKIE_OPTS_ACCESS = {
  httpOnly: true,
  secure: AUTH_COOKIE_SECURE,
  sameSite: 'lax' as const,
  maxAge: 15 * 60 * 1000, // 15 min
  path: '/',
};

const COOKIE_OPTS_REFRESH = {
  httpOnly: true,
  secure: AUTH_COOKIE_SECURE,
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
  skip: () => process.env.NODE_ENV === 'test',
});

const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Too many registration attempts. Please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
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

// ── Account lockout (database-persisted) ────────────────────────────────────

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

async function checkAccountLockout(email: string): Promise<void> {
  const record = await accountLockoutStore.getLockout(email);
  if (record && record.lockedUntil && record.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((record.lockedUntil.getTime() - Date.now()) / 60000);
    throw httpError(429, `Account locked. Try again in ${minutesLeft} minutes.`);
  }
}

async function recordFailedLogin(email: string): Promise<void> {
  const result = await accountLockoutStore.recordFailedAttempt(email, MAX_ATTEMPTS, LOCKOUT_DURATION_MS);
  if (result.locked) {
    logger.warn({ email, attempts: result.attemptCount }, 'Account locked due to failed login attempts');
  }
}

async function clearFailedLogins(email: string): Promise<void> {
  await accountLockoutStore.clearLockout(email);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function trimOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function inferLegacyMembershipRole(user: userStore.UserRecord): OrganizationMembershipRecord['role'] {
  return user.role === 'developer' ? 'developer' : 'employee';
}

function toMembershipResponse(membership: OrganizationMembershipRecord) {
  return {
    id: membership.id,
    organizationId: membership.orgId,
    organizationName: membership.organizationName,
    organizationSlug: membership.organizationSlug,
    organizationKind: membership.organizationKind,
    organizationPlan: membership.organizationPlan,
    organizationStatus: membership.organizationStatus,
    role: membership.role,
    status: membership.status,
  };
}

type MembershipResponse = ReturnType<typeof toMembershipResponse>;

function toActiveOrganization(record: OrgRecord | OrganizationMembershipRecord | null) {
  if (!record) return null;
  if ('organizationName' in record) {
    return {
      id: record.orgId,
      name: record.organizationName,
      slug: record.organizationSlug,
      kind: record.organizationKind,
      plan: record.organizationPlan,
      status: record.organizationStatus,
    };
  }
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    kind: record.kind,
    plan: record.plan,
    status: record.status,
  };
}

async function listEffectiveMemberships(user: userStore.UserRecord): Promise<OrganizationMembershipRecord[]> {
  const memberships = await organizationMembershipStore.listMembershipsForUser(user.id);
  if (memberships.length > 0) {
    return memberships.filter((membership) => membership.status === 'active');
  }
  if (!user.orgId) {
    return [];
  }
  const org = await orgStore.getOrg(user.orgId);
  if (!org) {
    return [];
  }
  return [{
    id: `legacy:${user.id}:${org.id}`,
    orgId: org.id,
    userId: user.id,
    role: inferLegacyMembershipRole(user),
    status: 'active',
    organizationName: org.name,
    organizationSlug: org.slug,
    organizationKind: org.kind,
    organizationPlan: org.plan,
    organizationStatus: org.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }];
}

async function buildAuthContext(
  user: userStore.UserRecord,
  activeOrgIdOverride?: string | null,
): Promise<{
  memberships: OrganizationMembershipRecord[];
  activeOrganization: ReturnType<typeof toActiveOrganization>;
  activeMembership: ActiveMembershipContext | null;
  activeOrgId: string | null;
  platformRole: 'platform_admin' | 'user';
  appAccess: ReturnType<typeof deriveSessionAppAccess>;
}> {
  const memberships = await listEffectiveMemberships(user);
  const activeMembership =
    memberships.find((membership) => membership.orgId === activeOrgIdOverride)
    ?? memberships.find((membership) => membership.orgId === user.orgId)
    ?? memberships[0]
    ?? null;
  const activeOrganization = toActiveOrganization(activeMembership);
  const activeMembershipResponse = activeMembership
    ? toMembershipResponse(activeMembership)
    : null;
  const platformRole = user.role === 'admin' ? 'platform_admin' : 'user';

  return {
    memberships,
    activeOrganization,
    activeMembership: activeMembershipResponse,
    activeOrgId: activeMembership?.orgId ?? null,
    platformRole,
    appAccess: deriveSessionAppAccess({
      platformRole,
      activeMembership: activeMembershipResponse,
    }),
  };
}

function signSessionAccessToken(
  user: userStore.UserRecord,
  activeOrgId: string | null,
): string {
  return signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    orgId: activeOrgId ?? user.orgId,
  });
}

async function buildAuthResponse(
  user: userStore.UserRecord,
  accessToken: string,
  refreshToken: string,
  activeOrgIdOverride?: string | null,
) {
  const context = await buildAuthContext(user, activeOrgIdOverride);
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      orgId: context.activeOrgId ?? user.orgId,
    },
    accessToken,
    refreshToken,
    platformRole: context.platformRole,
    memberships: context.memberships.map(toMembershipResponse),
    activeOrganization: context.activeOrganization,
    activeMembership: context.activeMembership,
    appAccess: context.appAccess,
  };
}

// ── Register ─────────────────────────────────────────────────────────────────

router.post('/register', registerRateLimiter, asyncHandler(async (req, res) => {
  const rawEmail = req.body.email;
  const { password, displayName, role } = req.body;
  const organizationName = trimOptionalString(req.body.organizationName);
  const requestedOrganizationKind = trimOptionalString(req.body.organizationKind);
  const requestedMembershipRole = trimOptionalString(req.body.membershipRole);

  if (!rawEmail || !password) {
    throw httpError(400, 'Email and password are required');
  }
  if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
    throw httpError(400, 'Invalid email format');
  }
  const email = normalizeEmail(rawEmail);
  const passwordError = validatePasswordComplexity(password);
  if (passwordError) {
    throw httpError(400, passwordError);
  }

  const existing = await userStore.getUserByEmail(email);
  if (existing) {
    throw httpError(409, 'Email already registered');
  }

  const organizationKind: OrgRecord['kind'] =
    requestedOrganizationKind === 'developer' ? 'developer' : 'customer';
  const membershipRole: OrganizationMembershipRecord['role'] =
    requestedMembershipRole === 'admin'
      || requestedMembershipRole === 'developer'
      || requestedMembershipRole === 'employee'
      || requestedMembershipRole === 'owner'
      ? requestedMembershipRole
      : 'owner';

  const bootstrapOrg = organizationName
    ? await orgStore.createOrg(
      organizationName,
      trimOptionalString(req.body.organizationSlug) ?? slugify(organizationName),
      organizationKind,
    )
    : null;

  const allowedRoles = ['developer', 'end_user'];
  const inferredUserRole = bootstrapOrg?.kind === 'developer' ? 'developer' : 'end_user';
  const userRole = allowedRoles.includes(role) ? role : inferredUserRole;

  const passwordHash = await hashPassword(password);
  const user = await userStore.createUser(
    email,
    passwordHash,
    displayName || email.split('@')[0],
    userRole,
    bootstrapOrg?.id,
  );

  if (bootstrapOrg) {
    await organizationMembershipStore.createMembership(
      bootstrapOrg.id,
      user.id,
      membershipRole,
    );
  }

  await authIdentityStore.ensureAuthIdentity(user.id, 'local', email);

  const refreshToken = uuidv4();
  const context = await buildAuthContext(user, bootstrapOrg?.id ?? user.orgId);
  await sessionStore.createSession(
    user.id,
    refreshToken,
    req.headers['user-agent'],
    req.ip,
    context.activeOrgId,
  );

  const accessToken = signSessionAccessToken(user, context.activeOrgId);

  res.cookie('accessToken', accessToken, COOKIE_OPTS_ACCESS);
  res.cookie('refreshToken', refreshToken, COOKIE_OPTS_REFRESH);

  logger.info({ userId: user.id, email: user.email, role: user.role }, 'User registered');

  res.status(201).json(await buildAuthResponse(user, accessToken, refreshToken, context.activeOrgId));
}));

// ── Login ────────────────────────────────────────────────────────────────────

router.post('/login', authRateLimiter, asyncHandler(async (req, res) => {
  const rawEmail = req.body.email;
  const { password } = req.body;

  if (!rawEmail || !password) {
    throw httpError(400, 'Email and password are required');
  }
  const email = normalizeEmail(String(rawEmail));

  // Check account lockout before DB lookup
  await checkAccountLockout(email);

  const user = await userStore.getUserByEmail(email);
  if (!user) {
    await recordFailedLogin(email);
    logger.warn({ email }, 'Failed login attempt — user not found');
    throw httpError(401, 'Invalid email or password');
  }

  if (user.status !== 'active') {
    logger.warn({ email, status: user.status }, 'Failed login attempt — account not active');
    throw httpError(403, 'Account is not active');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(email);
    logger.warn({ email }, 'Failed login attempt — wrong password');
    throw httpError(401, 'Invalid email or password');
  }

  // Successful login — clear lockout
  await clearFailedLogins(email);

  await authIdentityStore.ensureAuthIdentity(user.id, 'local', email);

  const refreshToken = uuidv4();
  const context = await buildAuthContext(user);
  await sessionStore.createSession(
    user.id,
    refreshToken,
    req.headers['user-agent'],
    req.ip,
    context.activeOrgId,
  );

  const accessToken = signSessionAccessToken(user, context.activeOrgId);

  res.cookie('accessToken', accessToken, COOKIE_OPTS_ACCESS);
  res.cookie('refreshToken', refreshToken, COOKIE_OPTS_REFRESH);

  logger.info({ userId: user.id, email: user.email }, 'User logged in');

  res.json(await buildAuthResponse(user, accessToken, refreshToken, context.activeOrgId));
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
  await sessionStore.createSession(
    user.id,
    newRefreshToken,
    req.headers['user-agent'],
    req.ip,
    session.activeOrgId,
  );

  const accessToken = signSessionAccessToken(user, session.activeOrgId);

  res.cookie('accessToken', accessToken, COOKIE_OPTS_ACCESS);
  res.cookie('refreshToken', newRefreshToken, COOKIE_OPTS_REFRESH);

  res.json(await buildAuthResponse(user, accessToken, newRefreshToken, session.activeOrgId));
}));

// ── Logout ───────────────────────────────────────────────────────────────────

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await sessionStore.deleteUserSessions(req.user!.userId);

  logger.info({ userId: req.user!.userId }, 'User logged out');

  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });

  res.json({ message: 'Logged out successfully' });
}));

// ── Switch active organization ───────────────────────────────────────────────

router.post('/switch-org', asyncHandler(async (req, res) => {
  const organizationId = trimOptionalString(req.body.organizationId);
  if (!organizationId) {
    throw httpError(400, 'organizationId is required');
  }

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

  const membership = await organizationMembershipStore.getMembershipForUserOrg(user.id, organizationId);
  if (!membership || membership.status !== 'active') {
    throw httpError(403, 'User does not have access to that organization');
  }

  await sessionStore.setActiveOrgId(session.id, organizationId);
  const accessToken = signSessionAccessToken(user, organizationId);
  res.cookie('accessToken', accessToken, COOKIE_OPTS_ACCESS);

  const response = await buildAuthResponse(user, accessToken, rawToken, organizationId);
  res.json(response);
}));

// ── Me ───────────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await userStore.getUserById(req.user!.userId);
  if (!user) {
    throw httpError(404, 'User not found');
  }

  const session = req.cookies?.refreshToken
    ? await sessionStore.getSessionByRefreshToken(req.cookies.refreshToken)
    : null;
  const context = await buildAuthContext(
    user,
    session?.activeOrgId ?? req.user!.orgId ?? null,
  );

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    platformRole: context.platformRole,
    orgId: context.activeOrgId ?? user.orgId,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    memberships: context.memberships.map(toMembershipResponse),
    activeOrganization: context.activeOrganization,
    activeMembership: context.activeMembership,
    appAccess: context.appAccess,
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
    // Account lockout data (keyed by email, no FK)
    await client.query('DELETE FROM account_lockouts WHERE email = $1', [user.email]);
    // Finally delete the user
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  // Clear cookies
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });

  logger.info({ userId }, 'GDPR data deletion completed');
  res.json({ message: 'Account and all associated data have been deleted' });
}));

// ── GitHub OAuth ──────────────────────────────────────────────────────────────

import * as githubConnectionStore from './githubConnectionStore';
import { getConfig } from './config';

router.get('/github/status', requireAuth, asyncHandler(async (req, res) => {
  const conn = await githubConnectionStore.getConnection(req.user!.userId);
  res.json(conn ?? { connected: false, username: null, connectedAt: null });
}));

router.get('/github', requireAuth, asyncHandler(async (req, res) => {
  const config = getConfig();
  if (!config.githubClientId) throw httpError(503, 'GitHub OAuth not configured');
  const redirect = (req.query.redirect as string) ?? '/agents';
  const state = Buffer.from(JSON.stringify({ userId: req.user!.userId, redirect })).toString('base64url');
  const url = `https://github.com/login/oauth/authorize?client_id=${config.githubClientId}&redirect_uri=${encodeURIComponent(config.githubCallbackUrl)}&scope=repo&state=${state}`;
  res.redirect(url);
}));

router.get('/github/callback', asyncHandler(async (req, res) => {
  const config = getConfig();
  if (!config.githubClientId || !config.githubClientSecret) throw httpError(503, 'GitHub OAuth not configured');

  const code = req.query.code as string;
  const stateRaw = req.query.state as string;
  if (!code || !stateRaw) throw httpError(400, 'Missing code or state');

  let state: { userId: string; redirect: string };
  try { state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()); }
  catch { throw httpError(400, 'Invalid state'); }

  // Exchange code for token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: config.githubClientId, client_secret: config.githubClientSecret, code }),
  });
  const tokenData = await tokenRes.json() as { access_token?: string; scope?: string; error?: string };
  if (!tokenData.access_token) throw httpError(400, `GitHub OAuth failed: ${tokenData.error ?? 'no token'}`);

  // Get GitHub user info
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${tokenData.access_token}`, Accept: 'application/json' },
  });
  const ghUser = await userRes.json() as { id?: number; login?: string };
  if (!ghUser.login) throw httpError(400, 'Could not get GitHub user');

  // Store connection
  await githubConnectionStore.upsertConnection({
    userId: state.userId,
    githubUserId: String(ghUser.id),
    githubUsername: ghUser.login,
    accessToken: tokenData.access_token,
    tokenScope: tokenData.scope ?? 'repo',
  });

  // Redirect back to the builder
  const redirectUrl = state.redirect || '/agents';
  res.redirect(`http://localhost:3000${redirectUrl}`);
}));

router.delete('/github', requireAuth, asyncHandler(async (req, res) => {
  await githubConnectionStore.deleteConnection(req.user!.userId);
  res.json({ ok: true });
}));

export { router as authRouter };
