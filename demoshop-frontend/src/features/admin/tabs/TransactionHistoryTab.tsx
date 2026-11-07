import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  DollarSign,
  Receipt,
  Users,
  TrendingUp,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Scissors,
  ShoppingBag,
  CreditCard,
  FileSpreadsheet,
} from 'lucide-react';
import type {
  TransactionHistoryItem,
  TransactionHistoryResponse,
  TransactionFilterDTO,
} from '@demoshop/shared-types';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';
import { getManilaDateIso } from '@/utils/manila-date';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  TransactionFilters,
  TransactionFiltersState,
  StaffOption,
} from '@/features/admin/components/Transactions/TransactionFilters';
import { TransactionDetailDrawer } from '@/features/admin/components/Transactions/TransactionDetailDrawer';
import { ReportSubHeaderNav } from '@/features/admin/components/Reports/ReportSubHeaderNav';
import { exportCsv } from '@/features/admin/components/Reports/chart-theme';
import { useSearchHighlight } from '@/features/admin/hooks/useSearchHighlight';

const formatCurrency = (val?: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(val || 0));

const TransactionTableSkeleton: React.FC = () => (
  <>
    {Array.from({ length: 8 }).map((_, index) => (
      <tr key={index} aria-hidden="true">
        <td className="py-3 px-3.5"><Skeleton variant="text" className="h-3 w-28" /></td>
        <td className="py-3 px-3"><Skeleton variant="text" className="h-3 w-32" /></td>
        <td className="py-3 px-3"><Skeleton variant="text" className="h-4 w-20" /></td>
        <td className="py-3 px-3"><Skeleton variant="text" className="h-3 w-32" /></td>
        <td className="py-3 px-3"><Skeleton variant="text" className="h-3 w-24" /></td>
        <td className="py-3 px-3"><Skeleton variant="text" className="h-3 w-40" /></td>
        <td className="py-3 px-3"><Skeleton variant="text" className="h-4 w-20" /></td>
        <td className="py-3 px-3"><Skeleton variant="text" className="ml-auto h-3 w-20" /></td>
        <td className="py-3 px-3.5"><Skeleton variant="text" className="mx-auto h-8 w-16" /></td>
      </tr>
    ))}
  </>
);

const TransactionMobileSkeleton: React.FC = () => (
  <div className="space-y-3 p-3 block md:hidden">
    {Array.from({ length: 4 }).map((_, index) => (
      <div key={index} className="rounded-lg border border-white/5 bg-charcoal/40 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="h-3 w-28" />
          <Skeleton variant="text" className="h-4 w-20" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="h-3 w-36" />
          <Skeleton variant="text" className="h-4 w-16" />
        </div>
        <Skeleton variant="text" className="h-3 w-full" />
      </div>
    ))}
  </div>
);

const getPresetDates = (
  preset: TransactionFiltersState['preset']
): { startDate: string; endDate: string } => {
  const today = getManilaDateIso();
  const todayDate = new Date(`${today}T00:00:00+08:00`);

  if (preset === 'today') {
    return { startDate: today, endDate: today };
  }

  if (preset === 'this_week') {
    const day = todayDate.getDay();
    const diff = todayDate.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(todayDate);
    monday.setDate(diff);
    return {
      startDate: monday.toISOString().slice(0, 10),
      endDate: today,
    };
  }

  if (preset === 'last_7_days') {
    const past = new Date(todayDate);
    past.setDate(past.getDate() - 6);
    return {
      startDate: past.toISOString().slice(0, 10),
      endDate: today,
    };
  }

  if (preset === 'this_month') {
    const firstDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
    return {
      startDate: firstDay.toISOString().slice(0, 10),
      endDate: today,
    };
  }

  return { startDate: today, endDate: today };
};

const formatTransactionDate = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'Asia/Manila',
}).format(new Date(`${value}T00:00:00+08:00`));

const getEmptyTransactionMessage = (filters: TransactionFiltersState) => {
  if (filters.preset === 'custom') {
    return `No transactions match for the range of ${formatTransactionDate(filters.startDate)} - ${formatTransactionDate(filters.endDate)}.`;
  }

  const presetLabels: Record<Exclude<TransactionFiltersState['preset'], 'custom'>, string> = {
    today: 'Today',
    this_week: 'This Week',
    last_7_days: 'Last 7 Days',
    this_month: 'This Month',
  };

  return `No transactions match for ${presetLabels[filters.preset]}.`;
};

export interface TransactionHistoryTabProps {
  embedded?: boolean;
  startDate?: string;
  endDate?: string;
  dateFilterLabel?: string;
}

export const TransactionHistoryTab: React.FC<TransactionHistoryTabProps> = ({
  embedded = false,
  startDate: propStartDate,
  endDate: propEndDate,
  dateFilterLabel,
}) => {
  const [searchParams] = useSearchParams();
  const todayIso = getManilaDateIso();

  const urlChannel = searchParams.get('channel') as TransactionFiltersState['channel'] | null;
  const urlPreset = searchParams.get('preset') as TransactionFiltersState['preset'] | null;
  const urlSearch = searchParams.get('search') || searchParams.get('q') || '';
  const urlStartDate = searchParams.get('startDate');
  const urlEndDate = searchParams.get('endDate');
  const urlStatus = searchParams.get('status');

  const initialPreset: TransactionFiltersState['preset'] =
    urlPreset && ['today', 'this_week', 'last_7_days', 'this_month', 'custom'].includes(urlPreset)
      ? urlPreset
      : (urlStartDate || urlEndDate ? 'custom' : 'today');
  const initialDates = getPresetDates(initialPreset);
  const initialChannel: TransactionFiltersState['channel'] =
    urlChannel && ['all', 'walk-in', 'online', 'retail', 'unknown'].includes(urlChannel)
      ? urlChannel
      : 'all';

  const [filters, setFilters] = useState<TransactionFiltersState>({
    search: urlSearch,
    channel: initialChannel,
    preset: initialPreset,
    startDate: urlStartDate || initialDates.startDate,
    endDate: urlEndDate || initialDates.endDate,
    paymentMethod: 'all',
    barberId: 'all',
    status: urlStatus || 'all',
    category: 'all',
    minAmount: '',
    maxAmount: '',
  });

  // Sync filters if URL search params change
  useEffect(() => {
    const pChannel = searchParams.get('channel') as TransactionFiltersState['channel'] | null;
    const pPreset = searchParams.get('preset') as TransactionFiltersState['preset'] | null;
    const pSearch = searchParams.get('search') || searchParams.get('q');
    const pStartDate = searchParams.get('startDate');
    const pEndDate = searchParams.get('endDate');
    const pStatus = searchParams.get('status');

    setFilters((prev) => {
      let nextPreset = prev.preset;
      let nextStart = prev.startDate;
      let nextEnd = prev.endDate;

      if (pStartDate || pEndDate) {
        nextPreset = 'custom';
        if (pStartDate) nextStart = pStartDate;
        if (pEndDate) nextEnd = pEndDate;
      } else if (pPreset && ['today', 'this_week', 'last_7_days', 'this_month', 'custom'].includes(pPreset)) {
        nextPreset = pPreset;
        const d = getPresetDates(pPreset);
        nextStart = d.startDate;
        nextEnd = d.endDate;
      }

      const nextChannel = pChannel && ['all', 'walk-in', 'online', 'retail', 'unknown'].includes(pChannel)
        ? pChannel
        : prev.channel;
      const nextSearch = pSearch !== null ? pSearch : prev.search;
      // If a search query is passed without an explicit status, ensure status is 'all' so stale status filters don't hide results
      const nextStatus = pStatus ? pStatus : (pSearch ? 'all' : prev.status);

      if (
        prev.channel === nextChannel &&
        prev.preset === nextPreset &&
        prev.search === nextSearch &&
        prev.startDate === nextStart &&
        prev.endDate === nextEnd &&
        prev.status === nextStatus
      ) {
        return prev;
      }

      return {
        ...prev,
        channel: nextChannel,
        preset: nextPreset,
        search: nextSearch,
        startDate: nextStart,
        endDate: nextEnd,
        status: nextStatus,
      };
    });
  }, [searchParams]);

  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(25);
  const [data, setData] = useState<TransactionHistoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTransaction, setSelectedTransaction] = useState<TransactionHistoryItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorByPageRef = useRef<Record<number, string>>({});

  // Activate glow highlight and scroll-into-view when items load
  useSearchHighlight(!loading && Boolean(data?.transactions && data.transactions.length > 0));

  // Automatically open the Transaction / Booking detail drawer when deep-linked
  const hasAutoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !data?.transactions || data.transactions.length === 0) return;
    const bookingId = searchParams.get('bookingId');
    const txnId = searchParams.get('transactionId');
    const highlightId = searchParams.get('highlightId');

    const deepKey = `${bookingId || ''}-${txnId || ''}-${highlightId || ''}`;
    if (!deepKey.replace(/-/g, '')) return;
    if (hasAutoOpenedRef.current === deepKey) return;

    const matched = data.transactions.find((t) => {
      if (bookingId && (String(t.queueEntryId) === bookingId || `appointment-${t.queueEntryId}` === bookingId || `booking-${t.queueEntryId}` === bookingId)) return true;
      if (txnId && (String(t.id) === txnId || `transaction-${t.id}` === txnId || t.referenceNumber === txnId)) return true;
      if (highlightId) {
        if (String(t.id) === highlightId || `transaction-${t.id}` === highlightId || t.referenceNumber === highlightId) return true;
        if (t.queueEntryId && (String(t.queueEntryId) === highlightId || `appointment-${t.queueEntryId}` === highlightId || `booking-${t.queueEntryId}` === highlightId)) return true;
      }
      return false;
    });

    if (matched) {
      hasAutoOpenedRef.current = deepKey;
      setSelectedTransaction(matched);
      setIsDrawerOpen(true);
    }
  }, [loading, data?.transactions, searchParams]);

  // Fetch staff list for barber filter
  useEffect(() => {
    let isMounted = true;
    api
      .get('/api/admin/staff')
      .then((res: any) => {
        if (!isMounted) return;
        const staff = (res.data?.staff || res.data || []).map((s: any) => ({
          id: s.barber_id || s.id,
          name: s.name || s.username || 'Barber',
        }));
        setStaffList(staff);
      })
      .catch(() => { });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch transactions function
  const fetchTransactions = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const dates = embedded && propStartDate && propEndDate
        ? { startDate: propStartDate, endDate: propEndDate }
        : filters.preset === 'custom'
          ? { startDate: filters.startDate, endDate: filters.endDate }
          : getPresetDates(filters.preset);

      const params: Record<string, any> = {
        page,
        limit,
        startDate: dates.startDate,
        endDate: dates.endDate,
      };

      if (page > 1 && cursorByPageRef.current[page]) {
        params.cursor = cursorByPageRef.current[page];
      }

      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.channel !== 'all') params.channel = filters.channel;
      if (filters.paymentMethod !== 'all') params.paymentMethod = filters.paymentMethod;
      if (filters.barberId !== 'all') params.barberId = filters.barberId;
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.category !== 'all') params.category = filters.category;
      if (filters.minAmount) params.minAmount = filters.minAmount;
      if (filters.maxAmount) params.maxAmount = filters.maxAmount;

      const res = await api.get('/api/admin/transactions', {
        params,
        signal: controller.signal,
      });

      setData(res.data);
      const nextCursor = res.data?.pagination?.nextCursor;
      if (nextCursor) {
        cursorByPageRef.current[page + 1] = nextCursor;
      } else {
        delete cursorByPageRef.current[page + 1];
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
        return;
      }
      setError(err?.response?.data?.message || err?.message || 'Failed to fetch transaction ledger.');
    } finally {
      setLoading(false);
    }
  }, [embedded, propStartDate, propEndDate, filters, page, limit]);

  // Reset page when parent date range changes
  useEffect(() => {
    if (embedded && propStartDate && propEndDate) {
      cursorByPageRef.current = {};
      setPage(1);
    }
  }, [embedded, propStartDate, propEndDate]);

  // Debounced query on filter changes
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchTransactions();
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [fetchTransactions]);

  // Automated Supabase Realtime synchronization
  useEffect(() => {
    let realtimeDebounce: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedFetch = () => {
      if (realtimeDebounce) clearTimeout(realtimeDebounce);
      realtimeDebounce = setTimeout(() => {
        fetchTransactions();
      }, 400);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerDebouncedFetch();
      }
    };
    const handleWindowFocus = () => triggerDebouncedFetch();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    const channel = supabase
      .channel('admin-transactions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => triggerDebouncedFetch()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => triggerDebouncedFetch()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries' },
        () => triggerDebouncedFetch()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipt_documents' },
        () => triggerDebouncedFetch()
      )
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      if (realtimeDebounce) clearTimeout(realtimeDebounce);
      void supabase.removeChannel(channel).catch(() => { });
    };
  }, [fetchTransactions]);

  // Handle filter changes
  const handleFilterChange = (updated: Partial<TransactionFiltersState>) => {
    setFilters((prev) => ({ ...prev, ...updated }));
    cursorByPageRef.current = {};
    setPage(1);
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      search: '',
      channel: 'all',
      preset: 'today',
      startDate: todayIso,
      endDate: todayIso,
      paymentMethod: 'all',
      barberId: 'all',
      status: 'all',
      category: 'all',
      minAmount: '',
      maxAmount: '',
    });
    cursorByPageRef.current = {};
    setPage(1);
  };

  // Active filter count calculation
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.channel !== 'all') count++;
    if (!embedded && filters.preset !== 'today') count++;
    if (filters.paymentMethod !== 'all') count++;
    if (filters.barberId !== 'all') count++;
    if (filters.status !== 'all') count++;
    if (filters.category !== 'all') count++;
    if (filters.minAmount || filters.maxAmount) count++;
    return count;
  }, [embedded, filters]);

  const handleExportCsv = () => {
    if (!data?.transactions || data.transactions.length === 0) return;
    const headers = [
      'Reference #',
      'Invoice ID',
      'Date',
      'Time',
      'Channel',
      'Customer',
      'Barber Assigned',
      'Items Summary',
      'Payment Method',
      'Total Amount (PHP)',
      'Status',
    ];
    const rows = data.transactions.map((tx) => [
      tx.referenceNumber,
      tx.invoiceId,
      tx.formattedDate,
      tx.formattedTime,
      tx.channelBadge,
      tx.customer?.name || 'Walk-in',
      tx.barber?.name || 'Unassigned',
      tx.itemsSummary,
      tx.paymentMethodDisplay,
      tx.totalAmount.toFixed(2),
      tx.status,
    ]);
    const fileStart = embedded && propStartDate ? propStartDate : (filters.preset === 'custom' ? filters.startDate : getPresetDates(filters.preset).startDate);
    const fileEnd = embedded && propEndDate ? propEndDate : (filters.preset === 'custom' ? filters.endDate : getPresetDates(filters.preset).endDate);
    exportCsv(`transactions-${fileStart}-to-${fileEnd}.csv`, headers, rows);
  };

  const handleCopyRef = (e: React.MouseEvent, id: number, refCode: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(refCode);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRowClick = (txn: TransactionHistoryItem) => {
    setSelectedTransaction(txn);
    setIsDrawerOpen(true);
  };

  const metrics = data?.metrics || {
    totalGrossVolume: 0,
    transactionCount: 0,
    walkInCount: 0,
    onlineCount: 0,
    retailCount: 0,
    averageTicketValue: 0,
  };

  const pagination = data?.pagination || {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  };

  return (
    <div
      className={
        embedded
          ? "space-y-3.5 w-full shrink-0 lg:shrink lg:flex-1 lg:min-h-0 flex flex-col"
          : "flex-1 flex flex-col min-h-0 overflow-y-auto lg:overflow-hidden space-y-3.5 pb-24 sm:pb-28 lg:pb-6 custom-scrollbar touch-pan-y [-webkit-overflow-scrolling:touch]"
      }
    >
      {!embedded && (
        <>
          {/* View Title & Realtime Pulsing Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
            <div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-ivory tracking-wide flex items-center gap-2">
                <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-gold shrink-0" />
                <span className="sm:hidden">Transaction History</span>
                <span className="hidden sm:inline">Transaction History & Financial Ledger</span>
              </h2>
              <p className="text-xs text-ivory-dim mt-0.5">
                Authoritative audit ledger of individual POS checkouts, bookings, and retail sales.
              </p>
            </div>
          </div>

          {/* Top Sub-Header Segmented Bar */}
          <div className="shrink-0 lg:hidden">
            <ReportSubHeaderNav activeSub="transactions" />
          </div>
        </>
      )}

      {/* KPI Metrics Strip: Header icon row prevents collision; 3-column chip layout for Sales by Type */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
        {/* Total Gross Volume */}
        <div className="p-3 sm:p-3.5 rounded-sm bg-charcoal-light border border-white/5 shadow-sm card-gold-accent flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-gold font-bold truncate">
              Total Sales
            </p>
            <div className="p-1.5 sm:p-2 rounded-full bg-gold/10 border border-gold/20 text-gold shrink-0">
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <h4 className="text-lg sm:text-2xl font-serif font-bold text-ivory mt-1 truncate">
            {formatCurrency(metrics.totalGrossVolume)}
          </h4>
          <span className="text-[10px] text-ivory-dim truncate block">Filtered result subset</span>
        </div>

        {/* Completed Transactions Count */}
        <div className="p-3 sm:p-3.5 rounded-sm bg-charcoal-light border border-white/5 shadow-sm card-gold-accent flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-gold font-bold truncate">
              Total Transactions
            </p>
            <div className="p-1.5 sm:p-2 rounded-full bg-gold/10 border border-gold/20 text-gold shrink-0">
              <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <h4 className="text-lg sm:text-2xl font-serif font-bold text-ivory mt-1 truncate">
            {metrics.transactionCount.toLocaleString()}
          </h4>
          <span className="text-[10px] text-ivory-dim truncate block">Completed receipts</span>
        </div>

        {/* Channel Split Breakdown ("Sales by Type") */}
        <div className="p-3 sm:p-3.5 rounded-sm bg-charcoal-light border border-white/5 shadow-sm card-gold-accent flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-gold font-bold truncate">
              Sales by Type
            </p>
            <div className="p-1.5 sm:p-2 rounded-full bg-gold/10 border border-gold/20 text-gold shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 mt-1 text-center">
            <div className="rounded bg-white/[0.04] px-1 py-0.5">
              <span className="text-xs font-bold text-zinc-200 block">{metrics.walkInCount}</span>
              <span className="text-[9px] text-ivory-dim block leading-tight">Walk-In</span>
            </div>
            <div className="rounded bg-white/[0.04] px-1 py-0.5">
              <span className="text-xs font-bold text-gold block">{metrics.onlineCount}</span>
              <span className="text-[9px] text-ivory-dim block leading-tight">Online</span>
            </div>
            <div className="rounded bg-white/[0.04] px-1 py-0.5">
              <span className="text-xs font-bold text-cyan-400 block">{metrics.retailCount}</span>
              <span className="text-[9px] text-ivory-dim block leading-tight">Retail</span>
            </div>
          </div>
          <span className="text-[10px] text-ivory-dim block mt-0.5 truncate">Sales by origin</span>
        </div>

        {/* Average Ticket Value */}
        <div className="p-3 sm:p-3.5 rounded-sm bg-charcoal-light border border-white/5 shadow-sm card-gold-accent flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-gold font-bold truncate">
              Average Sale
            </p>
            <div className="p-1.5 sm:p-2 rounded-full bg-gold/10 border border-gold/20 text-gold shrink-0">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <h4 className="text-lg sm:text-2xl font-serif font-bold text-ivory mt-1 truncate">
            {formatCurrency(metrics.averageTicketValue)}
          </h4>
          <span className="text-[10px] text-ivory-dim truncate block">Revenue per customer</span>
        </div>
      </div>

      {/* Filter Engine Toolbar */}
      <div className="shrink-0">
        <TransactionFilters
          filters={filters}
          onChange={handleFilterChange}
          onReset={handleResetFilters}
          staffList={staffList}
          activeFilterCount={activeFilterCount}
          hideDatePresets={embedded}
          onExportCsv={handleExportCsv}
          canExport={Boolean(data?.transactions?.length)}
        />
      </div>

      {/* Authoritative Transaction Table */}
      <div className="shrink-0 lg:shrink lg:flex-1 lg:min-h-0 bg-charcoal-light border border-white/10 rounded-sm shadow-md flex flex-col md:justify-between overflow-visible lg:overflow-hidden">
        {loading && (!data || data.transactions.length === 0) ? (
          <div className="p-2 sm:p-4 space-y-3 md:flex-1 md:flex md:flex-col">
            <TransactionMobileSkeleton />
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs" aria-busy="true">
                <tbody className="divide-y divide-white/5">
                  <TransactionTableSkeleton />
                </tbody>
              </table>
            </div>
          </div>
        ) : error ? (
          <div className="py-10 md:py-16 text-center text-red-400 p-4 md:flex-1 md:flex md:flex-col md:justify-center md:items-center">
            <div className="flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-xs">{error}</span>
              <button
                type="button"
                onClick={fetchTransactions}
                className="text-xs text-gold underline hover:text-gold-light mt-1 cursor-pointer"
              >
                Retry Query
              </button>
            </div>
          </div>
        ) : !data || data.transactions.length === 0 ? (
          <div className="py-12 md:py-16 text-center text-ivory-dim p-4 md:flex-1 md:flex md:flex-col md:justify-center md:items-center">
            <div className="flex flex-col items-center justify-center gap-1.5">
              <Receipt className="w-8 h-8 text-ivory-dim/40" />
              <p className="font-semibold text-xs text-ivory">
                {embedded && dateFilterLabel
                  ? `No transactions match for ${dateFilterLabel}.`
                  : getEmptyTransactionMessage(filters)}
              </p>
              <p className="text-[11px] text-ivory-dim/70">
                Try resetting filters or expanding the date range.
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-1 px-3 py-1.5 text-xs bg-gold/15 text-gold border border-gold/30 rounded-sm hover:bg-gold/25 cursor-pointer"
                >
                  Clear Active Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Mobile Stacked Card View */}
            <div className="block md:hidden divide-y divide-white/5 p-2.5 sm:p-3 space-y-2.5">
              {data.transactions.map((txn) => {
                const isCopied = copiedId === txn.id;
                return (
                  <div
                    key={txn.id}
                    data-search-id={`transaction-${txn.id} ${txn.id} ${txn.referenceNumber} ${txn.queueEntryId ? `appointment-${txn.queueEntryId} booking-${txn.queueEntryId} ${txn.queueEntryId}` : ''}`.trim()}
                    onClick={() => handleRowClick(txn)}
                    className="rounded-lg border border-white/10 bg-charcoal/60 p-3.5 space-y-2.5 cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-gold font-bold text-xs">{txn.referenceNumber}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyRef(e, txn.id, txn.referenceNumber)}
                          className="min-h-[28px] min-w-[28px] flex items-center justify-center text-ivory-dim/60 hover:text-gold p-0.5 cursor-pointer"
                          title="Copy Reference"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <span className="text-[10px] text-ivory-dim font-mono truncate">{txn.invoiceId}</span>
                      </div>
                      <span className="font-serif font-bold text-gold text-sm shrink-0">
                        {formatCurrency(txn.totalAmount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ivory truncate">{txn.customer.name}</span>
                      <span className={`inline-block px-2 py-0.5 rounded-sm text-[10px] font-semibold border shrink-0 ${
                        txn.channel === 'online'
                          ? 'bg-gold/15 text-gold border-gold/30'
                          : txn.channel === 'retail'
                            ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                            : txn.channelBadge === 'Walk-in Reservation'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-zinc-800 text-ivory-dim border-white/10'
                      }`}>
                        {txn.channelBadge}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-ivory-dim border-t border-white/5 pt-2">
                      <div className="flex items-center gap-1.5 truncate max-w-[60%]">
                        <Scissors className="w-3 h-3 text-gold/70 shrink-0" />
                        <span className="truncate text-ivory-dim">{txn.itemsSummary}</span>
                      </div>
                      <div className="flex items-center gap-1 text-ivory text-xs font-medium shrink-0">
                        <CreditCard className="w-3 h-3 text-gold" />
                        <span>{txn.paymentMethodDisplay}</span>
                        {txn.cashReceivedAmount != null && (
                          <span className="text-[10px] text-ivory-dim">Received {formatCurrency(txn.cashReceivedAmount)} · Change {formatCurrency(txn.cashChangeAmount || 0)}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-ivory-dim pt-0.5">
                      <span>{txn.formattedDate} • {txn.formattedTime}</span>
                      <span className="text-gold font-semibold flex items-center gap-1">
                        <Eye className="w-3 h-3" /> View Details
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch] lg:flex-1 lg:min-h-0 lg:max-h-[calc(100vh-340px)] lg:overflow-y-auto lg:admin-table-scroll">
              <table className="w-full text-left border-collapse text-xs" aria-busy={loading}>
                <thead className="sticky top-0 z-10 bg-charcoal border-b border-white/10 text-ivory-dim text-[11px] font-bold uppercase tracking-wider shadow-xs">
                  <tr>
                    <th className="py-3 px-3.5">Date & Time</th>
                    <th className="py-3 px-3">Ref / Invoice ID</th>
                    <th className="py-3 px-3">Channel</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Barber Assigned</th>
                    <th className="py-3 px-3">Summary Items</th>
                    <th className="py-3 px-3">Payment</th>
                    <th className="py-3 px-3 text-right">Total (₱)</th>
                    <th className="py-3 px-3.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.transactions.map((txn) => {
                    const isCopied = copiedId === txn.id;
                    return (
                      <tr
                        key={txn.id}
                        data-search-id={`transaction-${txn.id} ${txn.id} ${txn.referenceNumber} ${txn.queueEntryId ? `appointment-${txn.queueEntryId} booking-${txn.queueEntryId} ${txn.queueEntryId}` : ''}`.trim()}
                        onClick={() => handleRowClick(txn)}
                        className="hover:bg-zinc-800/60 cursor-pointer transition-colors duration-150 group"
                      >
                        {/* Date & Time */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="font-semibold text-ivory block leading-tight">{txn.formattedDate}</span>
                          <span className="text-[11px] text-ivory-dim font-mono">{txn.formattedTime}</span>
                        </td>

                        {/* Reference Code & Invoice */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-gold font-bold tracking-tight">
                              {txn.referenceNumber}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyRef(e, txn.id, txn.referenceNumber)}
                              className="text-ivory-dim/60 hover:text-gold transition-colors p-0.5 cursor-pointer"
                              title="Copy Reference"
                            >
                              {isCopied ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <span className="text-[10px] text-ivory-dim block font-mono">{txn.invoiceId}</span>
                        </td>

                        {/* Channel Badge */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold border ${txn.channel === 'online'
                              ? 'bg-gold/15 text-gold border-gold/30'
                              : txn.channel === 'retail'
                                ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                                : txn.channelBadge === 'Walk-in Reservation'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-zinc-800 text-ivory-dim border-white/10'
                              }`}
                          >
                            {txn.channelBadge}
                          </span>
                        </td>

                        {/* Customer Info */}
                        <td className="py-3 px-3">
                          <span className="font-semibold text-ivory block truncate max-w-[150px]">
                            {txn.customer.name}
                          </span>
                          {txn.customer.phone ? (
                            <span className="text-[11px] text-ivory-dim block font-mono truncate max-w-[150px]">
                              {txn.customer.phone}
                            </span>
                          ) : txn.customer.isGuest ? (
                            <span className="text-[10px] text-zinc-400">Guest Walk-in</span>
                          ) : null}
                        </td>

                        {/* Barber Assigned */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {txn.barber ? (
                            <div className="flex items-center gap-2">
                              {txn.barber.avatarUrl ? (
                                <img
                                  src={txn.barber.avatarUrl}
                                  alt={txn.barber.name}
                                  className="w-5 h-5 rounded-full object-cover border border-gold/40"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-gold/20 text-gold flex items-center justify-center text-[10px] font-bold border border-gold/30">
                                  {txn.barber.name.charAt(0)}
                                </div>
                              )}
                              <span className="text-ivory font-medium truncate max-w-[130px]">
                                {txn.barber.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-ivory-dim text-[11px] italic">Unassigned</span>
                          )}
                        </td>

                        {/* Summary Items */}
                        <td className="py-3 px-3">
                          <span className="text-ivory-dim block truncate max-w-[200px]" title={txn.itemsSummary}>
                            {txn.itemsSummary}
                          </span>
                          <span className="text-[10px] text-ivory-dim/60">
                            {txn.itemCount} item{txn.itemCount > 1 ? 's' : ''}
                          </span>
                        </td>

                        {/* Payment Method */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-gold" />
                            <span className="text-ivory font-medium">{txn.paymentMethodDisplay}</span>
                          </div>
                          {txn.cashReceivedAmount != null && (
                            <div className="mt-1 text-[10px] text-ivory-dim">Received {formatCurrency(txn.cashReceivedAmount)} · Change {formatCurrency(txn.cashChangeAmount || 0)}</div>
                          )}
                        </td>

                        {/* Total Amount */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span className="font-serif font-bold text-gold text-sm block">
                            {formatCurrency(txn.totalAmount)}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-semibold tracking-wide">
                            Settled
                          </span>
                        </td>

                        {/* Action Trigger */}
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(txn);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-gold bg-gold/10 hover:bg-gold/20 border border-gold/30 rounded-sm transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Server-Side Pagination Bar */}
        <div className="p-3 border-t border-white/10 bg-charcoal flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 md:mt-auto">
          <div className="flex items-center gap-3 text-xs text-ivory-dim">
            <span>
              Showing {data?.transactions?.length ? (page - 1) * limit + 1 : 0} to{' '}
              {Math.min(page * limit, pagination.total)} of {pagination.total} records
            </span>

            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  cursorByPageRef.current = {};
                  setPage(1);
                }}
                className="bg-charcoal-light border border-white/10 text-ivory text-xs px-2 py-1 rounded-sm focus:border-gold focus:outline-none cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 border border-white/10 rounded-sm text-ivory-dim hover:text-ivory disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono px-2 text-ivory">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <button
              type="button"
              disabled={loading || (page >= pagination.totalPages && !pagination.nextCursor)}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 border border-white/10 rounded-sm text-ivory-dim hover:text-ivory disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Itemized Receipt Slide-over Drawer */}
      <TransactionDetailDrawer
        transaction={selectedTransaction}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
};

export default TransactionHistoryTab;
