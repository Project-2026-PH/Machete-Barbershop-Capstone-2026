import { api } from '@/config/api';
import type { BranchStatsResponse, DashboardCustomerSatisfaction } from '@demoshop/shared-types';

export const adminDashboardService = {
  async getCustomerReviews(page = 1): Promise<{ reviews: NonNullable<DashboardCustomerSatisfaction['recent_reviews']>; total: number; page: number; limit: number }> {
    const response = await api.get('/api/admin/customer-reviews', { params: { page, limit: 10 } });
    return response.data;
  },
  /**
   * Retrieves aggregated live branch statistics and today's schedule for Admin Dashboard.
   */
  async getBranchStats(branchId?: number, month?: string): Promise<BranchStatsResponse> {
    const params: Record<string, string | number> = {};
    if (branchId) params.branchId = branchId;
    if (month) params.month = month;
    const response = await api.get<BranchStatsResponse>('/api/admin/branch-stats', {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return response.data;
  },
};
