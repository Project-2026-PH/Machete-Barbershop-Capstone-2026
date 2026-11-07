import { api } from '@/config/api';
import type { InventoryManagerSupplier } from '../suppliers/supplier.types';
import type { PurchaseOrder, PurchaseOrderCatalogItem, PurchaseOrderLine } from './purchase-order.types';

const purchaseOrderPayload = (notes: string, lines: PurchaseOrderLine[], status: 'draft' | 'pending' = 'pending') => ({
  notes: notes.trim() || undefined,
  status,
  lines: lines.map((line) => ({
    inventoryStockId: Number(line.inventoryStockId),
    supplierId: line.supplierId || null,
    quantityRequested: line.quantityRequested,
    unitCost: line.unitCost,
    notes: line.notes?.trim() || undefined,
  })),
});

export const listPurchaseOrderCatalog = async () =>
  api.get<PurchaseOrderCatalogItem[]>('/api/inventory/purchase-orders/catalog');

export const loadPurchaseOrderWorkspace = async () =>
  Promise.all([
    api.get<PurchaseOrder[]>('/api/inventory/purchase-orders'),
    api.get<InventoryManagerSupplier[]>('/api/inventory/suppliers'),
    listPurchaseOrderCatalog(),
    api.get('/api/inventory/receipts'),
  ]);

export const createPurchaseOrder = async (notes: string, lines: PurchaseOrderLine[], status: 'draft' | 'pending' = 'pending') =>
  api.post<PurchaseOrder>('/api/inventory/purchase-orders', purchaseOrderPayload(notes, lines, status));

export const updatePurchaseOrder = async (id: string, notes: string, lines: PurchaseOrderLine[], status: 'draft' | 'pending' = 'pending') =>
  api.patch<PurchaseOrder>(`/api/inventory/purchase-orders/${id}`, purchaseOrderPayload(notes, lines, status));

export const deletePurchaseOrder = async (id: string) =>
  api.delete(`/api/inventory/purchase-orders/${id}`);

export const submitPurchaseOrder = async (id: string) =>
  api.post<PurchaseOrder>(`/api/inventory/purchase-orders/${id}/submit`);

export const reviewPurchaseOrder = async (id: string, decision: 'approved' | 'rejected', reviewNotes?: string) =>
  api.patch<PurchaseOrder>(`/api/inventory/purchase-orders/${id}/review`, { decision, reviewNotes });

export const fulfillPurchaseOrder = async (id: string, receiptId?: string | null) =>
  api.post<PurchaseOrder>(`/api/inventory/purchase-orders/${id}/fulfill`, { receiptId: receiptId || undefined });

export const uploadInventoryReceipt = async (payload: {
  file: File;
  receiptNumber?: string;
  supplierId?: string | null;
  purchaseDate: string;
  totalAmount?: number | null;
  notes?: string;
}) => {
  const formData = new FormData();
  formData.append('receipt', payload.file);
  formData.append('purchaseDate', payload.purchaseDate);
  if (payload.receiptNumber) formData.append('receiptNumber', payload.receiptNumber);
  if (payload.supplierId) formData.append('supplierId', payload.supplierId);
  if (payload.totalAmount != null) formData.append('totalAmount', String(payload.totalAmount));
  if (payload.notes) formData.append('notes', payload.notes);
  return api.post('/api/inventory/receipts', formData);
};

export const linkInventoryReceipt = async (receiptId: string, purchaseOrderIds: string[]) =>
  api.post(`/api/inventory/receipts/${receiptId}/link`, { purchaseOrderIds });
