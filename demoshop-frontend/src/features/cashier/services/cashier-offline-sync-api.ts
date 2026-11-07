import { api } from '@/config/api';
import type { ReceiptResponse } from '@demoshop/shared-types';
import { invalidateCashierRequests } from './shared-request-cache';

const managedRequest = { _cashierOfflineManaged: true, timeout: 15_000 } as any;

export const startOfflineCashierService = async (queueId: string, idempotencyKey: string) => {
  const response = await api.post(`/api/queue/${queueId}/offline-service-start`, { idempotencyKey }, managedRequest);
  invalidateCashierRequests();
  return response;
};

export const editOfflineCashierWalkIn = async (
  queueId: string,
  input: {
    idempotencyKey: string;
    expectedBarberId: number | null;
    expectedServiceIds: number[];
    barberId?: number | null;
    serviceIds?: number[];
    serviceSnapshot?: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
  },
) => {
  const response = await api.post(`/api/queue/${queueId}/offline-edit`, input, managedRequest);
  invalidateCashierRequests();
  return response;
};

export const completeOfflineCashierService = async (queueId: string, idempotencyKey: string) => {
  const response = await api.post(`/api/queue/${queueId}/offline-service-complete`, { idempotencyKey }, managedRequest);
  invalidateCashierRequests();
  return response;
};

export const cancelOfflineCashierWalkIn = async (
  queueId: string,
  idempotencyKey: string,
  expectedBarberId: number | null,
) => {
  const response = await api.post(
    `/api/queue/${queueId}/offline-cancel`,
    { idempotencyKey, expectedBarberId },
    managedRequest,
  );
  invalidateCashierRequests();
  return response;
};

export const captureOfflineCashierPayment = async (
  queueId: string,
  input: { amount: number; cashReceivedAmount: number; idempotencyKey: string },
) => {
  const payload = new FormData();
  payload.append('method', 'Cash');
  payload.append('amount', String(input.amount));
  payload.append('cashReceivedAmount', String(input.cashReceivedAmount));
  payload.append('idempotencyKey', input.idempotencyKey);
  payload.append('cashierConfirmed', 'true');
  const response = await api.post(`/api/queue/${queueId}/pay`, payload, managedRequest);
  invalidateCashierRequests();
  return response;
};

export const fetchOfflineCashierReceipt = (queueId: string) =>
  api.get<ReceiptResponse>(`/api/queue/${queueId}/receipt`, managedRequest);

export const recordOfflineCashierPrintHistory = async (
  queueId: string,
  input: {
    idempotencyKey: string;
    attempt: number;
    outcome: 'printed' | 'print_requested' | 'print_failed';
    isReprint: boolean;
    errorMessage: string | null;
    clientOccurredAt: number;
  },
) => {
  const response = await api.post(`/api/queue/${queueId}/receipt/print-history`, input, managedRequest);
  invalidateCashierRequests();
  return response;
};
