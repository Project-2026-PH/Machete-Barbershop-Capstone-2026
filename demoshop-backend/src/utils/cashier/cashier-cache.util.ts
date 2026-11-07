import { deleteCacheKeys, getCache, setCache } from '../../redis';

const CASHIER_AGGREGATE_TTL_SECONDS = 15;
const CASHIER_AGGREGATE_TTL_MS = CASHIER_AGGREGATE_TTL_SECONDS * 1_000;
const MAX_CASHIER_MEMORY_CACHE_ENTRIES = 256;

type MemoryCacheEntry = {
  value: any;
  expiresAt: number;
};

// Supabase/PostgreSQL remains authoritative. This bounded process-local tier
// serves warm cashier instances without opening Redis for every dashboard read.
// The short TTL preserves the same freshness contract as the shared cache.
const memoryCache = new Map<string, MemoryCacheEntry>();

const getSummaryKey = (branchId: number): string => `cashier:summary:${branchId}`;
const getWeeklyPerformanceKey = (branchId: number): string => `cashier:weekly_performance:${branchId}`;
const getBarberBreakdownKey = (branchId: number, dateRange: string): string =>
  `cashier:barber_breakdown:${branchId}:${dateRange}`;

const getMemoryCache = <T>(key: string): T | undefined => {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }

  // Refresh insertion order so the oldest inactive entry is evicted first.
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry.value as T;
};

const setMemoryCache = (key: string, value: any): void => {
  memoryCache.delete(key);
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + CASHIER_AGGREGATE_TTL_MS,
  });

  while (memoryCache.size > MAX_CASHIER_MEMORY_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    memoryCache.delete(oldestKey);
  }
};

const deleteMemoryCache = (key: string): void => {
  memoryCache.delete(key);
};

const getCashierCache = async <T>(key: string): Promise<T | null> => {
  const localValue = getMemoryCache<T>(key);
  if (localValue !== undefined) return localValue;

  const sharedValue = await getCache<T>(key);
  if (sharedValue !== null) setMemoryCache(key, sharedValue);
  return sharedValue;
};

const setCashierCache = async (key: string, value: any): Promise<void> => {
  setMemoryCache(key, value);
  await setCache(key, value, CASHIER_AGGREGATE_TTL_SECONDS);
};

/**
 * Process memory and Redis are optional acceleration layers for Cashier
 * aggregates. Cache helpers return null or no-op on failure, allowing the
 * service to use PostgreSQL as the source of truth.
 */
export const getCachedDailySummary = (branchId: number): Promise<any | null> =>
  getCashierCache(getSummaryKey(branchId));

export const setCachedDailySummary = (branchId: number, data: any): Promise<void> =>
  setCashierCache(getSummaryKey(branchId), data);

export const getCachedWeeklyPerformance = (branchId: number): Promise<any | null> =>
  getCashierCache(getWeeklyPerformanceKey(branchId));

export const setCachedWeeklyPerformance = (branchId: number, data: any): Promise<void> =>
  setCashierCache(getWeeklyPerformanceKey(branchId), data);

export const getCachedBarberBreakdown = (branchId: number, dateRange: string): Promise<any | null> =>
  getCashierCache(getBarberBreakdownKey(branchId, dateRange));

export const setCachedBarberBreakdown = (branchId: number, dateRange: string, data: any): Promise<void> =>
  setCashierCache(getBarberBreakdownKey(branchId, dateRange), data);

export const invalidateCashierAggregates = async (branchId: number): Promise<void> => {
  const keys = [
    getSummaryKey(branchId),
    getWeeklyPerformanceKey(branchId),
    getBarberBreakdownKey(branchId, 'today'),
    getBarberBreakdownKey(branchId, 'week'),
    getBarberBreakdownKey(branchId, 'month'),
  ];
  keys.forEach(deleteMemoryCache);

  await deleteCacheKeys(keys);
};

export const clearCashierMemoryCache = (): void => {
  memoryCache.clear();
};
