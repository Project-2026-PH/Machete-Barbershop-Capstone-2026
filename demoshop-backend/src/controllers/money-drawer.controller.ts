import { Request, Response } from 'express';
import { moneyDrawerService } from '../services/money-drawer.service';

export class MoneyDrawerController {
  private readonly service = moneyDrawerService;

  /**
   * GET /api/admin/money-drawer
   * Retrieves current expected cash status, active schedule state, and change history.
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const branchIdParam = req.query.branchId ? Number(req.query.branchId) : undefined;
      const branchId = branchIdParam || Number(user?.branch_id) || 1;
      const requestedDate = typeof req.query.date === 'string' ? req.query.date : undefined;

      const data = await this.service.getDrawerStatus(branchId, requestedDate);
      res.json(data);
    } catch (err: any) {
      console.error('[MoneyDrawerController.getStatus] Error:', err);
      res.status(500).json({
        error: 'Failed to retrieve money drawer status',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/admin/money-drawer/adjust
   * Adjusts the starting expected cash float amount for a specified date.
   * Enforces once-per-calendar-day modification limit.
   */
  async adjustAmount(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const branchId = Number(req.body.branchId) || Number(user?.branch_id) || 1;
      const amount = Number(req.body.amount);
      const date = String(req.body.date || '').trim();
      const notes = req.body.notes ? String(req.body.notes).trim() : undefined;
      const userId = user?.user_id ? String(user.user_id) : undefined;

      if (!amount || amount <= 0 || Number.isNaN(amount)) {
        res.status(400).json({
          error: 'Invalid amount',
          message: 'Expected cash amount must be greater than zero.',
        });
        return;
      }

      if (!date) {
        res.status(400).json({
          error: 'Date required',
          message: 'Please provide a valid target date (YYYY-MM-DD).',
        });
        return;
      }

      const log = await this.service.adjustDrawerAmount(
        branchId,
        amount,
        date,
        userId,
        notes
      );

      res.status(201).json({
        success: true,
        message: 'Expected cash drawer amount successfully adjusted.',
        log,
      });
    } catch (err: any) {
      console.error('[MoneyDrawerController.adjustAmount] Error:', err);
      const isClientError =
        err.message?.includes('already been adjusted') ||
        err.message?.includes('Invalid') ||
        err.message?.includes('required');

      res.status(isClientError ? 400 : 500).json({
        error: 'Failed to adjust drawer amount',
        message: err.message,
      });
    }
  }
}

export const moneyDrawerController = new MoneyDrawerController();
