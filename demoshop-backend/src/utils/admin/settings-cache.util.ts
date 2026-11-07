/**
 * In-memory cache for live shop settings.
 * Ensures high read throughput while allowing instant invalidation on mutations.
 */

interface CacheEntry {
  timestamp: number;
  data: any;
}

const settingsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

export const getCachedShopSettings = (branchId: number): any | null => {
  const key = `branch_settings_${branchId}`;
  const entry = settingsCache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.data;
    }
    settingsCache.delete(key);
  }
  return null;
};

export const setCachedShopSettings = (branchId: number, data: any): void => {
  if (!data) return;
  const key = `branch_settings_${branchId}`;
  settingsCache.set(key, { timestamp: Date.now(), data });
};

export const invalidateShopSettingsCache = (branchId?: number): void => {
  if (branchId) {
    settingsCache.delete(`branch_settings_${branchId}`);
  } else {
    settingsCache.clear();
  }
};
