import { PoolClient } from 'pg';
import { auditRepository } from '../repositories/audit.repository';
import { extractRequestMetadata, sanitizeAuditDetails } from '../utils/audit/audit-worker.util';
import { 
  getCachedLogs, 
  setCachedLogs,
  invalidateAuditCache
} from '../utils/audit/audit-cache.util';
import { formatAuditLogsResponse } from '../utils/audit/audit-formatter.util';
import logger from '../utils/general/logger';

export interface AuditLogParams {
  userId: string | null;
  action: string;
  resource: string;
  details?: any;
  req?: any;
}

/**
 * Service for handling audit logs.
 * Follows the Coordinator Pattern: orchestrates utilities and repositories 
 * to handle logging and retrieval with caching.
 */
export class AuditService {
  private prepareLogData({ userId, action, resource, details, req }: AuditLogParams) {
    const { ipAddress, userAgent } = extractRequestMetadata(req);
    return {
      userId: userId || null,
      action: action.slice(0, 80),
      resource: resource.slice(0, 80),
      details: JSON.stringify(sanitizeAuditDetails(details)),
      ipAddress,
      userAgent,
    };
  }

  /** Persists an audit event with the caller's transaction and propagates failures. */
  async logSecurityEventInTransaction(client: PoolClient, params: AuditLogParams): Promise<void> {
    await auditRepository.create(this.prepareLogData(params), client);
    invalidateAuditCache();
  }

  /**
   * Logs a security or critical business event.
   * Uses extractRequestMetadata worker for IP/UA.
   */
  async logSecurityEvent({ userId, action, resource, details, req }: AuditLogParams): Promise<void> {
    try {
      await auditRepository.create(this.prepareLogData({ userId, action, resource, details, req }));
      invalidateAuditCache();
    } catch (err: unknown) {
        logger.error('[AuditService] Failed to persist event', { error: err });
    }
  }

  /**
   * Retrieves audit logs with pagination, filtering, and caching.
   */
  async getLogs({
    page = 1,
    limit = 20,
    filter,
    roleFilter,
    statusFilter,
    sortBy,
    moduleFilter,
    startDate,
    endDate,
  }: {
    page?: number;
    limit?: number;
    filter?: string;
    roleFilter?: string;
    statusFilter?: string;
    sortBy?: string;
    moduleFilter?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const cacheKey = `logs-${page}-${limit}-${filter || 'all'}-${roleFilter || 'all'}-${statusFilter || 'all'}-${sortBy || 'default'}-${moduleFilter || 'all'}-${startDate || 'all'}-${endDate || 'all'}`;
    const cachedData = getCachedLogs(cacheKey);
    if (cachedData) return cachedData;

    const offset = (page - 1) * limit;

    try {
      const [logs, total] = await Promise.all([
        auditRepository.findAll({ limit, offset, filter, roleFilter, statusFilter, sortBy, moduleFilter, startDate, endDate }),
        auditRepository.count(filter, roleFilter, statusFilter, moduleFilter, startDate, endDate),
      ]);

      const responseData = formatAuditLogsResponse(logs, total, page, limit);
      setCachedLogs(cacheKey, responseData);
      
      return responseData;
    } catch (err) {
      logger.error('[AuditService] Failed to retrieve logs:', err);
      throw err;
    }
  }

  /**
   * Retrieves audit statistics for the dashboard.
   */
  async getStats(range: string) {
    try {
      return await auditRepository.getDashboardStats(range);
    } catch (err) {
      logger.error('[AuditService] Failed to retrieve stats:', err);
      throw err;
    }
  }
}

export const auditService = new AuditService();
export const logSecurityEvent = auditService.logSecurityEvent.bind(auditService);
export default auditService;
