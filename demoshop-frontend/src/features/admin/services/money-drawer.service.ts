import { api } from '@/config/api';
import type {
  MoneyDrawerStatusResponse,
  AdjustMoneyDrawerRequest,
  MoneyDrawerLogItem,
} from '@demoshop/shared-types';

export const moneyDrawerService = {
  /**
   * Retrieves current expected cash status, schedule state, and changes history.
   */
  async getDrawerStatus(branchId?: number, date?: string): Promise<MoneyDrawerStatusResponse> {
    const params: Record<string, string | number> = {};
    if (branchId) params.branchId = branchId;
    if (date) params.date = date;

    const response = await api.get<MoneyDrawerStatusResponse>('/api/admin/money-drawer', {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return response.data;
  },

  /**
   * Adjusts the starting expected cash float amount for a target date.
   * Enforces once-per-calendar-day limit.
   */
  async adjustAmount(payload: AdjustMoneyDrawerRequest): Promise<{
    success: boolean;
    message: string;
    log: MoneyDrawerLogItem;
  }> {
    const response = await api.post<{
      success: boolean;
      message: string;
      log: MoneyDrawerLogItem;
    }>('/api/admin/money-drawer/adjust', payload);
    return response.data;
  },
};
