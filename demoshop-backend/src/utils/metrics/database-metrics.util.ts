export type DatabasePoolName = 'primary' | 'session';

export interface DatabaseQueryMetric {
  route: string;
  userEmail: string | null;
  signature: string;
  operation: string;
  queryCount: number;
  rowsReturned: number;
  slowQueryCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

export interface DatabaseRouteMetric {
  route: string;
  userEmail: string | null;
  requestCount: number;
  queryCount: number;
  rowsReturned: number;
  slowQueryCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

export interface DatabaseMetricsSnapshot {
  queryCount: number;
  rowsReturned: number;
  slowQueryCount: number;
  retryCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  byPool: Record<DatabasePoolName, {
    queryCount: number;
    rowsReturned: number;
    slowQueryCount: number;
    retryCount: number;
    totalDurationMs: number;
    maxDurationMs: number;
  }>;
  topQueries: DatabaseQueryMetric[];
  topRoutes: DatabaseRouteMetric[];
}

type MutableQueryMetric = DatabaseQueryMetric;

const emptyPoolMetrics = () => ({
  queryCount: 0,
  rowsReturned: 0,
  slowQueryCount: 0,
  retryCount: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
});

const counters: DatabaseMetricsSnapshot = {
  queryCount: 0,
  rowsReturned: 0,
  slowQueryCount: 0,
  retryCount: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  byPool: {
    primary: emptyPoolMetrics(),
    session: emptyPoolMetrics(),
  },
  topQueries: [],
  topRoutes: [],
};

const queryMetrics = new Map<string, MutableQueryMetric>();
const routeMetrics = new Map<string, DatabaseRouteMetric>();
const MAX_QUERY_SIGNATURES = 200;

/**
 * Keeps SQL telemetry safe to expose: parameters are not present in the query
 * text passed by pg, and literals in migration/maintenance SQL are redacted.
 */
const normalizeQuery = (queryText: string): string => queryText
  .replace(/'[^']*'/g, '?')
  .replace(/\b\d+(?:\.\d+)?\b/g, '?')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 240);

const recordQueryShape = (
  queryText: string,
  durationMs: number,
  slowThresholdMs: number,
  operation: string,
  rowsReturned: number,
  route: string,
  userEmail: string | null,
): void => {
  const signature = normalizeQuery(queryText);
  const key = `${route}\n${userEmail || ''}\n${signature}`;
  const current = queryMetrics.get(key);
  if (current) {
    current.queryCount += 1;
    current.rowsReturned += rowsReturned;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    if (durationMs >= slowThresholdMs) current.slowQueryCount += 1;
    return;
  }

  if (queryMetrics.size >= MAX_QUERY_SIGNATURES) {
    const leastUseful = [...queryMetrics.entries()].sort((a, b) => a[1].queryCount - b[1].queryCount)[0];
    if (leastUseful) queryMetrics.delete(leastUseful[0]);
  }

  queryMetrics.set(key, {
    route,
    userEmail,
    signature,
    operation,
    queryCount: 1,
    rowsReturned,
    slowQueryCount: durationMs >= slowThresholdMs ? 1 : 0,
    totalDurationMs: durationMs,
    maxDurationMs: durationMs,
  });
};

const getTopQueries = (): DatabaseQueryMetric[] => [...queryMetrics.values()]
  .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
  .slice(0, 20)
  .map((metric) => ({ ...metric }));

const recordRouteShape = (route: string, userEmail: string | null, durationMs: number, rowsReturned: number, slowThresholdMs: number): void => {
  const key = `${route}\n${userEmail || ''}`;
  const current = routeMetrics.get(key);
  if (current) {
    current.queryCount += 1;
    current.rowsReturned += rowsReturned;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    if (durationMs >= slowThresholdMs) current.slowQueryCount += 1;
    return;
  }

  if (routeMetrics.size >= 100) {
    const leastExpensive = [...routeMetrics.values()].sort((a, b) => a.totalDurationMs - b.totalDurationMs)[0];
    if (leastExpensive) routeMetrics.delete(`${leastExpensive.route}\n${leastExpensive.userEmail || ''}`);
  }

  routeMetrics.set(key, {
    route,
    userEmail,
    requestCount: 0,
    queryCount: 1,
    rowsReturned,
    slowQueryCount: durationMs >= slowThresholdMs ? 1 : 0,
    totalDurationMs: durationMs,
    maxDurationMs: durationMs,
  });
};

export const recordDatabaseHttpRequest = (route: string, userEmail: string | null): void => {
  const key = `${route}\n${userEmail || ''}`;
  const current = routeMetrics.get(key);
  if (current) {
    current.requestCount += 1;
    return;
  }

  if (routeMetrics.size >= 100) {
    const leastExpensive = [...routeMetrics.values()].sort((a, b) => a.totalDurationMs - b.totalDurationMs)[0];
    if (leastExpensive) routeMetrics.delete(`${leastExpensive.route}\n${leastExpensive.userEmail || ''}`);
  }

  routeMetrics.set(route, {
    route,
    userEmail,
    requestCount: 1,
    queryCount: 0,
    rowsReturned: 0,
    slowQueryCount: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  });
};

const getTopRoutes = (): DatabaseRouteMetric[] => [...routeMetrics.values()]
  .filter((metric) => metric.queryCount > 0)
  .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
  .slice(0, 50)
  .map((metric) => ({ ...metric }));

export const recordDatabaseQuery = (
  pool: DatabasePoolName,
  durationMs: number,
  slowThresholdMs = 1_000,
  queryText = 'unknown',
  operation = 'OTHER',
  rowsReturned = 0,
  route = 'background / no HTTP request',
  userEmail: string | null = null,
): void => {
  counters.queryCount += 1;
  counters.rowsReturned += rowsReturned;
  counters.byPool[pool].queryCount += 1;
  counters.byPool[pool].rowsReturned += rowsReturned;
  counters.totalDurationMs += durationMs;
  counters.byPool[pool].totalDurationMs += durationMs;
  counters.maxDurationMs = Math.max(counters.maxDurationMs, durationMs);
  counters.byPool[pool].maxDurationMs = Math.max(counters.byPool[pool].maxDurationMs, durationMs);
  if (durationMs >= slowThresholdMs) {
    counters.slowQueryCount += 1;
    counters.byPool[pool].slowQueryCount += 1;
  }
  recordQueryShape(queryText, durationMs, slowThresholdMs, operation, rowsReturned, route, userEmail);
  recordRouteShape(route, userEmail, durationMs, rowsReturned, slowThresholdMs);
};

export const recordDatabaseRetry = (pool: DatabasePoolName): void => {
  counters.retryCount += 1;
  counters.byPool[pool].retryCount += 1;
};

const snapshot = (): DatabaseMetricsSnapshot => ({
  queryCount: counters.queryCount,
  rowsReturned: counters.rowsReturned,
  slowQueryCount: counters.slowQueryCount,
  retryCount: counters.retryCount,
  totalDurationMs: counters.totalDurationMs,
  maxDurationMs: counters.maxDurationMs,
  byPool: {
    primary: { ...counters.byPool.primary },
    session: { ...counters.byPool.session },
  },
  topQueries: getTopQueries(),
  topRoutes: getTopRoutes(),
});

/** Reads current process-local counters without resetting them. */
export const peekDatabaseMetrics = (): DatabaseMetricsSnapshot => snapshot();

export const consumeDatabaseMetrics = (): DatabaseMetricsSnapshot => {
  const result = snapshot();
  counters.queryCount = 0;
  counters.rowsReturned = 0;
  counters.slowQueryCount = 0;
  counters.retryCount = 0;
  counters.totalDurationMs = 0;
  counters.maxDurationMs = 0;
  counters.byPool.primary = emptyPoolMetrics();
  counters.byPool.session = emptyPoolMetrics();
  queryMetrics.clear();
  routeMetrics.clear();
  return result;
};
