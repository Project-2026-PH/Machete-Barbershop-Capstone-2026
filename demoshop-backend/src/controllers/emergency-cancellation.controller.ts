import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { emergencyCancellationService } from '../services/emergency-cancellation.service';
import { queueRepository } from '../repositories/queue.repository';
import logger from '../utils/general/logger';


export class EmergencyCancellationController extends BaseController {
  /**
   * GET /api/queue/:queueId/reassignment-options
   * Cashier-only replacement barber list for one affected guest.
   */
  async getReassignmentOptions(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const user = req.user as any;
      const queueId = Number(req.params.queueId);
      const branchId = Number(user?.branch_id || 1);
      if (!Number.isInteger(queueId) || queueId <= 0) throw new Error('Invalid queue ID.');
      const options = await emergencyCancellationService.getCashierReassignmentOptions(queueId, branchId);
      res.json(options);
    }, 'GetCashierReassignmentOptions');
  }

  /**
   * POST /api/queue/:queueId/reassign
   * Cashier-only single-guest barber reassignment with deposit preservation.
   */
  async reassignForCashier(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const user = req.user as any;
      const queueId = Number(req.params.queueId);
      const replacementBarberId = Number(req.body?.replacementBarberId);
      const branchId = Number(user?.branch_id || 1);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
      const userId = user?.user_id || user?.id;
      if (!Number.isInteger(queueId) || queueId <= 0 || !Number.isInteger(replacementBarberId) || replacementBarberId <= 0) {
        throw new Error('A valid queue ID and replacement barber are required.');
      }
      if (!userId) throw new Error('Cashier identity is unavailable.');
      const result = await emergencyCancellationService.reassignForCashier(
        queueId,
        replacementBarberId,
        branchId,
        String(userId),
        reason,
      );
      res.json({ success: true, queue: result, message: 'Guest reassigned and reservation deposit preserved.' });
    }, 'CashierBarberReassignment');
  }

  /**
   * POST /api/cashier/emergency-cancel
   * Cashier / Admin endpoint to trigger emergency cancellation
   */
  async triggerEmergencyCancel(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const user = req.user as any;
      const branchId = user?.branch_id || req.body.branchId || 1;
      const { cancellationType, barberId, startTime, endTime, reason } = req.body;

      logger.info(`[EmergencyController] Cashier initiated emergency cancel: ${cancellationType}`);

      const result = await emergencyCancellationService.triggerEmergencyCancellation({
        branchId: Number(branchId),
        cancellationType,
        barberId: barberId ? Number(barberId) : undefined,
        startTime,
        endTime,
        reason,
      });

      res.status(200).json(result);
    }, 'TriggerEmergencyCancel');
  }

  /**
   * GET /api/customer/emergency-notice
   * Customer endpoint to fetch any active emergency cancellation pop-up notice
   */
  async getPendingNotice(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id || 'test-user-uuid';
      const customerId = await queueRepository.findCustomerIdByUserId(userId);

      if (!customerId) {
        res.status(200).json(null);
        return;
      }

      const notice = await emergencyCancellationService.getPendingEmergencyNotice(customerId);
      res.status(200).json(notice);
    }, 'GetPendingEmergencyNotice');
  }

  /**
   * POST /api/customer/emergency-rebook
   * Customer one-click re-booking UI action inside the pop-up modal
   */
  async rebook(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const customerId = await queueRepository.findCustomerIdByUserId(userId);
      if (!customerId) {
        res.status(404).json({ error: 'Customer record not found.' });
        return;
      }

      const { queueId, selectedSlot } = req.body;
      if (!queueId || !selectedSlot) {
        res.status(400).json({ error: 'queueId and selectedSlot are required.' });
        return;
      }

      const result = await emergencyCancellationService.rebookSlot(
        customerId,
        Number(queueId),
        selectedSlot
      );

      res.status(200).json(result);
    }, 'CustomerEmergencyRebook');
  }

  /**
   * POST /api/customer/emergency-decline
   * Customer fallback action: decline rebooking / acknowledge cancellation
   */
  async declineFallback(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const customerId = await queueRepository.findCustomerIdByUserId(userId);
      if (!customerId) {
        res.status(404).json({ error: 'Customer record not found.' });
        return;
      }

      const { queueId } = req.body;
      if (!queueId) {
        res.status(400).json({ error: 'queueId is required.' });
        return;
      }

      const result = await emergencyCancellationService.declineRebooking(
        customerId,
        Number(queueId)
      );

      res.status(200).json(result);
    }, 'CustomerEmergencyDecline');
  }
}

export const emergencyCancellationController = new EmergencyCancellationController();
