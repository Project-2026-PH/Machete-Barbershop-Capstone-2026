import type { PaymentAttemptStatus } from '@demoshop/shared-types';

export const QUEUE_STATUS = {
  WAITING: 'waiting',
  SERVING: 'serving',
  DONE: 'done',
  NOSHOW: 'noshow',
} as const;

export type QueueViewMode = 'queue' | 'reservations';
export type ReservationFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'next_weeks';
export type ReservationSort = 'asc' | 'desc';

export interface BarberInfo {
  id: string;
  name: string;
  color: string;
  isOnlineBookingEnabledToday?: boolean;
  isOnDutyToday?: boolean;
  isOffToday?: boolean;
  walkinStatus?: string;
  isAvailableForWalkins?: boolean;
  status?: string;
  breakStartedAt?: string | null;
}

export interface CustomerInfo {
  id: string;
  position?: number | null;
  isWalkIn?: boolean;
  name: string;
  barberId: string;
  originalBarber?: string;
  originalBarberId: string;
  movedFrom: string | null;
  service: string;
  serviceIds?: number[];
  retailItems?: Array<{ productId: number; quantity: number; unitPrice: number; name: string }>;
  estMinutes: number;
  waitMin: number;
  status: string;
  paid: boolean;
  guestReference?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  scheduledStartAt?: string | null;
  estimatedStartAt?: string | null;
  createdAt?: string | null;
  timerStartedAt?: string | null;
  serviceStartedAt?: string | null;
  serviceEndsAt?: string | null;
  barberStatus?: string | null;
  barberBreakStartedAt?: string | null;
  paymentAttemptId?: number;
  paymentAttemptStatus?: PaymentAttemptStatus;
  offlineSyncStatus?: 'pending' | 'retryable' | 'conflict' | 'failed' | 'synced';
  offlineSyncError?: string;
  offlineLocal?: boolean;
  cloudId?: string;
}

export const isCustomerAwaitingArrival = (customer: CustomerInfo): boolean =>
  (customer.isWalkIn === false || Boolean(customer.preferredDate || customer.preferredTime))
  && ['accepted', 'late'].includes(customer.status.toLowerCase());

export interface ReservationInfo {
  id: string;
  name: string;
  barberId: string;
  barberName?: string | null;
  service: string;
  serviceIds?: number[];
  servicePrice?: number | null;
  date: string | null;
  time: string | null;
  status: string;
  createdAt?: string | null;
  reservationFeePaid?: boolean;
  reservationFeeAmount?: number | null;
  reservationFeeMethod?: string | null;
  referenceNumber?: string | null;
  ocrReferenceNumber?: string | null;
  recipientIdentifierDetected?: string | null;
  imageHash?: string | null;
  proofImageUrl?: string | null;
  expiresAt?: string | null;
  phone?: string | null;
  email?: string | null;
  groupBookingId?: string | null;
  guestName?: string | null;
  groupGuests?: Array<{
    id: string;
    name: string;
    service: string;
    servicePrice?: number | null;
    barberId: string;
    barberName?: string | null;
    date: string | null;
    time: string | null;
    status: string;
  }>;
}

export interface QueueDragState {
  draggingId: string | null;
  overId: string | null;
  overLane: string | null;
}

export interface CashierQueueData {
  barbers: BarberInfo[];
  queue: CustomerInfo[];
  reservations: ReservationInfo[];
  bypassTimeRestrictions?: boolean;
}
