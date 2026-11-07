import { api } from '@/config/api';
import type { InventoryManagerSupplier } from './supplier.types';

export const listInventoryManagerSuppliers = async () =>
  api.get<InventoryManagerSupplier[]>('/api/inventory/suppliers');

export const createInventoryManagerSupplier = async (payload: Partial<InventoryManagerSupplier>) =>
  api.post<InventoryManagerSupplier>('/api/inventory/suppliers', payload);

export const updateInventoryManagerSupplier = async (id: string, payload: Partial<InventoryManagerSupplier>) =>
  api.patch<InventoryManagerSupplier>(`/api/inventory/suppliers/${id}`, payload);

export const deactivateInventoryManagerSupplier = async (id: string) =>
  api.delete(`/api/inventory/suppliers/${id}`);

export const assignInventoryDefaultSupplier = async (inventoryStockId: string, supplierId: string | null) =>
  api.patch(`/api/inventory/items/${inventoryStockId}/default-supplier`, { supplierId });
