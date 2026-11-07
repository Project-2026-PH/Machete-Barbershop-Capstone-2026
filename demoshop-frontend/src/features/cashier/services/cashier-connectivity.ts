export type CashierConnectivityStatus = 'checking' | 'online' | 'offline';

const retryDelaysMs = [2_000, 5_000, 10_000, 20_000, 30_000];
const listeners = new Set<(status: CashierConnectivityStatus) => void>();
let status: CashierConnectivityStatus = 'checking';
let monitorRunning = false;
let probeInFlight = false;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const setStatus = (next: CashierConnectivityStatus): void => {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener(status));
};

const apiHealthUrl = (): string => {
  const configuredApiUrl = import.meta.env?.VITE_API_URL || window.location.origin;
  const apiOrigin = configuredApiUrl.replace(/\/api\/?$/, '');
  return new URL('/api/health/live', apiOrigin).toString();
};

const scheduleProbe = (delayMs: number): void => {
  if (!monitorRunning || retryTimer !== null) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void probeHealth();
  }, delayMs);
};

const probeHealth = async (): Promise<void> => {
  if (!monitorRunning || probeInFlight) return;
  probeInFlight = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(apiHealthUrl(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Health probe returned ${response.status}`);
    const payload = await response.json() as { status?: string };
    if (payload.status !== 'OK') throw new Error('Health probe returned an unexpected status');

    retryCount = 0;
    setStatus('online');
  } catch {
    setStatus('offline');
    const delay = retryDelaysMs[Math.min(retryCount, retryDelaysMs.length - 1)];
    retryCount += 1;
    scheduleProbe(delay);
  } finally {
    clearTimeout(timeout);
    probeInFlight = false;
  }
};

export const getCashierConnectivityStatus = (): CashierConnectivityStatus => status;

export const subscribeToCashierConnectivity = (
  listener: (next: CashierConnectivityStatus) => void,
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** A failed API request marks the terminal offline; only a health probe restores Online. */
export const markCashierApiFailure = (): void => {
  setStatus('offline');
  const delay = retryDelaysMs[Math.min(retryCount, retryDelaysMs.length - 1)];
  scheduleProbe(delay);
};

export const isCashierConnectivityFailure = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    isAxiosError?: boolean;
    code?: string;
    response?: { status?: number; data?: { isNetworkError?: boolean } };
  };
  const response = candidate.response;
  if (response) {
    return Number(response.status) >= 500 || response.data?.isNetworkError === true;
  }
  return candidate.isAxiosError === true || [
    'ERR_NETWORK',
    'ECONNABORTED',
    'ETIMEDOUT',
    'ECONNRESET',
  ].includes(String(candidate.code || ''));
};

export const startCashierConnectivityMonitor = (): (() => void) => {
  if (monitorRunning) return () => undefined;
  monitorRunning = true;

  const handleOnlineHint = (): void => {
    if (navigator.onLine === false) return;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    scheduleProbe(0);
  };
  const handleOfflineHint = (): void => {
    setStatus('offline');
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  };
  window.addEventListener('online', handleOnlineHint);
  window.addEventListener('offline', handleOfflineHint);
  if (navigator.onLine === false) setStatus('offline');
  if (navigator.onLine !== false) scheduleProbe(0);

  return () => {
    monitorRunning = false;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    window.removeEventListener('online', handleOnlineHint);
    window.removeEventListener('offline', handleOfflineHint);
  };
};
