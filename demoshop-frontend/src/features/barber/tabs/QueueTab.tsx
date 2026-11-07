import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, AlertTriangle, ShieldAlert, Scissors, Camera, Sparkles, X, RefreshCw, UserCheck, CheckCircle2, ChevronRight } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';
import { Skeleton } from '@/components/ui/Skeleton';

import { HaircutPhotoViewerModal } from '../components/modals/HaircutPhotoViewerModal';
import { QueueCard, QueueItem } from '../components/QueueCard';
import { ElapsedTimeTicker } from '../components/ElapsedTimeTicker';
import { barberService } from '../services/barber.service';
import { getManilaHeaderDate, formatManilaQueueDateTime } from '@/utils/manila-date';
import { calculateQueueCompletionEstimates } from '@/utils/queue-estimates';
import type { RealtimeDisplayStatus } from '@/utils/supabase-realtime';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';

const BarberChairIcon: React.FC<{ isSpinning?: boolean; size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({ isSpinning = true, size = 'md' }) => {
    const sizeClasses = {
        sm: { ring: 'w-10 h-10', icon: 'w-5 h-5', container: 'w-9 h-9' },
        md: { ring: 'w-14 h-14', icon: 'w-7 h-7', container: 'w-12 h-12' },
        lg: { ring: 'w-20 h-20', icon: 'w-10 h-10', container: 'w-16 h-16' },
        xl: { ring: 'w-28 h-28', icon: 'w-14 h-14', container: 'w-24 h-24' },
    }[size];

    return (
        <div className="relative flex items-center justify-center flex-shrink-0">
            {/* Ambient Pulsing Glow */}
            <div className="absolute -inset-3 bg-gradient-to-r from-gold/25 via-gold/10 to-amber-500/20 rounded-full blur-xl animate-pulse" />
            
            {/* Outer Orbital Rotating Ring */}
            <div 
                className={`absolute ${sizeClasses.ring} rounded-full border border-gold/40 border-dashed ${
                    isSpinning ? 'animate-[spin_12s_linear_infinite]' : ''
                }`} 
            />
            {/* Inner Reverse Orbital Ring for XL */}
            {size === 'xl' && (
                <div className="absolute w-20 h-20 rounded-full border border-gold/20 border-dotted animate-[spin_8s_linear_infinite_reverse]" />
            )}
            
            {/* Luxury Barber Chair Graphic */}
            <div className={`relative z-10 ${sizeClasses.container} rounded-full bg-gradient-to-br from-gold/30 via-gold/10 to-charcoal border border-gold/50 flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.25)]`}>
                <svg 
                    className={`${sizeClasses.icon} text-gold transition-transform duration-300`} 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="1.75" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                >
                    {/* Headrest */}
                    <rect x="9" y="2" width="6" height="2.5" rx="1" fill="currentColor" fillOpacity="0.25" />
                    {/* Backrest */}
                    <path d="M7 5.5h10a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" fill="currentColor" fillOpacity="0.15" />
                    {/* Armrests */}
                    <path d="M4 9.5v3a1 1 0 0 0 1 1h1" />
                    <path d="M20 9.5v3a1 1 0 0 1-1 1h-1" />
                    {/* Seat Cushion */}
                    <rect x="5" y="13" width="14" height="3" rx="1.5" fill="currentColor" fillOpacity="0.35" />
                    {/* Hydraulic Center Column & Base */}
                    <path d="M12 16v4" />
                    <path d="M8 20h8" />
                    <path d="M6 22h12" />
                </svg>
            </div>
        </div>
    );
};

const BarberQueueSkeleton: React.FC = () => (
    <div className="space-y-6" aria-label="Loading barber queue dashboard" aria-busy="true">
        <div className="bg-charcoal-light border border-white/10 p-6 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xl">
            <div className="space-y-2">
                <Skeleton variant="text" className="w-44 h-5" />
                <Skeleton variant="text" className="w-72 h-3" />
            </div>
            <div className="flex items-center gap-2">
                <Skeleton variant="rect" className="w-9 h-9 rounded-sm" />
                <div className="flex gap-2">
                    <Skeleton variant="rect" className="w-24 h-9 rounded-sm" />
                    <Skeleton variant="rect" className="w-24 h-9 rounded-sm" />
                </div>
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-14rem)]">
            <div className="lg:col-span-7 bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl space-y-0 flex flex-col">
                <div className="bg-white/[0.02] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <Skeleton variant="text" className="w-48 h-5" />
                    <Skeleton variant="text" className="w-20 h-5 rounded-full" />
                </div>
                <div className="p-6 space-y-6 flex-1 flex flex-col items-center justify-center">
                    <Skeleton variant="circle" className="w-24 h-24" />
                    <Skeleton variant="text" className="w-48 h-8" />
                    <Skeleton variant="rect" className="w-64 h-12 rounded-sm" />
                </div>
            </div>
            <div className="lg:col-span-5 bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl space-y-0 flex flex-col">
                <div className="bg-white/[0.02] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <Skeleton variant="text" className="w-36 h-5" />
                    <Skeleton variant="text" className="w-28 h-5 rounded-full" />
                </div>
                <div className="p-6 space-y-3 flex-1">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-charcoal border border-white/5 p-4 rounded-sm flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Skeleton variant="circle" className="w-8 h-8 flex-shrink-0" />
                                <div className="space-y-1.5">
                                    <Skeleton variant="text" className="w-28 h-4" />
                                    <Skeleton variant="text" className="w-16 h-3" />
                                </div>
                            </div>
                            <Skeleton variant="rect" className="w-20 h-8 rounded-sm" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

interface NowServing {
    queueId: number;
    name: string;
    styleRef: string;
    service: string;
    price: number;
    timeStarted: string;
    rawStartedAt?: string | null;
    elapsedMinutes: number;
    addOns: string[];
    lastHaircutPhoto?: string;
}

export const QueueTab: React.FC = () => {
    const { user, supabaseToken, authReady } = useAuth();
    const [resolvedBarberId, setResolvedBarberId] = useState<number | null>(null);
    const [resolvedBranchId, setResolvedBranchId] = useState<number | null>(() => {
        const directBranchId = Number((user as any)?.branch_id);
        return !isNaN(directBranchId) && directBranchId > 0 ? directBranchId : null;
    });
    const [realtimeStatus, setRealtimeStatus] = useState<RealtimeDisplayStatus>('connecting');
    const [viewingQueuePhoto, setViewingQueuePhoto] = useState<{ name: string; photoUrl: string } | null>(null);
    const [nowServing, setNowServing] = useState<NowServing | null>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [actionLoading, setActionLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const queueContainerRef = useRef<HTMLDivElement>(null);
    const prevQueueLengthRef = useRef<number>(0);
    const isInitialLoadRef = useRef<boolean>(true);
    const isFetchingRef = useRef<boolean>(false);
    const pendingRefreshRef = useRef<boolean>(false);
    const debounceTimerRef = useRef<number | null>(null);

    // Keep active records in refs for realtime relevance checks without recreating subscription
    const nowServingRef = useRef<NowServing | null>(null);
    nowServingRef.current = nowServing;
    const queueRef = useRef<QueueItem[]>([]);
    queueRef.current = queue;

    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 4000);
    }, []);

    const calculateElapsedMinutes = (startTimeStr?: string | null): number => {
        if (!startTimeStr) return 0;
        try {
            const startMs = new Date(startTimeStr).getTime();
            if (isNaN(startMs)) return 0;
            const diffMs = Date.now() - startMs;
            return Math.max(0, Math.floor(diffMs / 60000));
        } catch { return 0; }
    };

    const formatTimeDisplay = (isoOrTime?: string | null): string => {
        if (!isoOrTime) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        try {
            const date = new Date(isoOrTime);
            if (!isNaN(date.getTime())) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return String(isoOrTime);
        } catch { return String(isoOrTime); }
    };

    useEffect(() => {
        let isMounted = true;
        const resolveId = async () => {
            if (!authReady || !user) return;

            // 1. Direct barber_id and branch_id from user session/profile
            const directBranch = Number((user as any)?.branch_id);
            if (!isNaN(directBranch) && directBranch > 0 && isMounted) {
                setResolvedBranchId(directBranch);
            }
            const directBarberId = (user as any)?.barber_id;
            const parsedDirectId = Number(directBarberId);
            if (directBarberId && !isNaN(parsedDirectId) && parsedDirectId > 0) {
                if (isMounted) setResolvedBarberId(parsedDirectId);
                return;
            }

            // 2. Query backend availability endpoint which resolves barber_id for current user
            try {
                const availability = await barberService.getAvailability();
                const availBarberId = Number(availability?.barberId);
                if (isMounted && availability?.barberId && !isNaN(availBarberId) && availBarberId > 0) {
                    setResolvedBarberId(availBarberId);
                    return;
                }
            } catch (availErr) {
                console.warn('[QueueTab] Failed to resolve barber ID via availability:', availErr);
            }

            // 3. Fallback to /api/auth/me endpoint
            try {
                const meRes = await api.get('/api/auth/me');
                const meBranchId = Number(meRes.data?.user?.branch_id || meRes.data?.branch_id);
                if (isMounted && !isNaN(meBranchId) && meBranchId > 0) {
                    setResolvedBranchId(meBranchId);
                }
                const meBarberId = Number(meRes.data?.user?.barber_id || meRes.data?.barber_id);
                if (isMounted && !isNaN(meBarberId) && meBarberId > 0) {
                    setResolvedBarberId(meBarberId);
                    return;
                }
            } catch (meErr) {
                console.warn('[QueueTab] Failed to resolve barber ID via /api/auth/me:', meErr);
            }

            // 4. If no valid numeric barber ID could be found, stop the loading spinner cleanly
            if (isMounted) {
                setLoading(false);
                setError('No active barber profile found for your account. Please contact an administrator.');
            }
        };
        void resolveId();
        return () => { isMounted = false; };
    }, [user, authReady]);

    const fetchBarberQueue = useCallback(async (isBackground: boolean = false) => {
        if (!resolvedBarberId) return;
        if (isFetchingRef.current) {
            pendingRefreshRef.current = true;
            return;
        }
        isFetchingRef.current = true;
        if (!isBackground) setLoading(true);
        setError(null);

        try {
            const res = await api.get(`/api/queue/barber/${resolvedBarberId}`);
            const data = res.data;

            let servingData: any = null;
            let queueData: any[] = [];

            const WAITING_STATUSES = new Set(['waiting', 'accepted', 'arrived', 'pending']);

            if (Array.isArray(data)) {
                servingData = data.find((item: any) => {
                    const s = String(item.status || '').toLowerCase();
                    return s === 'serving' || s === 'in_progress' || s === 'in chair';
                }) || null;
                queueData = data.filter((item: any) => {
                    const s = String(item.status || '').toLowerCase();
                    return WAITING_STATUSES.has(s);
                });
            } else if (data && typeof data === 'object') {
                servingData = data.nowServing || null;
                const rawList = Array.isArray(data.queue) ? data.queue : (Array.isArray(data.waitingQueue) ? data.waitingQueue : []);
                queueData = rawList.filter((item: any) => {
                    const s = String(item.status || '').toLowerCase();
                    return WAITING_STATUSES.has(s);
                });
            }

            if (servingData) {
                const serviceTitle = servingData.service || servingData.service_name || 'Haircut & Styling';
                const servicePrice = Number(servingData.price ?? servingData.final_price ?? servingData.service_price ?? 0);
                const startTime = servingData.service_started_at || servingData.timeStarted || servingData.timer_started_at || servingData.preferred_time || servingData.created_at;
                const clientName = servingData.name || servingData.customer_name || (servingData.first_name ? `${servingData.first_name} ${servingData.last_name || ''}`.trim() : 'Client in Chair');
                const manilaStartTime = formatManilaQueueDateTime(
                    servingData.preferred_date || servingData.date,
                    startTime,
                    servingData.created_at
                );

                setNowServing({
                    queueId: servingData.queueId || servingData.queue_id || servingData.id,
                    name: clientName,
                    styleRef: servingData.styleRef || servingData.haircut_preference || serviceTitle,
                    service: serviceTitle,
                    price: servicePrice,
                    timeStarted: manilaStartTime.timeDisplay,
                    rawStartedAt: startTime,
                    elapsedMinutes: calculateElapsedMinutes(startTime),
                    addOns: Array.isArray(servingData.addOns) ? servingData.addOns : [],
                    lastHaircutPhoto: servingData.haircut_photo_url || servingData.ref_photo_url || servingData.lastHaircutPhoto
                });
            } else {
                setNowServing(null);
            }

            const estimateEntries = [
                ...(servingData ? [servingData] : []),
                ...queueData,
            ];
            const completionEstimates = calculateQueueCompletionEstimates(estimateEntries.map((item: any) => ({
                id: item.id || item.queue_id || item.queueId,
                status: item.status,
                is_walk_in: item.is_walk_in,
                duration_minutes: item.duration_minutes,
                scheduled_start_at: item.scheduled_start_at,
                estimated_start_at: item.estimated_start_at,
                service_started_at: item.service_started_at,
                timer_started_at: item.timer_started_at,
                service_ends_at: item.service_ends_at,
                barber_status: item.barber_status,
                barber_break_started_at: item.barber_break_started_at,
            })));
            const formattedQueue: QueueItem[] = queueData.map((item: any) => {
                const sTitle = item.service || item.service_name || 'Haircut & Styling';
                const cName = item.name || item.customer_name || (item.first_name ? `${item.first_name} ${item.last_name || ''}`.trim() : 'Upcoming Client');
                const qId = Number(item.id || item.queue_id || item.queueId || 0);
                const guestReference = item.guestReference || item.guest_reference || item.guestRef || `REF-${qId || '0000'}`;
                const rawStatus = String(item.status || 'Waiting');
                const normalizedStatus = (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase()) as any;

                const manilaTimeInfo = formatManilaQueueDateTime(
                    item.preferred_date || item.date,
                    item.preferred_time || item.time,
                    item.created_at
                );
                const estimate = completionEstimates.get(String(qId));
                const isFutureScheduled = item.is_walk_in === false
                    && estimate !== undefined
                    && estimate.estimated_start_time > Date.now();
                const estimatedCompletion = estimate
                    ? new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
                    }).format(new Date(estimate.estimated_completion_time))
                    : undefined;

                return {
                    id: String(qId),
                    rawId: qId,
                    name: cName,
                    type: (item.type || (item.is_walk_in === false || item.is_appointment ? 'Reservation' : 'Walk-in')) as 'Reservation' | 'Walk-in',
                    eta: manilaTimeInfo.timeDisplay,
                    dateContext: manilaTimeInfo.dateContext,
                    fullDisplay: manilaTimeInfo.fullDisplay,
                    estimatedCompletion,
                    isFutureScheduled,
                    status: ['Waiting', 'Arrived', 'No-Show', 'Expired'].includes(normalizedStatus) ? normalizedStatus : 'Waiting',
                    styleRef: item.style || item.haircut_preference || sTitle,
                    guestRef: guestReference,
                    lastHaircutPhoto: item.haircut_photo_url || item.ref_photo_url || item.lastHaircutPhoto,
                    rawItem: item
                };
            }).sort((left, right) => Number(left.isFutureScheduled) - Number(right.isFutureScheduled));

            if (!isInitialLoadRef.current && formattedQueue.length > prevQueueLengthRef.current) {
                const latestClient = formattedQueue[formattedQueue.length - 1];
                showToast(`New client added to queue: ${latestClient.name}`);

                setTimeout(() => {
                    if (queueContainerRef.current) {
                        queueContainerRef.current.scrollTo({
                            top: queueContainerRef.current.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }, 150);
            }

            prevQueueLengthRef.current = formattedQueue.length;
            isInitialLoadRef.current = false;
            setQueue(formattedQueue);
        } catch (err: any) {
            console.error('Failed to load queue monitor:', err);
            setError(err?.response?.data?.error || err?.message || 'Failed to load queue entries.');
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
            setActionLoading(false);
            if (pendingRefreshRef.current) {
                pendingRefreshRef.current = false;
                void fetchBarberQueue(true);
            }
        }
    }, [resolvedBarberId, showToast]);

    // Initial and barberId change fetch
    useEffect(() => {
        if (!resolvedBarberId) return;
        void fetchBarberQueue(false);
    }, [resolvedBarberId, fetchBarberQueue]);

    // Supabase Realtime Subscription with Fallback Polling & Debounced Invalidation
    useEffect(() => {
        if (!authReady || !resolvedBarberId) return;

        // Set Realtime Auth Token so RLS and publications properly authorize the connection
        if (supabaseToken) {
            void Promise.resolve(supabase.realtime.setAuth(supabaseToken)).catch((err) => {
                console.warn('[QueueTab] Failed to set realtime auth token:', err);
            });
        }

        const channelName = `barber-queue-${resolvedBarberId}`;

        const scheduleDebouncedRefresh = () => {
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = window.setTimeout(() => {
                debounceTimerRef.current = null;
                void fetchBarberQueue(true);
            }, 300);
        };

        const handleQueueChange = (payload: any) => {
            const newRow = payload.new || {};
            const oldRow = payload.old || {};
            const newBarberId = newRow.barber_id !== undefined && newRow.barber_id !== null ? Number(newRow.barber_id) : null;
            const oldBarberId = oldRow.barber_id !== undefined && oldRow.barber_id !== null ? Number(oldRow.barber_id) : null;
            const rowId = Number(newRow.id || oldRow.id);

            // Scoping & Relevance Check:
            // 1. Newly assigned to or updated for this barber
            const isAssignedToThisBarber = newBarberId === resolvedBarberId;
            // 2. Previously assigned to this barber (if old row included)
            const wasAssignedToThisBarber = oldBarberId === resolvedBarberId;
            // 3. Row was in this barber's active local queue (in chair or waiting list)
            //    This reliably catches reassignment away from this barber, cancellation, and payment completion!
            const isCurrentlyInOurQueue = Boolean(
                (nowServingRef.current && Number(nowServingRef.current.queueId) === rowId) ||
                queueRef.current.some(item => item.rawId === rowId)
            );

            if (isAssignedToThisBarber || wasAssignedToThisBarber || isCurrentlyInOurQueue) {
                scheduleDebouncedRefresh();
            }
        };

        const handleBarberStatusChange = (payload: any) => {
            const updatedBarberId = Number(payload.new?.barber_id || payload.old?.barber_id);
            if (updatedBarberId === resolvedBarberId) {
                scheduleDebouncedRefresh();
            }
        };

        const handleWindowEvent = () => {
            scheduleDebouncedRefresh();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void fetchBarberQueue(true);
            }
        };

        window.addEventListener('demoshop:reservations-changed', handleWindowEvent);
        window.addEventListener('demoshop:notifications-changed', handleWindowEvent);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const streamStatuses = new Map<string, RealtimeDisplayStatus>();
        const updateRealtimeStatus = (stream: string, status: RealtimeDisplayStatus) => {
            streamStatuses.set(stream, status);
            const statuses = Array.from(streamStatuses.values());
            const combined = statuses.includes('unavailable')
                ? 'unavailable'
                : statuses.includes('fallback')
                    ? 'fallback'
                    : statuses.length > 0 && statuses.every((value) => value === 'live')
                        ? 'live'
                        : 'connecting';
            setRealtimeStatus(combined);
        };

        const realtimeGroups: ReturnType<typeof createHasuraFallbackGroup>[] = [];
        if (resolvedBranchId) {
            const queueGroup = createHasuraFallbackGroup({
                onStatusChange: (status) => updateRealtimeStatus('queue', status),
                onFallbackActivate: () => fetchBarberQueue(true),
                onBothUnavailable: () => fetchBarberQueue(true),
                degradedIntervalMs: 60_000,
                subscribeFallback: (onStatus) => {
                    const channel = supabase
                        .channel(`${channelName}-queue-fallback`)
                        .on(
                            'postgres_changes',
                            { event: '*', schema: 'public', table: 'queue_entries', filter: `branch_id=eq.${resolvedBranchId}` },
                            handleQueueChange,
                        )
                        .subscribe(onStatus);
                    return () => { void supabase.removeChannel(channel); };
                },
            });
            realtimeGroups.push(queueGroup);
            queueGroup.subscribe(
                `subscription WatchBarberQueue($branchId: Int!) {
                   queue_entries(where: { branch_id: { _eq: $branchId } }, order_by: { id: desc }, limit: 50) {
                     id
                     barber_id
                     status
                     position
                     is_walk_in
                     created_at
                   }
                 }`,
                { branchId: resolvedBranchId },
                () => {
                    scheduleDebouncedRefresh();
                },
                (err) => {
                    console.warn('[BarberQueueTab] Hasura subscription error:', err);
                }
            );
        }

        const barberGroup = createHasuraFallbackGroup({
            onStatusChange: (status) => updateRealtimeStatus('barber', status),
            onFallbackActivate: () => fetchBarberQueue(true),
            onBothUnavailable: () => fetchBarberQueue(true),
            degradedIntervalMs: 60_000,
            subscribeFallback: (onStatus) => {
                const channel = supabase
                    .channel(`${channelName}-barber-fallback`)
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'barbers', filter: `barber_id=eq.${resolvedBarberId}` },
                        handleBarberStatusChange,
                    )
                    .subscribe(onStatus);
                return () => { void supabase.removeChannel(channel); };
            },
        });
        realtimeGroups.push(barberGroup);
        barberGroup.subscribe(
            `subscription WatchBarberStatus($barberId: Int!) {
               barbers(where: { barber_id: { _eq: $barberId } }, limit: 1) {
                 barber_id
                 status
               }
             }`,
            { barberId: resolvedBarberId },
            () => scheduleDebouncedRefresh(),
            (error) => console.warn('[BarberQueueTab] Hasura barber status subscription error:', error),
        );

        return () => {
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            window.removeEventListener('demoshop:reservations-changed', handleWindowEvent);
            window.removeEventListener('demoshop:notifications-changed', handleWindowEvent);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            for (const group of realtimeGroups) group.cleanup();
        };
    }, [authReady, resolvedBarberId, resolvedBranchId, supabaseToken, fetchBarberQueue]);

    const handleManualRefresh = async () => {
        setActionLoading(true);
        await fetchBarberQueue(false);
    };

    const handleViewPhoto = (name: string, photoUrl: string) => {
        setViewingQueuePhoto({ name, photoUrl });
    };

    const handleViewClient = (client: QueueItem) => {
        if (client.lastHaircutPhoto) {
            handleViewPhoto(client.name, client.lastHaircutPhoto);
        } else {
            queueContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            if (client.guestRef) {
                showToast(`Next in line: ${client.name} (${client.guestRef})`);
            } else {
                showToast(`Next in line: ${client.name}`);
            }
        }
    };

    const nextClient = queue.find((item) => !item.isFutureScheduled) || null;

    if (loading && !nowServing && queue.length === 0) {
        return <BarberQueueSkeleton />;
    }

    return (
        <div className="w-full space-y-4 pb-6 flex flex-col min-h-[calc(100vh-9rem)] justify-between">
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-sm flex items-center justify-between text-xs text-red-400">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button onClick={handleManualRefresh} className="text-ivory font-bold hover:underline cursor-pointer">Retry</button>
                </div>
            )}

            {alertMessage && (
                <div className="bg-gold/10 border border-gold/30 p-4 rounded-sm flex items-center justify-between text-xs text-gold">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                        <span>{alertMessage}</span>
                    </div>
                    <button onClick={() => setAlertMessage(null)} className="text-ivory hover:text-gold cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
            )}

            {realtimeStatus === 'fallback' && (
                <div className="bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 rounded-sm flex items-center justify-between text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span>Live updates temporarily unavailable • Syncing via backup polling</span>
                    </div>
                    <button onClick={handleManualRefresh} className="text-ivory font-bold hover:underline cursor-pointer">
                        Refresh
                    </button>
                </div>
            )}

            {toastMessage && (
                <div className="fixed top-4 right-4 max-w-[calc(100vw-2rem)] bg-charcoal-light border border-gold/40 text-gold px-4 py-3 rounded-sm shadow-2xl z-[100] flex items-center gap-3 animate-fade-in">
                    <Sparkles className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-semibold truncate">{toastMessage}</span>
                </div>
            )}

            {/* Dashboard Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
                <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-lg font-serif font-bold text-ivory">Queue Dashboard</h3>
                        <span className="text-[11px] font-bold text-gold bg-gold/10 px-2.5 py-0.5 rounded-full border border-gold/25 font-mono">
                            {getManilaHeaderDate()}
                        </span>
                    </div>
                    <p className="text-xs text-ivory-dim mt-0.5">Real-time view of your assigned clients and schedule flow.</p>
                </div>
                <button 
                    onClick={handleManualRefresh} 
                    className="p-2 px-3 border border-white/10 hover:bg-white/5 text-ivory-dim hover:text-gold rounded-sm transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold shadow-sm self-start sm:self-auto" 
                    title="Refresh Queue"
                >
                    <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin text-gold' : ''}`} />
                    <span>Refresh Queue</span>
                </button>
            </div>

            {/* Maximized Responsive Grid Layout - Fully Utilizes Viewport */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
                {/* Left Panel: Active Service (Now Serving) */}
                <div className="lg:col-span-7 flex flex-col h-full">
                    <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl relative flex flex-col flex-1 justify-between">
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/60 to-transparent"></div>

                        {/* Card Header with Station Status */}
                        <div className="bg-white/[0.02] px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/5 flex items-center justify-between gap-2.5 sm:gap-3 flex-shrink-0">
                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                <BarberChairIcon isSpinning={Boolean(nowServing)} size="sm" />
                                <div className="min-w-0">
                                    <h4 className="font-serif font-bold text-ivory text-sm sm:text-base tracking-wide truncate">Active Service: Now Serving</h4>
                                    <p className="text-[10px] text-ivory-dim font-mono truncate">STATION #01 • LIVE CUT STATUS</p>
                                </div>
                            </div>
                            {nowServing ? (
                                <div className="flex items-center gap-1.5 sm:gap-2 bg-gold/15 border border-gold/30 text-gold px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-[0_0_12px_rgba(212,175,55,0.15)] animate-pulse shrink-0 whitespace-nowrap">
                                    <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-gold animate-ping"></span>
                                    <span>IN CHAIR</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 text-ivory-dim px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase shrink-0 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/30"></span>
                                    <span>CHAIR IDLE</span>
                                </div>
                            )}
                        </div>

                        {/* Centered Active Cut Showcase Experience with Physical Chair Transfer Journey */}
                        <div key={nowServing ? String(nowServing.queueId) : 'empty'} className="animate-transfer-journey animate-chair-aura flex-1 flex flex-col justify-between">
                            {nowServing ? (
                                <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
                                    {/* Centered Hero Stage */}
                                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 sm:space-y-5 my-auto py-2 sm:py-4">
                                        {/* Large Animated Barber Chair Centerpiece */}
                                        <div className="animate-chair-sweep transform hover:scale-105 transition-transform duration-300">
                                            <BarberChairIcon isSpinning={true} size="xl" />
                                        </div>

                                        {/* Active Status Pill */}
                                        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-gold/20 via-gold/10 to-amber-500/20 border border-gold/40 text-gold px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-mono font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(212,175,55,0.2)] animate-pulse text-center">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
                                            <span>CURRENTLY SERVING</span>
                                        </div>

                                        {/* Customer Identity */}
                                        <div className="space-y-1 max-w-full px-2">
                                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-ivory tracking-wide drop-shadow-md break-words">
                                                {nowServing.name}
                                            </h2>
                                            <p className="text-xs text-ivory-dim font-mono tracking-wider">
                                                QUEUE ID #{nowServing.queueId}
                                            </p>
                                        </div>

                                        {/* Centered Service Badge & Elapsed Time Pill */}
                                        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 pt-1 sm:pt-2">
                                            <div className="flex items-center gap-2 bg-charcoal/90 border border-gold/30 px-3.5 sm:px-4 py-2 rounded-sm shadow-md">
                                                <Scissors className="w-4 h-4 text-gold shrink-0" />
                                                <span className="text-xs sm:text-sm font-bold text-ivory">{nowServing.service}</span>
                                            </div>

                                            <ElapsedTimeTicker
                                                startTimeRaw={nowServing.rawStartedAt || nowServing.timeStarted}
                                                initialElapsedMinutes={nowServing.elapsedMinutes}
                                            />
                                        </div>

                                        {/* Add-ons List if any */}
                                        {nowServing.addOns.length > 0 && (
                                            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                                                <span className="text-[10px] uppercase font-bold text-ivory-dim mr-1">Add-ons:</span>
                                                {nowServing.addOns.map(add => (
                                                    <span key={add} className="text-[10px] bg-white/5 border border-white/10 text-gold px-2.5 py-0.5 rounded-full font-medium">
                                                        {add}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Reference Photo Thumbnail (if provided) */}
                                        {nowServing.lastHaircutPhoto && (
                                            <button
                                                type="button"
                                                onClick={() => handleViewPhoto(nowServing.name, nowServing.lastHaircutPhoto!)}
                                                className="inline-flex items-center gap-2 bg-white/5 hover:bg-gold/15 border border-white/10 hover:border-gold/40 text-ivory hover:text-gold px-3.5 py-1.5 rounded-sm text-xs font-semibold transition-all cursor-pointer shadow-sm"
                                            >
                                                <Camera className="w-3.5 h-3.5 text-gold shrink-0" />
                                                <span>View Reference Photo</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Bottom Station Summary Strip */}
                                    <div className="bg-charcoal/80 border border-white/10 p-3 sm:p-4 rounded-sm flex flex-wrap items-center justify-between gap-2 text-xs flex-shrink-0">
                                        <div className="flex items-center gap-2 text-ivory-dim min-w-0">
                                            <Scissors className="w-4 h-4 text-gold shrink-0" />
                                            <span className="truncate">Service: <strong className="text-ivory font-semibold">{nowServing.service}</strong></span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-ivory-dim text-[11px]">Price:</span>
                                            <span className="font-serif font-bold text-gold text-base">{nowServing.price > 0 ? `₱${nowServing.price.toFixed(2)}` : 'Standard'}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Empty State: Ready Idle Chair Animation */
                                <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-4 space-y-5 bg-white/[0.01]">
                                    <BarberChairIcon isSpinning={true} size="xl" />
                                    <div className="space-y-2 max-w-sm">
                                        <div className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-ivory-dim px-3 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase shrink-0 whitespace-nowrap">
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/30"></span>
                                            <span>STATION READY • CHAIR IDLE</span>
                                        </div>
                                        <h5 className="font-serif font-bold text-ivory text-xl">Barber Station Open</h5>
                                        <p className="text-xs text-ivory-dim leading-relaxed">
                                            Your barber chair is currently unoccupied. When the next client arrives or is called from the lineup, their service details will appear here automatically.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Queue Lane Lineup + Live Station Telemetry Hub */}
                <div className="lg:col-span-5 flex flex-col h-full">
                    <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col flex-1 justify-between space-y-4">
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/60 to-transparent"></div>

                        {/* Top Lineup Header */}
                        <div>
                            <div className="flex items-center justify-between border-b border-white/5 pb-3.5">
                                <div>
                                    <h4 className="font-serif font-bold text-ivory tracking-wide flex items-center gap-2 text-base">
                                        <Clock className="w-5 h-5 text-gold" />
                                        Queue Lane Lineup
                                    </h4>
                                    <p className="text-[10px] text-ivory-dim mt-0.5">Real-time schedule flow & client arrivals</p>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                        <span>{queue.length} In Queue</span>
                                    </div>
                                    <span className="text-[10px] text-ivory-dim font-medium tracking-wide text-right">
                                        {queue.filter(q => q.type === 'Reservation').length} Reservations • {queue.filter(q => q.type !== 'Reservation').length} Walk-ins
                                    </span>
                                </div>
                            </div>

                            {/* Queue Items Container */}
                            <div 
                                ref={queueContainerRef}
                                className="space-y-3 max-h-[340px] xl:max-h-[380px] overflow-y-auto p-0.5 scroll-smooth pr-1.5 mt-3.5"
                            >
                                {queue.map((item, index) => (
                                    <QueueCard
                                        key={item.id}
                                        item={item}
                                        index={index}
                                        onViewPhoto={handleViewPhoto}
                                    />
                                ))}

                                {queue.length === 0 && (
                                    <div className="flex flex-col items-center justify-center text-center py-12 text-ivory-dim space-y-3 bg-white/[0.01] border border-white/5 rounded-sm">
                                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-gold/60">
                                            <Clock className="w-6 h-6" />
                                        </div>
                                        <div className="space-y-1 max-w-xs">
                                            <p className="font-serif font-bold text-ivory text-sm">No Upcoming Clients in Lane</p>
                                            <p className="text-xs text-ivory-dim">New walk-ins or confirmed reservations will appear in this lane live.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Operational "Up Next" Section (Lightweight & Barber-First) */}
                        {nextClient && (
                            <div className="bg-charcoal/80 border border-white/10 rounded-sm p-3.5 sm:p-4 mt-auto shadow-sm">
                                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                    <span className="text-[11px] font-mono font-bold tracking-widest text-gold uppercase">
                                        Up Next
                                    </span>
                                    <span className="text-xs font-mono font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-xs border border-gold/30">
                                        #1
                                    </span>
                                </div>

                                <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <h5 className="font-bold text-ivory text-sm sm:text-base leading-snug break-words">
                                            {nextClient.name}
                                        </h5>
                                        <p className="text-xs text-gold/90 font-medium truncate" title={nextClient.styleRef}>
                                            {nextClient.styleRef}
                                        </p>
                                        <p className="text-[11px] text-ivory-dim">
                                            {nextClient.type === 'Walk-in' ? (
                                                <>
                                                    <span>Walk-in</span>
                                                    <span> • {calculateElapsedMinutes(nextClient.rawItem?.created_at) > 0 
                                                        ? `Waiting ${calculateElapsedMinutes(nextClient.rawItem?.created_at)} min` 
                                                        : 'Just arrived'}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>{nextClient.type}</span>
                                                    <span> • {nextClient.dateContext ? `${nextClient.dateContext} ` : ''}{nextClient.eta}</span>
                                                </>
                                            )}
                                        </p>
                                    </div>

                                    <div className="shrink-0 w-full sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={() => handleViewClient(nextClient)}
                                            className="w-full sm:w-auto px-4 py-2 bg-gold/10 hover:bg-gold/20 active:bg-gold/30 border border-gold/30 hover:border-gold/60 text-gold font-semibold text-xs rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                            <span>View Client</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-gold shrink-0" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <HaircutPhotoViewerModal photoData={viewingQueuePhoto} onClose={() => setViewingQueuePhoto(null)} />
        </div>
    );
};
