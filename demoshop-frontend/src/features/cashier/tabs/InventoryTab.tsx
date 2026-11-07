import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ClipboardCheck,
    LockKeyhole,
    Search,
    X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { useToast } from '@/components/feedback/ToastContext';
import { useAuth } from '@/components/auth/AuthContext';
import { getManilaDateIso } from '@/utils/manila-date';
import InventoryTable, { isNeedsActionItem } from '../components/inventory/InventoryTable';
import StockCountTable from '../components/inventory/StockCountTable';
import type { StockCountShift } from '../components/inventory/StockCountModal';
import { submitStockCount, fetchInventoryView } from '../services/cashier-inventory.service';
import { supabase } from '@/config/supabaseClient';
import type { InventoryCategory, InventoryItem, StockStatus } from '../mock-inventory';
import { PageHeader } from '@/features/inventory-manager/shared/components/PageHeader';
import { loadDailyStockReport } from '@/features/inventory-manager/features/daily-stock-report/stock-report.service';
import { Skeleton } from '@/components/ui/Skeleton';
import { telemetryManager } from '@/utils/adaptive-polling';

type InventoryView = 'all' | 'barber' | 'retail' | 'attention';
type InventoryStatusFilter = 'ALL' | 'NEEDS_ACTION' | 'ALL_GOOD' | StockStatus;

export interface ShiftInfo {
    shift: StockCountShift;
    title: string;
    deadline: string;
}

export const getManilaShift = (now: Date = new Date()): ShiftInfo => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
    if (hour < 12) {
        return { shift: 'morning', title: 'Morning Stock Count', deadline: 'before 10:00 AM' };
    }
    if (hour < 16) {
        return { shift: 'afternoon', title: 'Afternoon Stock Count', deadline: 'before 4:00 PM' };
    }
    return { shift: 'evening', title: 'Evening Stock Count', deadline: 'before close' };
};

const isInventoryView = (value: string | null): value is InventoryView =>
    value === 'all' || value === 'barber' || value === 'retail' || value === 'attention';

const toInventoryItem = (item: any): InventoryItem => {
    const isConsumable = item.category === 'Barber supplies' ||
        item.category === 'barber_supplies' ||
        item.ownership === 'Consumables' ||
        item.ownership === 'Barber-assigned' ||
        item.ownership_type === 'barber_assigned' ||
        item.ownership_type === 'barber_consumables';
    return {
        id: String(item.id),
        name: item.name,
        category: isConsumable ? 'Barber supplies' : 'Customer retail',
        ownership: isConsumable ? 'Consumables' : 'Retail Items',
        assignedBarber: item.assignedBarber,
        unit: item.unit,
        currentStock: Number(item.currentStock) || 0,
        criticalStock: Number(item.criticalStock) || 0,
        safetyStock: Number(item.safetyStock) || 0,
        highVolumeMultiplier: Number(item.highVolumeMultiplier) || 1,
        historyDays: Number(item.historyDays) || 0,
        averageDailyConsumption: Number(item.averageDailyConsumption) || 0,
        weeklyConsumption: Number(item.weeklyConsumption) || 0,
        monthlyConsumption: Number(item.monthlyConsumption) || 0,
        adjustedWeeklyConsumption: Number(item.adjustedWeeklyConsumption) || 0,
        adjustedMonthlyConsumption: Number(item.adjustedMonthlyConsumption) || 0,
        suggestedReplenishment: Number(item.suggestedReplenishment) || 0,
        suggestedWeeklyReplenishment:
            item.suggestedWeeklyReplenishment == null ? null : Number(item.suggestedWeeklyReplenishment),
        suggestedMonthlyReplenishment:
            item.suggestedMonthlyReplenishment == null ? null : Number(item.suggestedMonthlyReplenishment),
        expectedStockOutDate: item.expectedStockOutDate || null,
        daysOfStockRemaining: item.daysOfStockRemaining == null ? null : Number(item.daysOfStockRemaining),
        daysUntilCritical: item.daysUntilCritical == null ? null : Number(item.daysUntilCritical),
        thresholdLevel: item.thresholdLevel == null ? undefined : Number(item.thresholdLevel) as 0 | 1 | 2 | 3,
        forecastAvailable: item.forecastAvailable === true,
        forecastUnavailableReason: item.forecastUnavailableReason || undefined,
        status: item.status,
        stockStatus: item.stockStatus || item.status,
    };
};

const getCountBasedStockStatus = (quantity: number): { status: StockStatus; thresholdLevel: 0 | 1 | 2 | 3 } => {
    if (quantity <= 0) return { status: 'Out of Stock', thresholdLevel: 3 };
    if (quantity < 10) return { status: 'Critically Low', thresholdLevel: 2 };
    if (quantity <= 15) return { status: 'Low Stock', thresholdLevel: 1 };
    return { status: 'In Stock', thresholdLevel: 0 };
};

const aggregateCashierInventory = (items: InventoryItem[]): InventoryItem[] => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
        const key = `${item.ownership}:${item.name.trim().toLowerCase()}:${item.unit.trim().toLowerCase()}`;
        const existing = map.get(key);
        if (existing) {
            existing.currentStock += item.currentStock;
            existing.criticalStock = Math.max(existing.criticalStock || 0, item.criticalStock || 0);
            const combinedSafety = Math.max(existing.safetyStock || 0, item.safetyStock || 0);
            if (combinedSafety > 0) {
                existing.safetyStock = combinedSafety;
            }
            existing.weeklyConsumption = (existing.weeklyConsumption || 0) + (item.weeklyConsumption || 0);
            existing.monthlyConsumption = (existing.monthlyConsumption || 0) + (item.monthlyConsumption || 0);
            const classification = getCountBasedStockStatus(existing.currentStock);
            existing.status = classification.status;
            existing.stockStatus = classification.status;
            existing.thresholdLevel = classification.thresholdLevel;
        } else {
            const classification = getCountBasedStockStatus(item.currentStock);
            map.set(key, { ...item, status: classification.status, stockStatus: classification.status, thresholdLevel: classification.thresholdLevel });
        }
    }
    return Array.from(map.values());
};

interface InventoryTabProps {
    mode?: 'overview' | 'stock-count' | 'daily-report';
}

const InventoryTab: React.FC<InventoryTabProps> = ({ mode = 'overview' }) => {
    const { user } = useAuth();
    const branchId = Number(user?.branch_id);
    const inventoryScope = Number.isInteger(branchId) && branchId > 0 ? String(branchId) : 'current';
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const resultsRef = useRef<HTMLDivElement>(null);
    const activeView: InventoryView = isInventoryView(searchParams.get('view'))
        ? (searchParams.get('view') as InventoryView)
        : 'all';
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<'ALL' | InventoryCategory>('ALL');
    const [itemTypeFilter, setItemTypeFilter] = useState<'ALL' | 'Consumables' | 'Retail Items'>('ALL');
    const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('ALL');
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [morningCounts, setMorningCounts] = useState<Record<string, number>>({});
    const [morningCountsStatus, setMorningCountsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [isCountModalOpen, setIsCountModalOpen] = useState(false);
    const { addToast } = useToast();

    const currentShift = useMemo(() => getManilaShift(), []);
    const [shiftSubmissionTime] = useState<string | null>(() => {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        const key = `demoshop.stock-count.${getManilaDateIso()}.${currentShift.shift}`;
        return localStorage.getItem(key);
    });

    useEffect(() => {
        let cancelled = false;
        let timer: number | null = null;
        let loadInFlight = false;
        let refreshAfterCurrent = false;
        let firstDataReadyReported = false;
        const firstLoadStartedAt = Date.now();
        const loadInventory = async (isInitial = true) => {
            if (loadInFlight) {
                if (!isInitial) refreshAfterCurrent = true;
                return;
            }
            loadInFlight = true;
            if (isInitial) {
                setIsLoading(true);
                setLoadError('');
            }
            try {
                const inventoryResponse = await fetchInventoryView(inventoryScope);
                if (cancelled) return;
                setInventory(aggregateCashierInventory((Array.isArray(inventoryResponse.data) ? inventoryResponse.data : []).map(toInventoryItem)));
                if (!firstDataReadyReported) {
                    firstDataReadyReported = true;
                    telemetryManager.logEvent('cashier_first_data_ready', {
                        flow: 'inventory',
                        durationMs: Date.now() - firstLoadStartedAt,
                    });
                }
            } catch (error: any) {
                if (!cancelled && isInitial) {
                    setLoadError(
                        error?.response?.data?.message ||
                        error?.response?.data?.error ||
                        'Inventory could not be loaded. Please try again.'
                    );
                }
            } finally {
                if (!cancelled && isInitial) setIsLoading(false);
                loadInFlight = false;
                if (!cancelled && refreshAfterCurrent) {
                    refreshAfterCurrent = false;
                    void loadInventory(false);
                }
            }
        };

        const debouncedReload = () => {
            if (timer !== null) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = null;
                if (!cancelled) void loadInventory(false);
            }, 250);
        };
        const refreshOnFocus = () => {
            if (document.visibilityState === 'visible' && navigator.onLine !== false) debouncedReload();
        };

        void loadInventory(true);

        const channel = supabase
            .channel(`inventory-tab-stock-${inventoryScope}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock' }, debouncedReload)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock_movements' }, debouncedReload)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_products' }, debouncedReload)
            .subscribe();

        window.addEventListener('demoshop:inventory-changed', debouncedReload);
        window.addEventListener('focus', refreshOnFocus);
        document.addEventListener('visibilitychange', refreshOnFocus);

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible' && navigator.onLine !== false) void loadInventory(false);
        }, 30000);

        return () => {
            cancelled = true;
            if (timer !== null) window.clearTimeout(timer);
            window.clearInterval(intervalId);
            window.removeEventListener('demoshop:inventory-changed', debouncedReload);
            window.removeEventListener('focus', refreshOnFocus);
            document.removeEventListener('visibilitychange', refreshOnFocus);
            void supabase.removeChannel(channel);
        };
    }, [inventoryScope]);

    useEffect(() => {
        if (mode !== 'stock-count') return;

        let cancelled = false;
        let loadInFlight = false;
        let refreshAfterCurrent = false;

        const loadMorningCounts = async () => {
            if (loadInFlight) {
                refreshAfterCurrent = true;
                return;
            }

            loadInFlight = true;
            setMorningCountsStatus('loading');
            try {
                const response = await loadDailyStockReport(getManilaDateIso());
                if (cancelled) return;

                const nextCounts: Record<string, number> = {};
                (response.data.items || []).forEach((item) => {
                    if (item.openingQuantity != null) {
                        nextCounts[String(item.inventoryStockId)] = Number(item.openingQuantity);
                    }
                });
                setMorningCounts(nextCounts);
                setMorningCountsStatus('ready');
            } catch {
                if (!cancelled) {
                    setMorningCounts({});
                    setMorningCountsStatus('error');
                }
            } finally {
                loadInFlight = false;
                if (!cancelled && refreshAfterCurrent) {
                    refreshAfterCurrent = false;
                    void loadMorningCounts();
                }
            }
        };

        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible' && navigator.onLine !== false) {
                void loadMorningCounts();
            }
        };

        const countChannel = supabase
            .channel(`inventory-stock-counts-${inventoryScope}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'inventory_stock_count_submissions',
                ...(Number.isInteger(branchId) && branchId > 0 ? { filter: `branch_id=eq.${branchId}` } : {}),
            }, loadMorningCounts)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'inventory_stock_count_lines',
            }, loadMorningCounts)
            .subscribe();

        void loadMorningCounts();
        window.addEventListener('demoshop:stock-count-changed', loadMorningCounts);
        window.addEventListener('focus', refreshWhenVisible);
        document.addEventListener('visibilitychange', refreshWhenVisible);

        return () => {
            cancelled = true;
            window.removeEventListener('demoshop:stock-count-changed', loadMorningCounts);
            window.removeEventListener('focus', refreshWhenVisible);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
            void supabase.removeChannel(countChannel);
        };
    }, [branchId, inventoryScope, mode]);

    useEffect(() => {
        setSearchTerm('');
        setItemTypeFilter('ALL');
        setCategoryFilter(activeView === 'barber' ? 'Barber supplies' : activeView === 'retail' ? 'Customer retail' : 'ALL');
        setStatusFilter(activeView === 'attention' ? 'NEEDS_ACTION' : 'ALL');
    }, [activeView]);

    const hasActiveFilters =
        searchTerm.trim() !== '' || categoryFilter !== 'ALL' || itemTypeFilter !== 'ALL' || statusFilter !== 'ALL';

    const clearFilters = () => {
        setSearchTerm('');
        setItemTypeFilter('ALL');
        setCategoryFilter('ALL');
        setStatusFilter('ALL');
        setSearchParams({}, { replace: true });
    };

    const filteredItems = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return inventory.filter((item) => {
            const matchesSearch =
                !normalizedSearch ||
                [item.name, item.category, item.ownership].some((value) =>
                    value.toLowerCase().includes(normalizedSearch)
                );
            const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
            const matchesItemType = itemTypeFilter === 'ALL' || item.ownership === itemTypeFilter;
            const needsAction = isNeedsActionItem(item);
            const matchesStatus =
                statusFilter === 'ALL' ||
                (statusFilter === 'NEEDS_ACTION'
                    ? needsAction
                    : statusFilter === 'ALL_GOOD'
                        ? !needsAction
                        : (item.stockStatus || item.status) === statusFilter);
            return matchesSearch && matchesCategory && matchesItemType && matchesStatus;
        });
    }, [categoryFilter, itemTypeFilter, inventory, searchTerm, statusFilter]);

    // Restocking is handled through the purchase-order workflow. Items that need
    // attention link the Inventory Manager to the Stock Requests tab.
    const goToPurchaseOrders = (item: InventoryItem) => {
        navigate(`/inventory-manager/purchase-orders?item=${encodeURIComponent(item.id)}`);
    };

    const handleStockCount = async (values: {
        shift: StockCountShift;
        notes: string;
        lines: Array<{ inventoryStockId: number; countedQuantity: number }>;
    }): Promise<boolean> => {
        try {
            const countDate = getManilaDateIso();
            await submitStockCount({ countDate, shift: values.shift, notes: values.notes, lines: values.lines });
            addToast({
                type: 'success',
                title: 'Stock count submitted',
                message: 'The count is awaiting Owner/Admin review and has not changed authoritative stock.',
            });
            window.dispatchEvent(new Event('demoshop:inventory-changed'));
            window.dispatchEvent(new Event('demoshop:stock-count-changed'));
            return true;
        } catch (error: any) {
            addToast({
                type: 'error',
                title: 'Stock count could not be submitted',
                message:
                    error?.response?.data?.message ||
                    error?.response?.data?.error ||
                    'Please review the count and try again.',
            });
            return false;
        }
    };

    return (
        <section className="space-y-6">
            <PageHeader
                eyebrow="Stock Overview"
                title={mode === 'stock-count' ? 'Stock Count' : 'Stock List'}
                description={mode === 'stock-count'
                    ? 'Submit morning and evening physical stock counts. Counts are sent to Owner/Admin to review.'
                    : 'Monitor stock levels. Submit physical counts from the Stock Count tab. Replenishment is handled through the Stock Requests tab.'}
            />

            {false && (<>
                {/* Shift Stock Count Banner (Area 2 - Prominent, shift-aware) */}
                <div
                    className={`flex flex-col justify-between gap-4 rounded-lg border p-5 shadow-xl md:flex-row md:items-center ${shiftSubmissionTime ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-gold/30 bg-gold/5'
                        }`}
                >
                    <div className="flex items-start gap-3.5">
                        <ClipboardCheck
                            className={`mt-0.5 h-6 w-6 shrink-0 ${shiftSubmissionTime ? 'text-emerald-400' : 'text-gold'}`}
                        />
                        <div>
                            <p className="text-sm font-bold uppercase tracking-wider text-ivory">
                                {shiftSubmissionTime
                                    ? `📋 ${currentShift.title} — Submitted ✅`
                                    : `📋 ${currentShift.title.toUpperCase()} — NOT YET SUBMITTED`}
                            </p>
                            <p className="mt-1 text-xs text-ivory-dim">
                                {shiftSubmissionTime
                                    ? `Recorded today at ${new Date(shiftSubmissionTime || '').toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}.`
                                    : `Submit your physical count ${currentShift.deadline} to keep stock tracking accurate.`}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsCountModalOpen(true)}
                        disabled={isLoading || inventory.length === 0}
                        className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded border border-gold bg-gold/10 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gold transition-colors hover:bg-gold hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {shiftSubmissionTime ? 'Submit Another Count →' : 'Submit Stock Count →'}
                    </button>
                </div>
            </>)}

            {isLoading && (
                <div className="space-y-3" role="status" aria-label="Loading inventory" aria-busy="true">
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[104px] w-full rounded-lg" />)}
                    </div>
                    {[0, 1, 2].map((index) => <Skeleton key={index} className="h-14 w-full rounded-lg" />)}
                </div>
            )}
            {loadError && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200" role="alert">
                    {loadError}
                </div>
            )}

            {mode === 'overview' && !isLoading && <>
                <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="block w-full sm:w-56">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gold">Search stock</span>
                            <span className="relative block">
                                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
                                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search product or supply..." className="h-9 w-full rounded-sm border border-white/10 bg-charcoal pl-8 pr-3 text-xs text-ivory placeholder:text-ivory-dim/60 focus:outline-none focus:ring-1 focus:ring-gold" />
                            </span>
                        </label>
                        <div className="min-w-0 flex-1">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gold">Filter by status</span>
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stock status">
                                {(['ALL', 'NEEDS_ACTION', 'Out of Stock', 'Critically Low', 'Low Stock', 'In Stock'] as const).map((status) => {
                                    const count = inventory.filter((item) => (categoryFilter === 'ALL' || item.category === categoryFilter) && (itemTypeFilter === 'ALL' || item.ownership === itemTypeFilter) && (status === 'ALL' || (status === 'NEEDS_ACTION' ? isNeedsActionItem(item) : (item.stockStatus || item.status) === status))).length;
                                    const active = statusFilter === status;
                                    return <button key={status} type="button" aria-pressed={active} onClick={() => setStatusFilter(status)} className={`inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold ${active ? 'border-gold bg-gold text-charcoal' : 'border-white/10 bg-charcoal text-ivory-dim hover:border-gold/40 hover:text-ivory'}`}>
                                        {status === 'ALL' ? 'All' : status === 'NEEDS_ACTION' ? 'Needs Attention' : status}
                                        <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-charcoal/20 text-charcoal' : 'bg-white/10 text-ivory-dim'}`}>{count}</span>
                                    </button>;
                                })}
                            </div>
                        </div>
                        <label className="block w-full sm:ml-auto sm:w-52">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gold">Where to be used</span>
                            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'ALL' | InventoryCategory)} className="h-9 w-full rounded-sm border border-gold/30 bg-charcoal px-3 text-xs text-ivory focus:outline-none focus:ring-1 focus:ring-gold">
                                <option value="ALL">All uses</option>
                                <option value="Barber supplies">Barber services</option>
                                <option value="Customer retail">Customer retail</option>
                            </select>
                        </label>
                        <label className="block w-full sm:w-44">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gold">Item type</span>
                            <select value={itemTypeFilter} onChange={(event) => setItemTypeFilter(event.target.value as 'ALL' | 'Consumables' | 'Retail Items')} className="h-9 w-full rounded-sm border border-gold/30 bg-charcoal px-3 text-xs text-ivory focus:outline-none focus:ring-1 focus:ring-gold">
                                <option value="ALL">All item types</option>
                                <option value="Consumables">Consumables</option>
                                <option value="Retail Items">Retail items</option>
                            </select>
                        </label>
                    </div>
                    {hasActiveFilters && <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/5 pt-2">
                        <span className="text-[11px] text-ivory-dim">Showing {filteredItems.length} of {inventory.length} items</span>
                        <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-semibold text-gold hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"><X aria-hidden="true" className="h-3 w-3" />Clear filters</button>
                    </div>}
                </div>
                {/* Filtered inventory results share one stock table. */}
                <div ref={resultsRef} className="scroll-mt-24">
                    <InventoryTable items={filteredItems} onCreatePurchaseOrder={goToPurchaseOrders} />
                </div>
            </>}

            {mode === 'stock-count' && !isLoading && (
                <StockCountTable
                    items={inventory}
                    morningCounts={morningCounts}
                    morningCountsStatus={morningCountsStatus}
                    onSubmit={handleStockCount}
                />
            )}
        </section>
    );
};

export default InventoryTab;
