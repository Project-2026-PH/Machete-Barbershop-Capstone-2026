import { telemetryManager } from './adaptive-polling';
import type { RealtimeDisplayStatus } from './realtime-status';

export type { RealtimeDisplayStatus } from './realtime-status';

type RealtimeError = Error | Record<string, unknown> | string | null | undefined;

interface RealtimeFallbackOptions {
  telemetryChannel: string;
  refresh: () => Promise<void>;
  onStatusChange?: (status: RealtimeDisplayStatus) => void;
  fallbackIntervalMs?: number;
  connectionTimeoutMs?: number;
}

export interface RealtimeFallbackController {
  onStatus: (status: string, error?: RealtimeError) => void;
  cleanup: () => void;
}

const getErrorDetails = (error: RealtimeError): Record<string, unknown> => {
  if (!error) return {};
  if (error instanceof Error) return { errorMessage: error.message };
  if (typeof error === 'string') return { errorMessage: error.slice(0, 300) };

  const details = error as Record<string, unknown>;
  const code = details.code ?? details.statusCode ?? details.status ?? details.closeCode;
  const message = details.message ?? details.reason;
  return {
    ...(code !== undefined ? { errorCode: String(code).slice(0, 80) } : {}),
    ...(message !== undefined ? { errorMessage: String(message).slice(0, 300) } : {}),
  };
};

export const reportRealtimeStatus = (
  telemetryChannel: string,
  status: string,
  error?: RealtimeError,
): void => {
  if (status === 'SUBSCRIBED' && !error) {
    return;
  }

  const details = getErrorDetails(error);
  const data = { channel: telemetryChannel, status, ...details };
  telemetryManager.logEvent('supabase_realtime_status', data);
  console.warn('[Supabase Realtime] Subscription issue', data);
};

export const createRealtimeFallback = ({
  telemetryChannel,
  refresh,
  onStatusChange,
  fallbackIntervalMs = 60_000,
  connectionTimeoutMs = 12_000,
}: RealtimeFallbackOptions): RealtimeFallbackController => {
  let fallbackTimer: number | null = null;
  let connectionTimer: number | null = window.setTimeout(() => {
    startFallback('connection_timeout');
  }, connectionTimeoutMs);
  let stopped = false;
  let fallbackActive = false;
  let refreshInFlight: Promise<void> | null = null;

  const refreshSafely = (): void => {
    if (
      stopped ||
      document.visibilityState !== 'visible' ||
      navigator.onLine === false ||
      refreshInFlight
    ) {
      return;
    }

    refreshInFlight = refresh()
      .catch((error: unknown) => {
        const details = getErrorDetails(error as RealtimeError);
        telemetryManager.logEvent('supabase_realtime_fallback_refresh_error', {
          channel: telemetryChannel,
          ...details,
        });
        console.warn('[Supabase Realtime] Polling fallback refresh failed', {
          channel: telemetryChannel,
          ...details,
        });
      })
      .finally(() => {
        refreshInFlight = null;
      });
  };

  function startFallback(reason: string): void {
    if (stopped || fallbackActive) return;
    fallbackActive = true;
    onStatusChange?.('fallback');
    telemetryManager.logEvent('supabase_realtime_fallback_started', {
      channel: telemetryChannel,
      reason,
    });
    console.warn('[Supabase Realtime] Realtime unavailable; using polling fallback.', {
      channel: telemetryChannel,
      reason,
    });
    refreshSafely();
    fallbackTimer = window.setInterval(refreshSafely, fallbackIntervalMs);
  }

  function stopFallback(): void {
    if (fallbackTimer !== null) {
      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
    if (fallbackActive) {
      telemetryManager.logEvent('supabase_realtime_fallback_recovered', { channel: telemetryChannel });
    }
    fallbackActive = false;
  }

  const onStatus = (status: string, error?: RealtimeError): void => {
    if (stopped) return;
    reportRealtimeStatus(telemetryChannel, status, error);

    if (status === 'SUBSCRIBED') {
      if (connectionTimer !== null) {
        window.clearTimeout(connectionTimer);
        connectionTimer = null;
      }
      stopFallback();
      onStatusChange?.('live');
      return;
    }

    if (error || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      if (connectionTimer !== null) {
        window.clearTimeout(connectionTimer);
        connectionTimer = null;
      }
      startFallback(status);
    }
  };

  return {
    onStatus,
    cleanup: () => {
      stopped = true;
      if (connectionTimer !== null) window.clearTimeout(connectionTimer);
      if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
      fallbackActive = false;
    },
  };
};
