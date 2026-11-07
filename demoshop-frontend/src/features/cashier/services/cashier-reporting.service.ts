import { api } from '@/config/api';
import { cachedCashierRequest, invalidateCashierRequests } from './shared-request-cache';

export type DashboardTransactionQuery = Record<string, string | number>;
export type DashboardSnapshotSection = 'summary' | 'barbers' | 'transactions' | 'all';
export type BarberBreakdownDateRange = 'today' | 'week' | 'month';

export interface ReportPageQuery {
  page: number;
  limit: number;
  sortBy: string;
}

export interface DailySummaryResponse {
  total_revenue: number;
  total_customers: number;
  cash_sales: number;
  default_cash_count: number;
  expected_cash: number;
}

export interface CashierDashboardSnapshotResponse {
  summary?: DailySummaryResponse;
  barbers?: any[];
  transactions?: any[];
  transactionsTotal?: number;
  transactionsTotalPages?: number;
  transactionsPage?: number;
  transactionsLimit?: number;
}

export const fetchCashierDashboardSnapshot = (
  params: {
    barberDateRange?: BarberBreakdownDateRange;
    page?: number;
    limit?: number;
    dateRange?: 'all' | 'today' | 'week' | 'month';
    barberId?: number;
    search?: string;
    sections?: DashboardSnapshotSection[];
  } = {},
  scope = 'current',
) => cachedCashierRequest(
  `report:snapshot:${scope}:${JSON.stringify(params)}`,
  () => api.get<CashierDashboardSnapshotResponse>('/api/cashier/dashboard/snapshot', {
    params: {
      ...params,
      sections: params.sections?.join(','),
    },
  }),
  1_000,
);

export const fetchDailySummary = (scope = 'current') => cachedCashierRequest(
  `report:daily-summary:${scope}`,
  () => api.get<DailySummaryResponse>('/api/cashier/dashboard/daily-summary'),
  2_000,
);
export const fetchBarberBreakdown = (dateRange: BarberBreakdownDateRange = 'today', scope = 'current') =>
  cachedCashierRequest(
    `report:barber-breakdown:${scope}:${dateRange}`,
    () => api.get('/api/cashier/dashboard/barber-breakdown', { params: { dateRange } }),
    2_000,
  );
export const fetchDashboardTransactions = (params: DashboardTransactionQuery, scope = 'current') =>
  cachedCashierRequest(
    `report:transactions:${scope}:${JSON.stringify(params)}`,
    () => api.get('/api/cashier/dashboard/transactions', { params }),
    1_000,
  );
export const fetchTodaysSales = (params: ReportPageQuery, scope = 'current') => cachedCashierRequest(
  `report:sales:${scope}:${JSON.stringify(params)}`,
  () => api.get('/api/cashier/sales/today', { params }),
  1_000,
);
export const updateReservationFeeGcashReference = (transactionId: number | string, reference: string) => {
  const response = api.put(`/api/cashier/sales/${transactionId}/reservation-fee-gcash-reference`, { reference });
  invalidateCashierRequests('report:sales:');
  invalidateCashierRequests('report:snapshot:');
  return response;
};
export const uploadReservationFeeGcashReceipt = (transactionId: number | string, file: File, reference?: string | null) => {
  const form = new FormData();
  form.append('receipt', file);
  if (reference?.trim()) form.append('reference', reference.trim());
  const response = api.post(`/api/cashier/sales/${transactionId}/reservation-fee-receipt`, form);
  invalidateCashierRequests('report:sales:');
  invalidateCashierRequests('report:snapshot:');
  return response;
};
export const getReservationFeeGcashReceiptUrl = (transactionId: number | string) =>
  api.get<{ url: string; expiresInSeconds: number }>(`/api/cashier/sales/${transactionId}/reservation-fee-receipt-url`);
export const getPaymentAttemptReceiptUrl = (attemptId: number) =>
  api.get<{ url: string; expiresInSeconds: number }>(`/api/payment-attempts/${attemptId}/receipt-url`);

export const uploadPaymentAttemptEvidence = (attemptId: number, file: File, gcashReference?: string | null) => {
  const form = new FormData();
  form.append('receipt', file);
  if (gcashReference?.trim()) form.append('gcashReference', gcashReference.trim());
  return api.post(`/api/payment-attempts/${attemptId}/evidence`, form);
};
export const fetchCustomersServed = (params: ReportPageQuery, scope = 'current') => cachedCashierRequest(
  `report:customers-served:${scope}:${JSON.stringify(params)}`,
  () => api.get('/api/cashier/customers-served', { params }),
  1_000,
);
