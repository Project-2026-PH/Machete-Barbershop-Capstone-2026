import {
  isHasuraRealtimeEnabled,
  subscribeHasura,
  type HasuraRealtimeStatus,
} from './hasura-realtime.ts';
import type { RealtimeDisplayStatus } from './realtime-status.ts';

export type SupabaseFallbackStatusHandler = (status: string, error?: unknown) => void;
export type SupabaseFallbackSubscriber = (onStatus: SupabaseFallbackStatusHandler) => void | (() => void);

export interface HasuraFallbackStreamOptions {
  /** The Supabase channel matching this Hasura subscription. */
  subscribeFallback?: SupabaseFallbackSubscriber;
  onFallbackActivate?: () => void | Promise<void>;
  onBothUnavailable?: () => void | Promise<void>;
  degradedIntervalMs?: number;
  fallbackConnectionTimeoutMs?: number;
}

export interface HasuraFallbackGroupOptions extends HasuraFallbackStreamOptions {
  onStatusChange?: (status: RealtimeDisplayStatus) => void;
}

export interface HasuraFallbackGroupDependencies {
  isHasuraEnabled?: () => boolean;
  subscribeHasura?: typeof subscribeHasura;
}

export interface HasuraFallbackGroup {
  subscribe<T = any>(
    query: string,
    variables: Record<string, unknown> | undefined,
    onData: (data: T) => void,
    onError?: (error: unknown) => void,
    streamOptions?: HasuraFallbackStreamOptions,
  ): () => void;
  cleanup(): void;
}

interface ActiveSubscription {
  id: symbol;
  primaryStatus: HasuraRealtimeStatus;
  options: HasuraFallbackStreamOptions;
  cleanupPrimary?: () => void;
  fallbackActive: boolean;
  fallbackStatus: 'connecting' | 'live' | 'unavailable' | null;
  cleanupFallback?: () => void;
  fallbackConnectionTimer: ReturnType<typeof setTimeout> | null;
}

const logCallbackFailure = (label: string, error: unknown): void => {
  console.warn(`[HasuraRealtime] ${label} failed:`, error);
};

export const createHasuraFallbackGroup = (
  options: HasuraFallbackGroupOptions,
  dependencies: HasuraFallbackGroupDependencies = {},
): HasuraFallbackGroup => {
  const hasuraEnabled = (dependencies.isHasuraEnabled ?? isHasuraRealtimeEnabled)();
  const subscribePrimary = dependencies.subscribeHasura ?? subscribeHasura;
  const subscriptions = new Map<symbol, ActiveSubscription>();
  let degradedTimer: ReturnType<typeof setInterval> | null = null;
  let activationTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingActivationCallbacks = new Set<NonNullable<HasuraFallbackStreamOptions['onFallbackActivate']>>();
  let stopped = false;
  let lastReportedStatus: RealtimeDisplayStatus | null = null;

  const resolveStreamOptions = (streamOptions?: HasuraFallbackStreamOptions): HasuraFallbackStreamOptions => ({
    subscribeFallback: streamOptions?.subscribeFallback ?? options.subscribeFallback,
    onFallbackActivate: streamOptions?.onFallbackActivate ?? options.onFallbackActivate,
    onBothUnavailable: streamOptions?.onBothUnavailable ?? options.onBothUnavailable,
    degradedIntervalMs: streamOptions?.degradedIntervalMs ?? options.degradedIntervalMs,
    fallbackConnectionTimeoutMs: streamOptions?.fallbackConnectionTimeoutMs ?? options.fallbackConnectionTimeoutMs,
  });

  const unavailableSubscriptions = (): ActiveSubscription[] => Array.from(subscriptions.values()).filter(
    (subscription) => subscription.fallbackActive && subscription.fallbackStatus === 'unavailable',
  );

  const scheduleFallbackActivation = (callback?: HasuraFallbackStreamOptions['onFallbackActivate']): void => {
    if (!callback) return;
    pendingActivationCallbacks.add(callback);
    if (activationTimer !== null) return;
    activationTimer = setTimeout(() => {
      activationTimer = null;
      const callbacks = Array.from(pendingActivationCallbacks);
      pendingActivationCallbacks.clear();
      for (const activation of callbacks) {
        const hasActiveFallback = Array.from(subscriptions.values()).some((subscription) => (
          subscription.fallbackActive && subscription.options.onFallbackActivate === activation
        ));
        if (!hasActiveFallback) continue;
        void Promise.resolve().then(activation).catch((error) => logCallbackFailure('Fallback activation refresh', error));
      }
    }, 50);
  };

  const invokeDegradedRefreshes = (): void => {
    const callbacks = new Set(unavailableSubscriptions()
      .map((subscription) => subscription.options.onBothUnavailable)
      .filter((callback): callback is NonNullable<typeof callback> => Boolean(callback)));
    for (const callback of callbacks) {
      void Promise.resolve().then(callback).catch((error) => logCallbackFailure('Degraded refresh', error));
    }
  };

  const updateDegradedTimer = (): void => {
    const unavailable = unavailableSubscriptions();
    if (unavailable.length === 0) {
      if (degradedTimer !== null) {
        clearInterval(degradedTimer);
        degradedTimer = null;
      }
      return;
    }
    if (degradedTimer !== null) return;
    const intervalMs = Math.min(...unavailable.map((subscription) => subscription.options.degradedIntervalMs ?? 60_000));
    degradedTimer = setInterval(() => {
      if (stopped || typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      invokeDegradedRefreshes();
    }, intervalMs);
  };

  const reportStatus = (): void => {
    if (stopped || subscriptions.size === 0) return;
    const streams = Array.from(subscriptions.values());
    const allPrimaryLive = streams.every((subscription) => subscription.primaryStatus === 'live');
    const anyUnavailable = streams.some((subscription) => (
      subscription.primaryStatus === 'unavailable' && subscription.fallbackStatus === 'unavailable'
    ));
    const anyFallbackLive = streams.some((subscription) => subscription.fallbackStatus === 'live');
    const allRouted = streams.every((subscription) => (
      subscription.primaryStatus === 'live' || subscription.fallbackStatus === 'live'
    ));

    const status: RealtimeDisplayStatus = allPrimaryLive
      ? 'live'
      : anyUnavailable
        ? 'unavailable'
        : allRouted
          ? 'fallback'
          : 'connecting';
    if (status === lastReportedStatus) return;
    lastReportedStatus = status;
    options.onStatusChange?.(status);
  };

  const clearFallbackConnectionTimer = (subscription: ActiveSubscription): void => {
    if (subscription.fallbackConnectionTimer !== null) {
      clearTimeout(subscription.fallbackConnectionTimer);
      subscription.fallbackConnectionTimer = null;
    }
  };

  const stopFallback = (subscription: ActiveSubscription): void => {
    if (!subscription.fallbackActive) return;
    subscription.fallbackActive = false;
    subscription.fallbackStatus = null;
    clearFallbackConnectionTimer(subscription);
    const cleanup = subscription.cleanupFallback;
    subscription.cleanupFallback = undefined;
    try {
      cleanup?.();
    } catch (error) {
      logCallbackFailure('Supabase fallback cleanup', error);
    }
    updateDegradedTimer();
  };

  const markFallbackUnavailable = (subscription: ActiveSubscription): void => {
    if (stopped || !subscription.fallbackActive || subscription.fallbackStatus === 'unavailable') return;
    clearFallbackConnectionTimer(subscription);
    subscription.fallbackStatus = 'unavailable';
    reportStatus();
    updateDegradedTimer();
    invokeDegradedRefreshes();
  };

  const handleFallbackStatus = (subscription: ActiveSubscription, status: string, error?: unknown): void => {
    if (stopped || !subscription.fallbackActive) return;
    if (status === 'SUBSCRIBED' && !error) {
      clearFallbackConnectionTimer(subscription);
      subscription.fallbackStatus = 'live';
      reportStatus();
      updateDegradedTimer();
      return;
    }

    if (error || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      markFallbackUnavailable(subscription);
    }
  };

  const startFallback = (subscription: ActiveSubscription): void => {
    if (stopped || subscription.fallbackActive) return;
    subscription.fallbackActive = true;
    subscription.fallbackStatus = 'connecting';
    scheduleFallbackActivation(subscription.options.onFallbackActivate);
    reportStatus();

    const timeoutMs = subscription.options.fallbackConnectionTimeoutMs ?? 12_000;
    subscription.fallbackConnectionTimer = setTimeout(() => markFallbackUnavailable(subscription), timeoutMs);
    const subscribeFallback = subscription.options.subscribeFallback;
    if (!subscribeFallback) {
      markFallbackUnavailable(subscription);
      return;
    }

    try {
      const cleanup = subscribeFallback((status, error) => handleFallbackStatus(subscription, status, error));
      if (subscription.fallbackActive) subscription.cleanupFallback = cleanup ?? undefined;
      else cleanup?.();
    } catch (error) {
      logCallbackFailure('Could not start Supabase fallback', error);
      markFallbackUnavailable(subscription);
    }
  };

  const updatePrimaryStatus = (subscription: ActiveSubscription, status: HasuraRealtimeStatus): void => {
    if (stopped || subscriptions.get(subscription.id) !== subscription) return;
    subscription.primaryStatus = status;
    if (status === 'live') stopFallback(subscription);
    else if (status === 'unavailable') startFallback(subscription);
    reportStatus();
  };

  const subscribe = <T,>(
    query: string,
    variables: Record<string, unknown> | undefined,
    onData: (data: T) => void,
    onError?: (error: unknown) => void,
    streamOptions?: HasuraFallbackStreamOptions,
  ): (() => void) => {
    if (stopped) return () => {};

    const subscription: ActiveSubscription = {
      id: Symbol('hasura-subscription'),
      primaryStatus: hasuraEnabled ? 'connecting' : 'unavailable',
      options: resolveStreamOptions(streamOptions),
      fallbackActive: false,
      fallbackStatus: null,
      fallbackConnectionTimer: null,
    };
    const id = subscription.id;
    subscriptions.set(id, subscription);
    reportStatus();

    if (hasuraEnabled) {
      try {
        subscription.cleanupPrimary = subscribePrimary<T>(
          query,
          variables,
          onData,
          onError,
          (status) => updatePrimaryStatus(subscription, status),
        );
      } catch (error) {
        try {
          onError?.(error);
        } catch (callbackError) {
          logCallbackFailure('Hasura error callback', callbackError);
        }
        updatePrimaryStatus(subscription, 'unavailable');
      }
    } else {
      startFallback(subscription);
    }

    return () => {
      const current = subscriptions.get(id);
      if (!current) return;
      subscriptions.delete(id);
      stopFallback(current);
      try {
        current.cleanupPrimary?.();
      } catch (error) {
        logCallbackFailure('Hasura subscription cleanup', error);
      }
      lastReportedStatus = null;
      reportStatus();
      if (subscriptions.size === 0) options.onStatusChange?.('connecting');
    };
  };

  const cleanup = (): void => {
    if (stopped) return;
    stopped = true;
    if (activationTimer !== null) {
      clearTimeout(activationTimer);
      activationTimer = null;
    }
    pendingActivationCallbacks.clear();
    if (degradedTimer !== null) {
      clearInterval(degradedTimer);
      degradedTimer = null;
    }
    for (const subscription of subscriptions.values()) {
      stopFallback(subscription);
      try {
        subscription.cleanupPrimary?.();
      } catch (error) {
        logCallbackFailure('Hasura subscription cleanup', error);
      }
    }
    subscriptions.clear();
  };

  return { subscribe, cleanup };
};
