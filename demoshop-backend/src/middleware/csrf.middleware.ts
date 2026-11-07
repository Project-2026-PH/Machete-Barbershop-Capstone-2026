import { Request, Response, NextFunction } from 'express';
import logger from '../utils/general/logger';
import { allowedOrigins } from './cors.middleware';

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const hasSessionCookie = (req: Request): boolean => {
  const cookies = req.cookies || {};
  return Boolean(
    cookies.token ||
    cookies['sb-access-token'] ||
    cookies['demoshop-guest-session'] ||
    Object.keys(cookies).some((name) => /^sb-.+-auth-token$/.test(name)),
  );
};

const getRequestOrigin = (req: Request): string | undefined => {
  const origin = req.get('origin');
  if (origin) return origin;

  const referer = req.get('referer');
  if (!referer) return undefined;

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
};

/**
 * Protects cookie-authenticated state changes against cross-site requests.
 * Authorization-header requests do not need this browser-cookie CSRF check.
 */
export const csrfMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!stateChangingMethods.has(req.method) || !hasSessionCookie(req)) {
    next();
    return;
  }

  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    logger.warn('Rejected cross-site state-changing request', {
      method: req.method,
      path: req.path,
      originPresent: Boolean(req.get('origin')),
    });
    res.status(403).json({ error: 'Cross-site request rejected.' });
    return;
  }

  next();
};

export default csrfMiddleware;
