import { api } from '@/config/api';
import { BARBER_COLORS } from '../components/queue/constants';
import type { PaymentAttemptStatus, ReceiptResponse } from '@demoshop/shared-types';
import type { BarberInfo, CashierQueueData, CustomerInfo, ReservationInfo } from '../components/queue/types';
import { cachedCashierRequest, invalidateCashierRequests } from './shared-request-cache';
import { formatCustomerName, formatQueueCustomerName } from './cashier-customer-name';

interface RawBarber {
  barber_id?: string | number;
  id?: string | number;
  name: string;
  is_online_booking_enabled_today?: boolean;
  is_online_booking_enabled?: boolean;
  isOnlineBookingEnabledToday?: boolean;
  is_on_duty_today?: boolean;
  isOnDutyToday?: boolean;
  is_off_today?: boolean;
  isOffToday?: boolean;
  walkin_status?: string;
  is_available_for_walkins?: boolean;
  walkin_available?: boolean;
  status?: string;
  break_started_at?: string | null;
}

interface RawQueueEntry {
  id: string | number;
  position?: number | null;
  barber_id?: string | number;
  is_walk_in?: boolean;
  customer_name?: string;
  group_booking_id?: string | null;
  group_guest_number?: number | string | null;
  guest_name?: string | null;
  first_name?: string;
  last_name?: string;
  moved_from?: string | null;
  service_name?: string;
  duration_minutes?: number;
  wait_minutes?: number;
  status: string;
  payment_status?: string;
  guest_reference?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  scheduled_start_at?: string | null;
  estimated_start_at?: string | null;
  created_at?: string | null;
  timer_started_at?: string | null;
  service_started_at?: string | null;
  service_ends_at?: string | null;
  barber_status?: string | null;
  barber_break_started_at?: string | null;
  service_ids?: unknown;
  retail_items?: unknown;
}

interface RawReservation {
  id: string | number;
  is_walk_in?: boolean;
  customer_name?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string | null;
  email?: string | null;
  barber_id: string | number;
  barber_name?: string | null;
  service_id?: string | number;
  service_ids?: number[];
  service_name?: string;
  service_price?: number | string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  status: string;
  created_at?: string | null;
  reservation_fee_paid?: boolean;
  reservation_fee_amount?: number | string | null;
  reservation_fee_method?: string | null;
  reference_number?: string | null;
  ocr_reference_number?: string | null;
  recipient_identifier_detected?: string | null;
  image_hash?: string | null;
  proof_image_url?: string | null;
  expires_at?: string | null;
  group_booking_id?: string | null;
  guest_name?: string | null;
}

interface AcceptReservationResponse {
  status?: string;
}

export const fetchQueueReceipt = (id: string) =>
  api.get<ReceiptResponse>(`/api/queue/${id}/receipt`);

const mapBarbers = (barbers: RawBarber[]): BarberInfo[] =>
  barbers.map((barber, index) => {
    const isOnlineBookingEnabledToday = barber.isOnlineBookingEnabledToday !== undefined
      ? Boolean(barber.isOnlineBookingEnabledToday)
      : (barber.is_online_booking_enabled_today !== undefined
        ? Boolean(barber.is_online_booking_enabled_today)
        : (barber.is_online_booking_enabled !== undefined ? Boolean(barber.is_online_booking_enabled) : true));

    const isOnDutyToday = barber.isOnDutyToday !== undefined
      ? Boolean(barber.isOnDutyToday)
      : (barber.is_on_duty_today !== undefined
        ? Boolean(barber.is_on_duty_today)
        : !barber.is_off_today && !barber.isOffToday);

    const isOffToday = barber.isOffToday ?? barber.is_off_today ?? !isOnDutyToday;

    return {
      id: String(barber.barber_id ?? barber.id),
      name: barber.name,
      color: BARBER_COLORS[index % BARBER_COLORS.length],
      isOnlineBookingEnabledToday,
      isOnDutyToday,
      isOffToday,
      walkinStatus: barber.walkin_status,
      isAvailableForWalkins: barber.is_available_for_walkins ?? barber.walkin_available,
      status: barber.status,
      breakStartedAt: barber.break_started_at ?? null,
    };
  });

const mapQueueEntry = (
  entry: RawQueueEntry,
  barber: BarberInfo,
  paymentAttempt?: { id: number; status: PaymentAttemptStatus },
): CustomerInfo => ({
  id: String(entry.id),
  position: entry.position ?? null,
  isWalkIn: entry.is_walk_in === true,
  name: formatQueueCustomerName(entry),
  barberId: barber.id,
  originalBarber: barber.name,
  originalBarberId: barber.id,
  movedFrom: entry.moved_from ?? null,
  service: entry.service_name ?? 'Classic Cut',
  serviceIds: Array.isArray(entry.service_ids) ? entry.service_ids.map(Number).filter(Number.isSafeInteger) : [],
  retailItems: Array.isArray(entry.retail_items) ? entry.retail_items.flatMap((item: any) => {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unitPrice);
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) return [];
    return [{ productId, quantity, unitPrice, name: String(item?.name || 'Retail item') }];
  }) : [],
  estMinutes: entry.duration_minutes ?? 30,
  waitMin: entry.wait_minutes ?? 0,
  status: entry.status,
  paid: entry.payment_status === 'paid',
  guestReference: entry.guest_reference ?? null,
  preferredDate: entry.preferred_date?.slice(0, 10) ?? null,
  preferredTime: entry.preferred_time ?? null,
  scheduledStartAt: entry.scheduled_start_at ?? null,
  estimatedStartAt: entry.estimated_start_at ?? null,
  createdAt: entry.created_at ?? null,
  timerStartedAt: entry.timer_started_at ?? null,
  serviceStartedAt: entry.service_started_at ?? null,
  serviceEndsAt: entry.service_ends_at ?? null,
  barberStatus: entry.barber_status ?? null,
  barberBreakStartedAt: entry.barber_break_started_at ?? null,
  paymentAttemptId: paymentAttempt?.id,
  paymentAttemptStatus: paymentAttempt?.status,
});

const normalizePreferredDate = (rawDate?: string | null): string | null => {
  if (!rawDate) return null;
  const str = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    }
  }
  return str.slice(0, 10);
};

const mapReservation = (reservation: RawReservation): ReservationInfo => ({
  id: String(reservation.id),
  name: formatCustomerName(reservation),
  barberId: String(reservation.barber_id),
  barberName: reservation.barber_name ?? null,
  service: reservation.service_name ?? 'Classic Cut',
  serviceIds: Array.isArray(reservation.service_ids) ? reservation.service_ids.map(Number) : [],
  servicePrice: reservation.service_price != null ? Number(reservation.service_price) : null,
  date: normalizePreferredDate(reservation.preferred_date),
  time: reservation.preferred_time ?? null,
  status: reservation.status,
  createdAt: reservation.created_at ?? null,
  reservationFeePaid: reservation.reservation_fee_paid === true,
  reservationFeeAmount: reservation.reservation_fee_amount != null ? Number(reservation.reservation_fee_amount) : null,
  reservationFeeMethod: reservation.reservation_fee_method ?? null,
  referenceNumber: reservation.reference_number ?? null,
  ocrReferenceNumber: reservation.ocr_reference_number ?? null,
  recipientIdentifierDetected: reservation.recipient_identifier_detected ?? null,
  imageHash: reservation.image_hash ?? null,
  proofImageUrl: reservation.proof_image_url ?? null,
  expiresAt: reservation.expires_at ?? null,
  phone: reservation.phone_number ?? null,
  email: reservation.email ?? null,
  groupBookingId: reservation.group_booking_id ?? null,
  guestName: reservation.guest_name ?? null,
});

const mapReservations = (rawReservations: RawReservation[]): ReservationInfo[] => {
  const mapped = rawReservations.map(mapReservation);
  const groups = new Map<string, ReservationInfo[]>();
  const result: ReservationInfo[] = [];

  for (const reservation of mapped) {
    const groupId = reservation.groupBookingId ? String(reservation.groupBookingId) : null;
    if (!groupId) {
      result.push(reservation);
      continue;
    }
    const entries = groups.get(groupId);
    if (entries) entries.push(reservation);
    else groups.set(groupId, [reservation]);
  }

  for (const entries of groups.values()) {
    if (entries.length === 1) {
      result.push(entries[0]);
      continue;
    }

    const orderedEntries = [...entries].sort((left, right) => {
      const leftName = left.guestName?.trim().toLowerCase() || '';
      const rightName = right.guestName?.trim().toLowerCase() || '';
      const leftIsAccount = leftName.includes('(you)') || leftName === 'guest 1';
      const rightIsAccount = rightName.includes('(you)') || rightName === 'guest 1';
      if (leftIsAccount !== rightIsAccount) return leftIsAccount ? -1 : 1;

      const guestNumber = (name: string): number => Number(name.match(/guest\s+(\d+)/)?.[1] || Number.MAX_SAFE_INTEGER);
      return guestNumber(leftName) - guestNumber(rightName);
    });
    const primary = orderedEntries[0];
    const totalPrice = orderedEntries.reduce((sum, entry) => sum + Number(entry.servicePrice || 0), 0);
    const totalDeposit = orderedEntries.reduce((sum, entry) => sum + Number(entry.reservationFeeAmount || 0), 0);
    const serviceNames = Array.from(new Set(orderedEntries.map((entry) => entry.service).filter(Boolean)));
    const allCancelled = orderedEntries.every((entry) => ['cancelled', 'no_show', 'expired'].includes(entry.status.toLowerCase()));
    const isLate = orderedEntries.some((entry) => entry.status.toLowerCase() === 'late');
    const hasActiveOrConfirmed = orderedEntries.some((entry) =>
      ['accepted', 'late', 'confirmed', 'waiting', 'serving'].includes(entry.status.toLowerCase())
    );

    result.push({
      ...primary,
      service: serviceNames.length === 1 ? `${serviceNames[0]} ×${entries.length}` : `${entries.length} guests`,
      servicePrice: totalPrice,
      reservationFeeAmount: totalDeposit,
      status: allCancelled ? 'cancelled' : hasActiveOrConfirmed ? (isLate ? 'late' : 'accepted') : 'pending',
      groupGuests: orderedEntries.map((entry, index) => ({
        id: entry.id,
        name: entry.guestName || (index === 0 ? `Guest (${entry.name || 'Account'})` : `Guest ${index + 1}`),
        service: entry.service,
        servicePrice: entry.servicePrice,
        barberId: entry.barberId,
        barberName: entry.barberName,
        date: entry.date,
        time: entry.time,
        status: entry.status,
      })),
    });
  }

  return result;
};

const ENABLE_LEGACY_QUEUE_FALLBACK = import.meta.env.DEV
  || import.meta.env.VITE_ENABLE_QUEUE_SNAPSHOT_FALLBACK === 'true';

// Keep a request alive until it settles. The short shared request-cache TTL is
// useful for sequential reads, but it must not allow a slow bootstrap request
// to be duplicated while the cashier dashboard is still mounting.
const inFlightQueueSnapshots = new Map<string, Promise<CashierQueueData | null>>();

export function fetchCashierQueueSnapshot(branchId?: number, targetDate?: string): Promise<CashierQueueData | null> {
  const normalizedDate = targetDate?.trim() || undefined;
  const cacheKey = `queue:snapshot:${branchId ?? 'all'}:${normalizedDate ?? 'today'}`;
  const inFlight = inFlightQueueSnapshots.get(cacheKey);
  if (inFlight) return inFlight;

  const request = cachedCashierRequest(
    cacheKey,
    () => fetchCashierQueueSnapshotUncached(branchId, normalizedDate),
    1_000,
  ).finally(() => {
    if (inFlightQueueSnapshots.get(cacheKey) === request) {
      inFlightQueueSnapshots.delete(cacheKey);
    }
  });

  inFlightQueueSnapshots.set(cacheKey, request);
  return request;
}

/**
 * Starts the cashier-critical queue, reservation, payment-attempt, and barber
 * availability request without blocking authentication or navigation.
 */
export const prefetchCashierQueue = (branchId: number, targetDate?: string): Promise<CashierQueueData | null> =>
  fetchCashierQueueSnapshot(branchId, targetDate);

async function fetchCashierQueueSnapshotUncached(branchId?: number, targetDate?: string): Promise<CashierQueueData | null> {
  try {
    const params = new URLSearchParams();
    if (branchId) params.set('branchId', String(branchId));
    if (targetDate) params.set('date', targetDate);
    const query = params.toString();
    const snapshotUrl = query ? `/api/cashier/queue/snapshot?${query}` : '/api/cashier/queue/snapshot';
    const snapshotRes = await api.get<{
      barbers: RawBarber[];
      queue: RawQueueEntry[];
      reservations: RawReservation[];
      paymentAttempts?: any[];
      bypassTimeRestrictions?: boolean;
    }>(snapshotUrl);

    if (
      snapshotRes?.data
      && Array.isArray(snapshotRes.data.barbers)
      && Array.isArray(snapshotRes.data.queue)
      && Array.isArray(snapshotRes.data.reservations)
    ) {
      const barbers = mapBarbers(snapshotRes.data.barbers);
      const barberMap = new Map<string, BarberInfo>(barbers.map((b) => [b.id, b]));

      const openPaymentAttempts = new Map<number, { id: number; status: PaymentAttemptStatus }>();
      if (Array.isArray(snapshotRes.data.paymentAttempts)) {
        snapshotRes.data.paymentAttempts.forEach((attempt: any) => {
          if (['pending_verification', 'automated_review_passed', 'flagged'].includes(attempt.status)) {
            openPaymentAttempts.set(Number(attempt.queue_entry_id), {
              id: Number(attempt.payment_attempt_id),
              status: attempt.status as PaymentAttemptStatus,
            });
          }
        });
      }

      const queue = Array.isArray(snapshotRes.data.queue)
        ? snapshotRes.data.queue.map((entry) => {
            const barber = barberMap.get(String(entry.barber_id)) || barbers[0];
            return mapQueueEntry(entry, barber, openPaymentAttempts.get(Number(entry.id)));
          })
        : [];

      const reservations = Array.isArray(snapshotRes.data.reservations)
        ? mapReservations(snapshotRes.data.reservations)
        : [];

      return {
        barbers,
        queue,
        reservations,
        bypassTimeRestrictions: Boolean(snapshotRes.data.bypassTimeRestrictions),
      };
    }

    if (!ENABLE_LEGACY_QUEUE_FALLBACK) return null;
  } catch (err) {
    console.warn('[cashier-queue.service] Unified snapshot fetch failed:', err);
    if (!ENABLE_LEGACY_QUEUE_FALLBACK) return null;
  }

  // Fallback to legacy parallel queries if unified snapshot endpoint is unavailable
  const { data: barberData } = await fetchCashierBarbers(branchId, targetDate).catch(() => ({ data: [] }));
  if (!Array.isArray(barberData) || barberData.length === 0) return null;

  const barbers = mapBarbers(barberData);
  const [queueResults, reservationsResult, paymentAttemptsResult] = await Promise.all([
        Promise.allSettled(barbers.map((barber) => fetchBarberQueue(barber.id, branchId ? String(branchId) : 'current'))),
    fetchCashierReservations(branchId).catch(() => ({ data: [] })),
    fetchPaymentAttempts(branchId).catch(() => ({ data: [] })),
  ]);

  const openPaymentAttempts = new Map<number, { id: number; status: PaymentAttemptStatus }>();
  if (Array.isArray(paymentAttemptsResult?.data)) {
    paymentAttemptsResult.data.forEach((attempt: any) => {
      if (['pending_verification', 'automated_review_passed', 'flagged'].includes(attempt.status)) {
        openPaymentAttempts.set(Number(attempt.queue_entry_id), {
          id: Number(attempt.payment_attempt_id),
          status: attempt.status as PaymentAttemptStatus,
        });
      }
    });
  }

  const queue = queueResults.flatMap((res, index) => {
    const barber = barbers[index];
    if (res.status === 'fulfilled' && barber && Array.isArray(res.value?.data)) {
      return res.value.data.map((entry) => mapQueueEntry(entry, barber, openPaymentAttempts.get(Number(entry.id))));
    }
    return [];
  });

  const reservations = Array.isArray(reservationsResult?.data)
    ? mapReservations(reservationsResult.data)
    : [];

  return { barbers, queue, reservations };
}

export async function fetchCashierQueueData(branchId: number, targetDate?: string): Promise<CashierQueueData | null> {
  return fetchCashierQueueSnapshot(branchId, targetDate);
}

export const completeQueueEntry = async (id: string, specs?: { custom_specification?: string }) => {
  const response = await api.post(`/api/queue/${id}/complete`, specs || {});
  invalidateCashierRequests();
  return response;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  return typeof data?.error === 'string'
    ? data.error
    : typeof data?.message === 'string'
      ? data.message
      : fallback;
}

export const fetchCashierReservations = (branchId?: number) => cachedCashierRequest(
  `queue:reservations:active:${branchId ?? 'current'}`,
  () => api.get<RawReservation[]>('/api/cashier/reservations'),
  1_000,
);

export const fetchCashierReservationData = async (branchId?: number): Promise<ReservationInfo[]> => {
  const response = await fetchCashierReservations(branchId);
  return Array.isArray(response.data) ? mapReservations(response.data) : [];
};

export const fetchPendingReservationsCount = (branchId?: number) => cachedCashierRequest(
  `queue:pending-count:${branchId ?? 'current'}`,
  () => api.get<{ count: number }>('/api/cashier/reservations/pending-count'),
  2_000,
);

export const fetchCashierBarbers = (branchId?: number, targetDate?: string) => cachedCashierRequest(
  `barbers:${branchId ?? 'all'}:${targetDate?.trim() || 'today'}`,
  () => {
    const params = new URLSearchParams();
    if (branchId) params.set('branchId', String(branchId));
    if (targetDate?.trim()) params.set('date', targetDate.trim());
    const query = params.toString();
    return api.get<RawBarber[]>(query ? `/api/queue/public/barbers?${query}` : '/api/queue/public/barbers');
  },
  30_000,
);

export const fetchBarberQueue = (barberId: string, scope = 'current') => cachedCashierRequest(
  `queue:barber:${scope}:${barberId}`,
  () => api.get<RawQueueEntry[]>(`/api/queue/barber/${barberId}`),
  1_000,
);

export const fetchPaymentAttempts = (branchId?: number) => cachedCashierRequest(
  `queue:payment-attempts:open:${branchId ?? 'current'}`,
  () => api.get('/api/payment-attempts?openOnly=true'),
  1_000,
);

export const notifyReservationsChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('demoshop:reservations-changed'));
    window.dispatchEvent(new CustomEvent('demoshop:appointments-changed'));
    try {
      const channel = new BroadcastChannel('demoshop_reservations_channel');
      channel.postMessage({ type: 'reservation-created' });
      channel.close();
    } catch {
      // Ignore environments without BroadcastChannel
    }
  }
};

export const acceptReservation = async (id: string) => {
  const response = await api.post<AcceptReservationResponse>(`/api/cashier/reservations/${id}/accept`);
  invalidateCashierRequests();
  notifyReservationsChanged();
  return response;
};

export const createManualReservation = async (payload: {
  customerName: string;
  serviceId: number;
  barberId: number;
  preferredDate: string;
  preferredTime: string;
  paymentMethod: 'Cash' | 'GCash';
  idempotencyKey: string;
}) => {
  const response = await api.post('/api/cashier/reservations/manual', payload);
  invalidateCashierRequests();
  notifyReservationsChanged();
  return response;
};

export const declineReservation = async (id: string, reason?: string, cancelType?: string) => {
  const response = await api.post(`/api/cashier/reservations/${id}/decline`, { reason, cancelType });
  invalidateCashierRequests();
  notifyReservationsChanged();
  return response;
};

export const recordReservationFee = async (id: string | number, payload: { paymentMethod: 'Cash' | 'GCash'; amount?: number; gcashRefNo?: string }) => {
  const response = await api.post(`/api/cashier/reservations/${id}/fee`, payload);
  invalidateCashierRequests();
  notifyReservationsChanged();
  return response;
};

export const checkInQueueEntry = async (id: string) => {
  const response = await api.post(`/api/queue/${id}/check-in`);
  invalidateCashierRequests();
  notifyReservationsChanged();
  return response;
};
export const checkInGroupBooking = async (groupBookingId: string) => {
  const response = await api.post(`/api/queue/group/${encodeURIComponent(groupBookingId)}/check-in`);
  invalidateCashierRequests();
  notifyReservationsChanged();
  return response;
};
export const markQueueNoShow = async (id: string) => {
  const response = await api.post(`/api/queue/${id}/no-show`);
  invalidateCashierRequests();
  notifyReservationsChanged();
  return response;
};
export const cancelQueueEntry = async (id: string, reason?: string) => {
  const response = await api.post(`/api/queue/cancel/${id}`, { reason });
  invalidateCashierRequests();
  notifyReservationsChanged();
  return response;
};
export const requestQueuePaymentQuote = (id: string | number) => api.get(`/api/queue/${id}/payment-quote`);
export const fetchQueueOrderImpactPreview = (id: string | number, payload: { serviceIds: number[] }) =>
  api.post(`/api/queue/${id}/order-impact-preview`, payload);
export const updateQueueOrder = async (id: string | number, payload: {
  serviceIds: number[];
  retailItems: Array<{ productId: number; quantity: number }>;
  reservationImpact?: { previewFingerprint: string; confirmed: boolean };
}) => {
  const response = await api.patch(`/api/queue/${id}/order`, payload);
  invalidateCashierRequests();
  return response;
};
export const updateQueueIdentity = async (id: string | number, payload: { customerName: string; barberId: number }) => {
  const response = await api.patch(`/api/queue/${id}/identity`, payload);
  invalidateCashierRequests();
  return response;
};
export const updateReservationBarber = async (id: string | number, barberId: number) => {
  const response = await api.patch(`/api/queue/${id}/reservation-barber`, { barberId });
  invalidateCashierRequests();
  return response;
};
export const submitQueuePayment = async (id: string | number, payload: FormData) => {
  const response = await api.post(`/api/queue/${id}/pay`, payload);
  invalidateCashierRequests();
  return response;
};
export const reconcilePaymentAttempt = (id: number | string, payload: { decision: 'confirm' | 'reject'; reason: string }) =>
  api.post(`/api/payment-attempts/${id}/reconcile`, payload).then((response) => {
    invalidateCashierRequests();
    return response;
  });

export const getPaymentAttemptReceiptUrl = (id: number | string) =>
  api.get<{ url: string; expiresInSeconds: number }>(`/api/payment-attempts/${id}/receipt-url`);

export const updateCashierBarberStatus = async (barberId: string | number, status: string) => {
  const response = await api.put(`/api/cashier/barbers/${barberId}/status`, { status });
  invalidateCashierRequests();
  return response;
};

