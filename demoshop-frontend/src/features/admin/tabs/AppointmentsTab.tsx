import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  Search,
  Check,
  X,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  Scissors,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  List,
  RefreshCw,
  SlidersHorizontal,
  RotateCcw,
  Tag,
  User,
  ArrowUpDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppointmentRecord, AppointmentCounts } from '@demoshop/shared-types';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';
import { Modal } from '@/components/feedback/Modal';
import { appointmentApiService } from '@/features/admin/services/appointment.service';
import { getManilaDateIso } from '@/utils/manila-date';
import { useToast } from '@/components/feedback/ToastContext';
import { useAuth } from '@/components/auth/AuthContext';
import { reservationDate } from './reservation-filters';
import { DatePicker } from '@/components/ui/DatePicker';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';
import { groupAppointmentRecords, type GroupedAppointmentRecord } from '../utils/appointment-groups';

type TabType = 'needs_approval' | 'today' | 'upcoming' | 'overdue' | 'history';

function formatHistoryCardDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const targetDate = new Date(`${dateStr}T00:00:00+08:00`);
  if (isNaN(targetDate.getTime())) return dateStr;
  return targetDate.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getReservationOriginLabel(appointment: AppointmentRecord): 'Booked in app' | 'Entered by cashier' {
  return appointment.customer_id || appointment.customer_int_id ? 'Booked in app' : 'Entered by cashier';
}

function getReservationOriginClass(appointment: AppointmentRecord): string {
  return getReservationOriginLabel(appointment) === 'Booked in app'
    ? 'border-gold/30 bg-gold/10 text-gold'
    : 'border-sky-400/30 bg-sky-400/10 text-sky-300';
}

function getCardStatusBorderClass(statusStr: string = '', isOverdue: boolean = false) {
  if (isOverdue) return 'border-amber-500/40 bg-amber-500/[0.03]';
  const s = statusStr.toUpperCase().trim();
  if (['PENDING'].includes(s)) return 'border-amber-500/40 bg-amber-500/[0.02]';
  if (['CONFIRMED', 'SCHEDULED'].includes(s)) return 'border-emerald-500/40 bg-emerald-500/[0.02]';
  if (['COMPLETED', 'DONE'].includes(s)) return 'border-emerald-700/30 bg-emerald-950/[0.05]';
  if (['CANCELLED', 'CANCELED'].includes(s)) return 'border-zinc-700/40 bg-zinc-900/[0.1]';
  if (['DECLINED', 'REJECTED'].includes(s)) return 'border-rose-500/40 bg-rose-500/[0.02]';
  if (s === 'NO_SHOW') return 'border-orange-700/40 bg-orange-950/[0.05]';
  if (s === 'EXPIRED') return 'border-zinc-700/30 bg-zinc-900/[0.05]';
  return 'border-gold/30 hover:border-gold/50';
}

function renderHistoryStatusStamp(statusStr: string = '', isOverdue: boolean = false) {
  const s = statusStr.toUpperCase().trim();
  if (isOverdue && !['COMPLETED', 'DONE', 'CANCELLED', 'CANCELED', 'NO_SHOW', 'DECLINED', 'REJECTED', 'EXPIRED'].includes(s)) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
        <AlertTriangle className="w-3 h-3" />
        <span>Needs Resolution</span>
      </div>
    );
  }
  if (s === 'PENDING') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
        <Clock className="w-3 h-3" />
        <span>Needs Approval</span>
      </div>
    );
  }
  if (s === 'CONFIRMED' || s === 'SCHEDULED') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
        <Check className="w-3 h-3 text-emerald-400" />
        <span>Confirmed</span>
      </div>
    );
  }
  if (s === 'COMPLETED' || s === 'DONE') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
        <CheckCircle className="w-3 h-3 text-emerald-400" />
        <span>Completed</span>
      </div>
    );
  }
  if (s === 'DECLINED' || s === 'REJECTED') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-500/15 border border-rose-500/40 text-rose-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
        <X className="w-3 h-3" />
        <span>Declined</span>
      </div>
    );
  }
  if (s === 'NO_SHOW') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-orange-950/40 border border-orange-800/40 text-orange-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
        <AlertCircle className="w-3 h-3" />
        <span>No Show</span>
      </div>
    );
  }
  if (s === 'CANCELLED' || s === 'CANCELED') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
        <AlertCircle className="w-3 h-3" />
        <span>Cancelled</span>
      </div>
    );
  }
  if (s === 'EXPIRED') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-zinc-800/40 border border-zinc-700/40 text-zinc-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
        <Clock className="w-3 h-3" />
        <span>Expired</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-500/15 border border-blue-500/40 text-blue-400 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full shadow-xs">
      <Clock className="w-3 h-3 text-blue-400" />
      <span>{s.replaceAll('_', ' ') || 'UPCOMING'}</span>
    </div>
  );
}

function getPaymentDetails(appt: AppointmentRecord) {
  const rawMethod = (appt.payment_method || (appt as any).payment_provider || '').trim();
  const lowerMethod = rawMethod.toLowerCase();

  let provider: string | null = null;
  let providerId = 'unknown';
  let providerClass = 'border-white/10 bg-white/5 text-ivory';

  if (lowerMethod.includes('gcash')) {
    provider = 'GCash';
    providerId = 'gcash';
    providerClass = 'border-blue-400/40 bg-blue-500/15 text-blue-300';
  } else if (lowerMethod.includes('maya') || lowerMethod.includes('paymaya')) {
    provider = 'Maya';
    providerId = 'maya';
    providerClass = 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300';
  } else if (lowerMethod.includes('maribank') || lowerMethod.includes('seabank')) {
    provider = 'MariBank';
    providerId = 'maribank';
    providerClass = 'border-orange-400/40 bg-orange-500/15 text-orange-300';
  } else if (lowerMethod.includes('gotyme')) {
    provider = 'GoTyme';
    providerId = 'gotyme';
    providerClass = 'border-cyan-300/40 bg-cyan-400/15 text-cyan-200';
  } else if (lowerMethod.includes('cash')) {
    provider = 'Cash';
    providerId = 'cash';
  } else if (lowerMethod.includes('qrph') || lowerMethod.includes('qr ph')) {
    provider = 'QRPH';
    providerId = 'qrph';
  } else if (rawMethod) {
    provider = rawMethod;
    providerId = rawMethod.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const depositAmount = (appt as any).deposit_amount ?? (appt as any).reservation_fee_amount ?? 50;
  const hasReceipt = Boolean(appt.proof_image_url);
  const hasRef = Boolean(appt.reference_number);

  const isPaid = (appt as any).payment_status === 'verified' ||
                 (appt as any).payment_status === 'paid' ||
                 (appt as any).payment_status === 'completed' ||
                 appt.reservation_fee_paid === true;

  const isVerified = Boolean(
    isPaid || (
      appt.recipient_identifier_detected &&
      (appt as any).recipient_matches_account !== false
    )
  );

  const isFlagged = Boolean(appt.proof_image_url && !isVerified);

  const isWalkIn = (appt as any).booking_channel === 'walk_in' || (appt as any).is_walk_in === true;
  const reservationOrigin = getReservationOriginLabel(appt);
  const bookingChannelLabel = reservationOrigin === 'Entered by cashier'
    ? 'Entered by cashier'
    : isWalkIn ? 'Walk-in Reservation' : 'Booked in app';

  let depositBadgeLabel = 'Payment Method Unavailable';
  let depositBadgeType: 'verified' | 'review' | 'required' | 'none' | 'unavailable' = 'unavailable';

  if (isWalkIn && !hasReceipt && !hasRef) {
    depositBadgeLabel = 'No Deposit Required';
    depositBadgeType = 'none';
  } else if (provider) {
    if (isVerified) {
      depositBadgeLabel = 'Deposit Verified / Paid';
      depositBadgeType = 'verified';
    } else if (hasReceipt) {
      depositBadgeLabel = 'Awaiting Verification';
      depositBadgeType = 'review';
    } else {
      depositBadgeLabel = 'Deposit Required';
      depositBadgeType = 'required';
    }
  } else {
    depositBadgeLabel = 'Payment Method Unavailable';
    depositBadgeType = 'unavailable';
  }

  return {
    provider: provider || 'Payment Method Unavailable',
    hasRecordedProvider: Boolean(provider),
    providerId,
    providerClass,
    depositAmount,
    hasReceipt,
    hasRef,
    isVerified,
    isFlagged,
    isWalkIn,
    bookingChannelLabel,
    depositBadgeLabel,
    depositBadgeType,
  };
}

function GroupAppointmentDetails({ entries }: { entries?: AppointmentRecord[] }) {
  if (!entries || entries.length < 2) return null;

  return (
    <div className="md:col-span-3 rounded-sm border border-gold/20 bg-gold/[0.04] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gold">GROUP GUESTS</p>
      <div className="mt-2 divide-y divide-white/10">
        {entries.map((entry, index) => (
          <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-ivory font-semibold">Guest {index + 1} · {entry.service_title || 'Service'}</p>
              <p className="text-ivory-dim mt-0.5">{entry.barber_name || 'Unassigned Barber'} · {entry.scheduled_time || 'Time not set'}</p>
            </div>
            <span className="text-gold font-mono">₱{Number(entry.service_price || 0).toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface AppointmentsTabProps {
  onNavigateSubTab?: (subTab: string) => void;
  onNavigateTab?: (tab: string, subTab?: string, extraParams?: Record<string, string>) => void;
  embedded?: boolean;
  startDate?: string;
  endDate?: string;
}

export const AppointmentsTab: React.FC<AppointmentsTabProps> = ({
  onNavigateSubTab,
  onNavigateTab,
  embedded = false,
  startDate,
  endDate,
}) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const tabParam = searchParams.get('subtab') || searchParams.get('filter');
    if (embedded) {
      if (tabParam === 'overdue' || tabParam === 'needs_resolution') return 'overdue';
      return 'history';
    }
    if (tabParam === 'today') return 'today';
    if (tabParam === 'upcoming') return 'upcoming';
    if (tabParam === 'needs_approval') return 'needs_approval';
    return 'upcoming';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [statusFilter, setStatusFilter] = useState('');
  const [barberFilter, setBarberFilter] = useState('');
  const [reservationDateFilter, setReservationDateFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>(embedded ? 'newest' : 'oldest');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [appointments, setAppointments] = useState<GroupedAppointmentRecord[]>([]);
  const [counts, setCounts] = useState<AppointmentCounts>({ all: 0, upcoming: 0, completed: 0, cancelled_no_show: 0 });
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [staffNames, setStaffNames] = useState<Array<{ id: number; name: string }>>([]);
  const requestIdRef = useRef(0);
  const ITEMS_PER_PAGE = 10;
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Receipt Preview Modal
  const [receiptModalAppt, setReceiptModalAppt] = useState<AppointmentRecord | null>(null);

  // Decline Reason Modal
  const [declineTarget, setDeclineTarget] = useState<AppointmentRecord | null>(null);
  const [declineReason, setDeclineReason] = useState('Payment receipt invalid or missing');
  const [customDeclineReason, setCustomDeclineReason] = useState('');
  const [isSubmittingDecline, setIsSubmittingDecline] = useState(false);

  // Approve Confirmation Modal
  const [approveTarget, setApproveTarget] = useState<AppointmentRecord | null>(null);
  const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);

  // Resolve (No-Show / Cancel) Modal for Overdue or Confirmed Reservations
  const [resolveTarget, setResolveTarget] = useState<AppointmentRecord | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'NO_SHOW' | 'CANCELLED'>('NO_SHOW');
  const [resolveReason, setResolveReason] = useState('Customer did not arrive for scheduled slot');
  const [customResolveReason, setCustomResolveReason] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

  const todayIso = getManilaDateIso();

  // Fetch all active appointments
  const fetchAppointments = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setIsLoading(true);
    try {
      const chosenBarber = staffNames.find((barber) => barber.name === barberFilter);
      const response = await appointmentApiService.getAppointments({
        scope: embedded ? (activeTab === 'overdue' ? 'active' : 'history') : 'active',
        view: activeTab === 'today' || activeTab === 'overdue' ? activeTab : undefined,
        origin: embedded ? undefined : 'in_app',
        status: activeTab === 'needs_approval' ? 'PENDING' : statusFilter || 'ALL',
        search: searchQuery.trim() || undefined,
        barberId: chosenBarber?.id,
        startDate: embedded ? startDate : reservationDateFilter || undefined,
        endDate: embedded ? endDate : reservationDateFilter || undefined,
        sort: sortOrder,
        page: currentPage,
        limit: ITEMS_PER_PAGE,
      });
      if (requestId !== requestIdRef.current) return;
      setAppointments(groupAppointmentRecords(response.appointments || []));
      setCounts(response.counts);
      setTotalRecords(response.pagination.total);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      console.error('[AppointmentsTab] Failed to fetch:', err);
      addToast({
        type: 'error',
        title: 'Failed to load reservations',
        message: err?.response?.data?.error || err?.message || 'Error fetching reservations.',
      });
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [addToast, embedded, activeTab, statusFilter, searchQuery, barberFilter, staffNames, startDate, endDate, reservationDateFilter, sortOrder, currentPage]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchAppointments(), 200);
    return () => { clearTimeout(timer); requestIdRef.current++; };
  }, [fetchAppointments]);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/admin/staff').then((response) => {
      if (cancelled) return;
      const staff = response.data?.staff || response.data || [];
      setStaffNames(staff.filter((member: any) => member.barber_id).map((member: any) => ({
        id: Number(member.barber_id), name: member.name || member.username || 'Barber',
      })));
    }).catch(() => { /* Existing records remain accessible if staff lookup fails. */ });
    return () => { cancelled = true; };
  }, []);

  // Real-time synchronization
  const fetchAppointmentsRef = useRef(fetchAppointments);
  useEffect(() => {
    fetchAppointmentsRef.current = fetchAppointments;
  }, [fetchAppointments]);

  useEffect(() => {
    let realtimeDebounce: ReturnType<typeof setTimeout> | null = null;

    const triggerDebouncedFetch = () => {
      if (realtimeDebounce) clearTimeout(realtimeDebounce);
      realtimeDebounce = setTimeout(() => {
        void fetchAppointmentsRef.current(true);
      }, 350);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerDebouncedFetch();
      }
    };
    const handleWindowFocus = () => triggerDebouncedFetch();

    const localEvents = ['demoshop:reservations-changed', 'demoshop:appointments-changed'];
    localEvents.forEach((evt) => window.addEventListener(evt, triggerDebouncedFetch));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    const realtimeGroup = createHasuraFallbackGroup({
      onFallbackActivate: triggerDebouncedFetch,
      onBothUnavailable: triggerDebouncedFetch,
      degradedIntervalMs: 60_000,
    });
    realtimeGroup.subscribe(
      `subscription WatchAdminAppointmentChanges {
         appointments_aggregate {
           aggregate {
             max {
               updated_at
             }
           }
         }
       }`,
      undefined,
      () => triggerDebouncedFetch(),
      (error) => console.warn('[AppointmentsTab] Hasura appointment subscription error:', error),
      {
        subscribeFallback: (onStatus) => {
          const channel = supabase
            .channel('admin-appointments-appointment-fallback')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, triggerDebouncedFetch)
            .subscribe(onStatus);
          return () => { void supabase.removeChannel(channel); };
        },
      },
    );
    realtimeGroup.subscribe(
      `subscription WatchAdminQueueEntryChanges {
         queue_entries(limit: 1) {
           __typename
         }
       }`,
      undefined,
      () => triggerDebouncedFetch(),
      (error) => console.warn('[AppointmentsTab] Hasura queue subscription error:', error),
      {
        subscribeFallback: (onStatus) => {
          const channel = supabase
            .channel('admin-appointments-queue-fallback')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, triggerDebouncedFetch)
            .subscribe(onStatus);
          return () => { void supabase.removeChannel(channel); };
        },
      },
    );

    return () => {
      localEvents.forEach((evt) => window.removeEventListener(evt, triggerDebouncedFetch));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      if (realtimeDebounce) clearTimeout(realtimeDebounce);
      realtimeGroup.cleanup();
    };
  }, []);

  // Lifecycle membership, filters, totals, and pagination come from the API.
  useEffect(() => {
    if (embedded || searchQuery.trim() || barberFilter) return;
    window.dispatchEvent(new CustomEvent('demoshop:appointments-changed', {
      detail: { pendingAppointments: counts.pending || 0 },
    }));
  }, [counts.pending, embedded, searchQuery, barberFilter]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedRowId(null);
  }, [activeTab, searchQuery, statusFilter, barberFilter, sortOrder, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / ITEMS_PER_PAGE));
  const visiblePage = Math.min(currentPage, totalPages);
  useEffect(() => setCurrentPage((page) => Math.min(page, totalPages)), [totalPages]);
  const startIndex = (visiblePage - 1) * ITEMS_PER_PAGE;
  const paginatedAppointments = appointments;

  // Execute Approve handler
  const handleExecuteApprove = useCallback(
    async () => {
      if (!approveTarget) return;
      setIsSubmittingApprove(true);
      try {
        await appointmentApiService.confirmAppointment(approveTarget.id);
        addToast({
          type: 'success',
          title: 'Reservation Approved',
          message: `Booking for ${approveTarget.customer_name} confirmed.`,
        });
        void fetchAppointments(true);
        window.dispatchEvent(new CustomEvent('demoshop:appointments-changed'));
        window.dispatchEvent(new CustomEvent('demoshop:reservations-changed'));
        if (receiptModalAppt?.id === approveTarget.id) setReceiptModalAppt(null);
        setApproveTarget(null);
      } catch (err: any) {
        addToast({
          type: 'error',
          title: 'Approval Failed',
          message: err?.response?.data?.error || err?.message || 'Failed to approve reservation.',
        });
      } finally {
        setIsSubmittingApprove(false);
      }
    },
    [approveTarget, addToast, fetchAppointments, receiptModalAppt]
  );

  // Decline / Reject handler
  const handleConfirmDecline = useCallback(async () => {
    if (!declineTarget) return;
    setIsSubmittingDecline(true);
    const finalReason = declineReason === 'Other' ? customDeclineReason.trim() : declineReason;
    try {
      await appointmentApiService.declineAppointment(declineTarget.id, { reason: finalReason });
      addToast({
        type: 'info',
        title: 'Reservation Rejected',
        message: `Rejected reservation for ${declineTarget.customer_name}.`,
      });
      void fetchAppointments(true);
      window.dispatchEvent(new CustomEvent('demoshop:appointments-changed'));
      window.dispatchEvent(new CustomEvent('demoshop:reservations-changed'));
      setDeclineTarget(null);
      if (receiptModalAppt?.id === declineTarget.id) setReceiptModalAppt(null);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Rejection Failed',
        message: err?.response?.data?.error || err?.message || 'Failed to decline reservation.',
      });
    } finally {
      setIsSubmittingDecline(false);
    }
  }, [declineTarget, declineReason, customDeclineReason, addToast, fetchAppointments, receiptModalAppt]);

  // Resolve (No-Show / Cancel) handler
  const handleResolveSubmit = useCallback(async () => {
    if (!resolveTarget) return;
    const finalReason = resolveReason === 'Other' ? customResolveReason.trim() : resolveReason;
    if (resolveReason === 'Other' && finalReason.length < 3) {
      addToast({
        type: 'error',
        title: 'Invalid Reason',
        message: 'Please provide at least 3 characters for the resolution reason.',
      });
      return;
    }

    setIsSubmittingResolve(true);
    try {
      await appointmentApiService.cancelAppointment(resolveTarget.id, {
        appointmentId: resolveTarget.id,
        status: resolveStatus,
        cancellation_reason: finalReason,
        other_notes: resolveNotes.trim() || undefined,
      });

      addToast({
        type: 'success',
        title: 'Reservation Resolved',
        message: `Reservation successfully marked as ${resolveStatus === 'NO_SHOW' ? 'No-Show' : 'Cancelled'}.`,
      });

      void fetchAppointments(true);
      window.dispatchEvent(new CustomEvent('demoshop:appointments-changed'));
      window.dispatchEvent(new CustomEvent('demoshop:reservations-changed'));
      setResolveTarget(null);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Resolution Failed',
        message: err?.response?.data?.error || err?.message || 'Failed to resolve reservation.',
      });
    } finally {
      setIsSubmittingResolve(false);
    }
  }, [resolveTarget, resolveStatus, resolveReason, customResolveReason, resolveNotes, addToast, fetchAppointments]);

  const handleNavigateToHistory = useCallback((filter?: string) => {
    if (onNavigateTab) {
      onNavigateTab('reports', 'appointments', filter ? { filter } : undefined);
    } else if (onNavigateSubTab) {
      onNavigateSubTab('appointments');
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'reports');
        next.set('subtab', 'appointments');
        if (filter) next.set('filter', filter);
        return next;
      });
    }
  }, [onNavigateTab, onNavigateSubTab, setSearchParams]);

  useEffect(() => {
    const tabParam = searchParams.get('subtab') || searchParams.get('filter');
    if (embedded) {
      if (tabParam === 'overdue' || tabParam === 'needs_resolution') {
        setActiveTab('overdue');
      } else if (tabParam === 'history' || tabParam === 'appointments' || !tabParam) {
        setActiveTab('history');
      }
    } else {
      if (tabParam === 'today') setActiveTab('today');
      else if (tabParam === 'needs_approval') setActiveTab('needs_approval');
      else if (tabParam === 'upcoming') setActiveTab('upcoming');
    }
  }, [searchParams, embedded]);

  const toggleExpand = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const pendingCount = counts.pending || 0;
  const currentBranchName = appointments[0]?.branch_name || (user as any)?.branch_name || 'SampleBranch Branch';

  const formattedHeaderDate = useMemo(() => {
    const d = new Date(`${todayIso}T00:00:00+08:00`);
    return d.toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }, [todayIso]);

  const tabs: Array<{ id: TabType; label: string; count: number }> = embedded
    ? [
        { id: 'history', label: 'All History', count: counts.history || counts.all },
        { id: 'overdue', label: 'Overdue / Resolved', count: (counts.overdue || 0) + (counts.cancelled_no_show || 0) },
      ]
    : [
        { id: 'upcoming', label: 'Upcoming / Active', count: counts.upcoming },
        { id: 'needs_approval', label: 'Needs approval', count: counts.pending || 0 },
        { id: 'today', label: 'Today', count: counts.today || 0 },
      ];
  const statusOptions = embedded
    ? activeTab === 'overdue'
      ? ['CONFIRMED', 'SCHEDULED', 'CANCELLED', 'CANCELED', 'NO_SHOW']
      : ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED', 'DECLINED', 'REJECTED', 'DONE', 'CANCELED']
    : ['PENDING', 'CONFIRMED', 'SCHEDULED'];


  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (statusFilter && activeTab !== 'needs_approval') count++;
    if (barberFilter) count++;
    if (!embedded && reservationDateFilter) count++;
    return count;
  }, [searchQuery, statusFilter, activeTab, barberFilter, embedded, reservationDateFilter]);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('');
    setBarberFilter('');
    setReservationDateFilter('');
    setSortOrder(embedded ? 'newest' : 'oldest');
    setCurrentPage(1);
  }, [embedded]);

  return (
    <div className="space-y-5 text-ivory pb-20 md:pb-6 w-full min-w-0">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
            {embedded ? 'Reservation History' : 'Reservations'}
          </h1>
          <p className="text-xs text-ivory-dim/70 mt-1">
            {formattedHeaderDate} · {currentBranchName}
          </p>
        </div>
        {!embedded && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigateToHistory()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold text-xs font-semibold transition-colors cursor-pointer"
              title="Open finalized reservations under Reports & Audits"
            >
              <span>Reservation History</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <div className="text-xs font-medium">
              {pendingCount > 0 ? (
                <span className="text-gold font-semibold">
                  {pendingCount} <span className="text-ivory-dim/80">waiting for approval</span>
                </span>
              ) : (
                <span className="text-ivory-dim/60">0 waiting for approval</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Subtab Navigation (Upcoming / Active, Needs approval, Today, Overdue / History) */}
      <div className="border-b border-white/10">
        <nav className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none" aria-label="Reservation tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'today') setReservationDateFilter('');
                  setExpandedRowId(null);
                  setStatusFilter('');
                  setBarberFilter('');
                  setCurrentPage(1);
                }}
                className={`pb-2.5 text-xs sm:text-sm font-semibold transition-all relative cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  isActive ? 'text-ivory' : 'text-ivory-dim/70 hover:text-ivory'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === 'needs_approval' && tab.count > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                    {tab.count}
                  </span>
                ) : tab.id === 'overdue' && tab.count > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 font-mono">
                    {tab.count}
                  </span>
                ) : (
                  <span
                    className={`text-xs font-mono ${
                      isActive ? 'text-gold' : 'text-ivory-dim/50'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Informational banners for Overdue / Needs Resolution */}
      {!embedded && (counts.overdue || 0) > 0 && (
        <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>{counts.overdue} overdue unresolved reservation(s)</strong> require action. Their scheduled slot has passed without check-in.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleNavigateToHistory('overdue')}
            className="shrink-0 px-3 py-1.5 rounded-sm bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>Review in Needs Resolution</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {embedded && activeTab === 'overdue' && (
        <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4 flex items-center gap-2.5 text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            These reservations passed their scheduled time. Review unresolved bookings and recorded outcomes such as <strong>Cancelled</strong> or <strong>No-Show</strong> below.
          </span>
        </div>
      )}

      {/* Reservation Directory & Filter Toolbar */}
      <section aria-label="Reservation search and filters" className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden card-gold-accent shadow-md">
        {/* Directory Bar: Title, Count, View Mode Switcher, Refresh */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-white/5 bg-white/[0.02] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-gold" />
            <h2 className="font-serif font-bold text-ivory text-sm sm:text-base">Reservation Directory</h2>
            <span role="status" className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase text-gold bg-gold/10 border border-gold/20">
              {totalRecords} of {counts.all}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Reservation view" className="flex bg-charcoal border border-white/10 rounded-sm p-0.5">
              {(['table', 'cards'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs text-xs font-semibold cursor-pointer transition-colors ${
                    viewMode === mode ? 'bg-gold text-charcoal shadow-sm' : 'text-ivory-dim hover:text-gold'
                  }`}
                >
                  {mode === 'table' ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{mode === 'table' ? 'Table' : 'Cards'}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void fetchAppointments()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/10 bg-charcoal rounded-sm text-xs font-semibold text-ivory-dim hover:text-gold disabled:opacity-50 cursor-pointer transition-colors"
              title="Refresh reservations"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Body */}
        <div className="p-4 sm:p-5 space-y-3">
          {/* Primary Row: Search Bar, Filters Drawer Toggle, Reset */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-ivory-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search reservations"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search customer, mobile, barber, service, or reference..."
                className="min-h-[42px] w-full bg-charcoal border border-white/10 pl-10 pr-9 py-2 text-xs text-ivory placeholder-ivory-dim/50 focus:border-gold focus:outline-none rounded-sm transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory transition-colors p-0.5 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Action Buttons: Filters Toggle & Reset */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsFiltersOpen((prev) => !prev)}
                className={`min-h-[42px] px-3.5 py-2 flex items-center gap-2 text-xs font-semibold border rounded-sm transition-all cursor-pointer ${
                  isFiltersOpen || (activeFilterCount > (searchQuery.trim() ? 1 : 0))
                    ? 'bg-gold/15 text-gold border-gold/40'
                    : 'bg-charcoal border-white/10 text-ivory-dim hover:text-ivory hover:border-white/20'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-gold" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="bg-gold text-charcoal text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isFiltersOpen ? 'rotate-180 text-gold' : 'text-ivory-dim'
                  }`}
                />
              </button>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="min-h-[42px] px-3 py-2 flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-sm transition-all cursor-pointer"
                  title="Reset all filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>
          </div>

          {!embedded && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ivory-dim">Reservation date</span>
              <DatePicker
                value={reservationDateFilter}
                onChange={(date) => {
                  setReservationDateFilter(date);
                  setCurrentPage(1);
                  setExpandedRowId(null);
                  if (activeTab === 'today') setActiveTab('upcoming');
                }}
              />
            </div>
          )}

          {/* Collapsible Refinement Drawer (Status, Barber, Sort) */}
          <AnimatePresence>
            {isFiltersOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
              >
                {/* Status Filter */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                    <Tag className="w-3 h-3 text-gold" />
                    Status
                  </label>
                  <div className="relative">
                    <select
                      aria-label="Filter reservation status"
                      disabled={activeTab === 'needs_approval'}
                      value={statusFilter}
                      onChange={(event) => {
                        setStatusFilter(event.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full appearance-none bg-charcoal border border-white/10 px-3 py-2 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none cursor-pointer pr-8 disabled:opacity-50 [color-scheme:dark]"
                    >
                      <option value="" className="bg-charcoal text-ivory">All statuses</option>
                      {statusOptions.map((status) => (
                        <option key={status} value={status} className="bg-charcoal text-ivory">
                          {status.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-ivory-dim absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {activeTab === 'needs_approval' && (
                    <p className="text-[10px] text-ivory-dim/60">Fixed to Pending for Needs Approval</p>
                  )}
                </div>

                {/* Barber / Assigned Staff Filter */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                    <User className="w-3 h-3 text-gold" />
                    Barber / Staff
                  </label>
                  <div className="relative">
                    <select
                      aria-label="Filter reservation barber"
                      value={barberFilter}
                      onChange={(event) => {
                        setBarberFilter(event.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full appearance-none bg-charcoal border border-white/10 px-3 py-2 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none cursor-pointer pr-8 [color-scheme:dark]"
                    >
                      <option value="" className="bg-charcoal text-ivory">All barbers</option>
                      {staffNames.map((barber) => (
                        <option key={barber.id} value={barber.name} className="bg-charcoal text-ivory">
                          {barber.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-ivory-dim absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Sort Order */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                    <ArrowUpDown className="w-3 h-3 text-gold" />
                    Sort Order
                  </label>
                  <div className="relative">
                    <select
                      aria-label="Sort reservations"
                      value={sortOrder}
                      onChange={(event) => {
                        setSortOrder(event.target.value as 'newest' | 'oldest');
                        setCurrentPage(1);
                      }}
                      className="w-full appearance-none bg-charcoal border border-white/10 px-3 py-2 text-xs text-ivory rounded-sm focus:border-gold focus:outline-none cursor-pointer pr-8 [color-scheme:dark]"
                    >
                      <option value="newest" className="bg-charcoal text-ivory">Latest scheduled first</option>
                      <option value="oldest" className="bg-charcoal text-ivory">Earliest scheduled first</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-ivory-dim absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Active Filter Chips */}
          {activeFilterCount > 0 && (
            <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-ivory-dim font-semibold mr-1">Active filters:</span>
              {!embedded && reservationDateFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-gold/10 border border-gold/30 text-gold text-xs">
                  Date: {reservationDateFilter}
                  <button
                    type="button"
                    onClick={() => { setReservationDateFilter(''); setCurrentPage(1); }}
                    className="hover:text-ivory ml-0.5 cursor-pointer"
                    aria-label="Clear reservation date filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {searchQuery.trim() && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-gold/10 border border-gold/30 text-gold text-xs">
                  Search: "{searchQuery.trim()}"
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="hover:text-ivory ml-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {statusFilter && activeTab !== 'needs_approval' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-gold/10 border border-gold/30 text-gold text-xs">
                  Status: {statusFilter.replaceAll('_', ' ')}
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('');
                      setCurrentPage(1);
                    }}
                    className="hover:text-ivory ml-0.5 cursor-pointer"
                    title="Clear status filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {barberFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-gold/10 border border-gold/30 text-gold text-xs">
                  Barber: {barberFilter}
                  <button
                    type="button"
                    onClick={() => {
                      setBarberFilter('');
                      setCurrentPage(1);
                    }}
                    className="hover:text-ivory ml-0.5 cursor-pointer"
                    title="Clear barber filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-ivory-dim hover:text-gold hover:underline cursor-pointer ml-auto"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Both views use the same filtered and paginated reservations. */}
      {viewMode === 'cards' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ivory-dim/70">
              {tabs.find((tab) => tab.id === activeTab)?.label} · Card view
            </p>
            {!isLoading && totalRecords > 0 && (
              <span className="text-[11px] text-ivory-dim/60 font-mono">
                {totalRecords} record{totalRecords !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 rounded-2xl bg-charcoal-light/60 border border-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : totalRecords > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {paginatedAppointments.map((appt) => {
                const statusUpper = String(appt.status).toUpperCase();
                const payment = getPaymentDetails(appt);
                const isExpanded = expandedRowId === appt.id;
                const isGroup = Boolean(appt.is_group && appt.group_appointments?.length);
                const barberName = appt.barber_name || 'Unassigned Barber';
                const barberAvatar = (appt as any).barber_avatar_url || (appt as any).barber_image || null;
                const statusBorderClass = getCardStatusBorderClass(appt.status);
                const formattedDate = formatHistoryCardDate(reservationDate(appt));
                const formattedTime = appt.scheduled_time || 'Time not set';
                const price = appt.service_price == null ? null : Number(appt.service_price);
                const cancelReason = appt.cancellation_reason || 'No cancellation reason provided';

                return (
                  <div
                    key={appt.id}
                    onClick={() => toggleExpand(appt.id)}
                    className={`group bg-charcoal-light border border-white/10 hover:border-gold/40 p-4 sm:p-5 rounded-sm transition-colors relative overflow-hidden ${statusBorderClass} flex flex-col gap-4 cursor-pointer`}
                  >
                    {/* Subtle Background Scissors Watermark */}
                    <div className="absolute top-1/2 -translate-y-1/2 right-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none hidden sm:block">
                      <Scissors size={75} className="text-gold" />
                    </div>

                    {/* Top Header Row: Date & Status Badge on Left, Total Price on Right */}
                    <div className="flex items-center justify-between gap-3 relative z-10">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="text-xs font-mono text-ivory-dim/80 font-medium tracking-wide">
                          {formattedDate}
                        </span>
                        <span className={`px-2 py-0.5 rounded-sm border text-[9px] font-bold uppercase tracking-wider ${getReservationOriginClass(appt)}`}>
                          {getReservationOriginLabel(appt)}
                        </span>
                        {renderHistoryStatusStamp(appt.status, Boolean(appt.is_overdue || activeTab === 'overdue'))}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xl sm:text-2xl font-serif font-bold text-gold tracking-tight">
                          {price === null ? '—' : `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span>
                      </div>
                    </div>

                    {/* Middle Main Content: Service Name & Time */}
                    <div className="space-y-2 relative z-10">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="text-lg sm:text-xl font-serif font-bold text-ivory group-hover:text-gold transition-colors tracking-wide">
                          {appt.customer_name || 'Guest Customer'}
                        </h3>
                        {isGroup && (
                          <span className="text-[10px] bg-amber-500/15 text-amber-300 font-bold px-1.5 py-0.5 rounded-sm border border-amber-500/30 uppercase tracking-wide">
                            GROUP · {appt.group_appointments!.length}
                          </span>
                        )}
                        <span className="text-xs text-ivory-dim/75 font-normal">
                          · {appt.service_title || 'Service'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ivory-dim font-light">
                        <div className="inline-flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-sm border border-white/5">
                          <Clock className="w-3.5 h-3.5 text-gold" />
                          <span>{formattedTime}</span>
                          {appt.is_overdue && <span className="text-amber-300">· Overdue / unresolved</span>}
                        </div>
                        <div className="inline-flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-sm border border-white/5 text-[11px]">
                          <span className={`px-1.5 py-0.5 rounded-sm border font-semibold ${payment.providerClass}`}>{payment.provider}</span>
                          <span className="text-white/20">·</span>
                          <span className={payment.depositBadgeType === 'verified' ? 'text-emerald-400 font-medium' : payment.depositBadgeType === 'review' ? 'text-amber-400 font-medium' : 'text-ivory-dim'}>
                            {payment.depositBadgeLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Barber Avatar and Cancellation Notice / Status tag */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/5 relative z-10 mt-1">
                      <div className="flex items-center gap-2.5">
                        <div
                          title={`Assigned Barber: ${barberName}`}
                          className="relative w-8 h-8 rounded-full border-2 border-charcoal bg-charcoal-light overflow-hidden shadow-md flex items-center justify-center shrink-0 ring-1 ring-gold/30 group-hover:ring-gold/60 transition-all"
                        >
                          {barberAvatar ? (
                            <img src={barberAvatar} alt={barberName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gold/25 via-charcoal to-charcoal-light text-gold font-serif font-bold text-xs">
                              {barberName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-ivory-dim font-light">{barberName}</span>
                      </div>

                      {/* Right side tag */}
                      {statusUpper === 'CANCELLED' ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-red-300/90 truncate max-w-[200px] sm:max-w-xs">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span className="truncate">{cancelReason}</span>
                        </div>
                      ) : statusUpper === 'NO_SHOW' ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-300/90 truncate max-w-[200px] sm:max-w-xs">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="truncate">Customer no-show</span>
                        </div>
                      ) : ['COMPLETED', 'DONE'].includes(statusUpper) ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Completed</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 relative z-10" onClick={(event) => event.stopPropagation()}>
                      <button type="button" aria-expanded={isExpanded} onClick={() => toggleExpand(appt.id)} className="text-xs text-gold py-2 hover:underline cursor-pointer">{isExpanded ? 'Hide details' : 'View details'}<span className="sr-only"> for {appt.customer_name}</span></button>
                      {statusUpper === 'PENDING' && <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { setDeclineTarget(appt); setDeclineReason('Payment receipt invalid or missing'); setCustomDeclineReason(''); }} className="px-3 py-2 text-xs text-red-300 border border-red-400/20 rounded-sm hover:bg-red-400/10 cursor-pointer">Reject</button>
                        <button type="button" onClick={() => setApproveTarget(appt)} className="px-3 py-2 text-xs font-bold text-charcoal bg-gold rounded-sm hover:bg-gold-light cursor-pointer">Approve</button>
                      </div>}
                      {statusUpper !== 'PENDING' && (appt.is_overdue || activeTab === 'overdue') && !['COMPLETED', 'DONE', 'CANCELLED', 'NO_SHOW', 'DECLINED', 'REJECTED', 'EXPIRED'].includes(statusUpper) && (
                        <button
                          type="button"
                          onClick={() => {
                            setResolveTarget(appt);
                            setResolveStatus('NO_SHOW');
                            setResolveReason('Customer did not arrive for scheduled slot');
                            setCustomResolveReason('');
                            setResolveNotes('');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-amber-300 border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 rounded-sm transition-colors cursor-pointer"
                        >
                          Resolve Overdue
                        </button>
                      )}
                    </div>

                    {/* Inline expanded details drawer when clicked */}
                    {isExpanded && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-charcoal/90 border-t border-white/10 pt-4 mt-1 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in text-xs cursor-default"
                      >
                        <GroupAppointmentDetails entries={appt.group_appointments} />
                        {/* PAYMENT */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">PAYMENT METHOD & CHANNEL</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${payment.providerClass}`}>
                              {payment.provider}
                            </span>
                            <span className="text-xs text-ivory-dim">· {payment.bookingChannelLabel}</span>
                          </div>
                          <p className="text-[11px] mt-1 text-ivory-dim">
                            Deposit: <span className="text-gold font-bold">₱{payment.depositAmount}</span> ({payment.depositBadgeLabel})
                          </p>
                          <p className="font-mono text-gold text-xs mt-0.5">
                            Ref {appt.reference_number || '—'}
                          </p>
                        </div>

                        {/* RECEIPT */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">RECEIPT</p>
                          {appt.proof_image_url ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setReceiptModalAppt(appt)}
                                className="font-bold text-gold underline hover:text-gold-light text-xs mt-1 block cursor-pointer"
                              >
                                View receipt
                              </button>
                              <p
                                className={`text-[11px] mt-0.5 ${
                                  payment.isVerified
                                    ? 'text-emerald-400'
                                    : payment.isFlagged
                                    ? 'text-amber-400'
                                    : 'text-ivory-dim'
                                }`}
                              >
                                {payment.isVerified
                                  ? 'Verified — recipient matches account'
                                  : payment.isFlagged
                                  ? 'Flagged — check recipient and amount'
                                  : 'Receipt uploaded'}
                              </p>
                            </>
                          ) : (
                            <p className="text-ivory-dim text-[11px] mt-1">No receipt uploaded</p>
                          )}
                        </div>

                        {/* DETAILS */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">DETAILS</p>
                          <p className="text-ivory text-xs font-semibold mt-1">
                            Customer: {appt.customer_name} {appt.customer_phone ? `(${appt.customer_phone})` : ''}
                          </p>
                          <p className="text-ivory-dim text-xs mt-0.5">
                            Branch: {appt.branch_name || currentBranchName}
                          </p>
                          {appt.cancellation_reason && (
                            <p className="text-red-400 text-xs mt-0.5">
                              Cancellation: {appt.cancellation_reason}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pagination Toolbar */}
              <div className="col-span-full p-4 sm:p-5 bg-charcoal-light/40 border border-white/5 rounded-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-ivory-dim">
                  Showing <span className="font-bold text-gold">{startIndex + 1}</span> to{' '}
                  <span className="font-bold text-gold">{Math.min(startIndex + ITEMS_PER_PAGE, totalRecords)}</span> of{' '}
                  <span className="font-bold text-ivory">{totalRecords}</span> reservations
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1.5 px-3 py-2 border border-white/10 rounded-xs text-xs text-ivory hover:border-gold hover:text-gold disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-ivory transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <span className="text-xs text-ivory-dim px-2 font-mono">
                    <span className="text-gold font-bold">{currentPage}</span> / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                    className="flex items-center gap-1.5 px-3 py-2 border border-white/10 rounded-xs text-xs text-ivory hover:border-gold hover:text-gold disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-ivory transition-all cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="py-12 md:py-16 text-center text-ivory-dim p-4 bg-charcoal-light border border-white/10 rounded-2xl">
              <Calendar className="w-8 h-8 text-ivory-dim/40 mx-auto mb-2" />
              <p className="font-semibold text-xs text-ivory">
                No reservations match this tab and your filters.
              </p>
              <p className="text-[11px] text-ivory-dim/70 mt-1">
                Try selecting another tab or clearing search.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Table Section — styled matching transaction history table */
        <div className="bg-charcoal-light border border-white/10 rounded-sm shadow-md overflow-hidden">
        <div className="overflow-x-auto overflow-y-clip">
        <div className="min-w-[860px]">
        {/* Table Column Headers */}
        <div className="grid grid-cols-[minmax(140px,1.2fr)_minmax(110px,1fr)_minmax(150px,1.6fr)_minmax(130px,1.4fr)_minmax(110px,1.3fr)_minmax(130px,1.2fr)] text-[11px] font-bold uppercase tracking-wider text-ivory-dim py-3 px-3.5 bg-charcoal border-b border-white/10 select-none shadow-xs">
          <div>DATE &amp; TIME</div>
          <div>SOURCE</div>
          <div>CUSTOMER</div>
          <div>BARBER ASSIGNED</div>
          <div>DEPOSIT</div>
          <div className="text-right">STATUS</div>
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-sm bg-white/[0.02] border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : totalRecords > 0 ? (
          <div className="divide-y divide-white/5">
            {paginatedAppointments.map((appt) => {
              const isPending = String(appt.status).toUpperCase() === 'PENDING';
              const payment = getPaymentDetails(appt);
              const isExpanded = expandedRowId === appt.id;

              // Group appointments are stored as one row per guest but displayed as one reservation.
              const isGroup = Boolean(appt.is_group && appt.group_appointments?.length) ||
                /group/i.test(appt.customer_name || '') ||
                /×|\bx\s*\d+/i.test(appt.service_title || '');
              const groupMatch = (appt.service_title || '').match(/[×x]\s*(\d+)/i);
              const groupCount = appt.group_appointments?.length || (groupMatch ? groupMatch[1] : '3');

              // Status presentation
              let statusLabel = 'Confirmed';
              let statusDotColor = 'bg-emerald-400';
              const statusUpper = String(appt.status).toUpperCase();

              if (statusUpper === 'COMPLETED' || statusUpper === 'DONE') {
                statusLabel = 'Completed';
                statusDotColor = 'bg-emerald-400';
              } else if (statusUpper === 'NO_SHOW') {
                statusLabel = 'No show';
                statusDotColor = 'bg-rose-400';
              } else if (statusUpper === 'CANCELLED') {
                statusLabel = 'Cancelled';
                statusDotColor = 'bg-zinc-400';
              } else if (statusUpper === 'EXPIRED') {
                statusLabel = 'Expired';
                statusDotColor = 'bg-zinc-400';
              }

              return (
                <div key={appt.id} className="transition-colors">
                  {/* Clickable Row */}
                  <div
                    onClick={() => toggleExpand(appt.id)}
                    className={`grid grid-cols-[minmax(140px,1.2fr)_minmax(110px,1fr)_minmax(150px,1.6fr)_minmax(130px,1.4fr)_minmax(110px,1.3fr)_minmax(130px,1.2fr)] items-center py-3.5 px-3.5 hover:bg-zinc-800/60 cursor-pointer transition-colors duration-150 group ${
                      isExpanded ? 'bg-zinc-800/40' : ''
                    }`}
                  >
                    {/* DATE & TIME */}
                    <div className="min-w-0 pr-3 whitespace-nowrap">
                      <span className="font-semibold text-xs sm:text-sm text-ivory block leading-tight">{formatHistoryCardDate(reservationDate(appt))}</span>
                      <span className="text-[11px] text-gold font-mono block mt-0.5">{appt.scheduled_time || 'Time not set'}</span>
                      {appt.is_overdue && <span className="text-[10px] text-amber-300 block mt-1">Overdue / unresolved</span>}
                    </div>

                    {/* SOURCE */}
                    <div className="min-w-0 pr-3">
                      <span className={`inline-flex max-w-full px-2 py-1 rounded-sm border text-[9px] font-bold uppercase tracking-wider whitespace-normal ${getReservationOriginClass(appt)}`}>
                        {getReservationOriginLabel(appt)}
                      </span>
                    </div>

                    {/* CUSTOMER */}
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-ivory truncate">{appt.customer_name}</span>
                        {isGroup && (
                          <span className="text-[10px] bg-amber-500/15 text-amber-300 font-bold px-1.5 py-0.5 rounded-sm border border-amber-500/30 uppercase tracking-wide">
                            GROUP · {groupCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ivory-dim truncate mt-0.5">{appt.service_title || 'Service'}</p>
                      <button type="button" aria-expanded={isExpanded} onClick={(event) => { event.stopPropagation(); toggleExpand(appt.id); }} className="text-[11px] text-gold mt-1 hover:underline cursor-pointer">{isExpanded ? 'Hide details' : 'View details'}<span className="sr-only"> for {appt.customer_name}</span></button>
                    </div>

                    {/* BARBER ASSIGNED */}
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-[10px] font-bold text-gold shrink-0">
                          {appt.barber_name ? appt.barber_name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <span className="font-medium text-xs text-ivory truncate">
                          {appt.barber_name || <span className="text-ivory-dim italic font-normal">Unassigned</span>}
                        </span>
                      </div>
                    </div>

                    {/* DEPOSIT & PAYMENT METHOD */}
                    <div className="min-w-0 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {payment.hasRecordedProvider ? (
                          <span className="font-mono text-gold font-bold text-xs sm:text-sm">
                            ₱{payment.depositAmount}
                          </span>
                        ) : (
                          <span className="font-mono text-ivory-dim text-xs">—</span>
                        )}
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${payment.providerClass}`}>
                          {payment.provider}
                        </span>
                      </div>
                      <div className="text-[10px] text-ivory-dim flex items-center gap-1.5 mt-0.5">
                        <span
                          className={
                            payment.depositBadgeType === 'verified'
                              ? 'text-emerald-400 font-medium'
                              : payment.depositBadgeType === 'review'
                              ? 'text-amber-400 font-medium'
                              : payment.depositBadgeType === 'none'
                              ? 'text-ivory-dim'
                              : payment.depositBadgeType === 'required'
                              ? 'text-rose-400 font-medium'
                              : 'text-ivory-dim/70'
                          }
                        >
                          {payment.depositBadgeLabel}
                        </span>
                        <span className="text-white/20">·</span>
                        <span className="text-[10px] text-ivory-dim/75">{payment.bookingChannelLabel}</span>
                      </div>
                    </div>

                    {/* STATUS / ACTION */}
                    <div
                      className="flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isPending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDeclineTarget(appt);
                              setDeclineReason('Payment receipt invalid or missing');
                              setCustomDeclineReason('');
                            }}
                            className="text-xs text-ivory-dim hover:text-red-400 font-medium px-2 py-1 transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => setApproveTarget(appt)}
                            className="bg-gold text-charcoal hover:bg-gold-light font-bold text-xs px-3.5 py-1.5 rounded-sm shadow-sm transition-all cursor-pointer"
                          >
                            Approve
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          {renderHistoryStatusStamp(statusUpper, Boolean(appt.is_overdue || activeTab === 'overdue'))}
                          {(appt.is_overdue || activeTab === 'overdue') && !['COMPLETED', 'DONE', 'CANCELLED', 'NO_SHOW', 'DECLINED', 'REJECTED', 'EXPIRED'].includes(statusUpper) && (
                            <button
                              type="button"
                              onClick={() => {
                                setResolveTarget(appt);
                                setResolveStatus('NO_SHOW');
                                setResolveReason('Customer did not arrive for scheduled slot');
                                setCustomResolveReason('');
                                setResolveNotes('');
                              }}
                              className="px-2 py-0.5 text-[11px] font-semibold text-amber-300 border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 rounded-sm transition-colors cursor-pointer"
                              title="Resolve overdue reservation"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* INLINE EXPANDED DETAILS */}
                  {isExpanded && (
                    <div className="bg-charcoal/90 border-t border-b border-white/10 px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in text-xs">
                      <GroupAppointmentDetails entries={appt.group_appointments} />
                      {/* PAYMENT */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">PAYMENT METHOD & CHANNEL</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${payment.providerClass}`}>
                            {payment.provider}
                          </span>
                          <span className="text-xs text-ivory-dim">· {payment.bookingChannelLabel}</span>
                        </div>
                        <p className="text-[11px] mt-1 text-ivory-dim">
                          Deposit: <span className="text-gold font-bold">₱{payment.depositAmount}</span> ({payment.depositBadgeLabel})
                        </p>
                        <p className="font-mono text-gold text-xs mt-0.5">
                          Ref {appt.reference_number || '—'}
                        </p>
                      </div>

                      {/* RECEIPT */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">RECEIPT</p>
                        {appt.proof_image_url ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setReceiptModalAppt(appt)}
                              className="font-bold text-gold underline hover:text-gold-light text-xs mt-1 block cursor-pointer"
                            >
                              View receipt
                            </button>
                            <p
                              className={`text-[11px] mt-0.5 ${
                                payment.isVerified
                                  ? 'text-emerald-400'
                                  : payment.isFlagged
                                  ? 'text-amber-400'
                                  : 'text-ivory-dim'
                              }`}
                            >
                              {payment.isVerified
                                ? 'Verified — recipient matches account'
                                : payment.isFlagged
                                ? 'Flagged — check recipient and amount'
                                : 'Receipt uploaded'}
                            </p>
                          </>
                        ) : (
                          <p className="text-ivory-dim text-[11px] mt-1">No receipt uploaded</p>
                        )}
                      </div>

                      {/* BOOKING */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">BOOKING</p>
                        <p className="text-ivory text-xs font-semibold mt-1">
                          {appt.service_title}{' '}
                          {appt.service_price !== null ? `· ₱${Number(appt.service_price).toFixed(0)}` : ''}
                        </p>
                        <p className="text-ivory-dim text-xs mt-0.5">{appt.barber_name || 'Unassigned'}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="py-12 md:py-16 text-center text-ivory-dim p-4">
            <Calendar className="w-8 h-8 text-ivory-dim/40 mx-auto mb-2" />
            <p className="font-semibold text-xs text-ivory">
              No reservations match this tab and your filters.
            </p>
            <p className="text-[11px] text-ivory-dim/70 mt-1">
              Try another tab or reset the search and filters above.
            </p>
          </div>
        )}
        </div>
        </div>

        {/* Footer Summary / Pagination */}
        {!isLoading && totalRecords > 0 && (
          <div className="px-4 py-3 border-t border-white/10 bg-charcoal/50 text-xs text-ivory-dim flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              Showing <span className="font-bold text-gold">{startIndex + 1}</span> to{' '}
              <span className="font-bold text-gold">{Math.min(startIndex + ITEMS_PER_PAGE, totalRecords)}</span> of{' '}
              <span className="font-bold text-ivory">{totalRecords}</span> reservations
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-white/10 rounded-xs text-xs text-ivory hover:border-gold hover:text-gold disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-ivory transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <span className="text-xs text-ivory-dim px-2 font-mono">
                <span className="text-gold font-bold">{currentPage}</span> / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-white/10 rounded-xs text-xs text-ivory hover:border-gold hover:text-gold disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-ivory transition-all cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* VIEW RECEIPT MODAL */}
      <Modal
        isOpen={Boolean(receiptModalAppt)}
        onClose={() => setReceiptModalAppt(null)}
        title={`Payment Receipt — ${receiptModalAppt?.customer_name || 'Guest'}`}
        size="md"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => setReceiptModalAppt(null)}
              className="px-4 py-1.5 rounded-sm border border-white/10 text-xs text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer"
            >
              Close
            </button>
            {receiptModalAppt && String(receiptModalAppt.status).toUpperCase() === 'PENDING' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = receiptModalAppt;
                    setReceiptModalAppt(null);
                    setDeclineTarget(target);
                  }}
                  className="px-3 py-1.5 rounded-sm border border-red-500/30 text-xs text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = receiptModalAppt;
                    setReceiptModalAppt(null);
                    setApproveTarget(target);
                  }}
                  className="px-4 py-1.5 rounded-sm bg-gold text-charcoal hover:bg-gold-light text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  Approve Deposit
                </button>
              </div>
            )}
          </div>
        }
      >
        {receiptModalAppt && (
          <div className="space-y-4 text-xs">
            {/* OCR Info Card */}
            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                  Payment Reference
                </span>
                <span className="font-mono text-gold font-bold">
                  {receiptModalAppt.reference_number || '—'}
                </span>
              </div>
              {receiptModalAppt.ocr_reference_number && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ivory-dim">OCR Scanned Ref:</span>
                  <span className="font-mono text-ivory">{receiptModalAppt.ocr_reference_number}</span>
                </div>
              )}
              {receiptModalAppt.recipient_identifier_detected && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ivory-dim">Detected Recipient:</span>
                  <span className="font-medium text-ivory">{receiptModalAppt.recipient_identifier_detected}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                <span className="text-ivory-dim">Verification:</span>
                <span className={receiptModalAppt.recipient_identifier_detected ? 'text-green-400 font-bold' : 'text-amber-400'}>
                  {receiptModalAppt.recipient_identifier_detected ? 'Verified Account' : 'Needs Visual Check'}
                </span>
              </div>
            </div>

            {/* Receipt Image */}
            {receiptModalAppt.proof_image_url ? (
              <div className="rounded-sm border border-white/10 bg-black/40 overflow-hidden flex flex-col items-center justify-center p-2">
                <img
                  src={receiptModalAppt.proof_image_url}
                  alt="Payment Receipt"
                  className="max-h-[380px] w-auto object-contain rounded-xs shadow-md"
                />
                <div className="mt-2 flex items-center justify-center gap-3">
                  <a
                    href={receiptModalAppt.proof_image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-gold hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open Full Image</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-ivory-dim">No image receipt attached.</div>
            )}
          </div>
        )}
      </Modal>

      {/* APPROVE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(approveTarget)}
        onClose={() => !isSubmittingApprove && setApproveTarget(null)}
        title="Approve Reservation"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              disabled={isSubmittingApprove}
              onClick={() => setApproveTarget(null)}
              className="px-3.5 py-1.5 rounded-sm border border-white/10 text-xs text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmittingApprove}
              onClick={() => void handleExecuteApprove()}
              className="px-4 py-1.5 rounded-sm bg-gold text-charcoal hover:bg-gold-light text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSubmittingApprove ? 'Approving…' : 'Confirm Approval'}
            </button>
          </div>
        }
      >
        {approveTarget && (
          <div className="space-y-3.5 text-xs">
            <p className="text-ivory-dim leading-relaxed">
              Confirm and approve reservation for{' '}
              <strong className="text-ivory font-semibold">{approveTarget.customer_name}</strong>?
            </p>

            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                  Service
                </span>
                <span className="text-ivory font-medium truncate max-w-[180px]">
                  {approveTarget.service_title || 'Classic Haircut'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                  Schedule
                </span>
                <span className="text-ivory font-mono">
                  {approveTarget.scheduled_date} • {approveTarget.scheduled_time || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                  Barber
                </span>
                <span className="text-ivory font-medium">
                  {approveTarget.barber_name || 'Unassigned'}
                </span>
              </div>
              {approveTarget.reference_number && (
                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                    Deposit Ref
                  </span>
                  <span className="font-mono text-gold font-bold">
                    #{approveTarget.reference_number}
                  </span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-ivory-dim/70">
              The booking will be confirmed and the customer will be notified of approval.
            </p>
          </div>
        )}
      </Modal>

      {/* REJECT CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(declineTarget)}
        onClose={() => !isSubmittingDecline && setDeclineTarget(null)}
        title="Reject Reservation"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              disabled={isSubmittingDecline}
              onClick={() => setDeclineTarget(null)}
              className="px-3.5 py-1.5 rounded-sm border border-white/10 text-xs text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmittingDecline}
              onClick={() => void handleConfirmDecline()}
              className="px-4 py-1.5 rounded-sm bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmittingDecline ? 'Rejecting…' : 'Confirm Rejection'}
            </button>
          </div>
        }
      >
        {declineTarget && (
          <div className="space-y-3.5 text-xs">
            <p className="text-ivory-dim leading-relaxed">
              Reject reservation for <strong className="text-ivory font-semibold">{declineTarget.customer_name}</strong>?
            </p>

            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                  Schedule
                </span>
                <span className="text-ivory font-mono">
                  {declineTarget.scheduled_date} • {declineTarget.scheduled_time || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                  Barber
                </span>
                <span className="text-ivory font-medium">
                  {declineTarget.barber_name || 'Unassigned'}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">
                Rejection Reason
              </label>
              <select
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full h-8 px-2.5 rounded-sm bg-charcoal border border-white/10 text-xs text-ivory focus:border-gold outline-none"
              >
                <option value="Payment receipt invalid or missing">Payment receipt invalid or missing</option>
                <option value="Deposit amount mismatch">Deposit amount mismatch</option>
                <option value="Slot conflict or barber unavailable">Slot conflict or barber unavailable</option>
                <option value="Customer requested cancellation">Customer requested cancellation</option>
                <option value="Other">Other reason</option>
              </select>
            </div>

            {declineReason === 'Other' && (
              <input
                type="text"
                value={customDeclineReason}
                onChange={(e) => setCustomDeclineReason(e.target.value)}
                placeholder="Specify reason (minimum 3 characters)…"
                className="w-full h-8 px-2.5 rounded-sm bg-charcoal border border-white/10 text-xs text-ivory focus:border-gold outline-none"
              />
            )}

            <p className="text-[11px] text-ivory-dim/70">
              The customer will be notified that their reservation request was rejected.
            </p>
          </div>
        )}
      </Modal>

      {/* RESOLVE OVERDUE RESERVATION MODAL */}
      <Modal
        isOpen={Boolean(resolveTarget)}
        onClose={() => !isSubmittingResolve && setResolveTarget(null)}
        title="Resolve Overdue Reservation"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              disabled={isSubmittingResolve}
              onClick={() => setResolveTarget(null)}
              className="px-3.5 py-1.5 rounded-sm border border-white/10 text-xs text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmittingResolve}
              onClick={() => void handleResolveSubmit()}
              className="px-4 py-1.5 rounded-sm bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmittingResolve ? 'Resolving…' : `Confirm as ${resolveStatus === 'NO_SHOW' ? 'No-Show' : 'Cancelled'}`}
            </button>
          </div>
        }
      >
        {resolveTarget && (
          <div className="space-y-3.5 text-xs">
            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-serif font-bold text-sm text-gold">{resolveTarget.customer_name || 'Guest'}</span>
                <span className="text-ivory font-mono text-[11px]">{resolveTarget.scheduled_time || 'Time not set'}</span>
              </div>
              <div className="flex items-center justify-between text-ivory-dim">
                <span>{resolveTarget.service_title || 'Service'}</span>
                <span className="text-ivory font-medium">{resolveTarget.barber_name || 'Unassigned'}</span>
              </div>
              {resolveTarget.customer_phone && (
                <p className="text-ivory-dim/70 text-[11px] font-mono">{resolveTarget.customer_phone}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">
                Resolution Action
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResolveStatus('NO_SHOW');
                    setResolveReason('Customer did not arrive for scheduled slot');
                  }}
                  className={`p-2 rounded-sm border text-left cursor-pointer transition-all ${
                    resolveStatus === 'NO_SHOW'
                      ? 'border-amber-400/60 bg-amber-400/15 text-amber-300'
                      : 'border-white/10 bg-white/5 text-ivory-dim hover:text-ivory'
                  }`}
                >
                  <p className="font-bold text-xs">Mark as No-Show</p>
                  <p className="text-[10px] opacity-80 mt-0.5">Customer failed to arrive</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResolveStatus('CANCELLED');
                    setResolveReason('Customer requested cancellation');
                  }}
                  className={`p-2 rounded-sm border text-left cursor-pointer transition-all ${
                    resolveStatus === 'CANCELLED'
                      ? 'border-rose-400/60 bg-rose-400/15 text-rose-300'
                      : 'border-white/10 bg-white/5 text-ivory-dim hover:text-ivory'
                  }`}
                >
                  <p className="font-bold text-xs">Cancel Reservation</p>
                  <p className="text-[10px] opacity-80 mt-0.5">Cancelled or unable to fulfill</p>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">
                Reason
              </label>
              <select
                value={resolveReason}
                onChange={(e) => setResolveReason(e.target.value)}
                className="w-full h-8 px-2.5 rounded-sm bg-charcoal border border-white/10 text-xs text-ivory focus:border-gold outline-none"
              >
                {resolveStatus === 'NO_SHOW' ? (
                  <>
                    <option value="Customer did not arrive for scheduled slot">Customer did not arrive for scheduled slot</option>
                    <option value="Late arrival exceeded grace period">Late arrival exceeded grace period</option>
                    <option value="Customer unreachable via phone">Customer unreachable via phone</option>
                    <option value="Other">Other reason</option>
                  </>
                ) : (
                  <>
                    <option value="Customer requested cancellation">Customer requested cancellation</option>
                    <option value="Barber emergency / unavailable">Barber emergency / unavailable</option>
                    <option value="Shop schedule conflict">Shop schedule conflict</option>
                    <option value="Other">Other reason</option>
                  </>
                )}
              </select>
            </div>

            {resolveReason === 'Other' && (
              <input
                type="text"
                value={customResolveReason}
                onChange={(e) => setCustomResolveReason(e.target.value)}
                placeholder="Specify reason (minimum 3 characters)…"
                className="w-full h-8 px-2.5 rounded-sm bg-charcoal border border-white/10 text-xs text-ivory focus:border-gold outline-none"
              />
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">
                Internal Notes (optional)
              </label>
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Any additional notes for reservation history audit…"
                rows={2}
                className="w-full p-2 rounded-sm bg-charcoal border border-white/10 text-xs text-ivory focus:border-gold outline-none resize-none"
              />
            </div>

            <p className="text-[11px] text-ivory-dim/70">
              This reservation will be finalized and recorded under Reports & Audits → Reservation History.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AppointmentsTab;
