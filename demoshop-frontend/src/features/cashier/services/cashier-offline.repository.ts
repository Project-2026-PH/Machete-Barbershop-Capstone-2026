import type { BarberInfo, CustomerInfo, ReservationInfo } from '../components/queue/types';
import type { BranchInvoiceProfile } from '@demoshop/shared-types';
import {
  CASHIER_OFFLINE_CATALOG_MAX_AGE_MS,
  CASHIER_OFFLINE_QUEUE_SNAPSHOT_MAX_AGE_MS,
  CASHIER_OFFLINE_RESERVATION_SNAPSHOT_MAX_AGE_MS,
} from './cashier-cache-policy';
export {
  CASHIER_OFFLINE_CATALOG_MAX_AGE_MS,
  CASHIER_OFFLINE_QUEUE_SNAPSHOT_MAX_AGE_MS,
  CASHIER_OFFLINE_RESERVATION_SNAPSHOT_MAX_AGE_MS,
} from './cashier-cache-policy';

export interface CashierDraftRecord {
  key: string;
  branchId: number;
  cashierId: string;
  customerName: string;
  serviceId: string;
  barberId: string;
  updatedAt: number;
}

export type LocalTransactionStatus =
  | 'draft'
  | 'queued'
  | 'in_service'
  | 'completed'
  | 'cancelled';

export type LocalTransactionSyncStatus =
  | 'pending'
  | 'sending'
  | 'synced'
  | 'retryable'
  | 'conflict'
  | 'failed';

export interface LocalWalkInEditHistoryEntry {
  operationId: string;
  sequence: number;
  changedAt: number;
  before: {
    barberId: number | null;
    barberName: string | null;
    serviceIds: number[];
    serviceSnapshot: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
  };
  after: {
    barberId: number | null;
    barberName: string | null;
    serviceIds: number[];
    serviceSnapshot: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
  };
}

export interface LocalWalkInTransaction {
  localId: string;
  cloudId: string | null;
  scopeKey: string;
  branchId: number;
  cashierId: string;
  deviceId?: string;
  customerName: string;
  barberId: number | null;
  barberName?: string;
  serviceIds: number[];
  serviceSnapshot: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
  status: LocalTransactionStatus;
  syncStatus: LocalTransactionSyncStatus;
  paymentStatus?: 'unpaid' | 'paid';
  editHistory?: LocalWalkInEditHistoryEntry[];
  version: number;
  createdAt: number;
  updatedAt: number;
  idempotencyKey: string;
}

export interface LocalCashierPayment {
  localId: string;
  cloudId: string | null;
  localTransactionId: string;
  branchId: number;
  version: number;
  method: 'cash';
  amount: number;
  tenderedAmount: number;
  changeAmount: number;
  status: 'captured_locally' | 'pending_sync' | 'synced' | 'conflict';
  cashierId: string;
  createdAt: number;
  updatedAt: number;
  idempotencyKey: string;
}

export interface LocalCashierReceipt {
  localId: string;
  cloudId: string | null;
  localTransactionId: string;
  branchId: number;
  cashierId: string;
  receiptNumber: string;
  snapshot: Readonly<Record<string, unknown>>;
  status: 'ready' | 'printed' | 'print_requested' | 'print_failed' | 'synced';
  syncStatus?: 'pending' | 'sending' | 'retryable' | 'conflict' | 'failed' | 'synced';
  version: number;
  printAttemptCount: number;
  printHistory?: Array<{
    attempt: number;
    outcome: 'printed' | 'print_requested' | 'print_failed';
    isReprint: boolean;
    error: string | null;
    createdAt: number;
  }>;
  lastPrintError: string | null;
  cloudReceiptId: string | null;
  cloudReceiptNumber?: string | null;
  createdAt: number;
  updatedAt: number;
  idempotencyKey: string;
}

export type CashierOutboxOperationType =
  | 'create'
  | 'edit'
  | 'assign_barber'
  | 'change_service'
  | 'capture_cash'
  | 'complete'
  | 'cancel'
  | 'print_metadata';

export interface CashierOutboxOperation {
  operationId: string;
  localTransactionId: string;
  branchId: number;
  cashierId: string;
  /** Opaque local device identifier; never an auth credential. */
  deviceId?: string;
  type: CashierOutboxOperationType;
  payload: unknown;
  sequence: number;
  idempotencyKey: string;
  status: 'pending' | 'sending' | 'synced' | 'retryable' | 'conflict' | 'permanent_failure';
  retryCount: number;
  lastError: string | null;
  nextRetryAt: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
}

export interface OfflineStorageInitialization {
  available: boolean;
  persistent: boolean;
}

export interface CashierOfflineCatalogSnapshot {
  key: string;
  scopeKey: string;
  branchId: number;
  cashierId: string;
  capturedAt: number;
  services: Array<{
    id: string;
    name: string;
    price: number;
    duration: number;
    priceKnown: boolean;
    durationKnown: boolean;
  }>;
  barbers: Array<{ id: string; name: string }>;
  invoiceProfile?: BranchInvoiceProfile | null;
}

export type CachedCashierReservation = Pick<ReservationInfo,
  | 'id'
  | 'name'
  | 'barberId'
  | 'service'
  | 'servicePrice'
  | 'date'
  | 'time'
  | 'status'
  | 'createdAt'
  | 'reservationFeePaid'
  | 'reservationFeeAmount'
  | 'reservationFeeMethod'
>;

export interface CashierOfflineReservationSnapshot {
  key: string;
  scopeKey: string;
  branchId: number;
  cashierId: string;
  capturedAt: number;
  reservations: CachedCashierReservation[];
}

export interface CashierOfflineQueueSnapshot {
  key: string;
  scopeKey: string;
  branchId: number;
  cashierId: string;
  capturedAt: number;
  barbers: BarberInfo[];
  queue: CustomerInfo[];
}

const isSnapshotWithinMaxAge = (capturedAt: number, maxAgeMs: number, now = Date.now()): boolean => {
  const age = now - capturedAt;
  return Number.isFinite(capturedAt) && age >= 0 && age <= maxAgeMs;
};

const DATABASE_NAME = 'demoshop-cashier-offline';
const DATABASE_VERSION = 3;
const DRAFTS_STORE = 'drafts';
const TRANSACTIONS_STORE = 'transactions';
const OUTBOX_STORE = 'outbox';
const PAYMENTS_STORE = 'payments';
const RECEIPTS_STORE = 'receipts';
const CATALOG_STORE = 'catalog';
const RESERVATIONS_STORE = 'reservationSnapshots';
const METADATA_STORE = 'metadata';

let databasePromise: Promise<IDBDatabase> | null = null;
let initializationPromise: Promise<OfflineStorageInitialization> | null = null;
let outboxChannel: BroadcastChannel | null = null;

const notifyCashierOfflineOutboxChanged = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('cashier-offline-outbox-changed'));
  } catch {}
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      outboxChannel ??= new BroadcastChannel('demoshop-cashier-offline-outbox');
      outboxChannel.postMessage({ type: 'changed' });
    }
  } catch {}
};

const requestValue = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const transactionComplete = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted'));
});

const openDatabase = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser context'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFTS_STORE)) {
        database.createObjectStore(DRAFTS_STORE, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(TRANSACTIONS_STORE)) {
        const store = database.createObjectStore(TRANSACTIONS_STORE, { keyPath: 'localId' });
        store.createIndex('scopeKey', 'scopeKey', { unique: false });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = database.createObjectStore(OUTBOX_STORE, { keyPath: 'operationId' });
        store.createIndex('localTransactionId', 'localTransactionId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('branchCashier', ['branchId', 'cashierId'], { unique: false });
      } else {
        const store = request.transaction?.objectStore(OUTBOX_STORE);
        if (store && !store.indexNames.contains('branchCashier')) {
          store.createIndex('branchCashier', ['branchId', 'cashierId'], { unique: false });
        }
      }
      if (!database.objectStoreNames.contains(PAYMENTS_STORE)) {
        const store = database.createObjectStore(PAYMENTS_STORE, { keyPath: 'localId' });
        store.createIndex('localTransactionId', 'localTransactionId', { unique: false });
      }
      if (!database.objectStoreNames.contains(RECEIPTS_STORE)) {
        const store = database.createObjectStore(RECEIPTS_STORE, { keyPath: 'localId' });
        store.createIndex('localTransactionId', 'localTransactionId', { unique: false });
      }
      if (!database.objectStoreNames.contains(CATALOG_STORE)) {
        database.createObjectStore(CATALOG_STORE, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(RESERVATIONS_STORE)) {
        database.createObjectStore(RESERVATIONS_STORE, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('Unable to open cashier offline storage'));
    request.onblocked = () => reject(new Error('Cashier offline storage upgrade is blocked by another tab'));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise!;
};

/** Returns a stable, non-secret device identifier for local audit records. */
export const getCashierOfflineDeviceId = async (): Promise<string> => {
  const database = await openDatabase();
  const transaction = database.transaction(METADATA_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  const store = transaction.objectStore(METADATA_STORE);
  const request = store.get('cashier-offline-device-id');
  let deviceId = '';
  request.onsuccess = () => {
    const existing = request.result?.value;
    if (typeof existing === 'string' && existing) {
      deviceId = existing;
      return;
    }
    deviceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    store.put({ key: 'cashier-offline-device-id', value: deviceId, createdAt: Date.now() });
  };
  await completed;
  if (!deviceId) throw new Error('Unable to initialize the cashier device audit identifier.');
  return deviceId;
};

export const initializeCashierOfflineStorage = (): Promise<OfflineStorageInitialization> => {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const database = await openDatabase();
      let persistent = false;
      try {
        if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
          persistent = await navigator.storage.persist();
        }
      } catch {
        persistent = false;
      }

      const transaction = database.transaction(METADATA_STORE, 'readwrite');
      const completed = transactionComplete(transaction);
      transaction.objectStore(METADATA_STORE).put({
        key: 'storage-persisted',
        value: persistent,
        checkedAt: Date.now(),
      });
      await completed;
      return { available: true, persistent };
    } catch {
      initializationPromise = null;
      return { available: false, persistent: false };
    }
  })();

  return initializationPromise;
};

export const getCashierDraft = async (key: string): Promise<CashierDraftRecord | null> => {
  const database = await openDatabase();
  const transaction = database.transaction(DRAFTS_STORE, 'readonly');
  const result = await requestValue<CashierDraftRecord | undefined>(transaction.objectStore(DRAFTS_STORE).get(key));
  return result ?? null;
};

export const saveCashierDraft = async (draft: CashierDraftRecord): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction(DRAFTS_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  transaction.objectStore(DRAFTS_STORE).put(draft);
  await completed;
};

export const deleteCashierDraft = async (key: string): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction(DRAFTS_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  transaction.objectStore(DRAFTS_STORE).delete(key);
  await completed;
};

/** Atomically creates a local walk-in and its first sync operation. */
export const commitLocalWalkIn = async (
  walkIn: LocalWalkInTransaction,
  operation: CashierOutboxOperation,
): Promise<void> => {
  if (
    walkIn.localId !== operation.localTransactionId
    || walkIn.scopeKey !== `${walkIn.branchId}:${walkIn.cashierId}`
    || walkIn.branchId < 1
    || !walkIn.cashierId
    || operation.branchId !== walkIn.branchId
    || operation.cashierId !== walkIn.cashierId
    || operation.idempotencyKey !== walkIn.idempotencyKey
    || operation.type !== 'create'
    || operation.sequence !== 1
  ) {
    throw new Error('Walk-in and outbox operation must share a valid local transaction scope');
  }

  const deviceId = await getCashierOfflineDeviceId();
  const database = await openDatabase();
  const transaction = database.transaction([TRANSACTIONS_STORE, OUTBOX_STORE, DRAFTS_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  transaction.objectStore(TRANSACTIONS_STORE).add({ ...walkIn, deviceId });
  transaction.objectStore(OUTBOX_STORE).add({ ...operation, deviceId });
  transaction.objectStore(DRAFTS_STORE).delete(walkIn.scopeKey);
  await completed;
  notifyCashierOfflineOutboxChanged();
};

export const transitionLocalWalkInStatus = async (
  localTransactionId: string,
  branchId: number,
  cashierId: string,
  nextStatus: 'in_service' | 'completed' | 'cancelled',
  now = Date.now(),
): Promise<LocalWalkInTransaction> => {
  const deviceId = await getCashierOfflineDeviceId();
  const database = await openDatabase();
  const transaction = database.transaction([TRANSACTIONS_STORE, OUTBOX_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  const transactionStore = transaction.objectStore(TRANSACTIONS_STORE);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  let validationError: Error | null = null;
  let updatedWalkIn: LocalWalkInTransaction | null = null;
  const walkInRequest = transactionStore.get(localTransactionId);
  walkInRequest.onsuccess = () => {
    const walkIn = walkInRequest.result as LocalWalkInTransaction | undefined;
    if (!walkIn
      || walkIn.branchId !== branchId
      || walkIn.cashierId !== cashierId
      || walkIn.scopeKey !== `${branchId}:${cashierId}`
      || walkIn.paymentStatus === 'paid') {
      validationError = new Error('Offline service transition is outside the active cashier scope');
      transaction.abort();
      return;
    }
    const allowed = (walkIn.status === 'queued' && (nextStatus === 'in_service' || nextStatus === 'cancelled'))
      || (walkIn.status === 'in_service' && nextStatus === 'completed');
    if (!allowed) {
      validationError = walkIn.status === nextStatus
        ? null
        : new Error(`Cannot move this offline walk-in from ${walkIn.status} to ${nextStatus}`);
      if (walkIn.status === nextStatus) {
        updatedWalkIn = walkIn;
        return;
      }
      transaction.abort();
      return;
    }

    const outboxRead = outboxStore.index('localTransactionId').getAll(localTransactionId);
    outboxRead.onerror = () => transaction.abort();
    outboxRead.onsuccess = () => {
      const operations = outboxRead.result as CashierOutboxOperation[];
      const type: CashierOutboxOperationType = nextStatus === 'completed'
        ? 'complete'
        : nextStatus === 'cancelled'
          ? 'cancel'
          : 'edit';
      const action = nextStatus === 'completed'
        ? 'complete_service'
        : nextStatus === 'cancelled'
          ? 'cancel_walk_in'
          : 'start_service';
      const operationId = `${localTransactionId}:${nextStatus === 'in_service' ? 'start_service' : nextStatus}`;
      const existing = operations.find((operation) => operation.operationId === operationId);
      if (existing) {
        const stableKey = nextStatus === 'in_service'
          ? `${walkIn.idempotencyKey}:edit`
          : `${walkIn.idempotencyKey}:${nextStatus === 'completed' ? 'complete' : 'cancel'}`;
        if (existing.type === type && existing.idempotencyKey === stableKey) {
          updatedWalkIn = walkIn;
          return;
        }
        validationError = new Error('An offline service operation already exists with different data');
        transaction.abort();
        return;
      }
      const sequence = operations.reduce((max, operation) => Math.max(max, operation.sequence), 0) + 1;
      const operation: CashierOutboxOperation = {
        operationId,
        localTransactionId,
        branchId,
        cashierId,
        deviceId,
        type,
        payload: {
          localTransactionId,
          action,
          ...(nextStatus === 'cancelled' ? { expectedBarberId: walkIn.barberId } : {}),
        },
        sequence,
        idempotencyKey: nextStatus === 'in_service'
          ? `${walkIn.idempotencyKey}:edit`
          : `${walkIn.idempotencyKey}:${nextStatus === 'completed' ? 'complete' : 'cancel'}`,
        status: 'pending',
        retryCount: 0,
        lastError: null,
        nextRetryAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        syncedAt: null,
      };
      updatedWalkIn = {
        ...walkIn,
        status: nextStatus,
        syncStatus: deriveLocalSyncStatus([...operations, operation]),
        updatedAt: now,
        version: walkIn.version + 1,
      };
      transactionStore.put(updatedWalkIn);
      outboxStore.add(operation);
    };
  };
  walkInRequest.onerror = () => transaction.abort();
  try {
    await completed;
  } catch (error) {
    throw validationError || error;
  }
  if (!updatedWalkIn) throw new Error('Offline service transition was not recorded');
  notifyCashierOfflineOutboxChanged();
  return updatedWalkIn;
};

export const editLocalWalkIn = async (
  localTransactionId: string,
  branchId: number,
  cashierId: string,
  changes: {
    serviceIds?: number[];
    serviceSnapshot?: Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>;
    barberId?: number;
    barberName?: string;
  },
  now = Date.now(),
): Promise<LocalWalkInTransaction> => {
  const sameIds = (left: number[], right: number[]) => left.length === right.length
    && left.every((value, index) => value === right[index]);
  if (changes.serviceIds && (
    changes.serviceIds.length < 1
    || changes.serviceIds.length > 20
    || changes.serviceIds.some((id) => !Number.isSafeInteger(id) || id < 1)
    || new Set(changes.serviceIds).size !== changes.serviceIds.length
  )) throw new Error('Choose one or more services from the cached catalog.');
  if (changes.barberId !== undefined && (!Number.isSafeInteger(changes.barberId) || changes.barberId < 1)) {
    throw new Error('Choose a barber from the cached catalog.');
  }
  if (changes.serviceSnapshot && (
    !changes.serviceIds
    || changes.serviceSnapshot.length !== changes.serviceIds.length
    || changes.serviceSnapshot.some((service, index) => (
      service.serviceId !== changes.serviceIds?.[index]
      || !service.name.trim()
      || !Number.isFinite(service.price)
      || service.price < 0
      || !Number.isFinite(service.durationMinutes)
      || service.durationMinutes < 1
    ))
  )) throw new Error('The selected service details do not match the cached catalog.');
  if (changes.barberId !== undefined && !changes.barberName?.trim()) {
    throw new Error('The selected barber is unavailable in the cached catalog.');
  }

  const deviceId = await getCashierOfflineDeviceId();
  const database = await openDatabase();
  const transaction = database.transaction([TRANSACTIONS_STORE, OUTBOX_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  const transactionStore = transaction.objectStore(TRANSACTIONS_STORE);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  let validationError: Error | null = null;
  let updatedWalkIn: LocalWalkInTransaction | null = null;
  const walkInRequest = transactionStore.get(localTransactionId);
  walkInRequest.onsuccess = () => {
    const walkIn = walkInRequest.result as LocalWalkInTransaction | undefined;
    if (!walkIn
      || walkIn.branchId !== branchId
      || walkIn.cashierId !== cashierId
      || walkIn.scopeKey !== `${branchId}:${cashierId}`
      || ['conflict', 'failed'].includes(walkIn.syncStatus)) {
      validationError = new Error('This offline walk-in is outside the active cashier scope or needs conflict review.');
      transaction.abort();
      return;
    }

    const serviceIds = changes.serviceIds ? [...changes.serviceIds] : [...walkIn.serviceIds];
    const serviceSnapshot = changes.serviceSnapshot
      ? changes.serviceSnapshot.map((service) => ({ ...service }))
      : walkIn.serviceSnapshot.map((service) => ({ ...service }));
    const barberId = changes.barberId ?? walkIn.barberId;
    const barberName = changes.barberId === undefined ? walkIn.barberName : changes.barberName?.trim();
    const serviceChanged = !sameIds(serviceIds, walkIn.serviceIds);
    const barberChanged = barberId !== walkIn.barberId;
    if (!serviceChanged && !barberChanged) {
      updatedWalkIn = walkIn;
      return;
    }
    if (walkIn.paymentStatus === 'paid') {
      if (serviceChanged || !barberChanged || walkIn.status !== 'completed') {
        validationError = new Error('After cash is captured, only a barber-only change is available offline.');
        transaction.abort();
        return;
      }
    } else if (serviceChanged && walkIn.status !== 'queued') {
      validationError = new Error('Services can only be changed before this offline service starts.');
      transaction.abort();
      return;
    } else if (walkIn.status !== 'queued') {
      validationError = new Error('Barber and service changes are only available before this offline service starts.');
      transaction.abort();
      return;
    }

    const outboxRead = outboxStore.index('localTransactionId').getAll(localTransactionId);
    outboxRead.onerror = () => transaction.abort();
    outboxRead.onsuccess = () => {
      const operations = outboxRead.result as CashierOutboxOperation[];
      const sequence = operations.reduce((max, operation) => Math.max(max, operation.sequence), 0) + 1;
      const nextVersion = walkIn.version + 1;
      const operationId = `${localTransactionId}:edit:${nextVersion}`;
      const operation: CashierOutboxOperation = {
        operationId,
        localTransactionId,
        branchId,
        cashierId,
        deviceId,
        type: 'edit',
        payload: {
          localTransactionId,
          action: 'update_walk_in',
          expectedBarberId: walkIn.barberId,
          expectedServiceIds: [...walkIn.serviceIds],
          ...(serviceChanged ? { serviceIds, serviceSnapshot } : {}),
          ...(barberChanged ? { barberId } : {}),
        },
        sequence,
        idempotencyKey: `${walkIn.idempotencyKey}:edit:${nextVersion}`,
        status: 'pending',
        retryCount: 0,
        lastError: null,
        nextRetryAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        syncedAt: null,
      };
      const editHistoryEntry: LocalWalkInEditHistoryEntry = {
        operationId,
        sequence,
        changedAt: now,
        before: {
          barberId: walkIn.barberId,
          barberName: walkIn.barberName || null,
          serviceIds: [...walkIn.serviceIds],
          serviceSnapshot: walkIn.serviceSnapshot.map((service) => ({ ...service })),
        },
        after: {
          barberId,
          barberName: barberName || null,
          serviceIds: [...serviceIds],
          serviceSnapshot: serviceSnapshot.map((service) => ({ ...service })),
        },
      };
      updatedWalkIn = {
        ...walkIn,
        barberId,
        barberName,
        serviceIds,
        serviceSnapshot,
        editHistory: [...(walkIn.editHistory || []), editHistoryEntry],
        syncStatus: deriveLocalSyncStatus([...operations, operation]),
        version: nextVersion,
        updatedAt: now,
      };
      transactionStore.put(updatedWalkIn);
      outboxStore.add(operation);
    };
  };
  walkInRequest.onerror = () => transaction.abort();

  try {
    await completed;
  } catch (error) {
    throw validationError || error;
  }
  if (!updatedWalkIn) throw new Error('Offline walk-in edit was not recorded.');
  notifyCashierOfflineOutboxChanged();
  return updatedWalkIn;
};

export type LocalCashPaymentCaptureResult = 'captured' | 'already_captured';

const toCents = (amount: number): number => Math.round(amount * 100);

/** Atomically records one cash payment, its immutable receipt snapshot, and its sync operation. */
export const captureLocalCashPayment = async (input: {
  payment: LocalCashierPayment;
  receipt: LocalCashierReceipt;
  operation: CashierOutboxOperation;
}): Promise<LocalCashPaymentCaptureResult> => {
  const { payment, receipt, operation } = input;
  const validMoney = [payment.amount, payment.tenderedAmount, payment.changeAmount]
    .every((amount) => Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000);
  if (
    !validMoney
    || toCents(payment.amount) <= 0
    || toCents(payment.tenderedAmount) < toCents(payment.amount)
    || toCents(payment.changeAmount) !== toCents(payment.tenderedAmount) - toCents(payment.amount)
    || payment.method !== 'cash'
    || payment.localTransactionId !== receipt.localTransactionId
    || payment.localTransactionId !== operation.localTransactionId
    || payment.localId !== `payment:${payment.localTransactionId}`
    || receipt.localId !== `receipt:${payment.localTransactionId}`
    || operation.operationId !== `${payment.localTransactionId}:capture_cash`
    || operation.type !== 'capture_cash'
    || !Number.isSafeInteger(operation.sequence)
    || operation.sequence < 1
    || payment.branchId !== receipt.branchId
    || payment.branchId !== operation.branchId
    || payment.cashierId !== receipt.cashierId
    || payment.cashierId !== operation.cashierId
    || payment.idempotencyKey !== receipt.idempotencyKey
    || payment.idempotencyKey !== operation.idempotencyKey
    || payment.status !== 'pending_sync'
    || receipt.status !== 'ready'
    || receipt.printAttemptCount !== 0
    || receipt.cloudReceiptId !== null
  ) {
    throw new Error('Local cash payment, receipt, and outbox operation must share valid values and scope');
  }

  const deviceId = await getCashierOfflineDeviceId();
  const database = await openDatabase();
  const transaction = database.transaction(
    [TRANSACTIONS_STORE, PAYMENTS_STORE, RECEIPTS_STORE, OUTBOX_STORE],
    'readwrite',
  );
  let validationError: Error | null = null;
  let result: LocalCashPaymentCaptureResult = 'captured';
  const completed = transactionComplete(transaction);
  const transactionStore = transaction.objectStore(TRANSACTIONS_STORE);
  const paymentStore = transaction.objectStore(PAYMENTS_STORE);
  const receiptStore = transaction.objectStore(RECEIPTS_STORE);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  const walkInRequest = transactionStore.get(payment.localTransactionId);

  walkInRequest.onsuccess = () => {
    const walkIn = walkInRequest.result as LocalWalkInTransaction | undefined;
    if (
      walkIn?.paymentStatus === 'paid'
      && (walkIn.syncStatus === 'conflict' || walkIn.syncStatus === 'failed')
    ) {
      validationError = new Error('This walk-in already has a local cash payment; reconcile the existing payment instead of collecting cash again');
      transaction.abort();
      return;
    }
    if (!walkIn
      || walkIn.branchId !== payment.branchId
      || walkIn.cashierId !== payment.cashierId
      || walkIn.scopeKey !== `${payment.branchId}:${payment.cashierId}`
      || walkIn.status !== 'completed'
      || walkIn.syncStatus === 'conflict'
      || walkIn.syncStatus === 'failed') {
      validationError = new Error('Only an unpaid completed walk-in in this cashier scope can be paid offline');
      transaction.abort();
      return;
    }

    const expectedAmountCents = walkIn.serviceSnapshot.reduce((total, service) => {
      if (!Number.isFinite(service.price) || service.price < 0) return Number.NaN;
      return total + toCents(service.price);
    }, 0);
    if (!Number.isSafeInteger(expectedAmountCents) || expectedAmountCents !== toCents(payment.amount)) {
      validationError = new Error('Cash amount must match the saved service price snapshot');
      transaction.abort();
      return;
    }
    const snapshot = receipt.snapshot as Record<string, unknown>;
    const snapshotLines = Array.isArray(snapshot.lines) ? snapshot.lines as Array<Record<string, unknown>> : [];
    const linesMatch = snapshotLines.length === walkIn.serviceSnapshot.length
      && walkIn.serviceSnapshot.every((service, index) => {
        const line = snapshotLines[index];
        return line?.name === service.name
          && typeof line.amount === 'number'
          && toCents(line.amount) === toCents(service.price);
      });
    if (
      snapshot.provisional !== true
      || snapshot.receiptNumber !== receipt.receiptNumber
      || snapshot.branchId !== walkIn.branchId
      || snapshot.cashierId !== walkIn.cashierId
      || snapshot.customerName !== walkIn.customerName
      || toCents(Number(snapshot.amount)) !== toCents(payment.amount)
      || toCents(Number(snapshot.tenderedAmount)) !== toCents(payment.tenderedAmount)
      || toCents(Number(snapshot.changeAmount)) !== toCents(payment.changeAmount)
      || !linesMatch
    ) {
      validationError = new Error('Provisional receipt snapshot must match the completed local walk-in and cash payment');
      transaction.abort();
      return;
    }

    const existingRequest = paymentStore.index('localTransactionId').getAll(payment.localTransactionId);
    existingRequest.onerror = () => transaction.abort();
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as LocalCashierPayment[];
      if (existing.length > 0) {
        const prior = existing[0];
        const isSameCapture = existing.length === 1
          && prior.localId === payment.localId
          && prior.idempotencyKey === payment.idempotencyKey
          && toCents(prior.amount) === toCents(payment.amount)
          && toCents(prior.tenderedAmount) === toCents(payment.tenderedAmount)
          && toCents(prior.changeAmount) === toCents(payment.changeAmount);
        if (!isSameCapture) {
          validationError = new Error('This walk-in already has a different local cash payment');
          transaction.abort();
          return;
        }
        result = 'already_captured';
        return;
      }
      if (walkIn.paymentStatus === 'paid') {
        validationError = new Error('The walk-in is already marked as paid but its local payment is missing');
        transaction.abort();
        return;
      }

      const outboxRead = outboxStore.index('localTransactionId').getAll(payment.localTransactionId);
      outboxRead.onerror = () => transaction.abort();
      outboxRead.onsuccess = () => {
        const operations = outboxRead.result as CashierOutboxOperation[];
        if (operations.some((item) => item.operationId === operation.operationId)) {
          validationError = new Error('A cash capture operation already exists without its payment record');
          transaction.abort();
          return;
        }
        const expectedSequence = operations.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
        if (expectedSequence < 2) {
          validationError = new Error('Cash capture must follow the initial walk-in operation');
          transaction.abort();
          return;
        }
        const now = Date.now();
        paymentStore.add({ ...payment, status: 'pending_sync' });
        receiptStore.add({ ...receipt, syncStatus: 'pending' });
        outboxStore.add({ ...operation, sequence: expectedSequence, deviceId });
        transactionStore.put({
          ...walkIn,
          paymentStatus: 'paid',
          syncStatus: deriveLocalSyncStatus([...operations, { ...operation, sequence: expectedSequence }]),
          updatedAt: now,
          version: walkIn.version + 1,
        });
      };
    };
  };
  walkInRequest.onerror = () => transaction.abort();

  try {
    await completed;
  } catch (error) {
    throw validationError || error;
  }
  notifyCashierOfflineOutboxChanged();
  return result;
};

/** Records a print attempt and its sync metadata without mutating the receipt snapshot. */
export const recordLocalReceiptPrintResult = async (
  receiptLocalId: string,
  outcome: 'printed' | 'print_requested' | 'print_failed',
  errorMessage: string | null = null,
  now = Date.now(),
): Promise<LocalCashierReceipt> => {
  const deviceId = await getCashierOfflineDeviceId();
  const database = await openDatabase();
  const transaction = database.transaction([RECEIPTS_STORE, OUTBOX_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  const receiptStore = transaction.objectStore(RECEIPTS_STORE);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  let validationError: Error | null = null;
  let updatedReceipt: LocalCashierReceipt | null = null;
  const receiptRequest = receiptStore.get(receiptLocalId);
  receiptRequest.onsuccess = () => {
    const receipt = receiptRequest.result as LocalCashierReceipt | undefined;
    if (!receipt || receipt.cloudReceiptId) {
      validationError = new Error('Local receipt was not found or is already linked to a cloud receipt');
      transaction.abort();
      return;
    }
    const history = receipt.printHistory || [];
    const attempt = receipt.printAttemptCount + 1;
    const event = {
      attempt,
      outcome,
      isReprint: attempt > 1,
      error: outcome === 'print_failed' ? (errorMessage || 'Printer failed') : null,
      createdAt: now,
    };
    const outboxRead = outboxStore.index('localTransactionId').getAll(receipt.localTransactionId);
    outboxRead.onerror = () => transaction.abort();
    outboxRead.onsuccess = () => {
      const operations = outboxRead.result as CashierOutboxOperation[];
      const sequence = operations.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
      const operationId = `${receipt.localId}:print:${attempt}`;
      if (operations.some((item) => item.operationId === operationId)) {
        validationError = new Error('Receipt print attempt already exists');
        transaction.abort();
        return;
      }
      updatedReceipt = {
        ...receipt,
        status: outcome,
        syncStatus: receipt.syncStatus === 'conflict' || receipt.syncStatus === 'failed' ? receipt.syncStatus : 'pending',
        printAttemptCount: attempt,
        printHistory: [...history, event],
        lastPrintError: event.error,
        updatedAt: now,
      };
      const outboxOperation: CashierOutboxOperation = {
        operationId,
        localTransactionId: receipt.localTransactionId,
        branchId: receipt.branchId,
        cashierId: receipt.cashierId,
        deviceId,
        type: 'print_metadata',
        payload: { receiptLocalId: receipt.localId, ...event },
        sequence,
        idempotencyKey: `${receipt.idempotencyKey}:print:${attempt}`,
        status: 'pending',
        retryCount: 0,
        lastError: null,
        nextRetryAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        syncedAt: null,
      };
      receiptStore.put(updatedReceipt);
      outboxStore.add(outboxOperation);
    };
  };
  receiptRequest.onerror = () => transaction.abort();
  try {
    await completed;
  } catch (error) {
    throw validationError || error;
  }
  if (!updatedReceipt) throw new Error('Receipt print attempt was not recorded');
  notifyCashierOfflineOutboxChanged();
  return updatedReceipt;
};

export const getLocalCashierReceipt = async (localTransactionId: string): Promise<LocalCashierReceipt | null> => {
  const database = await openDatabase();
  const transaction = database.transaction(RECEIPTS_STORE, 'readonly');
  const receipts = await requestValue<LocalCashierReceipt[]>(
    transaction.objectStore(RECEIPTS_STORE).index('localTransactionId').getAll(localTransactionId),
  );
  return receipts[0] ?? null;
};

export const getLocalCashierWalkIn = async (localTransactionId: string): Promise<LocalWalkInTransaction | null> => {
  const database = await openDatabase();
  const transaction = database.transaction(TRANSACTIONS_STORE, 'readonly');
  const walkIn = await requestValue<LocalWalkInTransaction | undefined>(
    transaction.objectStore(TRANSACTIONS_STORE).get(localTransactionId),
  );
  return walkIn ?? null;
};

export const listLocalCashierPayments = async (localTransactionId: string): Promise<LocalCashierPayment[]> => {
  const database = await openDatabase();
  const transaction = database.transaction(PAYMENTS_STORE, 'readonly');
  return requestValue<LocalCashierPayment[]>(
    transaction.objectStore(PAYMENTS_STORE).index('localTransactionId').getAll(localTransactionId),
  );
};

export const listLocalWalkIns = async (scopeKey: string): Promise<LocalWalkInTransaction[]> => {
  const database = await openDatabase();
  const transaction = database.transaction(TRANSACTIONS_STORE, 'readonly');
  return requestValue<LocalWalkInTransaction[]>(
    transaction.objectStore(TRANSACTIONS_STORE).index('scopeKey').getAll(scopeKey),
  );
};

export const listCashierOutbox = async (
  branchId: number,
  cashierId: string,
): Promise<CashierOutboxOperation[]> => {
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, 'readonly');
  const operations = await requestValue<CashierOutboxOperation[]>(
    transaction.objectStore(OUTBOX_STORE).index('branchCashier').getAll([branchId, cashierId]),
  );
  return operations
    .filter((operation) => ['pending', 'sending', 'retryable'].includes(operation.status))
    .sort((left, right) => left.createdAt - right.createdAt || left.sequence - right.sequence);
};

/** Returns the full journal so a prior conflict or retryable operation can block later operations. */
export const listCashierOutboxJournal = async (
  branchId: number,
  cashierId: string,
): Promise<CashierOutboxOperation[]> => {
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, 'readonly');
  const operations = await requestValue<CashierOutboxOperation[]>(
    transaction.objectStore(OUTBOX_STORE).index('branchCashier').getAll([branchId, cashierId]),
  );
  return operations.sort((left, right) => left.createdAt - right.createdAt || left.sequence - right.sequence);
};

export const markCashierOutboxSending = async (operationId: string): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  const store = transaction.objectStore(OUTBOX_STORE);
  const request = store.get(operationId);
  request.onsuccess = () => {
    if (!request.result) {
      transaction.abort();
      return;
    }
    store.put({ ...request.result, status: 'sending', updatedAt: Date.now() });
  };
  await completed;
  notifyCashierOfflineOutboxChanged();
};

export const markCashierWalkInSynced = async (
  operationId: string,
  cloudId: string,
): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction([TRANSACTIONS_STORE, OUTBOX_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  const transactionStore = transaction.objectStore(TRANSACTIONS_STORE);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  const operationRequest = outboxStore.get(operationId);
  operationRequest.onerror = () => transaction.abort();
  operationRequest.onsuccess = () => {
    const operation = operationRequest.result as CashierOutboxOperation | undefined;
    if (!operation) {
      transaction.abort();
      return;
    }
    const walkInRequest = transactionStore.get(operation.localTransactionId);
    walkInRequest.onsuccess = () => {
      const walkIn = walkInRequest.result as LocalWalkInTransaction | undefined;
      if (!walkIn) {
        transaction.abort();
        return;
      }
      if (operation.status === 'synced' && walkIn.cloudId === cloudId && walkIn.syncStatus === 'synced') {
        return;
      }
      if (walkIn.cloudId && walkIn.cloudId !== cloudId) {
        transaction.abort();
        return;
      }
      const now = Date.now();
      outboxStore.put({
        ...operation,
        status: 'synced',
        lastError: null,
        nextRetryAt: null,
        syncedAt: now,
        updatedAt: now,
        version: operation.version + 1,
      });
      transactionStore.put({
        ...walkIn,
        cloudId,
        syncStatus: 'synced',
        updatedAt: now,
        version: walkIn.version + 1,
      });
    };
    walkInRequest.onerror = () => transaction.abort();
  };
  await completed;
  notifyCashierOfflineOutboxChanged();
};

/** Makes a transient failure immediately eligible for replay without changing its idempotency key. */
export const retryCashierOutboxOperation = async (
  operationId: string,
  branchId: number,
  cashierId: string,
): Promise<boolean> => {
  const database = await openDatabase();
  const transaction = database.transaction([TRANSACTIONS_STORE, PAYMENTS_STORE, RECEIPTS_STORE, OUTBOX_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  const request = outboxStore.get(operationId);
  let didRetry = false;
  request.onsuccess = () => {
    const operation = request.result as CashierOutboxOperation | undefined;
    if (!operation || operation.branchId !== branchId || operation.cashierId !== cashierId
      || operation.status !== 'retryable') {
      transaction.abort();
      return;
    }
    const now = Date.now();
    outboxStore.put({
      ...operation,
      status: 'pending',
      nextRetryAt: null,
      updatedAt: now,
      version: operation.version + 1,
    });

    const transactionStore = transaction.objectStore(TRANSACTIONS_STORE);
    const walkInRequest = transactionStore.get(operation.localTransactionId);
    walkInRequest.onsuccess = () => {
      const walkIn = walkInRequest.result as LocalWalkInTransaction | undefined;
      if (!walkIn || walkIn.branchId !== branchId || walkIn.cashierId !== cashierId) {
        transaction.abort();
        return;
      }
      transactionStore.put({ ...walkIn, syncStatus: 'pending', updatedAt: now, version: walkIn.version + 1 });

      if (operation.type === 'capture_cash') {
        const paymentStore = transaction.objectStore(PAYMENTS_STORE);
        const paymentRequest = paymentStore.get(`payment:${operation.localTransactionId}`);
        paymentRequest.onsuccess = () => {
          const payment = paymentRequest.result as LocalCashierPayment | undefined;
          if (payment && payment.status !== 'synced' && payment.status !== 'conflict') {
            paymentStore.put({ ...payment, status: 'pending_sync', updatedAt: now, version: payment.version + 1 });
          }
        };
      }
      if (operation.type === 'capture_cash' || operation.type === 'print_metadata') {
        const receiptLocalId = operation.type === 'print_metadata'
          ? String((operation.payload as { receiptLocalId?: string } | null)?.receiptLocalId || `receipt:${operation.localTransactionId}`)
          : `receipt:${operation.localTransactionId}`;
        const receiptStore = transaction.objectStore(RECEIPTS_STORE);
        const receiptRequest = receiptStore.get(receiptLocalId);
        receiptRequest.onsuccess = () => {
          const receipt = receiptRequest.result as LocalCashierReceipt | undefined;
          if (receipt && receipt.syncStatus !== 'synced' && receipt.syncStatus !== 'conflict') {
            receiptStore.put({ ...receipt, syncStatus: 'pending', updatedAt: now, version: receipt.version + 1 });
          }
        };
      }
      didRetry = true;
    };
    walkInRequest.onerror = () => transaction.abort();
  };
  request.onerror = () => transaction.abort();
  await completed;
  if (didRetry) notifyCashierOfflineOutboxChanged();
  return didRetry;
};

export interface CashierOutboxSyncResult {
  cloudId?: string;
  paymentCloudId?: string;
  cloudReceiptId?: string;
  cloudReceiptNumber?: string;
}

const deriveLocalSyncStatus = (operations: CashierOutboxOperation[]): LocalTransactionSyncStatus => {
  if (operations.length > 0 && operations.every((operation) => operation.status === 'synced')) return 'synced';
  if (operations.some((operation) => operation.status === 'permanent_failure')) return 'failed';
  if (operations.some((operation) => operation.status === 'conflict')) return 'conflict';
  if (operations.some((operation) => operation.status === 'retryable')) return 'retryable';
  if (operations.some((operation) => operation.status === 'sending')) return 'sending';
  return 'pending';
};

/** Applies one server acknowledgement atomically and leaves later journal operations pending. */
export const markCashierOutboxSynced = async (
  operationId: string,
  result: CashierOutboxSyncResult = {},
): Promise<boolean> => {
  const database = await openDatabase();
  const transaction = database.transaction(
    [TRANSACTIONS_STORE, PAYMENTS_STORE, RECEIPTS_STORE, OUTBOX_STORE],
    'readwrite',
  );
  const completed = transactionComplete(transaction);
  const transactionStore = transaction.objectStore(TRANSACTIONS_STORE);
  const paymentStore = transaction.objectStore(PAYMENTS_STORE);
  const receiptStore = transaction.objectStore(RECEIPTS_STORE);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  const operationRequest = outboxStore.get(operationId);
  let validationError: Error | null = null;
  let allSynced = false;

  operationRequest.onsuccess = () => {
    const operation = operationRequest.result as CashierOutboxOperation | undefined;
    if (!operation) {
      validationError = new Error('The acknowledged offline operation no longer exists.');
      transaction.abort();
      return;
    }
    const localTransactionId = operation.localTransactionId;
    const walkInRequest = transactionStore.get(localTransactionId);
    const operationsRequest = outboxStore.getAll();
    const needsPayment = operation.type === 'capture_cash';
    const needsReceipt = operation.type === 'capture_cash' || operation.type === 'print_metadata';
    const paymentRequest = needsPayment ? paymentStore.get(`payment:${localTransactionId}`) : null;
    const receiptLocalId = operation.type === 'print_metadata'
      ? String((operation.payload as { receiptLocalId?: string } | null)?.receiptLocalId || `receipt:${localTransactionId}`)
      : `receipt:${localTransactionId}`;
    const receiptRequest = needsReceipt ? receiptStore.get(receiptLocalId) : null;
    const requirements = (needsReceipt ? 3 : 2) + (needsPayment ? 1 : 0);
    let ready = 0;
    let walkIn: LocalWalkInTransaction | undefined;
    let allOperations: CashierOutboxOperation[] = [];
    let payment: LocalCashierPayment | undefined;
    let receipt: LocalCashierReceipt | undefined;
    const tryApply = (): void => {
      ready += 1;
      if (ready !== requirements) return;
      if (!walkIn) {
        validationError = new Error('The offline walk-in for this acknowledgement no longer exists.');
        transaction.abort();
        return;
      }
      if (needsPayment && !payment) {
        validationError = new Error('The local cash payment for this acknowledgement no longer exists.');
        transaction.abort();
        return;
      }
      if (needsReceipt && !receipt) {
        validationError = new Error('The local receipt for this acknowledgement no longer exists.');
        transaction.abort();
        return;
      }
      if (result.cloudId && walkIn.cloudId && walkIn.cloudId !== result.cloudId) {
        validationError = new Error('This local walk-in is already linked to a different cloud entry.');
        transaction.abort();
        return;
      }

      const now = Date.now();
      const syncedOperation: CashierOutboxOperation = operation.status === 'synced'
        ? operation
        : {
          ...operation,
          status: 'synced',
          lastError: null,
          nextRetryAt: null,
          syncedAt: now,
          updatedAt: now,
          version: operation.version + 1,
        };
      if (operation.status !== 'synced') outboxStore.put(syncedOperation);
      const updatedOperations = allOperations.map((item) => item.operationId === operationId ? syncedOperation : item);
      const transactionOperations = updatedOperations.filter((item) => item.localTransactionId === localTransactionId);
      const transactionSyncStatus = deriveLocalSyncStatus(transactionOperations);
      allSynced = transactionSyncStatus === 'synced';
      transactionStore.put({
        ...walkIn,
        cloudId: result.cloudId || walkIn.cloudId,
        syncStatus: transactionSyncStatus,
        updatedAt: now,
        version: walkIn.version + 1,
      });

      if (needsPayment && payment) {
        paymentStore.put({
          ...payment,
          cloudId: result.paymentCloudId || payment.cloudId,
          status: 'synced',
          updatedAt: now,
          version: payment.version + 1,
        });
      }
      if (needsReceipt && receipt) {
        const receiptOperations = transactionOperations.filter((item) =>
          item.type === 'capture_cash' || item.type === 'print_metadata');
        receiptStore.put({
          ...receipt,
          cloudReceiptId: result.cloudReceiptId || receipt.cloudReceiptId,
          cloudReceiptNumber: result.cloudReceiptNumber || receipt.cloudReceiptNumber || null,
          syncStatus: deriveLocalSyncStatus(receiptOperations),
          updatedAt: now,
          version: receipt.version + 1,
        });
      }
    };

    walkInRequest.onsuccess = () => { walkIn = walkInRequest.result as LocalWalkInTransaction | undefined; tryApply(); };
    operationsRequest.onsuccess = () => { allOperations = operationsRequest.result as CashierOutboxOperation[]; tryApply(); };
    if (paymentRequest) paymentRequest.onsuccess = () => { payment = paymentRequest.result as LocalCashierPayment | undefined; tryApply(); };
    if (receiptRequest) receiptRequest.onsuccess = () => { receipt = receiptRequest.result as LocalCashierReceipt | undefined; tryApply(); };
    walkInRequest.onerror = () => transaction.abort();
    operationsRequest.onerror = () => transaction.abort();
    if (paymentRequest) paymentRequest.onerror = () => transaction.abort();
    if (receiptRequest) receiptRequest.onerror = () => transaction.abort();
  };
  operationRequest.onerror = () => transaction.abort();
  try {
    await completed;
  } catch (error) {
    throw validationError || error;
  }
  notifyCashierOfflineOutboxChanged();
  return allSynced;
};

export const markCashierOutboxRetryable = async (
  operationId: string,
  errorMessage: string,
  retryCount: number,
  nextRetryAt: number,
): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction([TRANSACTIONS_STORE, PAYMENTS_STORE, RECEIPTS_STORE, OUTBOX_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  const transactionStore = transaction.objectStore(TRANSACTIONS_STORE);
  const paymentStore = transaction.objectStore(PAYMENTS_STORE);
  const receiptStore = transaction.objectStore(RECEIPTS_STORE);
  const request = outboxStore.get(operationId);
  request.onsuccess = () => {
    const operation = request.result as CashierOutboxOperation | undefined;
    if (!operation) {
      transaction.abort();
      return;
    }
    const walkInRequest = transactionStore.get(operation.localTransactionId);
    walkInRequest.onsuccess = () => {
      const walkIn = walkInRequest.result as LocalWalkInTransaction | undefined;
      if (!walkIn) {
        transaction.abort();
        return;
      }
      const now = Date.now();
      outboxStore.put({ ...operation, status: 'retryable', lastError: errorMessage, retryCount, nextRetryAt, updatedAt: now, version: operation.version + 1 });
      transactionStore.put({ ...walkIn, syncStatus: 'retryable', updatedAt: now, version: walkIn.version + 1 });
      if (operation.type === 'capture_cash') {
        const paymentRequest = paymentStore.get(`payment:${operation.localTransactionId}`);
        paymentRequest.onsuccess = () => {
          const payment = paymentRequest.result as LocalCashierPayment | undefined;
          if (payment && payment.status !== 'synced' && payment.status !== 'conflict') {
            paymentStore.put({ ...payment, status: 'pending_sync', updatedAt: now, version: payment.version + 1 });
          }
        };
      }
      if (operation.type === 'capture_cash' || operation.type === 'print_metadata') {
        const receiptLocalId = operation.type === 'print_metadata'
          ? String((operation.payload as { receiptLocalId?: string } | null)?.receiptLocalId || `receipt:${operation.localTransactionId}`)
          : `receipt:${operation.localTransactionId}`;
        const receiptRequest = receiptStore.get(receiptLocalId);
        receiptRequest.onsuccess = () => {
          const receipt = receiptRequest.result as LocalCashierReceipt | undefined;
          if (receipt && receipt.syncStatus !== 'synced' && receipt.syncStatus !== 'conflict') {
            receiptStore.put({ ...receipt, syncStatus: 'retryable', updatedAt: now, version: receipt.version + 1 });
          }
        };
      }
    };
    walkInRequest.onerror = () => transaction.abort();
  };
  await completed;
  notifyCashierOfflineOutboxChanged();
};

export const markCashierOutboxConflict = async (
  operationId: string,
  errorMessage: string,
  permanent: boolean,
): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction([TRANSACTIONS_STORE, PAYMENTS_STORE, RECEIPTS_STORE, OUTBOX_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  const transactionStore = transaction.objectStore(TRANSACTIONS_STORE);
  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  const paymentStore = transaction.objectStore(PAYMENTS_STORE);
  const receiptStore = transaction.objectStore(RECEIPTS_STORE);
  const request = outboxStore.get(operationId);
  request.onsuccess = () => {
    const operation = request.result as CashierOutboxOperation | undefined;
    if (!operation) {
      transaction.abort();
      return;
    }
    const walkInRequest = transactionStore.get(operation.localTransactionId);
    walkInRequest.onsuccess = () => {
      const walkIn = walkInRequest.result as LocalWalkInTransaction | undefined;
      if (!walkIn) {
        transaction.abort();
        return;
      }
      const now = Date.now();
      outboxStore.put({
        ...operation,
        status: permanent ? 'permanent_failure' : 'conflict',
        lastError: errorMessage,
        nextRetryAt: null,
        updatedAt: now,
        version: operation.version + 1,
      });
      transactionStore.put({
        ...walkIn,
        syncStatus: permanent ? 'failed' : 'conflict',
        updatedAt: now,
        version: walkIn.version + 1,
      });
      if (operation.type === 'capture_cash') {
        const paymentRequest = paymentStore.get(`payment:${operation.localTransactionId}`);
        paymentRequest.onsuccess = () => {
          const payment = paymentRequest.result as LocalCashierPayment | undefined;
          if (payment) paymentStore.put({ ...payment, status: 'conflict', updatedAt: now, version: payment.version + 1 });
        };
      }
      if (operation.type === 'capture_cash' || operation.type === 'print_metadata') {
        const receiptLocalId = operation.type === 'print_metadata'
          ? String((operation.payload as { receiptLocalId?: string } | null)?.receiptLocalId || `receipt:${operation.localTransactionId}`)
          : `receipt:${operation.localTransactionId}`;
        const receiptRequest = receiptStore.get(receiptLocalId);
        receiptRequest.onsuccess = () => {
          const receipt = receiptRequest.result as LocalCashierReceipt | undefined;
          if (receipt) {
            receiptStore.put({
              ...receipt,
              syncStatus: permanent ? 'failed' : 'conflict',
              updatedAt: now,
              version: receipt.version + 1,
            });
          }
        };
      }
    };
    walkInRequest.onerror = () => transaction.abort();
  };
  request.onerror = () => transaction.abort();
  await completed;
  notifyCashierOfflineOutboxChanged();
};

const catalogSnapshotKey = (scopeKey: string): string => `walk-in:${scopeKey}`;

export const saveCashierOfflineCatalog = async (
  snapshot: Omit<CashierOfflineCatalogSnapshot, 'key'>,
): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction(CATALOG_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  transaction.objectStore(CATALOG_STORE).put({ ...snapshot, key: catalogSnapshotKey(snapshot.scopeKey) });
  await completed;
};

export const getCashierOfflineCatalog = async (
  scopeKey: string,
): Promise<CashierOfflineCatalogSnapshot | null> => {
  const database = await openDatabase();
  const transaction = database.transaction(CATALOG_STORE, 'readonly');
  const snapshot = await requestValue<CashierOfflineCatalogSnapshot | undefined>(
    transaction.objectStore(CATALOG_STORE).get(catalogSnapshotKey(scopeKey)),
  );
  return snapshot ?? null;
};

const queueSnapshotKey = (scopeKey: string): string => `queue:${scopeKey}`;

export const saveCashierOfflineQueueSnapshot = async (
  snapshot: Omit<CashierOfflineQueueSnapshot, 'key'>,
): Promise<void> => {
  if (snapshot.branchId < 1 || !Number.isSafeInteger(snapshot.branchId)
    || !snapshot.cashierId || snapshot.scopeKey !== `${snapshot.branchId}:${snapshot.cashierId}`) {
    throw new Error('Queue snapshot must use a valid cashier and branch scope');
  }
  const database = await openDatabase();
  const transaction = database.transaction(CATALOG_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  transaction.objectStore(CATALOG_STORE).put({ ...snapshot, key: queueSnapshotKey(snapshot.scopeKey) });
  await completed;
};

export const getCashierOfflineQueueSnapshot = async (scopeKey: string): Promise<CashierOfflineQueueSnapshot | null> => {
  const database = await openDatabase();
  const transaction = database.transaction(CATALOG_STORE, 'readonly');
  const snapshot = await requestValue<CashierOfflineQueueSnapshot | undefined>(
    transaction.objectStore(CATALOG_STORE).get(queueSnapshotKey(scopeKey)),
  );
  return snapshot && isSnapshotWithinMaxAge(snapshot.capturedAt, CASHIER_OFFLINE_QUEUE_SNAPSHOT_MAX_AGE_MS)
    ? snapshot
    : null;
};

/** Refreshes cloud-backed walk-in mirrors without overwriting pending local edits. */
export const saveCashierOnlineWalkInMirrors = async (walkIns: LocalWalkInTransaction[]): Promise<void> => {
  if (walkIns.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction([TRANSACTIONS_STORE, OUTBOX_STORE], 'readwrite');
  const completed = transactionComplete(transaction);
  const transactions = transaction.objectStore(TRANSACTIONS_STORE);
  const outbox = transaction.objectStore(OUTBOX_STORE);
  const existingRequest = transactions.getAll();
  const operationsRequest = outbox.getAll();
  let existing: LocalWalkInTransaction[] | null = null;
  let operations: CashierOutboxOperation[] | null = null;
  const apply = (): void => {
    if (!existing || !operations) return;
    const existingById = new Map(existing.map((item) => [item.localId, item]));
    const pendingIds = new Set(operations
      .filter((operation) => operation.status !== 'synced')
      .map((operation) => operation.localTransactionId));
    for (const candidate of walkIns) {
      const previous = existingById.get(candidate.localId);
      const alreadyLinked = existing.some((item) => item.localId !== candidate.localId
        && item.cloudId === candidate.cloudId);
      if (alreadyLinked) continue;
      if (!previous || (!pendingIds.has(candidate.localId) && previous.cloudId === candidate.cloudId)) {
        transactions.put(candidate);
      }
    }
  };
  existingRequest.onsuccess = () => { existing = existingRequest.result as LocalWalkInTransaction[]; apply(); };
  operationsRequest.onsuccess = () => { operations = operationsRequest.result as CashierOutboxOperation[]; apply(); };
  existingRequest.onerror = () => transaction.abort();
  operationsRequest.onerror = () => transaction.abort();
  await completed;
};

const reservationSnapshotKey = (scopeKey: string): string => `reservations:${scopeKey}`;

const toCachedCashierReservation = (reservation: ReservationInfo): CachedCashierReservation => ({
  id: reservation.id,
  name: reservation.name,
  barberId: reservation.barberId,
  service: reservation.service,
  servicePrice: reservation.servicePrice,
  date: reservation.date,
  time: reservation.time,
  status: reservation.status,
  createdAt: reservation.createdAt,
  reservationFeePaid: reservation.reservationFeePaid,
  reservationFeeAmount: reservation.reservationFeeAmount,
  reservationFeeMethod: reservation.reservationFeeMethod,
});

/** Stores only fields needed for the read-only offline Reservations view. */
export const saveCashierOfflineReservationSnapshot = async (
  snapshot: Omit<CashierOfflineReservationSnapshot, 'key' | 'reservations'> & {
    reservations: ReservationInfo[];
  },
): Promise<void> => {
  if (
    snapshot.branchId < 1
    || !Number.isSafeInteger(snapshot.branchId)
    || !snapshot.cashierId
    || snapshot.scopeKey !== `${snapshot.branchId}:${snapshot.cashierId}`
  ) {
    throw new Error('Reservation snapshot must use a valid cashier and branch scope');
  }

  const database = await openDatabase();
  const transaction = database.transaction(RESERVATIONS_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  transaction.objectStore(RESERVATIONS_STORE).put({
    ...snapshot,
    key: reservationSnapshotKey(snapshot.scopeKey),
    reservations: snapshot.reservations.map(toCachedCashierReservation),
  });
  await completed;
};

export const getCashierOfflineReservationSnapshot = async (
  scopeKey: string,
): Promise<CashierOfflineReservationSnapshot | null> => {
  const database = await openDatabase();
  const transaction = database.transaction(RESERVATIONS_STORE, 'readonly');
  const snapshot = await requestValue<CashierOfflineReservationSnapshot | undefined>(
    transaction.objectStore(RESERVATIONS_STORE).get(reservationSnapshotKey(scopeKey)),
  );
  return snapshot && isSnapshotWithinMaxAge(snapshot.capturedAt, CASHIER_OFFLINE_RESERVATION_SNAPSHOT_MAX_AGE_MS)
    ? snapshot
    : null;
};
