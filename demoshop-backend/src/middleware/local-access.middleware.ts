import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import logger from '../utils/general/logger';

export const isLoopbackAddress = (ip?: string): boolean => {
  if (!ip) return false;
  const cleanIp = ip.trim().replace(/^::ffff:/, '');
  return cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost';
};

const isCloudOrDisabled = (): boolean => {
  if (
    config.runtime.isVercel ||
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.VERCEL)
  ) {
    return true;
  }

  if (
    (config.runtime.isProduction || process.env.NODE_ENV === 'production') &&
    process.env.ENABLE_LOCAL_QUEUE !== 'true'
  ) {
    return true;
  }

  return false;
};

/**
 * Middleware ensuring local SQLite queue endpoints are accessible only from
 * localhost/loopback in local development/daemon mode, and fully blocked in cloud/serverless deployments.
 */
export const requireLocalQueueAccess = (req: Request, res: Response, next: NextFunction): void => {
  if (isCloudOrDisabled()) {
    logger.warn('[Local SQLite] Blocked local queue request in cloud/production environment', {
      ip: req.ip,
      path: req.originalUrl,
    });
    res.status(403).json({ error: 'Local queue API is disabled in cloud deployments.' });
    return;
  }

  const clientIp = req.ip || req.socket?.remoteAddress;
  if (!isLoopbackAddress(clientIp)) {
    logger.warn('[Local SQLite] Non-loopback access blocked', {
      ip: clientIp,
      path: req.originalUrl,
    });
    res.status(403).json({ error: 'Access Denied: Local queue API is restricted to loopback/localhost only.' });
    return;
  }

  next();
};

export default requireLocalQueueAccess;
