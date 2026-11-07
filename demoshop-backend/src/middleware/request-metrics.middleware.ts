import { Request, Response, NextFunction } from 'express';
import logger from '../utils/general/logger';
import { incrementRequestCount, startMonitoring } from '../services/metrics.service';
import { getDatabaseRequestEmail, getDatabaseRequestLabel, runWithRequestContext } from '../utils/metrics/request-context.util';
import { recordDatabaseHttpRequest } from '../utils/metrics/database-metrics.util';

export const requestMetricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  incrementRequestCount();
  const startedAt = performance.now();

  res.on('finish', () => {
    const durationMs = performance.now() - startedAt;
    recordDatabaseHttpRequest(getDatabaseRequestLabel(req), getDatabaseRequestEmail(req));
    if (durationMs >= 1_000) {
      logger.warn('[HTTP] Slow request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Math.round(durationMs),
      });
    }
  });

  runWithRequestContext(req, next);
};

export const startRequestMetrics = (): void => {
  startMonitoring();
};
