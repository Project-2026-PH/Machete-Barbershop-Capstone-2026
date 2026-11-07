import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/config/supabaseClient';
import { useAuth } from '@/components/auth/AuthContext';
import { createRealtimeFallback, RealtimeDisplayStatus } from '@/utils/supabase-realtime';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';

export interface RealtimeRule {
  table: string;
  schema?: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  filter?: string;
  invalidateKeys: string[];
  /** Omit when Hasura does not expose this table/event stream. */
  hasuraQuery?: string;
  hasuraVariables?: Record<string, unknown>;
}

export interface RealtimeDataProviderProps {
  channelName?: string;
  rules?: RealtimeRule[];
  fallbackIntervalMs?: number;
  enabled?: boolean;
  onStatusChange?: (status: RealtimeDisplayStatus) => void;
  children: React.ReactNode;
}

interface CacheEntry<T = any> {
  value: T;
  updatedAt: number;
}

interface QueryOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  staleTime?: number;
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface RealtimeDataContextValue {
  getCache: <T = any>(key: string) => CacheEntry<T> | undefined;
  setCache: <T = any>(key: string, value: T) => void;
  executeFetch: <T = any>(key: string, fetcher: () => Promise<T>, force?: boolean) => Promise<T>;
  registerFetcher: (key: string, fetcher: () => Promise<any>) => () => void;
  subscribeKey: (key: string, callback: () => void) => () => void;
  invalidate: (keyOrPattern: string | string[]) => Promise<void>;
  mutate: <T = any>(key: string, dataOrUpdater: T | ((prev: T | undefined) => T), options?: { revalidate?: boolean }) => Promise<void>;
  realtimeStatus: RealtimeDisplayStatus;
}

const RealtimeDataContext = createContext<RealtimeDataContextValue | null>(null);

export const RealtimeDataProvider: React.FC<RealtimeDataProviderProps> = ({
  channelName,
  rules = [],
  fallbackIntervalMs = 60_000,
  enabled = true,
  onStatusChange,
  children,
}) => {
  const { authReady, supabaseToken } = useAuth();
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeDisplayStatus>('connecting');

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const fetchersRef = useRef<Map<string, () => Promise<any>>>(new Map());
  const subscribersRef = useRef<Map<string, Set<() => void>>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<any>>>(new Map());

  const getCache = useCallback(<T = any>(key: string): CacheEntry<T> | undefined => {
    return cacheRef.current.get(key);
  }, []);

  const notifySubscribers = useCallback((key: string) => {
    const subs = subscribersRef.current.get(key);
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          console.error(`[RealtimeDataContext] Error in subscriber callback for key ${key}:`, err);
        }
      });
    }
  }, []);

  const setCache = useCallback(<T = any>(key: string, value: T) => {
    cacheRef.current.set(key, { value, updatedAt: Date.now() });
    notifySubscribers(key);
  }, [notifySubscribers]);

  const executeFetch = useCallback(async <T = any>(
    key: string,
    fetcher: () => Promise<T>,
    force = false,
  ): Promise<T> => {
    // If already in flight, return ongoing promise to deduplicate network requests
    if (!force && inFlightRef.current.has(key)) {
      return inFlightRef.current.get(key) as Promise<T>;
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        cacheRef.current.set(key, { value: result, updatedAt: Date.now() });
        notifySubscribers(key);
        return result;
      } finally {
        inFlightRef.current.delete(key);
      }
    })();

    inFlightRef.current.set(key, promise);
    return promise;
  }, [notifySubscribers]);

  const registerFetcher = useCallback((key: string, fetcher: () => Promise<any>) => {
    fetchersRef.current.set(key, fetcher);
    return () => {
      fetchersRef.current.delete(key);
    };
  }, []);

  const subscribeKey = useCallback((key: string, callback: () => void) => {
    if (!subscribersRef.current.has(key)) {
      subscribersRef.current.set(key, new Set());
    }
    const set = subscribersRef.current.get(key)!;
    set.add(callback);
    return () => {
      set.delete(callback);
      if (set.size === 0) {
        subscribersRef.current.delete(key);
      }
    };
  }, []);

  const pendingInvalidationsRef = useRef<Set<string>>(new Set());
  const invalidateTimerRef = useRef<number | null>(null);

  const processPendingInvalidations = useCallback(async () => {
    const keysToInvalidate = Array.from(pendingInvalidationsRef.current);
    pendingInvalidationsRef.current.clear();
    invalidateTimerRef.current = null;

    if (keysToInvalidate.length === 0) return;

    const fetchPromises: Promise<any>[] = [];
    for (const key of keysToInvalidate) {
      const fetcher = fetchersRef.current.get(key);
      if (fetcher) {
        // Deduplicate with any ongoing fetch to prevent request storms
        fetchPromises.push(executeFetch(key, fetcher, false).catch((err) => {
          console.warn(`[RealtimeDataContext] Failed background revalidation for ${key}:`, err);
        }));
      }
    }

    await Promise.allSettled(fetchPromises);
  }, [executeFetch]);

  const invalidate = useCallback((keyOrPattern: string | string[], immediate = false): Promise<void> => {
    const keys = Array.isArray(keyOrPattern) ? keyOrPattern : [keyOrPattern];
    keys.forEach((k) => pendingInvalidationsRef.current.add(k));

    if (immediate) {
      if (invalidateTimerRef.current !== null) {
        window.clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
      return processPendingInvalidations();
    }

    if (invalidateTimerRef.current === null) {
      invalidateTimerRef.current = window.setTimeout(() => {
        void processPendingInvalidations();
      }, 200);
    }
    return Promise.resolve();
  }, [processPendingInvalidations]);

  const mutate = useCallback(async <T = any>(
    key: string,
    dataOrUpdater: T | ((prev: T | undefined) => T),
    options: { revalidate?: boolean } = { revalidate: true },
  ) => {
    const currentEntry = cacheRef.current.get(key);
    const newValue = typeof dataOrUpdater === 'function'
      ? (dataOrUpdater as (prev: T | undefined) => T)(currentEntry?.value)
      : dataOrUpdater;

    cacheRef.current.set(key, { value: newValue, updatedAt: Date.now() });
    notifySubscribers(key);

    if (options.revalidate) {
      const fetcher = fetchersRef.current.get(key);
      if (fetcher) {
        await executeFetch(key, fetcher, true).catch(() => {});
      }
    }
  }, [executeFetch, notifySubscribers]);

  const handleStatusChange = useCallback((status: RealtimeDisplayStatus) => {
    setRealtimeStatus(status);
    onStatusChange?.(status);
  }, [onStatusChange]);

  // Unified Realtime Subscription
  useEffect(() => {
    if (!enabled || !authReady || !channelName) return;

    if (supabaseToken) {
      supabase.realtime.setAuth(supabaseToken);
    }

    const supportedRules = rules.filter((rule) => Boolean(rule.hasuraQuery));
    const supabaseOnlyRules = rules.filter((rule) => !rule.hasuraQuery);
    const statusByTransport = new Map<string, RealtimeDisplayStatus>();
    const updateTransportStatus = (transport: string, status: RealtimeDisplayStatus) => {
      statusByTransport.set(transport, status);
      const statuses = Array.from(statusByTransport.values());
      const combined = statuses.includes('unavailable')
        ? 'unavailable'
        : statuses.includes('fallback')
          ? 'fallback'
          : statuses.length > 0 && statuses.every((value) => value === 'live')
            ? 'live'
            : 'connecting';
      handleStatusChange(combined);
    };

    let supabaseOnlyChannel: ReturnType<typeof supabase.channel> | null = null;
    let supabaseOnlyFallback: ReturnType<typeof createRealtimeFallback> | null = null;
    if (supabaseOnlyRules.length > 0) {
      const supabaseOnlyKeys = Array.from(new Set(supabaseOnlyRules.flatMap((rule) => rule.invalidateKeys)));
      supabaseOnlyFallback = createRealtimeFallback({
        telemetryChannel: `${channelName}-supabase-only`,
        refresh: () => invalidate(supabaseOnlyKeys),
        onStatusChange: (status) => updateTransportStatus('supabase-only', status),
        fallbackIntervalMs,
      });
      supabaseOnlyChannel = supabase.channel(`${channelName}-supabase-only`);
      for (const rule of supabaseOnlyRules) {
        const filterOpts: any = {
          event: rule.event || '*',
          schema: rule.schema || 'public',
          table: rule.table,
        };
        if (rule.filter) filterOpts.filter = rule.filter;
        supabaseOnlyChannel = supabaseOnlyChannel.on('postgres_changes', filterOpts, () => {
          void invalidate(rule.invalidateKeys);
        });
      }
      supabaseOnlyChannel.subscribe((status, error) => supabaseOnlyFallback?.onStatus(status, error));
    }

    let hasuraGroup: ReturnType<typeof createHasuraFallbackGroup> | null = null;
    if (supportedRules.length > 0) {
      const supportedKeys = Array.from(new Set(supportedRules.flatMap((rule) => rule.invalidateKeys)));
      hasuraGroup = createHasuraFallbackGroup({
        onStatusChange: (status) => updateTransportStatus('hasura', status),
        onFallbackActivate: () => invalidate(supportedKeys),
        onBothUnavailable: () => invalidate(supportedKeys),
        degradedIntervalMs: fallbackIntervalMs,
      });
      supportedRules.forEach((rule, index) => {
        hasuraGroup?.subscribe(
          rule.hasuraQuery!,
          rule.hasuraVariables,
          () => { void invalidate(rule.invalidateKeys); },
          (error) => console.warn(`[RealtimeDataContext] Hasura subscription failed for ${rule.table}:`, error),
          {
            onFallbackActivate: () => invalidate(rule.invalidateKeys),
            onBothUnavailable: () => invalidate(rule.invalidateKeys),
            subscribeFallback: (onStatus) => {
              const filterOpts: any = {
                event: rule.event || '*',
                schema: rule.schema || 'public',
                table: rule.table,
              };
              if (rule.filter) filterOpts.filter = rule.filter;
              const channel = supabase
                .channel(`${channelName}-hasura-fallback-${index}`)
                .on('postgres_changes', filterOpts, () => { void invalidate(rule.invalidateKeys); })
                .subscribe(onStatus);
              return () => { void supabase.removeChannel(channel); };
            },
          },
        );
      });
    }
    if (supabaseOnlyRules.length === 0 && supportedRules.length === 0) handleStatusChange('live');

    return () => {
      if (invalidateTimerRef.current !== null) {
        window.clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
      hasuraGroup?.cleanup();
      supabaseOnlyFallback?.cleanup();
      if (supabaseOnlyChannel) void supabase.removeChannel(supabaseOnlyChannel);
    };
  }, [authReady, channelName, enabled, fallbackIntervalMs, handleStatusChange, invalidate, rules, supabaseToken]);

  const contextValue = useMemo<RealtimeDataContextValue>(() => ({
    getCache,
    setCache,
    executeFetch,
    registerFetcher,
    subscribeKey,
    invalidate,
    mutate,
    realtimeStatus,
  }), [getCache, setCache, executeFetch, registerFetcher, subscribeKey, invalidate, mutate, realtimeStatus]);

  return (
    <RealtimeDataContext.Provider value={contextValue}>
      {children}
    </RealtimeDataContext.Provider>
  );
};

/**
 * Hook to consume module data with SWR caching + Realtime event-driven updates.
 */
export function useRealtimeQuery<T = any>({
  key,
  fetcher,
  staleTime = 10_000,
  enabled = true,
  onSuccess,
  onError,
}: QueryOptions<T>) {
  const context = useContext(RealtimeDataContext);

  const initialEntry = context?.getCache<T>(key);
  const [data, setData] = useState<T | undefined>(initialEntry?.value);
  const [isLoading, setIsLoading] = useState<boolean>(!initialEntry && enabled);
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Register fetcher in provider for realtime invalidation
  useEffect(() => {
    if (!context || !enabled) return;
    return context.registerFetcher(key, () => fetcherRef.current());
  }, [context, key, enabled]);

  // Subscribe to cache mutations & invalidations
  useEffect(() => {
    if (!context) return;
    return context.subscribeKey(key, () => {
      const entry = context.getCache<T>(key);
      if (entry) {
        setData(entry.value);
        setIsLoading(false);
        setError(null);
      }
    });
  }, [context, key]);

  const runFetch = useCallback(async (force = false) => {
    if (!enabled) return;

    const entry = context?.getCache<T>(key);
    const hasData = entry !== undefined;
    const isStale = !entry || (Date.now() - entry.updatedAt > staleTime);

    if (!force && hasData && !isStale) {
      setData(entry.value);
      setIsLoading(false);
      return entry.value;
    }

    if (hasData) {
      setData(entry.value);
      setIsLoading(false);
      setIsRevalidating(true);
    } else {
      setIsLoading(true);
    }

    try {
      let result: T;
      if (context) {
        result = await context.executeFetch<T>(key, () => fetcherRef.current(), force);
      } else {
        result = await fetcherRef.current();
      }
      setData(result);
      setError(null);
      onSuccessRef.current?.(result);
      return result;
    } catch (err: any) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      onErrorRef.current?.(errorObj);
      throw errorObj;
    } finally {
      setIsLoading(false);
      setIsRevalidating(false);
    }
  }, [context, enabled, key, staleTime]);

  useEffect(() => {
    void runFetch();
  }, [runFetch]);

  const mutate = useCallback((
    dataOrUpdater: T | ((prev: T | undefined) => T),
    options?: { revalidate?: boolean },
  ) => {
    if (context) {
      return context.mutate<T>(key, dataOrUpdater, options);
    }
    const nextVal = typeof dataOrUpdater === 'function'
      ? (dataOrUpdater as (prev: T | undefined) => T)(data)
      : dataOrUpdater;
    setData(nextVal);
    return Promise.resolve();
  }, [context, data, key]);

  const invalidate = useCallback(() => {
    if (context) {
      return context.invalidate(key);
    }
    return runFetch(true);
  }, [context, key, runFetch]);

  return {
    data,
    isLoading,
    isRevalidating,
    error,
    refetch: () => runFetch(true),
    mutate,
    invalidate,
    realtimeStatus: context?.realtimeStatus ?? 'live',
  };
}
