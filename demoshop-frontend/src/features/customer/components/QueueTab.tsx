import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Clock, Scissors, X, ChevronRight, AlertTriangle, Loader2, Calendar, Sparkles, ShieldCheck, Users, Copy, Info, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';
import { useAuth } from '@/components/auth/AuthContext';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';
import { FeedbackModal } from './FeedbackModal';
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal';
import { Modal } from '@/components/feedback/Modal';
import { formatManilaDate, formatManilaTime, reservationTimeToEpoch, getManilaDateIso } from '@/utils/manila-date';
import { calculateQueueCompletionEstimates } from '@/utils/queue-estimates';
import { resolveCustomerQueueEntry, selectGroupQueueEntry } from '../services/customer-queue-state';
import { GroupQueueCards, guestQueueStatusLabel } from './GroupQueueCards';

const CANCELLATION_NOTICE_MS = 24 * 60 * 60 * 1000;

const CUSTOMER_CANCELLATION_REASONS = [
    'Change of plans',
    'Cannot make the appointment',
    'Booked the wrong service, barber, or time',
    'Found another appointment',
    'Other',
] as const;

const getInitials = (name?: string | null): string => {
    if (!name) return 'VP';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatDisplayDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    const match = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return String(dateStr);
    const date = new Date(`${match[1]}T12:00:00Z`);
    if (isNaN(date.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(date);
};

const getArrivalWindow = (preferredTime: string | null | undefined): { start: string; end: string; endExact: string } | null => {
    if (!preferredTime) return null;
    let hours = 0;
    let minutes = 0;

    const match24 = preferredTime.match(/^(\d{1,2}):(\d{2})/);
    if (match24) {
        hours = parseInt(match24[1], 10);
        minutes = parseInt(match24[2], 10);
        if (/pm/i.test(preferredTime) && hours < 12) {
            hours += 12;
        } else if (/am/i.test(preferredTime) && hours === 12) {
            hours = 0;
        } else if (!/am|pm/i.test(preferredTime) && hours >= 1 && hours <= 8) {
            hours += 12;
        }
    } else {
        return null;
    }

    const totalMinutes = hours * 60 + minutes;
    const startMins = Math.max(0, totalMinutes - 10);
    const endMins = totalMinutes + 10;

    const formatMins = (totalM: number, includeAmPm = true) => {
        let h = Math.floor(totalM / 60) % 24;
        const m = totalM % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        if (h === 0) h = 12;
        const mStr = m.toString().padStart(2, '0');
        return includeAmPm ? `${h}:${mStr} ${ampm}` : `${h}:${mStr}`;
    };

    return {
        start: formatMins(startMins, false),
        end: formatMins(endMins, true),
        endExact: formatMins(endMins, true),
    };
};


interface QueuePositionProps {
    customerId: number;
    barberId: number;
    queueId?: number;
}

export const QueuePosition: React.FC<QueuePositionProps> = ({ customerId, barberId, queueId }) => {
    const [position, setPosition] = useState<number | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const { supabaseToken } = useAuth();

    const calculatePosition = async () => {
        const { data, error } = await supabase
            .from('queue_entries')
            .select('id, customer_id')
            .eq('barber_id', barberId)
            .in('status', ['waiting', 'serving'])
            .order('position', { ascending: true });

        if (error) {
            console.error('[QueuePosition] Error:', error);
            return;
        }

        // Calculate position by finding our ID index in the waiting list
        const index = data.findIndex(item => queueId ? item.id === queueId : item.customer_id === customerId);
        setPosition(index !== -1 ? index + 1 : null);
        setLoading(false);
    };



    useEffect(() => {
        if (!customerId) return;

        calculatePosition();

        // ─── Set Realtime Auth ───
        // We use the in-memory token from AuthContext instead of localStorage
        // This ensures the WebSocket connection is correctly identified by Supabase RLS
        if (supabaseToken) {
            supabase.realtime.setAuth(supabaseToken);
        }

        const realtimeGroup = barberId ? createHasuraFallbackGroup({
            onFallbackActivate: calculatePosition,
            onBothUnavailable: calculatePosition,
            degradedIntervalMs: 60_000,
            subscribeFallback: (onStatus) => {
                const channel = supabase
                    .channel(`queue-position-${customerId}-${barberId}-fallback`)
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'queue_entries', filter: `barber_id=eq.${barberId}` },
                        () => { void calculatePosition(); }
                    )
                    .subscribe(onStatus);
                return () => { void supabase.removeChannel(channel); };
            },
        }) : null;
        realtimeGroup?.subscribe(
                `subscription WatchCustomerQueuePosition($barberId: Int!) {
                   queue_entries(where: { barber_id: { _eq: $barberId } }, order_by: { position: asc }, limit: 50) {
                     id
                     position
                     status
                   }
                 }`,
                { barberId },
                () => {
                    calculatePosition();
                }
            );

        return () => {
            realtimeGroup?.cleanup();
        };
    }, [customerId, barberId, supabaseToken]);

    if (loading) return (
        <div className="flex items-center justify-center gap-2 text-ivory-dim text-sm animate-pulse py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Calculating live position...</span>
        </div>
    );

    if (position === null) return null;

    return (
        <div className="text-center py-2">
            <p className="text-[10px] uppercase tracking-widest text-ivory-dim font-bold mb-1">
                Live Queue Sync
            </p>
            <p className="text-lg font-bold text-gold">
                Code MCH-{String(queueId || '').padStart(4, '0')} is #{position} in line
            </p>
        </div>
    );
};

interface QueueTabProps {
    activeQueue: any;
    setActiveQueue: React.Dispatch<React.SetStateAction<any>>;
    setActiveTab: (tab: string) => void;
    resetBookingForm?: () => void;
    barbers?: any[];
    services?: any[];
    branches?: any[];
    onBookingConfirmed?: (data: any) => void;
}

export const QueueTab: React.FC<QueueTabProps> = ({
    activeQueue: serverActiveQueue,
    setActiveQueue,
    setActiveTab,
    resetBookingForm,
    barbers,
    services,
    branches,
    onBookingConfirmed,
}) => {
    const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
    const [mobileQueuePanel, setMobileQueuePanel] = useState<'lineup' | 'bill'>('lineup');
    const activeQueue = useMemo(() => selectGroupQueueEntry(serverActiveQueue, selectedGuestId), [serverActiveQueue, selectedGuestId]);
    const [queueList, setQueueList] = useState<any[]>([]);
    const [timeLeft, setTimeLeft] = useState<number | null>(null); // seconds remaining
    const [isLeaving, setIsLeaving] = useState<boolean>(false);
    const [isAdvancing, setIsAdvancing] = useState<boolean>(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState<boolean>(false);
    const [lastActiveQueueItem, setLastActiveQueueItem] = useState<any | null>(null);
    const [isCancellationModalOpen, setIsCancellationModalOpen] = useState<boolean>(false);
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState<boolean>(false);
    const [rescheduleSnapshot, setRescheduleSnapshot] = useState<any | null>(null);
    const [hasRescheduled, setHasRescheduled] = useState(() => Boolean(activeQueue?.id && localStorage.getItem(`appointment-rescheduled:${activeQueue.id}`)));
    const [cancellationReason, setCancellationReason] = useState<string>('');
    const [customCancellationReason, setCustomCancellationReason] = useState<string>('');
    const [cancellationClockMs, setCancellationClockMs] = useState(() => Date.now());
    const { addToast } = useToast();
    const { supabaseToken } = useAuth();
    const timerRef = useRef<any>(null);
    const channelRef = useRef<any>(null);
    const [showInlineCancelConfirm, setShowInlineCancelConfirm] = useState<boolean>(false);
    const [copiedRef, setCopiedRef] = useState<boolean>(false);

    const arrivalWindow = useMemo(() => {
        return getArrivalWindow(activeQueue?.preferred_time);
    }, [activeQueue?.preferred_time]);

    const copyReference = () => {
        if (!activeQueue?.id) return;
        const refText = `#MCH-${String(activeQueue.id).padStart(4, '0')}`;
        navigator.clipboard.writeText(refText);
        setCopiedRef(true);
        addToast({
            type: 'success',
            title: 'Copied to clipboard',
            message: `Reference ${refText} copied.`,
            duration: 2500,
        });
        setTimeout(() => setCopiedRef(false), 2000);
    };

    const handleInlineCancel = async () => {
        if (!activeQueue || isLeaving) return;
        const backupQueue = activeQueue;
        const queueId = backupQueue.id || backupQueue.queue_id || backupQueue.queueId;
        if (!queueId) return;

        setIsLeaving(true);
        setShowInlineCancelConfirm(false);

        // Optimistic update
        setActiveQueue(null);
        resetBookingForm?.();
        setActiveTab('book');

        try {
            await api.post(`/api/queue/cancel/${queueId}`, {
                reason: 'Customer cancelled reservation',
                cancelType: 'customer_side',
            });
            addToast({
                type: 'info',
                title: 'Reservation cancelled',
                message: 'Your booking has been cancelled.',
            });
        } catch (err: any) {
            console.error('[QueueTab] Failed to cancel reservation:', err);
            setActiveQueue(backupQueue);
            addToast({
                type: 'error',
                title: 'Cancellation failed',
                message: err?.response?.data?.error || err?.response?.data?.message || 'Could not cancel reservation.',
            });
        } finally {
            setIsLeaving(false);
        }
    };


    // Add a ref to avoid stale closures in refreshQueue
    const activeQueueRef = useRef<any>(activeQueue);

    // Update ref whenever activeQueue changes
    useEffect(() => {
        activeQueueRef.current = activeQueue;
    }, [activeQueue]);

    // Find display data from static data
    const barber = barbers?.find((b: any) => Number(b.id ?? b.barber_id) === Number(activeQueue?.barber_id))
        || (activeQueue?.barber_name ? { name: activeQueue.barber_name, image: activeQueue.barber_image } : null);
    const service = services?.find((s: any) => Number(s.id ?? s.service_id) === Number(activeQueue?.service_id)) || null;
    const branch = branches?.find((b: any) => Number(b.id ?? b.branch_id) === Number(activeQueue?.branch_id)) || null;

    const activeServiceIds = Array.isArray(activeQueue?.service_ids) && activeQueue.service_ids.length > 0
        ? activeQueue.service_ids
        : (activeQueue?.service_id ? [activeQueue.service_id] : []);

    const matchedServices = useMemo(() => {
        let matched = activeServiceIds
            .map((id: any) => services?.find((s: any) => Number(s.id ?? s.service_id) === Number(id)))
            .filter(Boolean);

        if (matched.length <= 1 && typeof activeQueue?.service_name === 'string') {
            const separator = activeQueue.service_name.includes(' + ') ? ' + ' : (activeQueue.service_name.includes(',') ? ',' : null);
            if (separator) {
                const parts = activeQueue.service_name.split(separator).map((p: string) => p.trim().toLowerCase());
                const titleMatched = services?.filter((s: any) => {
                    const title = (s.title || s.name || '').trim().toLowerCase();
                    return parts.includes(title);
                }) || [];
                if (titleMatched.length > matched.length) {
                    matched = titleMatched;
                }
            }
        }
        return matched;
    }, [activeServiceIds, services, activeQueue?.service_name]);

    const serviceTitle = matchedServices.length > 0
        ? matchedServices.map((s: any) => s.name || s.title).join(' + ')
        : (service?.name || 'Grooming Service');

    const totalServicePrice = matchedServices.length > 0
        ? matchedServices.reduce((sum: number, s: any) => sum + (Number(String(s.price ?? '').replace(/[^\d.]/g, '')) || 0), 0)
        : (Number(String(activeQueue?.service_price ?? service?.price ?? '').replace(/[^\d.]/g, '')) || 0);

    const isGroup = Boolean(
        activeQueue?.is_group ||
        activeQueue?.isGroup ||
        activeQueue?.group_booking_id ||
        (Array.isArray(activeQueue?.group_entries) && activeQueue.group_entries.length > 1) ||
        (Array.isArray(activeQueue?.entries) && activeQueue.entries.length > 1) ||
        (Number(activeQueue?.total_guests) > 1)
    );

    const rawGroupEntries: any[] = Array.isArray(activeQueue?.group_entries) && activeQueue.group_entries.length > 0
        ? activeQueue.group_entries
        : (Array.isArray(activeQueue?.entries) && activeQueue.entries.length > 0 ? activeQueue.entries : []);

    const totalGuests = isGroup
        ? Math.max(Number(activeQueue?.total_guests) || 0, rawGroupEntries.length || 0, 1)
        : 1;

    const groupDeposit = isGroup
        ? (Number(activeQueue?.total_deposit) || totalGuests * 50)
        : 50;

    const enrichedGroupGuests = useMemo(() => {
        if (!isGroup) return [];
        if (rawGroupEntries.length > 0) {
            return rawGroupEntries.map((entry: any, idx: number) => {
                const guestBarber = barbers?.find((b: any) => Number(b.id ?? b.barber_id) === Number(entry.barber_id))
                    || (entry.barber_name ? { name: entry.barber_name, image: entry.barber_image } : barber);

                const guestServiceIds = Array.isArray(entry.service_ids) && entry.service_ids.length > 0
                    ? entry.service_ids
                    : (entry.service_id ? [entry.service_id] : []);

                const guestMatchedServices = guestServiceIds
                    .map((id: any) => services?.find((s: any) => Number(s.id ?? s.service_id) === Number(id)))
                    .filter(Boolean);

                const guestServiceTitle = guestMatchedServices.length > 0
                    ? guestMatchedServices.map((s: any) => s.name || s.title).join(' + ')
                    : (entry.service_name || service?.name || 'Grooming Service');

                const guestPrice = guestMatchedServices.length > 0
                    ? guestMatchedServices.reduce((sum: number, s: any) => sum + (Number(String(s.price ?? '').replace(/[^\d.]/g, '')) || 0), 0)
                    : (Number(String(entry.service_price || '').replace(/[^\d.]/g, '')) || totalServicePrice);

                return {
                    id: entry.id || idx,
                    reference: `MCH-${String(entry.id).padStart(4, '0')}`,
                    status: String(entry.status || '').toLowerCase(),
                    name: entry.guest_name || entry.customer_name || `Guest ${idx + 1}`,
                    barber: guestBarber,
                    serviceTitle: guestServiceTitle,
                    price: guestPrice,
                    scheduledDate: entry.preferred_date,
                    scheduledTime: entry.preferred_time,
                };
            });
        }
        return [];
    }, [isGroup, rawGroupEntries, barbers, services, barber, service, totalServicePrice]);

    const totalGroupServicesPrice = isGroup && enrichedGroupGuests.length > 0
        ? enrichedGroupGuests.reduce((sum, g) => sum + g.price, 0)
        : totalServicePrice;

    const reservationFee = isGroup ? groupDeposit : 50;
    const totalAmount = (isGroup && enrichedGroupGuests.length > 0 ? totalGroupServicesPrice : totalServicePrice) + reservationFee;
    const scheduledStartMs = activeQueue?.scheduled_start_at
        ? new Date(activeQueue.scheduled_start_at).getTime()
        : reservationTimeToEpoch(activeQueue?.preferred_date, activeQueue?.preferred_time);
    const activeQueueStatus = String(activeQueue?.status || '').toLowerCase();
    const groupCheckInStarted = ['checked_in', 'partially_checked_in'].includes(String(activeQueue?.group_booking?.status || '').toLowerCase());
    const checkInCommenced = groupCheckInStarted || ['waiting', 'serving', 'completed', 'no_show'].includes(activeQueueStatus);
    const isConfirmedStatus = ['accepted', 'late'].includes(activeQueueStatus);
    const canCancelReservation = scheduledStartMs !== null
        && Number.isFinite(scheduledStartMs)
        && scheduledStartMs - cancellationClockMs >= CANCELLATION_NOTICE_MS
        && isConfirmedStatus
        && !checkInCommenced;
    const canRescheduleAppointment = ['pending', 'accepted', 'confirmed'].includes(String(activeQueue?.status || '').toLowerCase())
        && scheduledStartMs !== null
        && Number.isFinite(scheduledStartMs)
        && scheduledStartMs - cancellationClockMs >= CANCELLATION_NOTICE_MS;
    const rescheduleAppointment = {
        ...activeQueue,
        queue_entry_id: activeQueue?.id,
        barber_name: activeQueue?.barber_name || barber?.name || 'Your barber',
        services: matchedServices.map((serviceItem: any) => ({
            service_id: serviceItem.id ?? serviceItem.service_id,
        })),
    };

    useEffect(() => {
        const updateCancellationClock = () => setCancellationClockMs(Date.now());
        updateCancellationClock();
        const clock = window.setInterval(updateCancellationClock, 30_000);
        return () => window.clearInterval(clock);
    }, [activeQueue?.id, activeQueue?.scheduled_start_at, activeQueue?.preferred_date, activeQueue?.preferred_time]);


    // Fetch the current queue for this barber
    const refreshQueue = useCallback(async () => {
        const currentActiveQueue = activeQueueRef.current;
        if (!currentActiveQueue?.id) return;
        try {
            // Fetch the actual entry to verify the status
            const finalRes = await api.get(`/api/queue/${currentActiveQueue.id}`);
            const myEntry = await resolveCustomerQueueEntry(finalRes.data, async () => {
                const response = await api.get('/api/queue/my-position');
                return response.data;
            });
            if (String(activeQueueRef.current?.id) !== String(currentActiveQueue.id)) return;
            if (!myEntry) {
                if (finalRes.data?.status === 'completed') {
                    setLastActiveQueueItem(currentActiveQueue);
                    setIsFeedbackModalOpen(true);
                    addToast({
                        type: 'info',
                        title: 'Queue Finished',
                        message: 'Your service has been completed. Thank you!',
                        duration: 4000,
                    });
                }
                setActiveQueue(null);
                resetBookingForm?.();
                setActiveTab('book');
                return;
            }

            const fetchBarberQueueToday = async (barberId: number) => {
                try {
                    const today = getManilaDateIso();
                    const res = await api.get(`/api/queue/barber/${barberId}?date=${today}`);
                    if (Number(activeQueueRef.current?.barber_id) === Number(barberId)) {
                        setQueueList(Array.isArray(res.data) ? res.data : []);
                    }
                } catch {
                    setQueueList([]);
                }
            };

            if (myEntry.status === 'pending' || myEntry.status === 'accepted' || myEntry.status === 'confirmed' || myEntry.status === 'late') {
                if (currentActiveQueue.status === 'pending' && myEntry.status === 'accepted') {
                    onBookingConfirmed?.({
                        id: myEntry.id,
                        barberName: myEntry.barber_name || myEntry.barber?.name || barber?.name,
                        serviceName: myEntry.service_name || myEntry.service?.name || serviceTitle,
                        preferredDate: myEntry.preferred_date || myEntry.scheduled_start_at,
                        preferredTime: myEntry.preferred_time,
                        branchName: myEntry.branch_name || myEntry.branch?.name,
                    });
                }
                setActiveQueue(myEntry);
                if (myEntry.barber_id) {
                    await fetchBarberQueueToday(myEntry.barber_id);
                } else {
                    setQueueList([]);
                }
                return;
            }

            if (myEntry.status === 'waiting' || myEntry.status === 'serving') {
                setActiveQueue(myEntry);
                if (myEntry.barber_id) {
                    await fetchBarberQueueToday(myEntry.barber_id);
                } else {
                    setQueueList([]);
                }
            } else {
                setActiveQueue(null);
                resetBookingForm?.();
                setActiveTab('book');
            }
        } catch (err) {
            console.error('[QueueTab] Failed to refresh queue:', err);
        }
    }, [setActiveQueue, setActiveTab, addToast, resetBookingForm]);

    // Subscribe to Supabase Realtime on mount
    useEffect(() => {
        if (!activeQueue?.barber_id) return;

        // Initial fetch
        refreshQueue();

        // Set Realtime Auth 
        if (supabaseToken) {
            supabase.realtime.setAuth(supabaseToken);
        }

        const activeBarberId = activeQueue.barber_id;
        const realtimeGroup = createHasuraFallbackGroup({
            onFallbackActivate: refreshQueue,
            onBothUnavailable: refreshQueue,
            degradedIntervalMs: 60_000,
            subscribeFallback: (onStatus) => {
                const channel = supabase
                    .channel(`queue-barber-${activeBarberId}-fallback`)
                    .on(
                        'postgres_changes',
                        {
                            event: '*',
                            schema: 'public',
                            table: 'queue_entries',
                            filter: `barber_id=eq.${activeBarberId}`,
                        },
                        () => { void refreshQueue(); }
                    )
                    .subscribe(onStatus);
                return () => { void supabase.removeChannel(channel); };
            },
        });
        realtimeGroup.subscribe(
                `subscription WatchBarberActiveQueue($barberId: Int!) {
                   queue_entries(where: { barber_id: { _eq: $barberId } }, order_by: { id: desc }, limit: 20) {
                     id
                     status
                     created_at
                   }
                 }`,
                { barberId: activeBarberId },
                () => {
                    refreshQueue();
                }
            );

        return () => {
            realtimeGroup.cleanup();
        };
    }, [activeQueue?.id, activeQueue?.barber_id, refreshQueue, supabaseToken]);

    // Timer logic: derive countdown from server timestamp
    useEffect(() => {
        // Clear any existing timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        const isLate = activeQueue?.status === 'late';
        const deadline = isLate && activeQueue?.arrival_deadline_at
            ? new Date(activeQueue.arrival_deadline_at).getTime()
            : null;
        const serviceEnd = activeQueue?.service_ends_at
            ? new Date(activeQueue.service_ends_at).getTime()
            : activeQueue?.service_started_at && activeQueue?.duration_minutes
                ? new Date(activeQueue.service_started_at).getTime() + Number(activeQueue.duration_minutes) * 60 * 1000
                : activeQueue?.status === 'serving' && activeQueue?.timer_started_at && activeQueue?.duration_minutes
                    ? new Date(activeQueue.timer_started_at).getTime() + Number(activeQueue.duration_minutes) * 60 * 1000
                    : null;
        const endTime = deadline ?? (activeQueue?.status === 'serving' ? serviceEnd : null);

        if (endTime === null) {
            setTimeLeft(null);
            return;
        }

        const tick = () => {
            const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(timerRef.current);
                timerRef.current = null;
                refreshQueue();
            }
        };

        tick();
        timerRef.current = setInterval(tick, 1000);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [activeQueue?.id, activeQueue?.status, activeQueue?.timer_started_at, activeQueue?.service_started_at, activeQueue?.service_ends_at, activeQueue?.arrival_deadline_at, activeQueue?.duration_minutes, refreshQueue]);

    // Format seconds to MM:SS
    const formatTime = (seconds: number | null) => {
        if (seconds === null) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const openCancellationModal = () => {
        if (!activeQueue || isLeaving) return;
        if (!canCancelReservation) {
            addToast({
                type: 'error',
                title: 'Cancellation unavailable',
                message: 'Cancellations are only allowed at least 24 hours in advance. The ₱50 fee is non-refundable.',
                duration: 5000,
            });
            return;
        }
        setCancellationReason('');
        setCustomCancellationReason('');
        setIsCancellationModalOpen(true);
    };

    // Leave queue handler after the customer confirms a reason.
    const handleLeaveQueue = async () => {
        if (!activeQueue || isLeaving) return;

        if (!canCancelReservation) {
            setIsCancellationModalOpen(false);
            addToast({
                type: 'error',
                title: 'Cancellation unavailable',
                message: checkInCommenced
                    ? 'This booking has already started check-in and cannot be cancelled.'
                    : 'Cancellations are only allowed at least 24 hours in advance. The ₱50 fee is non-refundable.',
                duration: 5000,
            });
            return;
        }

        const finalReason = cancellationReason === 'Other'
            ? customCancellationReason.trim()
            : cancellationReason;

        if (!cancellationReason) {
            addToast({
                type: 'error',
                title: 'Select a reason',
                message: 'Please select why you are cancelling this booking.',
                duration: 4000,
            });
            return;
        }

        if (cancellationReason === 'Other' && !finalReason) {
            addToast({
                type: 'error',
                title: 'Add a reason',
                message: 'Please tell us why you are cancelling this booking.',
                duration: 4000,
            });
            return;
        }

        const backupQueue = activeQueue;
        const queueId = backupQueue.id || backupQueue.queue_id || backupQueue.queueId;

        if (!queueId) {
            console.error('[QueueTab] Cannot leave queue: missing queue ID on activeQueue', backupQueue);
            addToast({
                type: 'error',
                title: 'Error',
                message: 'Unable to identify active queue entry.',
                duration: 4000,
            });
            return;
        }

        setIsLeaving(true);
        setIsCancellationModalOpen(false);

        // Optimistic update: immediately clear state, reset booking form to Step 1, and switch tab.
        setActiveQueue(null);
        resetBookingForm?.();
        setActiveTab('book');

        try {
            await api.post(`/api/queue/cancel/${queueId}`, {
                reason: finalReason,
                cancelType: 'customer_side',
            });

            addToast({
                type: 'info',
                title: 'Booking Cancelled',
                message: 'Your booking has been cancelled. The cashier has been notified.',
                duration: 4000,
            });
        } catch (err: any) {
            console.error('[QueueTab] Failed to leave queue, rolling back:', err.response?.data || err);

            // Rollback: restore state and switch tab back.
            setActiveQueue(backupQueue);
            setActiveTab('queue');

            addToast({
                type: 'error',
                title: 'Error',
                message: err.response?.data?.message || err.response?.data?.error || 'Failed to cancel the booking. Reverted to queue.',
                duration: 5000,
            });
        } finally {
            setIsLeaving(false);
        }
    };

    // Advance queue (demo button)
    const handleAdvanceQueue = async () => {
        setIsAdvancing(true);
        try {
            await api.post(`/api/queue/advance/${activeQueue.barber_id}`);
            addToast({
                type: 'success',
                title: 'Queue Advanced',
                message: 'The queue has been moved forward.',
                duration: 3000,
            });
        } catch (err) {
            console.error('[QueueTab] Failed to advance queue:', err);
        } finally {
            setIsAdvancing(false);
        }
    };

    const isUrgent = timeLeft !== null && timeLeft < 120; // less than 2 minutes
    const isServing = activeQueue?.status === 'serving';
    const isLate = activeQueue?.status === 'late';
    const isNoShow = activeQueue?.status === 'no_show';
    const mobileProgressStep = isServing ? 3 : activeQueue?.status === 'waiting' ? 2 : activeQueue?.status === 'pending' ? 0 : 1;

    const isFutureScheduledReservation = Boolean(
        activeQueue?.scheduled_start_at
        && new Date(activeQueue.scheduled_start_at).getTime() > Date.now(),
    );
    const scheduledAppointmentTime = activeQueue?.scheduled_start_at
        ? new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(activeQueue.scheduled_start_at))
        : '';

    // Calculate the queue wait using the same reservation-aware lane timeline as staff.
    const getActiveQueueEstimate = () => {
        if (!activeQueue) return null;

        const safeDuration = (value: unknown): number => {
            const duration = Number(value);
            return Number.isFinite(duration) && duration > 0 && duration <= 720 ? duration : 30;
        };

        const lane = Array.isArray(queueList)
            ? [...queueList]
                .filter((entry) => ['serving', 'waiting', 'late', 'accepted'].includes(String(entry.status).toLowerCase()))
            : [];
        if (!lane.some((entry) => String(entry.id) === String(activeQueue.id))) lane.push(activeQueue);
        lane.sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
        const estimates = calculateQueueCompletionEstimates(lane.map((entry) => ({
            id: entry.id,
            status: entry.status,
            is_walk_in: entry.is_walk_in,
            duration_minutes: safeDuration(entry.duration_minutes),
            scheduled_start_at: entry.scheduled_start_at,
            estimated_start_at: entry.estimated_start_at,
            timer_started_at: entry.timer_started_at,
            service_started_at: entry.service_started_at,
            service_ends_at: entry.service_ends_at,
            barber_status: entry.barber_status || activeQueue.barber_status,
            barber_break_started_at: entry.barber_break_started_at || activeQueue.barber_break_started_at,
        })));
        return estimates.get(String(activeQueue.id)) || null;
    };

    const activeQueueEstimate = getActiveQueueEstimate();
    const estimatedWaitTime = !isServing && activeQueueEstimate
        ? Math.max(0, Math.ceil((activeQueueEstimate.estimated_start_time - Date.now()) / 60_000))
        : 0;
    const estimatedStartLabel = activeQueueEstimate
        ? new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(activeQueueEstimate.estimated_start_time))
        : null;
    const estimatedCompletionLabel = activeQueueEstimate
        ? new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(activeQueueEstimate.estimated_completion_time))
        : null;

    const assignedBarberName = activeQueue?.barber_name || activeQueue?.barber?.name || barber?.name || 'Assigned Barber';
    const isAssignedBarberOnBreak = ['on_break', 'break'].includes(
        String(activeQueue?.barber_status || barber?.status || '').trim().toLowerCase().replace(/[\s-]+/g, '_'),
    );

    const todayBarberQueue = useMemo(() => {
        if (!Array.isArray(queueList) || !activeQueue?.barber_id) return [];
        return queueList.filter((entry) => {
            if (entry.barber_id && Number(entry.barber_id) !== Number(activeQueue.barber_id)) {
                return false;
            }
            return ['serving', 'waiting', 'late'].includes(entry.status);
        });
    }, [queueList, activeQueue?.barber_id]);

    return (
        <div className="w-full min-w-0 max-w-md lg:max-w-5xl mx-auto space-y-3 py-2 lg:space-y-6 lg:py-4">

            {isGroup && enrichedGroupGuests.length > 0 && (
                <GroupQueueCards
                    guests={enrichedGroupGuests}
                    selectedId={activeQueue.id}
                    onSelect={id => {
                        setQueueList([]);
                        setTimeLeft(null);
                        setSelectedGuestId(id);
                        setMobileQueuePanel('lineup');
                    }}
                />
            )}

            {/* Desktop View (lg and up) - Preserves luxury 2-column layout */}
            <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8 items-stretch">
                {/* Left Column: Queue Status Display */}
                <div className={`relative overflow-hidden bg-white/5 border rounded-sm p-6 sm:p-7 flex flex-col items-center justify-between text-center transition-all duration-500 group hover:border-gold/40 hover:shadow-lg card-gold-accent ${isServing
                    ? isUrgent
                        ? 'border-red-500/40 bg-red-500/5'
                        : 'border-gold/40 bg-gold/5'
                    : 'border-white/10'
                    }`}>
                    {/* Subtle Top Gold Accent Line */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>

                    {/* Top Status Capsule */}
                    <div className="w-full flex items-center justify-center pt-1">
                        {activeQueue?.status === 'pending' ? (
                            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 text-amber-400 px-3.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-widest uppercase">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                <span>WAITING FOR CASHIER APPROVAL</span>
                            </div>
                        ) : activeQueue?.status === 'accepted' ? (
                            <div className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/25 text-sky-400 px-3.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-widest uppercase">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                                <span>RESERVATION CONFIRMED</span>
                            </div>
                        ) : activeQueue?.status === 'late' ? (
                            <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/25 text-red-400 px-3.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-widest uppercase animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                <span>LATE ARRIVAL</span>
                            </div>
                        ) : activeQueue?.status === 'no_show' ? (
                            <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/25 text-red-400 px-3.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-widest uppercase">
                                <span>NO-SHOW</span>
                            </div>
                        ) : isServing ? (
                            <div className="inline-flex items-center gap-2 bg-gold/15 border border-gold/30 text-gold px-3.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-widest uppercase animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
                                <span>NOW SERVING IN CHAIR</span>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-3.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-widest uppercase">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                <span>IN LIVE QUEUE</span>
                            </div>
                        )}
                    </div>

                    {/* Center Focal Stage */}
                    <div className="my-auto py-6 sm:py-7 space-y-4 w-full flex flex-col items-center">
                        <div className="relative mb-1">
                            <div className="absolute -inset-2 bg-gold/10 rounded-full blur-lg animate-pulse" />
                            <div className="relative w-16 h-16 rounded-full bg-white/[0.03] border border-gold/30 flex items-center justify-center text-gold shadow-[0_0_24px_rgba(212,175,55,0.12)]">
                                {activeQueue?.status === 'pending' ? (
                                    <Clock className="w-7 h-7 text-gold animate-spin" style={{ animationDuration: '10s' }} />
                                ) : isServing ? (
                                    <Scissors className="w-7 h-7 text-gold animate-pulse" />
                                ) : activeQueue?.status === 'accepted' ? (
                                    <Calendar className="w-7 h-7 text-gold" />
                                ) : isLate || isNoShow ? (
                                    <AlertTriangle className="w-7 h-7 text-red-400" />
                                ) : (
                                    <Sparkles className="w-7 h-7 text-gold" />
                                )}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <h2 className={`text-4xl sm:text-5xl font-serif font-bold tracking-wide transition-colors duration-300 ${isServing
                                ? isUrgent ? 'text-red-400' : 'text-gold'
                                : isNoShow ? 'text-red-400' : 'text-ivory'
                                }`}>
                                {activeQueue?.status === 'pending'
                                    ? 'PENDING'
                                    : activeQueue?.status === 'accepted'
                                        ? 'CONFIRMED'
                                        : activeQueue?.status === 'no_show'
                                            ? 'NO-SHOW'
                                            : activeQueue?.id
                                                ? `MCH-${String(activeQueue.id).padStart(4, '0')}`
                                                : '—'}
                            </h2>
                            {activeQueue?.id ? (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-gold/15 border border-gold/40 shadow-sm">
                                    <span className="text-[10px] text-ivory-dim font-mono tracking-widest uppercase font-semibold">REFERENCE</span>
                                    <span className="text-xs font-mono font-bold text-gold tracking-wider">#MCH-{String(activeQueue.id).padStart(4, '0')}</span>
                                    {isGroup && (
                                        <span className="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-gold/20 text-gold uppercase font-bold border border-gold/30">
                                            Group • {totalGuests} Guests
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <p className="text-[11px] text-ivory-dim/70 font-mono tracking-widest uppercase">
                                    RESERVATION
                                </p>
                            )}
                        </div>

                        {activeQueue?.preferred_date && activeQueue?.preferred_time ? (
                            <div className="inline-flex items-center gap-2 bg-white/[0.03] border border-gold/25 px-4 py-2 rounded-sm text-xs text-ivory shadow-sm">
                                <Calendar className="w-3.5 h-3.5 text-gold shrink-0" />
                                <span>
                                    Scheduled: <strong className="text-gold font-semibold">{formatManilaDate(activeQueue.preferred_date)}</strong> at <strong className="text-gold font-semibold">{formatManilaTime(activeQueue.preferred_time)}</strong> (Manila time)
                                </span>
                            </div>
                        ) : activeQueue?.created_at && (
                            <div className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/10 px-3.5 py-1.5 rounded-sm text-xs text-ivory-dim">
                                <Clock className="w-3.5 h-3.5 text-gold shrink-0" />
                                <span>Booked at: <strong className="text-ivory font-semibold">{new Date(activeQueue.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</strong></span>
                            </div>
                        )}

                        {isAssignedBarberOnBreak && (
                            <div role="status" className="inline-flex items-center gap-2 rounded-sm border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 text-xs text-amber-200">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                    {assignedBarberName} is on break. Your estimate updates live
                                    {estimatedStartLabel && estimatedCompletionLabel
                                        ? ` — expected start ${estimatedStartLabel}, completion ${estimatedCompletionLabel}.`
                                        : '.'}
                                </span>
                            </div>
                        )}

                        {isFutureScheduledReservation && estimatedStartLabel && estimatedCompletionLabel && (
                            <div className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-ivory-dim">
                                <Clock className="h-3.5 w-3.5 shrink-0 text-gold" />
                                <span>Current estimate: start {estimatedStartLabel}, completion {estimatedCompletionLabel}.</span>
                            </div>
                        )}

                        <p className="text-xs text-ivory-dim max-w-xs leading-relaxed">
                            {activeQueue?.status === 'pending'
                                ? (isGroup
                                    ? `Your group booking (${totalGuests} guests) is awaiting cashier review. This page will update automatically upon approval.`
                                    : 'Your booking is awaiting cashier review. This page will update automatically upon approval.')
                                : activeQueue?.status === 'accepted'
                                    ? (isGroup
                                        ? `Your group booking (${totalGuests} guests) is confirmed. Please arrive 10 minutes prior to your time.`
                                        : `Your appointment is confirmed with ${barber?.name || 'your barber'}. Please arrive 10 minutes prior to your time.`)
                                    : isServing
                                        ? `${isGroup ? activeQueue.guest_name || 'This guest' : 'You'} ${isGroup ? 'is' : 'are'} currently in the chair with ${barber?.name || 'your barber'}. Enjoy your service.`
                                : isFutureScheduledReservation
                                    ? `Your appointment is scheduled for ${scheduledAppointmentTime}. Please arrive close to your booked time.`
                                    : `${isGroup ? activeQueue.guest_name || 'This guest' : 'You'} ${isGroup ? 'is' : 'are'} in line. The queue advances as clients ahead are completed.`}
                        </p>

                        {!isServing && !isFutureScheduledReservation && (activeQueue?.status === 'waiting' || activeQueue?.status === 'serving') && activeQueue?.customer_id && (
                            <div className="pt-1">
                                <QueuePosition customerId={activeQueue.customer_id} barberId={activeQueue.barber_id} queueId={activeQueue.id} />
                            </div>
                        )}

                        {!isServing && !isFutureScheduledReservation && activeQueue?.status === 'waiting' && activeQueue?.position > 1 && (
                            <div className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/10 px-3.5 py-1.5 rounded-full text-xs text-ivory">
                                <Clock className="w-3.5 h-3.5 text-gold" />
                                <span className="text-ivory-dim">Estimated Wait:</span>
                                <span className="font-bold text-gold">~{estimatedWaitTime} mins</span>
                                {estimatedCompletionLabel && (
                                    <span className="text-ivory-dim">· Est. completion {estimatedCompletionLabel}</span>
                                )}
                            </div>
                        )}

                        {timeLeft !== null && (isServing || isLate) && (
                            <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-bold ${isUrgent
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-gold/15 text-gold border border-gold/30'
                                }`}>
                                <Clock className="w-3.5 h-3.5" />
                                <span>{formatTime(timeLeft)}</span>
                                <span className="text-[10px] opacity-70 font-sans">{isLate ? 'to check in' : 'remaining'}</span>
                            </div>
                        )}

                        {isLate && timeLeft !== null && isUrgent && (
                            <p className="text-xs text-red-400 flex items-center justify-center gap-1.5 pt-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Arrival grace period ending soon</span>
                            </p>
                        )}

                        {isNoShow && (
                            <p className="text-xs text-red-400 flex items-center justify-center gap-1.5 pt-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>The 10-minute arrival grace period has ended.</span>
                            </p>
                        )}

                        <div className="w-full bg-white/[0.02] border border-white/5 rounded-sm p-3.5 space-y-2.5 mt-1">
                            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-ivory-dim border-b border-white/5 pb-1.5">
                                <span className="flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                                    Booking Steps
                                </span>
                                <span className="text-gold font-mono">
                                    {activeQueue?.status === 'pending'
                                        ? 'Step 2 of 3'
                                        : isServing
                                            ? 'Step 3 of 3'
                                            : 'Step 2 of 3'}
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                                <div className="flex flex-col items-center space-y-1">
                                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
                                        ✓
                                    </div>
                                    <span className="text-ivory font-medium">Submitted</span>
                                </div>

                                <div className="flex flex-col items-center space-y-1">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold ${activeQueue?.status === 'pending'
                                        ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 animate-pulse'
                                        : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                                        }`}>
                                        {activeQueue?.status === 'pending' ? '2' : '✓'}
                                    </div>
                                    <span className={activeQueue?.status === 'pending' ? 'text-gold font-semibold' : 'text-ivory font-medium'}>
                                        {activeQueue?.status === 'pending' ? 'Cashier Review' : 'Confirmed'}
                                    </span>
                                </div>

                                <div className="flex flex-col items-center space-y-1">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold ${isServing
                                        ? 'bg-gold/20 border border-gold text-gold animate-pulse'
                                        : 'bg-white/5 border border-white/10 text-ivory-dim'
                                        }`}>
                                        3
                                    </div>
                                    <span className={isServing ? 'text-gold font-semibold' : 'text-ivory-dim'}>
                                        {isServing ? 'In Chair' : 'Chair Ready'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Desktop Booking Details Card */}
                <div className="flex flex-col justify-between space-y-6">
                    <div className="relative overflow-hidden bg-white/5 border border-white/10 rounded-sm p-5 sm:p-6 space-y-5 transition-all duration-500 group hover:border-gold/50 hover:shadow-lg hover:-translate-y-0.5 card-gold-accent flex-1 flex flex-col justify-between">
                        {/* Top Subtle Gold Accent Line */}
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-gold flex items-center gap-2">
                                    <Scissors className="w-4 h-4" />
                                    Booking Details
                                </h3>
                                <span className="text-[10px] font-mono text-ivory-dim uppercase tracking-wider">
                                    {isGroup ? `Group (${totalGuests} Guests)` : 'Appointment Specs'}
                                </span>
                            </div>

                            {isGroup && enrichedGroupGuests.length > 0 ? (
                                <div className="space-y-3">
                                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                        {enrichedGroupGuests.map((g, idx) => (
                                            <div key={g.id || idx} className="p-3 bg-white/[0.02] border border-white/5 rounded-sm space-y-1.5 hover:border-gold/30 transition-colors">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-bold text-gold flex items-center gap-1.5 font-mono uppercase tracking-wider">
                                                        <Users className="w-3.5 h-3.5 text-gold/80" />
                                                        {g.name}
                                                    </span>
                                                    {g.barber?.name && (
                                                        <span className="text-ivory-dim text-[11px]">
                                                            Barber: <strong className="text-ivory font-medium">{g.barber.name}</strong>
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between gap-2 pl-5 text-[11px]">
                                                    <span className="font-mono text-gold">{g.reference}</span>
                                                    <span className="text-ivory-dim">{guestQueueStatusLabel(g.status)}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs text-ivory-dim pl-5">
                                                    <span className="text-ivory font-medium flex items-center gap-1.5">
                                                        <Scissors className="w-3 h-3 text-gold/70" />
                                                        {g.serviceTitle}
                                                    </span>
                                                    <span className="text-ivory font-semibold">₱{g.price.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="space-y-2 border-t border-white/5 pt-3 text-sm">
                                        <div className="flex items-center justify-between text-xs text-ivory-dim">
                                            <span>Services Subtotal ({totalGuests} guests)</span>
                                            <span className="text-ivory font-semibold">₱{totalGroupServicesPrice.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-ivory-dim">
                                            <span>Reservation Fee (₱50.00 × {totalGuests} guests)</span>
                                            <span className="text-emerald-400 font-semibold">₱{reservationFee.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm pt-2 border-t border-white/5">
                                            <span className="text-gold font-bold uppercase tracking-wider text-xs font-serif">Total Amount</span>
                                            <span className="text-gold font-bold font-serif text-lg">₱{totalAmount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {barber && (
                                        <div className="flex items-center gap-3.5 bg-white/[0.02] border border-white/5 p-3 rounded-sm">
                                            <div className="w-11 h-11 rounded-full overflow-hidden border border-gold/30 shadow-md flex-shrink-0">
                                                <img src={barber.image} alt={barber.name} width={44} height={44} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-ivory text-sm font-bold truncate">{barber.name}</p>
                                                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                        Available for Walk-ins Today
                                                    </span>
                                                </div>
                                                <p className="text-gold text-xs truncate">{barber.specialty}</p>
                                            </div>
                                        </div>
                                    )}

                                    {(matchedServices.length > 0 || service) && (
                                        <div className="space-y-2 border-t border-white/5 pt-3 text-sm">
                                            {matchedServices.length > 0 ? (
                                                matchedServices.map((svc: any, idx: number) => (
                                                    <div key={svc.id ?? svc.service_id ?? idx} className="flex items-start justify-between gap-3 text-ivory-dim">
                                                        <div className="flex items-center gap-2">
                                                            <Scissors className="w-4 h-4 text-gold shrink-0" />
                                                            <span className="text-ivory font-medium uppercase text-xs">{svc.name || svc.title}</span>
                                                        </div>
                                                        <span className="text-ivory font-semibold shrink-0">
                                                            ₱{(Number(svc.price) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="flex items-start justify-between gap-3 text-ivory-dim">
                                                    <div className="flex items-center gap-2">
                                                        <Scissors className="w-4 h-4 text-gold shrink-0" />
                                                        <span className="text-ivory font-medium">{serviceTitle}</span>
                                                    </div>
                                                    <span className="text-ivory font-semibold shrink-0">
                                                        ₱{totalServicePrice.toLocaleString('en-PH', { maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between text-xs text-ivory-dim pl-6 pt-1">
                                                <div className="flex items-center gap-2">
                                                    <span>Reservation Fee</span>
                                                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase">
                                                        Paid
                                                    </span>
                                                </div>
                                                <span className="text-emerald-400 font-semibold font-mono">₱{reservationFee.toFixed(2)}</span>
                                            </div>

                                            <div className="border-t border-white/10 pt-2 space-y-1.5 pl-6">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gold font-bold uppercase tracking-wider text-xs font-serif">Total Amount</span>
                                                    <span className="text-gold font-bold font-serif text-lg">₱{totalAmount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs text-ivory-dim">
                                                    <span>Paid online</span>
                                                    <span className="font-mono">₱{reservationFee.toFixed(2)}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs font-bold text-ivory pt-0.5">
                                                    <span>Due at the shop</span>
                                                    <span className="font-mono text-gold">₱{(isGroup ? totalGroupServicesPrice : totalServicePrice).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {activeQueue?.status === 'accepted' && activeQueue?.scheduled_start_at && (
                                <p className="text-xs text-gold/80 border border-gold/20 bg-gold/5 rounded-sm px-3 py-2 font-serif">
                                    Please arrive up to 10 minutes before your scheduled time. Arrivals more than 10 minutes late may be marked no-show.
                                </p>
                            )}

                            {activeQueue?.status === 'late' && activeQueue?.arrival_deadline_at && (
                                <p className="text-xs text-red-300 border border-red-500/20 bg-red-500/5 rounded-sm px-3 py-2">
                                    Please check in before the arrival grace period ends.
                                </p>
                            )}
                        </div>

                        {/* Actions: Desktop */}
                        <div className="space-y-3 pt-3 mt-auto">
                            {(() => {
                                if (activeQueue?.status === 'serving' || activeQueue?.status === 'completed') {
                                    return null;
                                }

                                if (
                                    activeQueue?.status === 'no_show' ||
                                    activeQueue?.status === 'cancelled' ||
                                    activeQueue?.status === 'declined' ||
                                    activeQueue?.status === 'expired'
                                ) {
                                    return (
                                        <div className="space-y-2">
                                            <Button
                                                variant="primary"
                                                className="w-full bg-gold hover:bg-gold-light text-charcoal font-bold cursor-pointer"
                                                onClick={() => {
                                                    setActiveQueue(null);
                                                    resetBookingForm?.();
                                                    setActiveTab('book');
                                                }}
                                            >
                                                Book New Appointment
                                            </Button>
                                        </div>
                                    );
                                }

                                if (!canCancelReservation && !canRescheduleAppointment) {
                                    return (
                                        <div className="p-3 bg-white/5 border border-white/10 rounded-sm text-center">
                                            <p className="text-[11px] text-ivory-dim">
                                                Cancellations are only allowed at least 24 hours in advance. {isGroup ? `The ₱50 reservation fee per guest (Total: ₱${reservationFee}) is non-refundable.` : 'The ₱50 fee is non-refundable.'}
                                            </p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-1">
                                        {canRescheduleAppointment && !hasRescheduled && !activeQueue?.has_used_reschedule && String(activeQueue?.schedule_adjustment_status || '').toLowerCase() !== 'rescheduled' && (
                                            <Button
                                                variant="outline"
                                                aria-disabled={!canRescheduleAppointment}
                                                className={`w-full cursor-pointer tracking-normal hover:tracking-normal whitespace-nowrap ${canRescheduleAppointment ? 'border-gold/50 text-gold hover:bg-gold/10' : 'border-white/10 text-ivory-dim/50'}`}
                                                onClick={() => {
                                                    if (!canRescheduleAppointment) {
                                                        addToast({
                                                            type: 'warning',
                                                            title: 'Rescheduling unavailable',
                                                            message: 'Rescheduling is only allowed at least 1 day before your scheduled appointment. For same-day concerns, please contact the shop directly.',
                                                            duration: 5000,
                                                        });
                                                        return;
                                                    }
                                                    setRescheduleSnapshot(rescheduleAppointment);
                                                    setIsRescheduleModalOpen(true);
                                                }}
                                            >
                                                <Calendar className="w-4 h-4 mr-2" /> Reschedule Appointment
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer"
                                            onClick={openCancellationModal}
                                            disabled={isLeaving}
                                        >
                                            {isLeaving ? (
                                                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Cancelling Reservation...</>
                                            ) : (
                                                <><X className="w-4 h-4 mr-2" /> Cancel Reservation</>
                                            )}
                                        </Button>
                                        <p className="text-[10px] text-center text-ivory-dim/70 italic font-serif">
                                            The ₱50 reservation fee is strictly non-refundable.
                                        </p>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile View (below lg) - Styled with the exact signature theme, outline, fonts, and hover */}
            <div className="block space-y-3 lg:hidden">

                {/* Mobile Card 1: Confirmed Status & Timeline (Image 2 style, strictly without QR button) */}
                <div className="relative overflow-hidden bg-white/5 border border-white/10 rounded-sm p-3 space-y-2.5 transition-all duration-500 group hover:border-gold/50 hover:shadow-lg hover:-translate-y-0.5 card-gold-accent">
                    {/* Top Subtle Gold Accent Line */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>

                    {/* Header: Status Icon, Title, Reference Badge with Copy */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="w-7 h-7 rounded-sm bg-white/5 border border-gold/30 flex items-center justify-center text-gold shadow-sm shrink-0">
                                <Calendar className="w-3.5 h-3.5 text-gold" />
                            </div>
                            <div className="min-w-0">
                            <h2 className="truncate text-base font-serif font-bold text-ivory">
                                {activeQueue?.status === 'pending'
                                    ? 'Pending'
                                    : isServing
                                        ? 'In Chair'
                                        : activeQueue?.status === 'waiting' ? 'In Queue' : 'Confirmed'}
                            </h2>
                            <p className="truncate text-[9px] text-ivory-dim" title={formatDisplayDate(activeQueue?.preferred_date)}>
                                {formatDisplayDate(activeQueue?.preferred_date)}
                            </p>
                            </div>
                        </div>
                        <p className="whitespace-nowrap font-serif text-base font-bold text-gold sm:text-lg">
                            {formatManilaTime(activeQueue?.preferred_time)}
                        </p>

                        {activeQueue?.id && (
                            <button
                                type="button"
                                onClick={copyReference}
                                className="border border-white/15 bg-white/5 hover:border-gold/40 text-ivory text-[9px] font-mono font-bold px-2 py-1 rounded-sm flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                                title="Copy Reference Number"
                            >
                                <span>#MCH-{String(activeQueue.id).padStart(4, '0')}</span>
                                {copiedRef ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                    <Copy className="w-3 h-3 text-ivory-dim" />
                                )}
                            </button>
                        )}
                    </div>

                    {/* Arrival Window Amber Box */}
                    {arrivalWindow && !checkInCommenced && (
                        <div className="border border-gold/20 bg-gold/5 rounded-sm px-2 py-1.5 flex items-start gap-1.5 text-[10px] leading-relaxed">
                            <Clock className="w-3 h-3 text-gold shrink-0 mt-0.5" />
                            <p className="text-ivory-dim">
                                <strong className="font-semibold text-ivory">Arrive {arrivalWindow.start}–{arrivalWindow.end}</strong>
                                {' '}(no-show after {arrivalWindow.endExact}).
                                {' '}<span className="text-gold">Reservation fee is non-refundable.</span>
                            </p>
                        </div>
                    )}

                    {/* 4-Step Stepper Progress Bar */}
                    <div className="w-full border-t border-white/5 pt-2">
                        <ol aria-label="Guest booking progress" className="flex items-start">
                            {['Submitted', 'Confirmed', 'Check in', 'Chair'].map((label, index) => (
                                <li key={label} aria-current={index === mobileProgressStep ? 'step' : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-1">
                                    {index < 3 && <span aria-hidden="true" className={`absolute left-[calc(50%_+_0.75rem)] right-[calc(-50%_+_0.75rem)] top-2.5 h-px ${index < mobileProgressStep ? 'bg-emerald-500/50' : 'bg-white/10'}`} />}
                                    <span className={`relative flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold ${index < mobileProgressStep
                                        ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400'
                                        : index === mobileProgressStep ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-ivory-dim/50'}`}>
                                        {index < mobileProgressStep ? <Check className="h-3 w-3" /> : index + 1}
                                    </span>
                                    <span className={`text-[9px] ${index === mobileProgressStep ? 'font-semibold text-gold' : 'text-ivory-dim'}`}>{isServing && index === 3 ? 'In chair' : label}</span>
                                </li>
                            ))}
                        </ol>
                        <p className="mt-2 text-center text-[10px] text-ivory-dim">
                            {isServing
                                ? `With ${barber?.name || 'your stylist'}${timeLeft !== null ? ` · ${formatTime(timeLeft)} remaining` : ''}`
                                : activeQueue?.status === 'pending'
                                    ? 'Your booking is awaiting cashier review.'
                                    : activeQueue?.status === 'waiting' ? `Checked in · ${estimatedWaitTime > 0 ? `Est. wait ${estimatedWaitTime} mins` : 'Waiting for your barber'}`
                                    : "Next: let the cashier know you've arrived."}
                        </p>
                    </div>
                </div>

                <div role="tablist" aria-label="Queue details" className="grid grid-cols-2 gap-1 rounded-sm border border-white/10 bg-white/5 p-1">
                    {(['lineup', 'bill'] as const).map(panel => (
                        <button
                            key={panel}
                            id={`mobile-${panel}-tab`}
                            type="button"
                            role="tab"
                            aria-selected={mobileQueuePanel === panel}
                            aria-controls={panel === 'lineup' ? 'queue-lineup-section' : 'mobile-booking-bill'}
                            tabIndex={mobileQueuePanel === panel ? 0 : -1}
                            onClick={() => setMobileQueuePanel(panel)}
                            onKeyDown={event => {
                                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                                event.preventDefault();
                                const nextPanel = event.key === 'Home' ? 'lineup' : event.key === 'End' ? 'bill' : panel === 'lineup' ? 'bill' : 'lineup';
                                setMobileQueuePanel(nextPanel);
                                document.getElementById(`mobile-${nextPanel}-tab`)?.focus();
                            }}
                            className={`flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-sm px-1.5 py-2 text-[9px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold sm:text-[10px] ${mobileQueuePanel === panel
                                ? 'bg-gold text-charcoal hover:bg-gold-light' : 'text-ivory-dim hover:bg-white/5 hover:text-ivory'}`}
                        >
                            {panel === 'lineup' ? <><Users className="h-3.5 w-3.5 shrink-0" /><span>Live Queue Lineup</span><span className="rounded-full bg-black/10 px-1.5 py-0.5 font-mono">{todayBarberQueue.length}</span></>
                                : <><ShieldCheck className="h-3.5 w-3.5 shrink-0" /><span>Booking &amp; Bill</span><span className="truncate font-mono">₱{totalAmount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span></>}
                        </button>
                    ))}
                </div>

                {/* Mobile booking and bill panel */}
                <div id="mobile-booking-bill" role="tabpanel" aria-labelledby="mobile-bill-tab" hidden={mobileQueuePanel !== 'bill'} tabIndex={0} className="relative overflow-hidden bg-white/5 border border-white/10 rounded-sm p-4 space-y-4 transition-all duration-500 group hover:border-gold/50 hover:shadow-lg hover:-translate-y-0.5 card-gold-accent">
                    {/* Top Subtle Gold Accent Line */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>

                    {/* Header: Matching screenshot */}
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <div className="flex items-center gap-2">
                            <Scissors className="w-4 h-4 text-gold" />
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gold font-serif">
                                BOOKING DETAILS
                            </h3>
                        </div>
                        <span className="text-[10px] uppercase tracking-wider text-ivory-dim font-mono">
                            {isGroup ? `GROUP (${totalGuests} GUESTS)` : 'APPOINTMENT SPECS'}
                        </span>
                    </div>

                    {/* Barber Info Box */}
                    {barber && !isGroup && (
                        <div className="flex items-center gap-3.5 bg-white/[0.02] border border-white/5 p-3 rounded-sm">
                            <div className="w-12 h-12 rounded-full overflow-hidden border border-gold/30 shadow-md flex-shrink-0 bg-white/5 flex items-center justify-center">
                                {barber.image ? (
                                    <img src={barber.image} alt={barber.name} width={48} height={48} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="font-serif font-bold text-gold text-sm">{getInitials(barber.name)}</span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-ivory text-sm font-bold truncate font-serif">{barber.name}</p>
                                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                        AVAILABLE FOR WALK-INS TODAY
                                    </span>
                                </div>
                                <p className="text-gold text-xs truncate font-mono">{barber.specialty || 'Stylist'}</p>
                            </div>
                        </div>
                    )}

                    {/* Services and Pricing Itemization */}
                    {isGroup && enrichedGroupGuests.length > 0 ? (
                        <div className="space-y-3">
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                {enrichedGroupGuests.map((g, idx) => (
                                    <div key={g.id || idx} className="p-3 bg-white/[0.02] border border-white/5 rounded-sm space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-gold uppercase tracking-wider font-mono">{g.name}</span>
                                            {g.barber?.name && <span className="text-ivory-dim text-[11px]">{g.barber.name}</span>}
                                        </div>
                                        <div className="flex items-center justify-between gap-2 text-[11px]">
                                            <span className="font-mono text-gold">{g.reference}</span>
                                            <span className="text-ivory-dim">{guestQueueStatusLabel(g.status)}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-ivory-dim">
                                            <span className="text-ivory font-medium">{g.serviceTitle}</span>
                                            <span className="text-ivory font-mono">₱{g.price.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between items-center text-xs text-ivory-dim pt-1 border-t border-white/5">
                                <div className="flex items-center gap-2">
                                    <span>Reservation fee ({totalGuests} guests)</span>
                                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded">Paid</span>
                                </div>
                                <span className="text-emerald-400 font-mono font-bold">₱{reservationFee.toFixed(2)}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 border-t border-white/5 pt-3">
                            {matchedServices.length > 0 ? (
                                matchedServices.map((svc: any, idx: number) => (
                                    <div key={svc.id || idx} className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2">
                                            <Scissors className="w-3.5 h-3.5 text-gold shrink-0" />
                                            <span className="font-bold text-ivory uppercase tracking-wide text-xs">{svc.name || svc.title}</span>
                                        </div>
                                        <span className="font-serif font-bold text-ivory text-sm">₱{(Number(svc.price) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <Scissors className="w-3.5 h-3.5 text-gold shrink-0" />
                                        <span className="font-bold text-ivory uppercase tracking-wide text-xs">{serviceTitle}</span>
                                    </div>
                                    <span className="font-serif font-bold text-ivory text-sm">₱{totalServicePrice.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center text-xs text-ivory-dim pt-1">
                                <div className="flex items-center gap-2 pl-5">
                                    <span>Reservation Fee</span>
                                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase">
                                        Paid
                                    </span>
                                </div>
                                <span className="text-emerald-400 font-mono font-bold">₱{reservationFee.toFixed(2)}</span>
                            </div>
                        </div>
                    )}

                    {/* Totals Section */}
                    <div className="border-t border-white/10 pt-3 space-y-1.5">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-wider text-gold font-serif">TOTAL AMOUNT</span>
                            <span className="font-serif font-bold text-2xl text-gold">₱{totalAmount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-ivory-dim">
                            <span>Paid online</span>
                            <span className="font-mono">₱{reservationFee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-bold text-ivory pt-0.5">
                            <span>Due at the shop</span>
                            <span className="font-mono text-gold">₱{(isGroup ? totalGroupServicesPrice : totalServicePrice).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Notice Box matching screenshot */}
                    <div className="border border-gold/20 bg-gold/5 rounded-sm p-3 text-xs text-gold/80 leading-relaxed font-serif">
                        Please arrive up to 10 minutes before your scheduled time. Arrivals more than 10 minutes late may be marked no-show.
                    </div>

                    {/* Policy Disclaimer */}
                    <div className="flex items-start gap-2 pt-0.5 text-[11px] text-ivory-dim/70 leading-relaxed italic font-serif">
                        <Info className="w-3.5 h-3.5 text-gold/80 shrink-0 mt-0.5" />
                        <span>You can reschedule once. The ₱50 reservation fee is strictly non-refundable.</span>
                    </div>

                    {/* Actions: Normal or Confirmation Box */}
                    <div className="space-y-2 pt-2">
                        {showInlineCancelConfirm ? (
                            <div className="bg-red-950/20 border border-red-500/30 rounded-sm p-4 space-y-3 animate-fade-in">
                                <p className="font-serif font-bold text-sm text-ivory">Cancel this reservation?</p>
                                <p className="text-xs text-red-300/90 leading-relaxed font-serif">
                                    Your ₱{reservationFee.toFixed(2)} reservation fee will not be refunded.
                                </p>
                                <div className="flex items-center gap-3 pt-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowInlineCancelConfirm(false)}
                                        disabled={isLeaving}
                                        className="flex-1 bg-white/5 border-white/20 text-ivory font-serif font-bold text-xs uppercase tracking-wider py-2.5 rounded-sm hover:bg-white/10 cursor-pointer"
                                    >
                                        KEEP BOOKING
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void handleInlineCancel()}
                                        disabled={isLeaving}
                                        className="flex-1 bg-red-500/10 border-red-500/60 text-red-400 font-serif font-bold text-xs uppercase tracking-wider py-2.5 rounded-sm hover:bg-red-500/20 cursor-pointer"
                                    >
                                        {isLeaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'YES, CANCEL'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {canRescheduleAppointment && !hasRescheduled && !activeQueue?.has_used_reschedule && String(activeQueue?.schedule_adjustment_status || '').toLowerCase() !== 'rescheduled' && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full border border-white/20 hover:border-gold/50 bg-white/5 hover:bg-white/10 text-ivory font-serif font-bold text-xs uppercase tracking-[0.15em] py-3.5 rounded-sm transition-all cursor-pointer"
                                        onClick={() => {
                                            setRescheduleSnapshot(rescheduleAppointment);
                                            setIsRescheduleModalOpen(true);
                                        }}
                                    >
                                        RESCHEDULE APPOINTMENT
                                    </Button>
                                )}
                                {canCancelReservation && (
                                    <button
                                        type="button"
                                        onClick={() => setShowInlineCancelConfirm(true)}
                                        disabled={isLeaving}
                                        className="w-full py-1 text-xs font-serif text-red-400 hover:text-red-300 transition-colors cursor-pointer text-center block"
                                    >
                                        Cancel reservation
                                    </button>
                                )}
                            </>
                        )}

                        {(activeQueue?.status === 'no_show' || activeQueue?.status === 'cancelled' || activeQueue?.status === 'declined' || activeQueue?.status === 'expired') && (
                            <Button
                                variant="primary"
                                className="w-full bg-gold hover:bg-gold-light text-charcoal font-bold cursor-pointer"
                                onClick={() => {
                                    setActiveQueue(null);
                                    resetBookingForm?.();
                                    setActiveTab('book');
                                }}
                            >
                                Book New Appointment
                            </Button>
                        )}
                    </div>
                </div>

            </div>

            {/* Mobile tab visibility never hides the original full-width desktop lineup. */}
            <div id="queue-lineup-section" role="tabpanel" aria-labelledby="mobile-lineup-tab" tabIndex={0} className={`${mobileQueuePanel === 'lineup' ? 'block' : 'hidden'} lg:block relative overflow-hidden bg-white/5 border border-white/10 rounded-sm p-3 lg:p-6 space-y-3 lg:space-y-4 transition-all duration-500 group hover:border-gold/50 hover:shadow-lg hover:-translate-y-0.5 card-gold-accent`}>
                {/* Subtle Top Gold Accent Line */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>

                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gold" />
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-gold lg:text-sm">Queue Lineup</h3>
                            <p className="text-[11px] text-ivory-dim font-serif">Today's lineup for <span className="text-ivory font-medium">{assignedBarberName}</span></p>
                        </div>
                    </div>
                    <span className="shrink-0 text-[10px] lg:text-xs font-mono text-ivory-dim bg-white/5 border border-white/10 px-2 lg:px-3 py-1 rounded-full flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${todayBarberQueue.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
                        {todayBarberQueue.length} in line
                    </span>
                </div>

                {todayBarberQueue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-8 text-ivory-dim space-y-2 bg-white/[0.01] border border-white/5 rounded-sm">
                        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gold/60">
                            <Clock className="w-5 h-5" />
                        </div>
                        <p className="font-serif font-bold text-ivory text-sm">Queue is currently empty</p>
                        <p className="text-xs text-ivory-dim font-serif">No customers currently in line for {assignedBarberName} today.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {todayBarberQueue.map((entry) => {
                            const isMe = String(entry.id) === String(activeQueue?.id);
                            const refNumber = `#MCH-${String(entry.id).padStart(4, '0')}`;
                            return (
                                <div
                                    key={entry.id}
                                    className={`flex min-w-0 lg:min-w-auto items-center justify-between gap-2 lg:gap-0 p-2.5 lg:p-3.5 rounded-sm transition-colors ${
                                        isMe
                                            ? 'bg-gold/10 border border-gold/40 shadow-[0_0_15px_rgba(212,175,55,0.08)]'
                                            : 'bg-white/[0.02] border border-white/5 hover:border-white/10'
                                    }`}
                                >
                                    <div className="flex min-w-0 lg:min-w-auto items-center gap-2 lg:gap-3">
                                        <div
                                            className={`shrink-0 lg:shrink px-2 lg:px-2.5 py-1 rounded-sm flex items-center justify-center text-[10px] lg:text-xs font-mono font-bold tracking-wider ${
                                                isMe
                                                    ? 'bg-gold/20 text-gold border border-gold/30'
                                                    : 'bg-white/10 text-ivory border border-white/10'
                                            }`}
                                        >
                                            {refNumber}
                                        </div>
                                        <div>
                                            <p className={`hidden text-sm ${isMe ? 'lg:flex text-gold font-bold items-center gap-1.5' : 'lg:block text-ivory font-medium'}`}>
                                                {isMe ? (
                                                    <>
                                                        <span>{refNumber}</span>
                                                        <span className="text-[10px] bg-gold/20 text-gold px-1.5 py-0.5 rounded-xs font-mono uppercase font-bold">You</span>
                                                    </>
                                                ) : (
                                                    <span className="font-mono text-ivory-dim text-xs">{refNumber}</span>
                                                )}
                                            </p>
                                            <p className="flex flex-wrap items-center gap-1 text-[10px] text-ivory-dim lg:block lg:uppercase lg:tracking-wider">
                                                {entry.status === 'serving'
                                                    ? 'Being served'
                                                    : entry.position
                                                        ? `Position #${entry.position} in line`
                                                        : 'Waiting'}
                                                {isMe && <span className="rounded-xs bg-gold/20 px-1 py-0.5 text-[8px] font-bold text-gold lg:hidden">{isGroup ? 'Selected' : 'You'}</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 lg:shrink items-center gap-2">
                                        {entry.status === 'serving' ? (
                                            <span className="text-[9px] lg:text-[10px] uppercase tracking-wider text-gold bg-gold/15 border border-gold/30 px-2 lg:px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping" />
                                                Serving
                                            </span>
                                        ) : entry.status === 'late' ? (
                                            <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-medium">
                                                Late
                                            </span>
                                        ) : (
                                            <span className="text-[10px] uppercase tracking-wider text-ivory-dim bg-white/5 border border-white/10 px-2.5 py-1 rounded-full font-medium">
                                                Waiting
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Modal
                isOpen={isCancellationModalOpen}
                onClose={() => {
                    if (!isLeaving) setIsCancellationModalOpen(false);
                }}
                title="Cancel Reservation"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setIsCancellationModalOpen(false)}
                            disabled={isLeaving}
                        >
                            Keep Booking
                        </Button>
                        <Button
                            variant="primary"
                            className="bg-red-500 hover:bg-red-600 border-red-500 text-white"
                            onClick={handleLeaveQueue}
                            disabled={isLeaving}
                        >
                            {isLeaving ? (
                                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Cancelling...</>
                            ) : (
                                'Confirm Cancellation'
                            )}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-ivory-dim">
                        Cancelling releases your slot. The ₱50 reservation fee is non-refundable. Please tell us why you need to cancel this booking; the cashier will be notified.
                    </p>
                    <div className="space-y-2">
                        {CUSTOMER_CANCELLATION_REASONS.map((reason) => (
                            <label
                                key={reason}
                                className={`flex items-center gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${cancellationReason === reason
                                    ? 'border-gold/60 bg-gold/10 text-ivory'
                                    : 'border-white/10 bg-white/[0.02] text-ivory-dim hover:border-white/20'
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="customer-cancellation-reason"
                                    value={reason}
                                    checked={cancellationReason === reason}
                                    onChange={(event) => setCancellationReason(event.target.value)}
                                    className="accent-gold"
                                />
                                <span className="text-sm">{reason}</span>
                            </label>
                        ))}
                    </div>
                    {cancellationReason === 'Other' && (
                        <textarea
                            value={customCancellationReason}
                            onChange={(event) => setCustomCancellationReason(event.target.value)}
                            placeholder="Please provide your reason"
                            rows={3}
                            maxLength={500}
                            className="w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-ivory placeholder:text-ivory-dim/60 focus:border-gold/50 focus:outline-none"
                        />
                    )}
                </div>
            </Modal>

            <RescheduleAppointmentModal
                appointment={isRescheduleModalOpen ? rescheduleSnapshot : null}
                onClose={() => { setIsRescheduleModalOpen(false); setRescheduleSnapshot(null); }}
                onCompleted={() => {
                    setIsRescheduleModalOpen(false);
                    setRescheduleSnapshot(null);
                    setHasRescheduled(true);
                    void refreshQueue();
                }}
            />

            {/* Feedback Modal Triggered on Completion */}
            <FeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => {
                    setIsFeedbackModalOpen(false);
                    setActiveTab('overview');
                }}
                queueItem={lastActiveQueueItem}
                barber={barbers?.find((b: any) => b.id === lastActiveQueueItem?.barber_id)}
                service={services?.find((s: any) => s.id === lastActiveQueueItem?.service_id)}
            />
        </div>

    );
};
