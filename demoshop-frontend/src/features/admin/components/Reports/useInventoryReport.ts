import { useCallback, useEffect, useRef, useState } from 'react';
import type { InventoryReportResponse, InventoryVarianceItem } from '@demoshop/shared-types';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';

interface Options {
    active: boolean;
    startDate: string;
    endDate: string;
    period: string;
    showCountDifferences: boolean;
    parseReport: (payload: unknown) => InventoryReportResponse;
}

interface Snapshot {
    key: string;
    report: InventoryReportResponse;
    updatedAt: number;
}

const isCanceled = (error: unknown) => (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_CANCELED'
);

/** Loading and live updates are isolated from the other admin report modes. */
export function useInventoryReport({ active, startDate, endDate, period, showCountDifferences, parseReport }: Options) {
    const key = `${startDate}:${endDate}:${period}`;
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [counts, setCounts] = useState<{ source: Snapshot; data: InventoryVarianceItem[] } | null>(null);
    const [countsError, setCountsError] = useState('');
    const [countsLoading, setCountsLoading] = useState(false);
    const requestRef = useRef<AbortController | null>(null);
    const countsRequestRef = useRef<AbortController | null>(null);
    const countsSourceRef = useRef<Snapshot | null>(null);
    const pendingRefreshRef = useRef(false);
    const lastUpdatedRef = useRef(0);
    const refreshRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
    const visibleSnapshot = active && snapshot?.key === key ? snapshot : null;

    const refresh = useCallback(async (silent = false) => {
        if (!active) return;
        if (silent && requestRef.current) {
            pendingRefreshRef.current = true;
            return;
        }
        requestRef.current?.abort();
        pendingRefreshRef.current = false;
        const controller = new AbortController();
        requestRef.current = controller;
        if (!silent) setLoading(true);
        setError('');
        try {
            const response = await api.get<unknown>('/api/inventory/reports', {
                params: { startDate, endDate, period, view: 'summary' },
                signal: controller.signal,
            });
            if (controller.signal.aborted || requestRef.current !== controller) return;
            const report = parseReport(response.data);
            const updatedAt = Date.now();
            lastUpdatedRef.current = updatedAt;
            setSnapshot({ key, report, updatedAt });
        } catch (failure) {
            if (controller.signal.aborted || isCanceled(failure) || requestRef.current !== controller) return;
            setError('We couldn’t update the stock report. Please try again.');
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setLoading(false);
                if (pendingRefreshRef.current) {
                    pendingRefreshRef.current = false;
                    void refreshRef.current(true);
                }
            }
        }
    }, [active, startDate, endDate, period, key, parseReport]);

    useEffect(() => {
        refreshRef.current = refresh;
        if (active) void refresh();
        return () => {
            requestRef.current?.abort();
            requestRef.current = null;
            pendingRefreshRef.current = false;
        };
    }, [active, refresh]);

    const refreshCounts = useCallback(async () => {
        if (!visibleSnapshot) return;
        countsRequestRef.current?.abort();
        const controller = new AbortController();
        countsRequestRef.current = controller;
        setCountsLoading(true);
        setCountsError('');
        try {
            const response = await api.get<InventoryVarianceItem[]>('/api/inventory/variances', {
                params: { startDate, endDate },
                signal: controller.signal,
            });
            if (controller.signal.aborted || countsRequestRef.current !== controller) return;
            if (!Array.isArray(response.data)) throw new Error('Missing stock counts');
            countsSourceRef.current = visibleSnapshot;
            setCounts({ source: visibleSnapshot, data: response.data });
        } catch (failure) {
            if (controller.signal.aborted || isCanceled(failure)) return;
            setCountsError('We couldn’t load the stock counts. Please try again.');
        } finally {
            if (countsRequestRef.current === controller) {
                countsRequestRef.current = null;
                setCountsLoading(false);
            }
        }
    }, [visibleSnapshot, startDate, endDate]);

    useEffect(() => {
        if (active && showCountDifferences && countsSourceRef.current !== visibleSnapshot) void refreshCounts();
        return () => {
            countsRequestRef.current?.abort();
            countsRequestRef.current = null;
        };
    // A successful summary refresh invalidates count details for that snapshot.
    }, [active, showCountDifferences, refreshCounts, visibleSnapshot]);

    useEffect(() => {
        if (!active) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let dirty = false;
        const queueRefresh = () => {
            dirty = true;
            if (document.visibilityState !== 'visible') return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                dirty = false;
                void refresh(true);
            }, 500);
        };
        const onReturn = () => {
            if (document.visibilityState === 'visible' && (dirty || Date.now() - lastUpdatedRef.current > 30_000)) queueRefresh();
        };
        const events = ['demoshop:inventory-changed', 'demoshop:stock-count-changed', 'demoshop:purchase-orders-changed', 'demoshop:bottle-lifecycle-changed'];
        events.forEach((event) => window.addEventListener(event, queueRefresh));
        window.addEventListener('focus', onReturn);
        document.addEventListener('visibilitychange', onReturn);
        const channel = supabase.channel('admin-inventory-report');
        ['inventory_products', 'inventory_stock', 'inventory_consumption', 'inventory_stock_movements', 'inventory_stock_count_submissions', 'inventory_stock_count_lines'].forEach((table) => {
            channel.on('postgres_changes', { event: '*', schema: 'public', table }, queueRefresh);
        });
        channel.subscribe((status) => {
            // Reconnects may have missed changes; the first connection already has an initial request.
            if (status === 'SUBSCRIBED' && lastUpdatedRef.current && Date.now() - lastUpdatedRef.current > 30_000) queueRefresh();
        });
        return () => {
            clearTimeout(timer);
            events.forEach((event) => window.removeEventListener(event, queueRefresh));
            window.removeEventListener('focus', onReturn);
            document.removeEventListener('visibilitychange', onReturn);
            void supabase.removeChannel(channel).catch(() => {});
        };
    }, [active, refresh]);

    return {
        report: visibleSnapshot?.report ?? null,
        loading: active && (loading || (!visibleSnapshot && !error)),
        error,
        updatedAt: visibleSnapshot?.updatedAt,
        refresh,
        variances: counts?.source === visibleSnapshot ? counts.data : null,
        countsLoading: showCountDifferences && countsLoading,
        countsError,
        refreshCounts,
    };
}
