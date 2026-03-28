import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './tokens';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  orgId: string | null;
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Require a valid access token. Rejects with 401 if missing/invalid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired access token' });
    return;
  }

  req.user = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    orgId: payload.orgId,
  };
  next();
}

/**
 * Same as requireAuth but doesn't reject — sets req.user to undefined if no valid token.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    if (payload) {
      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        orgId: payload.orgId,
      };
    }
  }
  next();
}

/**
 * Require a specific role. Must be used AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden', message: `Requires role: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}
