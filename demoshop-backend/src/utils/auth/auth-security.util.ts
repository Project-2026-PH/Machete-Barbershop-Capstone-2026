import bcrypt from 'bcryptjs';
import { auditService } from '../../services/audit.service';
import { validatePassword } from './password.util';
import logger from '../general/logger';
import { AppError } from '../error/AppError';
import { User, RegistrationData } from '@demoshop/shared-types';
import { Request } from 'express';
import { authThrottleRepository } from '../../repositories/auth-throttle.repository';

const LOCK_THRESHOLDS = [
  { attempts: 15, duration: 86400 }, // 24 hours
  { attempts: 10, duration: 1800 }, // 30 mins
  { attempts: 7, duration: 300 }, // 5 mins
  { attempts: 5, duration: 60 }, // 1 min
];

/**
 * Handles security event logging and PostgreSQL-based rate limiting for invalid login attempts.
 * Account lock durations scale progressively based on the number of attempts.
 */
export const handleFailedLoginAttempt = async (
  userId: string | null,
  email: string,
  reason: string,
  req: Request
): Promise<never> => {
  auditService.logSecurityEvent({ userId, action: 'LOGIN_FAILED', resource: 'auth', details: { reason, target_email: email ? email.trim().toLowerCase() : null }, req });

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await authThrottleRepository.hitFixedWindow({
      scope: 'login_fail',
      key: normalizedEmail,
      windowSeconds: 86400,
    });

    // Find the first threshold that matches the current attempt count.
    const threshold = LOCK_THRESHOLDS.find((t) => result.count >= t.attempts);
    if (threshold) {
      await authThrottleRepository.lockFor('login_lock', normalizedEmail, threshold.duration);
      logger.warn('[AuthService] Account locked', { lockTtl: threshold.duration, attemptCount: result.count });
    }
  } catch (err: unknown) {
    logger.error('[AuthService] PostgreSQL tracking error', { error: err });
    throw new AppError('Authentication is temporarily unavailable. Please try again shortly.', 503);
  }

  throw new AppError("Invalid email or password.", 401);
};

export const ensurePasswordCompliance = async (password: string, userData: RegistrationData): Promise<void> => {
  const { firstName, lastName, email } = userData;
  const { isValid, error: passwordError } = await validatePassword(password, { firstName, lastName, email });
  if (!isValid) {
    throw new AppError(passwordError || "Password does not meet requirements.", 400);
  }
};

export const ensureAccountUnlocked = async (email: string, req: Request): Promise<void> => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const lock = await authThrottleRepository.isLocked('login_lock', normalizedEmail);
    if (lock) {
      auditService.logSecurityEvent({
        userId: null,
        action: 'LOGIN_LOCKED',
        resource: 'auth',
        details: { reason: 'Account temporarily locked', target_email: normalizedEmail },
        req,
      });
      throw new AppError("Invalid email or password.", 401);
    }
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    logger.error('[AuthService] PostgreSQL lock check error', { error: err });
    throw new AppError('Authentication is temporarily unavailable. Please try again shortly.', 503);
  }
};

export const verifyCredentials = async (
  password: string,
  user: Partial<User> | null,
  email: string,
  req: Request
): Promise<void> => {
  if (!user || user.password_hash === undefined || user.password_hash === null) {
    return await handleFailedLoginAttempt(null, email, user ? 'No password set' : 'User not found', req);
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return await handleFailedLoginAttempt(user.user_id || null, email, 'Invalid credentials', req);
  }
};

export const validateUserVerificationState = (user: Partial<User>, req: Request): void => {
  if (!user.is_verified) {
    auditService.logSecurityEvent({
      userId: user.user_id || null,
      action: 'LOGIN_FAILED',
      resource: 'auth',
      details: { reason: 'User not verified', target_email: user.email || null },
      req,
    });
    throw new AppError("Please verify your email before logging in.", 403);
  }
};

export const clearFailedAttempts = async (email: string): Promise<void> => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    await Promise.all([
      authThrottleRepository.clear('login_fail', normalizedEmail),
      authThrottleRepository.clear('login_lock', normalizedEmail),
    ]);
  } catch (err: unknown) {
    logger.error('[AuthService] PostgreSQL clearing error', { error: err });
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10');
  const salt = await bcrypt.genSalt(rounds);
  return await bcrypt.hash(password, salt);
};
