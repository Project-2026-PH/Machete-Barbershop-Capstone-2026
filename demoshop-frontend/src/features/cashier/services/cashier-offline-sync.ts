import { createWalkInOrder } from './cashier-pos.service';
import {
  captureOfflineCashierPayment,
  cancelOfflineCashierWalkIn,
  completeOfflineCashierService,
  editOfflineCashierWalkIn,
  fetchOfflineCashierReceipt,
  recordOfflineCashierPrintHistory,
  startOfflineCashierService,
} from './cashier-offline-sync-api';
import {
  getCashierConnectivityStatus,
  isCashierConnectivityFailure,
  subscribeToCashierConnectivity,
} from './cashier-connectivity';
import {
  initializeCashierOfflineStorage,
  getLocalCashierWalkIn,
  listCashierOutboxJournal,
  markCashierOutboxConflict,
  markCashierOutboxRetryable,
  markCashierOutboxSending,
  markCashierOutboxSynced,
  type CashierOutboxOperation,
} from './cashier-offline.repository';
import { processCashierOutboxJournal, processCashierOutboxOperation } from './cashier-offline-sync-core';

const SYNC_LOCK_NAME = 'demoshop-cashier-offline-outbox-v1';

const processOperation = async (
  operation: CashierOutboxOperation,
): Promise<'synced' | 'deferred' | 'conflict' | 'unsupported'> => processCashierOutboxOperation(operation, {
  createWalkInOrder,
  startOfflineService: startOfflineCashierService,
  editOfflineWalkIn: editOfflineCashierWalkIn,
  completeOfflineService: completeOfflineCashierService,
  cancelOfflineWalkIn: cancelOfflineCashierWalkIn,
  captureCashPayment: captureOfflineCashierPayment,
  fetchCloudReceipt: fetchOfflineCashierReceipt,
  recordPrintMetadata: recordOfflineCashierPrintHistory,
  getCloudId: async (localTransactionId) => (await getLocalCashierWalkIn(localTransactionId))?.cloudId || null,
  markCashierOutboxSending,
  markCashierOutboxSynced,
  markCashierOutboxRetryable,
  markCashierOutboxConflict,
  isConnectivityFailure: isCashierConnectivityFailure,
  dispatch: (eventName, detail) => window.dispatchEvent(new CustomEvent(eventName, { detail })),
});

const syncOutbox = async (branchId: number, cashierId: string): Promise<void> => {
  if (getCashierConnectivityStatus() !== 'online' || !('locks' in navigator)) return;

  await navigator.locks.request(SYNC_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock || getCashierConnectivityStatus() !== 'online') return;
    const storage = await initializeCashierOfflineStorage();
    if (!storage.available) return;

    const operations = await listCashierOutboxJournal(branchId, cashierId);
    const now = Date.now();
    await processCashierOutboxJournal(operations, async (operation) => {
      if (getCashierConnectivityStatus() !== 'online') return 'deferred';
      return processOperation(operation);
    }, now);

    const remaining = (await listCashierOutboxJournal(branchId, cashierId))
      .filter((operation) => operation.status !== 'synced');
    const nextRetryAt = remaining
      .map((operation) => operation.nextRetryAt)
      .filter((at): at is number => at !== null && Number.isFinite(at) && at > Date.now())
      .sort((left, right) => left - right)[0];
    if (nextRetryAt) {
      window.dispatchEvent(new CustomEvent('cashier-offline-sync-retry-scheduled', { detail: { nextRetryAt } }));
    }
  });
};

export const startCashierOfflineSync = (branchId: number, cashierId: string): (() => void) => {
  if (!Number.isInteger(branchId) || branchId < 1 || !cashierId) return () => undefined;

  let stopped = false;
  let running = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerSync = (): void => {
    if (stopped || running || getCashierConnectivityStatus() !== 'online') return;
    running = true;
    void syncOutbox(branchId, cashierId).catch((error) => {
      console.warn('[CashierOfflineSync] Outbox sync could not start:', error);
    }).finally(() => {
      running = false;
    });
  };

  const handleRetryScheduled = (event: Event): void => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    const nextRetryAt = Number((event as CustomEvent<{ nextRetryAt?: number }>).detail?.nextRetryAt);
    if (!Number.isFinite(nextRetryAt)) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      triggerSync();
    }, Math.max(0, nextRetryAt - Date.now()));
  };

  const unsubscribe = subscribeToCashierConnectivity((next) => {
    if (next === 'online') triggerSync();
  });
  const handleSyncRequested = (): void => triggerSync();
  window.addEventListener('cashier-offline-sync-requested', handleSyncRequested);
  window.addEventListener('cashier-offline-sync-retry-scheduled', handleRetryScheduled);
  if (getCashierConnectivityStatus() === 'online') triggerSync();

  return () => {
    stopped = true;
    unsubscribe();
    window.removeEventListener('cashier-offline-sync-requested', handleSyncRequested);
    window.removeEventListener('cashier-offline-sync-retry-scheduled', handleRetryScheduled);
    if (retryTimer !== null) clearTimeout(retryTimer);
  };
};
