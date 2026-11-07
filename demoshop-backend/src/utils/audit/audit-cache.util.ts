/**
 * In-memory cache with TTL and true LRU eviction for audit log listings.
 * Scoped to ensure cross-user / cross-tenant security isolation.
 */
interface CacheEntry {
  timestamp: number;
  data: any;
}

const auditCache = new Map<string, CacheEntry>();
const CACHE_TTL = 15 * 1000; // 15 seconds (short TTL for multi-instance consistency)
const MAX_CACHE_ENTRIES = 100;

const pruneExpired = (): void => {
  const now = Date.now();
  for (const [key, entry] of auditCache.entries()) {
    if (now - entry.timestamp >= CACHE_TTL) {
      auditCache.delete(key);
    }
  }
};

/**
 * Retrieves data from the audit log cache if it's still valid.
 * Refreshes entry position in Map for true Least Recently Used (LRU) ordering.
 */
export const getCachedLogs = (key: string): any | null => {
  const entry = auditCache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp < CACHE_TTL) {
      // Re-insert to mark as recently used (LRU)
      auditCache.delete(key);
      auditCache.set(key, entry);
      return entry.data;
    }
    auditCache.delete(key);
  }
  return null;
};

/**
 * Stores data in the audit log cache with LRU eviction.
 */
export const setCachedLogs = (key: string, data: any): void => {
  if (data === null || data === undefined) return;
  pruneExpired();

  // If key already exists, delete it first to reset insertion order
  if (auditCache.has(key)) {
    auditCache.delete(key);
  } else if (auditCache.size >= MAX_CACHE_ENTRIES) {
    // Evict least recently used (first key in insertion order)
    const oldestKey = auditCache.keys().next().value;
    if (oldestKey) {
      auditCache.delete(oldestKey);
    }
  }

  auditCache.set(key, { timestamp: Date.now(), data });
};

/**
 * Invalidates the entire in-memory audit log cache.
 */
export const invalidateAuditCache = (): void => {
  auditCache.clear();
};
