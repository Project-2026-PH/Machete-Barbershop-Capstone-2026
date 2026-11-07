import { metricsRepository } from '../repositories/metrics.repository';
import logger from '../utils/general/logger';
import { 
  setupProcessListeners, 
  canRunBackgroundMonitoring 
} from '../utils/metrics/metrics-config.util';
import { getMinuteBucket } from '../utils/metrics/metrics-logic.util';
import { consumeDatabaseMetrics, type DatabaseMetricsSnapshot } from '../utils/metrics/database-metrics.util';

/**
 * Service for collecting and flushing system metrics.
 * Follows the Coordinator Pattern: orchestrates technical infrastructure 
 * (process listeners), business logic (time-bucketing), and repository storage.
 */
export class MetricsService {
  private requestCount: number = 0;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    setupProcessListeners(() => this.flushMetrics());
  }

  /**
   * Increments the in-memory request counter.
   */
  public incrementRequestCount(): void {
    this.requestCount++;
  }

  public consumeDatabaseMetrics(): DatabaseMetricsSnapshot {
    return consumeDatabaseMetrics();
  }

  /**
   * Flushes accumulated metrics to the database.
   * Orchestrates reset and storage using specialized logic workers.
   */
  public async flushMetrics(): Promise<void> {
    const databaseMetrics = this.consumeDatabaseMetrics();
    if (this.requestCount === 0 && databaseMetrics.queryCount === 0) return;

    const countToSave = this.requestCount;
    this.requestCount = 0; // Reset immediately to prevent double-counting during async op

    if (databaseMetrics.queryCount > 0) {
      logger.info('[MetricsService] Database query metrics', databaseMetrics);
    }

    if (countToSave > 0) {
      const nowBucket = getMinuteBucket(new Date());
      try {
        await metricsRepository.saveRequestCount(nowBucket, countToSave);
      } catch (err: any) {
        logger.error('[MetricsService] Failed to flush metrics:', err);
      }
    }
  }

  /**
   * Starts the background monitoring interval.
   * Monitoring enablement logic is managed by the config utility.
   */
  public startMonitoring(): void {
    if (canRunBackgroundMonitoring()) {
      if (!this.flushInterval) {
        this.flushInterval = setInterval(() => this.flushMetrics(), 60000);
        logger.info('Metrics monitoring started (1-minute interval).');
      }
    }
  }

  /**
   * Stops the background monitoring interval.
   */
  public stopMonitoring(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
      logger.info('Metrics monitoring stopped.');
    }
  }
}

// Export singleton instance
export const metricsService = new MetricsService();

// Named exports for backward compatibility with app.ts
export const incrementRequestCount = metricsService.incrementRequestCount.bind(metricsService);
export const startMonitoring = metricsService.startMonitoring.bind(metricsService);
export const stopMonitoring = metricsService.stopMonitoring.bind(metricsService);

export default metricsService;
