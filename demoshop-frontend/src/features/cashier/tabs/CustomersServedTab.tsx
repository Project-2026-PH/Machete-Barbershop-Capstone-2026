import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  RefreshCw,
  Search,
  X,
  Clock,
  ChevronRight,
  Scissors,
  Users,
  CheckCircle,
  CreditCard,
} from 'lucide-react';
import { PesoSign } from '@/components/ui/PesoSign';
import { Skeleton } from '@/components/ui/Skeleton';
import { SteppingPagination } from '@/components/ui/SteppingPagination';
import { Modal } from '@/components/feedback/Modal';
import { useAuth } from '@/components/auth/AuthContext';
import { formatServiceTitle } from '../utils/reservation-slots';
import { fetchCustomersServed } from '../services/cashier-reporting.service';

const formatHistoryService = (value: string) => formatServiceTitle(value)
  .replace(/\bHair Cut\b/g, 'Haircut').replace(/\bw\/\s*/g, 'with ');

interface CustomerServed {
  id: number | string;
  customer: string;
  guest_reference?: string | null;
  barber: string;
  service: string;
  served_at: string;
  created_at: string;
  total_amount?: number | string | null;
  payment_method?: string | null;
  payment_created_at?: string | null;
  transaction_id?: string | null;
  gcash_ref_no?: string | null;
  receipt_evidence_status?: string | null;
  receipt_available?: boolean;
}

type SortKey =
  | 'date_desc'
  | 'date_asc'
  | 'customer_asc'
  | 'customer_desc'
  | 'barber_asc'
  | 'barber_desc'
  | 'service_asc'
  | 'service_desc'
  | 'amount_desc'
  | 'amount_asc';

const PAGE_SIZE = 10;

const SORT_LABELS: Record<SortKey, string> = {
  date_desc: 'Newest First',
  date_asc: 'Oldest First',
  customer_asc: 'Customer (A-Z)',
  customer_desc: 'Customer (Z-A)',
  barber_asc: 'Barber (A-Z)',
  barber_desc: 'Barber (Z-A)',
  service_asc: 'Service (A-Z)',
  service_desc: 'Service (Z-A)',
  amount_desc: 'Amount (High-Low)',
  amount_asc: 'Amount (Low-High)',
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

const formatTimeOnly = (iso?: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

const formatCurrency = (amount?: number | string | null) => {
  if (amount === null || amount === undefined || amount === '') return '—';
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '—';

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(numericAmount);
};

const formatTodayLabel = () =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

const displayValue = (value?: number | string | null) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

const getPaymentBadgeClass = (paymentMethod?: string | null) => {
  const method = (paymentMethod || '').toLowerCase();
  if (method.includes('gcash')) {
    return 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold';
  }
  if (method.includes('cash')) {
    return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold';
  }
  return 'bg-white/10 text-ivory border border-white/10';
};

const CustomersServedTab: React.FC = () => {
  const { user, authReady } = useAuth();
  const branchId = Number(user?.branch_id);
  const hasBranch = Number.isInteger(branchId) && branchId > 0;
  const reportScope = hasBranch ? String(branchId) : 'current';

  // Raw data from server
  const [customers, setCustomers] = useState<CustomerServed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBarber, setSelectedBarber] = useState('all');
  const [selectedService, setSelectedService] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('date_desc');
  const [isSortOpen, setIsSortOpen] = useState(false);

  // Pagination & detail modal
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<CustomerServed | null>(null);

  const fetchCustomersData = useCallback(async (showFullSpinner = false) => {
    if (!hasBranch) return;
    if (showFullSpinner) setIsLoading(true);
    else setIsRevalidating(true);
    try {
      const response = await fetchCustomersServed(
        { page: 1, limit: 50, sortBy: 'date_desc' },
        reportScope
      );
      const data = response.data;
      setCustomers(Array.isArray(data?.customers) ? data.customers : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load customers served');
    } finally {
      setIsLoading(false);
      setIsRevalidating(false);
    }
  }, [hasBranch, reportScope]);

  useEffect(() => {
    if (authReady && hasBranch) {
      void fetchCustomersData(customers.length === 0);
    }
  }, [authReady, hasBranch, fetchCustomersData]);

  const refetch = useCallback(() => fetchCustomersData(false), [fetchCustomersData]);

  // Derive unique filter options from actual loaded records
  const uniqueBarbers = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.barber && c.barber !== 'Unassigned') set.add(c.barber);
    });
    return Array.from(set).sort();
  }, [customers]);

  const uniqueServices = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.service) set.add(c.service);
    });
    return Array.from(set).sort();
  }, [customers]);

  const uniquePayments = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.payment_method) set.add(c.payment_method);
    });
    return Array.from(set).sort();
  }, [customers]);

  // Filtered & Sorted list
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    // Search query filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((c) => {
        const customer = (c.customer || '').toLowerCase();
        const barber = (c.barber || '').toLowerCase();
        const service = `${c.service || ''} ${formatHistoryService(c.service || '')}`.toLowerCase();
        const guestRef = (c.guest_reference || '').toLowerCase();
        const payment = (c.payment_method || '').toLowerCase();
        const txId = (c.transaction_id || '').toLowerCase();
        const gcashRef = (c.gcash_ref_no || '').toLowerCase();
        return (
          customer.includes(query) ||
          barber.includes(query) ||
          service.includes(query) ||
          guestRef.includes(query) ||
          payment.includes(query) ||
          txId.includes(query) ||
          gcashRef.includes(query)
        );
      });
    }

    // Barber filter
    if (selectedBarber !== 'all') {
      result = result.filter((c) => c.barber === selectedBarber);
    }

    // Service filter
    if (selectedService !== 'all') {
      result = result.filter((c) => c.service === selectedService);
    }

    // Payment method filter
    if (selectedPayment !== 'all') {
      result = result.filter((c) => c.payment_method === selectedPayment);
    }

    // Sort order
    result.sort((a, b) => {
      const timeA = new Date(a.served_at || a.created_at).getTime();
      const timeB = new Date(b.served_at || b.created_at).getTime();
      switch (sortBy) {
        case 'date_asc':
          return timeA - timeB;
        case 'customer_asc':
          return (a.customer || '').localeCompare(b.customer || '');
        case 'customer_desc':
          return (b.customer || '').localeCompare(a.customer || '');
        case 'barber_asc':
          return (a.barber || '').localeCompare(b.barber || '');
        case 'barber_desc':
          return (b.barber || '').localeCompare(a.barber || '');
        case 'service_asc':
          return (a.service || '').localeCompare(b.service || '');
        case 'service_desc':
          return (b.service || '').localeCompare(a.service || '');
        case 'amount_desc':
          return (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0);
        case 'amount_asc':
          return (Number(a.total_amount) || 0) - (Number(b.total_amount) || 0);
        case 'date_desc':
        default:
          return timeB - timeA;
      }
    });

    return result;
  }, [customers, searchQuery, selectedBarber, selectedService, selectedPayment, sortBy]);

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedBarber, selectedService, selectedPayment, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCustomers.slice(start, start + PAGE_SIZE);
  }, [filteredCustomers, currentPage]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      selectedBarber !== 'all' ||
      selectedService !== 'all' ||
      selectedPayment !== 'all'
  );

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedBarber('all');
    setSelectedService('all');
    setSelectedPayment('all');
  }, []);

  // Summary Metrics
  const totalCustomersServed = customers.length;
  const totalRevenueCollected = useMemo(() => {
    return customers.reduce((acc, c) => acc + (Number(c.total_amount) || 0), 0);
  }, [customers]);

  const todayLabel = useMemo(() => formatTodayLabel(), []);

  if (!authReady) {
    return null;
  }

  if (!hasBranch) {
    return (
      <div className="p-8 text-center text-ivory-dim border border-white/10 rounded-sm bg-white/5">
        Your account is not assigned to a branch.
      </div>
    );
  }

  const hasError = !!error && customers.length === 0;

  return (
    <div className="space-y-6 animate-fade-in text-ivory pb-20 md:pb-6">
      {/* 1. Uniform Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-ivory-dim">Floor Operations</p>
          <h1 className="text-2xl font-serif font-bold text-ivory">Customers Served</h1>
          <p className="mt-1 text-xs text-ivory-dim">
            Review customers and completed services.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-ivory-dim bg-white/[0.03] px-3 py-1.5 rounded-sm border border-white/10">
            <Clock className="w-3.5 h-3.5 text-gold" />
            <span>{todayLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="p-1.5 text-ivory-dim hover:text-gold border border-white/10 rounded-sm hover:border-gold/40 transition-colors cursor-pointer"
            aria-label="Refresh customer history"
            title="Refresh customer history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRevalidating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* 2. Summary Cards (Standardized with Cashier Dashboard) */}
      <section aria-labelledby="served-summary-heading">
        <h2 id="served-summary-heading" className="sr-only">
          Today's Served Summary
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Customers Served Today */}
          <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-ivory-dim font-medium">
                Customers Served Today
              </p>
              <Users className="w-4 h-4 text-ivory-dim" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-serif font-bold text-ivory">
              {totalCustomersServed}
            </p>
            <p className="mt-1 text-xs text-ivory-dim">Completed queue services</p>
          </div>

          {/* Completed Services */}
          <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-ivory-dim font-medium">
                Completed Services
              </p>
              <CheckCircle className="w-4 h-4 text-emerald-400/80" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-serif font-bold text-emerald-400">
              {totalCustomersServed}
            </p>
            <p className="mt-1 text-xs text-ivory-dim">Finished &amp; marked paid</p>
          </div>

          {/* Total Revenue Collected */}
          <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-ivory-dim font-medium">
                Revenue Collected
              </p>
              <PesoSign className="w-4 h-4 text-gold/80" />
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-serif font-bold text-gold">
              {formatCurrency(totalRevenueCollected)}
            </p>
            <p className="mt-1 text-xs text-ivory-dim">From completed appointments</p>
          </div>
        </div>
      </section>

      {/* 3. Search & Filter Bar */}
      <section aria-labelledby="served-filter-heading" className="space-y-4 rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent">
        <div className="border-b border-white/5 pb-3"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Completed Services</p><h2 id="served-filter-heading" className="mt-1 text-lg sm:text-xl font-serif font-bold text-ivory">Customer History</h2></div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim/60 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, service, barber..."
              className="w-full h-9 pl-9 pr-8 bg-charcoal/80 border border-white/10 focus:border-gold focus:ring-1 focus:ring-gold/30 rounded-sm text-xs text-ivory placeholder-white/30 transition-all outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ivory-dim/50 hover:text-ivory p-0.5"
                aria-label="Clear search text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Controls Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Indicator (Today only as per route semantics) */}
            <span
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-sm bg-gold/15 text-gold border border-gold/30 text-xs font-semibold select-none"
              title="Today's completed customer history"
            >
              <span>Today</span>
            </span>

            {/* Barber Dropdown */}
            {uniqueBarbers.length > 0 && (
              <select
                value={selectedBarber}
                onChange={(e) => setSelectedBarber(e.target.value)}
                className="h-9 px-3 rounded-sm border border-white/10 bg-charcoal text-xs text-ivory outline-none focus:border-gold cursor-pointer transition-colors"
                aria-label="Filter by Barber"
              >
                <option value="all">All Barbers</option>
                {uniqueBarbers.map((barber) => (
                  <option key={barber} value={barber}>
                    {barber}
                  </option>
                ))}
              </select>
            )}

            {/* Service Dropdown */}
            {uniqueServices.length > 0 && (
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="h-9 px-3 rounded-sm border border-white/10 bg-charcoal text-xs text-ivory outline-none focus:border-gold cursor-pointer transition-colors"
                aria-label="Filter by Service"
              >
                <option value="all">All Services</option>
                {uniqueServices.map((service) => (
                  <option key={service} value={service}>
                    {formatHistoryService(service)}
                  </option>
                ))}
              </select>
            )}

            {/* Payment Method Dropdown */}
            {uniquePayments.length > 0 && (
              <select
                value={selectedPayment}
                onChange={(e) => setSelectedPayment(e.target.value)}
                className="h-9 px-3 rounded-sm border border-white/10 bg-charcoal text-xs text-ivory outline-none focus:border-gold cursor-pointer transition-colors"
                aria-label="Filter by Payment Method"
              >
                <option value="all">All Payments</option>
                {uniquePayments.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            )}

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSortOpen((open) => !open)}
                className="h-9 inline-flex items-center gap-1.5 px-3 bg-charcoal border border-white/10 hover:border-gold/40 rounded-sm text-xs font-semibold text-ivory hover:text-gold transition-all cursor-pointer"
                aria-haspopup="listbox"
                aria-expanded={isSortOpen}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-gold" />
                <span>{SORT_LABELS[sortBy]}</span>
              </button>
              {isSortOpen && (
                <div
                  className="absolute right-0 mt-1.5 w-48 bg-charcoal border border-white/10 rounded-sm shadow-2xl z-30 p-1.5 space-y-0.5"
                  role="listbox"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSortBy(key);
                        setIsSortOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded-sm transition-colors cursor-pointer ${
                        sortBy === key
                          ? 'bg-gold/15 text-gold font-bold'
                          : 'text-ivory-dim hover:bg-white/5 hover:text-ivory'
                      }`}
                      role="option"
                      aria-selected={sortBy === key}
                    >
                      {SORT_LABELS[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Active Filter Chips & Result Count */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {hasActiveFilters && (
              <>
                {searchQuery.trim() && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-white/5 text-ivory border border-white/10 text-[11px]">
                    <span>Search: “{searchQuery.trim()}”</span>
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="hover:text-red-400 p-0.5"
                      aria-label="Remove search filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {selectedBarber !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-white/5 text-ivory border border-white/10 text-[11px]">
                    <span>Barber: {selectedBarber}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedBarber('all')}
                      className="hover:text-red-400 p-0.5"
                      aria-label="Remove barber filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {selectedService !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-white/5 text-ivory border border-white/10 text-[11px]">
                    <span>Service: {selectedService}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedService('all')}
                      className="hover:text-red-400 p-0.5"
                      aria-label="Remove service filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {selectedPayment !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-white/5 text-ivory border border-white/10 text-[11px]">
                    <span>Payment: {selectedPayment}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPayment('all')}
                      className="hover:text-red-400 p-0.5"
                      aria-label="Remove payment filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-gold hover:text-gold-dim underline font-medium cursor-pointer ml-1"
                >
                  Clear Filters
                </button>
              </>
            )}
          </div>

          {/* Result Count Indicator */}
          <div className="text-ivory-dim text-xs ml-auto">
            {hasActiveFilters ? (
              <span>
                Showing <strong className="text-gold font-mono">{filteredCustomers.length}</strong> of{' '}
                <strong className="text-ivory font-mono">{customers.length}</strong> records
              </span>
            ) : (
              <span>
                <strong className="text-gold font-mono">{customers.length}</strong> customers served today
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 4. Error State */}
      {hasError && (
        <div
          className="flex flex-col items-center justify-center gap-3 border border-yellow-500/30 bg-yellow-500/5 rounded-sm p-8 text-center text-yellow-300"
          role="alert"
        >
          <AlertTriangle className="w-6 h-6" />
          <p className="text-sm">The customer history could not be loaded. Please try again.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs uppercase tracking-widest font-bold text-gold hover:text-gold/80 border border-gold/30 hover:border-gold rounded-sm px-3 py-1.5 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 5. Mobile Card View */}
      <div className="md:hidden space-y-2.5">
        {isLoading && customers.length === 0 ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-sm p-4 space-y-3 animate-pulse">
              <div className="flex justify-between items-start">
                <Skeleton variant="text" className="w-1/2 h-5" />
                <Skeleton variant="text" className="w-20 h-5" />
              </div>
              <Skeleton variant="text" className="w-1/3 h-3" />
              <div className="flex justify-between pt-2 border-t border-white/5">
                <Skeleton variant="text" className="w-16 h-4" />
                <Skeleton variant="text" className="w-20 h-4" />
              </div>
            </div>
          ))
        ) : paginatedCustomers.length > 0 ? (
          paginatedCustomers.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedEntry(entry)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedEntry(entry);
                }
              }}
              className="bg-white/5 border border-white/10 rounded-sm p-4 hover:border-gold/40 hover:bg-gold/[0.04] transition-all cursor-pointer card-gold-accent focus:outline-none focus:ring-1 focus:ring-gold/50"
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-ivory font-semibold text-sm break-words">{entry.customer}</h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-ivory-dim text-[11px]">{formatTimeOnly(entry.served_at)}</span>
                    {entry.guest_reference && (
                      <span className="font-mono text-gold bg-gold/10 px-1 rounded text-[10px] border border-gold/20">
                        {entry.guest_reference}
                      </span>
                    )}
                  </div>
                </div>
                {entry.total_amount ? (
                  <p className="text-gold font-semibold font-sans tabular-nums text-base shrink-0">
                    {formatCurrency(entry.total_amount)}
                  </p>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Done
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-ivory-dim shrink-0">Service</span>
                  <span className="text-ivory text-right break-words font-medium">{displayValue(formatHistoryService(entry.service))}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ivory-dim">Barber</span>
                  <span className="text-ivory"><span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-gold/20 bg-gold/[0.07] px-2 py-1 text-xs font-medium text-gold"><Scissors className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="whitespace-normal break-words">{displayValue(entry.barber)}</span></span></span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <span className="text-ivory-dim">Payment</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${getPaymentBadgeClass(entry.payment_method)}`}>
                      {entry.payment_method || '—'}
                    </span>
                    <span className="text-gold font-medium text-xs flex items-center">
                      <span>Details</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-sm border border-white/10 bg-white/5 p-8 text-center text-xs text-ivory-dim">
            {hasActiveFilters ? (
              <div className="space-y-2">
                <p>No records match your current filters.</p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-gold hover:text-gold-dim underline font-semibold cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <p>No completed services found today.</p>
            )}
          </div>
        )}
      </div>

      {/* 6. Tablet Compact Table View (768px – 1199px) */}
      <div className="hidden md:block xl:hidden rounded-sm border border-white/5 bg-charcoal/20 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[32rem] custom-scrollbar">
          <table className="w-full border-collapse text-xs text-left">
            <thead className="sticky top-0 z-10 bg-charcoal border-b border-white/10">
              <tr>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Customer &amp; Time
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Barber
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Service
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim text-right">
                  Amount &amp; Payment
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && customers.length === 0 ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-28 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-20 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-28 h-4" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-20 h-4 ml-auto" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-12 h-4 ml-auto" /></td>
                  </tr>
                ))
              ) : paginatedCustomers.length > 0 ? (
                paginatedCustomers.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3.5 align-middle">
                      <div className="font-semibold text-ivory group-hover:text-gold transition-colors break-words max-w-[180px]">
                        {entry.customer}
                      </div>
                      <div className="text-[10px] text-ivory-dim mt-0.5 flex items-center gap-1.5">
                        <span>{formatTimeOnly(entry.served_at)}</span>
                        {entry.guest_reference && (
                          <span className="font-mono text-gold bg-gold/10 px-1 rounded text-[9px] border border-gold/20">
                            {entry.guest_reference}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim whitespace-nowrap align-middle">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-gold/20 bg-gold/[0.07] px-2 py-1 text-xs font-medium text-gold"><Scissors className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="whitespace-normal break-words">{displayValue(entry.barber)}</span></span>
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim align-middle max-w-[180px]">
                      <span className="whitespace-normal break-words">{displayValue(formatHistoryService(entry.service))}</span>
                    </td>
                    <td className="py-3 px-3.5 text-right align-middle whitespace-nowrap">
                      <div className="font-sans font-semibold tabular-nums text-gold">
                        {formatCurrency(entry.total_amount)}
                      </div>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border mt-0.5 ${getPaymentBadgeClass(entry.payment_method)}`}>
                        {entry.payment_method || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-right align-middle whitespace-nowrap">
                      <button type="button" aria-label={`View details for ${entry.customer}`} onClick={(event) => { event.stopPropagation(); setSelectedEntry(entry); }} className="inline-flex min-h-8 items-center gap-1 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-ivory-dim hover:border-gold/30 hover:bg-gold/10 hover:text-gold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold transition-colors"><span>Details</span><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-ivory-dim text-xs italic">
                    {hasActiveFilters ? (
                      <div className="space-y-2">
                        <p>No records match your current filters.</p>
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="text-xs text-gold hover:text-gold-dim underline font-semibold cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      </div>
                    ) : (
                      <p>No completed services found today.</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Desktop Excel-Familiar Table View (1200px+) */}
      <div className="hidden xl:block rounded-sm border border-white/5 bg-charcoal/20 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[32rem] custom-scrollbar">
          <table className="w-full border-collapse text-xs sm:text-sm text-left">
            <thead className="sticky top-0 z-10 bg-charcoal border-b border-white/10">
              <tr>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Customer
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Guest Reference
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Barber
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Service
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim text-right">
                  Completed Time
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim text-right">
                  Amount
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && customers.length === 0 ? (
                [1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-28 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-20 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-24 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-28 h-4" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-20 h-4 ml-auto" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-20 h-4 ml-auto" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-12 h-4 ml-auto" /></td>
                  </tr>
                ))
              ) : paginatedCustomers.length > 0 ? (
                paginatedCustomers.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3.5 font-semibold text-ivory group-hover:text-gold transition-colors whitespace-nowrap">
                      {entry.customer}
                    </td>
                    <td className="py-3 px-3.5 font-mono text-xs text-gold whitespace-nowrap">
                      {displayValue(entry.guest_reference)}
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim whitespace-nowrap">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-gold/20 bg-gold/[0.07] px-2 py-1 text-xs font-medium text-gold"><Scissors className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="whitespace-normal break-words">{displayValue(entry.barber)}</span></span>
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim">
                      {displayValue(formatHistoryService(entry.service))}
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim text-right whitespace-nowrap">
                      {formatTimeOnly(entry.served_at)}
                    </td>
                    <td className="py-3 px-3.5 font-sans font-semibold tabular-nums text-gold text-right whitespace-nowrap">
                      {formatCurrency(entry.total_amount)}
                    </td>
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <button type="button" aria-label={`View details for ${entry.customer}`} onClick={(event) => { event.stopPropagation(); setSelectedEntry(entry); }} className="inline-flex min-h-8 items-center gap-1 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-ivory-dim hover:border-gold/30 hover:bg-gold/10 hover:text-gold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold transition-colors"><span>Details</span><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-ivory-dim text-xs sm:text-sm italic">
                    {hasActiveFilters ? (
                      <div className="space-y-2">
                        <p>No records match your current filters.</p>
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="text-xs text-gold hover:text-gold-dim underline font-semibold cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      </div>
                    ) : (
                      <p>No completed services found today.</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Pagination Controls */}
      {!hasError && totalPages > 1 && (
        <div className="flex justify-center pt-2">
          <SteppingPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* 8. Record Details Modal (Customer / Service Details) */}
      <Modal
        isOpen={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title="Service Details"
        size="md"
        footer={
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={() => setSelectedEntry(null)}
              className="h-10 px-6 rounded-sm bg-white/5 border border-white/10 text-ivory hover:bg-white/10 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        {selectedEntry && (
          <div className="space-y-4 text-xs sm:text-sm text-ivory">
            {/* Amount Banner */}
            <div className="rounded-sm border border-gold/30 bg-gold/[0.05] p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">
                Total Amount Paid
              </span>
              <div className="text-2xl sm:text-3xl font-serif font-bold text-gold mt-1">
                {formatCurrency(selectedEntry.total_amount)}
              </div>
            </div>

            {/* Grouped Information Grid */}
            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Customer
                </span>
                <span className="font-bold text-ivory">{selectedEntry.customer}</span>
              </div>

              {selectedEntry.guest_reference && (
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                    Guest Reference
                  </span>
                  <span className="font-mono text-gold">{selectedEntry.guest_reference}</span>
                </div>
              )}

              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Service Provided
                </span>
                <span className="text-ivory">{displayValue(formatHistoryService(selectedEntry.service))}</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Barber
                </span>
                <span className="text-ivory">{displayValue(selectedEntry.barber)}</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Payment Method
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${getPaymentBadgeClass(selectedEntry.payment_method)}`}>
                  {selectedEntry.payment_method || '—'}
                </span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Completed At
                </span>
                <span className="text-ivory">{formatDateTime(selectedEntry.served_at)}</span>
              </div>

              {selectedEntry.transaction_id && (
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                    Transaction / Receipt ID
                  </span>
                  <span className="font-mono text-gold text-xs">{selectedEntry.transaction_id}</span>
                </div>
              )}

              {selectedEntry.gcash_ref_no && (
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                    GCash Reference No.
                  </span>
                  <span className="font-mono text-gold text-xs">{selectedEntry.gcash_ref_no}</span>
                </div>
              )}

              {selectedEntry.receipt_evidence_status && (
                <div className="flex items-center justify-between">
                  <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                    Receipt Verification
                  </span>
                  <span className="text-ivory text-xs">{selectedEntry.receipt_evidence_status}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CustomersServedTab;
