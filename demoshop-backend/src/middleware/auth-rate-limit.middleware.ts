import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';
import { authThrottleRepository } from '../repositories/auth-throttle.repository';
import logger from '../utils/general/logger';

export type AuthRateLimitDimension = 'ip' | 'account' | 'device' | 'session';

export type AuthRateLimitOptions = {
  name: string;
  windowSeconds: number;
  limits: Partial<Record<AuthRateLimitDimension, number>>;
  accountField?: string;
  includeDevice?: boolean;
  includeSession?: boolean;
};

const normalizeAccountIdentifier = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 320 ? normalized : undefined;
};

const getRequestIdentifier = (
  req: Request,
  dimension: AuthRateLimitDimension,
  accountField: string,
): string | undefined => {
  switch (dimension) {
    case 'ip':
      return req.ip || req.socket.remoteAddress || 'unknown';
    case 'account':
      return normalizeAccountIdentifier(req.body?.[accountField] ?? req.query?.[accountField]);
    case 'device': {
      const fingerprint = req.get('x-device-fingerprint')?.trim();
      return fingerprint && fingerprint.length <= 256 ? fingerprint : undefined;
    }
    case 'session': {
      const token = req.cookies?.token || req.get('authorization');
      return typeof token === 'string' && token.length > 0 ? token : undefined;
    }
  }
};

const hashIdentifier = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const throttleKey = (name: string, dimension: AuthRateLimitDimension, identifier: string): string =>
  `demoshop:rate-limit:v1:${name}:${dimension}:${hashIdentifier(identifier)}`;

const sendRateLimitResponse = (res: Response, retryAfterSeconds: number): void => {
  res.set('Retry-After', String(retryAfterSeconds));
  res.status(429).json({
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
    retryAfter: retryAfterSeconds,
  });
};

/** PostgreSQL fixed-window limiter reserved for authentication routes. */
export const createPostgresAuthRateLimit = (options: AuthRateLimitOptions) => {
  if (!Number.isInteger(options.windowSeconds) || options.windowSeconds < 1) {
    throw new Error(`Invalid rate-limit window for ${options.name}`);
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Preserve the existing local-development behavior: route behavior can be
    // exercised without requiring a configured shared throttle service.
    if (!config.runtime.isProduction && !config.runtime.isTest) {
      next();
      return;
    }

    const dimensions = (Object.keys(options.limits) as AuthRateLimitDimension[]).filter((dimension) => {
      if (dimension === 'device' && options.includeDevice === false) return false;
      if (dimension === 'session' && options.includeSession === false) return false;
      return true;
    });

    const counters = dimensions
      .map((dimension) => {
        const identifier = getRequestIdentifier(req, dimension, options.accountField || 'email');
        const limit = options.limits[dimension];
        if (!identifier || !limit || limit < 1) return undefined;
        return {
          dimension,
          limit,
          key: throttleKey(options.name, dimension, identifier),
        };
      })
      .filter((counter): counter is { dimension: AuthRateLimitDimension; limit: number; key: string } => Boolean(counter));

    if (counters.length === 0) {
      next();
      return;
    }

    try {
      const counts = await Promise.all(counters.map(async (counter) => ({
        ...counter,
        count: (await authThrottleRepository.hitFixedWindow({
          scope: `auth_rl:${options.name}:${counter.dimension}`,
          key: counter.key,
          windowSeconds: options.windowSeconds,
        })).count,
      })));
      const exceeded = counts.find((counter) => counter.count > counter.limit);
      if (exceeded) {
        sendRateLimitResponse(res, options.windowSeconds);
        return;
      }
      next();
    } catch (error: unknown) {
      logger.error(`[AuthRateLimit:${options.name}] PostgreSQL enforcement failed`, { error });
      res.status(503).json({
        error: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Unable to process request right now. Please try again in a few moments.',
      });
    }
  };
};

export const postgresAuthRateLimit = (
  name: string,
  windowSeconds: number,
  limits: Partial<Record<AuthRateLimitDimension, number>>,
) => createPostgresAuthRateLimit({ name, windowSeconds, limits, includeDevice: true });
