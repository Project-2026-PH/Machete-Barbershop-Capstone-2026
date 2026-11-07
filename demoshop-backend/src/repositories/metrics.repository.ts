import db from '../db';

/**
 * Repository for handling system metrics database operations.
 */
export class MetricsRepository {
  
  /**
   * Inserts or updates a metrics bucket record.
   */
  async saveRequestCount(bucketTime: Date, requestCount: number): Promise<void> {
    await db.query(
      `INSERT INTO system_metrics (bucket_time, request_count) VALUES ($1, $2)`,
      [bucketTime, requestCount]
    );
  }
}

export const metricsRepository = new MetricsRepository();
