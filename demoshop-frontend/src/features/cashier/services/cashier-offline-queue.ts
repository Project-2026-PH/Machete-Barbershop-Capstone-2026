import type { BarberInfo, CashierQueueData, CustomerInfo } from '../components/queue/types';
import type { CashierConnectivityStatus } from './cashier-connectivity';
import type {
  CashierOfflineCatalogSnapshot,
  LocalWalkInTransaction,
} from './cashier-offline.repository';

const OFFLINE_BARBER_COLORS = ['#c9a84c', '#64748b', '#0f766e', '#7c3aed', '#be123c'];

/** Keep local IDs for offline replay; cloud actions require an acknowledged cloud ID. */
export const resolveCashierQueueActionEntry = (
  customer: CustomerInfo,
  connectivity: CashierConnectivityStatus,
): CustomerInfo => {
  if (connectivity !== 'online' || customer.offlineSyncStatus !== 'synced' || !customer.cloudId) {
    return customer;
  }
  return {
    ...customer,
    id: customer.cloudId,
    offlineLocal: false,
    offlineSyncStatus: undefined,
    offlineSyncError: undefined,
  };
};

export const mapLocalWalkInToQueueEntry = (transaction: LocalWalkInTransaction): CustomerInfo => ({
  id: transaction.localId,
  isWalkIn: true,
  name: transaction.customerName,
  barberId: String(transaction.barberId ?? ''),
  originalBarber: transaction.barberName || 'Barber',
  originalBarberId: String(transaction.barberId ?? ''),
  movedFrom: null,
  service: transaction.serviceSnapshot.map((service) => service.name).join(', '),
  serviceIds: transaction.serviceIds,
  retailItems: [],
  estMinutes: transaction.serviceSnapshot.reduce((total, service) => total + service.durationMinutes, 0),
  waitMin: 0,
  status: transaction.status === 'queued' ? 'waiting' : transaction.status === 'in_service' ? 'serving' : transaction.status,
  paid: transaction.paymentStatus === 'paid',
  createdAt: new Date(transaction.createdAt).toISOString(),
  timerStartedAt: null,
  cloudId: transaction.cloudId || undefined,
  offlineLocal: true,
  offlineSyncStatus: transaction.syncStatus === 'conflict'
    ? 'conflict'
    : transaction.syncStatus === 'failed'
      ? 'failed'
      : transaction.syncStatus === 'retryable'
        ? 'retryable'
        : transaction.syncStatus === 'synced'
          ? 'synced'
          : 'pending',
});

const mapCachedBarbers = (catalog: CashierOfflineCatalogSnapshot | null): BarberInfo[] =>
  (catalog?.barbers ?? []).map((barber, index) => ({
    id: String(barber.id),
    name: barber.name,
    color: OFFLINE_BARBER_COLORS[index % OFFLINE_BARBER_COLORS.length],
    status: 'offline_availability_unverified',
  }));

/** Builds a safe local queue seed when the cloud queue cannot be loaded. */
export const createOfflineCashierQueueFallback = (
  scopeKey: string,
  transactions: LocalWalkInTransaction[],
  catalog: CashierOfflineCatalogSnapshot | null,
): CashierQueueData | null => {
  const scopedCatalog = catalog?.scopeKey === scopeKey ? catalog : null;
  const localQueue = transactions
    .filter((transaction) => transaction.scopeKey === scopeKey
      && transaction.status !== 'cancelled'
      && transaction.syncStatus !== 'synced'
      // Online queue mirrors use the cloud ID as their local ID. They belong
      // to the expiring snapshot, not the durable offline journal.
      && transaction.localId !== transaction.cloudId)
    .map(mapLocalWalkInToQueueEntry);
  const barbers = mapCachedBarbers(scopedCatalog);

  if (localQueue.length === 0 && barbers.length === 0) return null;
  return { barbers, queue: localQueue, reservations: [] };
};
