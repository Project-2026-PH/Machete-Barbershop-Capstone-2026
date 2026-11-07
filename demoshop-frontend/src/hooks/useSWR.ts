import { useState, useEffect, useCallback, useRef } from 'react';
import { customerCache, type CacheDomain } from '@/features/customer/services/customer-cache';

interface SWROptions {
  refreshInterval?: number;
  revalidateOnMount?: boolean;
  revalidateOnFocus?: boolean;
  domain?: CacheDomain;
  dedupingInterval?: number;
}
export function useSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SWROptions = {}
) {
  const domain: CacheDomain = options.domain || 'default';
  const [data, setData] = useState<T | undefined>(() => {
    if (!key) return undefined;
    return customerCache.get<T>(key)?.data;
  });
  const [error, setError] = useState<Error | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const dataRef = useRef<T | undefined>(data);
  const lastFocusRevalidateRef = useRef<number>(0);

  const revalidate = useCallback(async (force = false): Promise<T | undefined> => {
    if (!key) return undefined;

    const cached = customerCache.get<T>(key);
    if (!force && cached && !cached.isStale) {
      if (dataRef.current !== cached.data) {
        dataRef.current = cached.data;
        setData(cached.data);
      }
      return cached.data;
    }

    setIsValidating(true);
    try {
      const freshData = await customerCache.fetch<T>(
        key,
        domain,
        async () => fetcher(),
        { forceRevalidate: force }
      );
      dataRef.current = freshData;
      setData(freshData);
      setError(null);
      return freshData;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsValidating(false);
    }
  }, [key, domain, fetcher]);

  // Synchronize state when key changes or cache is updated externally
  useEffect(() => {
    if (!key) return;

    // Read immediately from cache
    const initial = customerCache.get<T>(key);
    if (initial) {
      setData(initial.data);
      dataRef.current = initial.data;
    } else {
      // Do not render data belonging to the previous key while this key loads.
      setData(undefined);
      dataRef.current = undefined;
    }
    setError(null);

    // Trigger revalidation if stale or missing unless explicitly disabled.
    if (options.revalidateOnMount !== false) {
      revalidate(false).catch(() => {});
    }

    // Listen to cache invalidations
    const unsubscribe = customerCache.subscribe((event) => {
      if (event.type === 'invalidate') {
        const current = customerCache.get<T>(key);
        if (!current || current.isStale) {
          revalidate(false).catch(() => {});
        }
      } else if (event.type === 'set' && event.key === key) {
        const next = customerCache.get<T>(key);
        if (next && next.data !== dataRef.current) {
          dataRef.current = next.data;
          setData(next.data);
        }
      }
    });

    // Throttled window focus revalidation (every 20s minimum)
    const handleFocus = () => {
      if (options.revalidateOnFocus === false) return;
      const now = Date.now();
      if (now - lastFocusRevalidateRef.current > 20_000) {
        lastFocusRevalidateRef.current = now;
        const current = customerCache.get<T>(key);
        if (!current || current.isStale) {
          revalidate(false).catch(() => {});
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (options.refreshInterval) {
      intervalId = setInterval(() => {
        revalidate(true).catch(() => {});
      }, options.refreshInterval);
    }

    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalId) clearInterval(intervalId);
    };
  }, [key, revalidate, options.refreshInterval, options.revalidateOnFocus, options.revalidateOnMount]);

  const mutate = useCallback(async (
    next?: T | ((current: T | undefined) => T),
    shouldRevalidate = true,
  ): Promise<T | undefined> => {
    if (!key) return undefined;
    if (next !== undefined) {
      const nextData = typeof next === 'function'
        ? (next as (current: T | undefined) => T)(dataRef.current)
        : next;
      customerCache.set(key, nextData, domain);
      dataRef.current = nextData;
      setData(nextData);
      if (!shouldRevalidate) return nextData;
    }
    return revalidate(true);
  }, [key, domain, revalidate]);

  return { data, error, isValidating, mutate };
}
