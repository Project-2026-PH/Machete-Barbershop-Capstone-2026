import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  RefreshCw,
  Search,
  X,
  Clock,
  ChevronRight,
  Scissors,
  Receipt,
  CreditCard,
  UserCheck,
  Maximize2,
} from 'lucide-react';
import { PesoSign } from '@/components/ui/PesoSign';
import { Skeleton } from '@/components/ui/Skeleton';
import { SteppingPagination } from '@/components/ui/SteppingPagination';
import { Modal } from '@/components/feedback/Modal';
import { useAuth } from '@/components/auth/AuthContext';
import { formatServiceTitle } from '../utils/reservation-slots';
import { extractReferenceFromOcrText } from '@/utils/receipt-reference-ocr';
import { scanReceiptReference } from '@/utils/receipt-photo';
import { fetchTodaysSales, fetchDailySummary, getPaymentAttemptReceiptUrl, getReservationFeeGcashReceiptUrl, uploadPaymentAttemptEvidence, uploadReservationFeeGcashReceipt, updateReservationFeeGcashReference, type DailySummaryResponse } from '../services/cashier-reporting.service';

const formatHistoryService = (value: string) => formatServiceTitle(value)
  .replace(/\bHair Cut\b/g, 'Haircut').replace(/\bw\/\s*/g, 'with ');

interface Sale {
  id: number | string;
  amount: number;
  payment_method?: string | null;
  customer: string;
  barber: string;
  service: string;
  created_at: string;
  transaction_type?: string | null;
  receipt_available?: boolean | null;
  reservation_fee_receipt_available?: boolean | null;
  receipt_evidence_status?: string | null;
  payment_attempt_id?: number | null;
  gcash_ref_no?: string | null;
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

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(amount);

const formatDateTime = (iso: string) => {
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

const formatTodayLabel = () =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

const formatTimeOnly = (iso: string) => {
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

const TodaysSalesTab: React.FC = () => {
  const { user, authReady } = useAuth();
  const branchId = Number(user?.branch_id);
  const hasBranch = Number.isInteger(branchId) && branchId > 0;
  const reportScope = hasBranch ? String(branchId) : 'current';

  // Raw data from server
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalSalesRecords, setTotalSalesRecords] = useState<number | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummaryResponse | null>(null);
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
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleReceiptUrl, setSaleReceiptUrl] = useState<string | null>(null);
  const [saleReceiptLoading, setSaleReceiptLoading] = useState(false);
  const [saleReceiptError, setSaleReceiptError] = useState<string | null>(null);
  const [receiptZoomOpen, setReceiptZoomOpen] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reservationFeeReference, setReservationFeeReference] = useState('');
  const [savingReservationFeeReference, setSavingReservationFeeReference] = useState(false);
  const [reservationFeeReferenceError, setReservationFeeReferenceError] = useState<string | null>(null);
  const [uploadingReservationFeeReceipt, setUploadingReservationFeeReceipt] = useState(false);
  const [reservationFeeReceiptError, setReservationFeeReceiptError] = useState<string | null>(null);
  const [pendingReservationFeeFile, setPendingReservationFeeFile] = useState<File | null>(null);
  const [pendingEvidenceFile, setPendingEvidenceFile] = useState<File | null>(null);
  const pendingEvidenceFileRef = useRef<File | null>(null);
  const [pendingEvidenceReference, setPendingEvidenceReference] = useState('');
  const [scanningEvidenceReference, setScanningEvidenceReference] = useState(false);
  const [pendingEvidencePreview, setPendingEvidencePreview] = useState<string | null>(null);
  const [receiptUploadPreviewOpen, setReceiptUploadPreviewOpen] = useState(false);

  useEffect(() => {
    setPendingReservationFeeFile(null);
    pendingEvidenceFileRef.current = null;
  }, [selectedSale?.id]);

  const fetchSalesData = useCallback(async (showFullSpinner = false) => {
    if (!hasBranch) return;
    if (showFullSpinner) setIsLoading(true);
    else setIsRevalidating(true);
    try {
      const [salesRes, summaryRes] = await Promise.all([
        fetchTodaysSales({ page: 1, limit: 50, sortBy: 'date_desc' }, reportScope),
        fetchDailySummary(reportScope).catch(() => null),
      ]);

      const data = salesRes.data;
      setSales(Array.isArray(data?.transactions) ? data.transactions : []);
      const salesRecordsTotal = Number(data?.total);
      setTotalSalesRecords(Number.isFinite(salesRecordsTotal)
        ? salesRecordsTotal
        : Array.isArray(data?.transactions) ? data.transactions.length : 0);
      if (summaryRes?.data) {
        setDailySummary(summaryRes.data);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load sales');
    } finally {
      setIsLoading(false);
      setIsRevalidating(false);
    }
  }, [hasBranch, reportScope]);

  useEffect(() => {
    if (authReady && hasBranch) {
      void fetchSalesData(sales.length === 0);
    }
  }, [authReady, hasBranch, fetchSalesData]);

  useEffect(() => {
    let cancelled = false;
    setSaleReceiptUrl(null);
    setSaleReceiptError(null);
    setReceiptZoomOpen(false);
    if (!selectedSale?.receipt_available) return undefined;
    setSaleReceiptLoading(true);
    const receiptUrlRequest = selectedSale.reservation_fee_receipt_available
      ? getReservationFeeGcashReceiptUrl(selectedSale.id)
      : selectedSale.payment_attempt_id
        ? getPaymentAttemptReceiptUrl(selectedSale.payment_attempt_id)
        : null;
    if (!receiptUrlRequest) {
      setSaleReceiptLoading(false);
      return undefined;
    }
    void receiptUrlRequest
      .then((response) => {
        if (!cancelled) setSaleReceiptUrl(response.data.url);
      })
      .catch((err: any) => {
        if (!cancelled) setSaleReceiptError(err?.response?.data?.error || 'Unable to load the receipt image.');
      })
      .finally(() => {
        if (!cancelled) setSaleReceiptLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedSale]);

  useEffect(() => {
    setReservationFeeReference(selectedSale?.gcash_ref_no || '');
    setReservationFeeReferenceError(null);
  }, [selectedSale?.id]);

  const saveReservationFeeReference = useCallback(async () => {
    if (!selectedSale || !reservationFeeReference.trim()) return;
    setSavingReservationFeeReference(true);
    setReservationFeeReferenceError(null);
    try {
      await updateReservationFeeGcashReference(selectedSale.id, reservationFeeReference.trim());
      setSelectedSale((current) => current ? { ...current, gcash_ref_no: reservationFeeReference.trim() } : current);
      await fetchSalesData(false);
    } catch (err: any) {
      setReservationFeeReferenceError(err?.response?.data?.error || err?.message || 'Unable to save the GCash reference.');
    } finally {
      setSavingReservationFeeReference(false);
    }
  }, [fetchSalesData, reservationFeeReference, selectedSale]);

  const handleReservationFeeReceiptUpload = useCallback(async (file: File, confirmed = false) => {
    if (!selectedSale || selectedSale.transaction_type !== 'reservation_fee') return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setReservationFeeReceiptError('Choose a JPEG or PNG receipt image.');
      return;
    }
    setUploadingReservationFeeReceipt(true);
    setReservationFeeReceiptError(null);
    try {
      let reference = reservationFeeReference.trim() || selectedSale.gcash_ref_no || '';
      setPendingReservationFeeFile(file);
      if (!confirmed && !reference) {
        try { reference = await scanReceiptReference(file, extractReferenceFromOcrText) || ''; }
        catch { /* Manual reference entry remains available. */ }
      }
      if (!confirmed) {
        if (reference) setReservationFeeReference(current => current || reference);
        setReservationFeeReceiptError('Review or enter the full reference number above, then confirm this selected receipt.');
        return;
      }
      if (!reference) {
        setReservationFeeReceiptError('Enter the full reference number above, then upload this selected receipt.');
        return;
      }
      setReservationFeeReference(reference);
      const uploadResponse = await uploadReservationFeeGcashReceipt(selectedSale.id, file, reference);
      const savedReference = uploadResponse.data?.transaction?.gcash_ref_no || reference;
      if (savedReference) setReservationFeeReference(savedReference);
      setSelectedSale((current) => current ? {
        ...current,
        ...(savedReference ? { gcash_ref_no: savedReference } : {}),
        receipt_available: true,
        reservation_fee_receipt_available: true,
      } : current);
      await fetchSalesData(false);
      setPendingReservationFeeFile(null);
    } catch (err: any) {
      setReservationFeeReceiptError(err?.response?.data?.error || err?.message || 'Unable to upload the receipt image.');
    } finally {
      setUploadingReservationFeeReceipt(false);
    }
  }, [fetchSalesData, reservationFeeReference, selectedSale]);

  useEffect(() => () => {
    if (pendingEvidencePreview) URL.revokeObjectURL(pendingEvidencePreview);
  }, [pendingEvidencePreview]);

  const handleEvidenceSelection = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose a receipt image.');
      return;
    }
    setUploadError(null);
    setPendingEvidenceFile(file);
    pendingEvidenceFileRef.current = file;
    setPendingEvidenceReference(selectedSale?.gcash_ref_no || '');
    setPendingEvidencePreview(URL.createObjectURL(file));
    setReceiptUploadPreviewOpen(true);
    setScanningEvidenceReference(true);
    void scanReceiptReference(file, extractReferenceFromOcrText)
      .then(reference => { if (pendingEvidenceFileRef.current === file && reference) setPendingEvidenceReference(current => current || reference); })
      .catch(() => {})
      .finally(() => { if (pendingEvidenceFileRef.current === file) setScanningEvidenceReference(false); });
  }, [selectedSale]);
  const handleEvidenceUpload = useCallback(async (file: File, reference: string) => {
    if (!selectedSale?.payment_attempt_id) return;
    setUploadingEvidence(true);
    setUploadError(null);
    try {
      await uploadPaymentAttemptEvidence(selectedSale.payment_attempt_id, file, reference);
      pendingEvidenceFileRef.current = null;
      setReceiptUploadPreviewOpen(false);
      setPendingEvidenceFile(null);
      setPendingEvidencePreview(null);
      setSelectedSale(null);
      await fetchSalesData(false);
    } catch (err: any) {
      setUploadError(err?.response?.data?.message || err?.message || 'Evidence upload failed.');
    } finally {
      setUploadingEvidence(false);
    }
  }, [selectedSale, fetchSalesData]);

  const confirmEvidenceUpload = useCallback(() => {
    if (!pendingEvidenceFile) return;
    const reference = pendingEvidenceReference.trim().replace(/[\s-]+/g, '');
    if (!/^[A-Za-z0-9]{8,32}$/.test(reference)) {
      setUploadError('Enter the full GCash reference number before uploading.');
      return;
    }
    void handleEvidenceUpload(pendingEvidenceFile, reference);
  }, [handleEvidenceUpload, pendingEvidenceFile, pendingEvidenceReference]);



  const refetch = useCallback(() => fetchSalesData(false), [fetchSalesData]);

  // Derive unique filter options from actual loaded records
  const uniqueBarbers = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => {
      if (s.barber && s.barber !== 'Unassigned') set.add(s.barber);
    });
    return Array.from(set).sort();
  }, [sales]);

  const uniqueServices = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => {
      if (s.service) set.add(s.service);
    });
    return Array.from(set).sort();
  }, [sales]);

  const uniquePayments = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => {
      if (s.payment_method) set.add(s.payment_method);
    });
    return Array.from(set).sort();
  }, [sales]);

  // Filtered & Sorted sales list
  const filteredSales = useMemo(() => {
    let result = [...sales];

    // Search query filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((s) => {
        const customer = (s.customer || '').toLowerCase();
        const barber = (s.barber || '').toLowerCase();
        const service = `${s.service || ''} ${formatHistoryService(s.service || '')}`.toLowerCase();
        const payment = (s.payment_method || '').toLowerCase();
        const id = String(s.id || '').toLowerCase();
        return (
          customer.includes(query) ||
          barber.includes(query) ||
          service.includes(query) ||
          payment.includes(query) ||
          id.includes(query)
        );
      });
    }

    // Barber filter
    if (selectedBarber !== 'all') {
      result = result.filter((s) => s.barber === selectedBarber);
    }

    // Service filter
    if (selectedService !== 'all') {
      result = result.filter((s) => s.service === selectedService);
    }

    // Payment method filter
    if (selectedPayment !== 'all') {
      result = result.filter((s) => s.payment_method === selectedPayment);
    }

    // Sort order
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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
          return (Number(b.amount) || 0) - (Number(a.amount) || 0);
        case 'amount_asc':
          return (Number(a.amount) || 0) - (Number(b.amount) || 0);
        case 'date_desc':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [sales, searchQuery, selectedBarber, selectedService, selectedPayment, sortBy]);

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedBarber, selectedService, selectedPayment, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSales.slice(start, start + PAGE_SIZE);
  }, [filteredSales, currentPage]);

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
  const totalSalesAmount = useMemo(() => {
    if (dailySummary?.total_revenue !== undefined) {
      return Number(dailySummary.total_revenue) || 0;
    }
    return sales.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  }, [dailySummary, sales]);

  const cashSalesAmount = useMemo(() => {
    if (dailySummary?.cash_sales !== undefined) {
      return Number(dailySummary.cash_sales) || 0;
    }
    return sales
      .filter((s) => (s.payment_method || '').toLowerCase().includes('cash'))
      .reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  }, [dailySummary, sales]);

  const gcashSalesAmount = useMemo(() => {
    return sales
      .filter((s) => (s.payment_method || '').toLowerCase().includes('gcash'))
      .reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  }, [sales]);

  const totalTransactionsCount = totalSalesRecords ?? sales.length;

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

  const hasError = !!error && sales.length === 0;

  return (
    <div className="space-y-6 animate-fade-in text-ivory pb-20 md:pb-6">
      {/* 1. Uniform Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-ivory-dim">Floor Operations</p>
          <h1 className="text-2xl font-serif font-bold text-ivory">Today's Sales</h1>
          <p className="mt-1 text-xs text-ivory-dim">
            View and review today's completed sales and payments.
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
            aria-label="Refresh sales"
            title="Refresh sales records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRevalidating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* 2. Summary Cards (Standardized with Cashier Dashboard) */}
      <section aria-labelledby="sales-summary-heading">
        <h2 id="sales-summary-heading" className="sr-only">
          Today's Sales Summary
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Gross Today's Sales */}
          <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-ivory-dim font-medium">Today’s Sales</p>
              <PesoSign className="w-4 h-4 text-gold/80" />
            </div>
            <p className="mt-2 text-2xl font-serif font-bold text-gold">
              {formatCurrency(totalSalesAmount)}
            </p>
            <p className="mt-1 text-xs text-ivory-dim">Gross revenue today</p>
          </div>

          {/* Transactions Count */}
          <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-ivory-dim font-medium">Transactions</p>
              <Receipt className="w-4 h-4 text-ivory-dim" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-serif font-bold text-ivory">
              {totalTransactionsCount}
            </p>
            <p className="mt-1 text-xs text-ivory-dim">Total sales recorded</p>
          </div>

          {/* Cash Sales */}
          <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-ivory-dim font-medium">Cash Sales</p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Cash
              </span>
            </div>
            <p className="mt-2 text-2xl font-serif font-bold text-emerald-400">
              {formatCurrency(cashSalesAmount)}
            </p>
            <p className="mt-1 text-xs text-ivory-dim">In physical register</p>
          </div>

          {/* GCash / Digital Sales */}
          <div className="rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-ivory-dim font-medium">GCash / QR</p>
              <CreditCard className="w-4 h-4 text-sky-400/80" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-serif font-bold text-sky-400">
              {formatCurrency(gcashSalesAmount)}
            </p>
            <p className="mt-1 text-xs text-ivory-dim">Digital payments verified</p>
          </div>
        </div>
      </section>

      {/* 3. Search & Filter Bar */}
      <section aria-labelledby="sales-filter-heading" className="space-y-4 rounded-sm border border-white/10 bg-white/5 p-4 sm:p-5 card-gold-accent">
        <div className="border-b border-white/5 pb-3"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Cashier • Transactions</p><h2 id="sales-filter-heading" className="mt-1 text-lg sm:text-xl font-serif font-bold text-ivory">Sales Records</h2></div>

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
              title="Today's sales records"
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
                Showing <strong className="text-gold font-mono">{filteredSales.length}</strong> of{' '}
                <strong className="text-ivory font-mono">{sales.length}</strong> records
              </span>
            ) : (
              <span>
                <strong className="text-gold font-mono">{sales.length}</strong> sales recorded today
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
          <p className="text-sm">The sales information could not be loaded. Please try again.</p>
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
        {isLoading && sales.length === 0 ? (
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
        ) : paginatedSales.length > 0 ? (
          paginatedSales.map((sale) => (
            <div
              key={sale.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedSale(sale)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedSale(sale);
                }
              }}
              className="bg-white/5 border border-white/10 rounded-sm p-4 hover:border-gold/40 hover:bg-gold/[0.04] transition-all cursor-pointer card-gold-accent focus:outline-none focus:ring-1 focus:ring-gold/50"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0">
                  <h4 className="text-ivory font-semibold text-sm break-words">{sale.customer}</h4>
                  <p className="text-ivory-dim text-[11px]">{formatTimeOnly(sale.created_at)}</p>
                </div>
                <p className="text-gold font-semibold font-sans tabular-nums text-base shrink-0">
                  {formatCurrency(Number(sale.amount || 0))}
                </p>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-ivory-dim">Barber</span>
                  <span className="text-ivory"><span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-gold/20 bg-gold/[0.07] px-2 py-1 text-xs font-medium text-gold"><Scissors className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="whitespace-normal break-words">{sale.barber}</span></span></span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-ivory-dim">Service</span>
                  <div className="text-right">
                    <div className="text-ivory font-medium">
                      {sale.service === 'Reservation Fee' ? 'Reservation Booking' : formatHistoryService(sale.service)}
                    </div>
                    {(sale.transaction_type === 'reservation_fee' || sale.service === 'Reservation Fee') && (
                      <div className="mt-0.5">
                        <span className="inline-flex items-center gap-1 rounded-sm border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[9px] font-semibold text-gold">
                          <span>Reservation Fee</span>
                          <span className="text-[8px] text-ivory-dim font-normal">(Deposit)</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <span className="text-ivory-dim">Payment</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${getPaymentBadgeClass(sale.payment_method)}`}>
                    {sale.payment_method || '—'}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-sm border border-white/10 bg-white/5 p-8 text-center text-xs text-ivory-dim">
            {hasActiveFilters ? (
              <div className="space-y-2">
                <p>No sales match your current filters.</p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-gold hover:text-gold-dim underline font-semibold cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <p>No sales recorded today.</p>
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
              {isLoading && sales.length === 0 ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-28 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-20 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-28 h-4" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-20 h-4 ml-auto" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-12 h-4 ml-auto" /></td>
                  </tr>
                ))
              ) : paginatedSales.length > 0 ? (
                paginatedSales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedSale(sale)}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3.5 align-middle">
                      <div className="font-semibold text-ivory group-hover:text-gold transition-colors break-words max-w-[180px]">
                        {sale.customer}
                      </div>
                      <div className="text-[10px] text-ivory-dim mt-0.5">
                        {formatTimeOnly(sale.created_at)}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim text-xs align-middle">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-gold/20 bg-gold/[0.07] px-2 py-1 text-xs font-medium text-gold"><Scissors className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="whitespace-normal break-words">{sale.barber}</span></span>
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim text-xs align-middle">
                      <div className="font-medium text-ivory">
                        {sale.service === 'Reservation Fee' ? 'Reservation Booking' : formatHistoryService(sale.service)}
                      </div>
                      {(sale.transaction_type === 'reservation_fee' || sale.service === 'Reservation Fee') && (
                        <div className="mt-0.5">
                          <span className="inline-flex items-center gap-1 rounded-sm border border-gold/30 bg-gold/10 px-1.5 py-0.2 text-[9px] font-semibold text-gold">
                            <span>Reservation Fee</span>
                            <span className="text-[8px] text-ivory-dim font-normal">(Deposit)</span>
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3.5 text-right align-middle whitespace-nowrap">
                      <div className="font-sans font-semibold tabular-nums text-gold text-xs">
                        {formatCurrency(Number(sale.amount || 0))}
                      </div>
                      <div className="mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border ${getPaymentBadgeClass(sale.payment_method)}`}>
                          {sale.payment_method || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-right align-middle whitespace-nowrap">
                      <button type="button" aria-label={`View details for ${sale.customer}`} onClick={(event) => { event.stopPropagation(); setSelectedSale(sale); }} className="inline-flex min-h-8 items-center gap-1 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-ivory-dim hover:border-gold/30 hover:bg-gold/10 hover:text-gold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold transition-colors"><span>Details</span><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
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
                      <p>No sales recorded today.</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Desktop Excel-Familiar Table View (>= 1200px) */}
      <div className="hidden xl:block rounded-sm border border-white/5 bg-charcoal/20 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[32rem] custom-scrollbar">
          <table className="w-full border-collapse text-xs sm:text-sm text-left">
            <thead className="sticky top-0 z-10 bg-charcoal border-b border-white/10">
              <tr>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Customer
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Barber
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Service
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim text-right">
                  Amount
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim">
                  Payment
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim text-right">
                  Time
                </th>
                <th scope="col" className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] text-ivory-dim text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && sales.length === 0 ? (
                [1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-28 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-20 h-4" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-32 h-4" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-20 h-4 ml-auto" /></td>
                    <td className="py-3 px-3.5"><Skeleton variant="text" className="w-16 h-4" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-20 h-4 ml-auto" /></td>
                    <td className="py-3 px-3.5 text-right"><Skeleton variant="text" className="w-12 h-4 ml-auto" /></td>
                  </tr>
                ))
              ) : paginatedSales.length > 0 ? (
                paginatedSales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedSale(sale)}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3.5 font-semibold text-ivory group-hover:text-gold transition-colors whitespace-nowrap">
                      {sale.customer}
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim whitespace-nowrap">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-gold/20 bg-gold/[0.07] px-2 py-1 text-xs font-medium text-gold"><Scissors className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="whitespace-normal break-words">{sale.barber}</span></span>
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim">
                      <div className="font-medium text-ivory">
                        {sale.service === 'Reservation Fee' ? 'Reservation Booking' : formatHistoryService(sale.service)}
                      </div>
                      {(sale.transaction_type === 'reservation_fee' || sale.service === 'Reservation Fee') && (
                        <div className="mt-1">
                          <span
                            className="inline-flex items-center gap-1 rounded-sm border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold"
                            title="Online Booking Deposit"
                          >
                            <span>Reservation Fee</span>
                            <span className="text-[9px] text-ivory-dim font-normal">(Deposit)</span>
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3.5 font-sans font-semibold tabular-nums text-gold text-right whitespace-nowrap">
                      {formatCurrency(Number(sale.amount || 0))}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${getPaymentBadgeClass(
                          sale.payment_method
                        )}`}
                      >
                        {sale.payment_method || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-ivory-dim text-right whitespace-nowrap">
                      {formatTimeOnly(sale.created_at)}
                    </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <button type="button" aria-label={`View details for ${sale.customer}`} onClick={(event) => { event.stopPropagation(); setSelectedSale(sale); }} className="inline-flex min-h-8 items-center gap-1 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-ivory-dim hover:border-gold/30 hover:bg-gold/10 hover:text-gold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold transition-colors"><span>Details</span><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
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
                      <p>No sales recorded today.</p>
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

      {/* 8. Record Details Modal (Sale Details) */}
      <Modal
        isOpen={Boolean(selectedSale)}
        onClose={() => setSelectedSale(null)}
        title="Sale Details"
        size="md"
        footer={
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={() => setSelectedSale(null)}
              className="h-10 px-6 rounded-sm bg-white/5 border border-white/10 text-ivory hover:bg-white/10 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        {selectedSale && (
          <div className="space-y-4 text-xs sm:text-sm text-ivory">
            {/* Amount Banner */}
            <div className="rounded-sm border border-gold/30 bg-gold/[0.05] p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim block">
                Total Amount Paid
              </span>
              <div className="text-2xl sm:text-3xl font-serif font-bold text-gold mt-1">
                {formatCurrency(Number(selectedSale.amount || 0))}
              </div>
            </div>

            {/* Grouped Information Grid */}
            <div className="rounded-sm border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Customer
                </span>
                <span className="font-bold text-ivory">{selectedSale.customer}</span>
              </div>

              <div className="flex items-start justify-between pb-2 border-b border-white/5 gap-4">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold pt-0.5">
                  Service
                </span>
                <div className="text-right">
                  <div className="text-ivory font-medium">
                    {selectedSale.service === 'Reservation Fee' ? 'Reservation Booking' : formatHistoryService(selectedSale.service)}
                  </div>
                  {(selectedSale.transaction_type === 'reservation_fee' || selectedSale.service === 'Reservation Fee') && (
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      <span className="inline-flex items-center rounded-sm border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">
                        Reservation Fee
                      </span>
                      <span className="text-xs text-ivory-dim">(Online Booking Deposit)</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Barber
                </span>
                <span className="text-ivory">{selectedSale.barber}</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Payment Method
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${getPaymentBadgeClass(selectedSale.payment_method)}`}>
                  {selectedSale.payment_method || '—'}
                </span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Date &amp; Time
                </span>
                <span className="text-ivory">{formatDateTime(selectedSale.created_at)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">
                  Transaction Record
                </span>
                <span className="font-mono text-gold text-xs">#{selectedSale.id}</span>
              </div>
            </div>
            {selectedSale.payment_method?.toLowerCase().includes('gcash') && (
              <div className="rounded-sm border border-sky-500/30 bg-sky-500/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-ivory-dim uppercase tracking-wider text-[10px] font-bold">GCash Payment Evidence</span>
                <span className="text-[10px] font-semibold text-sky-200">Reference &amp; Receipt</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
                <span className="text-ivory-dim text-xs">Reference Number</span>
                <span className="font-sans font-semibold tabular-nums text-sky-200 text-right break-all">{selectedSale.gcash_ref_no || 'Not available'}</span>
              </div>
              {selectedSale.transaction_type === 'reservation_fee' && !selectedSale.gcash_ref_no && (
                <div className="space-y-2 rounded-sm border border-amber-400/20 bg-amber-400/[0.05] p-3">
                  <p className="text-xs font-semibold text-amber-100">Add the GCash reference from the cashier’s phone</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      aria-label="GCash reservation fee reference number"
                      value={reservationFeeReference}
                      onChange={(event) => setReservationFeeReference(event.target.value.slice(0, 32))}
                      maxLength={32}
                      placeholder="Enter reference number"
                      className="min-h-11 min-w-0 flex-1 touch-manipulation rounded-sm border border-white/10 bg-charcoal px-3 text-base text-ivory outline-none focus:border-gold/60 sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void saveReservationFeeReference()}
                      disabled={savingReservationFeeReference || !/^[A-Za-z0-9]{8,32}$/.test(reservationFeeReference.trim().replace(/[\s-]+/g, ''))}
                      className="h-10 rounded-sm bg-gold px-4 text-xs font-bold uppercase tracking-wide text-charcoal hover:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingReservationFeeReference ? 'Saving…' : 'Save Reference'}
                    </button>
                  </div>
                  {reservationFeeReferenceError && <p role="alert" className="text-xs text-red-300">{reservationFeeReferenceError}</p>}
                </div>
              )}
              {selectedSale.transaction_type === 'reservation_fee' && !selectedSale.reservation_fee_receipt_available && (
                <div className="space-y-2 rounded-sm border border-sky-400/20 bg-sky-400/[0.04] p-3">
                  <p className="text-xs font-semibold text-sky-100">Upload the receipt photo</p>
                  <p className="text-[11px] text-ivory-dim">The reference number will be filled in automatically when it can be read.</p>
                  <label className={`flex min-h-11 w-full items-center justify-center rounded-sm border border-sky-400/40 px-4 py-2.5 text-center text-xs font-semibold text-sky-200 hover:bg-sky-400/10 cursor-pointer ${uploadingReservationFeeReceipt ? 'pointer-events-none opacity-50' : ''}`}>
                    {uploadingReservationFeeReceipt ? 'Reading and uploading…' : 'Take or choose GCash receipt photo'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      capture="environment"
                      className="sr-only"
                      disabled={uploadingReservationFeeReceipt}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleReservationFeeReceiptUpload(file);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {pendingReservationFeeFile && (
                    <button
                      type="button"
                      onClick={() => void handleReservationFeeReceiptUpload(pendingReservationFeeFile, true)}
                      disabled={uploadingReservationFeeReceipt || !/^[A-Za-z0-9]{8,32}$/.test(reservationFeeReference.trim().replace(/[\s-]+/g, ''))}
                      className="min-h-10 w-full rounded-sm bg-gold px-3 text-xs font-bold uppercase text-charcoal disabled:opacity-50"
                    >
                      Confirm and upload selected receipt
                    </button>
                  )}
                  {reservationFeeReceiptError && <p role="status" className="text-xs text-amber-200">{reservationFeeReceiptError}</p>}
                </div>
              )}
              {selectedSale.receipt_available && (
                <div>
                  {saleReceiptLoading && <p className="text-xs text-ivory-dim">Loading receipt image…</p>}
                  {saleReceiptError && <p className="text-xs text-red-300">{saleReceiptError}</p>}
                  {saleReceiptUrl && (
                    <button
                      type="button"
                      onClick={() => setReceiptZoomOpen(true)}
                      className="group relative block w-full cursor-zoom-in rounded-sm focus:outline-none focus:ring-2 focus:ring-gold"
                      title="Open receipt for zoomed viewing"
                      aria-label="Open GCash payment receipt for zoomed viewing"
                    >
                      <img src={saleReceiptUrl} alt="GCash payment receipt" className="max-h-72 w-full rounded-sm border border-white/10 bg-black/30 object-contain" />
                      <span className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-sm bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                        Click to enlarge
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
            )}
            {selectedSale.payment_method?.toLowerCase().includes('gcash') && selectedSale.payment_attempt_id && !selectedSale.receipt_available && (
              <div className="rounded-sm border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
                <div className="text-xs font-semibold text-sky-200">Receipt evidence missing</div>
                <p className="text-xs leading-relaxed text-ivory-dim">Take a clear photo with your phone or choose an image. The reference will be detected automatically when readable.</p>
                <label className={`flex min-h-12 w-full items-center justify-center rounded-sm border border-sky-400/40 px-4 py-3 text-center text-xs font-semibold text-sky-200 hover:bg-sky-400/10 cursor-pointer ${uploadingEvidence ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploadingEvidence ? 'Reading and uploading…' : 'Take or choose GCash receipt photo'}
                  <input type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" disabled={uploadingEvidence} onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleEvidenceSelection(file);
                    event.currentTarget.value = '';
                  }} />
                </label>
                {uploadError && <p className="text-xs text-red-300">{uploadError}</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={receiptUploadPreviewOpen && Boolean(pendingEvidencePreview)}
        onClose={() => {
          setReceiptUploadPreviewOpen(false);
          setPendingEvidenceFile(null);
          setPendingEvidencePreview(null);
          pendingEvidenceFileRef.current = null;
        }}
        title="Confirm GCash Receipt"
        size="xl"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setReceiptUploadPreviewOpen(false);
                setPendingEvidenceFile(null);
                setPendingEvidencePreview(null);
                pendingEvidenceFileRef.current = null;
              }}
              className="h-11 rounded-sm border border-white/10 bg-white/5 px-4 text-xs font-semibold uppercase tracking-wider text-ivory hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEvidenceUpload}
              disabled={uploadingEvidence || !pendingEvidenceFile || !/^[A-Za-z0-9]{8,32}$/.test(pendingEvidenceReference.trim().replace(/[\s-]+/g, ''))}
              className="h-11 rounded-sm bg-gold px-4 text-xs font-bold uppercase tracking-wider text-charcoal hover:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              Confirm and upload
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ivory">Check that this is the correct GCash receipt before uploading it.</p>
          <label className="block text-xs text-ivory">
            <span className="mb-1 block font-semibold">Full GCash reference number</span>
            <input
              type="text"
              value={pendingEvidenceReference}
              onChange={event => setPendingEvidenceReference(event.target.value)}
              placeholder="Enter or correct the full reference number"
              className="min-h-11 w-full touch-manipulation rounded-sm border border-white/20 bg-charcoal px-3 text-base text-ivory outline-none focus:border-gold sm:text-sm"
            />
            <span className="mt-1 block text-ivory-dim">{scanningEvidenceReference ? 'Scanning the photo; you can enter the number now.' : 'Check every digit against the receipt.'}</span>
          </label>
          {uploadError && <p role="alert" className="text-xs text-red-300">{uploadError}</p>}
          <div className="flex max-h-[60vh] min-h-[14rem] items-center justify-center overflow-auto rounded-sm border border-white/10 bg-black/50 p-2 sm:p-4">
            {pendingEvidencePreview && (
              <img
                src={pendingEvidencePreview}
                alt="Selected GCash receipt preview"
                className="max-h-[56vh] w-auto max-w-full object-contain"
              />
            )}
          </div>
          <label className="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-sm border border-sky-400/40 px-4 py-3 text-center text-xs font-semibold text-sky-200 hover:bg-sky-400/10">
            Choose a different image
            <input type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleEvidenceSelection(file);
              event.currentTarget.value = '';
            }} />
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={receiptZoomOpen && Boolean(saleReceiptUrl)}
        onClose={() => setReceiptZoomOpen(false)}
        title="GCash Payment Receipt"
        size="xl"
        bodyClassName="p-2 sm:p-4"
      >
        <div className="flex max-h-[calc(100dvh-10rem)] min-h-[60vh] items-center justify-center overflow-auto rounded-sm border border-white/10 bg-black/60 p-2 sm:p-4">
          {saleReceiptUrl && (
            <img
              src={saleReceiptUrl}
              alt="Enlarged GCash payment receipt"
              className="max-h-[calc(100dvh-12rem)] w-auto max-w-full object-contain"
            />
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-ivory-dim">Use your browser or device zoom controls to inspect receipt details.</p>
      </Modal>
    </div>
  );
};

export default TodaysSalesTab;
