import { api } from '@/config/api';
import type { BarberPerformanceReviewsResponse } from '@demoshop/shared-types';

export interface GetBarberPerformanceReviewsParams {
  branchId?: number;
  startDate?: string;
  endDate?: string;
  barberId?: number;
}

export const adminReviewsService = {
  /**
   * Retrieves aggregated barber performance metrics, service tallies, and customer reviews.
   */
  async getBarberPerformanceReviews(
    params?: GetBarberPerformanceReviewsParams
  ): Promise<BarberPerformanceReviewsResponse> {
    const queryParams: Record<string, string | number> = {};
    if (params?.branchId) queryParams.branchId = params.branchId;
    if (params?.startDate) queryParams.startDate = params.startDate;
    if (params?.endDate) queryParams.endDate = params.endDate;
    if (params?.barberId) queryParams.barberId = params.barberId;

    const response = await api.get<BarberPerformanceReviewsResponse>(
      '/api/admin/barber-performance-reviews',
      {
        params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      }
    );
    return response.data;
  },
};
