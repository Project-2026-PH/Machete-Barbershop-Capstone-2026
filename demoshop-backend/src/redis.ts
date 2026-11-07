import crypto from 'crypto';
import { createClient } from 'redis';
import logger from './utils/general/logger';
import { config } from './config/env';

const isTest = config.runtime.isTest;
const redisUrl = config.redis.url;
const redisEndpoint = new URL(redisUrl);

// Single global redis client instance (capping connection footprint on Layerbase Free tier)
const redisClient = createClient({
  url: redisUrl,
  // Disable offline queue so operations fail fast instead of queuing up during sleep/cold-starts
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 5000,
    // Layerbase routes TLS connections by SNI. `rediss://` enables TLS in
    // node-redis, but the endpoint also requires the hostname explicitly.
    ...(redisEndpoint.protocol === 'rediss:' ? { servername: redisEndpoint.hostname } : {}),
    // Redis is optional for reads/cache acceleration. Automatic reconnects
    // against a sleeping provider create a socket/error storm and compete with
    // payment requests for the event loop. Retry only through ensureRedisReady.
    reconnectStrategy: false,
  }
});

let lastRedisErrorMessage = '';
let lastRedisErrorAt = 0;
const REDIS_ERROR_BURST_SUPPRESSION_MS = 5_000;
redisClient.on('error', (err) => {
  if (isTest) return;
  const message = err.message || 'unknown Redis client error';
  const now = Date.now();
  // node-redis can emit follow-up queue/socket errors with different messages
  // after the provider's primary failure. Keep the first error visible without
  // flooding logs with secondary destroy/reject failures.
  if (now - lastRedisErrorAt < REDIS_ERROR_BURST_SUPPRESSION_MS) return;
  lastRedisErrorMessage = message;
  lastRedisErrorAt = now;
  logger.error('Redis Client Error: ' + message);
});

redisClient.on('ready', () => {
  lastRedisErrorMessage = '';
  lastRedisErrorAt = 0;
  if (!isTest) logger.info('Redis Client Connected');
});

// Serverless memoized connection promise with connect gate
let redisConnectPromise: Promise<void> | null = null;
let redisWarmRetryAt = 0;
let redisRetryAt = 0;
const REDIS_WARM_TIMEOUT_MS = 750;
const REDIS_WARM_RETRY_DELAY_MS = 2000;
export const REDIS_FAILURE_COOLDOWN_MS = 10_000;

// Helper to keep background revalidations and cold connections alive in serverless runtimes
export const scheduleBackgroundTask = (task: Promise<any>): void => {
  try {
    const vercel = (globalThis as any).waitUntil || (process as any).waitUntil;
    if (typeof vercel === 'function') {
      vercel(task);
      return;
    }
  } catch {
    // Fall back to standard background execution
  }
  task.catch((err: any) => {
    if (!isTest) logger.warn(`[Redis SWR] Background task error: ${err?.message}`);
  });
};

export const ensureRedisReady = async (): Promise<void> => {
  if (redisClient.isReady) return;
  if (redisConnectPromise) return redisConnectPromise;
  if (Date.now() < redisRetryAt) {
    throw new Error('Redis retry deferred after a previous connection failure');
  }

  redisConnectPromise = (async () => {
    try {
      if (!redisClient.isOpen) {
        const connectPromise = redisClient.connect();
        await Promise.race([
          connectPromise,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 8000)),
        ]);
      } else {
        // Socket is already open/reconnecting; wait briefly for readiness without aborting the client
        const start = Date.now();
        while (!redisClient.isReady && redisClient.isOpen && Date.now() - start < 3000) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      if (!redisClient.isReady) {
        throw new Error('Redis connection completed without becoming ready');
      }
    } catch (err: any) {
      // Clear memoized promise immediately on failure so future calls don't reuse the rejection
      redisConnectPromise = null;
      redisRetryAt = Date.now() + REDIS_FAILURE_COOLDOWN_MS;
      throw err;
    } finally {
      redisConnectPromise = null;
    }
  })();

  return redisConnectPromise;
};

/**
 * Compatibility promise for older consumers. It deliberately does not open
 * a Redis connection; readiness is demand-driven through `ensureRedisReady`
 * or `warmRedis`.
 */
export const redisReady: Promise<void> = Promise.resolve();

/**
 * Starts a bounded, best-effort Redis warm-up for non-auth features.
 * A timeout never cancels an in-flight connection attempt; it only prevents a
 * request from waiting on Redis. The shared promise lets later callers reuse
 * the same attempt instead of creating a connection stampede.
 */
export const warmRedis = async (timeoutMs: number = REDIS_WARM_TIMEOUT_MS): Promise<boolean> => {
  if (redisClient.isReady) return true;

  const now = Date.now();
  if (now < redisWarmRetryAt) return false;

  const readyAttempt = ensureRedisReady();
  try {
    await withTimeout(readyAttempt, timeoutMs);
    redisWarmRetryAt = 0;
    return redisClient.isReady;
  } catch (error: unknown) {
    redisWarmRetryAt = Date.now() + REDIS_WARM_RETRY_DELAY_MS;
    scheduleBackgroundTask(readyAttempt.catch(() => {}));
    if (!isTest) {
      logger.warn('[Redis] Warm-up did not complete within the request budget', { error });
    }
    return false;
  }
};

/**
 * Connect gate for disableOfflineQueue: ensures socket is ready before running commands.
 * On cold starts, waits up to timeoutMs (default 500ms). If timeout occurs, keeps connection
 * running in background (wrapped in waitUntil on serverless) and returns false to fall through safely.
 */
export const gateRedisReady = async (timeoutMs: number = 500): Promise<boolean> => {
  if (redisClient.isReady) return true;
  try {
    const readyCheck = ensureRedisReady();
    let timer: NodeJS.Timeout;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const success = await Promise.race([
      readyCheck.then(() => {
        clearTimeout(timer);
        return redisClient.isReady;
      }),
      timeout,
    ]);

    if (!success) {
      // Let the pending connection continue in background so next request finds the socket ready
      scheduleBackgroundTask(readyCheck.catch(() => {}));
    }

    return success;
  } catch {
    return false;
  }
};

const redisCacheStats = {
  localHits: 0,
  localWrites: 0,
  localEvictions: 0,
  getHits: 0,
  getMisses: 0,
  getBypasses: 0,
  getErrors: 0,
  setWrites: 0,
  setSkippedUnchanged: 0,
  setBypasses: 0,
  setErrors: 0,
};

const LOCAL_CACHE_MAX_TTL_SECONDS = 10;
const LOCAL_CACHE_MAX_ENTRIES = 512;
type LocalCacheEntry = {
  serialized: string;
  expiresAt: number;
  sharedExpiresAt: number | null;
};
const localCache = new Map<string, LocalCacheEntry>();

const cloneCachedValue = <T>(serialized: string): T => JSON.parse(serialized) as T;

const setLocalCache = (
  key: string,
  serialized: string,
  ttlSeconds: number,
  sharedExpiresAt: number | null = null,
): void => {
  const now = Date.now();
  const ttlMs = Math.max(0, Math.min(ttlSeconds, LOCAL_CACHE_MAX_TTL_SECONDS) * 1000);
  if (ttlMs === 0) return;
  localCache.delete(key);
  localCache.set(key, {
    serialized,
    expiresAt: now + ttlMs,
    sharedExpiresAt,
  });
  redisCacheStats.localWrites++;
  while (localCache.size > LOCAL_CACHE_MAX_ENTRIES) {
    const oldestKey = localCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    localCache.delete(oldestKey);
    redisCacheStats.localEvictions++;
  }
};

const getLocalCache = <T>(key: string): T | undefined => {
  const entry = localCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    localCache.delete(key);
    return undefined;
  }
  localCache.delete(key);
  localCache.set(key, entry);
  redisCacheStats.localHits++;
  return cloneCachedValue<T>(entry.serialized);
};

const markLocalCacheShared = (key: string, serialized: string, ttlSeconds: number): void => {
  const entry = localCache.get(key);
  if (!entry || entry.expiresAt <= Date.now() || entry.serialized !== serialized) return;
  entry.sharedExpiresAt = Date.now() + Math.max(0, ttlSeconds * 1000);
};

const deleteLocalCacheKeys = (keys: string[]): void => {
  for (const key of keys) localCache.delete(key);
};

const deleteLocalCachePattern = (pattern: string): void => {
  const escapedPattern = pattern.replace(/[.+?^${}()|[\\]\\]/g, '\\$&');
  const expression = new RegExp(`^${escapedPattern.replace(/\*/g, '.*')}$`);
  for (const key of localCache.keys()) {
    if (expression.test(key)) localCache.delete(key);
  }
};

export const clearRedisLocalCache = (): void => {
  localCache.clear();
};

export const getRedisCacheStats = () => ({ ...redisCacheStats });

export async function getCache<T = any>(key: string): Promise<T | null> {
  const localValue = getLocalCache<T>(key);
  if (localValue !== undefined) return localValue;

  try {
    const ready = await gateRedisReady(300);
    if (!ready || !redisClient.isOpen) {
      redisCacheStats.getBypasses++;
      return null;
    }
    // A cache read must never hold an authenticated request open indefinitely.
    // Redis is an acceleration layer; a timeout falls through to the database.
    // Read the value and its remaining Redis lifetime in one round trip. A
    // read-through local entry must never outlive the shared cache entry.
    const readStartedAt = Date.now();
    const response = await withTimeout(
      redisClient.multi().get(key).pTTL(key).exec(),
      250,
    ) as unknown[] | null;
    const data = response?.[0] as string | null | undefined;
    const sharedTtlMs = Number(response?.[1]);
    if (!data) {
      redisCacheStats.getMisses++;
      return null;
    }
    redisCacheStats.getHits++;
    const remainingTtlMs = sharedTtlMs - (Date.now() - readStartedAt);
    if (remainingTtlMs > 0) {
      setLocalCache(
        key,
        data,
        Math.min(remainingTtlMs / 1000, LOCAL_CACHE_MAX_TTL_SECONDS),
        readStartedAt + sharedTtlMs,
      );
    }
    return cloneCachedValue<T>(data);
  } catch (err: any) {
    redisCacheStats.getErrors++;
    if (!isTest) logger.warn(`[Redis] getCache error for key ${key}: ${err?.message}`);
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    localCache.delete(key);
    return;
  }
  try {
    const serialized = JSON.stringify(value);
    const existing = localCache.get(key);
    const now = Date.now();
    if (
      existing &&
      existing.expiresAt > now &&
      existing.sharedExpiresAt !== null &&
      existing.sharedExpiresAt > now &&
      existing.serialized === serialized
    ) {
      redisCacheStats.setSkippedUnchanged++;
      return;
    }

    setLocalCache(key, serialized, ttlSeconds);

    const ready = await gateRedisReady(300);
    if (!ready || !redisClient.isOpen) {
      redisCacheStats.setBypasses++;
      return;
    }
    await withTimeout(redisClient.setEx(key, ttlSeconds, serialized), 250);
    markLocalCacheShared(key, serialized, ttlSeconds);
    redisCacheStats.setWrites++;
  } catch (err: any) {
    redisCacheStats.setErrors++;
    if (!isTest) logger.warn(`[Redis] setCache error for key ${key}: ${err?.message}`);
  }
}

/** Increment a low-cardinality telemetry counter with an expiry. Best-effort only. */
export async function incrementTelemetryCounter(key: string, ttlSeconds: number, amount = 1): Promise<void> {
  if (!/^telemetry:[a-z0-9:_-]{1,120}$/.test(key) || !Number.isInteger(ttlSeconds) || ttlSeconds < 60 || !Number.isSafeInteger(amount) || amount < 1) return;
  try {
    const ready = await gateRedisReady(200);
    if (!ready || !redisClient.isOpen) return;
    await withTimeout(redisClient.incrBy(key, amount), 250);
    await withTimeout(redisClient.expire(key, ttlSeconds), 250);
  } catch {
    // Telemetry must not affect customer requests and failures must not expose input.
  }
}

export interface SwrOptions {
  freshTtlSeconds: number;
  staleTtlSeconds?: number;
  timeoutMs?: number;
  /**
   * Negative cache TTL for not-found/null results (in seconds).
   * Prevents repeated DB roundtrips on non-existent records.
   */
  negativeTtlSeconds?: number;
  /**
   * Maximum revalidation execution duration (default: 6000ms).
   * Kept strictly below the 15s distributed lock TTL to prevent duplicate revalidation.
   */
  revalidateTimeoutMs?: number;
}

export const NEGATIVE_CACHE_SENTINEL = '__SWR_NEGATIVE_NULL__';

interface SwrEnvelope<T> {
  __swr: 1;
  data: T | typeof NEGATIVE_CACHE_SENTINEL;
  staleAt: number;
}

// In-process single-flight map to deduplicate concurrent revalidations & cold misses
const inFlightRequests = new Map<string, Promise<any>>();

export type CacheEventType = 'hit' | 'stale' | 'miss' | 'timeout' | 'lock_skipped';

// Structured logger for serverless log aggregators (e.g. Datadog, Axiom, CloudWatch)
export const logCacheEvent = (event: CacheEventType, key: string): void => {
  if (!isTest) {
    logger.info(JSON.stringify({ cache: event, key, timestamp: Date.now() }));
  }
};

// Cache observability counters for unit tests and local inspection
export const cacheMetrics = {
  hit: 0,
  stale: 0,
  miss: 0,
  timeout: 0,
  lock_skipped: 0,
  record(event: CacheEventType, key: string) {
    this[event]++;
    logCacheEvent(event, key);
  },
  reset() {
    this.hit = 0;
    this.stale = 0;
    this.miss = 0;
    this.timeout = 0;
    this.lock_skipped = 0;
  }
};

/**
 * Executes a promise with an optional timeout.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs?: number, onTimeout?: () => void): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (onTimeout) onTimeout();
      reject(new Error(`Operation timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]);
}

/**
 * Lua script for safe atomic compare-and-delete lock release.
 * Works across node-redis v4 and v5 via sendCommand fallback.
 */
const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Safely executes compare-and-delete lock release across node-redis versions without throwing.
 */
async function releaseDistributedLock(lockKey: string, lockToken: string): Promise<void> {
  if (!redisClient.isOpen) return;
  try {
    // Try node-redis v4 style eval object
    if (typeof (redisClient as any).eval === 'function') {
      try {
        await (redisClient as any).eval(RELEASE_LOCK_LUA, {
          keys: [lockKey],
          arguments: [lockToken],
        });
        return;
      } catch {
        // Fall back to sendCommand if signature differs in v5
      }
    }
    if (typeof (redisClient as any).sendCommand === 'function') {
      await (redisClient as any).sendCommand(['EVAL', RELEASE_LOCK_LUA, '1', lockKey, lockToken]);
    }
  } catch {
    // Silently handle: lock will expire automatically via EX 15
  }
}

/**
 * Performs distributed single-flight revalidation with ownership-verified lock release.
 * Fetcher timeout is capped at 6s (well below the 15s lock TTL) to prevent lock expiration mid-run.
 */
async function triggerRevalidation<T>(
  key: string,
  fetcher: () => Promise<T>,
  freshTtlSeconds: number,
  staleTtlSeconds: number,
  negativeTtlSeconds?: number,
  revalidateTimeoutMs: number = 6000
): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const revalidationPromise = (async () => {
    let lockToken: string | null = null;
    const lockKey = `${key}:revalidate_lock`;

    try {
      if (redisClient.isOpen) {
        lockToken = crypto.randomUUID();
        try {
          const lock = await redisClient.set(lockKey, lockToken, { NX: true, EX: 15 });
          if (lock !== 'OK') {
            cacheMetrics.record('lock_skipped', key);
            return undefined as unknown as T;
          }
        } catch (lockErr: any) {
          // If lock call itself fails/errors, serve stale and skip revalidation
          cacheMetrics.record('lock_skipped', key);
          if (!isTest) logger.warn(`[Redis SWR] Lock acquisition failed for ${key}, skipping: ${lockErr?.message}`);
          return undefined as unknown as T;
        }
      }

      // Bound fetcher execution to avoid exceeding 15s distributed lock TTL
      const fresh = await withTimeout(fetcher(), revalidateTimeoutMs);

      if (redisClient.isOpen) {
        if (fresh === null || fresh === undefined) {
          if (negativeTtlSeconds && negativeTtlSeconds > 0) {
            const payload: SwrEnvelope<any> = {
              __swr: 1,
              data: NEGATIVE_CACHE_SENTINEL,
              staleAt: Date.now() + negativeTtlSeconds * 1000,
            };
            await redisClient.setEx(key, negativeTtlSeconds, JSON.stringify(payload));
          }
        } else {
          const payload: SwrEnvelope<T> = {
            __swr: 1,
            data: fresh,
            staleAt: Date.now() + freshTtlSeconds * 1000,
          };
          await redisClient.setEx(key, staleTtlSeconds, JSON.stringify(payload));
        }
      }

      return fresh;
    } catch (err: any) {
      if (!isTest) logger.warn(`[Redis SWR] Background revalidation failed for ${key}: ${err?.message}`);
      throw err;
    } finally {
      if (lockToken) {
        await releaseDistributedLock(lockKey, lockToken);
      }
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, revalidationPromise);
  return revalidationPromise;
}

export async function getOrSetCacheWithSwr<T = any>(
  key: string,
  fetcher: () => Promise<T>,
  options: SwrOptions
): Promise<T> {
  const {
    freshTtlSeconds,
    staleTtlSeconds = freshTtlSeconds * 2,
    timeoutMs,
    negativeTtlSeconds,
    revalidateTimeoutMs = 6000,
  } = options;
  const now = Date.now();

  try {
    // Connect gate prevents disableOfflineQueue crashes on cold serverless invocations
    const ready = await gateRedisReady(300);
    if (ready && redisClient.isOpen) {
      const raw = await withTimeout(redisClient.get(key), timeoutMs, () => {
        cacheMetrics.record('timeout', key);
      });
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Unambiguous versioned envelope check (__swr: 1)
          if (parsed && typeof parsed === 'object' && parsed.__swr === 1 && 'staleAt' in parsed && 'data' in parsed) {
            // Confirm sentinel never leaks to caller
            const isNegative = parsed.data === NEGATIVE_CACHE_SENTINEL;
            const dataToReturn = isNegative ? null : (parsed.data as T);
            const isStale = now > parsed.staleAt;

            if (isStale) {
              cacheMetrics.record('stale', key);
              scheduleBackgroundTask(
                triggerRevalidation(key, fetcher, freshTtlSeconds, staleTtlSeconds, negativeTtlSeconds, revalidateTimeoutMs)
              );
            } else {
              cacheMetrics.record('hit', key);
            }

            return dataToReturn as T;
          }
          // Legacy raw cached value (not an envelope)
          cacheMetrics.record('hit', key);
          return parsed as T;
        } catch {
          // Parse error: fall through to cold miss
        }
      }
    }
  } catch (err: any) {
    if (!isTest) logger.warn(`[Redis SWR] Cache read error/timeout for ${key}: ${err?.message}`);
  }

  cacheMetrics.record('miss', key);

  // Cold cache miss: single-flight in-process fetch
  const existingMiss = inFlightRequests.get(key);
  if (existingMiss) {
    return existingMiss;
  }

  const missPromise = (async () => {
    try {
      const freshData = await fetcher();

      if (redisClient.isOpen) {
        try {
          if (freshData === null || freshData === undefined) {
            if (negativeTtlSeconds && negativeTtlSeconds > 0) {
              const payload: SwrEnvelope<any> = {
                __swr: 1,
                data: NEGATIVE_CACHE_SENTINEL,
                staleAt: Date.now() + negativeTtlSeconds * 1000,
              };
              await redisClient.setEx(key, negativeTtlSeconds, JSON.stringify(payload));
            }
          } else {
            const payload: SwrEnvelope<T> = {
              __swr: 1,
              data: freshData,
              staleAt: Date.now() + freshTtlSeconds * 1000,
            };
            await redisClient.setEx(key, staleTtlSeconds, JSON.stringify(payload));
          }
        } catch (err: any) {
          if (!isTest) logger.warn(`[Redis SWR] Write error for key ${key}: ${err?.message}`);
        }
      }

      return freshData;
    } finally {
      // Guaranteed cleanup even if fetcher throws
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, missPromise);
  return missPromise;
}

export async function deleteCache(key: string): Promise<void> {
  return deleteCacheKeys([key]);
}

export async function deleteCacheKeys(keys: string[]): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (uniqueKeys.length === 0) return;
  deleteLocalCacheKeys(uniqueKeys);

  try {
    const ready = await gateRedisReady(300);
    if (!ready || !redisClient.isOpen) return;
    await redisClient.del(uniqueKeys);
  } catch (err: any) {
    if (!isTest) logger.warn(`[Redis] deleteCache error: ${err?.message}`);
  }
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  deleteLocalCachePattern(pattern);
  try {
    const ready = await gateRedisReady(300);
    if (!ready || !redisClient.isOpen) return;

    let cursor = '0';
    do {
      const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) await redisClient.del(result.keys);
    } while (cursor !== '0');
  } catch (err: any) {
    if (!isTest) logger.warn(`[Redis] deleteCachePattern error for pattern ${pattern}: ${err?.message}`);
  }
}

export default redisClient;
