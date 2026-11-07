import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { auditService } from '../services/audit.service';

/**
 * Controller for Audit Log operations.
 * Extends BaseController for standardized error handling.
 * Following Coordinator Pattern: delegating logic and caching to the service.
 */
export class AuditController extends BaseController {
  /**
   * Retrieves audit logs via auditService.
   */
  async getLogs(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const filter = (req.query.filter as string) || undefined;
      const roleFilter = (req.query.roleFilter as string) || undefined;
      const statusFilter = (req.query.statusFilter as string) || undefined;
      const sortBy = (req.query.sortBy as string) || undefined;
      const moduleFilter = (req.query.module as string) || (req.query.moduleFilter as string) || (req.query.resource as string) || undefined;
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      // Logic, Caching, and Formatting now live in auditService.getLogs
      const result = await auditService.getLogs({ page, limit, filter, roleFilter, statusFilter, sortBy, moduleFilter, startDate, endDate });
      
      res.json(result);
    }, 'GetAuditLogs');
  }

  /**
   * Retrieves audit stats via auditService.
   */
  async getStats(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const range = (req.query.range as string) || '24h';
      const stats = await auditService.getStats(range);
      res.json(stats);
    }, 'GetAuditStats');
  }
}

const controller = new AuditController();

export const getLogs = controller.getLogs.bind(controller);
export const getStats = controller.getStats.bind(controller);

export default controller;
