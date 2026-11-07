import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import winston from 'winston';
import { config } from '../../config/env';

const { isProduction, isTest, isVercel } = config.runtime;
const configuredLevel = process.env.LOG_LEVEL?.toLowerCase();
const logLevel = configuredLevel || 'info';
const logDirectory = resolve(process.env.LOG_DIR || join(process.cwd(), 'logs'));
const logFile = resolve(process.env.LOG_FILE || join(logDirectory, 'combined.log'));
const legacyErrorFile = join(dirname(logFile), 'error.log');
const sensitiveKeyPattern = /authorization|cookie|token|password|passwd|passphrase|secret|api[-_]?key|connection[-_]?string|private[-_]?key|hash|otp|one[-_ ]?time|verification|reset[-_]?code|payment|card|cvv|cvc|pin|ssn|email|phone|mobile|customer|name|username|first[-_]?name|last[-_]?name|full[-_]?name|address|street|city|postal|zip|birth|dob|user[-_]?agent|headers?|body|query|params?|request|\breq\b/i;
const levelCode: Record<string, string> = {
  error: 'E',
  warn: 'W',
  info: 'I',
  http: 'H',
  verbose: 'V',
  debug: 'D',
  silly: 'S',
};
const lowPriorityMessages = [
  /metrics monitoring (started|stopped)/i,
  /health check succeeded/i,
  /heartbeat/i,
];

const truncate = (value: string, maxLength: number): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

/**
 * Redacts secrets and common PII from free-form logger messages. Call sites
 * should still log event summaries; this is the last safety boundary.
 */
export const redactLogText = (value: string): string => {
  let redacted = value
    .replace(/(["']?(?:authorization|proxy-authorization|cookie|set-cookie)["']?\s*[:=]\s*)(?:(?:Bearer)\s+)?(?:"[^"]*"|'[^']*'|[^,;\s]+)/gi, '$1[REDACTED]')
    .replace(/(["']?(?:password|passwd|passphrase|secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|hash|otp|one[-_ ]?time[-_ ]?(?:password|code|token)?|verification[-_ ]?(?:code|token)|reset[-_ ]?code)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,}\s]+)/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:card|payment|account|routing)[-_ ]?(?:number|no|details)?\s*[:=]\s*["']?[^,}\s"']+/gi, '[REDACTED_PAYMENT]')
    .replace(/\b(?:cvv|cvc|pin)\s*[:=]\s*["']?[^,}\s"']+/gi, '[REDACTED_PAYMENT]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:phone|mobile|telephone)\s*[:=]\s*["']?[+\d][\d ()-]{6,}["']?/gi, '[REDACTED_PHONE]')
    .replace(/\b\d{13,19}\b/g, '[REDACTED_PAYMENT]');

  return truncate(redacted, 1000);
};

export const sanitizeLogValue = (
  value: unknown,
  key = '',
  seen = new WeakSet<object>(),
  depth = 0,
): unknown => {
  if (sensitiveKeyPattern.test(key)) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactLogText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  if (value instanceof Error) {
    const errorDetails = value as Error & Record<string, unknown>;
    return {
      name: redactLogText(value.name),
      message: redactLogText(value.message),
      ...(['code', 'errno', 'syscall']
        .filter((property) => errorDetails[property] !== undefined)
        .reduce<Record<string, unknown>>((details, property) => {
          details[property] = sanitizeLogValue(errorDetails[property], property, seen, depth + 1);
          return details;
        }, {})),
    };
  }

  if (typeof value !== 'object') return redactLogText(String(value));
  if (depth >= 4) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeLogValue(item, key, seen, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 30)
      .map(([entryKey, entryValue]) => [entryKey, sanitizeLogValue(entryValue, entryKey, seen, depth + 1)])
  );
};

const normalizeErrors = winston.format((info) => {
  const splat = info[Symbol.for('splat')] as unknown[] | undefined;
  const error = splat?.find((value): value is Error => value instanceof Error);

  if (error) {
    info.error = error;
    info.stack = info.stack || error.stack;
  }

  if (info.message instanceof Error) {
    info.stack = info.stack || info.message.stack;
    info.message = info.message.message;
  }

  return info;
});

const filterNoise = winston.format((info) => {
  if (info.level === 'error' || info.level === 'warn') return info;

  const message = typeof info.message === 'string' ? info.message : '';
  return lowPriorityMessages.some((pattern) => pattern.test(message)) ? false : info;
});

const compactFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  normalizeErrors(),
  filterNoise(),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack } = info;
    const metadata = Object.fromEntries(
      Object.entries(info).filter(([key]) => !['level', 'message', 'stack', 'timestamp'].includes(key))
    );
    const safeMetadata = sanitizeLogValue(metadata) as Record<string, unknown>;
    const metadataText = Object.keys(safeMetadata).length
      ? ` | ${JSON.stringify(safeMetadata)}`
      : '';
    const safeMessage = redactLogText(typeof message === 'string' ? message : JSON.stringify(sanitizeLogValue(message)) || String(message));
    const stackText = stack ? ` | ${JSON.stringify({ stack: redactLogText(String(stack)) })}` : '';

    return `[${timestamp}] ${levelCode[level] || level}: ${safeMessage}${stackText}${metadataText}`;
  })
);

const resetLogFile = (): boolean => {
  try {
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, '', { encoding: 'utf8', flag: 'w' });

    // Remove the old split error log so development keeps one authoritative file.
    if (resolve(legacyErrorFile) !== logFile && existsSync(legacyErrorFile)) {
      rmSync(legacyErrorFile, { force: true });
    }

    return true;
  } catch (error) {
    process.stderr.write(`[logger] Unable to reset ${logFile}: ${String(error)}\n`);
    return false;
  }
};

const buildTransports = (): winston.transport[] => {
  const transports: winston.transport[] = [];
  // Production logs must go only to the platform-managed stdout/stderr sink.
  const shouldWriteToFile = !isTest && !isVercel && !isProduction;

  if (shouldWriteToFile && resetLogFile()) {
    transports.push(new winston.transports.File({ filename: logFile }));
  }

  // stdout/stderr remains the source of truth for production, Docker, and Vercel.
  transports.push(
    new winston.transports.Console({
      level: isTest ? 'warn' : logLevel,
    })
  );

  return transports;
};

const logger = winston.createLogger({
  level: logLevel,
  format: compactFormat,
  transports: buildTransports(),
  exceptionHandlers: buildTransports(),
  rejectionHandlers: buildTransports(),
});

export default logger;