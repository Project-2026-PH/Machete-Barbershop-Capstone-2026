import { api } from '@/config/api';
import { cachedCashierRequest, invalidateCashierRequests } from './shared-request-cache';

export interface StockCountPayload {
  countDate: string;
  shift: string;
  notes: string;
  lines: Array<{ inventoryStockId: number; countedQuantity: number }>;
}

export const fetchInventoryView = (scope = 'current') => cachedCashierRequest(
  `inventory:view:${scope}`,
  () => api.get('/api/inventory'),
  15_000,
);

export const submitStockCount = async (payload: StockCountPayload) => {
  const response = await api.post('/api/inventory/counts', payload);
  invalidateCashierRequests();
  return response;
};
