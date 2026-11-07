import { telemetryManager } from '@/utils/adaptive-polling';
import { cachedRequest, invalidateRequests } from '@/utils/request-cache';

export const cachedCashierRequest = <T>(key: string, request: () => Promise<T>, ttlMs: number): Promise<T> =>
  cachedRequest(key, request, ttlMs, ({ outcome, durationMs }) => {
    // Cache keys may contain search text or identifiers. Emit only the stable
    // domain prefix so performance telemetry cannot expose user-entered data.
    const [domainRoot, domainSection] = key.split(':', 2);
    const domain = ['catalog', 'inventory', 'queue', 'report'].includes(domainRoot)
      ? `${domainRoot}:${domainSection || 'default'}`
      : domainRoot;
    telemetryManager.logEvent('cashier_request_cache', {
      domain,
      outcome,
      ...(durationMs !== undefined ? { durationMs } : {}),
      ttlMs,
    });
  });

export const invalidateCashierRequests = invalidateRequests;
