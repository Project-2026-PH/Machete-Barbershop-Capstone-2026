import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

type Environment = 'development' | 'test' | 'production';

const readEnv = (name: string): string | undefined => {
  const value = process.env[name];
  return value?.trim() || undefined;
};

const isLocalUrl = (value: string | undefined): boolean => {
  if (!value) return false;

  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === 'db' ||
      hostname === 'host.docker.internal';
  } catch {
    return value.includes('localhost') || value.includes('127.0.0.1') || value.includes('@db:');
  }
};

const configuredNodeEnv = readEnv('NODE_ENV') || 'development';
const supportedEnvironments: Environment[] = ['development', 'test', 'production'];

if (!supportedEnvironments.includes(configuredNodeEnv as Environment)) {
  throw new Error(`NODE_ENV must be one of: ${supportedEnvironments.join(', ')}`);
}

const nodeEnv = configuredNodeEnv as Environment;
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const supabaseUrl = readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY') || readEnv('VITE_SUPABASE_ANON_KEY');
const databaseTransactionUrl = readEnv('DATABASE_TRANSACTION_URL');
const databaseUrl = readEnv('DATABASE_URL');
const databaseUrlSessionPool = readEnv('DATABASE_URL_SESSION_POOL');
const redisUrl = isTest
  ? (readEnv('REDIS_URL') || readEnv('UPSTASH_REDIS_URL') || readEnv('LAYERBASE_REDIS'))
  : (readEnv('UPSTASH_REDIS_URL') || readEnv('REDIS_URL') || readEnv('LAYERBASE_REDIS'));
const dbUser = readEnv('DB_USER');
const dbPassword = readEnv('DB_PASSWORD');
const dbName = readEnv('DB_NAME');
const dbHost = readEnv('DB_HOST') || 'localhost';
const configuredDbPort = readEnv('DB_PORT');
const dbPort = configuredDbPort ? Number(configuredDbPort) : isTest ? 5433 : 54322;
const configuredTrustProxyHops = readEnv('TRUST_PROXY_HOPS');
const trustProxyHops = configuredTrustProxyHops === undefined ? 0 : Number(configuredTrustProxyHops);

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  // GitLab staging frontend/backend.
  'https://portfolio.example.invalid',
  'https://portfolio.example.invalid',
  // Production frontend. The production backend is not a browser origin.
  'https://portfolio.example.invalid',
  // Production custom domains.
  'https://portfolio.example.invalid',
  'https://portfolio.example.invalid',
  'https://portfolio.example.invalid',
];

const validateOrigin = (value: string, name: string): string => {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) origin`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin === 'null' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash) {
    throw new Error(`${name} must contain only an HTTP(S) origin`);
  }

  return parsed.origin;
};

const configuredCorsOrigins = [
  readEnv('FRONTEND_LOCAL_URL'),
  readEnv('FRONTEND_VERCEL_URL'),
].filter((value): value is string => Boolean(value))
  .map((value, index) => validateOrigin(value, index === 0 ? 'FRONTEND_LOCAL_URL' : 'FRONTEND_VERCEL_URL'));

const allowedCorsOrigins = Object.freeze(
  [...new Set([...defaultCorsOrigins.map((origin) => validateOrigin(origin, 'default CORS origin')), ...configuredCorsOrigins])],
);

const configuredFrontendOrigin = readEnv('FRONTEND_ORIGIN');
const gcashMerchantName = readEnv('GCASH_MERCHANT_NAME') || 'DEMOSHOP';
const qzTrayCertificate = readEnv('QZ_CERTIFICATE');
const qzTrayPrivateKey = readEnv('QZ_PRIVATE_KEY');
const frontendOrigin = configuredFrontendOrigin
  ? validateOrigin(configuredFrontendOrigin, 'FRONTEND_ORIGIN')
  : isProduction
    // In production, prefer the first https:// origin (Vercel deployment).
    ? (allowedCorsOrigins.find((origin) => origin.startsWith('https://')) || allowedCorsOrigins[0])
    // In development/test, prefer localhost so the Google callback returns to
    // the local frontend instead of the production Vercel URL.
    : (allowedCorsOrigins.find((origin) => origin.startsWith('http://localhost')) || allowedCorsOrigins[0]);

if (!allowedCorsOrigins.includes(frontendOrigin)) {
  throw new Error('FRONTEND_ORIGIN must be one of the allowed CORS origins');
}

const missing: string[] = [];
if (isProduction && !configuredFrontendOrigin) {
  missing.push('FRONTEND_ORIGIN is required for hosted staging/production deployments');
}
if (!readEnv('JWT_SECRET')) missing.push('JWT_SECRET');
if (!supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL');
if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY');
if (!readEnv('SUPABASE_SERVICE_ROLE_KEY')) missing.push('SUPABASE_SERVICE_ROLE_KEY');

if (!databaseTransactionUrl && !databaseUrl && !databaseUrlSessionPool) {
  const missingDiscrete = [
    !dbUser ? 'DB_USER' : undefined,
    !dbPassword ? 'DB_PASSWORD' : undefined,
    !dbName ? 'DB_NAME' : undefined,
  ].filter((name): name is string => Boolean(name));

  if (missingDiscrete.length > 0) {
    missing.push(
      `database connection (provide DATABASE_TRANSACTION_URL, DATABASE_URL, DATABASE_URL_SESSION_POOL, or DB_USER/DB_PASSWORD/DB_NAME; missing ${missingDiscrete.join(', ')})`,
    );
  }
}

if (isProduction && !redisUrl) missing.push('UPSTASH_REDIS_URL, REDIS_URL, or LAYERBASE_REDIS');
if (isProduction && configuredTrustProxyHops === undefined) {
  missing.push('TRUST_PROXY_HOPS is required in production; set it to the exact trusted reverse-proxy hop count');
}
if (isProduction && !readEnv('GCASH_MERCHANT_NAME')) {
  missing.push('GCASH_MERCHANT_NAME');
}
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
  missing.push('TRUST_PROXY_HOPS must be an integer between 0 and 10');
}
if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  missing.push('DB_PORT must be an integer between 1 and 65535');
}

if (missing.length > 0) {
  throw new Error(`Missing required backend configuration for NODE_ENV=${nodeEnv}: ${missing.join('; ')}`);
}

const transactionConnectionString = databaseTransactionUrl || databaseUrl || databaseUrlSessionPool;
const sessionConnectionString = databaseUrlSessionPool || databaseUrl || databaseTransactionUrl;

const databaseConnectionSource = databaseTransactionUrl
  ? 'transaction_pool'
  : databaseUrl
    ? 'database_url'
    : databaseUrlSessionPool
      ? 'session_pool'
      : 'discrete';

const effectiveDatabaseIsLocal = transactionConnectionString
  ? isLocalUrl(transactionConnectionString)
  : ['localhost', '127.0.0.1', 'db', 'host.docker.internal'].includes(dbHost);

export const config = Object.freeze({
  runtime: Object.freeze({
    nodeEnv,
    isProduction,
    isTest,
    isVercel: readEnv('VERCEL') === '1' || Boolean(readEnv('VERCEL_ENV')),
    forceSecureCookie: readEnv('FORCE_SECURE_COOKIE') === 'true',
    port: Number(readEnv('PORT') || 5000),
    trustProxyHops,
  }),
  auth: Object.freeze({
    jwtSecret: readEnv('JWT_SECRET')!,
    supabaseJwtSecret: readEnv('SUPABASE_JWT_SECRET'),
  }),
  supabase: Object.freeze({
    url: supabaseUrl!,
    anonKey: supabaseAnonKey!,
    serviceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY')!,
  }),
  database: Object.freeze({
    connectionString: transactionConnectionString,
    transactionConnectionString,
    sessionConnectionString,
    connectionSource: databaseConnectionSource,
    user: dbUser,
    password: dbPassword,
    host: dbHost,
    name: dbName,
    port: dbPort,
    isLocal: effectiveDatabaseIsLocal,
  }),
  redis: Object.freeze({
    url: redisUrl || 'redis://localhost:6379',
  }),
  cors: Object.freeze({
    allowedOrigins: allowedCorsOrigins,
  }),
  frontendOrigin,
  gcash: Object.freeze({
    merchantName: gcashMerchantName,
    businessTimeZone: readEnv('GCASH_BUSINESS_TIMEZONE') || 'Asia/Manila',
    businessStartHour: Number(readEnv('GCASH_BUSINESS_START_HOUR') ?? 0),
    businessEndHour: Number(readEnv('GCASH_BUSINESS_END_HOUR') ?? 24),
  }),
  qzTray: Object.freeze({
    certificate: qzTrayCertificate,
    privateKey: qzTrayPrivateKey,
  }),
});

export type AppConfig = typeof config;
