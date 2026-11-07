import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import type { PaymentAttemptStatus } from '@demoshop/shared-types';
import { useAuth } from '@/components/auth/AuthContext';
import { supabase } from '@/config/supabaseClient';
import { fetchCashierQueueSnapshot, fetchCashierReservationData, updateCashierBarberStatus } from '../services/cashier-queue.service';
import { invalidateCashierRequests } from '../services/shared-request-cache';
import type {
  CashierQueueData,
  BarberInfo,
  CustomerInfo,
  ReservationInfo,
} from '../components/queue/types';
import {
  createOfflineCashierQueueFallback,
  mapLocalWalkInToQueueEntry,
} from '../services/cashier-offline-queue';
import type { CashierOfflineCatalogSnapshot, LocalWalkInTransaction } from '../services/cashier-offline.repository';
import {
  getCashierConnectivityStatus,
  isCashierConnectivityFailure,
  subscribeToCashierConnectivity,
} from '../services/cashier-connectivity';
import type { RealtimeDisplayStatus } from '@/utils/supabase-realtime';
import { createRealtimeFallback } from '@/utils/supabase-realtime';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';
import { telemetryManager } from '@/utils/adaptive-polling';
import {
  CASHIER_OFFLINE_QUEUE_SNAPSHOT_MAX_AGE_MS,
  CASHIER_OFFLINE_RESERVATION_SNAPSHOT_MAX_AGE_MS,
} from '../services/cashier-cache-policy';

type QueueEntryPatch = {
  status?: string;
  paid?: boolean;
  paymentAttemptId?: number | undefined;
  paymentAttemptStatus?: PaymentAttemptStatus | undefined;
};

export type CashierReservationDataStatus = 'loading' | 'online' | 'cached' | 'stale' | 'unavailable';
export type CashierQueueDataStatus = CashierReservationDataStatus;

type QueueChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

interface QueueDataContextType {
  barbers: BarberInfo[];
  queue: CustomerInfo[];
  reservations: ReservationInfo[];
  bypassTimeRestrictions: boolean;
  loading: boolean;
  queueRefreshing: boolean;
  reservationRefreshing: boolean;
  error: string | null;
  queueDataStatus: CashierQueueDataStatus;
  queueDataUpdatedAt: number | null;
  queueDataError: string | null;
  reservationDataStatus: CashierReservationDataStatus;
  reservationDataUpdatedAt: number | null;
  reservationDataError: string | null;
  realtimeStatus: RealtimeDisplayStatus;
  refetch: () => Promise<void>;
  refetchReservations: () => Promise<void>;
  setBarberStatus: (barberId: string | number, status: string) => Promise<void>;
  patchQueueEntry: (id: string, patch: QueueEntryPatch) => () => void;
  addOptimisticQueueEntry: (entry: CustomerInfo) => void;
  addLocalOfflineQueueEntry: (entry: CustomerInfo) => void;
  addOptimisticReservation: (reservation: ReservationInfo) => void;
  removeOptimisticReservation: (id: string) => void;
  updateReservationBarber: (id: string, barberId: string) => () => void;
}

const QueueDataContext = createContext<QueueDataContextType | null>(null);

const OPEN_PAYMENT_STATUSES = new Set<PaymentAttemptStatus>([
  'pending_verification',
  'automated_review_passed',
  'flagged',
]);

const isTerminalQueueEntry = (status: string, paid?: boolean): boolean =>
  (status === 'completed' && !!paid) ||
  status === 'no_show' ||
  status === 'cancelled' ||
  status === 'expired';

const buildOfflineWalkInMirrors = (
  queue: CustomerInfo[],
  barbers: BarberInfo[],
  catalog: CashierOfflineCatalogSnapshot | null,
  scopeKey: string,
  branchId: number,
  cashierId: string,
  capturedAt: number,
): LocalWalkInTransaction[] => {
  const serviceById = new Map((catalog?.services || []).map((service) => [Number(service.id), service]));
  const barberById = new Map(barbers.map((barber) => [Number(barber.id), barber]));
  return queue.flatMap((customer) => {
    if (!customer.isWalkIn || ['cancelled', 'no_show', 'expired'].includes(customer.status)) return [];
    const serviceIds = customer.serviceIds || [];
    const serviceSnapshot = serviceIds.map((serviceId) => {
      const service = serviceById.get(serviceId);
      if (!service || !service.priceKnown || !service.durationKnown) return null;
      return { serviceId, name: service.name, price: service.price, durationMinutes: service.duration };
    });
    if (serviceIds.length === 0 || serviceSnapshot.some((service) => service === null)) return [];
    const barberId = Number(customer.barberId);
    const status = customer.status === 'serving' ? 'in_service'
      : customer.status === 'completed' ? 'completed' : 'queued';
    const createdAt = customer.createdAt ? Date.parse(customer.createdAt) : capturedAt;
    return [{
      localId: customer.id,
      cloudId: customer.cloudId || customer.id,
      scopeKey,
      branchId,
      cashierId,
      customerName: customer.name,
      barberId: Number.isSafeInteger(barberId) && barberId > 0 ? barberId : null,
      barberName: barberById.get(barberId)?.name || customer.originalBarber || 'Barber',
      serviceIds,
      serviceSnapshot: serviceSnapshot as Array<{ serviceId: number; name: string; price: number; durationMinutes: number }>,
      status,
      syncStatus: 'synced' as const,
      paymentStatus: customer.paid ? 'paid' as const : 'unpaid' as const,
      version: 1,
      createdAt: Number.isFinite(createdAt) ? createdAt : capturedAt,
      updatedAt: capturedAt,
      idempotencyKey: `cloud-walk-in:${branchId}:${customer.id}`,
    }];
  });
};

export const QueueDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, authReady, supabaseToken } = useAuth();
  const userId = user?.user_id ?? (user as { id?: string } | null | undefined)?.id;
  const branchId = Number(user?.branch_id);
  const hasBranch = Number.isInteger(branchId) && branchId > 0;
  const currentBranchIdRef = useRef(branchId);
  currentBranchIdRef.current = branchId;
  const previousBranchIdRef = useRef(branchId);
  const cashierId = String(userId ?? '');
  const offlineScopeKey = hasBranch && cashierId ? `${branchId}:${cashierId}` : null;

  const [data, setData] = useState<CashierQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queueDataStatus, setQueueDataStatus] = useState<CashierQueueDataStatus>('loading');
  const [queueDataUpdatedAt, setQueueDataUpdatedAtState] = useState<number | null>(null);
  const queueDataUpdatedAtRef = useRef<number | null>(null);
  const setQueueDataUpdatedAt = useCallback((value: number | null) => {
    queueDataUpdatedAtRef.current = value;
    setQueueDataUpdatedAtState(value);
  }, []);
  const [queueDataError, setQueueDataError] = useState<string | null>(null);
  const [reservationDataStatus, setReservationDataStatus] = useState<CashierReservationDataStatus>('loading');
  const [reservationDataUpdatedAt, setReservationDataUpdatedAtState] = useState<number | null>(null);
  const reservationDataUpdatedAtRef = useRef<number | null>(null);
  const setReservationDataUpdatedAt = useCallback((value: number | null) => {
    reservationDataUpdatedAtRef.current = value;
    setReservationDataUpdatedAtState(value);
  }, []);
  const [queueRefreshing, setQueueRefreshing] = useState(false);
  const [reservationRefreshing, setReservationRefreshing] = useState(false);
  const [reservationDataError, setReservationDataError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeDisplayStatus>('connecting');
  const [localFeatureConfigs, setLocalFeatureConfigs] = useState<string | null>(() => {
    try {
      return localStorage.getItem('demoshop_feature_management_configs');
    } catch {
      return null;
    }
  });

  const [bypassOverride, setBypassOverride] = useState<boolean | null>(() => {
    try {
      const stored = localStorage.getItem('demoshop_feature_management_configs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed?.bypassTimeRestrictions === 'boolean') {
          return parsed.bypassTimeRestrictions;
        }
      }
    } catch {}
    return null;
  });

  const dataRef = useRef<CashierQueueData | null>(null);
  const firstDataReadyReportedRef = useRef(false);
  const firstLoadStartedAtRef = useRef(Date.now());
  const localOfflineQueueEntriesRef = useRef(new Map<string, CustomerInfo>());
  const hasReservationSnapshotRef = useRef(false);
  const hasLiveQueueSnapshotRef = useRef(false);
  const hasLiveReservationSnapshotRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const trailingPromiseRef = useRef<Promise<void> | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const reservationRefreshRef = useRef<Promise<void> | null>(null);
  const trailingReservationRefreshRef = useRef<Promise<void> | null>(null);

  const updateData = useCallback((updater: (current: CashierQueueData | null) => CashierQueueData | null) => {
    setData((current) => {
      const next = updater(current);
      dataRef.current = next;
      return next;
    });
  }, []);

  const restoreCachedReservations = useCallback(async (reason?: string): Promise<boolean> => {
    if (!offlineScopeKey) return false;
    try {
      const repository = await import('../services/cashier-offline.repository');
      const storage = await repository.initializeCashierOfflineStorage();
      const cached = storage.available
        ? await repository.getCashierOfflineReservationSnapshot(offlineScopeKey)
        : null;
      if (
        !cached
        || cached.scopeKey !== offlineScopeKey
        || cached.branchId !== branchId
        || cached.cashierId !== cashierId
      ) {
        const capturedAt = reservationDataUpdatedAtRef.current;
        const liveSnapshotAge = capturedAt === null ? Number.POSITIVE_INFINITY : Date.now() - capturedAt;
        if (hasLiveReservationSnapshotRef.current
          && Number.isFinite(liveSnapshotAge)
          && liveSnapshotAge >= 0
          && liveSnapshotAge <= CASHIER_OFFLINE_RESERVATION_SNAPSHOT_MAX_AGE_MS) {
          setReservationDataStatus('stale');
          setReservationDataError(reason || 'Showing the last saved reservation list.');
          return true;
        }
        return false;
      }

      hasReservationSnapshotRef.current = true;
      setReservationDataUpdatedAt(cached.capturedAt);
      setReservationDataError(reason || 'Showing the last saved reservation list.');
      if (hasLiveReservationSnapshotRef.current) {
        setReservationDataStatus('stale');
      } else {
        updateData((current) => ({
          ...(current ?? { barbers: [], queue: [], reservations: [] }),
          reservations: cached.reservations,
        }));
        setReservationDataStatus('cached');
      }
      return true;
    } catch (cacheError) {
      console.warn('[QueueDataContext] Failed to restore cached reservations:', cacheError);
      return false;
    }
  }, [branchId, cashierId, offlineScopeKey, setReservationDataUpdatedAt, updateData]);

  const persistReservationSnapshot = useCallback((reservations: ReservationInfo[], capturedAt: number) => {
    if (!offlineScopeKey) return;
    void import('../services/cashier-offline.repository').then(async (repository) => {
      const storage = await repository.initializeCashierOfflineStorage();
      if (!storage.available) return;
      await repository.saveCashierOfflineReservationSnapshot({
        scopeKey: offlineScopeKey,
        branchId,
        cashierId,
        capturedAt,
        reservations,
      });
    }).catch((cacheError) => {
      console.warn('[QueueDataContext] Failed to cache reservations:', cacheError);
    });
  }, [branchId, cashierId, offlineScopeKey]);

  const addOptimisticQueueEntry = useCallback((entry: CustomerInfo) => {
    updateData((current) => {
      if (!current) return current;
      if (current.queue.some((c) => c.id === entry.id)) return current;
      return {
        ...current,
        queue: [...current.queue, entry],
      };
    });
  }, [updateData]);

  const addLocalOfflineQueueEntry = useCallback((entry: CustomerInfo) => {
    localOfflineQueueEntriesRef.current.set(entry.id, entry);
    updateData((current) => current
      ? { ...current, queue: current.queue.some((customer) => customer.id === entry.id)
        ? current.queue.map((customer) => customer.id === entry.id ? entry : customer)
        : [...current.queue, entry] }
      : current);
  }, [updateData]);

  const mergeLocalQueueEntries = useCallback((snapshot: CashierQueueData): CashierQueueData => {
    if (localOfflineQueueEntriesRef.current.size === 0) return snapshot;
    const queue = [...snapshot.queue];
    for (const entry of localOfflineQueueEntriesRef.current.values()) {
      const matchingIndex = queue.findIndex((customer) => customer.id === entry.id
        || Boolean(entry.cloudId && customer.id === entry.cloudId));
      if (matchingIndex < 0) {
        queue.push(entry);
        continue;
      }
      if (entry.offlineSyncStatus === 'synced' && getCashierConnectivityStatus() !== 'offline') {
        if (entry.paid) {
          queue[matchingIndex] = { ...queue[matchingIndex], paid: true };
        }
        localOfflineQueueEntriesRef.current.delete(entry.id);
        continue;
      }
      queue[matchingIndex] = { ...queue[matchingIndex], ...entry };
    }
    return { ...snapshot, queue };
  }, []);

  useEffect(() => {
    localOfflineQueueEntriesRef.current.clear();
    hasReservationSnapshotRef.current = false;
    hasLiveReservationSnapshotRef.current = false;
    setReservationDataStatus(offlineScopeKey ? 'loading' : 'unavailable');
    setReservationDataUpdatedAt(null);
    setReservationDataError(null);
    setQueueDataStatus(offlineScopeKey ? 'loading' : 'unavailable');
    setQueueDataUpdatedAt(null);
    setQueueDataError(null);
    hasLiveQueueSnapshotRef.current = false;
    hasLiveReservationSnapshotRef.current = false;
    updateData(() => null);
    if (!offlineScopeKey) return;

    let cancelled = false;
    void import('../services/cashier-offline.repository').then(async (repository) => {
      const storage = await repository.initializeCashierOfflineStorage();
      if (!storage.available) return;
      const [localTransactions, cachedCatalog, cachedReservations, cachedQueue] = await Promise.all([
        repository.listLocalWalkIns(offlineScopeKey),
        repository.getCashierOfflineCatalog(offlineScopeKey),
        repository.getCashierOfflineReservationSnapshot(offlineScopeKey),
        repository.getCashierOfflineQueueSnapshot(offlineScopeKey),
      ]);
      if (cancelled) return;
      localTransactions
        .filter((transaction) => transaction.status !== 'cancelled'
          && transaction.syncStatus !== 'synced'
          && transaction.localId !== transaction.cloudId)
        .forEach((transaction) => {
          const entry = mapLocalWalkInToQueueEntry(transaction);
          localOfflineQueueEntriesRef.current.set(entry.id, entry);
        });
      const fallback = createOfflineCashierQueueFallback(offlineScopeKey, localTransactions, cachedCatalog);
      const matchingCachedReservations = cachedReservations
        && cachedReservations.scopeKey === offlineScopeKey
        && cachedReservations.branchId === branchId
        && cachedReservations.cashierId === cashierId
        ? cachedReservations
        : null;
      const applyCachedReservations = !hasLiveReservationSnapshotRef.current && matchingCachedReservations !== null;
      const matchingCachedQueue = cachedQueue
        && cachedQueue.scopeKey === offlineScopeKey
        && cachedQueue.branchId === branchId
        && cachedQueue.cashierId === cashierId
        ? cachedQueue
        : null;
      if (applyCachedReservations && matchingCachedReservations) {
        hasReservationSnapshotRef.current = true;
        setReservationDataStatus('cached');
        setReservationDataUpdatedAt(matchingCachedReservations.capturedAt);
        setReservationDataError('Showing the last saved reservation list. Changes require a connection.');
      }
      if (matchingCachedQueue && !hasLiveQueueSnapshotRef.current) {
        setQueueDataStatus('cached');
        setQueueDataUpdatedAt(matchingCachedQueue.capturedAt);
        setQueueDataError('Showing the last saved queue. Queue position and status are unconfirmed.');
      }
      updateData((current) => {
        const base = current ?? (matchingCachedQueue
          ? {
            barbers: matchingCachedQueue.barbers,
            queue: matchingCachedQueue.queue,
            reservations: matchingCachedReservations?.reservations ?? [],
          }
          : fallback) ?? (applyCachedReservations ? { barbers: [], queue: [], reservations: [] } : null);
        if (!base) return current;
        const merged = mergeLocalQueueEntries(base);
        return applyCachedReservations && matchingCachedReservations
          ? { ...merged, reservations: matchingCachedReservations.reservations }
          : merged;
      });
    }).catch((error) => {
      console.warn('[QueueDataContext] Failed to restore local cashier walk-ins:', error);
    });

    return () => { cancelled = true; };
  }, [branchId, cashierId, offlineScopeKey, mergeLocalQueueEntries, updateData]);

  const addOptimisticReservation = useCallback((reservation: ReservationInfo) => {
    updateData((current) => current && !current.reservations.some((item) => item.id === reservation.id)
      ? { ...current, reservations: [reservation, ...current.reservations] }
      : current);
  }, [updateData]);

  const removeOptimisticReservation = useCallback((id: string) => {
    updateData((current) => current ? { ...current, reservations: current.reservations.filter((item) => item.id !== id) } : current);
  }, [updateData]);

  const updateReservationBarber = useCallback((id: string, barberId: string) => {
    const previous = dataRef.current?.reservations.find((item) => item.id === id);
    updateData((current) => current ? { ...current, reservations: current.reservations.map((item) => item.id === id ? { ...item, barberId } : item) } : current);
    return () => {
      if (previous) updateData((current) => current ? { ...current, reservations: current.reservations.map((item) => item.id === id ? previous : item) } : current);
    };
  }, [updateData]);

  const fetchQueueData = useCallback(async (): Promise<void> => {
    if (!hasBranch) return;
    if (inFlightRef.current) {
      if (!trailingPromiseRef.current) {
        trailingPromiseRef.current = inFlightRef.current.then(async () => {
          trailingPromiseRef.current = null;
          return fetchQueueData();
        });
      }
      return trailingPromiseRef.current;
    }

    setQueueRefreshing(true);
    inFlightRef.current = (async () => {
      try {
        const snapshot = await fetchCashierQueueSnapshot(branchId);
        if (currentBranchIdRef.current !== branchId) return;
        if (snapshot) {
          const capturedAt = Date.now();
          const mergedSnapshot = mergeLocalQueueEntries(snapshot);
          hasReservationSnapshotRef.current = true;
          hasLiveReservationSnapshotRef.current = true;
          hasLiveQueueSnapshotRef.current = true;
          setQueueDataStatus('online');
          setQueueDataUpdatedAt(capturedAt);
          setQueueDataError(null);
          setReservationDataStatus('online');
          setReservationDataUpdatedAt(capturedAt);
          setReservationDataError(null);
          dataRef.current = mergedSnapshot;
          setData(mergedSnapshot);
          setError(null);
          if (!firstDataReadyReportedRef.current) {
            firstDataReadyReportedRef.current = true;
            telemetryManager.logEvent('cashier_first_data_ready', {
              flow: 'queue_reservations',
              durationMs: Date.now() - firstLoadStartedAtRef.current,
            });
          }
          persistReservationSnapshot(snapshot.reservations || [], capturedAt);
          if (offlineScopeKey) {
            try {
              const repository = await import('../services/cashier-offline.repository');
              const storage = await repository.initializeCashierOfflineStorage();
              if (!storage.available) throw new Error('Offline storage is unavailable');
              await repository.saveCashierOfflineQueueSnapshot({
                scopeKey: offlineScopeKey,
                branchId,
                cashierId,
                capturedAt,
                barbers: snapshot.barbers,
                queue: snapshot.queue,
              });
              const catalog = await repository.getCashierOfflineCatalog(offlineScopeKey);
              const mirrors = buildOfflineWalkInMirrors(
                snapshot.queue,
                snapshot.barbers,
                catalog,
                offlineScopeKey,
                branchId,
                cashierId,
                capturedAt,
              );
              await repository.saveCashierOnlineWalkInMirrors(mirrors);
            } catch (cacheError) {
              console.warn('[QueueDataContext] Failed to cache online queue:', cacheError);
            }
          }
        }
      } catch (err: any) {
        console.warn('[QueueDataContext] Failed to fetch queue snapshot:', err);
        if (currentBranchIdRef.current === branchId) {
          setQueueDataStatus((current) => current === 'online' ? 'stale' : current);
          setQueueDataError('Could not refresh the queue. Showing the last snapshot while it remains within the offline window.');
          setError(err.response?.data?.error || err.message || 'Failed to load queue data');
          if (isCashierConnectivityFailure(err)) {
            if (offlineScopeKey) {
              try {
                const repository = await import('../services/cashier-offline.repository');
                const [cachedQueue, cachedCatalog] = await Promise.all([
                  repository.getCashierOfflineQueueSnapshot(offlineScopeKey),
                  repository.getCashierOfflineCatalog(offlineScopeKey),
                ]);
                if (cachedQueue?.scopeKey === offlineScopeKey && cachedQueue.branchId === branchId
                  && cachedQueue.cashierId === cashierId) {
                  setQueueDataStatus('cached');
                  setQueueDataUpdatedAt(cachedQueue.capturedAt);
                  setQueueDataError('Showing the last saved queue. Queue position and status are unconfirmed.');
                  const mirrors = buildOfflineWalkInMirrors(
                    cachedQueue.queue,
                    cachedQueue.barbers,
                    cachedCatalog,
                    offlineScopeKey,
                    branchId,
                    cashierId,
                    cachedQueue.capturedAt,
                  );
                  await repository.saveCashierOnlineWalkInMirrors(mirrors);
                } else {
                  const liveSnapshotAge = queueDataUpdatedAtRef.current === null ? Number.POSITIVE_INFINITY : Date.now() - queueDataUpdatedAtRef.current;
                  if (Number.isFinite(liveSnapshotAge)
                    && liveSnapshotAge >= 0
                    && liveSnapshotAge <= CASHIER_OFFLINE_QUEUE_SNAPSHOT_MAX_AGE_MS) {
                    setQueueDataStatus('stale');
                    setQueueDataError('Connection unavailable. Showing the last refreshed queue while it remains within the offline window.');
                  } else {
                    setQueueDataStatus('unavailable');
                    setQueueDataUpdatedAt(null);
                    setQueueDataError('The saved queue snapshot expired. Only locally saved walk-ins are shown.');
                    updateData((current) => current ? {
                      ...current,
                      barbers: [],
                      queue: [...localOfflineQueueEntriesRef.current.values()]
                        .filter((entry) => entry.offlineSyncStatus !== 'synced'
                          && (!entry.cloudId || entry.id !== entry.cloudId)),
                    } : current);
                  }
                }
                const refreshedTransactions = await repository.listLocalWalkIns(offlineScopeKey);
                const localEntries = refreshedTransactions
                  .filter((transaction) => transaction.status !== 'cancelled'
                    && transaction.syncStatus !== 'synced'
                    && transaction.localId !== transaction.cloudId)
                  .map(mapLocalWalkInToQueueEntry);
                for (const entry of localEntries) localOfflineQueueEntriesRef.current.set(entry.id, entry);
                updateData((current) => {
                  if (!current) return current;
                  const queue = [...current.queue];
                  for (const localEntry of localEntries) {
                    const matchingIndex = queue.findIndex((entry) => entry.id === localEntry.id
                      || (localEntry.cloudId && entry.id === localEntry.cloudId));
                    if (matchingIndex >= 0) queue[matchingIndex] = { ...queue[matchingIndex], ...localEntry };
                    else queue.push(localEntry);
                  }
                  return { ...current, queue };
                });
              } catch (cacheError) {
                console.warn('[QueueDataContext] Failed to restore cached online walk-ins:', cacheError);
              }
            }
            const restoredReservations = await restoreCachedReservations('Could not refresh reservations. Showing the last saved list.');
            if (!restoredReservations) {
              updateData((current) => current ? { ...current, reservations: [] } : current);
              hasReservationSnapshotRef.current = false;
              setReservationDataStatus('unavailable');
              setReservationDataError('The saved reservation list expired. Reconnect to load current reservations.');
            }
          }
          if (!hasReservationSnapshotRef.current) {
            setReservationDataStatus('unavailable');
            setReservationDataError('Reservations could not be loaded. Reconnect and retry.');
          } else if (hasLiveReservationSnapshotRef.current) {
            setReservationDataStatus('stale');
            setReservationDataError('Could not refresh reservations. Showing the last loaded list.');
          }
        }
      } finally {
        setQueueRefreshing(false);
        if (currentBranchIdRef.current === branchId) setLoading(false);
        inFlightRef.current = null;
      }
    })();

    return inFlightRef.current;
  }, [branchId, cashierId, hasBranch, mergeLocalQueueEntries, offlineScopeKey, persistReservationSnapshot, restoreCachedReservations, setQueueDataUpdatedAt, updateData]);

  useEffect(() => {
    const handleSynced = (event: Event): void => {
      const detail = (event as CustomEvent<{ localId?: string; cloudId?: string }>).detail;
      const localId = String(detail?.localId || '');
      const cloudId = String(detail?.cloudId || '');
      if (!localId || !cloudId) return;
      const previous = localOfflineQueueEntriesRef.current.get(localId);
      if (!previous) return;
      const syncedEntry: CustomerInfo = { ...previous, cloudId, offlineSyncStatus: 'synced', offlineSyncError: undefined };
      localOfflineQueueEntriesRef.current.delete(localId);
      updateData((current) => current ? {
        ...current,
        queue: current.queue.map((entry) => entry.id === localId ? syncedEntry : entry),
      } : current);
      void fetchQueueData();
    };
    const handleRetryable = (event: Event): void => {
      const detail = (event as CustomEvent<{ localId?: string; message?: string }>).detail;
      const localId = String(detail?.localId || '');
      const previous = localOfflineQueueEntriesRef.current.get(localId);
      if (!previous) return;
      const retryableEntry: CustomerInfo = {
        ...previous,
        offlineSyncStatus: 'retryable',
        offlineSyncError: detail?.message,
      };
      localOfflineQueueEntriesRef.current.set(localId, retryableEntry);
      updateData((current) => current ? {
        ...current,
        queue: current.queue.map((entry) => entry.id === localId ? retryableEntry : entry),
      } : current);
    };
    const handleConflict = (event: Event): void => {
      const detail = (event as CustomEvent<{ localId?: string; message?: string; permanent?: boolean }>).detail;
      const localId = String(detail?.localId || '');
      const previous = localOfflineQueueEntriesRef.current.get(localId);
      if (!previous) return;
      const conflictedEntry: CustomerInfo = {
        ...previous,
        offlineSyncStatus: detail?.permanent ? 'failed' : 'conflict',
        offlineSyncError: detail?.message,
      };
      localOfflineQueueEntriesRef.current.set(localId, conflictedEntry);
      updateData((current) => current ? {
        ...current,
        queue: current.queue.map((entry) => entry.id === localId ? conflictedEntry : entry),
      } : current);
    };

    window.addEventListener('cashier-offline-record-synced', handleSynced);
    window.addEventListener('cashier-offline-record-retryable', handleRetryable);
    window.addEventListener('cashier-offline-record-conflict', handleConflict);
    return () => {
      window.removeEventListener('cashier-offline-record-synced', handleSynced);
      window.removeEventListener('cashier-offline-record-retryable', handleRetryable);
      window.removeEventListener('cashier-offline-record-conflict', handleConflict);
    };
  }, [fetchQueueData, updateData]);

  const scheduleFallbackRefresh = useCallback(() => {
    invalidateCashierRequests();
    if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void fetchQueueData();
    }, 0);
  }, [fetchQueueData]);

  const refreshReservations = useCallback(async (): Promise<void> => {
    if (!hasBranch) return;
    if (reservationRefreshRef.current) {
      if (!trailingReservationRefreshRef.current) {
        trailingReservationRefreshRef.current = reservationRefreshRef.current.then(async () => {
          trailingReservationRefreshRef.current = null;
          return refreshReservations();
        });
      }
      return trailingReservationRefreshRef.current;
    }

    if (getCashierConnectivityStatus() === 'offline') {
      const restored = await restoreCachedReservations('Offline. Showing the last saved reservation list.');
      if (!restored) {
        hasReservationSnapshotRef.current = false;
        setReservationDataStatus('unavailable');
        setReservationDataError('The saved reservation list expired. Reconnect to load current reservations.');
        updateData((current) => current ? { ...current, reservations: [] } : current);
      }
      return;
    }

    invalidateCashierRequests('queue:reservations:');
    invalidateCashierRequests('queue:snapshot:');
    setReservationRefreshing(true);
    reservationRefreshRef.current = (async () => {
      try {
        const reservations = await fetchCashierReservationData(branchId);
        if (currentBranchIdRef.current !== branchId) return;
        const capturedAt = Date.now();
        hasReservationSnapshotRef.current = true;
        hasLiveReservationSnapshotRef.current = true;
        setReservationDataStatus('online');
        setReservationDataUpdatedAt(capturedAt);
        setReservationDataError(null);
        updateData((current) => ({
          ...(current ?? { barbers: [], queue: [], reservations: [] }),
          reservations,
        }));
        persistReservationSnapshot(reservations, capturedAt);
      } catch (err) {
        console.warn('[QueueDataContext] Failed to refresh reservations:', err);
        const message = 'Could not refresh reservations. Showing the last saved list.';
        const restored = isCashierConnectivityFailure(err) ? await restoreCachedReservations(message) : false;
        if (isCashierConnectivityFailure(err) && !restored) {
          hasReservationSnapshotRef.current = false;
          setReservationDataStatus('unavailable');
          setReservationDataError('The saved reservation list expired. Reconnect to load current reservations.');
          updateData((current) => current ? { ...current, reservations: [] } : current);
        }
        if (!hasReservationSnapshotRef.current) {
          setReservationDataStatus('unavailable');
          setReservationDataError('Reservations could not be loaded. Reconnect and retry.');
        } else if (hasLiveReservationSnapshotRef.current) {
          setReservationDataStatus('stale');
          setReservationDataError(message);
        }
      } finally {
        setReservationRefreshing(false);
        reservationRefreshRef.current = null;
      }
    })();

    return reservationRefreshRef.current;
  }, [branchId, cashierId, hasBranch, offlineScopeKey, persistReservationSnapshot, restoreCachedReservations, updateData]);

  useEffect(() => {
    const applyBypassUpdate = (bypassVal?: boolean, rawConfigs?: string | null) => {
      if (bypassVal !== undefined) {
        const val = Boolean(bypassVal);
        setBypassOverride(val);
        setData((current) => current ? { ...current, bypassTimeRestrictions: val } : current);
      }
      if (rawConfigs !== undefined) {
        setLocalFeatureConfigs(rawConfigs);
      }
      void fetchQueueData();
    };

    const handleStorageChange = (e?: StorageEvent) => {
      try {
        const stored = localStorage.getItem('demoshop_feature_management_configs');
        let bypassFromStorage: boolean | undefined;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (typeof parsed?.bypassTimeRestrictions === 'boolean') {
              bypassFromStorage = parsed.bypassTimeRestrictions;
            }
          } catch {}
        }
        applyBypassUpdate(bypassFromStorage, stored);
      } catch {}
    };

    const handleFeatureUpdate = (e: any) => {
      try {
        const bypassVal = e.detail?.bypassTimeRestrictions;
        applyBypassUpdate(bypassVal, JSON.stringify(e.detail || {}));
      } catch {}
    };

    // Cross-tab BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('demoshop_system_controls_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'bypass-time-restrictions-updated') {
          applyBypassUpdate(event.data?.bypassTimeRestrictions);
        }
      };
    } catch {}

    const handleRealtimeEvent = () => {
      void refreshReservations();
    };
    const handleNotificationEvent = (event: Event) => {
      const notification = (event as CustomEvent).detail;
      if (notification?.event !== 'reservation_cancelled') return;

      const queueEntryId = String(notification.queue_entry_id ?? '');
      if (queueEntryId) {
        updateData((current) => current ? {
          ...current,
          queue: current.queue.filter((customer) => customer.id !== queueEntryId),
          reservations: current.reservations.filter((reservation) => reservation.id !== queueEntryId),
        } : current);
      }
      void refreshReservations();
    };

    const handleBarberStatusEvent = () => {
      scheduleFallbackRefresh();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('demoshop:feature-flags-updated', handleFeatureUpdate);
    window.addEventListener('demoshop:reservations-changed', handleRealtimeEvent);
    window.addEventListener('demoshop:notifications-changed', handleRealtimeEvent);
    window.addEventListener('demoshop:notification-received', handleNotificationEvent);
    window.addEventListener('demoshop:barber-status-changed', handleBarberStatusEvent);

    return () => {
      if (bc) {
        try { bc.close(); } catch {}
      }
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('demoshop:feature-flags-updated', handleFeatureUpdate);
      window.removeEventListener('demoshop:reservations-changed', handleRealtimeEvent);
      window.removeEventListener('demoshop:notifications-changed', handleRealtimeEvent);
      window.removeEventListener('demoshop:notification-received', handleNotificationEvent);
      window.removeEventListener('demoshop:barber-status-changed', handleBarberStatusEvent);
    };
  }, [fetchQueueData, refreshReservations, updateData]);

  const patchQueueEntry = useCallback((id: string, patch: QueueEntryPatch): (() => void) => {
    const matchesQueueEntry = (customer: CustomerInfo) => customer.id === id || customer.cloudId === id;
    const previousCustomer = dataRef.current?.queue.find(matchesQueueEntry);
    const previousReservation = dataRef.current?.reservations.find((reservation) => reservation.id === id);

    updateData((current) => {
      if (!current) return current;
      const patchedQueue = current.queue.map((customer) =>
        matchesQueueEntry(customer) ? { ...customer, ...patch } : customer
      );
      return {
        ...current,
        queue: patchedQueue.filter((customer) => !isTerminalQueueEntry(customer.status, customer.paid)),
        reservations: 'status' in patch
          ? current.reservations.map((reservation) =>
              reservation.id === id ? { ...reservation, status: patch.status ?? reservation.status } : reservation
            )
          : current.reservations,
      };
    });

    return () => {
      if (!previousCustomer && !previousReservation) return;
      updateData((current) => {
        if (!current) return current;
        const existsInQueue = current.queue.some(matchesQueueEntry);
        let restoredQueue = current.queue;
        if (!existsInQueue && previousCustomer) {
          restoredQueue = [...current.queue, previousCustomer];
        } else if (previousCustomer) {
          restoredQueue = current.queue.map((customer) => {
            if (!matchesQueueEntry(customer)) return customer;
            const restored = { ...customer };
            if ('status' in patch && customer.status === patch.status) restored.status = previousCustomer.status;
            if ('paid' in patch && customer.paid === patch.paid) restored.paid = previousCustomer.paid;
            if ('paymentAttemptId' in patch && customer.paymentAttemptId === patch.paymentAttemptId) restored.paymentAttemptId = previousCustomer.paymentAttemptId;
            if ('paymentAttemptStatus' in patch && customer.paymentAttemptStatus === patch.paymentAttemptStatus) restored.paymentAttemptStatus = previousCustomer.paymentAttemptStatus;
            return restored;
          });
        }
        return {
          ...current,
          queue: restoredQueue,
          reservations: current.reservations.map((reservation) => {
            if (reservation.id !== id || !previousReservation || !('status' in patch) || reservation.status !== patch.status) return reservation;
            return { ...reservation, status: previousReservation.status };
          }),
        };
      });
    };
  }, [updateData]);

  const setBarberStatus = useCallback(async (barberId: string | number, nextStatus: string): Promise<void> => {
    const bId = String(barberId);
    const previousBarber = dataRef.current?.barbers.find((b) => b.id === bId);
    const previousStatus = previousBarber?.status || 'available';

    // Optimistic update
    updateData((current) => {
      if (!current) return current;
      return {
        ...current,
        barbers: current.barbers.map((b) => (b.id === bId ? { ...b, status: nextStatus } : b)),
      };
    });

    try {
      await updateCashierBarberStatus(barberId, nextStatus);
      window.dispatchEvent(new CustomEvent('demoshop:barber-status-changed', {
        detail: { barberId: bId, status: nextStatus },
      }));
      await fetchQueueData();
    } catch (err) {
      // Rollback on failure
      updateData((current) => {
        if (!current) return current;
        return {
          ...current,
          barbers: current.barbers.map((b) => (b.id === bId ? { ...b, status: previousStatus } : b)),
        };
      });
      window.dispatchEvent(new CustomEvent('demoshop:barber-status-changed', {
        detail: { barberId: bId, status: previousStatus },
      }));
      throw err;
    }
  }, [fetchQueueData, updateData]);

  useEffect(() => {
    if (previousBranchIdRef.current === branchId) return;
    previousBranchIdRef.current = branchId;
    dataRef.current = null;
    setData(null);
    setError(null);
    setLoading(hasBranch);
  }, [branchId, hasBranch]);

  useEffect(() => {
    if (authReady && hasBranch) void fetchQueueData();
  }, [authReady, hasBranch, fetchQueueData]);

  useEffect(() => {
    if (supabaseToken) supabase.realtime.setAuth(supabaseToken);
  }, [supabaseToken]);

  useEffect(() => {
    if (!authReady || !hasBranch || !userId) return;
    const channelName = `cashier-queue-${branchId}`;

    const handleQueueChange = (payload: QueueChangePayload) => {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      const id = Number(row.id);
      telemetryManager.logEvent('cashier_queue_realtime_event', {
        branchId,
        eventType: payload.eventType,
        queueEntryId: Number.isInteger(id) ? id : null,
        isWalkIn: row.is_walk_in === true,
        isTest: row.is_test === true,
      });
      if (!Number.isInteger(id)) {
        scheduleFallbackRefresh();
        return;
      }
      const queueId = String(id);

      if (payload.eventType === 'INSERT') {
        if (payload.new.is_walk_in === true) scheduleFallbackRefresh();
        else void refreshReservations();
        return;
      }
      if (payload.eventType === 'DELETE') {
        updateData((current) => current ? {
          ...current,
          queue: current.queue.filter((customer) => customer.id !== queueId),
          reservations: current.reservations.filter((reservation) => reservation.id !== queueId),
        } : current);
        return;
      }

      const knownCustomer = dataRef.current?.queue.find((customer) => customer.id === queueId);
      const knownReservation = dataRef.current?.reservations.some((reservation) => reservation.id === queueId);
      if (!knownCustomer && !knownReservation) {
        scheduleFallbackRefresh();
        return;
      }

      const newStatus = typeof payload.new.status === 'string' ? payload.new.status : knownCustomer?.status;
      const newPaid = typeof payload.new.payment_status === 'string'
        ? payload.new.payment_status === 'paid'
        : knownCustomer?.paid;

      if (newStatus && isTerminalQueueEntry(newStatus, newPaid)) {
        updateData((current) => current ? {
          ...current,
          queue: current.queue.filter((customer) => customer.id !== queueId),
          reservations: current.reservations.filter((reservation) => reservation.id !== queueId),
        } : current);
        return;
      }

      const enrichmentFields = ['barber_id', 'service_id', 'service_ids', 'position'] as const;
      const enrichmentChanged = enrichmentFields.some((field) =>
        payload.old[field] !== undefined && JSON.stringify(payload.old[field]) !== JSON.stringify(payload.new[field]));
      // Realtime UPDATE payloads may only include the old primary key unless
      // the table uses FULL replica identity. Compare the new assignment with
      // the local row as well, otherwise a barber reassignment can be missed.
      const barberAssignmentChanged = payload.new.barber_id !== undefined
        && String(payload.new.barber_id ?? '') !== String(knownCustomer?.barberId ?? '');
      // Reservation rows contain a joined projection (customer, service, fee,
      // and scheduling fields), so patching only the queue status would leave
      // the Reservations tab stale after an UPDATE event.
      if (knownReservation) void refreshReservations();
      if (enrichmentChanged || barberAssignmentChanged) scheduleFallbackRefresh();

      const patch: QueueEntryPatch = {};
      if (typeof payload.new.status === 'string') patch.status = payload.new.status;
      if (typeof payload.new.payment_status === 'string') patch.paid = payload.new.payment_status === 'paid';
      if (Object.keys(patch).length > 0) patchQueueEntry(queueId, patch);
    };

    const handlePaymentAttemptChange = (payload: QueueChangePayload) => {
      if (payload.eventType === 'DELETE') {
        scheduleFallbackRefresh();
        return;
      }
      const queueIdValue = Number(payload.new.queue_entry_id);
      const attemptId = Number(payload.new.payment_attempt_id);
      const status = payload.new.status;
      if (!Number.isInteger(queueIdValue) || !Number.isInteger(attemptId) || typeof status !== 'string') {
        scheduleFallbackRefresh();
        return;
      }
      const queueId = String(queueIdValue);
      if (!dataRef.current?.queue.some((customer) => customer.id === queueId)) {
        scheduleFallbackRefresh();
        return;
      }

      if (OPEN_PAYMENT_STATUSES.has(status as PaymentAttemptStatus)) {
        patchQueueEntry(queueId, {
          paymentAttemptId: attemptId,
          paymentAttemptStatus: status as PaymentAttemptStatus,
        });
      } else if (status === 'manually_confirmed') {
        patchQueueEntry(queueId, { paid: true, paymentAttemptId: undefined, paymentAttemptStatus: undefined });
      } else if (status === 'rejected') {
        patchQueueEntry(queueId, { paymentAttemptId: undefined, paymentAttemptStatus: undefined });
      }
    };

    const realtimeGroup = createHasuraFallbackGroup({
      onStatusChange: setRealtimeStatus,
      onFallbackActivate: scheduleFallbackRefresh,
      onBothUnavailable: scheduleFallbackRefresh,
      degradedIntervalMs: 60_000,
    });

    const supportFallbackController = createRealtimeFallback({
      telemetryChannel: `${channelName}-supporting-streams`,
      refresh: async () => { scheduleFallbackRefresh(); },
      fallbackIntervalMs: 60_000,
    });
    const supportingChannel = supabase
      .channel(`${channelName}-supporting-streams`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_attempts' },
        (payload) => handlePaymentAttemptChange(payload as QueueChangePayload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_user_id=eq.${userId}` },
        () => scheduleFallbackRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branches' },
        () => scheduleFallbackRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barbers' },
        (payload) => {
          scheduleFallbackRefresh();
          window.dispatchEvent(new CustomEvent('demoshop:barber-status-changed', {
            detail: {
              barberId: (payload.new as any)?.barber_id ?? (payload.new as any)?.id,
              status: (payload.new as any)?.status,
            },
          }));
        },
      )
      .subscribe((status, err) => {
        telemetryManager.logEvent('cashier_queue_supporting_realtime_status', {
          branchId,
          status,
          error: err ? String((err as any)?.message || err) : null,
        });
        supportFallbackController.onStatus(status, err);
      });

    realtimeGroup.subscribe(
      `subscription WatchCashierQueueEntries($branchId: Int!) {
         queue_entries(where: { branch_id: { _eq: $branchId } }, order_by: { id: desc }, limit: 50) {
           id
           barber_id
           status
           payment_status
           position
           is_walk_in
           created_at
         }
       }`,
      { branchId },
      () => scheduleFallbackRefresh(),
      (err) => console.warn('[QueueDataContext] Hasura queue_entries sub error:', err),
      {
        subscribeFallback: (onStatus) => {
          const channel = supabase
            .channel(`${channelName}-queue-entries-fallback`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'queue_entries', filter: `branch_id=eq.${branchId}` },
              (payload) => handleQueueChange(payload as QueueChangePayload),
            )
            .subscribe(onStatus);
          return () => { void supabase.removeChannel(channel); };
        },
      },
    );

    realtimeGroup.subscribe(
      `subscription WatchCashierReservations($branchId: Int!) {
         cashier_reservation_realtime(where: { branch_id: { _eq: $branchId } }, limit: 50) {
           id
           status
         }
       }`,
      { branchId },
      () => { void refreshReservations(); },
      (err) => console.warn('[QueueDataContext] Hasura cashier_reservation_realtime sub error:', err),
      {
        onFallbackActivate: refreshReservations,
        onBothUnavailable: refreshReservations,
        subscribeFallback: (onStatus) => {
          const channel = supabase
            .channel(`${channelName}-reservation-fallback`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'queue_entries', filter: `branch_id=eq.${branchId}` },
              (payload) => handleQueueChange(payload as QueueChangePayload),
            )
            .subscribe(onStatus);
          return () => { void supabase.removeChannel(channel); };
        },
      },
    );

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      realtimeGroup.cleanup();
      supportFallbackController.cleanup();
      void supabase.removeChannel(supportingChannel);
    };
  }, [authReady, branchId, fetchQueueData, hasBranch, patchQueueEntry, refreshReservations, scheduleFallbackRefresh, updateData, userId]);

  useEffect(() => {
    const reservationChannel = new BroadcastChannel('demoshop_reservations_channel');
    const handleReservationEvent = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'reservation-created') {
        void refreshReservations();
      }
    };
    reservationChannel.addEventListener('message', handleReservationEvent);
    return () => {
      reservationChannel.removeEventListener('message', handleReservationEvent);
      reservationChannel.close();
    };
  }, [refreshReservations]);

  useEffect(() => {
    let offlineWasSeen = getCashierConnectivityStatus() === 'offline';
    return subscribeToCashierConnectivity((status) => {
      if (status === 'offline') {
        offlineWasSeen = true;
        setQueueDataStatus((current) => current === 'online' ? 'stale' : current);
        setQueueDataError('Connection unavailable. Showing the last refreshed queue while it remains within the offline window.');
        void restoreCachedReservations('Offline. Showing the last saved reservation list.');
      } else if (status === 'online' && offlineWasSeen && authReady && hasBranch) {
        offlineWasSeen = false;
        void fetchQueueData();
      }
    });
  }, [authReady, fetchQueueData, hasBranch, restoreCachedReservations]);

  useEffect(() => {
    const expireSnapshots = () => {
      const now = Date.now();
      const queueExpired = ['cached', 'stale'].includes(queueDataStatus)
        && (queueDataUpdatedAt === null
          || !Number.isFinite(queueDataUpdatedAt)
          || now - queueDataUpdatedAt < 0
          || now - queueDataUpdatedAt >= CASHIER_OFFLINE_QUEUE_SNAPSHOT_MAX_AGE_MS);
      const reservationsExpired = ['cached', 'stale'].includes(reservationDataStatus)
        && (reservationDataUpdatedAt === null
          || !Number.isFinite(reservationDataUpdatedAt)
          || now - reservationDataUpdatedAt < 0
          || now - reservationDataUpdatedAt >= CASHIER_OFFLINE_RESERVATION_SNAPSHOT_MAX_AGE_MS);

      if (queueExpired) {
        setQueueDataStatus('unavailable');
        setQueueDataError('The saved queue snapshot expired. Only locally saved walk-ins are shown.');
        updateData((current) => current ? {
          ...current,
          barbers: [],
          queue: [...localOfflineQueueEntriesRef.current.values()]
            .filter((entry) => entry.offlineSyncStatus !== 'synced'
              && (!entry.cloudId || entry.id !== entry.cloudId)),
        } : current);
      }
      if (reservationsExpired) {
        hasReservationSnapshotRef.current = false;
        setReservationDataStatus('unavailable');
        setReservationDataError('The saved reservation list expired. Reconnect to load current reservations.');
        updateData((current) => current ? { ...current, reservations: [] } : current);
      }
    };

    const now = Date.now();
    const expiryAt = (capturedAt: number | null, maxAgeMs: number): number =>
      capturedAt === null || !Number.isFinite(capturedAt) || capturedAt > now
        ? now
        : capturedAt + maxAgeMs;
    const expiryTimes = [
      ['cached', 'stale'].includes(queueDataStatus)
        ? expiryAt(queueDataUpdatedAt, CASHIER_OFFLINE_QUEUE_SNAPSHOT_MAX_AGE_MS)
        : null,
      ['cached', 'stale'].includes(reservationDataStatus)
        ? expiryAt(reservationDataUpdatedAt, CASHIER_OFFLINE_RESERVATION_SNAPSHOT_MAX_AGE_MS)
        : null,
    ].filter((value): value is number => value !== null);
    if (expiryTimes.length === 0) return;

    const nextExpiryDelay = Math.max(0, Math.min(...expiryTimes) - now);
    const timer = window.setTimeout(expireSnapshots, nextExpiryDelay);

    return () => window.clearTimeout(timer);
  }, [queueDataStatus, queueDataUpdatedAt, reservationDataStatus, reservationDataUpdatedAt, updateData]);

  // Check system admin feature management configuration in addition to branch settings
  const isBypassActive = bypassOverride !== null
    ? bypassOverride
    : Boolean(
        data?.bypassTimeRestrictions ||
        (() => {
          try {
            const stored = localFeatureConfigs || localStorage.getItem('demoshop_feature_management_configs');
            if (stored) {
              const parsed = JSON.parse(stored);
              if (typeof parsed?.bypassTimeRestrictions === 'boolean') {
                return parsed.bypassTimeRestrictions;
              }
              const cashierQueue = parsed['Cashier']?.find((m: any) => m.id === 'cashier_queue');
              const bypassSub = cashierQueue?.subFeatures?.find((s: any) => s.id === 'cq-3');
              if (bypassSub?.enabled) return true;
            }
          } catch {}
          return false;
        })()
      );

  const value: QueueDataContextType = {
    barbers: data?.barbers || [],
    queue: data?.queue || [],
    reservations: data?.reservations || [],
    bypassTimeRestrictions: isBypassActive,
    loading,
    queueRefreshing,
    reservationRefreshing,
    error,
    queueDataStatus,
    queueDataUpdatedAt,
    queueDataError,
    reservationDataStatus,
    reservationDataUpdatedAt,
    reservationDataError,
    realtimeStatus,
    refetch: fetchQueueData,
    refetchReservations: refreshReservations,
    setBarberStatus,
    patchQueueEntry,
    addOptimisticQueueEntry,
    addLocalOfflineQueueEntry,
    addOptimisticReservation,
    removeOptimisticReservation,
    updateReservationBarber,
  };

  return <QueueDataContext.Provider value={value}>{children}</QueueDataContext.Provider>;
};

export const useQueueData = (): QueueDataContextType => {
  const ctx = useContext(QueueDataContext);
  if (!ctx) throw new Error('useQueueData must be used within <QueueDataProvider>');
  return ctx;
};

export const useOptionalQueueData = (): QueueDataContextType | null => {
  return useContext(QueueDataContext);
};
