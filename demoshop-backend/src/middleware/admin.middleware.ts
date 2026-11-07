import { Request, Response, NextFunction } from 'express';
import { User } from '@demoshop/shared-types';

/**
 * Admin-only authorization middleware.
 * Only allows 'System Admin' role to proceed.
 * Must be used AFTER requireSupabaseAuth sets req.user.
 */
const adminMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Ensure user is authenticated first (processed by requireSupabaseAuth middleware)
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = req.user as Partial<User>;

  // Check Role
  if (user.role !== 'System Admin') {
    res.status(403).json({ error: 'Access Denied: System Admin privileges required.' });
    return;
  }

  next();
};

export default adminMiddleware;
