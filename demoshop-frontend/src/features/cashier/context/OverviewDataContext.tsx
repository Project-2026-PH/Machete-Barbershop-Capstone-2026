import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { supabase } from '@/config/supabaseClient';
import {
  fetchCashierDashboardSnapshot,
  type BarberBreakdownDateRange,
} from '../services/cashier-reporting.service';
import type { RealtimeDisplayStatus } from '@/utils/supabase-realtime';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';
import { telemetryManager } from '@/utils/adaptive-polling';

export interface OverviewBarberStatus {
  id: number | string;
  name: string;
  status: string;
  customer_count?: number;
  services_performed?: string[];
  customers?: {
    id: number | string;
    name: string;
    service: string;
    served_at: string;
  }[];
}

export interface OverviewTransaction {
  id: number | string;
  amount: number;
  payment_method?: string;
  customer: string;
  barber: string;
  service: string;
  created_at: string;
}

interface OverviewDataContextType {
  sales: number;
  cashSales: number;
  defaultCashCount: number;
  expectedCash: number;
  customers: number;
  barbers: OverviewBarberStatus[];
  transactions: OverviewTransaction[];
  transactionsTotal: number;
  transactionsTotalPages: number;
  barberDateRange: BarberBreakdownDateRange;
  setBarberDateRange: (range: BarberBreakdownDateRange) => void;
  page: number;
  setPage: (page: number | ((prev: number) => number)) => void;
  transactionSearch: string;
  setTransactionSearch: (search: string) => void;
  transactionDateRange: 'all' | 'today' | 'week' | 'month';
  setTransactionDateRange: (range: 'all' | 'today' | 'week' | 'month') => void;
  transactionBarberId: string;
  setTransactionBarberId: (barberId: string) => void;
  loading: boolean;
  transactionsLoading: boolean;
  error: string | null;
  realtimeStatus: RealtimeDisplayStatus;
  refetchAll: () => Promise<void>;
}

const OverviewDataContext = createContext<OverviewDataContextType | null>(null);

export const OverviewDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, authReady, supabaseToken } = useAuth();
  const branchId = Number(user?.branch_id);
  const hasBranch = Number.isInteger(branchId) && branchId > 0;

  const [sales, setSales] = useState(0);
  const [cashSales, setCashSales] = useState(0);
  const [defaultCashCount, setDefaultCashCount] = useState(10_000);
  const [expectedCash, setExpectedCash] = useState(10_000);
  const [customers, setCustomers] = useState(0);
  const [barbers, setBarbers] = useState<OverviewBarberStatus[]>([]);
  const [transactions, setTransactions] = useState<OverviewTransaction[]>([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [transactionsTotalPages, setTransactionsTotalPages] = useState(1);

  const [barberDateRange, setBarberDateRange] = useState<BarberBreakdownDateRange>('today');
  const [page, setPage] = useState(1);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Recent Activity links to Today's Sales, so keep its preview scoped to the
  // same Manila business day as the destination page.
  const [transactionDateRange, setTransactionDateRange] = useState<'all' | 'today' | 'week' | 'month'>('today');
  const [transactionBarberId, setTransactionBarberId] = useState('all');

  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeDisplayStatus>('connecting');

  const debounceTimerRef = useRef<number | null>(null);
  const refetchInFlightRef = useRef<Promise<void> | null>(null);
  const trailingRefetchRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const latestSummaryRequestRef = useRef(0);
  const latestBarbersRequestRef = useRef(0);
  const latestTransactionsRequestRef = useRef(0);
  const previousSnapshotScopeRef = useRef<{ branchId: number; barberDateRange: BarberBreakdownDateRange } | null>(null);
  const firstDashboardReadyReportedRef = useRef(false);
  const firstDashboardLoadStartedAtRef = useRef(Date.now());
  const dashboardHasLoadedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(transactionSearch.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [transactionSearch]);

  const fetchDashboardSnapshot = useCallback(async (sections: 'all' | 'barbers' | 'transactions' = 'all') => {
    if (!hasBranch) return;

    const requestId = ++requestSequenceRef.current;
    const includesSummary = sections === 'all';
    const includesBarbers = sections === 'all' || sections === 'barbers';
    const includesTransactions = sections === 'all' || sections === 'transactions';
    if (includesSummary) {
      latestSummaryRequestRef.current = requestId;
      if (!dashboardHasLoadedRef.current) setLoading(true);
    }
    if (includesBarbers) latestBarbersRequestRef.current = requestId;
    if (includesTransactions) {
      latestTransactionsRequestRef.current = requestId;
      setTransactionsLoading(true);
    }
    try {
      const response = await fetchCashierDashboardSnapshot({
        barberDateRange,
        page,
        limit: 20,
        dateRange: transactionDateRange,
        barberId: transactionBarberId !== 'all' ? Number(transactionBarberId) : undefined,
        search: debouncedSearch || undefined,
        sections: sections === 'all' ? undefined : [sections],
      }, String(branchId));
      const data = response.data;
      if (
        sections === 'all' &&
        latestSummaryRequestRef.current === requestId &&
        latestBarbersRequestRef.current === requestId &&
        !firstDashboardReadyReportedRef.current
      ) {
        firstDashboardReadyReportedRef.current = true;
        telemetryManager.logEvent('cashier_first_data_ready', {
          flow: 'dashboard',
          durationMs: Date.now() - firstDashboardLoadStartedAtRef.current,
        });
      }

      if (latestSummaryRequestRef.current === requestId && data.summary) {
        const summary = data.summary;
        const nextCashSales = Number(summary.cash_sales || 0);
        const nextDefaultCashCount = Number(summary.default_cash_count ?? 10_000);
        setSales(Number(summary.total_revenue || 0));
        setCashSales(nextCashSales);
        setDefaultCashCount(nextDefaultCashCount);
        // Expected cash is the drawer float plus cash sales only. Derive it from
        // the cash-only field instead of trusting an aggregate that may include GCash.
        setExpectedCash(nextDefaultCashCount + nextCashSales);
        setCustomers(Number(summary.total_customers || 0));
        dashboardHasLoadedRef.current = true;
      }
      if (latestBarbersRequestRef.current === requestId && Array.isArray(data.barbers)) {
        setBarbers(data.barbers as OverviewBarberStatus[]);
      }
      if (latestTransactionsRequestRef.current === requestId && Array.isArray(data.transactions)) {
        setTransactions(data.transactions);
        setTransactionsTotal(Number(data.transactionsTotal || 0));
        setTransactionsTotalPages(Number(data.transactionsTotalPages || 1));
      }
      if (
        (!includesSummary || latestSummaryRequestRef.current === requestId) &&
        (!includesBarbers || latestBarbersRequestRef.current === requestId) &&
        (!includesTransactions || latestTransactionsRequestRef.current === requestId)
      ) setError(null);
    } catch (err: any) {
      console.warn('[OverviewDataContext] Failed to fetch dashboard snapshot:', err);
      if (
        (!includesSummary || latestSummaryRequestRef.current === requestId) &&
        (!includesBarbers || latestBarbersRequestRef.current === requestId) &&
        (!includesTransactions || latestTransactionsRequestRef.current === requestId)
      ) setError(err.message || 'Failed to load overview data');
    } finally {
      if (includesSummary && latestSummaryRequestRef.current === requestId) setLoading(false);
      if (includesTransactions && latestTransactionsRequestRef.current === requestId) setTransactionsLoading(false);
    }
  }, [barberDateRange, branchId, debouncedSearch, hasBranch, page, transactionBarberId, transactionDateRange]);

  useEffect(() => {
    if (!authReady || !hasBranch) return;

    const previousScope = previousSnapshotScopeRef.current;
    previousSnapshotScopeRef.current = { branchId, barberDateRange };
    if (!previousScope || previousScope.branchId !== branchId) {
      if (previousScope && previousScope.branchId !== branchId) {
        dashboardHasLoadedRef.current = false;
        setLoading(true);
        setSales(0);
        setCashSales(0);
        setDefaultCashCount(10_000);
        setExpectedCash(10_000);
        setCustomers(0);
        setBarbers([]);
        setTransactions([]);
        setTransactionsTotal(0);
        setTransactionsTotalPages(1);
        setError(null);
      }
      void fetchDashboardSnapshot('all');
    } else if (previousScope.barberDateRange !== barberDateRange) {
      void fetchDashboardSnapshot('barbers');
    } else {
      void fetchDashboardSnapshot('transactions');
    }
  }, [authReady, hasBranch, fetchDashboardSnapshot]);

  const refetchAll = useCallback(async (): Promise<void> => {
    if (refetchInFlightRef.current) {
      trailingRefetchRef.current = true;
      return refetchInFlightRef.current;
    }

    refetchInFlightRef.current = fetchDashboardSnapshot()
      .finally(() => {
        refetchInFlightRef.current = null;
        if (trailingRefetchRef.current) {
          trailingRefetchRef.current = false;
          window.setTimeout(() => void refetchAll(), 0);
        }
      });

    return refetchInFlightRef.current;
  }, [fetchDashboardSnapshot]);

  const refetchTransactions = useCallback(() => {
    void fetchDashboardSnapshot('transactions');
  }, [fetchDashboardSnapshot]);


  useEffect(() => {
    if (!authReady || !hasBranch) return;
    if (supabaseToken) supabase.realtime.setAuth(supabaseToken);

    const channelName = `cashier-overview-tab-${branchId}`;
    const triggerDebouncedFetch = () => {
      if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void refetchTransactions();
      }, 300);
    };

    const realtimeGroup = createHasuraFallbackGroup({
      onStatusChange: setRealtimeStatus,
      onFallbackActivate: triggerDebouncedFetch,
      onBothUnavailable: triggerDebouncedFetch,
      degradedIntervalMs: 60_000,
      subscribeFallback: (onStatus) => {
        const channel = supabase
          .channel(`${channelName}-supabase-fallback`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'transactions', filter: `branch_id=eq.${branchId}` },
            triggerDebouncedFetch,
          )
          .subscribe(onStatus);
        return () => { void supabase.removeChannel(channel); };
      },
    });

    realtimeGroup.subscribe(
      `subscription WatchBranchTransactions($branchId: Int!) {
         transactions(where: { branch_id: { _eq: $branchId } }, limit: 1) {
           __typename
         }
       }`,
      { branchId },
      () => triggerDebouncedFetch(),
      () => {},
    );

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      realtimeGroup.cleanup();
    };
  }, [authReady, branchId, hasBranch, refetchTransactions, supabaseToken]);

  const value: OverviewDataContextType = {
    sales,
    cashSales,
    defaultCashCount,
    expectedCash,
    customers,
    barbers,
    transactions,
    transactionsTotal,
    transactionsTotalPages,
    barberDateRange,
    setBarberDateRange,
    page,
    setPage,
    transactionSearch,
    setTransactionSearch,
    transactionDateRange,
    setTransactionDateRange,
    transactionBarberId,
    setTransactionBarberId,
    loading,
    transactionsLoading,
    error,
    realtimeStatus,
    refetchAll,
  };

  return <OverviewDataContext.Provider value={value}>{children}</OverviewDataContext.Provider>;
};

export const useOverviewData = (): OverviewDataContextType => {
  const ctx = useContext(OverviewDataContext);
  if (!ctx) throw new Error('useOverviewData must be used within <OverviewDataProvider>');
  return ctx;
};
