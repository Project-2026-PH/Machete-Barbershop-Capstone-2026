import { api } from '@/config/api';
import type { BottleLifecycle } from '../bottle-lifecycle/lifecycle.types';

export const loadBottleConsumptionHistory = async (params?: {
  barberId?: number;
  inventoryStockId?: number;
  limit?: number;
}) => api.get<BottleLifecycle[]>('/api/inventory/bottle-lifecycle/consumption', { params });
