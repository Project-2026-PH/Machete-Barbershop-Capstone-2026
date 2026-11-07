import { api } from '@/config/api';
import type { ExpirableStockResponse, DisposeUnitResponse } from '@demoshop/shared-types';

export const fetchExpirableStock = async () =>
  api.get<ExpirableStockResponse>('/api/inventory/expirable-stock');

export const disposeExpiredUnit = async (unitId: string, reason?: string) =>
  api.post<DisposeUnitResponse>(`/api/inventory/expirable-stock/units/${encodeURIComponent(unitId)}/dispose`, { reason });
