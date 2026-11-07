import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Search, 
    History, 
    Phone, 
    PhoneOff, 
    Calendar, 
    Loader2, 
    Camera, 
    ChevronDown, 
    ChevronUp, 
    ChevronLeft, 
    ChevronRight, 
    Sparkles, 
    X, 
    RefreshCw, 
    Scissors, 
    FileText, 
    Copy, 
    Check, 
    UserCheck, 
    FolderOpen,
    LayoutGrid,
    List
} from 'lucide-react';
import { barberService, CustomerHistoryRecord, CustomerHistoryPagination } from '../services/barber.service';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatManilaServiceDateTime } from '@/utils/manila-date';
import Portal from '@/components/common/Portal';

const BarberHistorySkeleton: React.FC<{ viewMode?: 'grid' | 'table' }> = ({ viewMode = 'grid' }) => (
    <div className="w-full space-y-6" aria-label="Loading customer history feed" aria-busy="true">
        {/* Search Header Skeleton */}
        <div className="bg-charcoal-light border border-white/10 rounded-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <Skeleton variant="text" className="w-48 h-5" />
                <Skeleton variant="text" className="w-24 h-5 rounded-full" />
            </div>
            <Skeleton variant="rect" className="w-full h-11 rounded-sm" />
            <div className="flex gap-2 pt-2">
                <Skeleton variant="rect" className="w-20 h-7 rounded-sm" />
                <Skeleton variant="rect" className="w-16 h-7 rounded-sm" />
                <Skeleton variant="rect" className="w-24 h-7 rounded-sm" />
            </div>
        </div>

        {/* Compact Cards Grid Skeleton (12 cards) */}
        {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {Array.from({ length: 12 }, (_, i) => (
                    <div key={i} className="bg-charcoal-light border border-white/10 rounded-sm p-4 space-y-3.5 shadow-xl">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                            <Skeleton variant="text" className="w-24 h-3.5" />
                            <Skeleton variant="text" className="w-16 h-4 rounded-full" />
                        </div>
                        <div className="flex items-center gap-3">
                            <Skeleton variant="circle" className="w-10 h-10 flex-shrink-0" />
                            <div className="space-y-1.5 flex-1">
                                <Skeleton variant="text" className="w-32 h-4" />
                                <Skeleton variant="text" className="w-20 h-3" />
                            </div>
                        </div>
                        <div className="space-y-2 pt-1">
                            <Skeleton variant="rect" className="h-10 w-full rounded-sm" />
                        </div>
                        <Skeleton variant="rect" className="h-7 w-full rounded-sm" />
                    </div>
                ))}
            </div>
        ) : (
            <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 space-y-3 shadow-xl">
                {Array.from({ length: 15 }, (_, i) => (
                    <Skeleton key={i} variant="rect" className="h-12 w-full rounded-sm" />
                ))}
            </div>
        )}
    </div>
);

const getStatusBadge = (rawStatus: string) => {
    if (!rawStatus) return { label: 'N/A', style: 'text-gold bg-gold/10 border-gold/20' };
    const normalized = rawStatus.toUpperCase().replace(/_/g, ' ');
    switch (normalized) {
        case 'COMPLETED':
        case 'SERVED':
            return { label: 'COMPLETED', style: 'text-green-400 bg-green-500/10 border-green-500/20' };
        case 'CANCELLED':
        case 'CANCELED':
            return { label: 'CANCELLED', style: 'text-red-400 bg-red-500/10 border-red-500/20' };
        case 'NO SHOW':
        case 'NOSHOW':
            return { label: 'NO SHOW', style: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
        case 'LATE':
        case 'EXPIRED':
            return { label: normalized, style: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
        case 'SERVING':
        case 'IN PROGRESS':
            return { label: 'SERVING', style: 'text-gold bg-gold/10 border-gold/20' };
        default:
            return { label: normalized, style: 'text-gold bg-gold/10 border-gold/20' };
    }
};

const NO_CONTACT_LABEL = 'No contact on file';

const hasContact = (mobile?: string | null): mobile is string =>
    Boolean(mobile && mobile.trim() !== '' && mobile.trim().toUpperCase() !== 'N/A');

const isRealPhoto = (url?: string | null): boolean => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    if (
        trimmed.includes('images.unsplash.com/photo-1503951914875') ||
        trimmed.includes('images.unsplash.com/photo-1621605815971')
    ) {
        return false;
    }
    return true;
};

/**
 * Robust date/time parser standardized on Asia/Manila timezone
 */
const formatServiceDateTime = (dateStr?: string | null, timeStr?: string | null, rawTimestamp?: string | null) => {
    return formatManilaServiceDateTime(dateStr, timeStr, rawTimestamp);
};

const HighlightText: React.FC<{ text: string; query: string; className?: string }> = React.memo(({ text, query, className = '' }) => {
    if (!query || !query.trim() || !text) {
        return <span className={className}>{text || ''}</span>;
    }

    const trimmed = query.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

    return (
        <span className={className}>
            {parts.map((part, i) =>
                part.toLowerCase() === trimmed.toLowerCase() ? (
                    <mark key={i} className="bg-gold/30 text-gold font-bold px-0.5 rounded-xs underline decoration-gold/60">
                        {part}
                    </mark>
                ) : (
                    <React.Fragment key={i}>{part}</React.Fragment>
                )
            )}
        </span>
    );
});

export const HistoryTab: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
    const [customDate, setCustomDate] = useState<string>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [pagination, setPagination] = useState<CustomerHistoryPagination>({
        total: 0,
        page: 1,
        limit: 12,
        totalPages: 1
    });
    const [records, setRecords] = useState<CustomerHistoryRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeModalCustomer, setActiveModalCustomer] = useState<CustomerHistoryRecord | null>(null);
    const [expandedVisits, setExpandedVisits] = useState<{ [key: string]: boolean }>({});
    const [copiedRef, setCopiedRef] = useState<string | null>(null);

    const activeSearchId = useRef(0);

    const handleCopyRef = (e: React.MouseEvent, refCode: string) => {
        e.stopPropagation();
        if (!refCode) return;
        void navigator.clipboard.writeText(refCode);
        setCopiedRef(refCode);
        setTimeout(() => setCopiedRef(null), 2000);
    };

    const executeSearch = useCallback(async (query: string, page: number, forceRefresh: boolean = false) => {
        const currentId = ++activeSearchId.current;
        if (forceRefresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);

        try {
            const result = await barberService.searchCustomerHistory(query.trim(), page, 12, forceRefresh);
            if (currentId !== activeSearchId.current) return;

            setRecords(result.data || []);
            setPagination(result.pagination);
        } catch (err: any) {
            if (currentId !== activeSearchId.current) return;
            console.error('Customer history search error:', err);
            setError(err?.response?.data?.error || err?.message || 'Failed to retrieve customer history records.');
            setRecords([]);
        } finally {
            if (currentId === activeSearchId.current) {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        }
    }, []);

    // Trigger debounced search when searchQuery changes (resets to page 1)
    useEffect(() => {
        setCurrentPage(1);
        const timer = setTimeout(() => {
            void executeSearch(searchQuery, 1, false);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, executeSearch]);

    // Handle page change
    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > pagination.totalPages || newPage === currentPage) return;
        setCurrentPage(newPage);
        void executeSearch(searchQuery, newPage, false);
    };

    // Manual Refresh button
    const handleManualRefresh = () => {
        void executeSearch(searchQuery, currentPage, true);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setActiveModalCustomer(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (activeModalCustomer) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = 'unset';
            };
        }
    }, [activeModalCustomer]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentPage(1);
        void executeSearch(searchQuery, 1, false);
    };

    const toggleVisits = (guestRef: string) => {
        setExpandedVisits(prev => ({ ...prev, [guestRef]: !prev[guestRef] }));
    };

    // Filter and sort records chronologically (newest first)
    const filteredRecords = React.useMemo(() => {
        let list = [...records];

        if (dateFilter !== 'all') {
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            
            list = list.filter(record => {
                const recordDateStr = record.last_created 
                    ? record.last_created.slice(0, 10) 
                    : (record.visits?.[0]?.date || (record.lastVisit !== 'No previous visits' ? record.lastVisit : ''));

                if (dateFilter === 'today') {
                    return recordDateStr === todayStr;
                }
                if (dateFilter === 'week') {
                    const visitTime = record.last_created ? new Date(record.last_created).getTime() : new Date(recordDateStr).getTime();
                    if (isNaN(visitTime)) return true;
                    return (Date.now() - visitTime) <= (7 * 24 * 60 * 60 * 1000);
                }
                if (dateFilter === 'month') {
                    const visitTime = record.last_created ? new Date(record.last_created).getTime() : new Date(recordDateStr).getTime();
                    if (isNaN(visitTime)) return true;
                    return (Date.now() - visitTime) <= (30 * 24 * 60 * 60 * 1000);
                }
                if (dateFilter === 'custom' && customDate) {
                    return recordDateStr === customDate;
                }
                return true;
            });
        }

        // Sort chronologically by newest
        list.sort((a, b) => {
            const timeA = a.last_created ? new Date(a.last_created).getTime() : (a.visits?.[0] ? new Date(`${a.visits[0].date} ${a.visits[0].time || ''}`).getTime() : 0);
            const timeB = b.last_created ? new Date(b.last_created).getTime() : (b.visits?.[0] ? new Date(`${b.visits[0].date} ${b.visits[0].time || ''}`).getTime() : 0);
            return timeB - timeA;
        });

        return list;
    }, [records, dateFilter, customDate]);

    // Check if a record was created within the last 1 hour (for the first 5 records)
    const isNewCustomer = useCallback((record: CustomerHistoryRecord, index: number) => {
        if (index >= 5) return false;
        const timeStr = record.last_created || (record.visits?.[0] ? `${record.visits[0].date} ${record.visits[0].time || ''}` : null);
        if (!timeStr) return false;
        try {
            const timeMs = new Date(timeStr).getTime();
            if (isNaN(timeMs) || timeMs <= 0) return false;
            const diffMs = Date.now() - timeMs;
            return diffMs >= 0 && diffMs <= (60 * 60 * 1000); // 1 hour
        } catch {
            return false;
        }
    }, []);

    const startRecordIndex = pagination.total === 0 ? 0 : (currentPage - 1) * 12 + 1;
    const endRecordIndex = Math.min(pagination.total, currentPage * 12);

    return (
        <div className="w-full space-y-6 pb-12">
            {/* Search Header Card */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl relative">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/60 to-transparent"></div>
                
                <div className="bg-white/[0.02] px-4 sm:px-6 py-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                        <Search className="w-5 h-5 text-gold" />
                        <h3 className="font-serif font-bold text-ivory text-base tracking-wide">Customer History Directory</h3>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {/* View Switcher for Desktop */}
                        <div className="hidden sm:flex items-center bg-white/5 border border-white/10 rounded-sm p-0.5">
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-xs text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                                    viewMode === 'grid' ? 'bg-gold text-charcoal shadow-sm' : 'text-ivory-dim hover:text-gold'
                                }`}
                                title="Grid View"
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span className="text-[10px]">Cards</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded-xs text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                                    viewMode === 'table' ? 'bg-gold text-charcoal shadow-sm' : 'text-ivory-dim hover:text-gold'
                                }`}
                                title="Explorer Table View"
                            >
                                <List className="w-3.5 h-3.5" />
                                <span className="text-[10px]">Table</span>
                            </button>
                        </div>

                        <button
                            onClick={handleManualRefresh}
                            disabled={isLoading || isRefreshing}
                            className="p-1.5 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gold/40 text-ivory-dim hover:text-gold rounded-sm text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                            title="Force Refresh Directory Cache"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-gold' : ''}`} />
                            <span className="hidden sm:inline">Refresh</span>
                        </button>
                        <span className="text-[10px] font-bold text-gold/80 bg-gold/10 px-3 py-1 rounded-full uppercase tracking-widest border border-gold/20 flex items-center gap-1.5">
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-3 h-3 text-gold animate-spin" /> SEARCHING...
                                </>
                            ) : (
                                <>
                                    TOTAL ({pagination.total})
                                </>
                            )}
                        </span>
                    </div>
                </div>

                <div className="p-4 sm:p-6 space-y-4">
                    <p className="text-xs text-ivory-dim leading-relaxed">
                        Search customer records by name, mobile, or guest ID. Tap any client dossier to view haircut history and full visual archives.
                    </p>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 p-3.5 rounded-sm text-xs text-red-400">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSearchSubmit} className="relative">
                        <input
                            type="text"
                            placeholder="Search by Name, Mobile (e.g. 0917), or Guest Ref (e.g. MST-8821)..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-charcoal border border-white/10 rounded-sm py-3.5 pl-12 pr-12 text-sm text-ivory placeholder-white/25 focus:border-gold focus:outline-none transition-all shadow-inner"
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ivory-dim w-5 h-5" />
                        {isLoading && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                <Loader2 className="text-gold w-5 h-5 animate-spin" />
                            </div>
                        )}
                    </form>

                    {/* Date Filters & Sort Order Indicator */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-ivory-dim mr-1 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-gold" /> Filter:
                            </span>
                            <button
                                type="button"
                                onClick={() => setDateFilter('all')}
                                className={`px-2.5 py-1 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                                    dateFilter === 'all'
                                        ? 'bg-gold text-charcoal shadow-sm'
                                        : 'bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-gold border border-white/10'
                                }`}
                            >
                                All Dates
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateFilter('today')}
                                className={`px-2.5 py-1 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                                    dateFilter === 'today'
                                        ? 'bg-gold text-charcoal shadow-sm'
                                        : 'bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-gold border border-white/10'
                                }`}
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateFilter('week')}
                                className={`px-2.5 py-1 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                                    dateFilter === 'week'
                                        ? 'bg-gold text-charcoal shadow-sm'
                                        : 'bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-gold border border-white/10'
                                }`}
                            >
                                Past 7 Days
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateFilter('month')}
                                className={`px-2.5 py-1 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                                    dateFilter === 'month'
                                        ? 'bg-gold text-charcoal shadow-sm'
                                        : 'bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-gold border border-white/10'
                                }`}
                            >
                                Past 30 Days
                            </button>
                            <div className="flex items-center gap-1.5 ml-1">
                                <input
                                    type="date"
                                    value={customDate}
                                    onChange={(e) => {
                                        setCustomDate(e.target.value);
                                        if (e.target.value) setDateFilter('custom');
                                    }}
                                    className={`bg-charcoal border text-xs px-2.5 py-1 rounded-sm text-ivory focus:outline-none transition-all cursor-pointer ${
                                        dateFilter === 'custom' && customDate
                                            ? 'border-gold text-gold bg-gold/10'
                                            : 'border-white/10 hover:border-white/20'
                                    }`}
                                    title="Select Custom Date"
                                />
                                {customDate && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCustomDate('');
                                            setDateFilter('all');
                                        }}
                                        className="p-1 text-ivory-dim hover:text-gold text-xs cursor-pointer"
                                        title="Clear Date"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-ivory-dim">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="font-semibold text-ivory">Showing Newest First (Manila Time • PHT)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area: Loading / Empty / Grid or Table */}
            {isLoading ? (
                <BarberHistorySkeleton viewMode={viewMode} />
            ) : filteredRecords.length === 0 ? (
                pagination.total === 0 && !searchQuery.trim() && dateFilter === 'all' && !customDate ? (
                    <div className="bg-charcoal-light border border-white/10 rounded-sm p-12 text-center text-ivory-dim text-sm shadow-xl space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gold/40 mx-auto">
                            <History className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-serif font-bold text-ivory uppercase tracking-wider">No Customer History Yet</h4>
                        <p className="text-xs text-ivory-dim max-w-md mx-auto">
                            Customers you've served will appear here once service history becomes available.
                        </p>
                    </div>
                ) : (
                    <div className="bg-charcoal-light border border-white/10 rounded-sm p-12 text-center text-ivory-dim text-sm shadow-xl space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gold/40 mx-auto">
                            <Search className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-serif font-bold text-ivory uppercase tracking-wider">No Matching History</h4>
                        <p className="text-xs text-ivory-dim max-w-md mx-auto">
                            {searchQuery.trim()
                                ? `No customer history matches "${searchQuery}".`
                                : 'No customer history matches your current search or filters.'}
                        </p>
                        {(searchQuery.trim() || dateFilter !== 'all' || customDate) && (
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setDateFilter('all');
                                        setCustomDate('');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-xs text-xs font-semibold cursor-pointer transition-colors"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Reset Search & Filters
                                </button>
                            </div>
                        )}
                    </div>
                )
            ) : (
                <div className="space-y-6">
                    {/* View Mode 1: Luxury Dossier Grid (15 records, 3 cols desktop, 2 cols tablet, 1 col mobile) */}
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                            {filteredRecords.map((customer, index) => {
                                const key = customer.guestRef || customer.name;
                                const isNew = isNewCustomer(customer, index);
                                const isReturning = Boolean(
                                    (customer.visits && customer.visits.length > 1) || 
                                    (customer.customer_id && customer.visits && customer.visits.length >= 1)
                                );
                                const isCopied = copiedRef === customer.guestRef;
                                const timeInfo = formatServiceDateTime(customer.lastVisit, customer.visits?.[0]?.time, customer.last_created);
                                const visitCount = customer.visits?.length || 1;
                                const serviceTitle = customer.service_name || customer.serviceName || customer.visits?.[0]?.service_name || 'Service';

                                return (
                                    <div 
                                        key={key}
                                        id={`customer-card-${customer.guestRef}`}
                                        onClick={() => setActiveModalCustomer(customer)}
                                        className={`bg-charcoal-light border rounded-sm overflow-hidden shadow-lg relative transition-all duration-200 flex flex-col justify-between cursor-pointer group hover:border-gold/60 hover:shadow-2xl ${
                                            searchQuery.trim()
                                                ? 'border-gold/50 shadow-[0_0_15px_rgba(212,175,55,0.12)]'
                                                : 'border-white/10'
                                        }`}
                                    >
                                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/60 to-transparent"></div>

                                        {/* File Dossier Top Tab Header */}
                                        <div className="bg-white/[0.04] px-4 py-2 border-b border-white/5 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <FileText className="w-3.5 h-3.5 text-gold flex-shrink-0" />
                                                <span className="font-mono text-[11px] text-ivory font-bold truncate">
                                                    <HighlightText text={customer.guestRef} query={searchQuery} />
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleCopyRef(e, customer.guestRef)}
                                                    className="p-1 hover:bg-white/10 text-ivory-dim hover:text-gold rounded-xs transition-colors cursor-pointer flex-shrink-0"
                                                    title="Copy Reference Code"
                                                >
                                                    {isCopied ? (
                                                        <Check className="w-3 h-3 text-emerald-400 animate-pulse" />
                                                    ) : (
                                                        <Copy className="w-3 h-3 text-ivory-dim hover:text-gold" />
                                                    )}
                                                </button>
                                                {isCopied && (
                                                    <span className="text-[9px] text-emerald-400 font-bold animate-fade-in">COPIED</span>
                                                )}
                                            </div>

                                            {/* Status Badges Container (NEW / RETURNING) */}
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                {isNew && (
                                                    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 via-gold to-amber-500 text-charcoal font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-[0_0_10px_rgba(212,175,55,0.4)] animate-pulse border border-gold/60">
                                                        <Sparkles className="w-2.5 h-2.5" />
                                                        NEW
                                                    </span>
                                                )}
                                                {isReturning && (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                                                        <UserCheck className="w-2.5 h-2.5" />
                                                        RETURNING
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Card Body Profile & Availed Service */}
                                        <div className="p-4 space-y-3">
                                            {/* Identity Row */}
                                            <div className="flex items-start justify-between gap-2.5">
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold/30 via-gold/10 to-transparent border border-gold/40 flex items-center justify-center font-serif text-gold font-bold text-sm shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform">
                                                        {customer.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <HighlightText text={customer.name} query={searchQuery} className="text-sm font-bold text-ivory leading-tight block truncate group-hover:text-gold transition-colors" />
                                                        
                                                        <div className="mt-0.5">
                                                            {hasContact(customer.mobile) ? (
                                                                <span className="flex items-center gap-1 text-xs text-ivory-dim">
                                                                    <Phone className="w-3 h-3 text-gold/80" />
                                                                    <HighlightText text={customer.mobile} query={searchQuery} />
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-[10px] text-ivory-dim/50 italic">
                                                                    <PhoneOff className="w-2.5 h-2.5 text-white/30" />
                                                                    <span>{NO_CONTACT_LABEL}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Visit Count Badge */}
                                                <span className="text-[10px] font-bold text-ivory-dim bg-white/5 px-2 py-0.5 rounded-xs border border-white/5 font-mono flex-shrink-0">
                                                    {visitCount} {visitCount > 1 ? 'Visits' : 'Visit'}
                                                </span>
                                            </div>

                                            {/* Structured Metadata Box */}
                                            <div className="bg-charcoal/90 border border-white/5 rounded-xs p-2.5 space-y-1.5">
                                                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                                                    <span className="text-[11px] text-ivory-dim flex items-center gap-1.5 shrink-0">
                                                        <Calendar className="w-3.5 h-3.5 text-gold/70" /> Last Cut Date
                                                    </span>
                                                    <div className="text-right shrink-0">
                                                        <span className="font-bold text-gold text-xs tracking-tight">
                                                            {timeInfo.formattedDate}
                                                        </span>
                                                        {timeInfo.formattedTime && (
                                                            <span className="text-[10px] text-ivory-dim font-mono ml-1.5">
                                                                {timeInfo.formattedTime}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Replaced Style with Availed Service */}
                                                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/5 gap-2 flex-wrap">
                                                    <span className="text-[11px] text-ivory-dim flex items-center gap-1.5 shrink-0">
                                                        <Scissors className="w-3.5 h-3.5 text-gold/70" /> Availed Service
                                                    </span>
                                                    <span className="text-[10px] text-gold font-bold bg-gold/10 px-2 py-0.5 rounded-xs border border-gold/20 truncate min-w-0 max-w-full sm:max-w-[210px]" title={serviceTitle}>
                                                        {serviceTitle}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Footer */}
                                        <div className="bg-white/[0.02] px-4 py-2 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-gold/90 group-hover:text-gold transition-colors">
                                            <span className="flex items-center gap-1.5 text-[11px]">
                                                <FolderOpen className="w-3.5 h-3.5 text-gold" />
                                                <span>Open Record</span>
                                            </span>
                                            <ChevronRight className="w-3.5 h-3.5 text-gold group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* View Mode 2: Explorer Table for Desktop/Laptop */
                        <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-ivory border-collapse">
                                    <thead className="bg-white/[0.04] text-[10px] uppercase font-bold text-ivory-dim tracking-wider border-b border-white/10 font-mono">
                                        <tr>
                                            <th className="py-3 px-4">Ref Code</th>
                                            <th className="py-3 px-4">Client Name</th>
                                            <th className="py-3 px-4">Contact</th>
                                            <th className="py-3 px-4">Status</th>
                                            <th className="py-3 px-4">Availed Service</th>
                                            <th className="py-3 px-4">Last Visit (Local Time)</th>
                                            <th className="py-3 px-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {filteredRecords.map((customer, index) => {
                                            const isNew = isNewCustomer(customer, index);
                                            const isReturning = Boolean(
                                                (customer.visits && customer.visits.length > 1) || 
                                                (customer.customer_id && customer.visits && customer.visits.length >= 1)
                                            );
                                            const isCopied = copiedRef === customer.guestRef;
                                            const timeInfo = formatServiceDateTime(customer.lastVisit, customer.visits?.[0]?.time, customer.last_created);
                                            const serviceTitle = customer.service_name || customer.serviceName || customer.visits?.[0]?.service_name || 'Service';

                                            return (
                                                <tr 
                                                    key={customer.guestRef || index}
                                                    onClick={() => setActiveModalCustomer(customer)}
                                                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                                                >
                                                    <td className="py-3 px-4 font-mono text-gold font-bold">
                                                        <div className="flex items-center gap-1.5">
                                                            <span>{customer.guestRef}</span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleCopyRef(e, customer.guestRef)}
                                                                className="p-1 hover:bg-white/10 text-ivory-dim hover:text-gold rounded-xs transition-colors cursor-pointer"
                                                                title="Copy Reference"
                                                            >
                                                                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 font-bold text-ivory group-hover:text-gold transition-colors">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center font-serif text-gold text-[10px] font-bold">
                                                                {customer.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <HighlightText text={customer.name} query={searchQuery} />
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-ivory-dim">
                                                        {hasContact(customer.mobile) ? (
                                                            <span className="font-mono">{customer.mobile}</span>
                                                        ) : (
                                                            <span className="text-white/30 italic text-[11px]">{NO_CONTACT_LABEL}</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-1.5">
                                                            {isNew && (
                                                                <span className="bg-amber-400/20 text-amber-300 text-[9px] font-black px-2 py-0.5 rounded-full border border-amber-400/40">
                                                                    NEW
                                                                </span>
                                                            )}
                                                            {isReturning && (
                                                                <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                                                                    RETURNING
                                                                </span>
                                                            )}
                                                            {!isNew && !isReturning && (
                                                                <span className="text-[10px] text-ivory-dim/60 font-mono">1st Visit</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="text-[11px] text-gold font-bold bg-gold/10 px-2.5 py-1 rounded-xs border border-gold/20">
                                                            {serviceTitle}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div>
                                                            <span className="font-bold text-gold text-xs block">{timeInfo.formattedDate}</span>
                                                            <span className="text-[10px] text-ivory-dim font-mono">{timeInfo.formattedTime}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveModalCustomer(customer);
                                                            }}
                                                            className="px-2.5 py-1 bg-gold/10 hover:bg-gold hover:text-charcoal text-gold text-[10px] font-bold rounded-xs transition-all border border-gold/30"
                                                        >
                                                            View Record
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Pagination Controls (LIMIT 15) */}
                    <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                        <div className="text-xs text-ivory-dim">
                            Showing <span className="font-bold text-gold">{startRecordIndex}</span> to{' '}
                            <span className="font-bold text-gold">{endRecordIndex}</span> of{' '}
                            <span className="font-bold text-gold">{pagination.total}</span> records (12 per page)
                        </div>

                        <div className="flex items-center gap-1.5 self-center sm:self-auto">
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage <= 1 || isLoading}
                                className="px-3 py-1.5 bg-white/5 hover:bg-gold/20 disabled:opacity-40 disabled:hover:bg-white/5 border border-white/10 hover:border-gold/40 text-ivory hover:text-gold text-xs font-bold rounded-sm transition-all flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                <span>Prev</span>
                            </button>

                            {/* Page Numbers */}
                            <div className="flex items-center gap-1 px-1">
                                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => {
                                    if (
                                        p === 1 ||
                                        p === pagination.totalPages ||
                                        (p >= currentPage - 1 && p <= currentPage + 1)
                                    ) {
                                        return (
                                            <button
                                                key={p}
                                                onClick={() => handlePageChange(p)}
                                                disabled={isLoading}
                                                className={`w-8 h-8 rounded-sm text-xs font-bold transition-all cursor-pointer ${
                                                    currentPage === p
                                                        ? 'bg-gold text-charcoal shadow-sm'
                                                        : 'bg-white/5 text-ivory hover:bg-white/10 hover:text-gold border border-white/10'
                                                }`}
                                            >
                                                {p}
                                            </button>
                                        );
                                    }
                                    if (p === currentPage - 2 || p === currentPage + 2) {
                                        return (
                                            <span key={p} className="text-xs text-white/30 px-1">
                                                ...
                                            </span>
                                        );
                                    }
                                    return null;
                                })}
                            </div>

                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage >= pagination.totalPages || isLoading}
                                className="px-3 py-1.5 bg-white/5 hover:bg-gold/20 disabled:opacity-40 disabled:hover:bg-white/5 border border-white/10 hover:border-gold/40 text-ivory hover:text-gold text-xs font-bold rounded-sm transition-all flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                            >
                                <span>Next</span>
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Pop-out Modal Dialog for Full Customer Specs (Portaled to prevent sidebar overlap & responsive for all viewports) */}
            {activeModalCustomer && (
                <Portal>
                    <div 
                        className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto transform-gpu will-change-transform animate-fade-in" 
                        onClick={() => setActiveModalCustomer(null)}
                    >
                        <div 
                            className="max-w-2xl w-full bg-charcoal-light border border-gold/30 rounded-sm shadow-2xl overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col relative my-auto transform-gpu will-change-transform"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/80 to-transparent"></div>

                            {/* Modal Header */}
                            <div className="bg-white/[0.03] px-4 sm:px-6 py-3.5 sm:py-5 border-b border-white/10 flex items-start sm:items-center justify-between gap-3 shrink-0">
                                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-gold/30 via-gold/10 to-transparent border border-gold/40 flex items-center justify-center font-serif text-gold font-bold text-base sm:text-lg shadow-md shrink-0">
                                        {activeModalCustomer.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-base sm:text-lg font-bold text-ivory truncate">{activeModalCustomer.name}</h3>
                                            <span className="text-[10px] font-bold text-gold/80 bg-gold/10 px-2 py-0.5 rounded-full uppercase tracking-wider border border-gold/20 font-mono shrink-0">
                                                {activeModalCustomer.guestRef}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ivory-dim mt-1">
                                            {hasContact(activeModalCustomer.mobile) ? (
                                                <span className="flex items-center gap-1.5 shrink-0">
                                                    <Phone className="w-3.5 h-3.5 text-gold shrink-0" />
                                                    {activeModalCustomer.mobile}
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-[11px] text-ivory-dim/50 italic shrink-0">
                                                    <PhoneOff className="w-3 h-3 text-white/30 shrink-0" />
                                                    <span>{NO_CONTACT_LABEL}</span>
                                                </span>
                                            )}
                                            {activeModalCustomer.email && (
                                                <span className="text-white/40 font-mono text-[11px] truncate max-w-[180px] sm:max-w-none">
                                                    {activeModalCustomer.email}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setActiveModalCustomer(null)}
                                    className="p-1.5 sm:p-2 border border-white/10 hover:bg-white/10 text-ivory-dim hover:text-ivory rounded-sm transition-all cursor-pointer shrink-0"
                                    title="Close dialog"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Scrollable Body */}
                            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar max-h-[calc(92vh-130px)] sm:max-h-[75vh]">
                                
                                {/* Service and Last Visit Row */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                    <div className="bg-gold/5 border border-gold/20 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Calendar className="w-4 h-4 text-gold shrink-0" />
                                            <span className="text-xs font-bold text-ivory">Last Recorded Visit</span>
                                        </div>
                                        <span className="text-xs font-bold text-gold font-mono break-words text-left sm:text-right">
                                            {formatServiceDateTime(activeModalCustomer.lastVisit, activeModalCustomer.visits?.[0]?.time, activeModalCustomer.last_created).fullString}
                                        </span>
                                    </div>

                                    <div className="bg-white/5 border border-white/10 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Scissors className="w-4 h-4 text-gold shrink-0" />
                                            <span className="text-xs font-bold text-ivory">Availed Service</span>
                                        </div>
                                        <span className="text-xs font-bold text-gold break-words text-left sm:text-right">
                                            {activeModalCustomer.service_name || activeModalCustomer.serviceName || activeModalCustomer.visits?.[0]?.service_name || 'Service'}
                                        </span>
                                    </div>
                                </div>

                                {/* Full Side-by-Side Visual Cut Records (With Barber-Themed Fallback UI) */}
                                <div className="space-y-3 pt-2">
                                    <span className="text-[10px] uppercase font-bold text-gold tracking-widest block flex items-center gap-2">
                                        <Camera className="w-4 h-4 text-gold" />
                                        Visual Haircut Archive
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                        {/* Reference Photo Box */}
                                        <div className="space-y-1.5">
                                            <span className="text-[10px] text-ivory-dim block">Customer Reference Photo</span>
                                            {isRealPhoto(activeModalCustomer.refPhoto) ? (
                                                <div className="relative group overflow-hidden border border-white/10 rounded-sm bg-charcoal aspect-video">
                                                    <img 
                                                        src={activeModalCustomer.refPhoto} 
                                                        alt="Reference" 
                                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                                                    />
                                                    <span className="absolute bottom-2 left-2 text-[10px] font-bold text-ivory z-20 bg-charcoal/90 px-2 py-0.5 rounded-xs border border-gold/30">
                                                        Customer Reference
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="border border-dashed border-white/10 bg-charcoal/60 rounded-sm p-4 sm:p-6 flex flex-col items-center justify-center text-center space-y-2 aspect-video group hover:border-gold/30 transition-all">
                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gold/10 border border-gold/25 flex items-center justify-center text-gold shadow-[0_0_15px_rgba(212,175,55,0.15)] group-hover:scale-110 transition-transform">
                                                        <Scissors className="w-5 h-5 text-gold" />
                                                    </div>
                                                    <div>
                                                        <span className="text-xs font-bold text-ivory block">No Reference Photo</span>
                                                        <p className="text-[10px] text-ivory-dim max-w-[220px] mt-0.5 leading-tight">
                                                            Client opted for a direct consultation at the chair without an uploaded reference photo.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Completed Cut Photo Box */}
                                        <div className="space-y-1.5">
                                            <span className="text-[10px] text-ivory-dim block font-bold text-gold">Completed Cut Result</span>
                                            {isRealPhoto(activeModalCustomer.completedPhoto) ? (
                                                <div className="relative group overflow-hidden border border-gold/30 rounded-sm bg-charcoal aspect-video shadow-[0_0_15px_rgba(212,175,55,0.1)]">
                                                    <img 
                                                        src={activeModalCustomer.completedPhoto} 
                                                        alt="Last Cut" 
                                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                                                    />
                                                    <span className="absolute bottom-2 left-2 text-[10px] font-bold text-gold z-20 bg-charcoal/90 px-2 py-0.5 rounded-xs border border-gold/30">
                                                        Last Haircut Photo
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="border border-dashed border-white/10 bg-charcoal/60 rounded-sm p-4 sm:p-6 flex flex-col items-center justify-center text-center space-y-2 aspect-video group hover:border-gold/30 transition-all">
                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gold/10 border border-gold/25 flex items-center justify-center text-gold shadow-[0_0_15px_rgba(212,175,55,0.15)] group-hover:scale-110 transition-transform">
                                                        <Camera className="w-5 h-5 text-gold" />
                                                    </div>
                                                    <div>
                                                        <span className="text-xs font-bold text-ivory block">No Cut Photo Captured</span>
                                                        <p className="text-[10px] text-ivory-dim max-w-[220px] mt-0.5 leading-tight">
                                                            No post-service haircut photo was archived for this client visit.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Previous Visits Log (Accordion) */}
                                {activeModalCustomer.visits && activeModalCustomer.visits.length > 0 && (
                                    <div className="pt-3 border-t border-white/5 space-y-3">
                                        <button
                                            onClick={() => toggleVisits(activeModalCustomer.guestRef)}
                                            className="w-full flex items-center justify-between bg-charcoal p-3 rounded-sm border border-white/5 hover:border-gold/30 text-ivory transition-all cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2 text-xs font-bold text-gold">
                                                <History className="w-4 h-4 shrink-0" />
                                                <span>Previous Visit History ({activeModalCustomer.visits.length})</span>
                                            </div>
                                            {expandedVisits[activeModalCustomer.guestRef] ? (
                                                <ChevronUp className="w-4 h-4 text-ivory-dim shrink-0" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-ivory-dim shrink-0" />
                                            )}
                                        </button>

                                        {expandedVisits[activeModalCustomer.guestRef] && (
                                            <div className="space-y-2 pl-1">
                                                {activeModalCustomer.visits.map((visit, vIdx) => (
                                                    <div key={visit.visit_id || vIdx} className="bg-white/[0.02] border border-white/5 p-3 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-ivory">{visit.service_name}</span>
                                                                {(() => {
                                                                    const badge = getStatusBadge(visit.status);
                                                                    return (
                                                                        <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-sm border ${badge.style}`}>
                                                                            {badge.label}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </div>
                                                            <p className="text-[10px] text-ivory-dim">Served by {visit.barber_name}</p>
                                                        </div>
                                                        <div className="text-left sm:text-right">
                                                            <span className="font-mono text-gold text-xs block font-bold">
                                                                {formatServiceDateTime(visit.date, visit.time).fullString}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                            </div>

                            {/* Modal Footer */}
                            <div className="bg-white/[0.02] px-4 sm:px-6 py-3 sm:py-4 border-t border-white/10 flex justify-end">
                                <button
                                    onClick={() => setActiveModalCustomer(null)}
                                    className="w-full sm:w-auto px-5 py-2.5 bg-gold/10 border border-gold/40 hover:bg-gold hover:text-charcoal text-gold font-bold text-xs rounded-sm transition-all cursor-pointer text-center"
                                >
                                    Close Record
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
};
