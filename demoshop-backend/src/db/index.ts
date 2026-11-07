import { Pool, PoolConfig, QueryResult, QueryResultRow, types } from 'pg';
import dns from 'dns';
import { config } from '../config/env';
import logger from '../utils/general/logger';
import {
  recordDatabaseQuery,
  recordDatabaseRetry,
  type DatabasePoolName,
} from '../utils/metrics/database-metrics.util';
import { getDatabaseRequestEmail, getDatabaseRequestLabel } from '../utils/metrics/request-context.util';

const { runtime, database } = config;

// PostgreSQL DATE is a calendar value, not an instant. Returning it as a
// string prevents local midnight in Manila from serializing as the prior UTC day.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

// PostgreSQL TIMESTAMP without time zone (OID 1114) stores UTC values from CURRENT_TIMESTAMP/NOW().
// By default, pg parses OID 1114 as host local time, which shifts timestamps backwards
// on servers with positive UTC offsets (e.g. UTC+8 in Manila).
// Parsing as a UTC Date ensures the resulting Date object and its ISO serialization
// represent the canonical UTC instant.
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) => {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(iso.endsWith('Z') || /[+-]\d{2}(?::?\d{2})?$/.test(iso) ? iso : `${iso}Z`);
});

// Force IPv4 resolution (helps with 'localhost' vs '::1' issues).
dns.setDefaultResultOrder('ipv4first');

let poolConfig: PoolConfig;

const isTransientError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    /connection terminated/i.test(message) ||
    /timeout while waiting for message/i.test(message);
};

type QueryTarget = {
  query: (text: string, params?: any[]) => Promise<any>;
};

const classifyQuery = (text: string): string => {
  const operation = text.trim().match(/^(SELECT|INSERT|UPDATE|DELETE|WITH|ALTER|CREATE|DROP|TRUNCATE|BEGIN|COMMIT|ROLLBACK)\b/i)?.[1];
  return operation ? operation.toUpperCase() : 'OTHER';
};

const trackedQuery = async (
  target: QueryTarget,
  text: string,
  params: any[] | undefined,
  poolName: DatabasePoolName,
): Promise<QueryResult<any>> => {
  const startedAt = performance.now();
  let retried = false;
  let rowsReturned = 0;
  try {
    try {
      const result = await target.query(text, params);
      rowsReturned = Array.isArray(result?.rows) ? result.rows.length : 0;
      return result;
    } catch (err: unknown) {
      if (!isTransientError(err)) throw err;
      retried = true;
      recordDatabaseRetry(poolName);
      const result = await target.query(text, params);
      rowsReturned = Array.isArray(result?.rows) ? result.rows.length : 0;
      return result;
    }
  } finally {
    const durationMs = performance.now() - startedAt;
    recordDatabaseQuery(poolName, durationMs, 1_000, text, classifyQuery(text), rowsReturned, getDatabaseRequestLabel(), getDatabaseRequestEmail());
    if (!runtime.isTest && durationMs >= 1_000) {
      logger.warn('[Database] Slow query', {
        pool: poolName,
        operation: classifyQuery(text),
        duration_ms: Math.round(durationMs),
        retried,
      });
    }
  }
};

if (database.transactionConnectionString || database.connectionString) {
  const connStr = database.transactionConnectionString || database.connectionString!;
  poolConfig = {
    connectionString: connStr,
    ssl: database.isLocal ? false : { rejectUnauthorized: false },
    max: runtime.isProduction ? 20 : runtime.isTest ? 5 : 20,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: runtime.isTest ? 5000 : 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };
} else {
  poolConfig = {
    user: database.user,
    host: database.host,
    database: database.name,
    password: database.password,
    port: database.port,
    ssl: database.isLocal ? false : { rejectUnauthorized: false },
    max: runtime.isProduction ? 20 : runtime.isTest ? 5 : 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: runtime.isTest ? 5000 : 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };
}

const pool = new Pool(poolConfig);

// The session pool is currently used by queue advisory locks. Keep its
// connection deadline short: an unreachable Supabase direct endpoint must
// fall back promptly instead of adding the general 30-second pool timeout to
// every queue mutation.
const directConnectionTimeoutMillis = runtime.isTest ? 5000 : 1000;

const sessionPoolConfig: PoolConfig = database.sessionConnectionString
  ? {
      connectionString: database.sessionConnectionString,
      ssl: database.isLocal ? false : { rejectUnauthorized: false },
      max: runtime.isProduction ? 5 : 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: directConnectionTimeoutMillis,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    }
  : {
      ...poolConfig,
      max: runtime.isProduction ? 5 : 2,
      connectionTimeoutMillis: directConnectionTimeoutMillis,
    };

const directPool = new Pool(sessionPoolConfig);

if (!runtime.isTest) {
  logger.info('[Database] Pools configured', {
    connection_source: database.connectionSource,
    mode: database.connectionString ? 'connection_string' : 'discrete',
    is_local: database.isLocal,
  });
}

pool.on('error', (err) => {
  if (!runtime.isTest) logger.error('Unexpected error on primary idle client', err);
});

directPool.on('error', (err) => {
  if (!runtime.isTest) logger.error('Unexpected error on direct idle client', err);
});

const db = {
  query: async <R = any>(text: string, params?: any[]): Promise<QueryResult<any> & { rows: R[] }> =>
    trackedQuery(pool, text, params, 'primary') as Promise<QueryResult<any> & { rows: R[] }>,
  connect: async () => {
    try {
      return await pool.connect();
    } catch (err: unknown) {
      if (isTransientError(err)) {
        recordDatabaseRetry('primary');
        return await pool.connect();
      }
      throw err;
    }
  },
  pool,
  directQuery: async <R = any>(text: string, params?: any[]): Promise<QueryResult<any> & { rows: R[] }> =>
    trackedQuery(directPool, text, params, 'session') as Promise<QueryResult<any> & { rows: R[] }>,
  directConnect: async () => {
    try {
      return await directPool.connect();
    } catch (err: unknown) {
      if (isTransientError(err)) {
        recordDatabaseRetry('session');
        return await directPool.connect();
      }
      throw err;
    }
  },
  directPool,
  endPool: async () => {
    await Promise.all([pool.end(), directPool.end()]);
  },
};

export default db;
