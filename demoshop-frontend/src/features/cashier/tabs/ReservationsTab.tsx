import { DatePicker } from '@/components/ui/DatePicker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BarberColorPicker, BARBER_PALETTE, BARBER_COLOR_STORAGE_KEY } from './POSTab';
import { AlertTriangle, AlertCircle, ArrowRight, Check, CheckCircle, CheckCircle2, Download, Maximize2, Clock, CalendarDays, Lock, Users, X, ImageOff, Loader2, Plus, ChevronLeft, ChevronRight, ChevronDown, UserPlus, Sparkles, Info, Pencil, SlidersHorizontal } from 'lucide-react';
import { recipientMatchesConfiguredAccount, type PaymentAttemptStatus, type ReceiptResponse } from '@demoshop/shared-types';
import type { AxiosResponse } from 'axios';
import { Button } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import { useAuth } from '@/components/auth/AuthContext';
import { getManilaDateIso, reservationTimeToEpoch, timeToMinutes } from '@/utils/manila-date';
import { isInvalidCustomerNameKey, isLikelyUnusualCustomerName, normalizeCustomerNameCase, sanitizeCustomerName } from '@/utils/customer-name.util';
import { filterCashierUpcomingReservations } from '../services/cashier-reservations';
import { canCompleteCashierService } from '../services/cashier-completion';
import {
  checkInQueueEntry as checkInQueueEntryRequest,
  checkInGroupBooking as checkInGroupBookingRequest,
  cancelQueueEntry,
  completeQueueEntry,
  getPaymentAttemptReceiptUrl,
  fetchQueueReceipt,
  markQueueNoShow,
  reconcilePaymentAttempt,
  requestQueuePaymentQuote,
  submitQueuePayment,
  createManualReservation as createManualReservationRequest,
  updateReservationBarber as updateReservationBarberRequest,
  acceptReservation as acceptReservationRequest,
  declineReservation as declineReservationRequest,
} from '../services/cashier-queue.service';
import { fetchServiceCatalog } from '../services/cashier-catalog.service';
import { bookingService } from '@/features/booking/booking.service';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  calculateAvailableSlots,
  findNextAvailableDate,
  getShopHoursForDate,
  formatServiceTitle,
  formatDurationHuman,
  getRelevantSlotChips,
  selectAvailableTimeInPeriod,
  DEFAULT_DURATION_MIN,
  DEFAULT_BOOKING_BUFFER_MINUTES,
  type SlotCalculationResult,
} from '../utils/reservation-slots';
import type { BarberInfo, CustomerInfo, ReservationInfo } from '../components/queue/types';
import QueuePaymentModal, { type PaymentQuote } from '../components/queue/QueuePaymentModal';
import FinalizedReceiptModal from '../components/queue/FinalizedReceiptModal';
import { useQueueData } from '../context/QueueDataContext';
import { useShopSettings } from '@/hooks/useShopSettings';
import { completeForPayment } from '../checkout-flow';
import {
  getCashierConnectivityStatus,
  isCashierConnectivityFailure,
  subscribeToCashierConnectivity,
  type CashierConnectivityStatus,
} from '../services/cashier-connectivity';

const STATUS = {
  WAITING: 'waiting',
  SERVING: 'serving',
  CONFIRMED: 'accepted',
  LATE: 'late',
  DONE: 'completed',
  NOSHOW: 'no_show',
} as const;

const EARLY_CHECK_IN_WINDOW_MS = 10 * 60_000;
const CONNECTION_NOTICE_DELAY_MS = 5_000;

type ViewMode = 'queue' | 'reservations';

const formatReservationDateConsistent = (date: string | null): string => {
  if (!date) return 'Date not set';
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

const formatReservationDateLong = formatReservationDateConsistent;

const formatReservationTime12Hour = (time: string | null): string => {
  if (!time) return 'Time not set';
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return time;
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  }).format(new Date(Date.UTC(2020, 0, 1, hour, minute)));
};

const isBarberOnBreak = (status?: string | null): boolean =>
  ['on_break', 'break'].includes(String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_'));

const getBreakElapsedMinutes = (barber: BarberInfo | undefined, now: number): number | null => {
  if (!barber?.breakStartedAt) return null;
  const start = new Date(barber.breakStartedAt).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 60_000)) : null;
};

const isReservationExpired = (reservation: ReservationInfo, now: number): boolean => {
  if (!['pending', STATUS.CONFIRMED, STATUS.LATE].includes(reservation.status)) return false;
  const scheduledAt = reservationTimeToEpoch(reservation.date, reservation.time);
  return scheduledAt !== null && now >= scheduledAt + 10 * 60_000;
};

const getReservationStatusPresentation = (reservation: ReservationInfo, now: number) => {
  if (isReservationExpired(reservation, now)) {
    return {
      label: 'Expired',
      badgeClass: 'bg-red-500/15 text-red-300 border border-red-500/30',
      dotClass: 'bg-red-400',
    };
  }
  if (reservation.status === STATUS.LATE) {
    return {
      label: 'Late',
      badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
      dotClass: 'bg-amber-400',
    };
  }
  if (reservation.status === STATUS.CONFIRMED) {
    const scheduledAt = reservationTimeToEpoch(reservation.date, reservation.time);
    if (scheduledAt !== null && now >= scheduledAt) {
      return {
        label: 'Ready for Check-In',
        badgeClass: 'bg-sky-500/15 text-sky-300 border border-sky-400/30',
        dotClass: 'bg-sky-400',
      };
    }
    if (scheduledAt !== null && now >= scheduledAt - EARLY_CHECK_IN_WINDOW_MS) {
      return {
        label: 'Early Check-In Available',
        badgeClass: 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/30',
        dotClass: 'bg-cyan-400',
      };
    }
    return {
      label: 'Confirmed',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
      dotClass: 'bg-emerald-400',
    };
  }
  return {
    label: 'Needs Review',
    badgeClass: 'bg-gold/10 text-gold border border-gold/30',
    dotClass: 'bg-gold',
  };
};

type QueuePositionInfo = { position: number; isServing: boolean };

const QueuePositionBadge = ({ info, color }: { info?: QueuePositionInfo; color?: string }) => (
  info ? (
    <span
      className={`inline-flex min-w-8 items-center justify-center rounded-sm px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-wide ${info.isServing
        ? 'bg-gold text-charcoal'
        : 'border border-gold/25 bg-gold/10 text-gold'
      }`}
      style={color ? (info.isServing
        ? { backgroundColor: color, color: '#1b1a17' }
        : { color, borderColor: `${color}80`, backgroundColor: `${color}20` }) : undefined}
      aria-label={info.isServing ? 'Now serving' : `Queue position ${info.position}`}
      title={info.isServing ? 'Now serving' : `Queue position ${info.position}`}
    >
      {info.isServing ? 'NOW' : `#${info.position}`}
    </span>
  ) : (
    <span className="text-xs text-ivory-dim/50" aria-label="Not in queue" title="Not in queue">—</span>
  )
);

const formatMinutes = (minutes: number): string =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

const manualTimeToMinutes = (time: string): number => {
  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (twentyFourHour) return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);
  return timeToMinutes(time);
};

const manualTimeToEpoch = (date: string, time: string): number | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;
  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return reservationTimeToEpoch(date, `${hour12}:${match[2]} ${period}`);
};

const isOpenPaymentAttempt = (status?: PaymentAttemptStatus): boolean =>
  status === 'pending_verification' || status === 'automated_review_passed' || status === 'flagged';


const statusPresentation = (customer: CustomerInfo) => {
  if (isOpenPaymentAttempt(customer.paymentAttemptStatus)) {
    return { label: 'Receipt needs confirmation', color: '#60a5fa', background: 'rgba(96,165,250,0.14)' };
  }
  if (customer.status === STATUS.SERVING) return { label: 'Serving', color: '#c9a84c', background: 'rgba(201,168,76,0.14)' };
  if (customer.status === STATUS.CONFIRMED) return { label: 'Confirmed', color: '#4c9ac9', background: 'rgba(76,154,201,0.14)' };
  if (customer.status === STATUS.LATE) return { label: 'Late', color: '#e08c3a', background: 'rgba(224,140,58,0.14)' };
  if (customer.status === STATUS.DONE && customer.paid) return { label: 'Paid', color: '#4caf82', background: 'rgba(76,175,130,0.14)' };
  if (customer.status === STATUS.DONE) return { label: 'Awaiting payment', color: '#888', background: 'rgba(136,136,136,0.14)' };
  if (customer.status === STATUS.NOSHOW) return { label: 'No show', color: '#e05555', background: 'rgba(224,85,85,0.14)' };
  return { label: 'Waiting', color: '#4caf82', background: 'rgba(76,175,130,0.14)' };
};

interface GroupGuestListProps {
  reservation: ReservationInfo;
  onCheckInGuest?: (id: string, name: string) => void;
  onNoShowGuest?: (id: string, name: string) => void;
  bypassTimeRestrictions?: boolean;
  canMutate?: boolean;
}

function GroupGuestList({
  reservation,
  onCheckInGuest,
  onNoShowGuest,
  bypassTimeRestrictions = false,
  canMutate = true,
}: GroupGuestListProps) {
  const { addToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);

  if (!reservation.groupGuests || reservation.groupGuests.length < 2) return null;

  const barberNames = Array.from(new Set(reservation.groupGuests.map((guest) => guest.barberName).filter(Boolean)));
  const total = reservation.groupGuests.length;
  const checkedInCount = reservation.groupGuests.filter((g) =>
    ['serving', 'waiting', 'completed', 'paid'].includes(g.status.toLowerCase())
  ).length;
  const noShowCount = reservation.groupGuests.filter((g) =>
    ['no_show', 'cancelled', 'expired'].includes(g.status.toLowerCase())
  ).length;
  const now = Date.now();

  const isReservationConfirmed = ['accepted', 'late', 'confirmed'].includes(reservation.status.toLowerCase());

  return (
    <div className="mt-2.5 rounded-sm border border-gold/25 bg-gold/[0.04] p-2 text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Hide' : 'Show'} guests for group booking`}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gold">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>Group booking · {total} guests</span>
          {(checkedInCount > 0 || noShowCount > 0) && (
            <span className="font-medium normal-case text-ivory-dim">
              ({checkedInCount} checked in{noShowCount > 0 ? `, ${noShowCount} no-show` : ''})
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex -space-x-1">
            {barberNames.slice(0, 3).map((name) => (
              <span
                key={name}
                className="flex h-4 w-4 items-center justify-center rounded-full border border-charcoal bg-gold text-[8px] font-bold text-charcoal"
                title={name || undefined}
              >
                {name?.charAt(0).toUpperCase()}
              </span>
            ))}
          </span>
          <span className="text-[10px] text-ivory-dim">{barberNames.length} {barberNames.length === 1 ? 'barber' : 'barbers'}</span>
          <span className="text-[10px] font-semibold text-gold/80">{isExpanded ? 'Hide' : 'Show'}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-gold transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {isExpanded && (
        <div className="mt-2 divide-y divide-white/5 border-t border-gold/15 pt-1.5">
          {reservation.groupGuests.map((guest, index) => {
            const guestStatus = (guest.status || '').toLowerCase();
            const isServing = guestStatus === 'serving';
            const isWaiting = guestStatus === 'waiting';
            const isNoShow = guestStatus === 'no_show';
            const isCancelled = guestStatus === 'cancelled' || guestStatus === 'expired';
            const isCompleted = guestStatus === 'completed' || guestStatus === 'paid';
            const isEligibleToProcess = isReservationConfirmed && ['accepted', 'late', 'confirmed'].includes(guestStatus);

            const scheduledGuestEpoch = reservationTimeToEpoch(guest.date || reservation.date, guest.time || reservation.time);
            const isGuestArrivalReached = scheduledGuestEpoch === null || now >= scheduledGuestEpoch;
            const isGuestCheckInEligible = bypassTimeRestrictions || isGuestArrivalReached;
            const isGuestNoShowEligible = bypassTimeRestrictions || isGuestArrivalReached;
            const displayGuestTime = guest.time
              ? formatReservationTime12Hour(guest.time)
              : (scheduledGuestEpoch
                ? new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Manila',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  }).format(new Date(scheduledGuestEpoch))
                : 'scheduled time');

            const handleCheckInGuest = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!isGuestCheckInEligible) {
                addToast({
                  type: 'info',
                  title: 'Check In Locked',
                  message: `Check In for ${guest.name} is unavailable until the scheduled arrival time (${displayGuestTime}).`,
                });
                return;
              }
              onCheckInGuest?.(guest.id, guest.name);
            };

            const handleNoShowGuest = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!isGuestNoShowEligible) {
                addToast({
                  type: 'info',
                  title: 'Action Locked',
                  message: `Cannot mark ${guest.name} as No Show before the scheduled arrival time (${displayGuestTime}).`,
                });
                return;
              }
              onNoShowGuest?.(guest.id, guest.name);
            };

            return (
              <div
                key={guest.id}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs transition-colors hover:bg-white/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ivory">
                      {guest.name || `Guest ${index + 1}`}
                    </span>
                    <span className="text-[11px] text-gold/90 font-medium">
                      · {guest.barberName || 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-ivory-dim">
                    <span>{formatServiceTitle(guest.service)}</span>
                    {guest.time && <span>· {formatReservationTime12Hour(guest.time)}</span>}
                    {guest.servicePrice != null && <span>· ₱{Number(guest.servicePrice).toFixed(0)}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {isServing && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                      Serving
                    </span>
                  )}
                  {isWaiting && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      In Queue
                    </span>
                  )}
                  {isNoShow && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                      <X className="h-3 w-3" />
                      No Show
                    </span>
                  )}
                  {isCancelled && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-ivory-dim/60">
                      Cancelled
                    </span>
                  )}
                  {isCompleted && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      <Check className="h-3 w-3 stroke-[2.5]" />
                      Done
                    </span>
                  )}
                  {isEligibleToProcess && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!canMutate}
                        onClick={handleCheckInGuest}
                        className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-[11px] font-bold transition-all shadow-sm ${
                          isGuestCheckInEligible && canMutate
                            ? 'bg-gold text-charcoal hover:bg-gold-dim cursor-pointer active:scale-95'
                            : 'bg-white/5 text-ivory-dim/40 border border-white/10 cursor-not-allowed opacity-75'
                        }`}
                        title={isGuestCheckInEligible ? `Check in ${guest.name}` : `Check In locked until ${displayGuestTime}`}
                      >
                        {!isGuestCheckInEligible ? (
                          <Lock className="h-3 w-3 text-ivory-dim/40 shrink-0" />
                        ) : (
                          <Check className="h-3 w-3 stroke-[2.5]" />
                        )}
                        <span>Check In</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canMutate}
                        onClick={handleNoShowGuest}
                        className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold transition-all ${
                          isGuestNoShowEligible && canMutate
                            ? 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 cursor-pointer active:scale-95'
                            : 'border-white/10 bg-white/5 text-ivory-dim/40 cursor-not-allowed opacity-75'
                        }`}
                        title={isGuestNoShowEligible ? `Mark ${guest.name} as No Show` : `No Show locked until ${displayGuestTime}`}
                      >
                        <X className="h-3 w-3" />
                        <span>No Show</span>
                      </button>
                    </div>
                  )}
                  {!isReservationConfirmed && !isServing && !isWaiting && !isNoShow && !isCancelled && !isCompleted && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
                      Needs Review
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface QueueCustomerRowProps {
  customer: CustomerInfo;
  position: number;
  bypassTimeRestrictions: boolean;
  onComplete: (id: string) => void;
  onPayment: (id: string) => void;
  onCheckIn: (id: string) => void;
  onCancel: (customer: CustomerInfo) => void;
  onNoShow: (id: string) => void;
  onReviewPaymentAttempt: (customer: CustomerInfo) => void;
}

function QueueCustomerRow({
  customer,
  position,
  bypassTimeRestrictions,
  onComplete,
  onPayment,
  onCheckIn,
  onCancel,
  onNoShow,
  onReviewPaymentAttempt,
}: QueueCustomerRowProps) {
  const { addToast } = useToast();
  const presentation = statusPresentation(customer);
  const isConfirmed = customer.status === STATUS.CONFIRMED || customer.status === STATUS.LATE;
  const canComplete = canCompleteCashierService(customer.status, bypassTimeRestrictions);
  const canReviewPaymentAttempt = isOpenPaymentAttempt(customer.paymentAttemptStatus) && customer.paymentAttemptId !== undefined;
  const canPay = customer.status === STATUS.DONE && !customer.paid && !isOpenPaymentAttempt(customer.paymentAttemptStatus);

  // Time gate calculations
  const now = Date.now();
  const scheduledArrivalEpoch = reservationTimeToEpoch(customer.preferredDate, customer.preferredTime);
  const isEarlyCheckInWindow = scheduledArrivalEpoch !== null
    && now >= scheduledArrivalEpoch - EARLY_CHECK_IN_WINDOW_MS
    && now < scheduledArrivalEpoch;
  const isArrivalReached = scheduledArrivalEpoch === null || now >= scheduledArrivalEpoch;

  const checkInEligible = bypassTimeRestrictions || (scheduledArrivalEpoch !== null
    && now >= scheduledArrivalEpoch - EARLY_CHECK_IN_WINDOW_MS);
  const noShowEligible = bypassTimeRestrictions || isArrivalReached;

  const displayArrivalTime = customer.preferredTime || (scheduledArrivalEpoch ? new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(scheduledArrivalEpoch)) : 'the scheduled time');

  const handleCheckInClick = () => {
    if (!checkInEligible) {
      addToast({
        type: 'info',
        title: 'Check In Locked',
        message: `Early check-in opens 10 minutes before the scheduled arrival time (${displayArrivalTime}).`,
      });
      return;
    }
    onCheckIn(customer.id);
  };

  const handleNoShowClick = () => {
    if (!noShowEligible) {
      addToast({
        type: 'info',
        title: 'Action Locked',
        message: `Cannot mark as No Show before the scheduled arrival time (${displayArrivalTime}).`,
      });
      return;
    }
    onNoShow(customer.id);
  };

  const handleCompleteClick = () => {
    onComplete(customer.id);
  };

  return (
    <article className="grid min-h-[60px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/5 px-3 py-2 hover:bg-white/[0.02] transition-colors sm:min-h-[64px] sm:grid-cols-[52px_minmax(150px,1fr)_minmax(150px,1fr)_130px_auto] sm:gap-4 sm:px-5 sm:py-2">
      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
        customer.status === STATUS.SERVING
          ? 'bg-gold text-charcoal'
          : 'bg-gold/10 text-gold border border-gold/20'
      }`}>
        {customer.status === STATUS.SERVING ? 'Now' : position}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-ivory">{customer.name || 'Walk-in customer'}</p>
        <p className="mt-0.5 truncate text-xs text-ivory-dim">{customer.service}</p>
        {customer.guestReference && <p className="mt-0.5 font-mono text-[11px] text-gold">{customer.guestReference}</p>}
      </div>
      <div className="hidden min-w-0 sm:block">
        <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide" style={{ color: presentation.color, background: presentation.background }}>
          {presentation.label}
        </span>
        <p className="mt-1 text-xs text-ivory-dim">Est. Service: {formatMinutes(customer.estMinutes)}</p>
      </div>
      <div className="hidden text-xs text-ivory-dim sm:block">
        {customer.status === STATUS.WAITING ? (
          `${formatMinutes(customer.waitMin)} est. wait`
        ) : customer.preferredTime ? (
          <div>
            <p className="font-semibold text-ivory">{customer.preferredTime}</p>
            <p className="text-[10px] text-ivory-dim">Est. Arrival</p>
          </div>
        ) : (
          '—'
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {isConfirmed && (
          <>
            <button
              type="button"
              onClick={handleCheckInClick}
              className={`h-9 rounded-sm border px-3 text-xs font-bold transition-all ${
                checkInEligible
                  ? 'border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20 cursor-pointer'
                  : 'border-green-500/20 bg-green-500/5 text-green-500/50 cursor-not-allowed'
              }`}
            >
              {isEarlyCheckInWindow ? 'Early Check-In' : 'Check In'}
            </button>
            <button
              type="button"
              onClick={handleNoShowClick}
              className={`h-9 rounded-sm border px-3 text-xs font-semibold transition-all ${
                noShowEligible
                  ? 'border-red-500/30 text-red-300 hover:bg-red-500/10 cursor-pointer'
                  : 'border-red-500/20 text-red-500/40 cursor-not-allowed'
              }`}
            >
              No Show
            </button>
            <button
              type="button"
              onClick={() => onCancel(customer)}
              className="h-9 rounded-sm border border-white/10 px-3 text-xs font-semibold text-ivory-dim hover:border-red-400/40 hover:text-red-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </>
        )}
        {canComplete && (
          <button
            type="button"
            onClick={handleCompleteClick}
            className="h-9 rounded-sm border border-gold bg-gold px-4 text-xs font-bold text-charcoal hover:bg-gold-light cursor-pointer transition-all"
          >
            Complete
          </button>
        )}
        {canReviewPaymentAttempt && (
          <button
            type="button"
            onClick={() => onReviewPaymentAttempt(customer)}
            className="h-9 rounded-sm border border-blue-400/40 bg-blue-500/10 px-3 text-xs font-bold text-blue-200 hover:bg-blue-500/20 transition-all cursor-pointer"
          >
            Review receipt
          </button>
        )}
        {canPay && (
          <button
            type="button"
            onClick={() => onPayment(customer.id)}
            className="h-9 rounded-sm border border-gold px-4 text-xs font-bold text-gold hover:bg-gold/10 transition-all cursor-pointer"
          >
            Collect Payment
          </button>
        )}
      </div>
    </article>
  );
}

interface QueueLaneProps extends Omit<QueueCustomerRowProps, 'customer' | 'position'> {
  customers: CustomerInfo[];
  bypassTimeRestrictions: boolean;
}

function QueueLane({ customers, bypassTimeRestrictions, ...actions }: QueueLaneProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const active = customers.filter(customer => customer.status !== STATUS.DONE && customer.status !== STATUS.NOSHOW);
  const completed = customers.filter(customer => customer.status === STATUS.DONE);
  let waitMinutes = 0;
  const activeWithCalculatedWaits = active.map(customer => {
    const customerWithWait = { ...customer, waitMin: waitMinutes };
    waitMinutes += Math.max(0, customer.estMinutes);
    return customerWithWait;
  });

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center border-t border-white/10 px-5 py-12 text-center text-sm text-ivory-dim">
        <Users className="h-6 w-6 text-gold/40 mb-2" />
        <p className="font-medium text-ivory">No customers in this queue</p>
        <p className="text-xs text-ivory-dim mt-0.5">This barber currently has no waiting or active customers.</p>
      </div>
    );
  }

  return (
    <>
      {activeWithCalculatedWaits.map((customer, index) => (
        <QueueCustomerRow
          key={customer.id}
          customer={customer}
          position={index + 1}
          bypassTimeRestrictions={bypassTimeRestrictions}
          {...actions}
        />
      ))}
      {completed.length > 0 && (
        <div className="border-t border-white/10 p-3 bg-charcoal/40">
          <button
            type="button"
            onClick={() => setShowCompleted(value => !value)}
            className="h-9 w-full rounded-sm border border-white/10 bg-white/[0.03] px-4 text-xs font-semibold text-ivory-dim hover:border-gold/30 hover:text-gold transition-colors cursor-pointer"
          >
            {showCompleted ? 'Hide' : 'Show'} completed services ({completed.length})
          </button>
          {showCompleted && (
            <div className="mt-3 overflow-hidden rounded-sm border border-white/10">
              {completed.map((customer, index) => (
                <QueueCustomerRow
                  key={customer.id}
                  customer={customer}
                  position={active.length + index + 1}
                  bypassTimeRestrictions={bypassTimeRestrictions}
                  {...actions}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ReservationsTabContent() {
    const reduceMotion = useReducedMotion();
  const { user } = useAuth();
  const cashierBranchId = Number((user as any)?.branch_id);
  const { settings: shopSettings } = useShopSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  // Reservations are the dedicated Cashier view. Keep the URL parameter for
  // deep links and existing notification navigation, but do not expose the
  // former all-customers toggle in this screen.
  const initialView = 'reservations';
  const [activeBarberId, setActiveBarberId] = useState<string | null>(null);
  const [viewMode, setViewModeState] = useState<ViewMode>(initialView);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (mode === 'reservations') {
        next.set('view', 'reservations');
      } else {
        next.delete('view');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'reservations') {
      setViewModeState('reservations');
    } else if (view === 'queue') {
      setViewModeState('reservations');
    }
  }, [searchParams]);

  useEffect(() => {
    const handleSwitchView = (e: CustomEvent) => {
      if (e.detail === 'reservations' || e.detail?.view === 'reservations') {
        setViewModeState('reservations');
      }
    };
    window.addEventListener('demoshop:queue-view', handleSwitchView as EventListener);
    return () => window.removeEventListener('demoshop:queue-view', handleSwitchView as EventListener);
  }, []);
  const [reservationsFilter, setReservationsFilter] = useState('all');
  const [reservationBarberFilter, setReservationBarberFilter] = useState('all');
  const [reservationDateFilter, setReservationDateFilter] = useState('all');
  const [reservationFiltersOpen, setReservationFiltersOpen] = useState(false);
  const reservationFiltersRef = useRef<HTMLDivElement>(null);
  const reservationFiltersButtonRef = useRef<HTMLButtonElement>(null);
  const activeReservationFilterCount = Number(reservationDateFilter !== 'all') + Number(reservationBarberFilter !== 'all');
  useEffect(() => {
    if (!reservationFiltersOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-reservation-date-picker]')) return;
      if (event.target instanceof Node && !reservationFiltersRef.current?.contains(event.target)) setReservationFiltersOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('[data-reservation-date-picker]')) return;
      setReservationFiltersOpen(false);
      reservationFiltersButtonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [reservationFiltersOpen]);
  const reservationResultsRef = useRef<HTMLDivElement>(null);
  const [reservationResultsMinHeight, setReservationResultsMinHeight] = useState(0);
  const preserveReservationResultsHeight = () => {
    // Keep shorter filtered results from clamping the document's scroll position.
    const height = reservationResultsRef.current?.getBoundingClientRect().height ?? 0;
    setReservationResultsMinHeight((current) => Math.max(current, height));
  };
  useEffect(() => {
    const resetResultsHeight = () => setReservationResultsMinHeight(0);
    window.addEventListener('resize', resetResultsHeight);
    return () => window.removeEventListener('resize', resetResultsHeight);
  }, []);
  const [acceptTarget, setAcceptTarget] = useState<ReservationInfo | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [proofImageLoaded, setProofImageLoaded] = useState(false);
  const [proofImageError, setProofImageError] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<ReservationInfo | null>(null);
  const [declineReason, setDeclineReason] = useState('Customer No-Show');
  const [customDeclineReason, setCustomDeclineReason] = useState('');
  const [paymentTargetId, setPaymentTargetId] = useState<string | null>(null);
  const [paymentQuote, setPaymentQuote] = useState<PaymentQuote | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentQuoteLoading, setPaymentQuoteLoading] = useState(false);
  const [paymentQuoteError, setPaymentQuoteError] = useState<string | null>(null);
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string | null>(null);
  const paymentQuoteRequestRef = useRef(0);
  const paymentTargetRef = useRef<string | null>(null);
  const completingIdsRef = useRef(new Set<string>());
  const completionRetryRef = useRef<string | null>(null);
  const [paymentAttemptReviewTarget, setPaymentAttemptReviewTarget] = useState<CustomerInfo | null>(null);
  const [paymentAttemptReceiptUrl, setPaymentAttemptReceiptUrl] = useState<string | null>(null);
  const [paymentAttemptReviewError, setPaymentAttemptReviewError] = useState<string | null>(null);
  const [paymentAttemptReceiptLoading, setPaymentAttemptReceiptLoading] = useState(false);
  const [paymentAttemptVerified, setPaymentAttemptVerified] = useState(false);
  const [paymentAttemptConfirming, setPaymentAttemptConfirming] = useState(false);
  const [finalizedReceipt, setFinalizedReceipt] = useState<ReceiptResponse | null>(null);
  const [maximizedPhotoUrl, setMaximizedPhotoUrl] = useState<string | null>(null);
  const { addToast } = useToast();
  const [connectivityStatus, setConnectivityStatus] = useState<CashierConnectivityStatus>(getCashierConnectivityStatus);

  useEffect(() => subscribeToCashierConnectivity(setConnectivityStatus), []);

  const notify = useCallback((message: string) => {
    let type: 'success' | 'warning' | 'info' | 'error' = 'success';
    let title = 'Success';
    if (message.includes('⚠') || message.includes('Warning')) { type = 'warning'; title = 'Warning'; }
    else if (message.includes('✕') || message.toLowerCase().includes('declined')) { type = 'info'; title = 'Updated'; }
    const cleanMessage = message.replace(/^[✓₱⚠✕↪\s]+/, '');
    addToast({ type, title, message: cleanMessage });
  }, [addToast]);

  const {
    barbers,
    queue,
    reservations,
    bypassTimeRestrictions,
    reservationDataStatus,
    reservationDataUpdatedAt,
    reservationDataError,
    queueRefreshing,
    reservationRefreshing,
    refetch: refetchQueue,
    refetchReservations,
    patchQueueEntry,
    addOptimisticReservation,
    removeOptimisticReservation,
    updateReservationBarber,
  } = useQueueData();
  const canMutateReservations = reservationDataStatus === 'online' && connectivityStatus !== 'offline';
  const requireLiveReservationData = useCallback((): boolean => {
    if (canMutateReservations) return true;
    addToast({
      type: 'warning',
      title: 'Connection Required',
      message: 'Reconnect and refresh live data before performing this action.',
    });
    return false;
  }, [addToast, canMutateReservations]);
  const [manualName, setManualName] = useState('');
  const [manualNameConfirmation, setManualNameConfirmation] = useState<string | null>(null);
  const [manualServiceId, setManualServiceId] = useState('');
  const [manualBarberId, setManualBarberId] = useState('any');
  const [formTouched, setFormTouched] = useState<{ name?: boolean; service?: boolean; date?: boolean; time?: boolean; barber?: boolean }>({});
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('');
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('AM');
  const [timeValidationError, setTimeValidationError] = useState<string | null>(null);
  const [isTimeManuallyEdited, setIsTimeManuallyEdited] = useState(false);
  const [manualBarberAvailabilityByTime, setManualBarberAvailabilityByTime] = useState<Record<string, {
    slots: string[];
    busyPeriods: Array<{ startTime: string; endTime: string }>;
    isUnavailable: boolean;
    onlineEnabled: boolean;
    isOnDuty: boolean;
    walkinsAvailable: boolean;
    verificationFailed: boolean;
  }>>({});
  const [manualAvailabilityQuery, setManualAvailabilityQuery] = useState('');
  const [manualAvailabilityLoading, setManualAvailabilityLoading] = useState(false);
  const [manualAvailabilityError, setManualAvailabilityError] = useState<string | null>(null);
  const [manualServicesError, setManualServicesError] = useState<string | null>(null);
  const [showManualReferenceErrors, setShowManualReferenceErrors] = useState(false);
  const [manualReferenceDataRetry, setManualReferenceDataRetry] = useState(0);
  const [manualDate, setManualDate] = useState(getManilaDateIso());
  const [manualTime, setManualTime] = useState('');
  const [manualPaymentMethod, setManualPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [timeFeedback, setTimeFeedback] = useState<string | null>(null);
  const previousManualTimeRef = useRef('');
  useEffect(() => {
    const previous = previousManualTimeRef.current;
    previousManualTimeRef.current = manualTime;
    if (!manualTime) {
      setTimeFeedback(null);
      return;
    }
    if (previous === manualTime) return;
    setTimeFeedback(previous
      ? `Time updated: ${formatReservationTime12Hour(previous)} → ${formatReservationTime12Hour(manualTime)}`
      : `Suggested time: ${formatReservationTime12Hour(manualTime)}`);
    const timeout = window.setTimeout(() => setTimeFeedback(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [manualTime]);
  const [manualServices, setManualServices] = useState<Array<{
    id: string;
    name: string;
    price: number;
    durationMinutes: number;
    isMissingDuration: boolean;
  }>>([]);
  const [manualCalendarOpen, setManualCalendarOpen] = useState(false);
  const manualCalendarRef = useRef<HTMLDivElement>(null);
  const [dismissedTimeSuggestion, setDismissedTimeSuggestion] = useState<string | null>(null);
  useEffect(() => {
    if (!manualCalendarOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !manualCalendarRef.current?.contains(event.target)) setManualCalendarOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setManualCalendarOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [manualCalendarOpen]);
  const [manualCalendarMonth, setManualCalendarMonth] = useState(() => {
    const [year, month] = getManilaDateIso().split('-').map(Number);
    return new Date(year, month - 1, 1);
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const manualReservationAttemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);
  const [reservationClock, setReservationClock] = useState(Date.now());
  const [showReservationConnectionNotice, setShowReservationConnectionNotice] = useState(false);
  const [barberColors, setBarberColors] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem(BARBER_COLOR_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const handleSync = () => {
      try {
        const stored = localStorage.getItem(BARBER_COLOR_STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : {};
        setBarberColors(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('demoshop:barber-colors-updated', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('demoshop:barber-colors-updated', handleSync);
    };
  }, []);

  const getDefaultBarberColor = useCallback((barberId: string | number) => {
    const barberIndex = barbers.findIndex((b) => String(b.id) === String(barberId));
    const barber = barberIndex >= 0 ? barbers[barberIndex] : undefined;
    if (barber && (barber as any).color) return (barber as any).color;
    if (barberIndex >= 0) return BARBER_PALETTE[barberIndex % BARBER_PALETTE.length];
    return BARBER_PALETTE[0];
  }, [barbers]);

  const getBarberColor = useCallback((barberId: string | number) => {
    return barberColors[String(barberId)] || getDefaultBarberColor(barberId);
  }, [barberColors, getDefaultBarberColor]);

  const handleBarberColorChange = useCallback((barberId: string, color: string) => {
    setBarberColors((current) => {
      const next = { ...current, [String(barberId)]: color };
      try {
        localStorage.setItem(BARBER_COLOR_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event('demoshop:barber-colors-updated'));
      } catch {
        // Keep in session
      }
      return next;
    });
  }, []);

  const handleResetBarberColor = useCallback((barberId: string) => {
    setBarberColors((current) => {
      const next = { ...current };
      delete next[String(barberId)];
      try {
        localStorage.setItem(BARBER_COLOR_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event('demoshop:barber-colors-updated'));
      } catch {
        // Keep in session
      }
      return next;
    });
  }, []);
  const manualBarberIdsKey = barbers.map((barber) => Number(barber.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .join(',');
  // Refresh verified slots after a queue move, service transition, or reservation change.
  const manualScheduleKey = JSON.stringify([
    queue.map((entry) => [entry.id, entry.barberId, entry.status, entry.preferredDate, entry.preferredTime, entry.estMinutes, entry.serviceStartedAt, entry.timerStartedAt]),
    reservations.map((entry) => [entry.id, entry.barberId, entry.status, entry.date, entry.time, entry.serviceIds]),
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => setReservationClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const hasConnectionIssue = ['cached', 'stale', 'unavailable'].includes(reservationDataStatus)
      || connectivityStatus === 'offline';
    setShowReservationConnectionNotice(false);
    if (!hasConnectionIssue) return;
    const timeout = window.setTimeout(() => setShowReservationConnectionNotice(true), CONNECTION_NOTICE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [connectivityStatus, reservationDataStatus]);

  useEffect(() => {
    if (!manualServicesError && !manualAvailabilityError) {
      setShowManualReferenceErrors(false);
      return;
    }
    setShowManualReferenceErrors(false);
    const timeout = window.setTimeout(() => setShowManualReferenceErrors(true), CONNECTION_NOTICE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [manualAvailabilityError, manualServicesError]);

  useEffect(() => {
    if (!manualTime) {
      setTimeHour('');
      setTimeMinute('');
      setTimePeriod('AM');
      setTimeValidationError(null);
      return;
    }
    const match = /^(\d{1,2}):(\d{2})$/.exec(manualTime.trim());
    if (match) {
      const h24 = Number(match[1]);
      const h12 = h24 % 12 || 12;
      const p: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
      const mStr = match[2];

      // Use functional updates to prevent clobbering input fields when keystrokes are in progress
      setTimeHour((prev) => (Number(prev) === h12 ? prev : String(h12)));
      setTimeMinute((prev) => (prev === mStr ? prev : mStr));
      setTimePeriod((prev) => (prev === p ? prev : p));
      setTimeValidationError(null);
    }
  }, [manualTime]);

  const updateManualTimeFromParts = useCallback((hStr: string, mStr: string, period: 'AM' | 'PM') => {
    if (!hStr && !mStr) {
      setManualTime('');
      setTimeValidationError(null);
      return;
    }
    const hNum = Number(hStr);
    const mNum = Number(mStr);
    if (hStr && (isNaN(hNum) || hNum < 1 || hNum > 12)) {
      setTimeValidationError('Hour must be 1–12');
      return;
    }
    if (mStr && (isNaN(mNum) || mNum < 0 || mNum > 59)) {
      setTimeValidationError('Minute must be 00–59');
      return;
    }
    setTimeValidationError(null);
    // Only update manualTime when hour is provided and minute has complete 2 digits
    if (hStr && mStr && mStr.length === 2 && !isNaN(hNum) && !isNaN(mNum)) {
      const hour24 = (hNum % 12) + (period === 'PM' ? 12 : 0);
      setManualTime(`${String(hour24).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`);
    }
  }, []);

  const applyTimePreset = useCallback((h24: number, m: number) => {
    const h12 = h24 % 12 || 12;
    const p: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    setTimeHour(String(h12));
    setTimeMinute(String(m).padStart(2, '0'));
    setTimePeriod(p);
    setTimeValidationError(null);
    setManualTime(`${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    setFormTouched((prev) => ({ ...prev, time: true }));
  }, []);

  useEffect(() => {
    let active = true;
    if (connectivityStatus === 'offline') {
      setManualServicesError('Service list is unavailable offline. Reconnect before creating a reservation.');
      return () => { active = false; };
    }
    setManualServicesError(null);
    void fetchServiceCatalog().then((response) => {
      if (active) {
        setManualServices(Array.isArray(response.data) ? response.data.map((item) => {
          const parsed = Number(item.duration_minutes);
          const hasExplicit = Number.isInteger(parsed) && parsed > 0;
          return {
            id: String(item.service_id),
            name: item.title,
            price: Number(item.price) || 0,
            durationMinutes: hasExplicit ? parsed : DEFAULT_DURATION_MIN,
            isMissingDuration: !hasExplicit,
          };
        }) : []);
        setManualServicesError(null);
      }
    }).catch((error) => {
      if (active) setManualServicesError(isCashierConnectivityFailure(error)
        ? 'Service list could not be refreshed. Reconnect before creating a reservation.'
        : 'Service list is unavailable. Retry after checking the connection.');
    });
    return () => { active = false; };
  }, [connectivityStatus, manualReferenceDataRetry]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const serviceId = Number(manualServiceId);
    const barberIds = manualBarberIdsKey ? manualBarberIdsKey.split(',').map(Number) : [];
    const validServiceId = Number.isSafeInteger(serviceId) && serviceId > 0 ? serviceId : null;
    const queryKey = `${cashierBranchId}:${manualDate}:${validServiceId ?? 'default'}:${manualScheduleKey}`;
    setManualAvailabilityError(null);
    if (connectivityStatus === 'offline') {
      setManualAvailabilityQuery('');
      setManualBarberAvailabilityByTime({});
      setManualAvailabilityError('Live time availability is unavailable offline. Reconnect before creating a reservation.');
      setManualAvailabilityLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    if (!manualDate || barberIds.length === 0) {
      setManualAvailabilityLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    setManualAvailabilityLoading(true);
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
    // Warm a default 30-minute availability map as soon as the date is known;
    // refresh it with the selected service duration when a service is chosen.
    void bookingService.fetchBatchAvailability(cashierBranchId, manualDate, validServiceId ? [validServiceId] : [], barberIds, controller.signal, { throwOnError: true, forceRevalidate: true }).then((availability) => {
      if (!active) return;
      const slotsByBarber: typeof manualBarberAvailabilityByTime = {};
      barberIds.forEach((id) => {
        const result = availability.barbers[String(id)];
        slotsByBarber[String(id)] = result ? {
          slots: (result.availableSlots || []).map((slot) => slot.hour),
          busyPeriods: (result.busyPeriods || []).map((period) => ({ startTime: period.startTime, endTime: period.endTime })),
          isUnavailable: Boolean(result.isUnavailable),
          onlineEnabled: result.isOnlineBookingEnabled !== false,
          isOnDuty: result.isOnDuty !== false,
          walkinsAvailable: result.isAvailableForWalkins === true,
          verificationFailed: false,
        } : {
          slots: [], busyPeriods: [], isUnavailable: true, onlineEnabled: false, isOnDuty: false, walkinsAvailable: false, verificationFailed: true,
        };
      });
      setManualBarberAvailabilityByTime(slotsByBarber);
      setManualAvailabilityQuery(queryKey);
      setManualAvailabilityError(null);
    }).catch((error: unknown) => {
      if (!active) return;
      const failedAvailability: typeof manualBarberAvailabilityByTime = {};
      barberIds.forEach((id) => {
        failedAvailability[String(id)] = {
          slots: [], busyPeriods: [], isUnavailable: true, onlineEnabled: false, isOnDuty: false, walkinsAvailable: false, verificationFailed: true,
        };
      });
      setManualBarberAvailabilityByTime(failedAvailability);
      setManualAvailabilityQuery(queryKey);
      setManualAvailabilityError(isCashierConnectivityFailure(error)
        ? 'Live time availability could not be checked. Reconnect before creating a reservation.'
        : 'Time availability could not be verified. Retry before creating a reservation.');
    }).finally(() => {
      window.clearTimeout(timeoutId);
      if (active) setManualAvailabilityLoading(false);
    });
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [manualBarberIdsKey, cashierBranchId, connectivityStatus, manualDate, manualServiceId, manualReferenceDataRetry, manualScheduleKey]);

  const normalizedManualServiceId = Number(manualServiceId);
  const manualAvailabilityQueryKey = `${cashierBranchId}:${manualDate}:${Number.isSafeInteger(normalizedManualServiceId) && normalizedManualServiceId > 0 ? normalizedManualServiceId : 'default'}:${manualScheduleKey}`;
  const manualAvailabilityIsCurrent = manualAvailabilityQuery === manualAvailabilityQueryKey;
  const manualScheduledTimeEpoch = manualTimeToEpoch(manualDate, manualTime);
  const manilaClockTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(reservationClock));
  const manilaClockMinutes = timeToMinutes(manilaClockTime);
  const manualTodayCutoffReached = manilaClockMinutes >= 21 * 60;
  const manualDateIsBookable = manualDate > getManilaDateIso()
    || (manualDate === getManilaDateIso() && !manualTodayCutoffReached);
  const manualTimeIsBeforeOpening = Boolean(manualTime) && manualTimeToMinutes(manualTime) < 9 * 60;
  const manualTimeIsInFuture = manualDateIsBookable
    && manualScheduledTimeEpoch !== null
    && manualScheduledTimeEpoch > reservationClock
    && !manualTimeIsBeforeOpening;
  const manualBarberIsAvailableAtSelectedTime = (barberId: string): boolean => Boolean(
    manualTime &&
    manualTimeIsInFuture &&
    manualAvailabilityIsCurrent &&
    !manualBarberAvailabilityByTime[barberId]?.verificationFailed &&
    manualBarberAvailabilityByTime[barberId]?.isOnDuty &&
    !manualBarberAvailabilityByTime[barberId]?.isUnavailable &&
    manualBarberAvailabilityByTime[barberId]?.slots.some((hour) => timeToMinutes(hour) === manualTimeToMinutes(manualTime)),
  );
  const manualBarberIsBookedAtSelectedTime = (barberId: string): boolean => {
    if (!manualTime || !manualTimeIsInFuture) return false;
    const start = manualTimeToMinutes(manualTime);
    const duration = manualServices.find((service) => service.id === manualServiceId)?.durationMinutes || 30;
    return (manualBarberAvailabilityByTime[barberId]?.busyPeriods || []).some((period) => {
      const busyStart = timeToMinutes(period.startTime);
      const busyEnd = timeToMinutes(period.endTime);
      return start < busyEnd && busyStart < start + duration;
    });
  };

  const selectedManualService = useMemo(
    () => manualServices.find((service) => service.id === manualServiceId),
    [manualServices, manualServiceId]
  );
  const selectedServiceDuration = selectedManualService?.durationMinutes ?? DEFAULT_DURATION_MIN;

  const slotResult: SlotCalculationResult = useMemo(() => {
    if (!manualDate || !manualAvailabilityIsCurrent || manualAvailabilityLoading) {
      return {
        availableSlots: [],
        allSlots: [],
        earliestSlot: null,
        isFullyBooked: false,
        suggestedHelperText: null,
      };
    }
    const shopHours = getShopHoursForDate(manualDate, shopSettings?.businessHours);
    return calculateAvailableSlots({
      serviceDuration: selectedServiceDuration,
      date: manualDate,
      barberId: manualBarberId,
      barbers: barbers.map((b) => ({ id: b.id, name: b.name })),
      existingBookings: reservations,
      queueEntries: queue,
      shopHours,
      bufferMinutes: DEFAULT_BOOKING_BUFFER_MINUTES,
      now: reservationClock,
      verifiedStartTimes: manualAvailabilityIsCurrent && !manualAvailabilityLoading
        ? Object.fromEntries(Object.entries(manualBarberAvailabilityByTime).map(([id, availability]) => [
          id, availability.isOnDuty && !availability.isUnavailable && !availability.verificationFailed ? availability.slots : [],
        ]))
        : {},
    });
  }, [
    manualDate,
    selectedServiceDuration,
    manualBarberId,
    barbers,
    reservations,
    queue,
    shopSettings,
    reservationClock,
    manualAvailabilityIsCurrent,
    manualAvailabilityLoading,
    manualBarberAvailabilityByTime,
  ]);

  const handleTimePeriodChange = (period: 'AM' | 'PM') => {
    setIsTimeManuallyEdited(true);
    setTimePeriod(period);
    updateManualTimeFromParts(timeHour, timeMinute, period);
  };

  // Keep an auto-filled time aligned with the latest verified barber schedule.
  useEffect(() => {
    if (isTimeManuallyEdited || (manualTime && slotResult.availableSlots.some((slot) => slot.time24 === manualTime))) return;

    if (slotResult.earliestSlot) {
      const suggestion = slotResult.availableSlots.find((slot) => slot.minutesFromMidnight >= timeToMinutes(manualTime))
        || slotResult.earliestSlot;
      const { time24, hour, minute, period } = suggestion;
      setTimeHour(String(hour));
      setTimeMinute(String(minute).padStart(2, '0'));
      setTimePeriod(period);
      setTimeValidationError(null);
      setManualTime(time24);
    } else if (slotResult.isFullyBooked) {
      setTimeHour('');
      setTimeMinute('');
      setTimePeriod('AM');
      setTimeValidationError(null);
      setManualTime('');
    }
  }, [manualServiceId, manualDate, manualBarberId, manualTime, isTimeManuallyEdited, slotResult]);

  const handleResetToSuggested = useCallback(() => {
    setIsTimeManuallyEdited(false);
    if (slotResult.earliestSlot) {
      const { time24, hour, minute, period } = slotResult.earliestSlot;
      setTimeHour(String(hour));
      setTimeMinute(String(minute).padStart(2, '0'));
      setTimePeriod(period);
      setTimeValidationError(null);
      setManualTime(time24);
      setFormTouched((prev) => ({ ...prev, time: true }));
    }
  }, [slotResult.earliestSlot]);

  const nextAvailableDate = useMemo(() => {
    if (!slotResult.isFullyBooked || !manualDate) return null;
    return findNextAvailableDate({
      serviceDuration: selectedServiceDuration,
      startDate: manualDate,
      barberId: manualBarberId,
      barbers: barbers.map((b) => ({ id: b.id, name: b.name })),
      existingBookings: reservations,
      queueEntries: queue,
      shopHours: getShopHoursForDate(manualDate, shopSettings?.businessHours),
      bufferMinutes: DEFAULT_BOOKING_BUFFER_MINUTES,
      now: reservationClock,
      maxDaysAhead: 14,
    });
  }, [
    slotResult.isFullyBooked,
    manualDate,
    selectedServiceDuration,
    manualBarberId,
    barbers,
    reservations,
    queue,
    shopSettings,
    reservationClock,
  ]);

  const displaySlotChips = useMemo(() => {
    if (slotResult.isFullyBooked || slotResult.allSlots.length === 0) return [];
    const targetMinutes = manualTime ? timeToMinutes(manualTime) : null;
    return getRelevantSlotChips(slotResult.allSlots, targetMinutes, 4);
  }, [slotResult, manualTime]);

  const autoAssignedBarber = useMemo(() => {
    if (manualBarberId !== 'any') return null;
    if (!manualTime) return null;
    const matchingSlot = slotResult.availableSlots.find((s) => s.time24 === manualTime);
    const freeBarber = matchingSlot?.availableBarbers[0];
    if (freeBarber) {
      return barbers.find((b) => String(b.id) === String(freeBarber.id)) || null;
    }
    return null;
  }, [manualBarberId, manualTime, slotResult.availableSlots, barbers]);

  const effectiveBarberId = manualBarberId === 'any' ? autoAssignedBarber?.id : manualBarberId;

  const manualTimeIsAvailable = Boolean(
    manualTime &&
    slotResult.availableSlots.some((s) => s.time24 === manualTime)
  );
  const activeManualField = manualName.trim().length < 2
    ? 'name'
    : !manualServiceId
      ? 'service'
      : !manualDate || !manualDateIsBookable
        ? 'date'
        : !manualTime || !manualTimeIsInFuture || !manualTimeIsAvailable
          ? 'time'
          : (manualBarberId === 'any' ? Boolean(manualTime) && !autoAssignedBarber : !manualBarberId)
            ? 'barber'
            : 'complete';

  const nextSlotAfterBlocked = useMemo(() => {
    if (!manualTime || manualTimeIsAvailable) return null;
    const proposedTime = selectAvailableTimeInPeriod(manualTime, displaySlotChips.map((slot) => slot.time24));
    return slotResult.availableSlots.find((slot) => slot.time24 === proposedTime) || null;
  }, [manualTime, manualTimeIsAvailable, slotResult.availableSlots, displaySlotChips]);

  const selectedTimeBlockedReason = useMemo(() => {
    if (!manualTime || manualTimeIsAvailable || manualAvailabilityLoading || !manualAvailabilityIsCurrent) return null;
    const candidate = slotResult.allSlots.find((s) => s.time24 === manualTime);
    if (candidate?.blockedReason) return candidate.blockedReason;
    const targetMinutes = timeToMinutes(manualTime);
    const adjacent = slotResult.allSlots.find(
      (s) => Math.abs(s.minutes - targetMinutes) < 15 && !s.isAvailable && s.blockedReason
    );
    if (adjacent?.blockedReason) return adjacent.blockedReason;
    return 'No barber available at the selected time. Choose another time.';
  }, [manualTime, manualTimeIsAvailable, slotResult.allSlots, manualAvailabilityLoading, manualAvailabilityIsCurrent]);
  const timeSuggestionKey = `${manualDate}:${manualTime}:${manualBarberId}:${manualServiceId}:${nextSlotAfterBlocked?.time24 || ''}`;

  const highlightMissingPrerequisites = (field: 'service' | 'date' | 'time' | 'barber') => {
    const fieldOrder = ['name', 'service', 'date', 'time', 'barber'] as const;
    const targetIndex = fieldOrder.indexOf(field);
    setFormTouched((previous) => ({
      ...previous,
      ...(targetIndex > 0 && manualName.trim().length < 2 ? { name: true } : {}),
      ...(targetIndex > 1 && !manualServiceId ? { service: true } : {}),
      ...(targetIndex > 2 && (!manualDate || !manualDateIsBookable) ? { date: true } : {}),
      ...(targetIndex > 3 && (!manualTime || !manualTimeIsInFuture || !manualTimeIsAvailable) ? { time: true } : {}),
    }));
  };

  const submitManualReservation = async (event?: React.FormEvent, confirmedName?: string) => {
    event?.preventDefault();
    if (manualSubmitting) return;
    if (connectivityStatus === 'offline') {
      addToast({ type: 'warning', title: 'Connection Required', message: 'Reconnect before adding a reservation. The server must verify the schedule and reservation fee.' });
      return;
    }
    setFormSubmitted(true);
    const customerName = normalizeCustomerNameCase(confirmedName ?? manualName);
    const selectedService = manualServices.find((service) => service.id === manualServiceId);
    const selectedBarber = manualBarberId === 'any'
      ? autoAssignedBarber
      : barbers.find((barber) => barber.id === manualBarberId);
    if (customerName.length < 2 || !selectedService || !selectedBarber || !manualDate || !manualTime) {
      setFormSubmitted(true);
      return;
    }
    if (!manualTimeIsInFuture) {
      addToast({ type: 'error', title: 'Invalid Reservation Time', message: 'Choose a future time within the shop’s opening hours.' });
      return;
    }
    const isBarberAvailable = manualBarberId === 'any'
      ? Boolean(autoAssignedBarber)
      : manualBarberIsAvailableAtSelectedTime(manualBarberId);
    if (!manualTimeIsAvailable || !isBarberAvailable) {
      addToast({ type: 'error', title: 'Time Unavailable', message: selectedTimeBlockedReason || 'Choose a future time within shop hours that is available for this barber.' });
      return;
    }
    if (!confirmedName && isLikelyUnusualCustomerName(customerName)) {
      setManualNameConfirmation(customerName);
      return;
    }
    const tempId = `optimistic-${crypto.randomUUID()}`;
    const optimistic: ReservationInfo = {
      id: tempId, name: customerName, barberId: selectedBarber.id, service: formatServiceTitle(selectedService.name),
      date: manualDate, time: manualTime, status: STATUS.CONFIRMED, reservationFeePaid: true,
      reservationFeeAmount: 50, reservationFeeMethod: manualPaymentMethod, createdAt: new Date().toISOString(),
    };
    addOptimisticReservation(optimistic);
    setManualSubmitting(true);
    const fingerprint = JSON.stringify([
      optimistic.name,
      Number(manualServiceId),
      Number(selectedBarber.id),
      manualDate,
      manualTime,
      manualPaymentMethod,
    ]);
    const previousAttempt = manualReservationAttemptRef.current;
    const idempotencyKey = previousAttempt?.fingerprint === fingerprint
      ? previousAttempt.idempotencyKey
      : `cashier-manual-${crypto.randomUUID()}`;
    manualReservationAttemptRef.current = { fingerprint, idempotencyKey };
    try {
      await createManualReservationRequest({
        customerName: optimistic.name, serviceId: Number(manualServiceId), barberId: Number(selectedBarber.id),
        preferredDate: manualDate, preferredTime: manualTime, paymentMethod: manualPaymentMethod, idempotencyKey,
      });
      removeOptimisticReservation(tempId);
      manualReservationAttemptRef.current = null;
      setManualNameConfirmation(null);
      setManualName('');
      setManualServiceId('');
      setManualPaymentMethod('Cash');
      setManualBarberId('any');
      setManualTime('');
      setIsTimeManuallyEdited(false);
      setFormTouched({});
      setFormSubmitted(false);
      addToast({ type: 'success', title: 'Reservation Added', message: `${optimistic.name} is reserved and the ₱50 ${manualPaymentMethod} fee is recorded.` });
      void refetchReservations();
    } catch (error: any) {
      removeOptimisticReservation(tempId);
      addToast({
        type: 'error',
        title: 'Reservation Failed',
        message: error.response?.data?.error || (isCashierConnectivityFailure(error)
          ? 'The connection failed. Your details are kept; retry when online to safely check the reservation result.'
          : 'Unable to add this reservation.'),
      });
    } finally {
      setManualSubmitting(false);
    }
  };

  const saveReservationBarber = async (reservation: ReservationInfo, barberId: string) => {
    if (!requireLiveReservationData()) return;
    if (!barberId || barberId === reservation.barberId) { setEditingReservationId(null); return; }
    const rollback = updateReservationBarber(reservation.id, barberId);
    setEditingReservationId(null);
    try {
      await updateReservationBarberRequest(reservation.id, Number(barberId));
      const targetBarber = barbers.find((b) => b.id === barberId);
      addToast({
        type: 'success',
        title: 'Barber Reassigned',
        message: `${reservation.name}'s barber updated to ${targetBarber?.name || 'selected barber'}.`,
      });
    } catch (error: any) {
      rollback();
      addToast({ type: 'error', title: 'Barber Update Failed', message: error.response?.data?.error || 'Unable to update this barber.' });
    }
  };

  useEffect(() => {
    if (barbers.length === 0) return;
    setActiveBarberId(current => (current && barbers.some(b => b.id === current)) ? current : (barbers[0]?.id ?? null));
  }, [barbers]);

  useEffect(() => {
    if (acceptTarget) {
      setProofImageLoaded(false);
      setProofImageError(false);
    }
  }, [acceptTarget]);

  const upcomingReservations = useMemo(() => {
    return filterCashierUpcomingReservations(reservations, getManilaDateIso());
  }, [reservations]);

  const scheduledPositionById = useMemo(() => {
    const positions = new Map<string, QueuePositionInfo>();
    const barberNames = new Map(barbers.map((barber) => [barber.id, barber.name]));
    const compareLabel = (left: string, right: string): number =>
      left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true });
    const scheduledReservations = [...upcomingReservations].sort((left, right) => {
      const dateComparison = (left.date || '9999-12-31').localeCompare(right.date || '9999-12-31');
      if (dateComparison !== 0) return dateComparison;
      const timeComparison = timeToMinutes(left.time || '') - timeToMinutes(right.time || '');
      if (timeComparison !== 0) return timeComparison;
      const leftBarber = barberNames.get(left.barberId) || (left.barberId ? `~${left.barberId}` : 'Unassigned');
      const rightBarber = barberNames.get(right.barberId) || (right.barberId ? `~${right.barberId}` : 'Unassigned');
      const barberComparison = compareLabel(leftBarber, rightBarber);
      if (barberComparison !== 0) return barberComparison;
      const customerComparison = compareLabel(left.name || '', right.name || '');
      if (customerComparison !== 0) return customerComparison;
      return compareLabel(left.id, right.id);
    });
    let currentDate: string | null = '';
    let position = 0;
    scheduledReservations.forEach((reservation) => {
      if (reservation.date !== currentDate) {
        currentDate = reservation.date;
        position = 0;
      }
      position += 1;
      positions.set(reservation.id, {
        position,
        isServing: queue.some((customer) => customer.id === reservation.id && customer.status === STATUS.SERVING),
      });
    });
    return positions;
  }, [barbers, upcomingReservations, queue]);

  const filteredReservations = useCallback(() => {
    let filtered = upcomingReservations;
    if (reservationsFilter === 'today') filtered = filtered.filter(reservation => reservation.date === getManilaDateIso());
    if (reservationBarberFilter !== 'all') {
      filtered = filtered.filter(reservation =>
        String(reservation.barberId) === reservationBarberFilter
        || reservation.groupGuests?.some((guest) => String(guest.barberId) === reservationBarberFilter)
      );
    }
    if (reservationDateFilter !== 'all') filtered = filtered.filter(reservation => reservation.date === reservationDateFilter);
    const barberNames = new Map(barbers.map((barber) => [barber.id, barber.name]));
    const compareLabel = (left: string, right: string): number =>
      left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true });
    return [...filtered].sort((left, right) => {
      const dateComparison = (left.date || '9999-12-31').localeCompare(right.date || '9999-12-31');
      if (dateComparison !== 0) return dateComparison;
      const timeComparison = timeToMinutes(left.time || '') - timeToMinutes(right.time || '');
      if (timeComparison !== 0) return timeComparison;
      const leftBarber = barberNames.get(left.barberId) || (left.barberId ? `~${left.barberId}` : 'Unassigned');
      const rightBarber = barberNames.get(right.barberId) || (right.barberId ? `~${right.barberId}` : 'Unassigned');
      const barberComparison = compareLabel(leftBarber, rightBarber);
      if (barberComparison !== 0) return barberComparison;
      const customerComparison = compareLabel(left.name || '', right.name || '');
      if (customerComparison !== 0) return customerComparison;
      return compareLabel(left.id, right.id);
    });
  }, [barbers, upcomingReservations, reservationsFilter, reservationBarberFilter, reservationDateFilter]);

  const acceptReservation = useCallback(async (reservation: ReservationInfo) => {
    if (!requireLiveReservationData()) return;
    setIsAccepting(true);
    const rollback = patchQueueEntry(reservation.id, { status: STATUS.CONFIRMED });
    try {
      await acceptReservationRequest(reservation.id);
      notify(`✓ Accepted reservation for ${reservation.name}.`);
      void refetchReservations();
      void refetchQueue();
      window.dispatchEvent(new CustomEvent('demoshop:reservations-changed'));
      window.dispatchEvent(new CustomEvent('demoshop:appointments-changed'));
      setAcceptTarget(null);
    } catch (error: any) {
      rollback();
      notify(`✕ ${error.response?.data?.error || error.response?.data?.message || 'Failed to accept reservation'}`);
    } finally {
      setIsAccepting(false);
    }
  }, [notify, patchQueueEntry, refetchQueue, refetchReservations, requireLiveReservationData]);

  const confirmAccept = useCallback(() => {
    if (!acceptTarget || isAccepting) return;
    void acceptReservation(acceptTarget);
  }, [acceptReservation, acceptTarget, isAccepting]);

  const declineReservation = useCallback(async (id: string, reason?: string, cancelType?: string) => {
    if (!requireLiveReservationData()) return;
    const rollback = patchQueueEntry(id, { status: 'cancelled' });
    try {
      await declineReservationRequest(id, reason, cancelType);
      notify('✕ Reservation status updated.');
      void refetchReservations();
      void refetchQueue();
      window.dispatchEvent(new CustomEvent('demoshop:reservations-changed'));
      window.dispatchEvent(new CustomEvent('demoshop:appointments-changed'));
    } catch (error: any) {
      rollback();
      notify(`✕ ${error.response?.data?.error || error.response?.data?.message || 'Failed to update reservation'}`);
    }
  }, [notify, patchQueueEntry, refetchQueue, refetchReservations, requireLiveReservationData]);

  const checkInReservation = useCallback(async (reservation: ReservationInfo) => {
    if (!requireLiveReservationData()) return;
    try {
      if (reservation.groupBookingId && (reservation.groupGuests?.length || 0) > 1) {
        await checkInGroupBookingRequest(reservation.groupBookingId);
        const remainingCount = (reservation.groupGuests || []).filter((g) =>
          ['accepted', 'late', 'confirmed'].includes(g.status.toLowerCase())
        ).length;
        notify(`Group booking checked in (${remainingCount || reservation.groupGuests?.length} guests)`);
      } else {
        await checkInQueueEntryRequest(reservation.id);
      }
      notify(`✓ ${reservation.name} checked in`);
      void refetchReservations();
      void refetchQueue();
    } catch (error: any) {
      notify(`✕ ${error.response?.data?.error || 'Unable to check in reservation'}`);
    }
  }, [notify, refetchQueue, refetchReservations, requireLiveReservationData]);

  const checkInIndividualGuest = useCallback(async (guestId: string, guestName: string) => {
    if (!requireLiveReservationData()) return;
    try {
      await checkInQueueEntryRequest(guestId);
      notify(`✓ ${guestName} checked in`);
      void refetchReservations();
      void refetchQueue();
    } catch (error: any) {
      notify(`✕ ${error.response?.data?.error || error.response?.data?.message || 'Unable to check in guest'}`);
    }
  }, [notify, refetchQueue, refetchReservations, requireLiveReservationData]);

  const markIndividualGuestNoShow = useCallback(async (guestId: string, guestName: string) => {
    if (!requireLiveReservationData()) return;
    try {
      await markQueueNoShow(guestId);
      notify(`✓ ${guestName} marked as No Show`);
      void refetchReservations();
      void refetchQueue();
    } catch (error: any) {
      notify(`✕ ${error.response?.data?.error || error.response?.data?.message || 'Failed to mark guest as no-show'}`);
    }
  }, [notify, refetchQueue, refetchReservations, requireLiveReservationData]);

  const checkInQueueEntry = useCallback(async (id: string) => {
    if (!requireLiveReservationData()) return;
    try {
      await checkInQueueEntryRequest(id);
      notify('✓ Booking checked in');
      void refetchReservations();
      void refetchQueue();
    } catch (error: any) {
      notify(`✕ ${error.response?.data?.error || 'Unable to check in reservation'}`);
    }
  }, [notify, refetchQueue, refetchReservations, requireLiveReservationData]);

  const getConflictInfo = useCallback((reservation: ReservationInfo) => {
    if (!reservation.date || !reservation.time || !reservation.barberId) return null;
    const sameSlot = reservations.filter(candidate =>
      candidate.barberId === reservation.barberId &&
      candidate.date === reservation.date &&
      candidate.time === reservation.time &&
      (candidate.status === 'pending' || candidate.status === 'accepted' || candidate.status === 'confirmed')
    );
    if (sameSlot.length <= 1) return null;
    const sorted = [...sameSlot].sort((left, right) => {
      if (left.createdAt && right.createdAt) return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return Number(left.id) - Number(right.id);
    });
    const firstBooker = sorted[0];
    return {
      isFirst: firstBooker.id === reservation.id,
      firstBookerName: firstBooker.name,
      otherBookerNames: sorted.filter(candidate => candidate.id !== reservation.id).map(candidate => candidate.name).join(', '),
    };
  }, [reservations]);

  const cancelOrNoShowReservation = useCallback(async (id: string, reason?: string, isNoShow?: boolean) => {
    if (!requireLiveReservationData()) return;
    const rollback = patchQueueEntry(id, { status: isNoShow ? STATUS.NOSHOW : 'cancelled' });
    try {
      if (isNoShow) {
        await markQueueNoShow(id);
        notify('✓ Booking marked as No-Show.');
      } else {
        await cancelQueueEntry(id, reason);
        notify('✕ Booking cancelled.');
      }
      void refetchReservations();
      void refetchQueue();
    } catch (error: any) {
      rollback();
      notify(`✕ ${error.response?.data?.error || error.response?.data?.message || 'Failed to update reservation'}`);
    }
  }, [notify, patchQueueEntry, refetchQueue, refetchReservations, requireLiveReservationData]);

  const triggerDecline = useCallback((reservation: ReservationInfo) => {
    if (reservation.status === 'pending') {
      setDeclineReason('Payment receipt invalid or missing');
    } else {
      setDeclineReason('Customer Requested Cancellation');
    }
    setCustomDeclineReason('');
    setDeclineTarget(reservation);
  }, []);

  const cancelConfirmedBooking = useCallback((customer: CustomerInfo) => {
    triggerDecline({
      id: customer.id,
      name: customer.name,
      barberId: customer.barberId,
      service: customer.service,
      date: customer.preferredDate || null,
      time: customer.preferredTime || null,
      status: STATUS.CONFIRMED,
      createdAt: customer.createdAt || null,
    });
  }, [triggerDecline]);

  const confirmDecline = useCallback(() => {
    if (!declineTarget || !requireLiveReservationData()) return;
    const isPending = declineTarget.status === 'pending';
    const isNoShow = declineReason === 'Customer No-Show';
    const finalReason = declineReason === 'Other'
      ? customDeclineReason.trim() || (isPending ? 'Declined by cashier' : 'Cancelled by cashier')
      : customDeclineReason.trim() ? `${declineReason} - ${customDeclineReason.trim()}` : declineReason;

    if (isPending) {
      const cancelType = (declineReason === 'Barber early out / unavailable' || declineReason === 'Barber Emergency Break')
        ? 'barber_side'
        : 'customer_side';
      void declineReservation(declineTarget.id, finalReason, cancelType);
    } else {
      void cancelOrNoShowReservation(declineTarget.id, finalReason, isNoShow);
    }
    setDeclineTarget(null);
    setCustomDeclineReason('');
  }, [cancelOrNoShowReservation, customDeclineReason, declineReason, declineReservation, declineTarget, requireLiveReservationData]);

  const preparePaymentModal = useCallback((id: string): void => {
    paymentQuoteRequestRef.current += 1;
    paymentTargetRef.current = id;
    setPaymentTargetId(id);
    setPaymentQuote(null);
    setPaymentQuoteError(null);
    setPaymentQuoteLoading(true);
    setPaymentIdempotencyKey(typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `queue-pay-${id}-${Date.now()}`);
    setPaymentModalOpen(true);
  }, []);

  const closePaymentModal = useCallback(() => {
    completionRetryRef.current = null;
    paymentQuoteRequestRef.current += 1;
    paymentTargetRef.current = null;
    setPaymentModalOpen(false);
    setPaymentTargetId(null);
    setPaymentQuote(null);
    setPaymentQuoteLoading(false);
    setPaymentQuoteError(null);
    setPaymentIdempotencyKey(null);
  }, []);

  const loadPaymentQuote = useCallback(async (id: string): Promise<void> => {
    const requestId = ++paymentQuoteRequestRef.current;
    setPaymentQuoteLoading(true);
    setPaymentQuoteError(null);
    try {
      const response = await requestQueuePaymentQuote(id);
      if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== id) return;
      setPaymentQuote(response.data);
    } catch (error: any) {
      if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== id) return;
      const data = error.response?.data;
      if (/already been paid|already paid/i.test(data?.error || '')) {
        closePaymentModal();
        notify('Payment is already completed for this customer.');
        void refetchQueue();
        return;
      }
      const message = error.response?.status === 409 && data?.paymentAttemptId
        ? 'This receipt is already being processed. Close this window and review the existing payment attempt.'
        : data?.error || 'Unable to load the server-calculated amount due.';
      setPaymentQuoteError(message);
      if (error.response?.status === 409 && data?.paymentAttemptId) {
        patchQueueEntry(id, {
          paymentAttemptId: Number(data.paymentAttemptId),
          paymentAttemptStatus: data.paymentAttemptStatus as PaymentAttemptStatus,
        });
      }
    } finally {
      if (requestId === paymentQuoteRequestRef.current && paymentTargetRef.current === id) setPaymentQuoteLoading(false);
    }
  }, [closePaymentModal, notify, patchQueueEntry, refetchQueue]);

  const openPaymentModal = useCallback((id: string) => {
    if (!requireLiveReservationData()) return;
    if (queue.find(customer => customer.id === id)?.paid) {
      notify('Payment is already completed for this customer.');
      void refetchQueue();
      return;
    }
    preparePaymentModal(id);
    void loadPaymentQuote(id);
  }, [loadPaymentQuote, notify, preparePaymentModal, queue, refetchQueue, requireLiveReservationData]);

  const closePaymentAttemptReview = useCallback(() => {
    setPaymentAttemptReviewTarget(null);
    setPaymentAttemptReceiptUrl(null);
    setPaymentAttemptReviewError(null);
    setPaymentAttemptReceiptLoading(false);
    setPaymentAttemptVerified(false);
    setPaymentAttemptConfirming(false);
  }, []);

  const openPaymentAttemptReview = useCallback(async (customer: CustomerInfo) => {
    if (!requireLiveReservationData()) return;
    if (!customer.paymentAttemptId) return;
    setPaymentAttemptReviewTarget(customer);
    setPaymentAttemptReceiptUrl(null);
    setPaymentAttemptReviewError(null);
    setPaymentAttemptVerified(false);
    setPaymentAttemptReceiptLoading(true);
    try {
      const response = await getPaymentAttemptReceiptUrl(customer.paymentAttemptId);
      if (!response.data?.url) throw new Error('The saved receipt could not be opened.');
      setPaymentAttemptReceiptUrl(response.data.url);
    } catch (error: any) {
      setPaymentAttemptReviewError(error.response?.data?.error || 'Unable to load the saved receipt. Please try again.');
    } finally {
      setPaymentAttemptReceiptLoading(false);
    }
  }, [requireLiveReservationData]);

  const markDone = useCallback(async (id: string) => {
    if (!requireLiveReservationData()) return;
    const customer = queue.find(entry => entry.id === id);
    let requestId = paymentQuoteRequestRef.current;
    await completeForPayment({
      id, inFlight: completingIdsRef.current,
      pending: () => {
        preparePaymentModal(id);
        completionRetryRef.current = id;
        requestId = paymentQuoteRequestRef.current;
        return patchQueueEntry(id, { status: STATUS.DONE });
      },
      complete: () => completeQueueEntry(id),
      ready: async () => {
        void refetchQueue();
        if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== id) return;
        if (customer?.paid) {
          try {
            const response = await fetchQueueReceipt(id);
            if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== id) return;
            closePaymentModal();
            setFinalizedReceipt(response.data);
          } catch (error: any) {
            if (requestId !== paymentQuoteRequestRef.current || paymentTargetRef.current !== id) return;
            setPaymentQuoteLoading(false);
            setPaymentQuoteError(error.response?.data?.error || 'Unable to load the finalized receipt.');
          }
          return;
        }
        completionRetryRef.current = null;
        if (customer?.paymentAttemptId && isOpenPaymentAttempt(customer.paymentAttemptStatus)) {
          closePaymentModal();
          void openPaymentAttemptReview(customer);
        } else {
          void loadPaymentQuote(id);
        }
        notify('✓ Service marked as done — verify payment');
      },
      failed: (error: any) => {
        if (requestId === paymentQuoteRequestRef.current && paymentTargetRef.current === id) {
          setPaymentQuoteLoading(false);
          setPaymentQuoteError(error.response?.data?.error || 'Failed to complete service. Retry to complete it and prepare payment.');
        }
        notify(`✕ ${error.response?.data?.error || 'Failed to complete service'}`);
      },
    });
  }, [closePaymentModal, loadPaymentQuote, notify, openPaymentAttemptReview, patchQueueEntry, preparePaymentModal, queue, refetchQueue, requireLiveReservationData]);

  const markNoShow = useCallback(async (id: string) => {
    if (!requireLiveReservationData()) return;
    const rollback = patchQueueEntry(id, { status: STATUS.NOSHOW });
    try {
      await markQueueNoShow(id);
      notify('⚠ Reservation marked as no-show');
      void refetchQueue();
    } catch (error: any) {
      rollback();
      notify(`✕ ${error.response?.data?.error || 'Failed to mark reservation as no-show'}`);
    }
  }, [notify, patchQueueEntry, refetchQueue, requireLiveReservationData]);


  const submitPayment = useCallback(async (payment: {
    method: string;
    amount: number;
    cashReceivedAmount?: number;
    paymentMethodId?: string;
    gcashReference?: string;
    referenceNumber?: string;
    receipt?: File;
    cashierConfirmed?: boolean;
  }) => {
    if (!requireLiveReservationData()) return;
    if (!paymentQuote) return;
    const form = new FormData();
    form.append('method', payment.method);
    form.append('amount', payment.amount.toFixed(2));
    if (payment.cashReceivedAmount !== undefined) {
      form.append('cashReceivedAmount', String(payment.cashReceivedAmount));
    }
    form.append('idempotencyKey', paymentIdempotencyKey || `queue-pay-${paymentQuote.queueId}`);
    if (payment.paymentMethodId) {
      form.append('paymentMethodId', payment.paymentMethodId);
    }
    const isDigital = payment.method.toLowerCase() !== 'cash';
    const digitalRef = payment.gcashReference || payment.referenceNumber;
    if (isDigital && digitalRef) {
      form.append('gcashReference', digitalRef);
      form.append('referenceNumber', digitalRef);
      form.append('merchantIdentity', paymentQuote.gcashMerchantName || 'DEMOSHOP');
      form.append('transactionDate', paymentQuote.businessDate || new Date().toISOString().slice(0, 10));
    }
    if (payment.receipt) form.append('receipt', payment.receipt);
    if (isDigital) form.append('cashierConfirmed', String(payment.cashierConfirmed === true));

    try {
      const response = await submitQueuePayment(paymentQuote.queueId, form);
      const attempt = response.data?.attempt;
      const finalResponseData = isDigital && response.data?.pendingVerification && attempt?.payment_attempt_id
        ? (await reconcilePaymentAttempt(attempt.payment_attempt_id, {
          decision: 'confirm',
          reason: `Cashier verified the ${payment.method} receipt before recording payment.`,
        })).data
        : response.data;
      const pendingVerification = finalResponseData?.pendingVerification === true;
      const receipt = finalResponseData?.receipt as ReceiptResponse | null | undefined;
      const finalAttempt = finalResponseData?.attempt;
      if (!pendingVerification && finalAttempt?.status !== 'manually_confirmed') {
        throw new Error('The server has not finalized this payment. Your entered payment details have been kept.');
      }
      if (pendingVerification && finalAttempt?.payment_attempt_id) {
        patchQueueEntry(String(paymentQuote.queueId), {
          paymentAttemptId: Number(finalAttempt.payment_attempt_id),
          paymentAttemptStatus: finalAttempt.status as PaymentAttemptStatus,
        });
      } else {
        patchQueueEntry(String(paymentQuote.queueId), {
          paid: true,
          paymentAttemptId: undefined,
          paymentAttemptStatus: undefined,
        });
      }
      closePaymentModal();
      if (receipt?.html) setFinalizedReceipt(receipt);
      notify(pendingVerification
        ? '⚠ Receipt could not be confirmed. Please review it and try again.'
        : '₱ Payment confirmed — customer marked paid');
      void refetchQueue();
    } catch (error: any) {
      if (error.response?.data?.retryWithNewKey) setPaymentIdempotencyKey(globalThis.crypto.randomUUID());
      notify(`✕ ${error.response?.data?.error || error.message || 'Payment submission failed; the service remains done and unpaid'}`);
    }
  }, [closePaymentModal, notify, patchQueueEntry, paymentIdempotencyKey, paymentQuote, refetchQueue, requireLiveReservationData]);

  const confirmPaymentAttempt = useCallback(async () => {
    if (!requireLiveReservationData()) return;
    if (!paymentAttemptReviewTarget?.paymentAttemptId || !paymentAttemptReceiptUrl || !paymentAttemptVerified) return;
    setPaymentAttemptConfirming(true);
    setPaymentAttemptReviewError(null);
    try {
      const response = await reconcilePaymentAttempt(paymentAttemptReviewTarget.paymentAttemptId, {
        decision: 'confirm',
        reason: 'Cashier verified the customer payment receipt before recording payment.',
      });
      const receipt = response.data?.receipt as ReceiptResponse | null | undefined;
      patchQueueEntry(paymentAttemptReviewTarget.id, {
        paid: true,
        paymentAttemptId: undefined,
        paymentAttemptStatus: undefined,
      });
      if (receipt?.html) setFinalizedReceipt(receipt);
      closePaymentAttemptReview();
      notify('₱ Payment confirmed — customer marked paid');
      void refetchQueue();
    } catch (error: any) {
      setPaymentAttemptReviewError(error.response?.data?.error || 'Payment confirmation failed. Review the receipt and try again.');
    } finally {
      setPaymentAttemptConfirming(false);
    }
  }, [closePaymentAttemptReview, notify, patchQueueEntry, paymentAttemptReceiptUrl, paymentAttemptReviewTarget, paymentAttemptVerified, refetchQueue, requireLiveReservationData]);

  const [paymentAttemptRejecting, setPaymentAttemptRejecting] = useState(false);

  const rejectPaymentAttempt = useCallback(async () => {
    if (!requireLiveReservationData()) return;
    if (!paymentAttemptReviewTarget?.paymentAttemptId) return;
    setPaymentAttemptRejecting(true);
    setPaymentAttemptReviewError(null);
    try {
      await reconcilePaymentAttempt(paymentAttemptReviewTarget.paymentAttemptId, {
        decision: 'reject',
        reason: 'Cashier discarded payment attempt to collect anew.',
      });
      const customerId = paymentAttemptReviewTarget.id;
      patchQueueEntry(customerId, { paymentAttemptId: undefined, paymentAttemptStatus: undefined });
      closePaymentAttemptReview();
      notify('✕ Payment attempt discarded — collect payment anew');
      if (customerId) openPaymentModal(customerId);
    } catch (error: any) {
      setPaymentAttemptReviewError(error.response?.data?.error || 'Failed to discard payment attempt. Please try again.');
    } finally {
      setPaymentAttemptRejecting(false);
    }
  }, [closePaymentAttemptReview, notify, openPaymentModal, patchQueueEntry, paymentAttemptReviewTarget, requireLiveReservationData]);

  const laneFor = useCallback((barberId: string | null) =>
    barberId ? queue.filter(customer => customer.barberId === barberId) : [], [queue]);
  const activeBarber = barbers.find(barber => barber.id === activeBarberId);
  const activeLane = laneFor(activeBarberId);
  const activeCustomerCount = activeLane.filter(customer => customer.status !== STATUS.DONE && customer.status !== STATUS.NOSHOW).length;
  const visibleReservations = filteredReservations();

  const barberFor = (barberId: string) => barbers.find(barber => barber.id === barberId);

  const queueActions = {
    onComplete: markDone,
    onPayment: openPaymentModal,
    onCheckIn: checkInQueueEntry,
    onCancel: cancelConfirmedBooking,
    onNoShow: markNoShow,
    onReviewPaymentAttempt: openPaymentAttemptReview,
  };

  const totalActiveQueueCount = queue.filter(customer => customer.status !== STATUS.DONE && customer.status !== STATUS.NOSHOW).length;

  return (
    <div className="space-y-6 text-ivory pb-20 md:pb-6">
      {/* Operations Header */}
      <header className="flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gold">OPERATIONS & SCHEDULING</span>
          <h1 className="mt-1 font-serif text-2xl font-bold tracking-wide text-ivory">Reservations & Queue</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ivory-dim">
          <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-[10px] text-ivory-dim empty:hidden">
            {(queueRefreshing || reservationRefreshing) && reservationDataStatus !== 'loading' && <><Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />Updating</>}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/5 px-2.5 py-1">
            <Clock className="h-3.5 w-3.5 text-gold" />
            {formatReservationDateConsistent(getManilaDateIso())}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/5 px-2.5 py-1">
            <Users className="h-3.5 w-3.5 text-gold" />
            {upcomingReservations.length} {upcomingReservations.length === 1 ? 'Booking' : 'Bookings'}
          </span>
        </div>
      </header>

      {bypassTimeRestrictions && (
        <div className="flex items-center gap-2.5 rounded-sm border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-200">
          <span>⚠️</span>
          <span>Testing Mode: Time gates bypassed.</span>
        </div>
      )}

      {viewMode === 'queue' && connectivityStatus === 'offline' && (
        <div role="status" className="flex items-center gap-2.5 rounded-sm border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Offline view: queue and barber availability are last-known data. Queue changes require a live connection.</span>
        </div>
      )}

      {viewMode === 'queue' && (
        <section aria-labelledby="customer-queue-heading">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gold">ACTIVE STATIONS</span>
              <h2 id="customer-queue-heading" className="mt-1 font-serif text-xl font-bold tracking-wide text-ivory">Customer Queue</h2>
              <p className="mt-0.5 text-xs text-ivory-dim">Select a barber to monitor their customer line.</p>
            </div>
          </div>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {barbers.map(barber => {
              const lane = laneFor(barber.id);
              const customerCount = lane.filter(customer => customer.status !== STATUS.DONE && customer.status !== STATUS.NOSHOW).length;
              const isAvailabilityUnverified = barber.status === 'offline_availability_unverified';
              const isOff = !isAvailabilityUnverified && (barber.isOffToday || barber.isOnDutyToday === false || (barber.status || '').toLowerCase() === 'day off' || (barber.status || '').toLowerCase() === 'off duty');
              const isWalkInOnly = !isAvailabilityUnverified && barber.isOnlineBookingEnabledToday === false;

              return (
                <button
                  key={barber.id}
                  type="button"
                  onClick={() => setActiveBarberId(barber.id)}
                  className={`min-h-[64px] min-w-[200px] rounded-sm border p-3 text-left text-sm font-semibold transition-all cursor-pointer ${
                    activeBarberId === barber.id
                      ? 'border-gold bg-gold/10 text-gold shadow-sm'
                      : 'border-white/10 bg-white/5 text-ivory hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: getBarberColor(barber.id) }}
                        aria-hidden="true"
                      />
                      <span className="font-bold truncate">{barber.name}</span>
                    </div>
                    {isAvailabilityUnverified ? (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-200 border border-amber-500/30">
                        Availability Unknown
                      </span>
                    ) : isOff ? (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30">
                        Off Duty
                      </span>
                    ) : isWalkInOnly ? (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Walk-in Only
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Available
                      </span>
                    )}
                  </div>
                  <span className="block text-xs font-normal text-ivory-dim">{customerCount} in queue</span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-sm border border-white/10 bg-white/5 card-gold-accent">
            <header className="flex flex-col gap-2 bg-charcoal px-5 py-4 border-b border-white/10 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-gold inline-block" />
                <h3 className="font-serif text-lg font-bold text-ivory">{activeBarber?.name || 'Select a barber'}</h3>
                {activeBarber && (
                  activeBarber.status === 'offline_availability_unverified' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-200 border border-amber-500/30">
                      Availability Unknown
                    </span>
                  ) : activeBarber.isOffToday || activeBarber.isOnDutyToday === false || (activeBarber.status || '').toLowerCase() === 'day off' || (activeBarber.status || '').toLowerCase() === 'off duty' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30">
                      Off Duty
                    </span>
                  ) : activeBarber.isOnlineBookingEnabledToday === false ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Walk-in Only
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Available for Booking
                    </span>
                  )
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-ivory-dim">
                <span className={`h-2 w-2 rounded-full ${activeLane.some(customer => customer.status === STATUS.SERVING) ? 'bg-gold animate-pulse' : 'bg-white/20'}`} />
                {activeLane.some(customer => customer.status === STATUS.SERVING) ? 'Currently Serving' : 'No active service'} · <strong className="text-ivory">{activeCustomerCount} total</strong>
              </span>
            </header>
            <QueueLane customers={activeLane} bypassTimeRestrictions={bypassTimeRestrictions} {...queueActions} />
          </div>
        </section>
      )}

      {viewMode === 'reservations' && (
        <section aria-labelledby="reservations-heading">
          <div className="rounded-sm border border-white/10 bg-white/5 card-gold-accent p-5 sm:p-6 flex flex-col min-h-[460px]">
            <div className="flex flex-col gap-4 mb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gold">
                  BOOKING DIRECTORY
                </span>
                <h2 id="reservations-heading" className="mt-1 font-serif text-xl font-bold tracking-wide text-ivory">
                  Reservations Table
                </h2>
                <p className="mt-1 text-xs text-ivory-dim">Manual reservations are added as paid and join the live queue at their scheduled time.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap items-center rounded-sm border border-white/10 bg-charcoal/80 p-0.5" role="group" aria-label="Reservation status filter">
                  {[
                    { value: 'all', label: 'All Upcoming', count: upcomingReservations.length },
                    { value: 'today', label: 'Today', count: upcomingReservations.filter(r => r.date === getManilaDateIso()).length },
                  ].map((tab) => {
                    const isActive = reservationsFilter === tab.value;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => {
                          preserveReservationResultsHeight();
                          setReservationsFilter(tab.value);
                          if (tab.value === 'today') setReservationDateFilter('all');
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${
                          isActive
                            ? 'bg-gold text-charcoal shadow-sm'
                            : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                        }`}
                        aria-pressed={isActive}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                            isActive ? 'bg-charcoal/20 text-charcoal' : 'bg-white/10 text-ivory-dim'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div ref={reservationFiltersRef} className="relative">
                  <button
                    ref={reservationFiltersButtonRef}
                    type="button"
                    aria-expanded={reservationFiltersOpen}
                    aria-controls="reservation-filters-panel"
                    onClick={() => setReservationFiltersOpen((open) => !open)}
                    className={`inline-flex h-8 items-center gap-2 rounded-sm border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${activeReservationFilterCount ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/15 bg-charcoal/80 text-ivory-dim hover:border-gold/40 hover:text-ivory'}`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    Filters
                    {activeReservationFilterCount > 0 && <span className="rounded-full bg-gold/20 px-1.5 text-[10px]" aria-label={`${activeReservationFilterCount} active filters`}>{activeReservationFilterCount}</span>}
                  </button>
                  {reservationFiltersOpen && (
                  <div id="reservation-filters-panel" role="region" aria-label="Reservation filters" className="absolute left-0 top-full z-40 mt-2 w-64 sm:left-auto sm:right-0 max-w-[calc(100vw-3rem)] space-y-3 rounded-sm border border-white/15 bg-charcoal p-3.5 shadow-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ivory">Filter reservations</span>
                      <button type="button" aria-label="Close filters" onClick={() => { setReservationFiltersOpen(false); reservationFiltersButtonRef.current?.focus({ preventScroll: true }); }} className="rounded-sm p-1 text-ivory-dim hover:text-ivory focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    </div>
                    <div>
                  <label htmlFor="reservation-date-filter" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">Date</label>
                  <DatePicker
                    id="reservation-date-filter"
                    value={reservationDateFilter === 'all' ? '' : reservationDateFilter}
                    onChange={(date) => {
                      preserveReservationResultsHeight();
                      setReservationDateFilter(date || 'all');
                      if (reservationsFilter === 'today') setReservationsFilter('all');
                    }}
                    className="w-full"
                  />
                    </div>
                    <div>
                      <label htmlFor="reservation-barber-filter" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">Barber</label>
                      <select id="reservation-barber-filter" value={reservationBarberFilter} onChange={(event) => { preserveReservationResultsHeight(); setReservationBarberFilter(event.target.value); }} className="h-9 w-full rounded-sm border border-white/10 bg-charcoal/80 px-2.5 text-xs text-ivory focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold">
                        <option value="all">All barbers</option>
                        {barbers.map((barber) => <option key={barber.id} value={String(barber.id)}>{barber.name}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
                      <button type="button" disabled={!activeReservationFilterCount} onClick={() => { preserveReservationResultsHeight(); setReservationBarberFilter('all'); setReservationDateFilter('all'); }} className="text-xs text-ivory-dim hover:text-ivory disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold">Clear filters</button>
                      <span className="text-[10px] text-ivory-dim">{visibleReservations.length} shown</span>
                    </div>
                  </div>
                  )}
                </div>

              </div>
            </div>

            {showReservationConnectionNotice && (
              <div role="status" aria-live="polite" className="mb-4 flex flex-col gap-2 rounded-sm border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-3 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">
                    {reservationDataStatus === 'cached'
                      ? 'Showing the last saved reservation list.'
                      : reservationDataStatus === 'stale' && connectivityStatus === 'online'
                        ? 'Cashier is online. The reservation list has not refreshed yet.'
                        : reservationDataStatus === 'stale' || connectivityStatus === 'offline'
                        ? 'Connection unavailable. Showing the last loaded reservation list.'
                        : reservationDataError || 'Reservations could not be loaded.'}
                  </p>
                  {reservationDataUpdatedAt !== null && (
                    <p className="mt-0.5 text-[11px] text-amber-100/70">
                      Last refreshed {new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(reservationDataUpdatedAt))}.
                    </p>
                  )}
                  {(reservationDataStatus === 'cached' || reservationDataStatus === 'stale' || connectivityStatus === 'offline') && (
                    <p className="mt-0.5 text-[11px] text-amber-100/70">Booking and queue changes stay disabled until live data is refreshed.</p>
                  )}
                </div>
                <button type="button" onClick={() => void refetchReservations()} disabled={connectivityStatus === 'offline'} className="inline-flex h-8 shrink-0 items-center justify-center rounded-sm border border-amber-200/25 px-3 font-semibold text-amber-100 transition-colors hover:bg-amber-200/10 disabled:cursor-not-allowed disabled:opacity-40">
                  Retry
                </button>
              </div>
            )}

            {(
              <section aria-labelledby="manual-reservation-heading" className="mb-5 rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent">
                <div className="mb-4 flex flex-col gap-2 border-b border-white/5 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">CASHIER • QUEUE ENTRY</p>
                    <h3 id="manual-reservation-heading" className="mt-0.5 font-serif text-lg font-bold text-ivory">Add to Reservation</h3>
                  </div>
                </div>
                {showManualReferenceErrors && (manualServicesError || manualAvailabilityError) && (
                  <div role="status" className="mb-3 flex flex-col gap-2 rounded-sm border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-100/90 sm:flex-row sm:items-center sm:justify-between">
                    <span>{manualServicesError || manualAvailabilityError}</span>
                    <button type="button" disabled={connectivityStatus === 'offline'} onClick={() => setManualReferenceDataRetry((attempt) => attempt + 1)} className="shrink-0 font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40">Retry live checks</button>
                  </div>
                )}
                <form noValidate onSubmit={submitManualReservation} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-start">
                  {/* Customer Name */}
                  <label htmlFor="manual-customer-name" className="block text-xs font-medium text-ivory-dim">
                    <span className="mb-1 block h-3 text-[10px] font-bold leading-3 tracking-wide text-gold">{activeManualField === 'name' ? 'Fill this next' : ''}</span>
                    <span>Customer Name</span> <span className="text-gold">*</span>
                    <input
                      id="manual-customer-name"
                      required
                      minLength={2}
                      maxLength={100}
                      value={manualName}
                      onBlur={() => {
                        setFormTouched((prev) => ({ ...prev, name: true }));
                        setManualName((current) => normalizeCustomerNameCase(current));
                      }}
                      onChange={(event) => setManualName(sanitizeCustomerName(event.target.value))}
                      onKeyDown={(event) => {
                        if (isInvalidCustomerNameKey(event.key, event.ctrlKey || event.metaKey)) {
                          event.preventDefault();
                        }
                      }}
                      className={`mt-1.5 h-10 w-full rounded-sm border bg-charcoal/80 px-3.5 py-2 text-sm text-ivory outline-none transition-colors placeholder:text-ivory-dim/40 hover:border-white/20 focus:border-gold/60 focus:ring-1 focus:ring-gold/50 ${
                        (formTouched.name || formSubmitted) && (!manualName.trim() || manualName.trim().length < 2)
                          ? 'border-red-500/60 focus:border-red-500'
                          : 'border-white/10'
                      }`}
                      placeholder="e.g. Juan dela Cruz"
                    />
                    {(formTouched.name || formSubmitted) && (!manualName.trim() || manualName.trim().length < 2) && (
                      <p className="mt-1 text-[11px] text-red-400" role="alert">
                        {manualName.trim().length === 0 ? 'Customer name is required' : 'Name must be at least 2 characters'}
                      </p>
                    )}
                  </label>

                  {/* Service Availed */}
                  <div onFocusCapture={() => highlightMissingPrerequisites('service')}>
                    <p className="mb-1 h-3 text-[10px] font-bold leading-3 tracking-wide text-gold">{activeManualField === 'service' ? 'Fill this next' : ''}</p>
                    <SearchableSelect
                      id="manual-service"
                      label="Service Availed *"
                      labelClassName="mb-1.5 block text-xs font-medium text-ivory-dim"
                      value={manualServiceId}
                      onChange={(val) => {
                        setManualServiceId(val);
                        setFormTouched((prev) => ({ ...prev, service: true }));
                      }}
                      placeholder="Select service"
                      searchPlaceholder="Search services…"
                      emptyMessage={manualServicesError ? 'Service list unavailable' : 'No matching services found'}
                      options={manualServices.map((service) => {
                        const formattedTitle = formatServiceTitle(service.name);
                        return {
                          value: service.id,
                          label: formattedTitle,
                          shortLabel: formattedTitle,
                          badge: {
                            text: service.isMissingDuration ? `Est. ${formatDurationHuman(service.durationMinutes)}` : formatDurationHuman(service.durationMinutes),
                            variant: service.isMissingDuration ? ('warning' as const) : ('neutral' as const),
                          },
                          extraRight: `₱${service.price.toFixed(0)}`,
                        };
                      })}
                      buttonClassName={`h-10 w-full rounded-sm border bg-charcoal/80 px-3.5 py-2 text-sm text-ivory outline-none transition-colors hover:border-white/20 focus:border-gold/60 focus:ring-1 focus:ring-gold/50 ${
                        (formTouched.service || formSubmitted) && !manualServiceId ? 'border-red-500/60' : 'border-white/10'
                      }`}
                    />
                    {(formTouched.service || formSubmitted) && !manualServiceId && (
                      <p className="mt-1 text-[11px] text-red-400" role="alert">
                        Please select a service
                      </p>
                    )}
                  </div>

                  {/* Reservation Date */}
                  <div ref={manualCalendarRef} onFocusCapture={() => highlightMissingPrerequisites('date')} className="relative">
                    <p className="mb-1 h-3 text-[10px] font-bold leading-3 tracking-wide text-gold">{activeManualField === 'date' ? 'Fill this next' : ''}</p>
                    <span className="mb-1.5 block text-xs font-medium text-ivory-dim">
                      <span>Reservation Date</span> <span className="text-gold">*</span>
                    </span>
                    <button
                      type="button"
                      aria-expanded={manualCalendarOpen}
                      aria-controls="manual-reservation-calendar"
                      onClick={() => {
                        setManualCalendarOpen((open) => !open);
                        setFormTouched((prev) => ({ ...prev, date: true }));
                      }}
                      className={`flex h-10 w-full items-center gap-2 rounded-sm border bg-charcoal/80 px-3.5 text-left text-sm text-ivory transition-colors hover:border-white/20 focus:border-gold/60 ${
                        (formTouched.date || formSubmitted) && (!manualDate || !manualDateIsBookable)
                          ? 'border-red-500/60'
                          : 'border-white/10'
                      }`}
                    >
                      <CalendarDays className="h-4 w-4 text-gold shrink-0" />
                      <span>{manualDate ? formatReservationDateConsistent(manualDate) : 'Select date'}</span>
                    </button>
                    {manualCalendarOpen && (
                      <div id="manual-reservation-calendar" role="dialog" aria-label="Reservation calendar" className="absolute left-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-3rem))] rounded-sm border border-white/10 bg-charcoal p-3 shadow-2xl">
                        <div className="mb-3 flex items-center justify-between">
                          <button type="button" aria-label="Previous month" onClick={() => setManualCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded p-1 text-ivory-dim hover:bg-white/5 hover:text-gold"><ChevronLeft className="h-4 w-4" /></button>
                          <span className="text-sm font-semibold text-ivory">{manualCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                          <button type="button" aria-label="Next month" onClick={() => setManualCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded p-1 text-ivory-dim hover:bg-white/5 hover:text-gold"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                        <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold text-ivory-dim">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}</div>
                        <div className="grid grid-cols-7 gap-1">
                          {Array.from({ length: new Date(manualCalendarMonth.getFullYear(), manualCalendarMonth.getMonth(), 1).getDay() }, (_, index) => <span key={`blank-${index}`} />)}
                          {Array.from({ length: new Date(manualCalendarMonth.getFullYear(), manualCalendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => {
                            const day = index + 1;
                            const iso = `${manualCalendarMonth.getFullYear()}-${String(manualCalendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const disabled = iso < getManilaDateIso() || (iso === getManilaDateIso() && manualTodayCutoffReached);
                            return <button key={iso} type="button" disabled={disabled} onClick={() => { setManualDate(iso); setManualCalendarOpen(false); }} className={`h-9 rounded-sm text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${manualDate === iso ? 'bg-gold font-bold text-charcoal' : 'text-ivory hover:bg-gold/15 hover:text-gold'}`}>{day}</button>;
                          })}
                        </div>
                      </div>
                    )}
                    {(formTouched.date || formSubmitted) && (!manualDate || !manualDateIsBookable) && (
                      <p className="mt-1 text-[11px] text-red-400" role="alert">
                        {!manualDate ? 'Please select a date' : 'Today’s cutoff reached (9:00 PM)'}
                      </p>
                    )}
                  </div>

                  {/* Reservation Time */}
                  <div onFocusCapture={() => highlightMissingPrerequisites('time')}>
                    <p className="mb-1 h-3 text-[10px] font-bold leading-3 tracking-wide text-gold">{activeManualField === 'time' ? 'Fill this next' : ''}</p>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="block text-xs font-medium text-ivory-dim">
                        <span>Reservation Time</span> <span className="text-gold">*</span>
                      </span>
                      {manualAvailabilityLoading || !manualAvailabilityIsCurrent ? (
                        <span role="status" className="inline-flex items-center gap-1 text-xs text-ivory-dim"><Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />Checking availability</span>
                      ) : isTimeManuallyEdited && slotResult.earliestSlot ? (
                        <button
                          type="button"
                          onClick={handleResetToSuggested}
                          className="text-[10px] font-medium text-gold hover:text-gold-light underline transition-colors cursor-pointer"
                        >
                          Reset to suggested
                        </button>
                      ) : slotResult.earliestSlot ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gold/90">
                          <Sparkles className="h-2.5 w-2.5 text-gold" />
                          <span>Suggested</span>
                        </span>
                      ) : null}
                    </div>

                    <fieldset disabled={manualAvailabilityLoading || !manualAvailabilityIsCurrent} aria-busy={manualAvailabilityLoading || !manualAvailabilityIsCurrent} className={`flex h-10 disabled:opacity-60 items-center gap-1.5 rounded-sm border bg-charcoal/80 px-2 text-sm text-ivory ${(formTouched.time || formSubmitted) && (!manualTime || !manualTimeIsInFuture || !manualTimeIsAvailable) ? 'border-red-500/60' : 'border-white/10'}`}>
                      <Clock className="h-4 w-4 shrink-0 text-gold ml-1" />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        aria-label="Reservation hour (1-12)"
                        placeholder="hh"
                        value={timeHour}
                        onBlur={() => {
                          setFormTouched((prev) => ({ ...prev, time: true }));
                          const hNum = Number(timeHour);
                          if (timeHour && (isNaN(hNum) || hNum < 1 || hNum > 12)) {
                            setTimeValidationError('Hour must be 1–12');
                          } else if (timeHour && timeMinute) {
                            const mPadded = timeMinute.padStart(2, '0');
                            setTimeMinute(mPadded);
                            updateManualTimeFromParts(timeHour, mPadded, timePeriod);
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                          setIsTimeManuallyEdited(true);
                          setTimeHour(val);
                          const hNum = Number(val);
                          if (val && (isNaN(hNum) || hNum < 1 || hNum > 12)) {
                            setTimeValidationError('Hour must be 1–12');
                          } else {
                            setTimeValidationError(null);
                            if (timeMinute.length === 2) {
                              updateManualTimeFromParts(val, timeMinute, timePeriod);
                            }
                          }
                        }}
                        className="h-8 w-10 rounded-sm border border-white/10 bg-charcoal px-1 text-center text-xs font-semibold text-ivory outline-none focus:border-gold/60"
                      />
                      <span className="text-ivory-dim font-bold">:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        aria-label="Reservation minute (00-59)"
                        placeholder="mm"
                        value={timeMinute}
                        onBlur={() => {
                          setFormTouched((prev) => ({ ...prev, time: true }));
                          if (timeMinute.length === 1) {
                            const padded = timeMinute.padStart(2, '0');
                            setTimeMinute(padded);
                            updateManualTimeFromParts(timeHour, padded, timePeriod);
                          } else if (timeMinute.length === 2) {
                            updateManualTimeFromParts(timeHour, timeMinute, timePeriod);
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                          setIsTimeManuallyEdited(true);
                          setTimeMinute(val);
                          const mNum = Number(val);
                          if (val && (isNaN(mNum) || mNum < 0 || mNum > 59)) {
                            setTimeValidationError('Minute must be 00–59');
                          } else {
                            setTimeValidationError(null);
                            if (val.length === 2) {
                              updateManualTimeFromParts(timeHour, val, timePeriod);
                            }
                          }
                        }}
                        className="h-8 w-10 rounded-sm border border-white/10 bg-charcoal px-1 text-center text-xs font-semibold text-ivory outline-none focus:border-gold/60"
                      />
                      <div className="flex h-8 rounded-sm border border-white/10 bg-charcoal p-0.5 ml-auto" role="group" aria-label="AM or PM">
                        <button
                          type="button"
                          disabled={manualAvailabilityLoading || !manualAvailabilityIsCurrent}
                          onClick={() => handleTimePeriodChange('AM')}
                          className={`px-1.5 py-0.5 rounded-sm text-[11px] font-bold transition-colors cursor-pointer ${
                            timePeriod === 'AM' ? 'bg-gold text-charcoal shadow-sm' : 'text-ivory-dim hover:text-ivory'
                          }`}
                        >
                          AM
                        </button>
                        <button
                          type="button"
                          disabled={manualAvailabilityLoading || !manualAvailabilityIsCurrent}
                          onClick={() => handleTimePeriodChange('PM')}
                          className={`px-1.5 py-0.5 rounded-sm text-[11px] font-bold transition-colors cursor-pointer ${
                            timePeriod === 'PM' ? 'bg-gold text-charcoal shadow-sm' : 'text-ivory-dim hover:text-ivory'
                          }`}
                        >
                          PM
                        </button>
                      </div>
                    </fieldset>

                    {/* Available suggested starts; unavailable input is explained below. */}
                    {(manualAvailabilityLoading || !manualAvailabilityIsCurrent || displaySlotChips.length > 0) && <div className="mt-1.5 min-h-6">
                    {manualAvailabilityLoading || !manualAvailabilityIsCurrent ? (
                      <div className="flex gap-1.5" aria-hidden="true">
                        {[0, 1, 2].map((index) => <span key={index} className="h-5 w-16 rounded-sm bg-white/10 motion-safe:animate-pulse" />)}
                      </div>
                    ) : displaySlotChips.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-ivory-dim mr-0.5 font-medium">Suggested:</span>
                        {displaySlotChips.map((slot) => {
                          const isSelected = manualTime === slot.time24;
                          return (
                            <button
                              key={slot.time24}
                              type="button"
                              onClick={() => {
                                applyTimePreset(Math.floor(slot.minutes / 60), slot.minutes % 60);
                                setIsTimeManuallyEdited(true);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-gold text-charcoal font-bold'
                                  : 'bg-white/5 border border-white/10 text-ivory-dim hover:border-gold/40 hover:text-gold'
                              }`}
                            >
                              {slot.time12}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    </div>}
                    {timeFeedback && !manualAvailabilityLoading && manualAvailabilityIsCurrent && !slotResult.isFullyBooked && (
                      <p role="status" aria-live="polite" aria-atomic="true" className="mt-1 text-xs leading-relaxed text-gold">{timeFeedback}</p>
                    )}

                    {timeValidationError && (
                      <p className="mt-1 text-[11px] text-red-400" role="alert">{timeValidationError}</p>
                    )}

                    {/* Fully Booked Notice & Next Available Date Jumper */}
                    {slotResult.isFullyBooked && (
                      <div role="status" className="mt-2 rounded-sm border border-amber-500/25 bg-amber-500/[0.07] p-2.5 text-xs text-amber-100">
                        <div className="flex items-start gap-2 leading-relaxed">
                          <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                          <span>{manualAvailabilityError
                            ? 'Availability could not be verified. Retry the live checks.'
                            : !getShopHoursForDate(manualDate, shopSettings?.businessHours).isOpen
                              ? 'The shop is closed on this date.'
                              : manualDate === getManilaDateIso() && manilaClockMinutes + selectedServiceDuration > timeToMinutes(getShopHoursForDate(manualDate, shopSettings?.businessHours).closeTime)
                                ? 'No remaining appointment times today.'
                                : 'No available appointment times on this date.'}</span>
                        </div>
                        {nextAvailableDate && !manualAvailabilityError && (
                          <button
                            type="button"
                            onClick={() => {
                              setManualDate(nextAvailableDate);
                              setIsTimeManuallyEdited(false);
                            }}
                            className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-gold/25 bg-gold/10 px-2.5 py-1 text-xs font-semibold text-gold hover:bg-gold/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                          >
                            <span>Check {formatReservationDateConsistent(nextAvailableDate)}</span>
                            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Selected Time Conflict (with 1-click Auto-Jump to Next Available Slot) */}
                    {manualTime && !manualTimeIsAvailable && selectedTimeBlockedReason && !slotResult.isFullyBooked && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-amber-500/25 bg-amber-500/[0.08] p-2 text-xs text-amber-200">
                        <div className="flex items-center gap-1.5 font-medium">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                          <span>{selectedTimeBlockedReason}</span>
                        </div>
                        {nextSlotAfterBlocked && dismissedTimeSuggestion !== timeSuggestionKey && (
                          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          <span className="w-full text-right text-[11px]">Use a suggested time instead?</span>
                          <button
                            type="button"
                            onClick={() => {
                              applyTimePreset(
                                Math.floor(nextSlotAfterBlocked.minutesFromMidnight / 60),
                                nextSlotAfterBlocked.minute
                              );
                              setIsTimeManuallyEdited(true);
                            }}
                            className="inline-flex items-center gap-1 rounded bg-gold px-2.5 py-1 text-xs font-semibold text-charcoal hover:bg-gold-dim transition-colors shadow-sm cursor-pointer active:scale-95 ml-auto"
                            title={`Shift reservation time to ${nextSlotAfterBlocked.time12}`}
                          >
                            <ArrowRight className="h-3 w-3 stroke-[2.5]" />
                            <span>Use {nextSlotAfterBlocked.time12}</span>
                          </button>
                          <button type="button" onClick={() => setDismissedTimeSuggestion(timeSuggestionKey)} className="rounded-sm border border-amber-200/30 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-white/5">
                            Keep entered time
                          </button>
                          </div>
                        )}
                        {dismissedTimeSuggestion === timeSuggestionKey && <p className="text-[11px]">Entered time kept. Edit it or choose an available suggestion before reserving.</p>}
                      </div>
                    )}
                  </div>

                  {/* Barber */}
                  <div onFocusCapture={() => highlightMissingPrerequisites('barber')} className="min-w-0">
                    <p className="mb-1 h-3 text-[10px] font-bold leading-3 tracking-wide text-gold">{activeManualField === 'barber' ? 'Fill this next' : ''}</p>
                    <SearchableSelect
                      id="manual-barber"
                      dropdownAlign="right"
                      wrapOptionText
                      className="min-w-0"
                      label="Barber *"
                      labelClassName="mb-1.5 block text-xs font-medium text-ivory-dim"
                      value={manualBarberId}
                      onChange={(val) => {
                        setManualBarberId(val);
                        setIsTimeManuallyEdited(true);
                        setFormTouched((prev) => ({ ...prev, barber: true }));
                      }}
                      placeholder="Select barber"
                      searchPlaceholder="Search barbers…"
                      options={[
                        {
                          value: 'any',
                          label: 'Any available barber',
                          shortLabel: 'Any available',
                          description: autoAssignedBarber
                            ? `${autoAssignedBarber.name} is free at the selected time and will be assigned automatically.`
                            : 'Automatically assigns the first free barber for this time',
                          badge: {
                            text: autoAssignedBarber ? autoAssignedBarber.name : 'Auto-assign',
                            variant: 'gold',
                          },
                          disabled: false,
                        },
                        ...barbers.map((barber) => {
                          const availability = manualBarberAvailabilityByTime[barber.id];
                          const checking = manualAvailabilityLoading || !manualAvailabilityIsCurrent || !availability;
                          const unavailable = Boolean(
                            availability && (availability.verificationFailed || availability.isUnavailable || !availability.isOnDuty)
                          );
                          const booked = Boolean(
                            manualAvailabilityIsCurrent && availability && !unavailable && manualBarberIsBookedAtSelectedTime(barber.id)
                          );
                          const isAvailable = Boolean(
                            manualTime && manualTimeIsInFuture && manualBarberIsAvailableAtSelectedTime(barber.id)
                          );

                          let badgeText = 'On Duty';
                          let badgeVariant: 'success' | 'danger' | 'warning' | 'neutral' | 'gold' = 'neutral';
                          let descriptionText = 'Available for scheduling';

                          if (checking) {
                            badgeText = 'Checking';
                            badgeVariant = 'warning';
                            descriptionText = 'Verifying schedule…';
                          } else if (unavailable) {
                            badgeText = 'Off Duty';
                            badgeVariant = 'neutral';
                            descriptionText = 'Not on duty on this date';
                          } else if (manualTime && !manualTimeIsInFuture) {
                            badgeText = 'Past';
                            badgeVariant = 'neutral';
                            descriptionText = 'Selected time has passed';
                          } else if (booked) {
                            badgeText = 'Booked';
                            badgeVariant = 'danger';
                            descriptionText = 'Booked at this time · view suggested openings';
                          } else if (manualTime && !isAvailable) {
                            badgeText = 'Unavailable';
                            badgeVariant = 'neutral';
                            descriptionText = 'Outside barber hours';
                          } else if (isAvailable) {
                            badgeText = 'Available';
                            badgeVariant = 'success';
                            descriptionText = 'Free for selected time slot';
                          }

                          return {
                            value: barber.id,
                            label: barber.name,
                            shortLabel: barber.name,
                            description: descriptionText,
                            badge: {
                              text: badgeText,
                              variant: badgeVariant,
                            },
                            disabled: checking || unavailable,
                          };
                        }).sort((left, right) => {
                          const rank = (text: string) => text === 'Available' ? 0 : text === 'Booked' ? 1 : 2;
                          return rank(left.badge.text) - rank(right.badge.text);
                        }),
                      ]}
                      buttonClassName={`h-10 min-w-0 w-full rounded-sm border bg-charcoal/80 px-3.5 py-2 text-sm outline-none transition-colors hover:border-white/20 focus:border-gold/60 focus:ring-1 focus:ring-gold/50 ${
                        (formTouched.barber || formSubmitted) && (!manualBarberId || (manualBarberId === 'any' && manualTime && !autoAssignedBarber))
                          ? 'border-red-500/60'
                          : 'border-white/10'
                      } ${manualTime && manualServiceId && manualBarberId && manualBarberId !== 'any' && !manualBarberIsAvailableAtSelectedTime(manualBarberId) ? 'text-ivory-dim/50' : 'text-ivory'}`}
                    />

                    {/* Barber selection feedback */}
                    {manualBarberId === 'any' ? (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" role="status" aria-live="polite">
                        {autoAssignedBarber ? (
                          <span className="text-gold font-medium flex items-center gap-1">
                            <Check className="h-3.5 w-3.5 text-gold shrink-0" />
                            <span>Auto-assigned to: <strong>{autoAssignedBarber.name}</strong></span>
                          </span>
                        ) : manualTime && manualTimeIsInFuture ? (
                          <span className="text-amber-300 flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span>{manualAvailabilityLoading ? 'Checking available barbers…' : 'No barber is free at this time. Pick another time.'}</span>
                          </span>
                        ) : (
                          <span className="text-ivory-dim/70">Will auto-assign the first free barber when time is set</span>
                        )}
                      </div>
                    ) : manualBarberId && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" role="status" aria-live="polite">
                        {manualAvailabilityLoading ? (
                          <span className="text-amber-300/80">Checking barber schedule…</span>
                        ) : !manualTime ? (
                          <span className="text-ivory-dim/70">Choose a time to verify slot</span>
                        ) : manualBarberIsAvailableAtSelectedTime(manualBarberId) ? (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span>Slot is open and ready to reserve</span>
                          </span>
                        ) : manualBarberIsBookedAtSelectedTime(manualBarberId) ? (
                          <span className="text-red-400 font-medium flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            <span>Barber is already booked at this time</span>
                          </span>
                        ) : (
                          <span className="text-amber-300 font-medium flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span>Barber is off duty or unavailable for this time</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Bar (Deposit Status & Submit) */}
                  <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-white/5 pt-3">
                    {/* Informative Deposit Hint & Balance Calculation */}
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <label htmlFor="manual-reservation-payment-method" className="flex items-center gap-2 text-[11px] font-medium text-ivory-dim">
                        <span>Fee payment</span>
                        <select
                          id="manual-reservation-payment-method"
                          value={manualPaymentMethod}
                          onChange={(event) => setManualPaymentMethod(event.target.value as 'Cash' | 'GCash')}
                          disabled={manualSubmitting}
                          className="h-9 rounded-sm border border-white/10 bg-charcoal px-2.5 text-xs text-ivory outline-none transition-colors focus:border-gold/60 disabled:opacity-50"
                        >
                          <option value="Cash">Cash</option>
                          <option value="GCash">GCash</option>
                        </select>
                      </label>
                      <div
                        className="inline-flex items-center gap-1.5 text-ivory-dim/80 hover:text-ivory transition-colors cursor-help"
                        title="Manual cashier reservations automatically record a ₱50 deposit upon booking. The customer pays the remaining service balance at checkout."
                      >
                        <Info className="h-3.5 w-3.5 text-gold/80 shrink-0" />
                        <span className="text-[11.5px]">
                          <strong className="font-semibold text-ivory">₱50 {manualPaymentMethod} deposit</strong> is recorded automatically upon reservation
                        </span>
                      </div>

                      {selectedManualService && (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs">
                          <span className="text-[11px] text-ivory-dim/60">Remaining balance at checkout:</span>
                          <span className="font-mono text-[11px] font-semibold text-gold">
                            ₱{Math.max(0, selectedManualService.price - 50).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <button
                        type="submit"
                        disabled={manualSubmitting}
                        title="Add customer to reservation list"
                        className="flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm bg-gold px-5 text-xs font-semibold uppercase tracking-wider text-charcoal shadow-sm transition-all hover:bg-gold-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1 focus-visible:ring-offset-charcoal disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ivory-dim/40 cursor-pointer active:scale-95"
                      >
                        {manualSubmitting ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Adding…</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>Add Reservation</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </section>
            )}

            <div ref={reservationResultsRef} className="[overflow-anchor:none]" style={{ minHeight: reservationResultsMinHeight || undefined }}>
            {reservationRefreshing && reservationDataStatus !== 'loading' && (
              <div role="status" className="mb-2 inline-flex items-center gap-2 text-[11px] text-ivory-dim">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" aria-hidden="true" />
                <span>Refreshing reservations</span>
              </div>
            )}
            {visibleReservations.length > 0 ? (
              <fieldset disabled={!canMutateReservations} className="contents">
              <>
                {/* 1. MOBILE: Compact Stacked Records (< 768px) */}
                <div className="block md:hidden space-y-3">
                  <AnimatePresence initial={false}>
                    {visibleReservations.map(reservation => {
                      const barber = barberFor(reservation.barberId);
                      const barberColor = getBarberColor(reservation.barberId || '');
                      const queuePosition = scheduledPositionById.get(reservation.id);
                      const conflict = getConflictInfo(reservation);
                      const isConfirmed = reservation.status === STATUS.CONFIRMED || reservation.status === STATUS.LATE;
                      const isExpired = isReservationExpired(reservation, reservationClock);
                      const isGroupReservation = Boolean(reservation.groupGuests && reservation.groupGuests.length > 1);
                      const remainingGroupGuests = isGroupReservation
                        ? reservation.groupGuests!.filter((g) => ['accepted', 'late', 'confirmed'].includes(g.status.toLowerCase()))
                        : [];
                      const isAllGroupGuestsProcessed = isGroupReservation && remainingGroupGuests.length === 0;
                      const statusBadge = getReservationStatusPresentation(reservation, reservationClock);
                      const resArrivalEpoch = reservationTimeToEpoch(reservation.date, reservation.time);
                      const isEarlyResCheckIn = resArrivalEpoch !== null && reservationClock < resArrivalEpoch;
                      const isResCheckInEligible = resArrivalEpoch !== null
                        && (bypassTimeRestrictions || reservationClock >= resArrivalEpoch - EARLY_CHECK_IN_WINDOW_MS);
                      const displayResTime = reservation.time || (resArrivalEpoch ? new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
                      }).format(new Date(resArrivalEpoch)) : 'the scheduled time');

                      return (
                        <motion.div
                                            layout={reduceMotion ? false : "position"}
                          key={reservation.id}
                          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
                          transition={{ duration: reduceMotion ? 0 : 0.16 }}
                          className="rounded-sm border border-white/10 bg-white/5 p-4 transition-colors card-gold-accent"
                          style={{
                            borderColor: reservation.barberId ? `${barberColor}60` : undefined,
                          }}
                        >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-ivory">
                            <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: barberColor }} aria-hidden="true" />
                            <QueuePositionBadge info={queuePosition} color={barberColor} />
                            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gold" />
                            <span className="font-semibold">{formatReservationDateConsistent(reservation.date)}</span>
                            <span className="text-white/30">·</span>
                            <span className="truncate font-mono font-semibold text-gold">{formatReservationTime12Hour(reservation.time)}</span>
                          </div>
                        </div>
                        {/* Top Header: Customer name & Status badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <h4 className="truncate text-sm font-bold text-ivory">{reservation.name}</h4>
                            {conflict && (
                              <div className={`mt-0.5 text-[11px] font-semibold ${conflict.isFirst ? 'text-green-300' : 'text-red-300'}`}>
                                {conflict.isFirst ? `First request; also requested by ${conflict.otherBookerNames}` : `${conflict.firstBookerName} requested this slot first`}
                              </div>
                            )}
                          </div>

                          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${statusBadge.badgeClass}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`} />
                            <span>{statusBadge.label}</span>
                          </span>
                        </div>

                        {/* Service & Barber Info */}
                        <div className="mt-2.5 space-y-1.5 text-xs">
                          <div className="font-medium text-ivory space-y-0.5">
                            {reservation.service.split(/\s*(?:\+|\,)\s*/).filter(Boolean).map((svc, i) => (
                              <div key={i} className={i > 0 ? "text-ivory/80 text-[11px]" : "font-medium text-ivory"}>
                                {formatServiceTitle(svc)}
                              </div>
                            ))}
                          </div>
                          <GroupGuestList
                            reservation={reservation}
                            onCheckInGuest={checkInIndividualGuest}
                            onNoShowGuest={markIndividualGuestNoShow}
                            bypassTimeRestrictions={bypassTimeRestrictions}
                            canMutate={canMutateReservations}
                          />

                          <div className="flex items-center gap-1.5 text-ivory-dim">
                            {editingReservationId === reservation.id ? (
                              <div className="flex items-center gap-1.5 w-full">
                                <select
                                  autoFocus
                                  value={reservation.barberId || ''}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setEditingReservationId(null);
                                  }}
                                  onBlur={() => setEditingReservationId(null)}
                                  onChange={(event) => void saveReservationBarber(reservation, event.target.value)}
                                  className="h-8 flex-1 rounded-sm border border-gold/50 bg-charcoal px-2 text-xs font-medium text-ivory shadow-lg outline-none focus:border-gold"
                                >
                                  {!reservation.barberId && <option value="" disabled>Select barber…</option>}
                                  {barbers.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setEditingReservationId(null);
                                  }}
                                  title="Cancel"
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-white/10 text-ivory-dim hover:bg-white/10 hover:text-ivory"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                {reservation.barberId ? (
                                  <BarberColorPicker
                                    barberId={String(reservation.barberId)}
                                    barberName={barber?.name || 'Unassigned'}
                                    color={barberColor}
                                    allBarbers={barbers}
                                    getBarberColor={getBarberColor}
                                    onChange={(color) => handleBarberColorChange(String(reservation.barberId), color)}
                                    onResetDefault={() => handleResetBarberColor(String(reservation.barberId))}
                                  />
                                ) : (
                                  <span className="h-3.5 w-3.5 rounded-full border border-white/20 bg-white/10 shrink-0" title="Unassigned barber" />
                                )}
                                <button
                                  type="button"
                                  onClick={() => setEditingReservationId(reservation.id)}
                                  className="group/inline inline-flex items-center gap-1.5 text-left text-xs text-ivory hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded-sm px-1 py-0.5 -mx-1 border-b border-dashed border-white/30 hover:border-gold/80 cursor-pointer"
                                  title="Click to reassign barber"
                                  aria-label={`Change barber for ${reservation.name}. Current: ${barber?.name || 'Unassigned'}`}
                                >
                                  <span>Preferred: <strong className="font-semibold text-ivory group-hover/inline:text-gold">{barber?.name || 'Unassigned'}</strong></span>
                                  {isBarberOnBreak(barber?.status) && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">On Break{getBreakElapsedMinutes(barber, reservationClock) !== null ? ` · ${getBreakElapsedMinutes(barber, reservationClock)}m` : ''}</span>}
                                  <Pencil className="w-2.5 h-2.5 text-gold/70 group-hover/inline:text-gold transition-colors shrink-0" aria-hidden="true" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Deposit & Remaining Balance */}
                          <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-1 text-xs">
                            <span className="text-[11px] text-ivory-dim/70">
                              {reservation.reservationFeePaid
                                ? `₱${reservation.reservationFeeAmount ?? 50} deposit paid`
                                : 'Deposit unpaid'}
                            </span>
                            {reservation.servicePrice !== null && reservation.servicePrice !== undefined && (
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[11px] text-ivory-dim/70 font-medium">Remaining:</span>
                                <span className="font-mono text-sm font-bold text-gold">
                                  ₱{(Number(reservation.servicePrice) + (reservation.reservationFeePaid ? 0 : (reservation.reservationFeeAmount ?? 50))).toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Touch-Friendly Action Buttons */}
                        <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap items-center justify-end gap-2">
                          {isExpired ? (
                            <button type="button" onClick={() => void markNoShow(reservation.id)} className="inline-flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
                              <X className="h-3.5 w-3.5" /> No Show
                            </button>
                          ) : null}
                          {!isExpired && reservation.status === 'pending' && (
                            <>
                              {reservation.proofImageUrl && (
                                <button
                                  type="button"
                                  onClick={() => setMaximizedPhotoUrl(reservation.proofImageUrl || null)}
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm border border-gold/30 bg-gold/10 text-gold hover:bg-gold/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                                  title="View Payment Proof Receipt"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                  <span>Receipt</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setAcceptTarget(reservation)}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold active:scale-95"
                                title="Verify & Confirm Reservation"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                                <span>Verify</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => triggerDecline(reservation)}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:text-red-200 hover:bg-red-500/15 hover:border-red-500/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 active:scale-95"
                                title="Decline Reservation"
                              >
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Decline</span>
                              </button>
                            </>
                          )}
                          {!isExpired && isConfirmed && (
                            <>
                              {isAllGroupGuestsProcessed ? (
                                <span className="text-[11px] font-semibold text-ivory-dim/60 italic py-1 px-2 border border-white/10 rounded-sm bg-white/5">
                                  All guests processed
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  hidden={!isResCheckInEligible}
                                  disabled={!isResCheckInEligible}
                                  aria-disabled={!isResCheckInEligible}
                                  onClick={() => {
                                    if (!isResCheckInEligible) {
                                      addToast({
                                        type: 'info',
                                        title: 'Check In Locked',
                                        message: `Early check-in opens 10 minutes before the scheduled arrival time (${displayResTime}).`,
                                      });
                                      return;
                                    }
                                    void checkInReservation(reservation);
                                  }}
                                  className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-sm transition-all shadow-sm font-semibold ${
                                    isResCheckInEligible
                                      ? 'bg-gold text-charcoal hover:bg-gold-dim cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold active:scale-95'
                                      : 'bg-white/5 text-ivory-dim/40 border border-white/10 cursor-not-allowed opacity-75'
                                  }`}
                                  title={isResCheckInEligible ? (isGroupReservation ? `Check In remaining ${remainingGroupGuests.length} guests` : (isEarlyResCheckIn ? 'Early Check-In Customer' : 'Check In Customer')) : `Check In opens 10 minutes before ${displayResTime}`}
                                  aria-label={isResCheckInEligible ? (isGroupReservation ? `Check In remaining ${remainingGroupGuests.length} guests for ${reservation.name}` : `${isEarlyResCheckIn ? 'Early Check-In' : 'Check In'} ${reservation.name}`) : `Check In opens 10 minutes before ${displayResTime}`}
                                >
                                  {!isResCheckInEligible ? (
                                    <Lock className="w-3.5 h-3.5 text-ivory-dim/40 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                                  )}
                                  <span>{isGroupReservation ? `Check In All (${remainingGroupGuests.length})` : (isEarlyResCheckIn ? 'Early Check-In' : 'Check In')}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => triggerDecline(reservation)}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:text-red-200 hover:bg-red-500/15 hover:border-red-500/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 active:scale-95"
                                title="Cancel Booking"
                                aria-label={`Cancel Booking for ${reservation.name}`}
                              >
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Cancel</span>
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                  </AnimatePresence>
                </div>

                {/* 2. TABLET: Compact Combined Table (768px – 1199px) */}
                <div className="hidden md:block xl:hidden max-h-[34rem] overflow-x-auto overflow-y-auto custom-scrollbar flex-1 rounded-sm border border-white/10">
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-charcoal border-b border-white/15 shadow-sm">
                      <tr>
                        <th scope="col" className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gold">Date &amp; Time</th>
                        <th scope="col" className="text-left text-gold text-[10px] font-bold uppercase tracking-wider px-3 py-3">Customer</th>
                        <th scope="col" className="text-left text-gold text-[10px] font-bold uppercase tracking-wider px-3 py-3">Service</th>
                        <th scope="col" className="text-left text-gold text-[10px] font-bold uppercase tracking-wider px-3 py-3 whitespace-nowrap">Barber</th>
                        <th scope="col" className="text-left text-gold text-[10px] font-bold uppercase tracking-wider px-3 py-3">Status &amp; Balance</th>
                        <th scope="col" className="text-right text-gold text-[10px] font-bold uppercase tracking-wider px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence initial={false}>
                        {visibleReservations.map(reservation => {
                          const barber = barberFor(reservation.barberId);
                          const barberColor = getBarberColor(reservation.barberId || '');
                          const queuePosition = scheduledPositionById.get(reservation.id);
                          const conflict = getConflictInfo(reservation);
                          const isConfirmed = reservation.status === STATUS.CONFIRMED || reservation.status === STATUS.LATE;
                          const isExpired = isReservationExpired(reservation, reservationClock);
                          const isGroupReservation = Boolean(reservation.groupGuests && reservation.groupGuests.length > 1);
                          const remainingGroupGuests = isGroupReservation
                            ? reservation.groupGuests!.filter((g) => ['accepted', 'late', 'confirmed'].includes(g.status.toLowerCase()))
                            : [];
                          const isAllGroupGuestsProcessed = isGroupReservation && remainingGroupGuests.length === 0;
                          const statusBadge = getReservationStatusPresentation(reservation, reservationClock);
                          const resArrivalEpoch = reservationTimeToEpoch(reservation.date, reservation.time);
                          const isEarlyResCheckIn = resArrivalEpoch !== null && reservationClock < resArrivalEpoch;
                          const isResCheckInEligible = resArrivalEpoch !== null
                            && (bypassTimeRestrictions || reservationClock >= resArrivalEpoch - EARLY_CHECK_IN_WINDOW_MS);
                          const displayResTime = reservation.time || (resArrivalEpoch ? new Intl.DateTimeFormat('en-US', {
                            timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
                          }).format(new Date(resArrivalEpoch)) : 'the scheduled time');

                          return (
                            <motion.tr
                                                    layout={reduceMotion ? false : "position"}
                              key={reservation.id}
                              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
                              transition={{ duration: reduceMotion ? 0 : 0.16 }}
                              className="hover:bg-white/[0.04] transition-colors"
                            >
                            <td className="whitespace-nowrap px-3 py-3 align-middle text-ivory">
                              <div className="flex items-stretch gap-2">
                                <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: barberColor }} aria-hidden="true" />
                                <QueuePositionBadge info={queuePosition} color={barberColor} />
                                <div>
                                  <div className="font-mono font-semibold text-gold">{formatReservationTime12Hour(reservation.time)}</div>
                                  <div className="mt-0.5 text-[11px] text-ivory-dim">{formatReservationDateConsistent(reservation.date)}</div>
                                </div>
                              </div>
                            </td>
                            <td
                              className="py-3 px-3 text-ivory align-middle"
                            >
                              <div className="max-w-[190px] min-w-0 truncate font-semibold text-ivory">{reservation.name}</div>
                              {reservation.groupGuests && reservation.groupGuests.length > 1 && (
                                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-gold">
                                  <Users className="h-3 w-3" /> {reservation.groupGuests.length} guests
                                </span>
                              )}
                              {conflict && (
                                <div className={`mt-0.5 text-[10px] font-semibold ${conflict.isFirst ? 'text-green-300' : 'text-red-300'}`}>
                                  {conflict.isFirst ? 'First request' : 'Slot taken'}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-ivory-dim text-xs align-middle">
                              <div className="space-y-0.5">
                                {reservation.service.split(/\s*(?:\+|\,)\s*/).filter(Boolean).map((svc, i) => (
                                  <div key={i} className={i > 0 ? "text-ivory/70 text-[11px]" : "font-medium text-ivory"}>
                                    {formatServiceTitle(svc)}
                                  </div>
                                ))}
                              </div>
                              <GroupGuestList
                                reservation={reservation}
                                onCheckInGuest={checkInIndividualGuest}
                                onNoShowGuest={markIndividualGuestNoShow}
                                bypassTimeRestrictions={bypassTimeRestrictions}
                                canMutate={canMutateReservations}
                              />
                            </td>
                            <td className="py-3 px-3 text-xs align-middle whitespace-nowrap">
                              {editingReservationId === reservation.id ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      autoFocus
                                      value={reservation.barberId || ''}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') setEditingReservationId(null);
                                      }}
                                      onBlur={() => setEditingReservationId(null)}
                                      onChange={(event) => void saveReservationBarber(reservation, event.target.value)}
                                      className="h-7 max-w-36 rounded-sm border border-gold/60 bg-charcoal px-2 text-xs font-medium text-ivory shadow-lg outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                                    >
                                      {!reservation.barberId && <option value="" disabled>Select barber…</option>}
                                      {barbers.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setEditingReservationId(null);
                                      }}
                                      title="Cancel editing"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-ivory-dim hover:bg-white/10 hover:text-ivory"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                  <div className="text-[9px] text-gold/80">Press Esc or ✕ to cancel</div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {reservation.barberId ? (
                                    <BarberColorPicker
                                      barberId={String(reservation.barberId)}
                                      barberName={barber?.name || 'Unassigned'}
                                      color={barberColor}
                                      allBarbers={barbers}
                                      getBarberColor={getBarberColor}
                                      onChange={(color) => handleBarberColorChange(String(reservation.barberId), color)}
                                      onResetDefault={() => handleResetBarberColor(String(reservation.barberId))}
                                    />
                                  ) : (
                                    <span className="h-3.5 w-3.5 rounded-full border border-white/20 bg-white/10 shrink-0" title="Unassigned barber" />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditingReservationId(reservation.id)}
                                    className="group/inline inline-flex items-center gap-1.5 text-left text-xs text-ivory hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded-sm px-1 py-0.5 -mx-1 border-b border-dashed border-white/30 hover:border-gold/80 cursor-pointer"
                                    title="Click to reassign barber"
                                    aria-label={`Change barber for ${reservation.name}. Current: ${barber?.name || 'Unassigned'}`}
                                  >
                                    <span className="font-medium text-ivory group-hover/inline:text-gold truncate">{barber?.name || 'Unassigned'}</span>
                                    <Pencil className="w-2.5 h-2.5 text-gold/70 group-hover/inline:text-gold transition-colors shrink-0" aria-hidden="true" />
                                  </button>
                                  {isBarberOnBreak(barber?.status) && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">On Break{getBreakElapsedMinutes(barber, reservationClock) !== null ? ` · ${getBreakElapsedMinutes(barber, reservationClock)}m` : ''}</span>}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 align-middle">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${statusBadge.badgeClass}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`} />
                                    <span>{statusBadge.label}</span>
                                  </span>

                                  <span className="text-[10px] text-ivory-dim/70">
                                    {reservation.reservationFeePaid ? `• ₱${reservation.reservationFeeAmount ?? 50} paid` : '• Unpaid'}
                                  </span>
                                </div>

                                {reservation.servicePrice !== null && reservation.servicePrice !== undefined && (
                                  <div className="flex items-baseline gap-1 pt-0.5 text-xs">
                                    <span className="text-[10px] font-medium text-ivory-dim/80">Remaining:</span>
                                    <span className="font-mono text-xs font-bold text-gold tracking-wide">
                                      ₱{(Number(reservation.servicePrice) + (reservation.reservationFeePaid ? 0 : (reservation.reservationFeeAmount ?? 50))).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right align-middle whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {isExpired ? (
                                  <button type="button" onClick={() => void markNoShow(reservation.id)} className="inline-flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400">
                                    <X className="h-3 w-3" /> No Show
                                  </button>
                                ) : null}
                                {!isExpired && reservation.status === 'pending' && (
                                  <>
                                    {reservation.proofImageUrl && (
                                      <button
                                        type="button"
                                        onClick={() => setMaximizedPhotoUrl(reservation.proofImageUrl || null)}
                                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm border border-gold/30 bg-gold/10 text-gold hover:bg-gold/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                        title="View Payment Proof Receipt"
                                      >
                                        <Maximize2 className="w-3 h-3" />
                                        <span>Receipt</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setAcceptTarget(reservation)}
                                      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold active:scale-95"
                                      title="Verify & Confirm Reservation"
                                    >
                                      <Check className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                                      <span>Verify</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => triggerDecline(reservation)}
                                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:text-red-200 hover:bg-red-500/15 hover:border-red-500/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 active:scale-95"
                                      title="Decline Reservation"
                                    >
                                      <X className="w-3 h-3" aria-hidden="true" />
                                      <span>Decline</span>
                                    </button>
                                  </>
                                )}
                                {!isExpired && isConfirmed && (
                                  <>
                                    {isAllGroupGuestsProcessed ? (
                                      <span className="text-[10px] font-semibold text-ivory-dim/60 italic py-1 px-2 border border-white/10 rounded-sm bg-white/5">
                                        All guests processed
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        hidden={!isResCheckInEligible}
                                        disabled={!isResCheckInEligible}
                                        aria-disabled={!isResCheckInEligible}
                                        onClick={() => {
                                          if (!isResCheckInEligible) {
                                            addToast({
                                              type: 'info',
                                              title: 'Check In Locked',
                                              message: `Early check-in opens 10 minutes before the scheduled arrival time (${displayResTime}).`,
                                            });
                                            return;
                                          }
                                          void checkInReservation(reservation);
                                        }}
                                        className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-sm transition-all shadow-sm font-semibold ${
                                          isResCheckInEligible
                                            ? 'bg-gold text-charcoal hover:bg-gold-dim cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold active:scale-95'
                                            : 'bg-white/5 text-ivory-dim/40 border border-white/10 cursor-not-allowed opacity-75'
                                        }`}
                                        title={isResCheckInEligible ? (isGroupReservation ? `Check In remaining ${remainingGroupGuests.length} guests` : (isEarlyResCheckIn ? 'Early Check-In Customer' : 'Check In Customer')) : `Check In opens 10 minutes before ${displayResTime}`}
                                        aria-label={isResCheckInEligible ? (isGroupReservation ? `Check In remaining ${remainingGroupGuests.length} guests for ${reservation.name}` : `${isEarlyResCheckIn ? 'Early Check-In' : 'Check In'} ${reservation.name}`) : `Check In opens 10 minutes before ${displayResTime}`}
                                      >
                                        {!isResCheckInEligible ? (
                                          <Lock className="w-3 h-3 text-ivory-dim/40 shrink-0" aria-hidden="true" />
                                        ) : (
                                          <Check className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                                        )}
                                        <span>{isGroupReservation ? `Check In All (${remainingGroupGuests.length})` : (isEarlyResCheckIn ? 'Early Check-In' : 'Check In')}</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => triggerDecline(reservation)}
                                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:text-red-200 hover:bg-red-500/15 hover:border-red-500/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 active:scale-95"
                                      title="Cancel Booking"
                                      aria-label={`Cancel Booking for ${reservation.name}`}
                                    >
                                      <X className="w-3 h-3" aria-hidden="true" />
                                      <span>Cancel</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                {/* 3. DESKTOP: Full Reservation Table (>= 1200px) */}
                <div className="hidden xl:block max-h-[34rem] overflow-x-auto overflow-y-auto custom-scrollbar flex-1 rounded-sm border border-white/10">
                  <table className="w-full border-collapse text-xs sm:text-sm">
                    <thead className="sticky top-0 z-10 bg-charcoal border-b border-white/15 shadow-sm">
                      <tr>
                        <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gold">Date &amp; Time</th>
                        <th scope="col" className="text-left text-gold text-[10px] font-bold uppercase tracking-wider px-4 py-3">Customer</th>
                        <th scope="col" className="text-left text-gold text-[10px] font-bold uppercase tracking-wider px-4 py-3">Service</th>
                        <th scope="col" className="text-left text-gold text-[10px] font-bold uppercase tracking-wider px-4 py-3">Barber</th>
                        <th scope="col" className="text-left text-gold text-[10px] font-bold uppercase tracking-wider px-4 py-3">Status &amp; Balance</th>
                        <th scope="col" className="text-right text-gold text-[10px] font-bold uppercase tracking-wider px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence initial={false}>
                      {visibleReservations.map(reservation => {
                        const barber = barberFor(reservation.barberId);
                        const barberColor = getBarberColor(reservation.barberId || '');
                        const queuePosition = scheduledPositionById.get(reservation.id);
                        const conflict = getConflictInfo(reservation);
                        const isConfirmed = reservation.status === STATUS.CONFIRMED || reservation.status === STATUS.LATE;
                        const isExpired = isReservationExpired(reservation, reservationClock);
                        const isGroupReservation = Boolean(reservation.groupGuests && reservation.groupGuests.length > 1);
                        const remainingGroupGuests = isGroupReservation
                          ? reservation.groupGuests!.filter((g) => ['accepted', 'late', 'confirmed'].includes(g.status.toLowerCase()))
                          : [];
                        const isAllGroupGuestsProcessed = isGroupReservation && remainingGroupGuests.length === 0;
                        const statusBadge = getReservationStatusPresentation(reservation, reservationClock);
                        const resArrivalEpoch = reservationTimeToEpoch(reservation.date, reservation.time);
                        const isEarlyResCheckIn = resArrivalEpoch !== null && reservationClock < resArrivalEpoch;
                        const isResCheckInEligible = resArrivalEpoch !== null
                          && (bypassTimeRestrictions || reservationClock >= resArrivalEpoch - EARLY_CHECK_IN_WINDOW_MS);
                        const displayResTime = reservation.time || (resArrivalEpoch ? new Intl.DateTimeFormat('en-US', {
                          timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
                        }).format(new Date(resArrivalEpoch)) : 'the scheduled time');

                        return (
                          <motion.tr
                                                    layout={reduceMotion ? false : "position"}
                            key={reservation.id}
                            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
                            transition={{ duration: reduceMotion ? 0 : 0.16 }}
                            className="hover:bg-white/[0.04] transition-colors"
                          >
                            <td className="whitespace-nowrap px-4 py-3 align-middle text-ivory">
                              <div className="flex items-stretch gap-2">
                                <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: barberColor }} aria-hidden="true" />
                                <QueuePositionBadge info={queuePosition} color={barberColor} />
                                <div>
                                  <div className="font-mono text-sm font-semibold text-gold">{formatReservationTime12Hour(reservation.time)}</div>
                                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ivory-dim">
                                    <CalendarDays className="h-3 w-3 shrink-0 text-gold/60" />
                                    <span>{formatReservationDateConsistent(reservation.date)}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td
                              className="py-3 px-4 text-ivory align-middle"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="min-w-0 flex-1 font-semibold text-ivory">{reservation.name}</div>
                              </div>
                              {reservation.groupGuests && reservation.groupGuests.length > 1 && (
                                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-gold">
                                  <Users className="h-3 w-3" /> {reservation.groupGuests.length} guests
                                </span>
                              )}
                              {conflict && (
                                <div className={`mt-1 text-[11px] font-semibold ${conflict.isFirst ? 'text-green-300' : 'text-red-300'}`}>
                                  {conflict.isFirst ? `First request; also requested by ${conflict.otherBookerNames}` : `${conflict.firstBookerName} requested this slot first`}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-ivory-dim text-xs sm:text-sm align-middle">
                              <div className="space-y-0.5">
                                {reservation.service.split(/\s*(?:\+|\,)\s*/).filter(Boolean).map((svc, i) => (
                                  <div key={i} className={i > 0 ? "text-ivory/70 text-xs" : "font-medium text-ivory"}>
                                    {formatServiceTitle(svc)}
                                  </div>
                                ))}
                              </div>
                              <GroupGuestList
                                reservation={reservation}
                                onCheckInGuest={checkInIndividualGuest}
                                onNoShowGuest={markIndividualGuestNoShow}
                                bypassTimeRestrictions={bypassTimeRestrictions}
                                canMutate={canMutateReservations}
                              />
                            </td>
                            <td className="py-3 px-4 text-ivory text-xs sm:text-sm align-middle font-medium">
                              {editingReservationId === reservation.id ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      autoFocus
                                      value={reservation.barberId || ''}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') setEditingReservationId(null);
                                      }}
                                      onBlur={() => setEditingReservationId(null)}
                                      onChange={(event) => void saveReservationBarber(reservation, event.target.value)}
                                      className="h-8 max-w-44 rounded-sm border border-gold/60 bg-charcoal px-2.5 text-xs font-medium text-ivory shadow-lg outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                                    >
                                      {!reservation.barberId && <option value="" disabled>Select barber…</option>}
                                      {barbers.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setEditingReservationId(null);
                                      }}
                                      title="Cancel editing"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-ivory-dim hover:bg-white/10 hover:text-ivory"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <div className="text-[10px] text-gold/80">Press Esc or ✕ to cancel</div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {reservation.barberId ? (
                                    <BarberColorPicker
                                      barberId={String(reservation.barberId)}
                                      barberName={barber?.name || 'Unassigned'}
                                      color={barberColor}
                                      allBarbers={barbers}
                                      getBarberColor={getBarberColor}
                                      onChange={(color) => handleBarberColorChange(String(reservation.barberId), color)}
                                      onResetDefault={() => handleResetBarberColor(String(reservation.barberId))}
                                    />
                                  ) : (
                                    <span className="h-3.5 w-3.5 rounded-full border border-white/20 bg-white/10 shrink-0" title="Unassigned barber" />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditingReservationId(reservation.id)}
                                    className="group/inline inline-flex items-center gap-1.5 text-left text-xs sm:text-sm text-ivory hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded-sm px-1 py-0.5 -mx-1 border-b border-dashed border-white/30 hover:border-gold/80 cursor-pointer"
                                    title="Click to reassign barber"
                                    aria-label={`Change barber for ${reservation.name}. Current: ${barber?.name || 'Unassigned'}`}
                                  >
                                    <span className="font-medium text-ivory group-hover/inline:text-gold">{barber?.name || 'Unassigned'}</span>
                                    <Pencil className="w-2.5 h-2.5 text-gold/70 group-hover/inline:text-gold transition-colors shrink-0" aria-hidden="true" />
                                  </button>
                                  {isBarberOnBreak(barber?.status) && <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">On Break{getBreakElapsedMinutes(barber, reservationClock) !== null ? ` · ${getBreakElapsedMinutes(barber, reservationClock)}m` : ''}</span>}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 align-middle">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${statusBadge.badgeClass}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`} />
                                    <span>{statusBadge.label}</span>
                                  </span>
                                  <span className="text-[11px] text-ivory-dim/70">
                                    {reservation.reservationFeePaid
                                      ? `• ₱${reservation.reservationFeeAmount ?? 50} deposit paid`
                                      : '• Deposit unpaid'}
                                  </span>
                                </div>

                                {reservation.servicePrice !== null && reservation.servicePrice !== undefined && (
                                  <div className="flex items-baseline gap-1.5 pt-0.5 text-xs">
                                    <span className="text-[11px] font-medium text-ivory-dim/80">To Pay:</span>
                                    <span className="font-mono text-sm font-bold text-gold tracking-wide">
                                      ₱{(Number(reservation.servicePrice) + (reservation.reservationFeePaid ? 0 : (reservation.reservationFeeAmount ?? 50))).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right align-middle whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {isExpired ? (
                                  <button type="button" onClick={() => void markNoShow(reservation.id)} className="inline-flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400">
                                    <X className="h-3.5 w-3.5" /> No Show
                                  </button>
                                ) : null}
                                {!isExpired && reservation.status === 'pending' && (
                                  <>
                                    {reservation.proofImageUrl && (
                                      <button
                                        type="button"
                                        onClick={() => setMaximizedPhotoUrl(reservation.proofImageUrl || null)}
                                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-sm border border-gold/30 bg-gold/10 text-gold hover:bg-gold/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                        title="View Payment Proof Receipt"
                                        aria-label="View Payment Proof Receipt"
                                      >
                                        <Maximize2 className="w-3.5 h-3.5" />
                                        <span>Receipt</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setAcceptTarget(reservation)}
                                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-sm bg-gold text-charcoal font-semibold hover:bg-gold-dim transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold active:scale-95"
                                      title="Verify & Confirm Reservation"
                                      aria-label="Verify & Confirm Reservation"
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                                      <span>Verify</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => triggerDecline(reservation)}
                                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:text-red-200 hover:bg-red-500/15 hover:border-red-500/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 active:scale-95"
                                      title="Decline Reservation"
                                      aria-label="Decline Reservation"
                                    >
                                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>Decline</span>
                                    </button>
                                  </>
                                )}
                                {!isExpired && isConfirmed && (
                                  <>
                                    {isAllGroupGuestsProcessed ? (
                                      <span className="text-xs font-semibold text-ivory-dim/60 italic py-1 px-2.5 border border-white/10 rounded-sm bg-white/5">
                                        All guests processed
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        hidden={!isResCheckInEligible}
                                        disabled={!isResCheckInEligible}
                                        aria-disabled={!isResCheckInEligible}
                                        onClick={() => {
                                          if (!isResCheckInEligible) {
                                            addToast({
                                              type: 'info',
                                              title: 'Check In Locked',
                                              message: `Early check-in opens 10 minutes before the scheduled arrival time (${displayResTime}).`,
                                            });
                                            return;
                                          }
                                          void checkInReservation(reservation);
                                        }}
                                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-sm transition-all shadow-sm font-semibold ${
                                          isResCheckInEligible
                                            ? 'bg-gold text-charcoal hover:bg-gold-dim cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold active:scale-95'
                                            : 'bg-white/5 text-ivory-dim/40 border border-white/10 cursor-not-allowed opacity-75'
                                        }`}
                                        title={isResCheckInEligible ? (isGroupReservation ? `Check In remaining ${remainingGroupGuests.length} guests` : (isEarlyResCheckIn ? 'Early Check-In Customer' : 'Check In Customer')) : `Check In opens 10 minutes before ${displayResTime}`}
                                        aria-label={isResCheckInEligible ? (isGroupReservation ? `Check In remaining ${remainingGroupGuests.length} guests for ${reservation.name}` : `${isEarlyResCheckIn ? 'Early Check-In' : 'Check In'} ${reservation.name}`) : `Check In opens 10 minutes before ${displayResTime}`}
                                      >
                                        {!isResCheckInEligible ? (
                                          <Lock className="w-3.5 h-3.5 text-ivory-dim/40 shrink-0" aria-hidden="true" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                                        )}
                                        <span>{isGroupReservation ? `Check In All (${remainingGroupGuests.length})` : (isEarlyResCheckIn ? 'Early Check-In' : 'Check In')}</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => triggerDecline(reservation)}
                                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:text-red-200 hover:bg-red-500/15 hover:border-red-500/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 active:scale-95"
                                      title="Cancel Booking"
                                      aria-label="Cancel Booking"
                                    >
                                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>Cancel</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </>
              </fieldset>
            ) : reservationDataStatus === 'loading'
              || (reservationDataStatus === 'unavailable' && !showReservationConnectionNotice) ? (
              <div className="py-8 px-4 space-y-3" role="status" aria-label="Loading reservations">
                <div className="flex items-center gap-2 mb-4 text-xs text-ivory-dim">
                  <Loader2 className="h-4 w-4 animate-spin text-gold" />
                  <span>Loading reservation directory…</span>
                </div>
                <div className="space-y-2.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse flex items-center justify-between gap-4 rounded-sm border border-white/5 bg-white/[0.02] p-4">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-36 rounded bg-white/10" />
                        <div className="h-3 w-48 rounded bg-white/5" />
                      </div>
                      <div className="space-y-2 w-32 hidden sm:block">
                        <div className="h-4 w-24 rounded bg-white/10" />
                        <div className="h-3 w-20 rounded bg-white/5" />
                      </div>
                      <div className="h-8 w-24 rounded bg-white/10" />
                    </div>
                  ))}
                </div>
              </div>
            ) : reservationDataStatus === 'unavailable' ? (
              <div role="alert" className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/[0.06] text-amber-200">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-ivory">Reservations could not be verified</p>
                <p className="mt-1 text-xs text-ivory-dim">Reconnect and retry to load the current booking list.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 text-ivory-dim mb-3">
                  <CalendarDays className="h-6 w-6 text-gold/60" />
                </div>
                <p className="text-sm font-semibold text-ivory">
                  {reservationBarberFilter !== 'all' || reservationDateFilter !== 'all'
                    ? 'No reservations match these filters'
                    : reservationsFilter === 'all'
                    ? 'No upcoming reservations'
                    : `No reservations found for filter "${reservationsFilter === 'today' ? 'Today' : reservationsFilter === 'pending' ? 'Needs Review' : 'Confirmed'}"`}
                </p>
                <p className="mt-1 text-xs text-ivory-dim max-w-sm">
                  {reservationBarberFilter !== 'all' || reservationDateFilter !== 'all'
                    ? 'Try another barber or date, or clear the filters.'
                    : reservationsFilter === 'all'
                    ? 'There are no active reservations scheduled for today or a later date.'
                    : 'Try selecting another filter or add a manual reservation using the form above.'}
                </p>
                {(reservationsFilter !== 'all' || reservationBarberFilter !== 'all' || reservationDateFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => { setReservationsFilter('all'); setReservationBarberFilter('all'); setReservationDateFilter('all'); }}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                  >
                    <span>View All Upcoming</span>
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
        </section>
      )}

      {/* Confirm unusual manual reservation name */}
      <Modal
        isOpen={Boolean(manualNameConfirmation)}
        onClose={() => !manualSubmitting && setManualNameConfirmation(null)}
        title="Confirm Customer Name"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setManualNameConfirmation(null)} disabled={manualSubmitting}>
              Go Back
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!manualNameConfirmation) return;
                const confirmedName = manualNameConfirmation;
                setManualNameConfirmation(null);
                void submitManualReservation(undefined, confirmedName);
              }}
              disabled={manualSubmitting}
            >
              Continue with Name
            </Button>
          </>
        }
      >
        <p className="text-sm text-ivory">
          Are you sure you want to enter <span className="break-all font-bold text-gold">{manualNameConfirmation}</span> as the customer name?
        </p>
      </Modal>

      {/* Verify & Confirm Reservation Modal */}
      <Modal
        isOpen={!!acceptTarget}
        onClose={() => !isAccepting && setAcceptTarget(null)}
        title="Verify & Confirm Reservation"
        size="md"
        bodyClassName="p-4 sm:p-5 space-y-3.5 max-h-[calc(85vh-8rem)] overflow-y-auto custom-scrollbar"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
            <button
              type="button"
              disabled={isAccepting}
              className="w-full sm:w-auto h-10 px-4 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:border-red-500/60 hover:bg-red-500/10 text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap text-center"
              onClick={() => {
                const target = acceptTarget;
                setAcceptTarget(null);
                if (target) triggerDecline(target);
              }}
            >
              Decline
            </button>
            <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                disabled={isAccepting}
                className="flex-1 sm:flex-initial h-10 px-4 rounded-sm border border-white/10 bg-white/5 text-ivory hover:bg-white/10 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap text-center"
                onClick={() => setAcceptTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isAccepting}
                className="flex-1 sm:flex-initial h-10 px-5 rounded-sm bg-gold text-charcoal hover:bg-gold-dim text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-1.5"
                onClick={confirmAccept}
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <span>Accept & Confirm</span>
                )}
              </button>
            </div>
          </div>
        }
      >
        {acceptTarget && (
          <div className="space-y-3.5 text-xs sm:text-sm text-ivory">
            {/* Customer / Reservation Information */}
            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">Customer</span>
                <div className="text-base font-bold text-ivory mt-0.5 tracking-tight">{acceptTarget.name}</div>
                {(acceptTarget.phone || acceptTarget.email) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ivory-dim mt-1">
                    {acceptTarget.phone && <span>{acceptTarget.phone}</span>}
                    {acceptTarget.phone && acceptTarget.email && <span className="text-white/20">•</span>}
                    {acceptTarget.email && <span>{acceptTarget.email}</span>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/5 text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ivory-dim block">Schedule</span>
                  <div className="text-ivory font-medium">
                    {acceptTarget.date ? formatReservationDateConsistent(acceptTarget.date) : 'Today'} • {acceptTarget.time}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ivory-dim block">Service</span>
                  <div className="text-ivory font-medium truncate" title={acceptTarget.service}>
                    {acceptTarget.service}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ivory-dim block">Barber</span>
                  <div className="text-ivory font-medium">
                    {barberFor(acceptTarget.barberId)?.name || 'Unassigned'}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Proof / Receipt Attachment */}
            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Payment Proof</span>
                <span className="text-[11px] font-semibold text-gold">₱50 Reservation Fee</span>
              </div>

              {acceptTarget.referenceNumber && (
                <div className="flex items-center justify-between text-xs bg-black/30 p-2.5 rounded-sm border border-white/5">
                  <span className="text-ivory-dim">Payment Reference:</span>
                  <span className="font-mono font-bold text-gold">#{acceptTarget.referenceNumber}</span>
                </div>
              )}

              {acceptTarget.proofImageUrl ? (
                <div className="space-y-2">
                  {proofImageError ? (
                    <div className="rounded-sm border border-white/10 bg-black/30 p-6 flex flex-col items-center justify-center gap-2 text-center">
                      <ImageOff className="w-7 h-7 text-ivory-dim/40" />
                      <p className="text-xs text-ivory-dim font-medium">Proof preview unavailable</p>
                      <button
                        type="button"
                        onClick={() => setMaximizedPhotoUrl(acceptTarget.proofImageUrl || null)}
                        className="text-xs font-semibold text-gold hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        <Maximize2 className="w-3 h-3" /> Maximize / View Proof
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => setMaximizedPhotoUrl(acceptTarget.proofImageUrl || null)}
                      className="relative cursor-pointer overflow-hidden rounded-sm group/proof bg-black/50 border border-white/5 flex items-center justify-center min-h-[140px] max-h-48"
                    >
                      {!proofImageLoaded && !proofImageError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-ivory-dim text-xs gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-gold" />
                          <span>Loading proof preview…</span>
                        </div>
                      )}
                      <img
                        src={acceptTarget.proofImageUrl}
                        alt={`Payment proof for ${acceptTarget.name}`}
                        onLoad={() => setProofImageLoaded(true)}
                        onError={() => setProofImageError(true)}
                        className={`max-h-48 w-full object-contain rounded-sm transition-transform duration-200 group-hover/proof:scale-[1.02] ${
                          proofImageLoaded ? 'block' : 'opacity-0'
                        }`}
                      />
                      {proofImageLoaded && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/proof:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-gold text-xs font-bold pointer-events-none">
                          <Maximize2 className="w-4 h-4" /> Click to Maximize Photo
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-sm border border-white/10 bg-black/20 p-3 text-center text-xs text-ivory-dim">
                  No payment proof attachment uploaded for this reservation.
                </div>
              )}
            </div>

            {/* Confirmation Effect Callout */}
            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3 text-xs text-ivory-dim space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ivory/80">
                Confirmation Effect
              </div>
              <p className="text-xs text-ivory-dim">Accepting this reservation will:</p>
              <ul className="text-xs space-y-1 text-ivory-dim pl-4 list-disc">
                <li>Mark the ₱50 reservation fee as <span className="font-semibold text-emerald-400">Paid</span></li>
                <li>Send a confirmation notification to the customer</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* Maximized Photo Modal with Save Photo Button */}
      {maximizedPhotoUrl && (
        <Modal
          isOpen={Boolean(maximizedPhotoUrl)}
          onClose={() => setMaximizedPhotoUrl(null)}
          title="Payment Proof Screenshot"
          size="xl"
          headerExtra={
            <button
              type="button"
              onClick={() => {
                if (!maximizedPhotoUrl) return;
                const link = document.createElement('a');
                link.href = maximizedPhotoUrl;
                link.download = `receipt-${acceptTarget?.referenceNumber || 'payment-proof'}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 bg-gold hover:bg-gold-dim text-charcoal font-bold text-xs uppercase tracking-wider rounded-sm shadow-sm transition-all cursor-pointer mr-2 active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save Photo</span>
            </button>
          }
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-ivory-dim">
                Reference: <strong className="text-gold font-mono">{acceptTarget?.referenceNumber ? `#${acceptTarget.referenceNumber}` : 'None provided'}</strong>
              </span>
              <button
                type="button"
                className="h-10 px-4 rounded-sm border border-white/10 bg-white/5 text-ivory hover:bg-white/10 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                onClick={() => setMaximizedPhotoUrl(null)}
              >
                Close
              </button>
            </div>
          }
        >
          <div className="flex items-center justify-center min-h-[50vh] max-h-[75vh] overflow-auto bg-black/80 rounded-sm border border-white/10 p-3">
            <img
              src={maximizedPhotoUrl}
              alt="Maximized payment receipt proof"
              className="max-h-[70vh] w-auto max-w-full object-contain rounded-sm"
            />
          </div>
        </Modal>
      )}

      {/* Decline Reservation / Cancel Booking Modal */}
      <Modal
        isOpen={!!declineTarget}
        onClose={() => setDeclineTarget(null)}
        title={declineTarget?.status === 'pending' ? 'Decline Reservation' : (declineReason === 'Customer No-Show' ? 'Mark as No-Show' : 'Cancel Booking')}
        size="md"
        bodyClassName="p-4 sm:p-5 space-y-4 max-h-[calc(85vh-8rem)] overflow-y-auto custom-scrollbar"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              className="h-10 px-4 rounded-sm border border-white/10 bg-white/5 text-ivory hover:bg-white/10 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap text-center"
              onClick={() => setDeclineTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-10 px-5 rounded-sm border border-red-500/40 bg-red-500/[0.06] text-red-300 hover:border-red-500/70 hover:bg-red-500/15 text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer whitespace-nowrap text-center"
              onClick={confirmDecline}
            >
              {declineTarget?.status === 'pending' ? 'Confirm Rejection' : (declineReason === 'Customer No-Show' ? 'Confirm No-Show' : 'Confirm Cancellation')}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs sm:text-sm text-ivory">
          <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">Customer</span>
            <div className="text-base font-bold text-ivory">{declineTarget?.name}</div>
            {declineTarget?.service && (
              <div className="text-xs text-ivory-dim">
                {declineTarget.service} • {declineTarget.date ? formatReservationDateConsistent(declineTarget.date) : 'Today'} at {declineTarget.time}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
              Reason for {declineTarget?.status === 'pending' ? 'Declining' : 'Cancellation'}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {(declineTarget?.status === 'pending' ? [
                { id: 'Payment receipt invalid or missing', label: 'Payment receipt invalid or missing' },
                { id: 'Deposit amount mismatch', label: 'Deposit amount mismatch' },
                { id: 'Slot conflict or barber unavailable', label: 'Slot conflict or barber unavailable' },
                { id: 'Customer Requested Cancellation', label: 'Customer Requested Cancellation' },
                { id: 'Barber early out / unavailable', label: 'Barber early out / unavailable' },
                { id: 'Other', label: 'Other reason' },
              ] : [
                { id: 'Customer No-Show', label: 'Customer No-Show (Slot Missed)' },
                { id: 'Customer Requested Cancellation', label: 'Customer Requested Cancellation' },
                { id: 'Barber Emergency Break', label: 'Barber early out / unavailable' },
                { id: 'Other', label: 'Other reason' },
              ]).map(option => {
                const isSelected = declineReason === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDeclineReason(option.id)}
                    className={`h-11 px-3.5 rounded-sm border text-left text-xs sm:text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-gold/60 bg-gold/[0.08] text-gold shadow-sm'
                        : 'border-white/10 bg-white/[0.03] text-ivory-dim hover:border-white/20 hover:bg-white/[0.06] hover:text-ivory'
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && <span className="text-gold font-bold text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
              {declineReason === 'Other' ? 'Enter Reason' : 'Additional Notes (Optional)'}
            </label>
            <input
              type="text"
              value={customDeclineReason}
              onChange={event => setCustomDeclineReason(event.target.value)}
              placeholder={declineReason === 'Other' ? 'Please specify reason…' : 'Optional notes…'}
              className="h-10 w-full rounded-sm border border-white/15 bg-black/30 px-3 text-xs sm:text-sm text-ivory placeholder-white/30 outline-none focus:border-gold transition-colors"
            />
          </div>
        </div>
      </Modal>

      {/* Review Customer Payment Receipt Modal */}
      <Modal
        isOpen={!!paymentAttemptReviewTarget}
        onClose={closePaymentAttemptReview}
        title="Review Payment Receipt"
        size="lg"
        bodyClassName="p-4 sm:p-5 space-y-4 max-h-[calc(85vh-8rem)] overflow-y-auto custom-scrollbar"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
            <button
              type="button"
              disabled={paymentAttemptRejecting || paymentAttemptConfirming}
              className="w-full sm:w-auto h-10 px-4 rounded-sm border border-red-500/30 bg-red-500/[0.04] text-red-300 hover:border-red-500/60 hover:bg-red-500/10 text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap text-center"
              onClick={() => void rejectPaymentAttempt()}
            >
              {paymentAttemptRejecting ? 'Discarding…' : 'Discard Attempt'}
            </button>
            <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                disabled={paymentAttemptRejecting || paymentAttemptConfirming}
                className="flex-1 sm:flex-initial h-10 px-4 rounded-sm border border-white/10 bg-white/5 text-ivory hover:bg-white/10 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap text-center"
                onClick={closePaymentAttemptReview}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!paymentAttemptReceiptUrl || !paymentAttemptVerified || paymentAttemptReceiptLoading || paymentAttemptConfirming || paymentAttemptRejecting}
                className="flex-1 sm:flex-initial h-10 px-5 rounded-sm bg-gold text-charcoal hover:bg-gold-dim text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-1.5"
                onClick={() => void confirmPaymentAttempt()}
              >
                {paymentAttemptConfirming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                    <span>Confirming…</span>
                  </>
                ) : (
                  <span>Confirm Payment</span>
                )}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-xs sm:text-sm text-ivory">
          <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">Customer</span>
            <div className="text-base font-bold text-ivory">{paymentAttemptReviewTarget?.name}</div>
            <p className="text-xs text-ivory-dim">
              Review the saved receipt before recording payment. This action cannot be undone.
            </p>
          </div>

          {paymentAttemptReceiptLoading && (
            <div className="rounded-sm border border-white/10 bg-white/5 p-4 text-xs text-ivory-dim flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-gold" />
              <span>Loading saved receipt…</span>
            </div>
          )}

          {paymentAttemptReceiptUrl && (
            <div className="rounded-sm border border-white/10 bg-black/40 p-3 flex items-center justify-center min-h-[16rem]">
              <img
                src={paymentAttemptReceiptUrl}
                alt={`Payment receipt for ${paymentAttemptReviewTarget?.name || 'customer'}`}
                className="max-h-[60vh] w-full object-contain rounded-sm"
                onError={() => {
                  setPaymentAttemptReceiptUrl(null);
                  setPaymentAttemptReviewError('The saved receipt could not be displayed. Please try again.');
                }}
              />
            </div>
          )}

          {paymentAttemptReviewError && (
            <div role="alert" className="rounded-sm border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
              {paymentAttemptReviewError}
            </div>
          )}

          {paymentAttemptReceiptUrl && (
            <label className="flex items-start gap-3 rounded-sm border border-gold/30 bg-gold/[0.05] p-3.5 text-xs text-ivory cursor-pointer select-none">
              <input
                type="checkbox"
                checked={paymentAttemptVerified}
                onChange={event => setPaymentAttemptVerified(event.target.checked)}
                className="mt-0.5 accent-[#d4a017] cursor-pointer"
              />
              <span>I verified the receipt amount, merchant, date, and reference before confirming this payment.</span>
            </label>
          )}
        </div>
      </Modal>

      <QueuePaymentModal
        isOpen={paymentModalOpen}
        queueId={paymentTargetId}
        customerName={queue.find(customer => customer.id === paymentTargetId)?.name || null}
        quote={paymentQuote}
        quoteLoading={paymentQuoteLoading}
        quoteError={paymentQuoteError}
        onRetryQuote={() => {
          if (completionRetryRef.current) void markDone(completionRetryRef.current);
          else if (paymentTargetId) void loadPaymentQuote(paymentTargetId);
        }}
        onClose={closePaymentModal}
        onSubmit={submitPayment}
      />
      <FinalizedReceiptModal receipt={finalizedReceipt} onClose={() => setFinalizedReceipt(null)} />
    </div>
  );
}

export default function ReservationsTab() {
  return <ReservationsTabContent />;
}
