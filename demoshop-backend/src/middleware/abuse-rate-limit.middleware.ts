import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import redisClient, { gateRedisReady } from '../redis';
import { config } from '../config/env';
import logger from '../utils/general/logger';
import { BATCH_RATE_LIMIT_LUA } from '../redis/scripts/batch-rate-limit.script';
import { postgresAuthRateLimit } from './auth-rate-limit.middleware';

export type RateLimitDimension = 'ip' | 'account' | 'device' | 'session';

type RateLimitOptions = {
  name: string;
  windowSeconds: number;
  limits: Partial<Record<RateLimitDimension, number>>;
  accountField?: string;
  includeDevice?: boolean;
  includeSession?: boolean;
  failOpen?: boolean;
};

export const BATCH_COUNTER_SCRIPT = BATCH_RATE_LIMIT_LUA;

export const RATE_LIMITED_MESSAGE = 'Too many requests. Please try again later.';
export const RATE_LIMITED_ERROR = 'RATE_LIMITED';

export const normalizeAccountIdentifier = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 320 ? normalized : undefined;
};

const hashIdentifier = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const getRequestIdentifier = (req: Request, dimension: RateLimitDimension, accountField: string): string | undefined => {
  switch (dimension) {
    case 'ip':
      // req.ip is safe only after app.set('trust proxy', configuredTrustedHops).
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

export const rateLimitKey = (name: string, dimension: RateLimitDimension, identifier: string): string =>
  `demoshop:rate-limit:v1:${name}:${dimension}:${hashIdentifier(identifier)}`;

const sendRateLimitResponse = (res: Response, retryAfterSeconds: number): void => {
  res.set('Retry-After', String(retryAfterSeconds));
  res.status(429).json({
    error: RATE_LIMITED_ERROR,
    message: RATE_LIMITED_MESSAGE,
    retryAfter: retryAfterSeconds,
  });
};

export const createAbuseRateLimit = (options: RateLimitOptions) => {
  if (!Number.isInteger(options.windowSeconds) || options.windowSeconds < 1) {
    throw new Error(`Invalid rate-limit window for ${options.name}`);
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // In local development (not test, not production), skip Redis rate-limiting
    // to preserve Upstash command quota during active coding and UI hot reloads.
    if (!config.runtime.isProduction && !config.runtime.isTest) {
      next();
      return;
    }

    const dimensions = (Object.keys(options.limits) as RateLimitDimension[]).filter((dimension) => {
      if (dimension === 'device' && options.includeDevice === false) return false;
      if (dimension === 'session' && options.includeSession === false) return false;
      return true;
    });

    const counters = dimensions
      .map((dimension) => {
        const identifier = getRequestIdentifier(req, dimension, options.accountField || 'email');
        if (!identifier) return undefined;
        const limit = options.limits[dimension];
        if (!limit || limit < 1) return undefined;
        return { dimension, limit, key: rateLimitKey(options.name, dimension, identifier) };
      })
      .filter((counter): counter is { dimension: RateLimitDimension; limit: number; key: string } => Boolean(counter));

    if (counters.length === 0) {
      next();
      return;
    }

    try {
      // Bound Redis cold-start/recovery latency. The route's fail-open policy
      // decides whether to continue or return 503 after this deadline.
      const ready = await gateRedisReady(500);
      if (!ready) throw new Error('Redis was not ready before the rate-limit deadline');

      // Execute all dimension increments in 1 single Redis round-trip command
      const rawResult = await redisClient.eval(BATCH_COUNTER_SCRIPT, {
        keys: counters.map((c) => c.key),
        arguments: [String(options.windowSeconds)],
      });

      const rawCounts: number[] = Array.isArray(rawResult)
        ? (rawResult as number[])
        : [Number(rawResult)];

      const counts = counters.map((counter, idx) => ({
        ...counter,
        count: Number(rawCounts[idx] ?? 0),
      }));

      const exceeded = counts.find((counter) => counter.count > counter.limit);
      if (exceeded) {
        sendRateLimitResponse(res, options.windowSeconds);
        return;
      }

      next();
    } catch (error: any) {
      logger.error(`[RateLimit:${options.name}] Redis enforcement failed: ${error.message}`);
      if (options.failOpen) {
        logger.warn(`[RateLimit:${options.name}] Degrading gracefully (fail-open) due to Redis failure.`);
        next();
        return;
      }
      res.status(503).json({
        error: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Unable to process request right now. Please try again in a few moments.',
      });
    }
  };
};

export const authRateLimit = (name: string, windowSeconds: number, limits: Partial<Record<RateLimitDimension, number>>) =>
  postgresAuthRateLimit(name, windowSeconds, limits);

export default createAbuseRateLimit;
