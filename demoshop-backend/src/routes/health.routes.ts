import express, { Request, Response } from 'express';
import db from '../db/index';
import redisClient, { getRedisCacheStats } from '../redis';
import logger from '../utils/general/logger';

const router = express.Router();

// Connectivity probe for cashier terminals. Keep this response independent of
// database, cache, and third-party checks so offline detection stays cheap.
router.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'OK' });
});

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  let isDbConnected = false;
  let dbResponseTimeMs: number | null = null;

  try {
    const dbStart = performance.now();
    await db.query('SELECT NOW()');
    dbResponseTimeMs = Math.round(performance.now() - dbStart);
    isDbConnected = true;
  } catch (dbError) {
    logger.error('Health check database query failed', {
      errorType: dbError instanceof Error ? dbError.name : 'UnknownError',
    });
  }

  // In-memory status check (0 Upstash commands / 0 read-write cost)
  const isRedisReady = redisClient.isReady;

  const services = {
    database: isDbConnected ? 'connected' : 'unavailable',
    redis: isRedisReady ? 'ready' : (redisClient.isOpen ? 'connecting' : 'disconnected'),
  };

  const performanceMetrics = {
    databaseResponseTimeMs: isDbConnected ? dbResponseTimeMs : null,
  };
  const cacheMetrics = getRedisCacheStats();

  if (!isDbConnected) {
    res.status(503).json({
      status: 'DEGRADED',
      services,
      performance: performanceMetrics,
      cache: { redis: cacheMetrics },
    });
    return;
  }

  res.status(200).json({
    status: 'OK',
    services,
    performance: performanceMetrics,
    cache: { redis: cacheMetrics },
  });
});

/**
 * GET /api/health/keep-alive
 * Lightweight keep-alive designed for periodic crons (e.g. daily).
 * - 0 DB queries (0 DB connection pool & data transfer cost)
 * - 0 Redis commands (in-memory state check only)
 * - Fires lightweight query to Hasura GraphQL endpoint if configured, resetting hibernation timer.
 */
router.get('/keep-alive', async (_req: Request, res: Response): Promise<void> => {
  const hasuraUrl = process.env.HASURA_GRAPHQL_URL || process.env.VITE_HASURA_GRAPHQL_URL;
  const adminSecret = process.env.HASURA_ADMIN_SECRET;

  let hasuraStatus: 'not_configured' | 'ok' | 'error' = 'not_configured';
  let hasuraResponseTimeMs: number | null = null;

  if (hasuraUrl) {
    try {
      const start = performance.now();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (adminSecret) {
        headers['x-hasura-admin-secret'] = adminSecret;
      }

      const response = await fetch(hasuraUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: '{ __typename }' }),
        signal: AbortSignal.timeout(5000),
      });

      hasuraResponseTimeMs = Math.round(performance.now() - start);
      hasuraStatus = response.ok ? 'ok' : 'error';
    } catch {
      hasuraStatus = 'error';
    }
  }

  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    services: {
      hasura: hasuraStatus,
      redis: redisClient.isReady ? 'ready' : (redisClient.isOpen ? 'connecting' : 'disconnected'),
    },
    performance: {
      hasuraResponseTimeMs,
    },
  });
});

export default router;
