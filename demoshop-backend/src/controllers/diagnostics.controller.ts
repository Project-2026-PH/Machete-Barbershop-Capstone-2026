import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { diagnosticsService } from '../services/diagnostics.service';
import { diagnosticToolsService } from '../services/diagnostic-tools.service';
import type { AuthoritativeUserContext } from '../security/policies/queue.policy';

export class DiagnosticsController extends BaseController {
  private getUserContext(req: Request): AuthoritativeUserContext {
    const user = req.user as any;
    return {
      userId: user?.user_id || user?.id || 'system-admin',
      role: user?.role || 'System Admin',
      branchId: user?.branch_id ? Number(user.branch_id) : null,
    };
  }

  async inspectUserAccess(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = req.params.userId as string;
      const result = await diagnosticsService.inspectUserAccess(userId);
      res.json(result);
    }, 'InspectUserAccess');
  }

  async getPerformanceSnapshot(_req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await diagnosticsService.getPerformanceSnapshot();
      res.json(result);
    }, 'GetPerformanceSnapshot');
  }
  async runIntegrityChecks(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await diagnosticsService.runDataIntegrityChecks();
      res.json(result);
    }, 'RunIntegrityChecks');
  }

  async getSessionInfo(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await diagnosticsService.getSessionDiagnostics(req.user);
      res.json(result);
    }, 'GetDiagnosticsSessionInfo');
  }

  // ── Demo & Testing Tools ──────────────────────────────────────────

  async createTestReservation(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userContext = this.getUserContext(req);
      const result = await diagnosticToolsService.createTestReservation(req.body, userContext, req);
      res.status(201).json(result);
    }, 'CreateTestReservation');
  }

  async insertTestWalkIns(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userContext = this.getUserContext(req);
      const result = await diagnosticToolsService.insertTestWalkIns(req.body, userContext, req);
      res.status(201).json(result);
    }, 'InsertTestWalkIns');
  }

  async getLiveBarberQueue(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const barberId = Number(req.params.barberId);
      const result = await diagnosticToolsService.getLiveBarberQueueForSkip(barberId);
      res.json(result);
    }, 'GetLiveBarberQueue');
  }

  async skipQueueEntry(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const queueId = Number(req.params.id);
      const userContext = this.getUserContext(req);
      const result = await diagnosticToolsService.skipQueueEntry(queueId, req.body, userContext, req);
      res.json(result);
    }, 'SkipQueueEntry');
  }

  async createTestReview(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userContext = this.getUserContext(req);
      const result = await diagnosticToolsService.createTestReview(req.body, userContext, req);
      res.status(201).json(result);
    }, 'CreateTestReview');
  }

  async previewEmail(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await diagnosticToolsService.previewEmail(req.body);
      res.json(result);
    }, 'PreviewEmail');
  }

  async sendTestEmail(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userContext = this.getUserContext(req);
      const result = await diagnosticToolsService.sendTestEmail(req.body, userContext, req);
      res.json(result);
    }, 'SendTestEmail');
  }

  async getTestDataCounts(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await diagnosticToolsService.getTestDataCounts();
      res.json(result);
    }, 'GetTestDataCounts');
  }

  async getTestDataReview(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const result = await diagnosticToolsService.getTestDataReview();
      res.json(result);
    }, 'GetTestDataReview');
  }

  async cleanupTestData(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userContext = this.getUserContext(req);
      const result = await diagnosticToolsService.cleanupTestData(req.body, userContext, req);
      res.json(result);
    }, 'CleanupTestData');
  }
}

export const diagnosticsController = new DiagnosticsController();
