import type { CreateWalkInOrderRequest } from './cashier-pos.service';
import type { CashierOutboxOperation, CashierOutboxSyncResult } from './cashier-offline.repository';

export type CashierOfflineOperationResult = 'synced' | 'deferred' | 'conflict' | 'unsupported';

interface ApiResult<T = Record<string, unknown>> {
  data: T;
}

export interface CashierOfflineSyncDependencies {
  createWalkInOrder: (payload: CreateWalkInOrderRequest) => Promise<ApiResult<{ id?: number | string | null; status?: string }>>;
  startOfflineService?: (cloudId: string, idempotencyKey: string) => Promise<ApiResult<{ status?: string }>>;
  editOfflineWalkIn?: (
    cloudId: string,
    payload: {
      idempotencyKey: string;
      expectedBarberId: number | null;
      expectedServiceIds: number[];
      barberId?: number | null;
      serviceIds?: number[];
      serviceSnapshot?: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
    },
  ) => Promise<ApiResult<{ status?: string }>>;
  completeOfflineService?: (cloudId: string, idempotencyKey: string) => Promise<ApiResult<{ status?: string }>>;
  cancelOfflineWalkIn?: (cloudId: string, idempotencyKey: string, expectedBarberId: number | null) => Promise<ApiResult<{ status?: string }>>;
  captureCashPayment?: (
    cloudId: string,
    payment: { amount: number; cashReceivedAmount: number; idempotencyKey: string },
  ) => Promise<ApiResult<{
    attempt?: { payment_attempt_id?: number | string } | null;
    receipt?: { receiptDocumentId?: number | string; receiptNumber?: string } | null;
  }>>;
  fetchCloudReceipt?: (cloudId: string) => Promise<ApiResult<{ receiptDocumentId?: number | string; receiptNumber?: string }>>;
  recordPrintMetadata?: (
    cloudId: string,
    payload: {
      idempotencyKey: string;
      attempt: number;
      outcome: 'printed' | 'print_requested' | 'print_failed';
      isReprint: boolean;
      errorMessage: string | null;
      clientOccurredAt: number;
    },
  ) => Promise<unknown>;
  getCloudId?: (localTransactionId: string) => Promise<string | null>;
  markCashierOutboxSending: (operationId: string) => Promise<void>;
  markCashierOutboxSynced?: (operationId: string, result?: CashierOutboxSyncResult) => Promise<boolean>;
  markCashierOutboxRetryable: (
    operationId: string,
    message: string,
    retryCount: number,
    nextRetryAt: number,
  ) => Promise<void>;
  markCashierOutboxConflict: (operationId: string, message: string, permanent: boolean) => Promise<void>;
  /** Backward-compatible create-only test seam. */
  markCashierWalkInSynced?: (operationId: string, cloudId: string) => Promise<void>;
  isConnectivityFailure: (error: unknown) => boolean;
  dispatch?: (eventName: string, detail: Record<string, unknown>) => void;
  now?: () => number;
}

const errorMessage = (error: unknown): string => {
  const value = error as { response?: { data?: { error?: string; message?: string } }; message?: string } | null;
  return value?.response?.data?.error || value?.response?.data?.message || value?.message || 'Sync failed.';
};

const responseStatus = (error: unknown): number =>
  Number((error as { response?: { status?: number } } | null)?.response?.status || 0);

const resultData = <T>(response: ApiResult<T> | null | undefined): T | undefined => response?.data;

const getCloudId = async (
  operation: CashierOutboxOperation,
  dependencies: CashierOfflineSyncDependencies,
): Promise<string> => {
  const value = await dependencies.getCloudId?.(operation.localTransactionId);
  if (!value) {
    const error = new Error('The walk-in must sync before its later offline operations.');
    (error as Error & { response?: { status: number } }).response = { status: 409 };
    throw error;
  }
  return value;
};

const markSynced = async (
  operation: CashierOutboxOperation,
  cloudId: string,
  dependencies: CashierOfflineSyncDependencies,
  result: CashierOutboxSyncResult = {},
): Promise<void> => {
  const transactionSynced = dependencies.markCashierOutboxSynced
    ? await dependencies.markCashierOutboxSynced(operation.operationId, { ...result, cloudId })
    : operation.type === 'create'
      ? (await dependencies.markCashierWalkInSynced?.(operation.operationId, cloudId), true)
      : false;
  if (transactionSynced) {
    dependencies.dispatch?.('cashier-offline-record-synced', {
      localId: operation.localTransactionId,
      cloudId,
    });
  }
};

const processOperationRequest = async (
  operation: CashierOutboxOperation,
  dependencies: CashierOfflineSyncDependencies,
): Promise<void> => {
  if (operation.type === 'create') {
    const storedPayload = operation.payload as CreateWalkInOrderRequest;
    const response = await dependencies.createWalkInOrder({
      ...storedPayload,
      idempotencyKey: operation.idempotencyKey,
    });
    const rawCloudId = resultData(response)?.id;
    const cloudId = rawCloudId === undefined || rawCloudId === null ? '' : String(rawCloudId);
    if (!cloudId) throw new Error('The server accepted the walk-in but returned no cloud ID.');
    await markSynced(operation, cloudId, dependencies);
    return;
  }

  const cloudId = await getCloudId(operation, dependencies);
  if (operation.type === 'edit') {
    const payload = operation.payload as {
      action?: string;
      expectedBarberId?: number | null;
      expectedServiceIds?: number[];
      barberId?: number | null;
      serviceIds?: number[];
      serviceSnapshot?: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
    } | null;
    if (payload?.action === 'start_service' && dependencies.startOfflineService) {
      await dependencies.startOfflineService(cloudId, operation.idempotencyKey);
      await markSynced(operation, cloudId, dependencies);
      return;
    }
    if (payload?.action === 'update_walk_in' && dependencies.editOfflineWalkIn
      && Number.isSafeInteger(Number(payload.expectedBarberId))
      && Array.isArray(payload.expectedServiceIds)) {
      await dependencies.editOfflineWalkIn(cloudId, {
        idempotencyKey: operation.idempotencyKey,
        expectedBarberId: payload.expectedBarberId ?? null,
        expectedServiceIds: payload.expectedServiceIds,
        ...(payload.barberId !== undefined ? { barberId: payload.barberId } : {}),
        ...(payload.serviceIds ? { serviceIds: payload.serviceIds } : {}),
        ...(payload.serviceSnapshot ? { serviceSnapshot: payload.serviceSnapshot } : {}),
      });
      await markSynced(operation, cloudId, dependencies);
      return;
    }
    if (!payload || (payload.action !== 'start_service' && payload.action !== 'update_walk_in')) {
      throw Object.assign(new Error('This offline edit type is not supported by the server sync endpoint.'), {
        response: { status: 422 },
      });
    }
    throw new Error('Offline walk-in edit sync is unavailable.');
  }

  if (operation.type === 'complete') {
    if (!dependencies.completeOfflineService) throw new Error('Offline completion sync is unavailable.');
    await dependencies.completeOfflineService(cloudId, operation.idempotencyKey);
    await markSynced(operation, cloudId, dependencies);
    return;
  }

  if (operation.type === 'cancel') {
    const payload = operation.payload as { action?: string; expectedBarberId?: number | null } | null;
    if (payload?.action !== 'cancel_walk_in' || !dependencies.cancelOfflineWalkIn) {
      throw Object.assign(new Error('Offline cancellation sync is unavailable.'), { response: { status: 422 } });
    }
    await dependencies.cancelOfflineWalkIn(cloudId, operation.idempotencyKey, payload.expectedBarberId ?? null);
    await markSynced(operation, cloudId, dependencies);
    return;
  }

  if (operation.type === 'capture_cash') {
    if (!dependencies.captureCashPayment || !dependencies.fetchCloudReceipt) {
      throw new Error('Offline cash-payment sync is unavailable.');
    }
    const payload = operation.payload as { payment?: { amount?: number; tenderedAmount?: number } } | null;
    const amount = Number(payload?.payment?.amount);
    const cashReceivedAmount = Number(payload?.payment?.tenderedAmount);
    if (!Number.isFinite(amount) || amount <= 0
      || !Number.isFinite(cashReceivedAmount) || cashReceivedAmount < amount) {
      throw Object.assign(new Error('The saved offline cash amount is invalid.'), { response: { status: 422 } });
    }
    const response = await dependencies.captureCashPayment(cloudId, {
      amount,
      cashReceivedAmount,
      idempotencyKey: operation.idempotencyKey,
    });
    let receipt = resultData(response)?.receipt || undefined;
    if (!receipt?.receiptDocumentId || !receipt.receiptNumber) {
      receipt = resultData(await dependencies.fetchCloudReceipt(cloudId));
    }
    if (!receipt?.receiptDocumentId || !receipt.receiptNumber) {
      throw new Error('The payment response did not include its cloud receipt yet.');
    }
    const paymentCloudId = resultData(response)?.attempt?.payment_attempt_id;
    await markSynced(operation, cloudId, dependencies, {
      paymentCloudId: paymentCloudId === undefined ? undefined : String(paymentCloudId),
      cloudReceiptId: String(receipt.receiptDocumentId),
      cloudReceiptNumber: receipt.receiptNumber,
    });
    return;
  }

  if (operation.type === 'print_metadata') {
    if (!dependencies.recordPrintMetadata) throw new Error('Receipt print-history sync is unavailable.');
    const event = operation.payload as {
      attempt?: number;
      outcome?: 'printed' | 'print_requested' | 'print_failed';
      isReprint?: boolean;
      error?: string | null;
      createdAt?: number;
    } | null;
    if (!Number.isSafeInteger(Number(event?.attempt))
      || !['printed', 'print_requested', 'print_failed'].includes(String(event?.outcome))
      || typeof event?.isReprint !== 'boolean'
      || !Number.isFinite(Number(event?.createdAt))) {
      throw Object.assign(new Error('The saved receipt print event is invalid.'), { response: { status: 422 } });
    }
    await dependencies.recordPrintMetadata(cloudId, {
      idempotencyKey: operation.idempotencyKey,
      attempt: Number(event!.attempt),
      outcome: event!.outcome!,
      isReprint: event!.isReprint,
      errorMessage: event!.error || null,
      clientOccurredAt: Number(event!.createdAt),
    });
    await markSynced(operation, cloudId, dependencies);
    return;
  }

  throw Object.assign(new Error(`Offline operation '${operation.type}' has no replay handler yet.`), {
    response: { status: 422 },
  });
};

/** Replays one operation; the durable key makes retry after a lost response safe. */
export const processCashierOutboxOperation = async (
  operation: CashierOutboxOperation,
  dependencies: CashierOfflineSyncDependencies,
): Promise<CashierOfflineOperationResult> => {
  if (operation.status === 'synced') return 'synced';
  await dependencies.markCashierOutboxSending(operation.operationId);

  try {
    await processOperationRequest(operation, dependencies);
    return 'synced';
  } catch (error) {
    const status = responseStatus(error);
    const message = errorMessage(error);
    if (dependencies.isConnectivityFailure(error) || status === 401 || status === 429 || status === 0 || status >= 500) {
      const retryCount = operation.retryCount + 1;
      const delay = Math.min(1_000 * (2 ** Math.min(retryCount, 6)), 60_000);
      await dependencies.markCashierOutboxRetryable(
        operation.operationId,
        message,
        retryCount,
        (dependencies.now?.() ?? Date.now()) + delay,
      );
      dependencies.dispatch?.('cashier-offline-record-retryable', {
        localId: operation.localTransactionId,
        message,
      });
      return 'deferred';
    }

    const isBusinessConflict = status === 409 || status === 422;
    await dependencies.markCashierOutboxConflict(operation.operationId, message, !isBusinessConflict);
    dependencies.dispatch?.('cashier-offline-record-conflict', {
      localId: operation.localTransactionId,
      message,
      permanent: !isBusinessConflict,
    });
    return 'conflict';
  }
};

/** Replays each transaction in sequence while allowing unrelated transactions to sync concurrently. */
export const processCashierOutboxJournal = async (
  operations: CashierOutboxOperation[],
  processOperation: (operation: CashierOutboxOperation) => Promise<CashierOfflineOperationResult>,
  now = Date.now(),
): Promise<Map<string, CashierOfflineOperationResult>> => {
  const grouped = new Map<string, CashierOutboxOperation[]>();
  for (const operation of operations) {
    const group = grouped.get(operation.localTransactionId) || [];
    group.push(operation);
    grouped.set(operation.localTransactionId, group);
  }

  const results = new Map<string, CashierOfflineOperationResult>();
  await Promise.all([...grouped.values()].map(async (group) => {
    for (const operation of group.sort((left, right) => left.sequence - right.sequence)) {
      if (operation.status === 'synced') continue;
      if (operation.status === 'conflict' || operation.status === 'permanent_failure') break;
      if (operation.nextRetryAt && operation.nextRetryAt > now) break;
      const result = await processOperation(operation);
      results.set(operation.operationId, result);
      if (result !== 'synced') break;
    }
  }));
  return results;
};
