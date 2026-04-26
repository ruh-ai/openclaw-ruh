import jwt from 'jsonwebtoken';
import { getConfig } from '../config';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: string;
  orgId: string | null;
}

export interface RefreshTokenPayload {
  sessionId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const config = getConfig();
  return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: '7d' });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const config = getConfig();
  return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const config = getConfig();
    return jwt.verify(token, config.jwtAccessSecret) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const config = getConfig();
    return jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenPayload;
  } catch {
    return null;
  }
}
