import logger from '../utils/general/logger';
import { AppError } from '../utils/error/AppError';

const MAX_EVENTS = 50;
const EVENT_PATTERN = /^[a-z0-9_.:-]{1,80}$/;
const ALLOWED_DATA_KEYS = new Set(['channel', 'status', 'reason', 'errorCode', 'errorMessage']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeValue = (value: unknown): string | number | boolean | null => {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
  return null;
};

export class TelemetryService {
  recordBatch(payload: unknown): number {
    if (!Array.isArray(payload) || payload.length > MAX_EVENTS) {
      throw new AppError('Telemetry payload is invalid.', 400);
    }

    let accepted = 0;
    for (const rawEvent of payload) {
      if (!isRecord(rawEvent) || typeof rawEvent.event !== 'string' || !EVENT_PATTERN.test(rawEvent.event)) {
        continue;
      }

      const eventName: string = rawEvent.event;

      const data = isRecord(rawEvent.data)
        ? Object.fromEntries(
            Object.entries(rawEvent.data)
              .filter(([key]) => ALLOWED_DATA_KEYS.has(key))
              .map(([key, value]) => [key, sanitizeValue(value)])
          )
        : {};

      const isError = Boolean(
        data.errorMessage ||
        data.errorCode ||
        ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED', 'fallback', 'connection_timeout'].includes(String(data.status || '')) ||
        ['fallback_started', 'refresh_error', 'error', 'failure'].some((term) => eventName.toLowerCase().includes(term))
      );

      if (isError) {
        logger.warn('[FrontendTelemetry]', {
          event: eventName,
          timestamp: typeof rawEvent.timestamp === 'number' ? rawEvent.timestamp : null,
          ...data,
        });
      }
      accepted += 1;
    }

    return accepted;
  }
}

export const telemetryService = new TelemetryService();
