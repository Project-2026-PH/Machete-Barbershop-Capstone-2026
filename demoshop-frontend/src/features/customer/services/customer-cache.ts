/**
 * Centralized, scoped frontend cache for customer-facing data domains.
 *
 * Implements:
 * 1. Domain-specific freshness policies (stale time & expiration).
 * 2. In-flight request coalescing to deduplicate simultaneous requests.
 * 3. Tag-based and pattern-based cache invalidation.
 * 4. Stale-While-Revalidate semantics.
 * 5. Debounced realtime event invalidation.
 * 6. Baseline performance telemetry metrics.
 */

export type CacheDomain =
  | 'services'
  | 'barbers'
  | 'barber-schedules'
  | 'slot-availability'
  | 'reservation-history'
  | 'queue-position'
  | 'default';

export interface DomainPolicy {
  staleTimeMs: number;
  expireTimeMs: number;
}

const DOMAIN_POLICIES: Record<CacheDomain, DomainPolicy> = {
  // Service & Package Catalog: Long-lived (30-60 min)
  services: {
    staleTimeMs: 45 * 60 * 1000,
    expireTimeMs: 2 * 60 * 60 * 1000,
  },
  // Barber Profiles & Metadata: Medium-lived (15-30 min)
  barbers: {
    staleTimeMs: 20 * 60 * 1000,
    expireTimeMs: 60 * 60 * 1000,
  },
  // 14-30 day Barber Duty Roster: Medium-lived (15-30 min)
  'barber-schedules': {
    staleTimeMs: 20 * 60 * 1000,
    expireTimeMs: 60 * 60 * 1000,
  },
  // Slot Availability & Quotas: Short-lived (10-30 sec) with event-driven invalidation
  'slot-availability': {
    staleTimeMs: 20 * 1000,
    expireTimeMs: 5 * 60 * 1000,
  },
  // Reservation History: Stale time 2-5 min, invalidates immediately upon booking/cancellation
  'reservation-history': {
    staleTimeMs: 3 * 60 * 1000,
    expireTimeMs: 15 * 60 * 1000,
  },
  // Queue Position & Active Counts: Short-lived (10-30 sec)
  'queue-position': {
    staleTimeMs: 15 * 1000,
    expireTimeMs: 2 * 60 * 1000,
  },
  default: {
    staleTimeMs: 60 * 1000,
    expireTimeMs: 10 * 60 * 1000,
  },
};

const MAX_CACHE_ENTRIES = 500;

interface CacheEntry<T> {
  data: T;
  domain: CacheDomain;
  cachedAt: number;
  staleAt: number;
  expiresAt: number;
  tags: string[];
}

interface InFlightRequest<T> {
  promise: Promise<T>;
  abortController: AbortController;
  subscribers: number;
  reqId: symbol;
  settled: boolean;
}

export interface CacheMetrics {
  totalRequests: number;
  cacheHits: number;
  coalescedHits: number;
  networkFetches: number;
  invalidations: number;
}

class CustomerDataCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, InFlightRequest<unknown>>();
  private metrics: CacheMetrics = {
    totalRequests: 0,
    cacheHits: 0,
    coalescedHits: 0,
    networkFetches: 0,
    invalidations: 0,
  };

  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<(event: { type: 'invalidate' | 'set'; key?: string; domain?: CacheDomain }) => void>();

  constructor() {
    this.setupWindowListeners();
  }

  private setupWindowListeners() {
    if (typeof window === 'undefined') return;

    // Harmonize window events for realtime changes
    const onReservationsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ branchId?: number; date?: string }>).detail;
      this.debounce('reservations-changed', 300, () => {
        const branchTag = detail?.branchId ? `branch:${detail.branchId}` : null;
        const dateTag = detail?.date ? `date:${detail.date}` : null;
        if (branchTag || dateTag) {
          this.markStale((_, tags) => (
            tags.includes('slot-availability') &&
            (!branchTag || tags.includes(branchTag)) &&
            (!dateTag || tags.includes(dateTag))
          ));
        } else {
          this.markDomainStale('slot-availability');
        }
        this.markDomainStale('reservation-history');
        this.markDomainStale('queue-position');
      });
    };

    const onQueueUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ branchId?: number; date?: string }>).detail;
      this.debounce('queue-updated', 300, () => {
        const branchTag = detail?.branchId ? `branch:${detail.branchId}` : null;
        const dateTag = detail?.date ? `date:${detail.date}` : null;
        if (branchTag || dateTag) {
          this.markStale((_, tags) => (
            (tags.includes('queue-position') || tags.includes('slot-availability')) &&
            (!branchTag || tags.includes(branchTag)) &&
            (!dateTag || tags.includes(dateTag))
          ));
        } else {
          this.markDomainStale('queue-position');
          this.markDomainStale('slot-availability');
        }
      });
    };

    const onBarberStatusChanged = (_event: Event) => {
      this.debounce('barber-status-changed', 300, () => {
        this.markDomainStale('slot-availability');
      });
    };

    window.addEventListener('demoshop:reservations-changed', onReservationsChanged);
    window.addEventListener('demoshop:appointments-changed', onReservationsChanged);
    window.addEventListener('demoshop:queue-updated', onQueueUpdated);
    window.addEventListener('demoshop:barber-status-changed', onBarberStatusChanged);
  }

  public getPolicy(domain: CacheDomain): DomainPolicy {
    return DOMAIN_POLICIES[domain] || DOMAIN_POLICIES.default;
  }

  public get<T>(key: string): { data: T; isStale: boolean } | null {
    if (!key) return null;
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh insertion order so capacity eviction removes the least-recently-used entry.
    this.cache.delete(key);
    this.cache.set(key, entry);

    return {
      data: entry.data,
      isStale: now > entry.staleAt,
    };
  }

  public set<T>(key: string, data: T, domain: CacheDomain = 'default', tags: string[] = []): void {
    if (!key) return;
    const now = Date.now();
    const policy = this.getPolicy(domain);

    // Replacing a key also refreshes its LRU position.
    this.cache.delete(key);
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      for (const [cachedKey, cachedEntry] of this.cache.entries()) {
        if (now > cachedEntry.expiresAt) this.cache.delete(cachedKey);
      }
    }
    while (this.cache.size >= MAX_CACHE_ENTRIES) {
      const leastRecentlyUsedKey = this.cache.keys().next().value;
      if (leastRecentlyUsedKey === undefined) break;
      this.cache.delete(leastRecentlyUsedKey);
    }

    const entry: CacheEntry<T> = {
      data,
      domain,
      cachedAt: now,
      staleAt: now + policy.staleTimeMs,
      expiresAt: now + policy.expireTimeMs,
      tags: [...tags, domain],
    };

    this.cache.set(key, entry);
    this.notifyListeners({ type: 'set', key, domain });
  }

  /**
   * Fetch data with deduplication, caching, and stale-while-revalidate behavior.
   */
  public async fetch<T>(
    key: string,
    domain: CacheDomain,
    fetcher: (signal: AbortSignal) => Promise<T>,
    options: {
      tags?: string[];
      forceRevalidate?: boolean;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    this.metrics.totalRequests++;

    const existing = this.get<T>(key);
    // If not forced and existing entry is fresh, return cached immediately
    if (!options.forceRevalidate && existing && !existing.isStale) {
      this.metrics.cacheHits++;
      return existing.data;
    }

    // Coalesce overlapping in-flight requests for identical key
    const inFlightReq = this.inFlight.get(key) as InFlightRequest<T> | undefined;
    if (inFlightReq) {
      this.metrics.coalescedHits++;
      return this.subscribeToRequest(inFlightReq, options.signal);
    }

    this.metrics.networkFetches++;
    const abortController = new AbortController();

    const reqId = Symbol('req');
    const promise = (async (): Promise<T> => {
      try {
        const freshData = await fetcher(abortController.signal);
        this.set(key, freshData, domain, options.tags || []);
        return freshData;
      } finally {
        const active = this.inFlight.get(key);
        if (active && (active as any).reqId === reqId) {
          (active as InFlightRequest<T>).settled = true;
        }
        if (active && (active as any).reqId === reqId) {
          this.inFlight.delete(key);
        }
      }
    })();

    this.inFlight.set(key, {
      promise: promise as Promise<unknown>,
      abortController,
      subscribers: 0,
      reqId,
      settled: false,
    } as InFlightRequest<unknown>);

    return this.subscribeToRequest(this.inFlight.get(key) as InFlightRequest<T>, options.signal);
  }

  private subscribeToRequest<T>(request: InFlightRequest<T>, signal?: AbortSignal): Promise<T> {
    request.subscribers++;

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const abortError = () => {
        const error = new Error('Request aborted');
        error.name = 'AbortError';
        return error;
      };
      const release = () => {
        request.subscribers = Math.max(0, request.subscribers - 1);
        if (!request.settled && request.subscribers === 0) request.abortController.abort();
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        release();
        reject(abortError());
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });

      request.promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          release();
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          release();
          reject(error);
        },
      );
    });
  }

  /**
   * Prefetch key in the background if absent or stale.
   */
  public prefetch<T>(
    key: string,
    domain: CacheDomain,
    fetcher: (signal: AbortSignal) => Promise<T>,
    tags: string[] = []
  ): void {
    const existing = this.get<T>(key);
    if (!existing || existing.isStale) {
      void this.fetch(key, domain, fetcher, { tags }).catch(() => {
        // Suppress prefetch errors; will retry on actual view
      });
    }
  }

  /**
   * Invalidate entries matching a predicate, pattern, or exact key string.
   */
  public invalidate(patternOrPredicate: string | RegExp | ((key: string, tags: string[]) => boolean)): void {
    this.metrics.invalidations++;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      let matches = false;
      if (typeof patternOrPredicate === 'string') {
        matches = key === patternOrPredicate || key.startsWith(patternOrPredicate);
      } else if (patternOrPredicate instanceof RegExp) {
        matches = patternOrPredicate.test(key);
      } else if (typeof patternOrPredicate === 'function') {
        matches = patternOrPredicate(key, entry.tags);
      }

      if (matches) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    this.notifyListeners({ type: 'invalidate' });
  }

  /**
   * Invalidate all entries in a specific domain.
   */
  public invalidateDomain(domain: CacheDomain): void {
    this.invalidate((_, tags) => tags.includes(domain));
  }

  /**
   * Mark a domain stale while retaining its last value for stale-while-
   * revalidate rendering. Use this for realtime updates and successful
   * mutations where a blank state would create an avoidable visual flash.
   */
  public markDomainStale(domain: CacheDomain): void {
    this.markStale((_, tags) => tags.includes(domain));
  }

  /**
   * Mark entries as stale without evicting them (enables instantaneous SWR fallback).
   */
  public markStale(patternOrPredicate: string | RegExp | ((key: string, tags: string[]) => boolean)): void {
    for (const [key, entry] of this.cache.entries()) {
      let matches = false;
      if (typeof patternOrPredicate === 'string') {
        matches = key === patternOrPredicate || key.startsWith(patternOrPredicate);
      } else if (patternOrPredicate instanceof RegExp) {
        matches = patternOrPredicate.test(key);
      } else if (typeof patternOrPredicate === 'function') {
        matches = patternOrPredicate(key, entry.tags);
      }

      if (matches) {
        entry.staleAt = 0; // Stale immediately, but remains in cache for SWR fallback
      }
    }
    this.notifyListeners({ type: 'invalidate' });
  }

  /**
   * Debounce helper for batching bursts of events (e.g. Supabase broadcast).
   */
  public debounce(timerId: string, delayMs: number, action: () => void): void {
    const existing = this.debounceTimers.get(timerId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(timerId);
      action();
    }, delayMs);

    this.debounceTimers.set(timerId, timer);
  }

  public subscribe(listener: (event: { type: 'invalidate' | 'set'; key?: string; domain?: CacheDomain }) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: { type: 'invalidate' | 'set'; key?: string; domain?: CacheDomain }) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[CustomerCache] Listener error:', err);
      }
    }
  }

  /**
   * Clear all cached data and cancel all in-flight requests.
   */
  public clear(): void {
    for (const req of this.inFlight.values()) {
      req.abortController.abort();
    }
    this.inFlight.clear();
    this.cache.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.notifyListeners({ type: 'invalidate' });
  }

  public getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  public resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      coalescedHits: 0,
      networkFetches: 0,
      invalidations: 0,
    };
  }
}

export const customerCache = new CustomerDataCache();

/**
 * Helper to construct stable scoped cache keys.
 */
export const makeCacheKey = (domain: CacheDomain, ...parts: Array<string | number | boolean | null | undefined>): string => {
  const cleanParts = parts
    .map(p => (p === null || p === undefined ? '' : String(p).trim()))
    .filter(Boolean);
  return `${domain}:${cleanParts.join(':')}`;
};
