import crypto from 'node:crypto';
import db from '../db';
import {
  DatabaseGateway,
  requireNonEmpty,
  requirePositiveSeconds,
} from './auth-repository.types';
import logger from '../utils/general/logger';

export interface FixedWindowHitInput {
  scope: string;
  key: string;
  windowSeconds: number;
}

export interface FixedWindowHit {
  count: number;
  windowStart: Date;
}

export interface CooldownInput {
  scope: string;
  key: string;
  durationSeconds: number;
}

export interface AuthThrottleRepositoryPort {
  hitFixedWindow(input: FixedWindowHitInput): Promise<FixedWindowHit>;
  acquireCooldown(input: CooldownInput): Promise<Date | null>;
  isLocked(scope: string, key: string): Promise<Date | null>;
  lockFor(scope: string, key: string, durationSeconds: number): Promise<Date>;
  setLock(scope: string, key: string, lockedUntil: Date): Promise<void>;
  clear(scope: string, key: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

type ThrottleRow = {
  count: number | string;
  window_start: Date;
  locked_until: Date | null;
};

const normalizeScopeAndKey = (scope: string, key: string): [string, string] => [
  requireNonEmpty(scope, 'scope'),
  requireNonEmpty(key, 'key'),
];

const toInteger = (value: number | string): number => Number(value);

// Logs need a stable correlation bucket without exposing email addresses,
// IPs, session tokens, or other throttle identifiers.
const throttleBucket = (scope: string, key: string): string =>
  crypto.createHash('sha256').update(`${scope}\u0000${key}`).digest('hex').slice(0, 16);

/** PostgreSQL implementation of all fixed-window auth throttling state. */
export class AuthThrottleRepository implements AuthThrottleRepositoryPort {
  constructor(private readonly database: DatabaseGateway = db) {}

  async hitFixedWindow(input: FixedWindowHitInput): Promise<FixedWindowHit> {
    const [scope, key] = normalizeScopeAndKey(input.scope, input.key);
    const windowSeconds = requirePositiveSeconds(input.windowSeconds, 'windowSeconds');
    const result = await this.database.query<ThrottleRow>(
      `INSERT INTO public.auth_throttle (scope, key, count, window_start)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (scope, key) DO UPDATE SET
         count = CASE
           WHEN auth_throttle.window_start < NOW() - ($3::BIGINT * INTERVAL '1 second') THEN 1
           ELSE auth_throttle.count + 1
         END,
         window_start = CASE
           WHEN auth_throttle.window_start < NOW() - ($3::BIGINT * INTERVAL '1 second') THEN NOW()
           ELSE auth_throttle.window_start
         END,
         updated_at = NOW()
       RETURNING count, window_start, locked_until`,
      [scope, key, windowSeconds],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Auth throttle increment returned no row.');
    const count = toInteger(row.count);
    logger.info('[AuthThrottle] fixed-window hit', {
      event: 'auth_throttle_hit',
      scope,
      bucket: throttleBucket(scope, key),
      count,
      windowSeconds,
    });
    return { count, windowStart: row.window_start };
  }

  async acquireCooldown(input: CooldownInput): Promise<Date | null> {
    const [scope, key] = normalizeScopeAndKey(input.scope, input.key);
    const durationSeconds = requirePositiveSeconds(input.durationSeconds, 'durationSeconds');
    const result = await this.database.query<{ locked_until: Date }>(
      `INSERT INTO public.auth_throttle (scope, key, locked_until)
       VALUES ($1, $2, NOW() + ($3::BIGINT * INTERVAL '1 second'))
       ON CONFLICT (scope, key) DO UPDATE SET
         locked_until = EXCLUDED.locked_until,
         updated_at = NOW()
       WHERE auth_throttle.locked_until IS NULL
          OR auth_throttle.locked_until <= NOW()
       RETURNING locked_until`,
      [scope, key, durationSeconds],
    );

    return result.rows[0]?.locked_until ?? null;
  }

  async isLocked(scopeInput: string, keyInput: string): Promise<Date | null> {
    const [scope, key] = normalizeScopeAndKey(scopeInput, keyInput);
    const result = await this.database.query<{ locked_until: Date }>(
      `SELECT locked_until
       FROM public.auth_throttle
       WHERE scope = $1
         AND key = $2
         AND locked_until > NOW()`,
      [scope, key],
    );
    return result.rows[0]?.locked_until ?? null;
  }

  async lockFor(scopeInput: string, keyInput: string, durationSecondsInput: number): Promise<Date> {
    const [scope, key] = normalizeScopeAndKey(scopeInput, keyInput);
    const durationSeconds = requirePositiveSeconds(durationSecondsInput, 'durationSeconds');
    const result = await this.database.query<{ locked_until: Date }>(
      `INSERT INTO public.auth_throttle (scope, key, locked_until)
       VALUES ($1, $2, NOW() + ($3::BIGINT * INTERVAL '1 second'))
       ON CONFLICT (scope, key) DO UPDATE SET
         locked_until = EXCLUDED.locked_until,
         updated_at = NOW()
       RETURNING locked_until`,
      [scope, key, durationSeconds],
    );
    const lockedUntil = result.rows[0]?.locked_until;
    if (!lockedUntil) throw new Error('Auth throttle lock creation returned no row.');
    return lockedUntil;
  }

  async setLock(scopeInput: string, keyInput: string, lockedUntil: Date): Promise<void> {
    const [scope, key] = normalizeScopeAndKey(scopeInput, keyInput);
    await this.database.query(
      `INSERT INTO public.auth_throttle (scope, key, locked_until)
       VALUES ($1, $2, $3)
       ON CONFLICT (scope, key) DO UPDATE SET
         locked_until = EXCLUDED.locked_until,
         updated_at = NOW()`,
      [scope, key, lockedUntil],
    );
  }

  async clear(scopeInput: string, keyInput: string): Promise<void> {
    const [scope, key] = normalizeScopeAndKey(scopeInput, keyInput);
    await this.database.query(
      'DELETE FROM public.auth_throttle WHERE scope = $1 AND key = $2',
      [scope, key],
    );
  }

  async deleteExpired(): Promise<number> {
    const result = await this.database.query(
      `DELETE FROM public.auth_throttle
       WHERE updated_at < NOW() - INTERVAL '1 day'
         AND (locked_until IS NULL OR locked_until <= NOW())`,
    );
    return result.rowCount ?? 0;
  }
}

export const authThrottleRepository = new AuthThrottleRepository();
export default authThrottleRepository;
