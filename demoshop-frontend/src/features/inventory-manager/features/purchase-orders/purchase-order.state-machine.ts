import type { PurchaseOrderStatus } from './purchase-order.types';

export const purchaseOrderTransitions: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['pending'],
  pending: ['approved', 'rejected'],
  rejected: ['draft', 'pending'],
  approved: ['fulfilled'],
  fulfilled: [],
};

export const canEditPurchaseOrder = (status: PurchaseOrderStatus): boolean =>
  status === 'draft' || status === 'rejected';

export const canSubmitPurchaseOrder = (status: PurchaseOrderStatus): boolean =>
  status === 'draft' || status === 'rejected';

export const canFulfillPurchaseOrder = (status: PurchaseOrderStatus): boolean =>
  status === 'approved';
