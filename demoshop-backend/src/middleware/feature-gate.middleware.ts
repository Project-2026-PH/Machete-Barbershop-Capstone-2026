import { Request, Response, NextFunction } from 'express';
import { featureService } from '../services/feature.service';
import logger from '../utils/general/logger';

/**
 * Express middleware to enforce feature availability on API routes.
 * Rejects requests with HTTP 503 if the feature is DISABLED or under MAINTENANCE.
 * 
 * System Admin and Owner users are permitted bypass for administrative maintenance diagnostics.
 */
export const requireFeature = (featureId: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, maintenanceMessage, affectedRoles } = await featureService.checkFeatureStatus(featureId);
      const userRole = (req.user as any)?.role;

      // 1. Layer 1: Global Feature Availability
      if (status !== 'ENABLED') {
        const isCore = ['auth', 'sys_controls', 'sys_admin', 'audit_logging'].includes(featureId);
        // Superuser diagnostic bypass for System Admin and Owner on core administrative features
        if (isCore && (userRole === 'System Admin' || userRole === 'Owner')) {
          logger.info(`[FeatureGate] Superuser diagnostic bypass for core feature '${featureId}' (status: ${status}) by ${userRole}`);
          return next();
        }

        if (status === 'DISABLED') {
          res.status(503).json({
            error: 'Feature Unavailable',
            message: `The '${featureId}' service is currently disabled by system administrators.`,
            code: 'FEATURE_DISABLED',
            feature: featureId,
          });
          return;
        }

        if (status === 'MAINTENANCE') {
          res.status(503).json({
            error: 'Feature Under Maintenance',
            message:
              maintenanceMessage ||
              `The '${featureId}' service is temporarily undergoing scheduled maintenance. Please try again later.`,
            code: 'FEATURE_MAINTENANCE',
            feature: featureId,
          });
          return;
        }
      }

      // 2. Layer 2: Role Access Authorization
      // Global availability takes precedence. If feature is ENABLED, verify user role access.
      const isCore = ['auth', 'sys_controls', 'sys_admin', 'audit_logging'].includes(featureId);
      if (userRole) {
        // Core features and administrative shop settings are permanently accessible for System Admin
        if (userRole === 'System Admin' && (isCore || featureId === 'shop_admin_settings')) {
          return next();
        }

        if (Array.isArray(affectedRoles) && affectedRoles.length > 0) {
          const isRoleAllowed = affectedRoles.some((r) => {
            if (r === userRole) return true;
            if (r === 'Shop Admin' && (userRole === 'Admin' || userRole === 'ShopAdmin')) return true;
            if (r === 'System Admin' && (userRole === 'SystemAdmin' || userRole === 'System Admin')) return true;
            return false;
          });

          if (!isRoleAllowed) {
            logger.warn(`[FeatureGate] Role '${userRole}' denied access to '${featureId}'`, {
              featureId,
              userRole,
              authorizedRoles: affectedRoles,
            });
            res.status(403).json({
              error: 'Feature Access Denied',
              message: `Role '${userRole}' is not authorized to access feature '${featureId}'. Access has been revoked in System Controls.`,
              code: 'FEATURE_ROLE_DENIED',
              feature: featureId,
              role: userRole,
            });
            return;
          }
        }
      }

      next();
    } catch (err) {
      logger.error(`[FeatureGate] Error checking status for '${featureId}'`, { error: err });
      // Fail open to avoid unintended systemic blackout if check fails
      next();
    }
  };
};
