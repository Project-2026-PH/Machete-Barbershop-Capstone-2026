import { moneyDrawerRepository } from '../repositories/money-drawer.repository';
import { invalidateCashierAggregates } from '../utils/cashier/cashier-cache.util';
import type {
  MoneyDrawerStatusResponse,
  MoneyDrawerLogItem,
} from '@demoshop/shared-types';

export class MoneyDrawerService {
  private readonly repo = moneyDrawerRepository;

  /**
   * Retrieves the current money drawer status, configured amounts, schedule state, and logs.
   */
  async getDrawerStatus(
    branchId: number,
    requestedDate?: string
  ): Promise<MoneyDrawerStatusResponse> {
    if (!branchId || branchId <= 0) {
      throw new Error('Valid branch ID is required');
    }
    return this.repo.getDrawerStatus(branchId, requestedDate);
  }

  /**
   * Adjusts the starting expected cash float amount for the specified date.
   * Enforces once-a-day modification restrictions and invalidates cashier caches.
   */
  async adjustDrawerAmount(
    branchId: number,
    amount: number,
    dateStr: string,
    userId?: string,
    notes?: string
  ): Promise<MoneyDrawerLogItem> {
    if (!branchId || branchId <= 0) {
      throw new Error('Valid branch ID is required');
    }

    if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
      throw new Error('Invalid expected cash amount. Amount must be a positive number.');
    }

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new Error('A valid date in YYYY-MM-DD format is required.');
    }

    const logItem = await this.repo.recordAdjustment(
      branchId,
      amount,
      dateStr,
      userId,
      notes
    );

    // Invalidate cashier caches for immediate POS sync
    await invalidateCashierAggregates(branchId);

    return logItem;
  }

  /**
   * Gets the active drawer starting float for the Cashier POS based on 9 AM - 12 AM schedule.
   */
  async getActiveDrawerFloat(branchId: number) {
    if (!branchId || branchId <= 0) {
      return { activeFloat: 10000, configuredAmount: 10000, isReset: false };
    }
    return this.repo.getActiveDrawerFloat(branchId);
  }
}

export const moneyDrawerService = new MoneyDrawerService();
