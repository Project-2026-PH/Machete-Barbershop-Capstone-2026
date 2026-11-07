import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { userRepository } from '../../repositories/user.repository';
import logger from '../general/logger';
import { User, SessionData, UserRole } from '@demoshop/shared-types';
import { Request } from 'express';
import { AppError } from '../error/AppError';
import { config } from '../../config/env';

export const CUSTOM_SESSION_ISSUER = 'demoshop-api';
export const CUSTOM_SESSION_AUDIENCE = 'demoshop-api';

export const signToken = (userId: string, role: string, sessionId: string, duration: string): string => {
  return jwt.sign({ id: userId, role, sessionId }, config.auth.jwtSecret, {
    algorithm: 'HS256',
    issuer: CUSTOM_SESSION_ISSUER,
    audience: CUSTOM_SESSION_AUDIENCE,
    expiresIn: duration as any,
  });
};

export const hashSessionToken = (token: string): string => {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
};

/**
 * Compares a presented session token with the database hash without exposing
 * the comparison to a timing oracle. Length is checked before timingSafeEqual
 * because Node throws when the buffers have different lengths.
 */
export const matchesSessionToken = (token: string, storedHash: string): boolean => {
  if (typeof storedHash !== 'string') return false;

  const presentedHash = Buffer.from(hashSessionToken(token), 'utf8');
  const persistedHash = Buffer.from(storedHash, 'utf8');

  return presentedHash.length === persistedHash.length && crypto.timingSafeEqual(presentedHash, persistedHash);
};

export const signSupabaseToken = (userId: string, duration: string): string | null => {
  if (!config.auth.supabaseJwtSecret) return null;
  try {
    return jwt.sign({ aud: 'authenticated', sub: String(userId), role: 'authenticated' }, config.auth.supabaseJwtSecret, {
      expiresIn: duration as any,
    });
  } catch (err: unknown) {
    logger.error('[AuthService] Supabase JWT signing failed', { error: err });
    return null;
  }
};

export const createFullSession = async (
  user: Partial<User>,
  rememberMe: boolean,
  req: Request
): Promise<SessionData> => {
  const sessionId = crypto.randomUUID();
  const tokenDuration = rememberMe ? '30d' : '1d';
  const expiresInMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expirationDate = new Date(Date.now() + expiresInMs);

  const userId = String(user.user_id || (user as any).id); // Handle both naming conventions during migration
  if (!userId) throw new AppError("User ID missing during session creation", 500);

  const token = signToken(userId, user.role!, sessionId, tokenDuration);
  const supabaseToken = signSupabaseToken(userId, tokenDuration);
  const tokenHash = hashSessionToken(token);

  await userRepository.createSession({
    sessionId,
    userId,
    tokenHash,
    expirationDate,
    deviceInfo: req.headers['user-agent'] || 'unknown',
    ipAddress: req.ip || 'unknown',
    rememberMe,
  });

  return { token, supabaseToken, maxAge: expiresInMs };
};

export interface TokenMetadata {
  id: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export const decodeTokenMetadata = (token: string): TokenMetadata => {
  if (!token) throw new AppError("No session token provided.", 401);

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ['HS256'],
      issuer: CUSTOM_SESSION_ISSUER,
      audience: CUSTOM_SESSION_AUDIENCE,
    });

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.id !== 'string' ||
      decoded.id.length === 0 ||
      typeof decoded.role !== 'string' ||
      decoded.role.length === 0 ||
      typeof decoded.sessionId !== 'string' ||
      decoded.sessionId.length === 0 ||
      typeof decoded.iat !== 'number' ||
      !Number.isFinite(decoded.iat) ||
      typeof decoded.exp !== 'number' ||
      !Number.isFinite(decoded.exp) ||
      decoded.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new AppError("Invalid session claims.", 401);
    }

    return decoded as TokenMetadata;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid or expired session token.", 401);
  }
};

export const validateSession = async (
  sessionData: {
    session: { is_valid: boolean; expires_at: string; remember_me: boolean; token_hash: string };
    user: Partial<User>;
  } | null,
  _sessionId: string,
  expectedUserId?: string,
): Promise<void> => {
  const session = sessionData?.session;
  const user = sessionData?.user;
  const expiresAt = session ? new Date(session.expires_at) : null;

  if (
    !session ||
    !session.is_valid ||
    !session.token_hash ||
    !user?.user_id ||
    user.deleted_at != null ||
    (expectedUserId !== undefined && String(user.user_id) !== expectedUserId)
  ) {
    throw new AppError("Session invalid or not found.", 401);
  }

  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new AppError("Session expired.", 401);
  }
};

export const refreshUserSession = async (
  oldSessionId: string,
  oldTokenHash: string,
  userId: string,
  role: UserRole,
  rememberMe: boolean,
  req: Request
): Promise<SessionData> => {
  const newSessionId = crypto.randomUUID();
  const expiresInMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expirationDate = new Date(Date.now() + expiresInMs);
  const tokenDuration = rememberMe ? '30d' : '1d';

  const newToken = signToken(userId, role, newSessionId, tokenDuration);
  const supabaseToken = signSupabaseToken(userId, tokenDuration);
  const tokenHash = hashSessionToken(newToken);

  const rotated = await userRepository.rotateSession(oldSessionId, {
    oldTokenHash,
    sessionId: newSessionId,
    userId,
    tokenHash,
    expirationDate,
    deviceInfo: req.headers['user-agent'] || 'unknown',
    ipAddress: req.ip || 'unknown',
    rememberMe: !!rememberMe,
  });

  if (!rotated) {
    throw new AppError("Session invalid or already rotated.", 401);
  }

  return { token: newToken, supabaseToken, maxAge: expiresInMs };
};
