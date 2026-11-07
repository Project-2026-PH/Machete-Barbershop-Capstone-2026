import { Request, Response, NextFunction } from 'express';
import logger from '../utils/general/logger';
import { verifyServiceToken, ServiceTokenPayload } from '../utils/auth/service-token.util';
import { ApiScope } from '../services/client-credentials.service';

/**
 * Augment Express Request with the service principal so downstream
 * handlers can read the client identity and granted scopes.
 */
declare global {
  namespace Express {
    interface Request {
      servicePrincipal?: ServiceTokenPayload;
    }
  }
}

/**
 * Middleware that verifies a machine-client Bearer token.
 *
 * Rejects user tokens (tokens without `principal_type: "service"`)
 * so machine-only endpoints cannot be called with a human session.
 *
 * On success, sets `req.servicePrincipal`.
 */
export const requireServiceAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided.' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyServiceToken(token);
    req.servicePrincipal = payload;
    next();
  } catch (err: unknown) {
    logger.warn('[ServiceAuth] Token verification failed', { error: err });
    res.status(401).json({ error: 'Unauthorized: Invalid or expired service token.' });
  }
};

/**
 * Returns a middleware that verifies the service principal holds all
 * of the listed scopes. Must be used **after** `requireServiceAuth`.
 *
 * Usage:
 *   router.get('/reports', requireServiceAuth, requireScopes('reports:read'), handler)
 */
export const requireScopes = (...requiredScopes: ApiScope[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.servicePrincipal;
    if (!principal) {
      res.status(401).json({ error: 'Unauthorized: No service principal.' });
      return;
    }

    const granted = new Set((principal.scope ?? '').split(/\s+/).filter(Boolean));
    const missing = requiredScopes.filter((s) => !granted.has(s));

    if (missing.length > 0) {
      logger.warn('[ServiceAuth] Insufficient scopes', {
        clientId: principal.client_id,
        required: requiredScopes,
        missing,
      });
      res.status(403).json({
        error: 'Forbidden: Insufficient scopes.',
        required: requiredScopes,
      });
      return;
    }

    next();
  };
};
