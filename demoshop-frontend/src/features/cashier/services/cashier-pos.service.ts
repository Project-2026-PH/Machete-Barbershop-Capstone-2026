import { api } from '@/config/api';
import type { BranchInvoiceProfile, ReceiptResponse } from '@demoshop/shared-types';
import { cachedCashierRequest, invalidateCashierRequests } from './shared-request-cache';

export interface CreateWalkInOrderRequest {
  customerName: string;
  barberId?: number;
  serviceIds: number[];
  retailItems?: Array<{ productId: number; quantity: number }>;
  reservationCode?: string;
  idempotencyKey: string;
  isPrePaid: false;
}

export interface CreateWalkInOrderResponse {
  transactions?: unknown[];
  id?: string | number;
  position?: number;
  barberId?: number;
  barberName?: string;
  status?: string;
  assignedBy?: string;
  offline?: boolean;
  reconciledReservation?: boolean;
}

export interface CreateRetailSaleRequest {
  customerName?: string;
  items: Array<{ productId: number; quantity: number }>;
  paymentMethod?: 'Cash' | 'GCash';
  gcashRefNo?: string;
  idempotencyKey: string;
}

export interface CreateRetailSaleResponse {
  transactionId: number;
  queueEntryId: null;
  customerName: string;
  paymentMethod: 'Cash' | 'GCash';
  totalAmount: number;
  items: Array<{ productId: number; quantity: number; unitPrice: number; name: string }>;
  createdAt?: string;
  /** Printable receipt snapshot. Retail sales have no queue entry, so this is
   *  scoped by transaction and is the customer's only copy. */
  receipt?: ReceiptResponse | null;
}

export const createWalkInOrder = async (payload: CreateWalkInOrderRequest) => {
  const response = await api.post<CreateWalkInOrderResponse>('/api/cashier/walk-in', payload, {
    timeout: 15_000,
    _cashierOfflineManaged: true,
  } as any);
  invalidateCashierRequests();
  return response;
};

export const fetchOfflineReceiptProfile = async (branchId: number): Promise<BranchInvoiceProfile | null> =>
  (await cachedCashierRequest(
    `offline-receipt-profile:${branchId}`,
    () => api.get<BranchInvoiceProfile | null>('/api/cashier/offline-receipt-profile'),
    30 * 60_000,
  )).data;

export const createRetailSale = async (payload: CreateRetailSaleRequest) => {
  const response = await api.post<CreateRetailSaleResponse>('/api/cashier/retail-sale', payload);
  invalidateCashierRequests();
  return response;
};
