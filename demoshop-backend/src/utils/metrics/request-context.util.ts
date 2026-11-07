import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request } from 'express';

const requestStorage = new AsyncLocalStorage<Request>();

export const runWithRequestContext = (req: Request, next: NextFunction): void => {
  requestStorage.run(req, next);
};

/** Returns a low-cardinality route label without query strings or path parameter values. */
export const getDatabaseRequestLabel = (requestOverride?: Request): string => {
  const req = requestOverride || requestStorage.getStore();
  if (!req) return 'background / no HTTP request';

  const routePath = req.route?.path;
  const routeTemplate = typeof routePath === 'string'
    ? routePath
    : Array.isArray(routePath)
      ? routePath.join('|')
      : null;
  const route = routeTemplate
    ? `${req.baseUrl || ''}${routeTemplate}`
    : `${req.baseUrl || '(base route)'} [middleware before route match]`;
  const role = typeof req.user?.role === 'string' ? req.user.role : 'unauthenticated/service';

  return `${role} | ${req.method} ${route}`.slice(0, 180);
};

export const getDatabaseRequestEmail = (requestOverride?: Request): string | null => {
  const req = requestOverride || requestStorage.getStore();
  const email = typeof req?.user?.email === 'string'
    ? req.user.email.trim().toLowerCase().replace(/[\u0000-\u001f\u007f]/g, '')
    : '';
  return email ? email.slice(0, 254) : null;
};
