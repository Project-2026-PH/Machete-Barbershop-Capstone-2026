import { featureRepository } from '../repositories/feature.repository';
import { auditService } from './audit.service';
import logger from '../utils/general/logger';
import type { SystemFeature, FeatureStatus, FeatureStatusSummary } from '@demoshop/shared-types';

export class FeatureService {
  private cache: FeatureStatusSummary | null = null;
  private cacheExpiresAt = 0;
  private readonly CACHE_TTL_MS = 15000; // 15 seconds cache for fast middleware checks

  /**
   * Retrieves all system features.
   */
  async getAllFeatures(): Promise<SystemFeature[]> {
    return await featureRepository.findAll();
  }

  /**
   * Retrieves single system feature.
   */
  async getFeature(id: string): Promise<SystemFeature | null> {
    return await featureRepository.findById(id);
  }

  /**
   * Retrieves status summary for clients (cached).
   */
  async getStatusSummary(forceFresh = false): Promise<FeatureStatusSummary> {
    const now = Date.now();
    if (!forceFresh && this.cache && this.cacheExpiresAt > now) {
      return this.cache;
    }

    const summary = await featureRepository.getStatusesSummary();
    this.cache = summary;
    this.cacheExpiresAt = now + this.CACHE_TTL_MS;
    return summary;
  }

  /**
   * Clears the in-memory feature cache.
   */
  invalidateCache(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }

  /**
   * Updates the availability status and maintenance message of a system feature.
   * Enforces core protection, dependency impact validation, and backend audit logging.
   */
  async updateFeatureStatus({
    featureId,
    status,
    maintenanceMessage,
    userId,
    req,
  }: {
    featureId: string;
    status: FeatureStatus;
    maintenanceMessage?: string | null;
    userId: string | null;
    req?: any;
  }): Promise<SystemFeature> {
    const feature = await featureRepository.findById(featureId);
    if (!feature) {
      const err = new Error(`Feature '${featureId}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }

    // 1. Safeguard: Core protected features must NEVER be disabled or put in maintenance
    if (feature.is_core && status !== 'ENABLED') {
      await auditService.logSecurityEvent({
        userId,
        action: 'FEATURE_PROTECTED_ATTEMPT',
        resource: `feature:${featureId}`,
        details: {
          featureId,
          attemptedStatus: status,
          currentStatus: feature.status,
          result: 'Blocked',
          reason: 'Attempted modification of locked core system feature',
        },
        req,
      });

      const err = new Error(
        `Feature '${feature.name}' is a protected core system component and cannot be disabled or put in maintenance.`
      );
      (err as any).statusCode = 403;
      throw err;
    }

    const previousStatus = feature.status;

    // 2. Dependency validation when disabling or putting into maintenance
    const allFeatures = await featureRepository.findAll();
    const dependentFeatures = allFeatures.filter(
      (f) => f.dependencies.includes(featureId) && f.status === 'ENABLED'
    );

    // 3. Persist change
    let updatedFeature: SystemFeature | null = null;
    try {
      updatedFeature = await featureRepository.updateStatus(
        featureId,
        status,
        maintenanceMessage,
        userId
      );
      this.invalidateCache();
    } catch (err: any) {
      await auditService.logSecurityEvent({
        userId,
        action: 'FEATURE_UPDATE_FAILED',
        resource: `feature:${featureId}`,
        details: {
          featureId,
          previousStatus,
          attemptedStatus: status,
          result: 'Failed',
          error: err.message,
        },
        req,
      });
      throw err;
    }

    if (!updatedFeature) {
      const err = new Error(`Failed to update feature '${featureId}'.`);
      (err as any).statusCode = 500;
      throw err;
    }

    // 4. Audit Log Integration
    let auditAction = 'FEATURE_CONFIGURATION_CHANGED';
    if (previousStatus !== status) {
      if (status === 'ENABLED') {
        auditAction = previousStatus === 'MAINTENANCE' ? 'FEATURE_MAINTENANCE_ENDED' : 'FEATURE_ENABLED';
      } else if (status === 'DISABLED') {
        auditAction = 'FEATURE_DISABLED';
      } else if (status === 'MAINTENANCE') {
        auditAction = 'FEATURE_MAINTENANCE_STARTED';
      }
    }

    await auditService.logSecurityEvent({
      userId,
      action: auditAction,
      resource: `feature:${featureId}`,
      details: {
        featureId,
        featureName: feature.name,
        previousStatus,
        newStatus: status,
        affectedRoles: feature.affected_roles,
        impactedDependentFeatures: dependentFeatures.map((d) => d.id),
        maintenanceMessage: status === 'MAINTENANCE' ? maintenanceMessage : undefined,
        result: 'Success',
      },
      req,
    });

    return updatedFeature;
  }

  /**
   * Updates the authorized roles for a system feature.
   * Enforces core protection safeguards and logs granular audit events.
   */
  async updateFeatureRoles({
    featureId,
    roles,
    userId,
    req,
  }: {
    featureId: string;
    roles: string[];
    userId: string | null;
    req?: any;
  }): Promise<SystemFeature> {
    const feature = await featureRepository.findById(featureId);
    if (!feature) {
      const err = new Error(`Feature '${featureId}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }

    // 1. Core Protection: Locked administrative roles cannot be removed
    if (feature.is_core) {
      const requiredRoles: Record<string, string[]> = {
        sys_controls: ['System Admin'],
        sys_admin: ['System Admin'],
        audit_logging: ['System Admin', 'Owner'],
        auth: ['System Admin'],
      };

      const required = requiredRoles[featureId] || ['System Admin'];
      const missingRoles = required.filter((r) => !roles.includes(r));

      if (missingRoles.length > 0) {
        await auditService.logSecurityEvent({
          userId,
          action: 'FEATURE_ROLE_CHANGE_BLOCKED',
          resource: `feature:${featureId}`,
          details: {
            featureId,
            featureName: feature.name,
            attemptedRoles: roles,
            missingRequiredRoles: missingRoles,
            currentRoles: feature.affected_roles,
            result: 'Blocked',
            reason: `Attempted removal of protected role(s) [${missingRoles.join(', ')}] from core system feature`,
          },
          req,
        });

        const err = new Error(
          `Cannot revoke protected role(s) [${missingRoles.join(', ')}] from core feature '${feature.name}'.`
        );
        (err as any).statusCode = 403;
        throw err;
      }
    }

    const previousRoles = [...feature.affected_roles];
    const grantedRoles = roles.filter((r) => !previousRoles.includes(r));
    const revokedRoles = previousRoles.filter((r) => !roles.includes(r));

    // 2. Persist in database
    let updatedFeature: SystemFeature | null = null;
    try {
      updatedFeature = await featureRepository.updateRoles(featureId, roles, userId);
      this.invalidateCache();
    } catch (err: any) {
      await auditService.logSecurityEvent({
        userId,
        action: 'FEATURE_UPDATE_FAILED',
        resource: `feature:${featureId}`,
        details: {
          featureId,
          previousRoles,
          attemptedRoles: roles,
          result: 'Failed',
          error: err.message,
        },
        req,
      });
      throw err;
    }

    if (!updatedFeature) {
      const err = new Error(`Failed to update roles for feature '${featureId}'.`);
      (err as any).statusCode = 500;
      throw err;
    }

    // 3. Emit individual audit logs for each granted and revoked role
    for (const grantedRole of grantedRoles) {
      await auditService.logSecurityEvent({
        userId,
        action: 'FEATURE_ROLE_GRANTED',
        resource: `feature:${featureId}`,
        details: {
          featureId,
          featureName: feature.name,
          role: grantedRole,
          previousAccess: 'Denied',
          newAccess: 'Allowed',
          result: 'Success',
        },
        req,
      });
    }

    for (const revokedRole of revokedRoles) {
      await auditService.logSecurityEvent({
        userId,
        action: 'FEATURE_ROLE_REVOKED',
        resource: `feature:${featureId}`,
        details: {
          featureId,
          featureName: feature.name,
          role: revokedRole,
          previousAccess: 'Allowed',
          newAccess: 'Denied',
          result: 'Success',
        },
        req,
      });
    }

    return updatedFeature;
  }

  /**
   * Synchronously or quickly check feature status for middleware.
   */
  async checkFeatureStatus(featureId: string): Promise<{
    status: FeatureStatus;
    maintenanceMessage: string | null;
    affectedRoles: string[];
  }> {
    const summary = await this.getStatusSummary();
    const entry = summary[featureId];
    if (!entry) {
      // Default to ENABLED if unconfigured to prevent unintended lockout
      return { status: 'ENABLED', maintenanceMessage: null, affectedRoles: [] };
    }
    return {
      status: entry.status,
      maintenanceMessage: entry.maintenance_message || null,
      affectedRoles: entry.affected_roles || [],
    };
  }

  /**
   * Comprehensive evaluation of both global availability and role access.
   */
  async checkFeatureAccess(
    featureId: string,
    userRole?: string
  ): Promise<{
    allowed: boolean;
    reason?: 'DISABLED' | 'MAINTENANCE' | 'ROLE_DENIED';
    status: FeatureStatus;
    maintenanceMessage: string | null;
    featureName?: string;
  }> {
    const { status, maintenanceMessage, affectedRoles } = await this.checkFeatureStatus(featureId);

    if (status === 'DISABLED') {
      return { allowed: false, reason: 'DISABLED', status, maintenanceMessage };
    }

    if (status === 'MAINTENANCE') {
      return { allowed: false, reason: 'MAINTENANCE', status, maintenanceMessage };
    }

    // Check Role Access if userRole provided
    const isCore = ['auth', 'sys_controls', 'sys_admin', 'audit_logging'].includes(featureId);
    if (userRole) {
      if (userRole === 'System Admin' && isCore) {
        return { allowed: true, status, maintenanceMessage };
      }

      const isRoleAllowed = affectedRoles.some((r) => {
        if (r === userRole) return true;
        if (r === 'Shop Admin' && (userRole === 'Admin' || userRole === 'ShopAdmin')) return true;
        if (r === 'System Admin' && (userRole === 'SystemAdmin' || userRole === 'System Admin')) return true;
        return false;
      });

      if (affectedRoles.length > 0 && !isRoleAllowed) {
        return { allowed: false, reason: 'ROLE_DENIED', status, maintenanceMessage };
      }
    }

    return { allowed: true, status, maintenanceMessage };
  }
}

export const featureService = new FeatureService();
