import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Clock,
  UserCheck,
  MapPin,
  Receipt,
  Scissors,
  Camera,
  Upload,
  Trash2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CreditCard,
  Banknote,
  Smartphone,
  Layers,
  Sparkles,
  CalendarX,
  UserX,
  ArrowRight,
  Users,
} from 'lucide-react';
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/config/api';
import { useToast } from '@/components/feedback/ToastContext';
import { formatDuration } from '@/utils/manila-date';
import { formatReservationStatus, renderReservationStatusStamp, type ReservationCardItem } from './ReservationCard';
import Portal from '@/components/common/Portal';

export interface HistoryItemService {
  service_id: number;
  title: string;
  category?: string;
  duration_minutes: number;
  price: number;
  custom_specification?: string | null;
}

export interface SplitPaymentDetail {
  method: string;
  amount: number;
  reference?: string | null;
}

export interface HistoryDetailedData {
  id: string | number;
  transaction_id?: number | null;
  status?: string;
  payment_status?: string;
  date?: string;
  time?: string;
  barber_name?: string;
  branch_name?: string;
  branch_address?: string | null;
  processed_by?: string;
  haircut_photo_url?: string | null;
  cancel_reason?: string | null;
  cancel_type?: string | null;
  services?: HistoryItemService[];
  subtotal?: number;
  reservation_fee?: number;
  discount_amount?: number;
  total_amount?: number;
  payment_method?: string;
  split_breakdown?: SplitPaymentDetail[];
  reference_number?: string | null;
  transaction_date?: string | null;
  guest_reference?: string | null;
  is_group?: boolean;
  total_guests?: number;
  guests?: any[];
  queue_entry_id?: number | null;
  branch_id?: number | null;
  barber_id?: number | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  scheduled_start_at?: string | null;
}

interface RecentHistoryDetailsModalProps {
  item: ReservationCardItem | null;
  onClose: () => void;
  onPhotoUpdated?: (item: ReservationCardItem, newUrl: string | null) => void;
  onRebook?: (item?: any) => void;
}

const buildInitialDetails = (item: any): HistoryDetailedData | null => {
  if (!item) return null;
  const isCompleted = formatReservationStatus(item.status || '', item.payment_status || '') === 'Completed';
  const defaultRefNo = item.reference_number
    || item.guest_reference
    || (isCompleted ? `MCH - ${String(item.id).padStart(4, '0')}` : `RES-${item.id}`);

  const defaultDateStr = item.date || (item.appointment_date ? new Date(item.appointment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A');
  const defaultTimeStr = item.time || item.appointment_time || 'N/A';
  const defaultTimestamp = item.transaction_date || item.created_at || item.sort_time || `${defaultDateStr}, ${defaultTimeStr}`;

  const isOnline = item.source !== 'guest' && !item.guest_reference;
  const isGroup = Boolean(item.is_group || item.isGroup || (item.guests && item.guests.length > 1));
  const guests = Array.isArray(item.guests) ? item.guests : [];
  const guestCount = item.total_guests || (guests.length > 0 ? guests.length : 1);
  const reservationFee = item.reservation_fee !== undefined ? Number(item.reservation_fee) : (isOnline ? (50 * guestCount) : 0);

  let itemServices: HistoryItemService[] = [];
  if (Array.isArray(item.services) && item.services.length > 0) {
    itemServices = item.services;
  } else if (isGroup && guests.length > 0) {
    itemServices = guests.map((g: any, idx: number) => ({
      service_id: Number(g.id || idx + 1),
      title: `${g.service_name || 'Grooming Service'} (${g.guest_name || `Guest ${idx + 1}`})`,
      category: 'Haircut & Styling',
      duration_minutes: 30,
      price: Number(g.price ? Math.max(0, Number(g.price) - 50) : 250),
    }));
  } else {
    itemServices = [
      {
        service_id: 1,
        title: item.service_name || item.service || 'Classic Grooming Service',
        category: 'Haircut & Styling',
        duration_minutes: 30,
        price: Number(item.price ? Math.max(0, Number(item.price) - reservationFee) : 0),
      },
    ];
  }

  const subtotal = item.subtotal ?? itemServices.reduce((sum, s) => sum + s.price, 0);
  const totalAmount = item.total_amount ?? (Number(subtotal) + reservationFee);

  return {
    id: item.id,
    status: item.status,
    payment_status: item.payment_status,
    date: defaultDateStr,
    time: defaultTimeStr,
    barber_name: item.barber_name || item.barber || 'Any Barber',
    branch_name: item.branch_name || 'SampleBranch Branch',
    branch_address: item.branch_address || 'Ground Floor, SampleBranch, San Jose del Monte',
    processed_by: item.processed_by || 'Front Desk Cashier',
    haircut_photo_url: item.haircut_photo_url,
    cancel_reason: item.cancellation_reason || item.cancel_reason,
    cancel_type: item.cancellation_type || item.cancel_type || null,
    services: itemServices,
    subtotal: Number(subtotal),
    reservation_fee: reservationFee,
    discount_amount: Number(item.discount_amount || 0),
    total_amount: Number(totalAmount),
    payment_method: item.payment_method || ((item.payment_status || '').toLowerCase() === 'paid' ? 'Cash' : 'Unpaid'),
    split_breakdown: item.split_breakdown || [],
    reference_number: defaultRefNo,
    transaction_date: defaultTimestamp,
    guest_reference: item.guest_reference || null,
    is_group: isGroup,
    total_guests: guestCount,
    guests: guests,
    queue_entry_id: item.queue_entry_id || null,
    branch_id: item.branch_id || null,
    barber_id: item.barber_id || null,
    preferred_date: item.preferred_date || null,
    preferred_time: item.preferred_time || null,
    scheduled_start_at: item.scheduled_start_at || null,
  };
};

export const RecentHistoryDetailsModal: React.FC<RecentHistoryDetailsModalProps> = ({
  item,
  onClose,
  onPhotoUpdated,
  onRebook,
}) => {
  const [details, setDetails] = useState<HistoryDetailedData | null>(() => buildInitialDetails(item));
  const [, setIsLoading] = useState<boolean>(false);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Photo upload & delete states
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Escape key handler & body overflow lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxOpen) {
          setLightboxOpen(false);
          setZoomLevel(1);
          setPanPosition({ x: 0, y: 0 });
        } else {
          onClose();
        }
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxOpen, onClose]);

  // Fetch detailed breakdown from backend (silent background enrich)
  useEffect(() => {
    if (!item) return;

    let isMounted = true;
    setDetails(buildInitialDetails(item));

    const fetchDetails = async () => {
      try {
        const res = await api.get(`/api/customers/history/${item.id}/details`);
        if (isMounted && res.data) {
          setDetails((prev) => ({
            ...(prev || {}),
            ...res.data,
          }));
        }
      } catch (err) {
        console.warn('[RecentHistoryDetailsModal] Background fetch of extended history details failed, using card state', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [item]);

  if (!item) return null;

  const currentData = details || {
    id: item.id,
    status: item.status,
    payment_status: item.payment_status,
    date: item.date || item.appointment_date,
    time: item.time || item.appointment_time,
    barber_name: item.barber_name || item.barber,
    branch_name: 'SampleBranch Branch',
    processed_by: 'Front Desk Cashier',
    haircut_photo_url: item.haircut_photo_url,
    cancel_reason: item.cancellation_reason || item.cancel_reason,
    total_amount: Number(item.price || item.total_amount || 0),
  };

  const statusText = formatReservationStatus(currentData.status || item.status || '', currentData.payment_status || item.payment_status || '');
  const isCompleted = statusText === 'Completed';
  const isCancelled = statusText === 'Cancelled';
  const isNoShow = statusText === 'NO_SHOW';
  const isPending = statusText === 'Pending';
  const isUpcoming = statusText === 'Upcoming';
  const appointmentStart = currentData.scheduled_start_at ? new Date(currentData.scheduled_start_at).getTime() : NaN;
  const canReschedule = isUpcoming
    && !(currentData as any).has_used_reschedule
    && String((currentData as any).schedule_adjustment_status || '').toLowerCase() !== 'rescheduled'
    && Number.isFinite(appointmentStart)
    && appointmentStart - Date.now() >= 24 * 60 * 60 * 1000
    && Boolean(currentData.queue_entry_id || item.id);
  const rescheduleAppointment = { ...item, ...currentData, id: currentData.queue_entry_id || item.id };

  const isPaid = (currentData.payment_status || item.payment_status || '').toLowerCase() === 'paid';
  const canUploadPhoto = isCompleted && isPaid && item.source !== 'guest';

  // Haircut photo upload handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      addToast({
        type: 'error',
        title: 'Invalid File',
        message: 'Only JPEG and PNG images are allowed.',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast({
        type: 'error',
        title: 'File Too Large',
        message: 'Image size must be under 5 MB.',
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('haircut_photo', file);

    try {
      const res = await api.post(`/api/customers/history/${item.id}/haircut-photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newUrl = res.data?.haircut_photo_url;
      if (newUrl) {
        setDetails((prev) => (prev ? { ...prev, haircut_photo_url: newUrl } : null));
        onPhotoUpdated?.(item, newUrl);
        addToast({
          type: 'success',
          title: 'Photo Uploaded',
          message: 'Haircut reference photo uploaded successfully!',
        });
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to upload photo.';
      addToast({
        type: 'error',
        title: 'Upload Failed',
        message: msg,
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Haircut photo delete handler
  const handlePhotoDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/api/customers/history/${item.id}/haircut-photo`);
      setDetails((prev) => (prev ? { ...prev, haircut_photo_url: null } : null));
      onPhotoUpdated?.(item, null);
      addToast({
        type: 'success',
        title: 'Photo Removed',
        message: 'Haircut reference photo removed.',
      });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to remove haircut photo.';
      addToast({
        type: 'error',
        title: 'Error',
        message: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Lightbox pan & zoom controls
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(3.5, prev + 0.5));
  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(1, prev - 0.5);
      if (next === 1) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    setPanPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Render Payment Method Badge
  const renderPaymentMethodBadge = (method: string = 'Cash') => {
    const norm = method.toLowerCase();
    if (norm.includes('split')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
          <Layers className="w-3.5 h-3.5" />
          <span>Split Payment</span>
        </span>
      );
    }
    if (norm.includes('gcash')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
          <Smartphone className="w-3.5 h-3.5" />
          <span>GCash</span>
        </span>
      );
    }
    if (norm.includes('card')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-semibold">
          <CreditCard className="w-3.5 h-3.5" />
          <span>Card</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
        <Banknote className="w-3.5 h-3.5" />
        <span>Cash</span>
      </span>
    );
  };

  // Header Title by status
  const modalTitle = isCompleted
    ? 'Reservation Details'
    : isCancelled
    ? 'Reservation Details'
    : isNoShow
    ? 'No-Show Record'
    : isUpcoming
    ? 'Upcoming Appointment'
    : 'Pending Confirmation';

  return (
    <Portal>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in overflow-y-auto"
        onClick={onClose}
      >
        {/* Modal Container */}
        <div
          className="relative w-full max-w-2xl bg-charcoal border border-amber-500/20 hover:border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden my-auto transition-all duration-300 flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Gold Accent Border */}
          <div className="h-1 w-full bg-gradient-to-r from-amber-500/20 via-gold to-amber-500/20 shrink-0" />

          {/* Modal Header */}
          <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4 bg-charcoal-light/30 shrink-0">
            <div>
              <div className="flex items-center gap-2 text-gold text-xs font-bold uppercase tracking-[0.2em] mb-1.5">
                {isCompleted ? (
                  <>
                    <Receipt className="w-4 h-4 text-gold" />
                    <span>Appointment Summary</span>
                  </>
                ) : isCancelled ? (
                  <>
                    <CalendarX className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">Cancellation Record</span>
                  </>
                ) : isNoShow ? (
                  <>
                    <UserX className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">Missed Schedule</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-gold" />
                    <span>Reservation Status</span>
                  </>
                )}
              </div>
              <h2 className="text-2xl font-serif font-bold text-ivory tracking-wide">
                {modalTitle}
              </h2>
              {currentData.guest_reference && (
                <span className="text-xs text-gold/80 font-mono mt-0.5 block">
                  Reference: {currentData.guest_reference}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isUpcoming && (
                <Button
                  variant="outline"
                  aria-disabled={!canReschedule}
                  onClick={() => canReschedule ? setRescheduleOpen(true) : addToast({ type: 'warning', title: 'Rescheduling unavailable', message: 'Rescheduling is only allowed at least 1 day before your scheduled appointment. For same-day concerns, please contact the shop directly.' })}
                  className={`text-xs px-4 py-2 ${canReschedule ? 'border-gold/60 text-gold' : 'border-white/10 text-ivory-dim/50'}`}
                >Reschedule</Button>
              )}
              {!isCancelled && renderReservationStatusStamp(statusText)}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-sm bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-ivory border border-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body - Scrollable */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
            {/* Appointment Core Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-sm bg-charcoal-light/40 border border-white/5">
              {/* Date & Time */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-gold/10 border border-gold/20 text-gold shrink-0 mt-0.5">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-ivory-dim/70 font-semibold block">
                    Scheduled Date & Time
                  </span>
                  <span className="text-sm font-medium text-ivory">
                    {currentData.date} • {currentData.time}
                  </span>
                </div>
              </div>

              {/* Assigned Barber */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-gold/10 border border-gold/20 text-gold shrink-0 mt-0.5">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-ivory-dim/70 font-semibold block">
                    Assigned Barber
                  </span>
                  <span className="text-sm font-medium text-ivory flex items-center gap-1.5">
                    {currentData.barber_name || 'Any Available Barber'}
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-gold">Barber</span>
                  </span>
                </div>
              </div>

              {/* Branch & Location */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-gold/10 border border-gold/20 text-gold shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-ivory-dim/70 font-semibold block">
                    Location
                  </span>
                  <span className="text-sm font-medium text-ivory truncate block">
                    {currentData.branch_name || 'SampleBranch Branch'}
                  </span>
                  {currentData.branch_address && (
                    <span className="text-xs text-ivory-dim/70 truncate block">
                      {currentData.branch_address}
                    </span>
                  )}
                </div>
              </div>

              {/* Processed By / Handled By */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-gold/10 border border-gold/20 text-gold shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-ivory-dim/70 font-semibold block">
                    {isCompleted
                      ? 'Processed / Confirmed By'
                      : isCancelled
                      ? 'Cancellation Created By'
                      : isNoShow
                      ? 'Record Type'
                      : 'Handled By'}
                  </span>
                  <span className="text-sm font-medium text-ivory">
                    {isCompleted
                      ? currentData.processed_by || 'Front Desk Cashier'
                      : isCancelled
                      ? (currentData.cancel_type?.toLowerCase().includes('cashier') ||
                         currentData.cancel_type?.toLowerCase().includes('staff') ||
                         currentData.cancel_type?.toLowerCase().includes('admin')
                          ? 'Cashier'
                          : 'Customer')
                      : isNoShow
                      ? 'Automated Arrival Window Expiry'
                      : 'Front Desk Team'}
                  </span>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* STATUS-SPECIFIC SECTIONS: CANCELLED OR NO SHOW                            */}
            {/* ========================================================================= */}
            {isCancelled && (
              <div className="cancellation-notice-banner p-4 rounded-sm bg-red-950/40 border border-red-800/50 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                <div className="text-xs space-y-1">
                  <span className="cancellation-notice-title font-bold block text-red-400 text-sm">Cancellation Reason</span>
                  <p className="cancellation-notice-reason text-red-200 font-medium text-sm leading-relaxed">
                    {currentData.cancel_reason || 'This reservation was cancelled before the scheduled haircut session.'}
                  </p>
                  <p className="cancellation-notice-subtext text-xs text-red-300/80 pt-1">
                    No services were performed and no final service balance was billed.
                  </p>
                </div>
              </div>
            )}

            {isNoShow && (
              <div className="cancellation-notice-banner p-4 rounded-sm bg-red-950/40 border border-red-800/50 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                <div className="text-xs space-y-1">
                  <span className="cancellation-notice-title font-bold block text-red-400 text-sm">Missed Appointment Notice</span>
                  <p className="cancellation-notice-reason text-red-200 font-medium text-sm leading-relaxed">
                    You did not check in during the allocated arrival window for this scheduled session.
                  </p>
                  <p className="cancellation-notice-subtext text-xs text-red-300/80 pt-1">
                    The slot was released and marked as No Show. Please book a new slot for your next grooming visit.
                  </p>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* GROUP BOOKING GUEST BREAKDOWN                                              */}
            {/* ========================================================================= */}
            {currentData.is_group && currentData.guests && currentData.guests.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-serif font-bold text-ivory tracking-wide flex items-center gap-2">
                    <Users className="w-4 h-4 text-gold" />
                    <span>Group Booking Breakdown ({currentData.guests.length} Guests)</span>
                  </h3>
                  <span className="text-xs text-gold/80 font-mono font-medium">₱{(currentData.total_amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>

                <div className="rounded-sm border border-white/10 bg-charcoal-light/20 overflow-hidden divide-y divide-white/5">
                  {currentData.guests.map((g: any, idx: number) => (
                    <div key={idx} className="p-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full border border-gold/30 bg-charcoal flex items-center justify-center shrink-0 overflow-hidden text-gold font-serif font-bold text-xs">
                          {g.barber_image ? (
                            <img src={g.barber_image} alt={g.barber_name} width={36} height={36} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                          ) : (
                            (g.barber_name || 'B').charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="space-y-0.5 truncate">
                          <span className="text-sm font-medium text-ivory block truncate">
                            {g.guest_name || `Guest ${idx + 1}`}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-ivory-dim/70 font-light truncate">
                            <span className="text-gold/90 font-medium">Barber: {g.barber_name || 'Any Barber'}</span>
                            <span>•</span>
                            <span className="truncate">{g.service_name || 'Grooming Service'}</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-serif font-bold text-ivory shrink-0">
                        ₱{Number(g.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* SERVICES SECTION                                                          */}
            {/* ========================================================================= */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-serif font-bold text-ivory tracking-wide flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-gold" />
                  <span>{isCompleted ? 'Itemized Services' : 'Reserved Services'}</span>
                </h3>
                <span className="text-xs text-ivory-dim/70">
                  {currentData.services?.length || 1} {currentData.services && currentData.services.length > 1 ? 'Services' : 'Service'}
                </span>
              </div>

              <div className="rounded-sm border border-white/10 bg-charcoal-light/20 overflow-hidden divide-y divide-white/5">
                {(currentData.services || []).map((service, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium text-ivory block">{service.title}</span>
                      {service.custom_specification && (
                        <span className="block text-xs italic text-gold/80">Style: {service.custom_specification}</span>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-ivory-dim/70 font-light">
                        <Clock className="w-3 h-3 text-gold/70" />
                        <span>{formatDuration(service.duration_minutes)}</span>
                      </div>
                    </div>
                    <span className={`text-sm font-serif font-bold shrink-0 ${!isCompleted ? 'text-ivory-dim/60 line-through' : 'text-ivory'}`}>
                      ₱{Number(service.price).toLocaleString()}
                    </span>
                  </div>
                ))}

                {/* Subtotal & Total Breakdown */}
                {isCompleted ? (
                  /* Completed: Show Final Total Paid */
                  <div className="p-4 bg-black/20 space-y-2">
                    <div className="flex justify-between text-xs text-ivory-dim">
                      <span>Services Subtotal</span>
                      <span>₱{(currentData.subtotal ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {(currentData.reservation_fee ?? 50) > 0 && (
                      <div className="flex justify-between text-xs text-ivory-dim">
                        <span className="flex items-center gap-1.5">
                          <span>Reservation Fee</span>
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Online Booking</span>
                        </span>
                        <span className="text-emerald-400 font-medium">₱{(currentData.reservation_fee ?? 50).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {(currentData.discount_amount ?? 0) > 0 && (
                      <div className="flex justify-between text-xs text-emerald-400">
                        <span>Discount / Voucher</span>
                        <span>-₱{currentData.discount_amount?.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline pt-2 border-t border-white/10 text-ivory">
                      <span className="text-xs uppercase tracking-wider font-bold text-gold">Final Total Paid</span>
                      <span className="text-xl font-serif font-bold text-gold">
                        ₱{(currentData.total_amount ?? ((currentData.subtotal ?? 0) + (currentData.reservation_fee ?? 50))).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Cancelled / No Show: Show Voided / Unbilled Status */
                  <div className="p-4 bg-black/20 space-y-2">
                    <div className="flex justify-between text-xs text-ivory-dim">
                      <span>Original Service Quote</span>
                      <span className={isCancelled || isNoShow ? "line-through" : ""}>₱{(currentData.subtotal ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {(currentData.reservation_fee ?? 50) > 0 && (
                      <div className="flex justify-between text-xs text-ivory-dim">
                        <span>Reservation Fee</span>
                        <span className="text-emerald-400 font-medium">₱{(currentData.reservation_fee ?? 50).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline pt-2 border-t border-white/10 text-ivory">
                      <span className="text-xs uppercase tracking-wider font-bold text-ivory-dim/80">Billing Status</span>
                      <span className={isCancelled || isNoShow ? "text-sm font-semibold text-red-400 uppercase tracking-wider" : "text-xl font-serif font-bold text-gold"}>
                        {isCancelled ? 'No Charges Billed' : isNoShow ? 'Unfulfilled' : `₱${(currentData.total_amount ?? ((currentData.subtotal ?? 0) + (currentData.reservation_fee ?? 50))).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* TRANSACTION & PAYMENT INFO                                                */}
            {/* ========================================================================= */}
            {isCompleted ? (
              /* Completed: Full Payment & Receipt Info */
              <div className="space-y-3">
                <h3 className="text-sm font-serif font-bold text-ivory tracking-wide flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-gold" />
                  <span>Transaction & Payment Info</span>
                </h3>

                <div className="p-4 rounded-sm bg-charcoal-light/30 border border-white/5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-ivory-dim">Payment Method</span>
                    {renderPaymentMethodBadge(currentData.payment_method)}
                  </div>

                  {/* Split Payment Breakdown */}
                  {currentData.split_breakdown && currentData.split_breakdown.length > 1 && (
                    <div className="p-3 rounded bg-black/30 border border-white/5 space-y-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-gold font-semibold block">
                        Split Breakdown
                      </span>
                      {currentData.split_breakdown.map((split, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-ivory-dim">
                          <span>{split.method}:</span>
                          <span className="font-medium text-ivory">
                            ₱{split.amount.toLocaleString()} {split.reference ? `(Ref: ${split.reference})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs text-ivory-dim">
                    <span>Reference / Receipt No.</span>
                    <span className="font-mono text-gold font-semibold">{currentData.reference_number || `RES-${currentData.id}`}</span>
                  </div>

                  {currentData.transaction_date && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ivory-dim/70">
                      <span>Transaction Timestamp</span>
                      <span>
                        {isNaN(Date.parse(currentData.transaction_date))
                          ? currentData.transaction_date
                          : new Date(currentData.transaction_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Cancelled / No Show: Summary Reference */
              <div className="space-y-3">
                <h3 className="text-sm font-serif font-bold text-ivory tracking-wide flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-gold" />
                  <span>Booking Reference & Record</span>
                </h3>

                <div className="p-4 rounded-sm bg-charcoal-light/30 border border-white/5 space-y-2 text-xs text-ivory-dim">
                  <div className="flex justify-between items-center">
                    <span>Booking Reference ID</span>
                    <span className="font-mono text-gold font-semibold">#{currentData.id}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-white/5">
                    <span>Status Outcome</span>
                    <span className="font-semibold text-red-400 uppercase tracking-wider">{statusText}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* HAIRCUT REFERENCE PHOTO: ONLY FOR COMPLETED SESSIONS                      */}
            {/* ========================================================================= */}
            {isCompleted && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-serif font-bold text-ivory tracking-wide flex items-center gap-2">
                    <Camera className="w-4 h-4 text-gold" />
                    <span>Haircut Reference Photo</span>
                  </h3>
                  {canUploadPhoto && currentData.haircut_photo_url && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-xs text-gold hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                        title="Replace Photo"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Replace</span>
                      </button>
                      <span className="text-white/20">|</span>
                      <button
                        type="button"
                        onClick={handlePhotoDelete}
                        disabled={isDeleting}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Delete Photo"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}
                </div>

                {currentData.haircut_photo_url ? (
                  <div className="relative group/thumbnail overflow-hidden rounded-sm border border-gold/30 hover:border-gold transition-all bg-black/40 p-2 flex items-center gap-4">
                    <div
                      onClick={() => setLightboxOpen(true)}
                      className="relative w-24 h-24 sm:w-28 sm:h-28 rounded overflow-hidden cursor-zoom-in shrink-0 shadow-lg group-hover/thumbnail:shadow-gold/20"
                    >
                      <img
                        src={currentData.haircut_photo_url}
                        alt="Haircut session"
                        width={112}
                        height={112}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover/thumbnail:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumbnail:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ZoomIn className="w-6 h-6 text-gold" />
                      </div>
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-ivory flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-gold" />
                        Visual Styling Reference
                      </span>
                      <p className="text-xs text-ivory-dim/80 line-clamp-2">
                        Photo recorded for your barber style lookbook and next appointment cut reference.
                      </p>
                      <button
                        type="button"
                        onClick={() => setLightboxOpen(true)}
                        className="text-xs text-gold hover:underline flex items-center gap-1 pt-1 font-medium cursor-pointer"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>Click thumbnail for full photo & zoom</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Empty Photo State / Upload Box */
                  <div className="p-6 rounded-sm border border-dashed border-white/20 bg-charcoal-light/20 text-center flex flex-col items-center justify-center gap-2.5">
                    <Camera className="w-8 h-8 text-ivory-dim/40" />
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-ivory block">No haircut photo attached</span>
                      <p className="text-[11px] text-ivory-dim/60 max-w-xs">
                        {canUploadPhoto
                          ? 'Upload a photo of your fresh cut so your barber has visual reference on your next visit.'
                          : 'Haircut photos can be uploaded for completed and paid appointments.'}
                      </p>
                      {canUploadPhoto && (
                        <p className="text-[10px] text-gold/80 font-medium pt-0.5">
                          Only JPEG and PNG images are allowed (max 5 MB).
                        </p>
                      )}
                    </div>

                    {canUploadPhoto && (
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-xs py-2 px-4 border-gold/40 text-gold hover:bg-gold/10 flex items-center gap-1.5 mt-1"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload Haircut Photo</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-white/5 bg-charcoal-light/40 flex justify-between items-center shrink-0 gap-3">
            <span className="text-xs text-ivory-dim/60 font-mono">
              Ticket #{currentData.id}
            </span>

            <div className="flex items-center gap-3">
              {(isCancelled || isNoShow) && onRebook && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const rebookItem = currentData || item;
                    onClose();
                    onRebook(rebookItem);
                  }}
                  className="text-xs flex items-center gap-1.5 px-4 py-2"
                >
                  <span>Book Again</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                variant="outline"
                onClick={onClose}
                className="text-xs border-white/20 text-ivory hover:border-gold hover:text-gold px-6"
              >
                Close Details
              </Button>
            </div>
          </div>
        </div>
      </div>

      <RescheduleAppointmentModal appointment={rescheduleOpen ? rescheduleAppointment : null} onClose={() => setRescheduleOpen(false)} onCompleted={() => { setRescheduleOpen(false); onClose(); }} />

      {/* Fullscreen Lightbox with Zoom & Pan */}
      {lightboxOpen && currentData.haircut_photo_url && (
        <div
          className="fixed inset-0 z-[110] bg-black/95 flex flex-col items-center justify-between p-4 md:p-6 animate-fade-in select-none"
          onClick={() => {
            setLightboxOpen(false);
            handleResetZoom();
          }}
        >
          {/* Lightbox Top Bar */}
          <div
            className="w-full max-w-4xl flex items-center justify-between text-white z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-gold" />
              <span className="text-xs font-semibold text-ivory">Haircut Reference Preview</span>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2 bg-charcoal/90 border border-white/10 rounded-full px-3 py-1.5 shadow-xl">
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3.5}
                className="p-1 hover:text-gold text-ivory-dim disabled:opacity-30 transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-1.5 text-gold">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 1}
                className="p-1 hover:text-gold text-ivory-dim disabled:opacity-30 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 hover:text-gold text-ivory-dim transition-colors ml-1 border-l border-white/10 pl-2"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setLightboxOpen(false);
                  handleResetZoom();
                }}
                className="p-1 hover:text-red-400 text-ivory-dim transition-colors ml-1 border-l border-white/10 pl-2"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lightbox Image Container with Pan / Zoom */}
          <div
            className="flex-1 w-full max-w-4xl flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing my-auto"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={currentData.haircut_photo_url}
              alt="Haircut session enlarged"
              width={800}
              height={800}
              loading="lazy"
              decoding="async"
              draggable={false}
              style={{
                transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
              }}
              className="max-w-[90vw] max-h-[80vh] w-auto h-auto object-contain rounded-sm border border-gold/30 shadow-2xl"
            />
          </div>

          {/* Lightbox Footer Caption */}
          <div
            className="text-center text-xs text-ivory-dim/70 z-20 max-w-md pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{currentData.date} • {currentData.barber_name}</span>
            {zoomLevel > 1 && <span className="block text-[11px] text-gold/80">Click and drag to pan image</span>}
          </div>
        </div>
      )}
    </Portal>
  );
};
