export type PurchaseOrderStockStatus = 'critical' | 'low' | 'normal' | 'overstock';

export interface PurchaseOrderCatalogItem {
  inventoryStockId: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  criticalThreshold: number;
  safetyStock: number | null;
  stockStatus: PurchaseOrderStockStatus;
  costPrice: number;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
}

export interface PurchaseOrderLine {
  id?: string;
  inventoryStockId: string;
  inventoryProductId?: string;
  itemName?: string;
  unit?: string;
  supplierId?: string | null;
  supplierName?: string | null;
  quantityRequested: number;
  unitCost: number | null;
  notes?: string;
  isDeleted?: boolean;
}

export type PurchaseOrderStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'fulfilled';

export interface PurchaseOrder {
  id: string;
  branchId?: number | null;
  poNumber: string;
  status: PurchaseOrderStatus;
  createdByName?: string;
  reviewedByName?: string;
  reviewNotes?: string;
  receiptId?: string | null;
  receiptNumber?: string | null;
  receiptImageUrl?: string | null;
  receiptImageUrls?: string[];
  receiptImageIds?: Array<string | null>;
  notes?: string;
  createdAt?: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  fulfilledAt?: string | null;
  lines: PurchaseOrderLine[];
}
