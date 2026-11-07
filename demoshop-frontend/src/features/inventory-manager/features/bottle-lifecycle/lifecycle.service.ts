import { api } from '@/config/api';
import type { PurchaseOrderCatalogItem } from '../purchase-orders/purchase-order.types';
import type { BottleLifecycle, InventoryHandout, InventoryManagerBarber } from './lifecycle.types';

export const listInventoryBarbers = async () =>
  api.get<InventoryManagerBarber[]>('/api/inventory/barbers');

export const loadBottleLifecycleWorkspace = async () =>
  Promise.all([
    api.get<BottleLifecycle[]>('/api/inventory/bottle-lifecycle'),
    api.get<InventoryManagerBarber[]>('/api/inventory/barbers'),
    api.get<PurchaseOrderCatalogItem[]>('/api/inventory/handouts/catalog'),
    api.get<InventoryHandout[]>('/api/inventory/handouts'),
  ]);

type InventoryHandoutResponse = Partial<BottleLifecycle> & {
  id: string;
  inventoryStockId: string;
  itemName: string;
  unit: string;
  quantity: number;
  barberId: number;
  barberName: string;
  status: 'issued' | 'returned' | 'handed_out';
  handout: InventoryHandout;
};

export const recordInventoryHandout = async (payload: { inventoryStockId: number; barberId: number; quantity: number; notes?: string }) =>
  api.post<InventoryHandoutResponse>('/api/inventory/handouts', payload);

export interface BottleReturnPayload {
  returnCondition?: 'empty' | 'partially_used';
  estimatedRemainingPercent?: number;
  notes?: string;
}

export const returnBottle = async (id: string, payload: BottleReturnPayload = {}) =>
  api.post<BottleLifecycle>(`/api/inventory/bottle-lifecycle/${id}/return`, payload);
