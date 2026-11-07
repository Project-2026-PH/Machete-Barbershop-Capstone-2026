import logger from '../general/logger';
import { config } from '../../config/env';

/**
 * Registers process lifecycle listeners to ensure metrics are flushed before shutdown.
 */
export const setupProcessListeners = (onExit: () => Promise<void>): void => {
  process.on('SIGTERM', () => onExit());
  process.on('SIGINT', () => onExit());
};

/**
 * Determines if background monitoring should be enabled based on the environment.
 * Only runs in development (not production or test).
 */
export const canRunBackgroundMonitoring = (): boolean => {
  return !config.runtime.isProduction && !config.runtime.isTest;
};
