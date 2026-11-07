import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchPendingReservationsCount } from '../services/cashier-queue.service';
import { supabase } from '@/config/supabaseClient';
import { useAuth } from '@/components/auth/AuthContext';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';
import { useOptionalQueueData } from '../context/QueueDataContext';

export function usePendingReservationsCount(): number {
    const queueData = useOptionalQueueData();
    const [standaloneCount, setStandaloneCount] = useState<number>(0);
    const { user, authReady, supabaseToken } = useAuth();
    const cashierBranchId = Number((user as { branch_id?: number })?.branch_id);
    const isBranchScoped = Number.isInteger(cashierBranchId) && cashierBranchId > 0;

    const isInsideProvider = queueData !== null;

    const fetchPendingCount = useCallback(async () => {
        try {
            const res = await fetchPendingReservationsCount(cashierBranchId);
            const count = Number(res.data?.count);
            if (Number.isFinite(count)) {
                setStandaloneCount(count);
            }
        } catch (err) {
            console.warn('[usePendingReservationsCount] Failed to fetch pending reservations count:', err);
        }
    }, [cashierBranchId]);

    useEffect(() => {
        // When inside QueueDataProvider, count is reactively driven by QueueDataContext
        if (isInsideProvider || !authReady || !isBranchScoped) return;

        void fetchPendingCount();

        // Window event listeners for immediate local state updates
        const handleEvent = () => fetchPendingCount();
        window.addEventListener('demoshop:reservations-changed', handleEvent);
        window.addEventListener('demoshop:notifications-changed', handleEvent);

        if (supabaseToken) supabase.realtime.setAuth(supabaseToken);
        const realtimeGroup = createHasuraFallbackGroup({
            subscribeFallback: (onStatus) => {
                const channel = supabase
                    .channel(`cashier-pending-reservations-count-${cashierBranchId}`)
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'queue_entries', filter: `branch_id=eq.${cashierBranchId}` },
                        () => { void fetchPendingCount(); }
                    )
                    .subscribe(onStatus);
                return () => { void supabase.removeChannel(channel); };
            },
            onFallbackActivate: fetchPendingCount,
            onBothUnavailable: fetchPendingCount,
            degradedIntervalMs: 60_000,
        });
        realtimeGroup.subscribe<{ cashier_reservation_realtime?: { id: number }[] }>(
            `subscription WatchPendingReservations($branchId: Int!) {
               cashier_reservation_realtime(where: { branch_id: { _eq: $branchId }, status: { _eq: "pending" } }) {
                 id
               }
             }`,
            { branchId: cashierBranchId },
            (data) => {
                if (Array.isArray(data?.cashier_reservation_realtime)) {
                    setStandaloneCount(data.cashier_reservation_realtime.length);
                }
            },
            (err) => {
                console.warn('[usePendingReservationsCount] Hasura subscription error, falling back:', err);
            },
        );

        return () => {
            window.removeEventListener('demoshop:reservations-changed', handleEvent);
            window.removeEventListener('demoshop:notifications-changed', handleEvent);
            realtimeGroup.cleanup();
        };
    }, [authReady, cashierBranchId, fetchPendingCount, isBranchScoped, isInsideProvider, supabaseToken]);

    const contextCount = useMemo(() => {
        if (!queueData) return null;
        return queueData.reservations.filter((reservation) => reservation.status === 'pending').length;
    }, [queueData]);

    return contextCount !== null ? contextCount : standaloneCount;
}

