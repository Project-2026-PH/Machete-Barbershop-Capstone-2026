/**
 * In-memory cache with TTL and true LRU eviction for admin user listings.
 * Scoped to ensure cross-user / cross-tenant security isolation.
 */
interface CacheEntry {
  timestamp: number;
  data: any;
}

const userCache = new Map<string, CacheEntry>();
const CACHE_TTL = 15 * 1000; // 15 seconds (short TTL for multi-instance consistency)
const MAX_CACHE_ENTRIES = 100;

const pruneExpired = (): void => {
  const now = Date.now();
  for (const [key, entry] of userCache.entries()) {
    if (now - entry.timestamp >= CACHE_TTL) {
      userCache.delete(key);
    }
  }
};

/**
 * Retrieves data from the user cache if it's still valid.
 * Refreshes entry position in Map for true Least Recently Used (LRU) ordering.
 */
export const getCachedUsers = (key: string): any | null => {
  const entry = userCache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp < CACHE_TTL) {
      // Re-insert to mark as recently used (LRU)
      userCache.delete(key);
      userCache.set(key, entry);
      return entry.data;
    }
    userCache.delete(key);
  }
  return null;
};

/**
 * Stores data in the user cache with LRU eviction.
 */
export const setCachedUsers = (key: string, data: any): void => {
  if (data === null || data === undefined) return;
  pruneExpired();

  // If key already exists, delete it first to reset insertion order
  if (userCache.has(key)) {
    userCache.delete(key);
  } else if (userCache.size >= MAX_CACHE_ENTRIES) {
    // Evict least recently used (first key in insertion order)
    const oldestKey = userCache.keys().next().value;
    if (oldestKey) {
      userCache.delete(oldestKey);
    }
  }

  userCache.set(key, { timestamp: Date.now(), data });
};

/**
 * Invalidates the entire in-memory user cache.
 */
export const invalidateAdminCache = (): void => {
  userCache.clear();
};
