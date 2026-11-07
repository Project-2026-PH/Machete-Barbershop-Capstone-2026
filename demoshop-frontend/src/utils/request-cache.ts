type CacheEntry<T> = {
  promise: Promise<T>;
  expiresAt: number;
  status: 'pending' | 'fulfilled';
};

export type RequestCacheEvent = {
  outcome: 'cache_hit' | 'coalesced' | 'network_success' | 'network_error';
  durationMs?: number;
};

const entries = new Map<string, CacheEntry<unknown>>();
const MAX_CACHE_ENTRIES = 1_000;

const pruneExpiredEntries = (now: number): void => {
  for (const [key, entry] of entries) {
    if (entry.status === 'fulfilled' && entry.expiresAt <= now) entries.delete(key);
  }
};

const evictOldestSettledEntries = (): void => {
  while (entries.size > MAX_CACHE_ENTRIES) {
    let oldestSettledKey: string | undefined;
    for (const [key, entry] of entries) {
      if (entry.status === 'fulfilled') {
        oldestSettledKey = key;
        break;
      }
    }
    if (!oldestSettledKey) return;
    entries.delete(oldestSettledKey);
  }
};

export function cachedRequest<T>(
  key: string,
  request: () => Promise<T>,
  ttlMs: number,
  onEvent?: (event: RequestCacheEvent) => void,
): Promise<T> {
  const report = (event: RequestCacheEvent): void => {
    try {
      onEvent?.(event);
    } catch {
      // Observability must never change request results or cache behavior.
    }
  };
  const existing = entries.get(key) as CacheEntry<T> | undefined;
  if (existing?.status === 'pending') {
    entries.delete(key);
    entries.set(key, existing);
    report({ outcome: 'coalesced' });
    return existing.promise;
  }
  if (existing && existing.expiresAt > Date.now()) {
    entries.delete(key);
    entries.set(key, existing);
    report({ outcome: 'cache_hit' });
    return existing.promise;
  }

  if (existing) entries.delete(key);
  const startedAt = Date.now();
  pruneExpiredEntries(startedAt);
  let entry: CacheEntry<T>;
  const promise = Promise.resolve()
    .then(request)
    .then((value) => {
      if (entries.get(key) === entry) {
        entry.status = 'fulfilled';
        entry.expiresAt = Date.now() + ttlMs;
        evictOldestSettledEntries();
      }
      report({ outcome: 'network_success', durationMs: Date.now() - startedAt });
      return value;
    })
    .catch((error) => {
      if (entries.get(key) === entry) entries.delete(key);
      report({ outcome: 'network_error', durationMs: Date.now() - startedAt });
      throw error;
    });
  entry = { promise, expiresAt: Number.POSITIVE_INFINITY, status: 'pending' };
  entries.set(key, entry);
  evictOldestSettledEntries();
  return promise;
}

export function invalidateRequests(prefix?: string): void {
  if (!prefix) {
    entries.clear();
    return;
  }
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
