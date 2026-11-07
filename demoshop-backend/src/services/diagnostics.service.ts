import { diagnosticsRepository } from '../repositories/diagnostics.repository';
import { userRepository } from '../repositories/user.repository';
import db from '../db';
import { getRedisCacheStats } from '../redis';
import { peekDatabaseMetrics } from '../utils/metrics/database-metrics.util';
import { peekEmailMetrics } from '../utils/metrics/email-metrics.util';
import { featureService } from './feature.service';
import { AppError } from '../utils/error/AppError';
import type {
  IntegrityReport,
  UserAccessInspection,
  FeatureAccessEvaluation,
  DiagnosticsSessionInfo,
} from '@demoshop/shared-types';

export class DiagnosticsService {
  /**
   * Evaluates and explains effective feature access for any target user account.
   * Leverages the exact multi-layer authorization logic:
   * Layer 1: Global Feature State (ENABLED / DISABLED / MAINTENANCE)
   * Layer 2: Technical Compatibility Boundaries
   * Layer 3: Protected Core Platform Features
   * Layer 4: Role-based Feature Access
   */
  async getPerformanceSnapshot(): Promise<Record<string, unknown>> {
    const database = peekDatabaseMetrics();
    return {
      capturedAt: new Date().toISOString(),
      database: {
        ...database,
        pools: {
          primary: {
            total: db.pool.totalCount,
            idle: db.pool.idleCount,
            waiting: db.pool.waitingCount,
          },
          session: {
            total: db.directPool.totalCount,
            idle: db.directPool.idleCount,
            waiting: db.directPool.waitingCount,
          },
        },
      },
      redis: getRedisCacheStats(),
      email: peekEmailMetrics(),
      note: 'Database counters are process-local and may be consumed by the background metrics logger every minute. Email counters are process-local and reset on restart. These are application signals, not Neon billed network transfer; use Neon provider telemetry for billing and monthly allowance verification.',
    };
  }
  async inspectUserAccess(userId: string): Promise<UserAccessInspection> {
    const user = await userRepository.findById(userId);
    if (!user || !user.user_id) {
      throw new AppError(`User account '${userId}' was not found.`, 404);
    }

    const features = await featureService.getAllFeatures();
    const userRole = String(user.role || 'Customer');

    const evaluations: FeatureAccessEvaluation[] = [];

    for (const feature of features) {
      // 1. Core Lock Check
      const isCoreLocked =
        ['auth', 'sys_controls', 'sys_admin', 'audit_logging'].includes(feature.id) &&
        (userRole === 'System Admin' || feature.id === 'auth' || (feature.id === 'audit_logging' && userRole === 'Owner'));

      // 2. Compatibility evaluation
      const compatibility = this.getRoleCompatibility(feature.id, userRole);

      // 3. Evaluate real access via featureService (exact runtime source of truth)
      const accessResult = await featureService.checkFeatureAccess(feature.id, userRole);

      // 4. Determine roleAccess from feature.affected_roles
      const normalizedUserRole = this.normalizeRole(userRole);
      const isRoleGranted =
        isCoreLocked ||
        feature.affected_roles.some((r) => this.normalizeRole(r) === normalizedUserRole);

      let reason = '';
      if (!accessResult.allowed) {
        if (accessResult.reason === 'DISABLED') {
          reason = `Feature '${feature.name}' is globally disabled in System Controls.`;
        } else if (accessResult.reason === 'MAINTENANCE') {
          reason = accessResult.maintenanceMessage
            ? `Feature is under maintenance: ${accessResult.maintenanceMessage}`
            : `Feature '${feature.name}' is currently under maintenance.`;
        } else if (compatibility.isUnavailable) {
          reason = compatibility.unavailableReason || `Role '${userRole}' is technically incompatible with this feature.`;
        } else {
          reason = `Role '${userRole}' has not been granted access in System Controls (Roles & Access).`;
        }
      } else {
        if (isCoreLocked) {
          reason = 'Allowed: Protected core platform component.';
        } else {
          reason = `Allowed: Granted via '${userRole}' role configuration.`;
        }
      }

      evaluations.push({
        featureId: feature.id,
        featureName: feature.name,
        category: feature.category,
        description: feature.description,
        globalStatus: feature.status,
        maintenanceMessage: feature.maintenance_message || null,
        roleAccess: isRoleGranted ? 'ALLOWED' : 'DENIED',
        isLocked: isCoreLocked,
        isUnavailable: Boolean(compatibility.isUnavailable),
        unavailableReason: compatibility.unavailableReason,
        effectiveAccess: accessResult.allowed ? 'ALLOWED' : 'DENIED',
        reason,
      });
    }

    return {
      user: {
        userId: String(user.user_id),
        username: String(user.username || 'Unnamed'),
        email: String(user.email || ''),
        role: userRole,
        branchId: user.branch_id || null,
        isVerified: Boolean(user.is_verified),
        createdAt: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString(),
      },
      features: evaluations,
    };
  }

  /**
   * Executes real backend-side database data-integrity verification across all verified relationships.
   */
  async runDataIntegrityChecks(): Promise<IntegrityReport> {
    const checks = await Promise.all([
      diagnosticsRepository.checkAccountRoles(),
      diagnosticsRepository.checkBarberUserAccounts(),
      diagnosticsRepository.checkCustomerUserAccounts(),
      diagnosticsRepository.checkQueueActiveBarbers(),
      diagnosticsRepository.checkQueueNonWalkInCustomers(),
      diagnosticsRepository.checkTransactionCustomers(),
      diagnosticsRepository.checkInventoryStockProducts(),
    ]);

    const totalChecks = checks.length;
    const passedChecks = checks.filter((c) => c.status === 'PASSED').length;
    const issuesFoundChecks = checks.filter((c) => c.status === 'ISSUES_FOUND').length;
    const failedChecks = checks.filter((c) => c.status === 'FAILED_TO_CHECK').length;

    return {
      timestamp: new Date().toISOString(),
      totalChecks,
      passedChecks,
      issuesFoundChecks,
      failedChecks,
      checks,
    };
  }

  /**
   * Returns current authenticated administrative session diagnostics.
   */
  async getSessionDiagnostics(currentUser: any): Promise<DiagnosticsSessionInfo> {
    const features = await featureService.getAllFeatures();
    return {
      authenticated: Boolean(currentUser?.user_id),
      currentUserId: currentUser?.user_id || 'unknown',
      currentRole: currentUser?.role || 'Unknown',
      environment: process.env.NODE_ENV || 'development',
      systemVersion: '1.0.4',
      totalFeatures: features.length,
    };
  }

  private normalizeRole(role: string): string {
    if (role === 'Admin' || role === 'ShopAdmin') return 'Shop Admin';
    if (role === 'SystemAdmin') return 'System Admin';
    return role;
  }

  private getRoleCompatibility(featureId: string, role: string): { isUnavailable?: boolean; unavailableReason?: string } {
    const normalized = this.normalizeRole(role);

    if (featureId === 'sys_controls' && normalized !== 'System Admin') {
      return { isUnavailable: true, unavailableReason: 'System Controls control plane is reserved strictly for System Admin.' };
    }
    if (featureId === 'sys_admin' && normalized !== 'System Admin') {
      return { isUnavailable: true, unavailableReason: 'Platform management console is strictly reserved for System Admin superusers.' };
    }
    if (featureId === 'audit_logging' && normalized !== 'System Admin' && normalized !== 'Owner') {
      return { isUnavailable: true, unavailableReason: 'Immutable security audit logs are restricted to platform engineering and ownership.' };
    }
    if (featureId === 'customer_booking' && normalized !== 'Customer') {
      return { isUnavailable: true, unavailableReason: 'Consumer appointment booking requires a customer profile. Staff use POS register ticketing.' };
    }
    if (featureId === 'customer_queue' && normalized !== 'Customer') {
      return { isUnavailable: true, unavailableReason: 'Virtual Queue Card is designed for customer smartphone ticket tracking. Staff use POS or Barber Station.' };
    }
    if (featureId === 'customer_history' && normalized !== 'Customer') {
      return { isUnavailable: true, unavailableReason: 'Customer visit history is tied to customer account records. Staff view transactions via Reports or POS lookup.' };
    }

    return {};
  }
}

export const diagnosticsService = new DiagnosticsService();
