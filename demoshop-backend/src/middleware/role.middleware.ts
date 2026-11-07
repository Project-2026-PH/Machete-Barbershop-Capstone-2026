import { Request, Response, NextFunction } from 'express';
import { User, UserRole } from '@demoshop/shared-types';
import logger from '../utils/general/logger';

/**
 * Role-based authorization middleware.
 * Checks if the authenticated user's role is in the allowed list.
 * Must be used AFTER requireSupabaseAuth sets req.user.
 */
const authorizeRoles = (...allowedRoles: Array<UserRole | string>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Ensure user is authenticated (populated by auth middleware)
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Please log in.' });
      return;
    }

    const user = req.user as Partial<User>;

    const hasDirectRole = Boolean(user.role && allowedRoles.includes(user.role));
    const hasCashierInventoryAccess = user.role === 'Cashier' && Boolean(user.can_access_inventory) && allowedRoles.includes('Inventory Manager');

    // Check if user's role is in the allowed list or has cashier inventory access
    if (!hasDirectRole && !hasCashierInventoryAccess) {
      logger.warn('Access denied for role', {
        role: user.role || 'unknown',
        can_access_inventory: user.can_access_inventory,
        route: req.path,
        method: req.method,
      });
      res.status(403).json({ error: 'Access Denied: Insufficient privileges.' });
      return;
    }

    next();
  };
};

export default authorizeRoles;
