import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router';
import {
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    FileDown,
    Info,
    Layers,
    Package,
    RefreshCw,
    Search,
    ShieldAlert,
} from 'lucide-react';
import type {
    BarberCommissionResponse,
    InventoryReportItem,
    InventoryReportResponse,
    InventoryReportSummary,
    InventoryVarianceItem,
    SalesReportResponse,
} from '@demoshop/shared-types';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';
import { useAuth } from '@/components/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { getManilaDateIso } from '@/utils/manila-date';
import { downloadReportPdf } from '@/features/admin/components/Reports/report-pdf';
import { PrintReportFooter, PrintReportHeader } from '@/features/admin/components/Reports/PrintReportHeader';
import { AuditLogsTable } from '@/features/admin/components/AuditLogs/AuditLogsTable';
import { ReportSubHeaderNav } from '@/features/admin/components/Reports/ReportSubHeaderNav';
import { useInventoryReport } from '@/features/admin/components/Reports/useInventoryReport';
import { TransactionHistoryTab } from '@/features/admin/tabs/TransactionHistoryTab';

const SalesBreakdown = React.lazy(() =>
    import('@/features/admin/components/Reports/SalesBreakdown').then((module) => ({ default: module.SalesBreakdown }))
);
const BarberCommissions = React.lazy(() =>
    import('@/features/admin/components/Reports/BarberCommissions').then((module) => ({ default: module.BarberCommissions }))
);
const AppointmentsTab = React.lazy(() =>
    import('@/features/admin/tabs/AppointmentsTab').then((module) => ({ default: module.AppointmentsTab }))
);

type PeriodPreset = 'all' | 'today' | 'this_week' | 'last_7_days' | 'this_month' | 'custom';
type ReportDisplayMode = 'units' | 'value';
type InventoryReportSection = 'stock-value' | 'items-tracked' | 'running-low' | 'stock-changes' | 'ledger' | 'variances';

const getInventoryReportSection = (value: string | null): InventoryReportSection => {
    if (value === 'stock-value') return 'stock-value';
    if (value === 'running-low') return 'running-low';
    if (value === 'stock-changes' || value === 'variances') return 'stock-changes';
    if (value === 'items-tracked' || value === 'ledger') return 'items-tracked';
    return 'items-tracked';
};
export type MainReportMode = 'transactions' | 'sales' | 'commissions' | 'inventory' | 'appointments' | 'audit-logs' | 'account-security';

const REPORT_PRINT_TITLES: Record<MainReportMode, string> = {
    transactions: 'Transaction History & Financial Ledger',
    sales: 'Sales Breakdown & Revenue Report',
    commissions: 'Barber Commission Report',
    inventory: 'Inventory Report',
    appointments: 'Reservation History',
    'audit-logs': 'System Audit Logs Report',
    'account-security': 'System Audit Logs Report',
};

const REPORT_HEADER_DATA: Record<MainReportMode, { tag: string; title: string; description: string }> = {
    transactions: {
        tag: 'Shop Admin • Transactions',
        title: 'Transaction History',
        description: 'Review payments and recorded transactions.',
    },
    sales: {
        tag: 'Shop Admin • Sales Breakdown',
        title: 'Sales Breakdown',
        description: 'See sales performance over time.',
    },
    commissions: {
        tag: 'Shop Admin • Commissions',
        title: 'Barber Commissions',
        description: 'Review barber commission earnings and service totals.',
    },
    inventory: {
        tag: 'Shop Admin • Stock Reports',
        title: 'Inventory Report',
        description: 'See stock received, estimated use, and count differences for your chosen dates.',
    },
    appointments: {
        tag: 'Shop Admin • Reservations',
        title: 'Reservation History',
        description: 'Review completed, canceled, and unresolved reservations.',
    },
    'audit-logs': {
        tag: 'Shop Admin • Audit Ledger',
        title: 'Audit Logs',
        description: 'Review important shop, staff, and account activities.',
    },
    'account-security': {
        tag: 'Shop Admin • Audit Ledger',
        title: 'Audit Logs',
        description: 'Review important shop, staff, and account activities.',
    },
};

const getReportPeriod = (preset: PeriodPreset): 'daily' | 'weekly' | 'custom' => (
    preset === 'today' ? 'daily' : preset === 'this_week' || preset === 'last_7_days' ? 'weekly' : 'custom'
);

const formatReportDate = (value: string) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
}).format(new Date(`${value}T00:00:00+08:00`));

const getReportDateFilterLabel = (preset: PeriodPreset, startDate: string, endDate: string) => {
    if (preset === 'all') {
        return 'All Time';
    }
    if (preset === 'custom') {
        return `the range of ${formatReportDate(startDate)} - ${formatReportDate(endDate)}`;
    }

    return {
        all: 'All Time',
        today: 'Today',
        this_week: 'This Week',
        last_7_days: 'Last 7 Days',
        this_month: 'This Month',
        custom: 'the selected range',
    }[preset];
};

const getPresetDates = (preset: PeriodPreset): { startDate: string; endDate: string } => {
    const today = getManilaDateIso();
    const todayDate = new Date(`${today}T00:00:00+08:00`);

    if (preset === 'all') {
        return { startDate: '2020-01-01', endDate: today };
    }

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

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
);

const reportArrayFields = ['items', 'variances', 'movements'] as const;
const reportSummaryStringFields = ['startDate', 'endDate', 'period'] as const;
const reportSummaryNumberFields = [
    'activeTrackedSkuCount',
    'atRiskSkuCount',
    'totalMovementCount',
    'totalOpeningValue',
    'totalReceiptsValue',
    'totalEstimatedConsumptionValue',
    'totalCountCorrectionsValue',
    'totalManualAdjustmentsValue',
    'totalClosingValue',
] as const;

const parseInventoryReportResponse = (payload: unknown): InventoryReportResponse => {
    const candidate = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    if (!isRecord(candidate)) {
        throw new Error('Inventory report response is missing summary data.');
    }
    const summary = candidate.summary;
    if (!isRecord(summary)) {
        throw new Error('Inventory report response is missing summary data.');
    }

    const missingArray = reportArrayFields.find((field) => !Array.isArray(candidate[field]));
    if (missingArray) {
        throw new Error(`Inventory report response is missing ${missingArray} data.`);
    }

    const missingString = reportSummaryStringFields.find((field) => typeof summary[field] !== 'string');
    if (missingString) {
        throw new Error(`Inventory report response is missing summary.${missingString}.`);
    }

    const missingNumber = reportSummaryNumberFields.find((field) => typeof summary[field] !== 'number');
    if (missingNumber) {
        throw new Error(`Inventory report response is missing summary.${missingNumber}.`);
    }

    return candidate as unknown as InventoryReportResponse;
};

const inventoryStockStatusBadgeClasses: Record<string, string> = {
    'Out of Stock': 'border-red-400/30 bg-red-400/10 text-red-300',
    'Critically Low': 'border-rose-400/30 bg-rose-400/10 text-rose-300',
    'Low Stock': 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    'In Stock': 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    Critical: 'border-red-400/30 bg-red-400/10 text-red-300',
    Low: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    Normal: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    Overstock: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
};

const isLowInventoryStockStatus = (status: string): boolean => (
    status === 'Out of Stock' || status === 'Critically Low' || status === 'Low Stock' || status === 'Critical' || status === 'Low'
);

const parseSalesReportResponse = (payload: unknown): SalesReportResponse => {
    const candidate = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    if (!isRecord(candidate) || !isRecord(candidate.summary)) {
        throw new Error('Sales report response is missing summary data.');
    }
    return {
        summary: candidate.summary as unknown as SalesReportResponse['summary'],
        timeline: Array.isArray(candidate.timeline) ? candidate.timeline as SalesReportResponse['timeline'] : [],
        transactions: Array.isArray(candidate.transactions) ? candidate.transactions as SalesReportResponse['transactions'] : [],
    };
};

const parseCommissionResponse = (payload: unknown): BarberCommissionResponse => {
    const candidate = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    if (!isRecord(candidate) || !isRecord(candidate.summary)) {
        throw new Error('Commission report response is missing summary data.');
    }
    return {
        summary: candidate.summary as unknown as BarberCommissionResponse['summary'],
        barbers: Array.isArray(candidate.barbers) ? candidate.barbers as BarberCommissionResponse['barbers'] : [],
    };
};

const getReportErrorMessage = (error: unknown, defaultMessage = 'Failed to load report.'): string => {
    if (!isRecord(error)) return defaultMessage;

    const response = isRecord(error.response) ? error.response : undefined;
    const responseData = response?.data;
    if (typeof responseData === 'string' && responseData.trim()) return responseData;

    if (isRecord(responseData)) {
        const nestedDetails = isRecord(responseData.details) ? responseData.details : undefined;
        const message = [responseData.message, responseData.error, nestedDetails?.message]
            .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
        if (message) return message;
    }

    return typeof error.message === 'string' && error.message.trim() ? error.message : defaultMessage;
};

const formatTimestamp = (value?: string) => value ? new Date(value).toLocaleString() : '—';
const formatNumber = (value: number) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const formatCurrency = (value: number) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}).format(Number(value || 0));
const formatSignedCurrency = (value: number) => `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
const formatSignedNumber = (value: number) => `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`;

const ReportLoadingSkeleton: React.FC<{ label: string }> = ({ label }) => (
    <div className="space-y-4" role="status" aria-label={label}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-white/10 bg-charcoal-light p-3">
                    <Skeleton variant="text" className="h-3 w-28" />
                    <Skeleton variant="text" className="mt-3 h-7 w-36" />
                    <Skeleton variant="text" className="mt-2 h-3 w-44" />
                </div>
            ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-white/10 bg-charcoal-light p-4">
                    <Skeleton variant="text" className="h-4 w-48" />
                    <Skeleton variant="text" className="mt-2 h-3 w-64" />
                    <Skeleton className="mt-4 h-[280px] w-full" />
                </div>
            ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-white/10 bg-charcoal-light p-4">
            <Skeleton variant="text" className="h-4 w-52" />
            <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} variant="text" className="h-8 w-full" />
                ))}
            </div>
        </div>
    </div>
);

const renderMetric = (
    value: number | null | undefined,
    formatter: (normalizedValue: number) => string,
    activeClass: string,
): React.ReactNode => {
    const normalizedValue = Number(value || 0);
    return (
        <span className={normalizedValue === 0 ? 'text-ivory-dim' : activeClass}>
            {normalizedValue === 0 ? '—' : formatter(normalizedValue)}
        </span>
    );
};

const renderStockCount = (value: number | null, unit?: string, activeClass = 'text-ivory'): React.ReactNode => (
    <span className={value == null ? 'text-ivory-dim' : value === 0 ? 'text-red-300' : activeClass}>
        {value == null ? '—' : `${formatNumber(value)}${unit ? ` ${unit}` : ''}`}
    </span>
);

export interface ReportsTabProps {
    activeSubTab?: string;
    onSelectSubTab?: (subTab: string) => void;
    activeMode?: MainReportMode;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
    activeSubTab,
    onSelectSubTab,
    activeMode,
}) => {
    const { user, role } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const REPORT_MODES: MainReportMode[] = ['transactions', 'sales', 'commissions', 'inventory', 'appointments', 'audit-logs', 'account-security'];
    const effectiveSubTab = (activeSubTab === 'reports-transactions' ? 'transactions' : activeSubTab) || activeMode;
    const rawParamMode = searchParams.get('subtab') || searchParams.get('report');
    const paramMode = (rawParamMode === 'reports-transactions' ? 'transactions' : rawParamMode) as MainReportMode | null;
    const initialView: MainReportMode = (effectiveSubTab && REPORT_MODES.includes(effectiveSubTab as MainReportMode))
        ? (effectiveSubTab as MainReportMode)
        : (paramMode && REPORT_MODES.includes(paramMode))
            ? paramMode
            : 'transactions';

    const [mainMode, setMainMode] = useState<MainReportMode>(initialView);

    useEffect(() => {
        if (activeMode && REPORT_MODES.includes(activeMode)) {
            setMainMode(activeMode);
        }
    }, [activeMode]);
    const urlStartDate = searchParams.get('startDate');
    const urlEndDate = searchParams.get('endDate');
    const urlPreset = searchParams.get('preset') as PeriodPreset | null;

    const initialPreset: PeriodPreset = urlPreset && ['all', 'today', 'this_week', 'last_7_days', 'this_month', 'custom'].includes(urlPreset)
        ? urlPreset
        : (urlStartDate || urlEndDate ? 'custom' : 'all');
    const initialDates = getPresetDates(initialPreset);

    const [preset, setPreset] = useState<PeriodPreset>(initialPreset);
    const [startDate, setStartDate] = useState(urlStartDate || initialDates.startDate);
    const [endDate, setEndDate] = useState(urlEndDate || initialDates.endDate);

    useEffect(() => {
        const pStartDate = searchParams.get('startDate');
        const pEndDate = searchParams.get('endDate');
        const pPreset = searchParams.get('preset') as PeriodPreset | null;

        if (pStartDate || pEndDate) {
            setPreset('custom');
            if (pStartDate) setStartDate(pStartDate);
            if (pEndDate) setEndDate(pEndDate);
        } else if (pPreset && ['all', 'today', 'this_week', 'last_7_days', 'this_month', 'custom'].includes(pPreset)) {
            setPreset(pPreset);
            if (pPreset !== 'custom') {
                const dates = getPresetDates(pPreset);
                setStartDate(dates.startDate);
                setEndDate(dates.endDate);
            }
        }
    }, [searchParams]);

    useEffect(() => {
        const normalized = activeSubTab === 'reports-transactions' ? 'transactions' : activeSubTab;
        if (normalized && REPORT_MODES.includes(normalized as MainReportMode)) {
            setMainMode(normalized as MainReportMode);
        }
    }, [activeSubTab]);

    const [inventorySearchTerm, setInventorySearchTerm] = useState('');
    const [inventoryActiveSection, setInventoryActiveSection] = useState<InventoryReportSection>(
        () => getInventoryReportSection(searchParams.get('inventorySection')),
    );
    const [inventoryPage, setInventoryPage] = useState(1);
    const [inventoryPrinting, setInventoryPrinting] = useState(false);
    const [displayMode, setDisplayMode] = useState<ReportDisplayMode>('units');
    const [isFormulaOpen, setIsFormulaOpen] = useState(false);
    const [expandedInventoryItemIds, setExpandedInventoryItemIds] = useState<Set<string>>(new Set());
    const inventory = useInventoryReport({
        active: mainMode === 'inventory',
        startDate,
        endDate,
        period: getReportPeriod(preset),
        showCountDifferences: inventoryActiveSection === 'stock-changes' || inventoryActiveSection === 'variances',
        parseReport: parseInventoryReportResponse,
    });
    const { report: inventoryReport, loading: inventoryLoading, error: inventoryError, refresh: refreshInventory } = inventory;

    useEffect(() => {
        const resolved = getInventoryReportSection(searchParams.get('inventorySection'));
        setInventoryActiveSection(resolved);
        if (resolved === 'stock-value') {
            setDisplayMode('value');
        } else if (resolved === 'items-tracked' || resolved === 'ledger') {
            setDisplayMode('units');
        }
    }, [searchParams]);

    const selectInventorySection = (section: InventoryReportSection) => {
        setInventoryActiveSection(section);
        setInventoryPage(1);
        if (section === 'stock-value') {
            setDisplayMode('value');
        } else if (section === 'items-tracked' || section === 'ledger') {
            setDisplayMode('units');
        }
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            if (section === 'items-tracked' || section === 'ledger') next.delete('inventorySection');
            else next.set('inventorySection', section);
            return next;
        }, { replace: true });
    };

    const toggleInventoryItemExpand = (stockId: string) => {
        setExpandedInventoryItemIds((prev) => {
            const next = new Set(prev);
            if (next.has(stockId)) {
                next.delete(stockId);
            } else {
                next.add(stockId);
            }
            return next;
        });
    };

    const [salesReport, setSalesReport] = useState<SalesReportResponse | null>(null);
    const [commissionReport, setCommissionReport] = useState<BarberCommissionResponse | null>(null);
    const [salesLoading, setSalesLoading] = useState(false);
    const [salesError, setSalesError] = useState('');
    const [commissionsLoading, setCommissionsLoading] = useState(false);
    const [commissionsError, setCommissionsError] = useState('');
    const [pdfDownloading, setPdfDownloading] = useState(false);
    const [pdfError, setPdfError] = useState('');

    const loadControllerRef = useRef<AbortController | null>(null);
    const formulaPopoverRef = useRef<HTMLDivElement>(null);

    const handleMainModeChange = (mode: MainReportMode) => {
        setMainMode(mode);
        onSelectSubTab?.(mode);
        const newParams = new URLSearchParams(searchParams);
        newParams.set('tab', 'reports');
        newParams.set('subtab', mode);
        newParams.delete('report');
        setSearchParams(newParams, { replace: true });
    };

    const loadSalesReport = useCallback(async (start: string, end: string, silent = false) => {
        if (!silent) {
            loadControllerRef.current?.abort();
            setSalesLoading(true);
            setSalesError('');
        }
        const controller = new AbortController();
        if (!silent) {
            loadControllerRef.current = controller;
        }

        try {
            const salesRes = await api.get<unknown>('/api/admin/reports/sales', {
                params: { startDate: start, endDate: end },
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setSalesReport(parseSalesReportResponse(salesRes.data));
            setSalesError('');
        } catch (err: unknown) {
            if (controller.signal.aborted || (isRecord(err) && err.code === 'ERR_CANCELED')) return;
            if (!silent) {
                console.error('[ReportsTab] Sales report request failed:', err);
                setSalesError(getReportErrorMessage(err, 'Failed to load sales report.'));
            } else {
                console.warn('[ReportsTab] Silent sales refresh failed:', err);
            }
        } finally {
            if (!silent && loadControllerRef.current === controller) {
                loadControllerRef.current = null;
                if (!controller.signal.aborted) setSalesLoading(false);
            }
        }
    }, []);

    const loadCommissionReport = useCallback(async (start: string, end: string, silent = false) => {
        if (!silent) {
            loadControllerRef.current?.abort();
            setCommissionsLoading(true);
            setCommissionsError('');
        }
        const controller = new AbortController();
        if (!silent) {
            loadControllerRef.current = controller;
        }

        try {
            const commsRes = await api.get<unknown>('/api/admin/reports/commissions', {
                params: { startDate: start, endDate: end },
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setCommissionReport(parseCommissionResponse(commsRes.data));
            setCommissionsError('');
        } catch (err: unknown) {
            if (controller.signal.aborted || (isRecord(err) && err.code === 'ERR_CANCELED')) return;
            if (!silent) {
                console.error('[ReportsTab] Commission report request failed:', err);
                setCommissionsError(getReportErrorMessage(err, 'Failed to load commission report.'));
            } else {
                console.warn('[ReportsTab] Silent commission refresh failed:', err);
            }
        } finally {
            if (!silent && loadControllerRef.current === controller) {
                loadControllerRef.current = null;
                if (!controller.signal.aborted) setCommissionsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (mainMode === 'sales') {
            void loadSalesReport(startDate, endDate);
        } else if (mainMode === 'commissions') {
            void loadCommissionReport(startDate, endDate);
        }
    }, [mainMode, startDate, endDate, preset, loadSalesReport, loadCommissionReport]);

    useEffect(() => {
        if (!isFormulaOpen) return undefined;
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (!formulaPopoverRef.current?.contains(event.target as Node)) setIsFormulaOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsFormulaOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isFormulaOpen]);

    const handlePresetChange = (newPreset: PeriodPreset) => {
        setPreset(newPreset);
        if (newPreset !== 'custom') {
            const dates = getPresetDates(newPreset);
            setStartDate(dates.startDate);
            setEndDate(dates.endDate);
        }
    };

    const handleRefresh = useCallback((silent = false) => {
        if (mainMode === 'inventory') {
            void refreshInventory(silent);
        } else if (mainMode === 'sales') {
            void loadSalesReport(startDate, endDate, silent);
        } else if (mainMode === 'commissions') {
            void loadCommissionReport(startDate, endDate, silent);
        }
    }, [endDate, loadCommissionReport, refreshInventory, loadSalesReport, mainMode, preset, startDate]);

    // Existing synchronization for the other report modes; inventory, appointments, audit-logs, and account-security use their own dedicated synchronization.
    useEffect(() => {
        if (mainMode === 'inventory' || mainMode === 'appointments' || mainMode === 'audit-logs' || mainMode === 'account-security') return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const debouncedRefresh = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                handleRefresh(true);
            }, 300);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                debouncedRefresh();
            }
        };
        const handleWindowFocus = () => debouncedRefresh();

        const localEvents = [
            'demoshop:inventory-changed',
            'demoshop:stock-count-changed',
            'demoshop:purchase-orders-changed',
            'demoshop:bottle-lifecycle-changed',
            'demoshop:suppliers-changed',
            'demoshop:queue-updated',
            'demoshop:staff-changed',
            'demoshop:reservations-changed',
            'storage',
        ];
        localEvents.forEach((evt) => window.addEventListener(evt, debouncedRefresh));
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);

        const channel = supabase
            .channel(`reports-realtime-sync-${mainMode}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_consumption' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock_movements' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_restock_requests' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock_count_submissions' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, debouncedRefresh)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    debouncedRefresh();
                }
            });

        // Background polling heartbeat (every 10s when active) to guarantee live data without manual refresh
        pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                debouncedRefresh();
            }
        }, 10_000);

        return () => {
            localEvents.forEach((evt) => window.removeEventListener(evt, debouncedRefresh));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleWindowFocus);
            if (timer) clearTimeout(timer);
            if (pollInterval) clearInterval(pollInterval);
            void supabase.removeChannel(channel).catch(() => { });
        };
    }, [handleRefresh, mainMode]);

    const preparedBy = user?.username || user?.email || role || 'Shop Admin';
    const dateFilterLabel = getReportDateFilterLabel(preset, startDate, endDate);

    const filteredInventoryItems = useMemo(() => {
        if (!inventoryReport?.items) return [];
        const term = inventorySearchTerm.trim().toLowerCase();
        if (!term) return inventoryReport.items;
        return inventoryReport.items.filter((item: InventoryReportItem) =>
            item.name.toLowerCase().includes(term)
            || item.category.toLowerCase().includes(term)
            || (item.ownership && item.ownership.toLowerCase().includes(term))
        );
    }, [inventoryReport?.items, inventorySearchTerm]);

    const inventorySummary: InventoryReportSummary | undefined = inventoryReport?.summary;

    const lowStockItems = useMemo(() => {
        return filteredInventoryItems.filter(
            (item: InventoryReportItem) => isLowInventoryStockStatus(item.stockStatus)
        );
    }, [filteredInventoryItems]);

    const inventoryRowCount = (inventoryActiveSection === 'stock-value' || inventoryActiveSection === 'items-tracked' || inventoryActiveSection === 'ledger')
        ? filteredInventoryItems.length
        : inventoryActiveSection === 'running-low'
            ? lowStockItems.length
            : (inventoryActiveSection === 'stock-changes' || inventoryActiveSection === 'variances')
                ? (inventory.variances?.length ?? 0)
                : 0;
    const inventoryPageCount = Math.max(1, Math.ceil(inventoryRowCount / 15));
    const currentInventoryPage = Math.min(inventoryPage, inventoryPageCount);
    const inventoryPageOffset = (currentInventoryPage - 1) * 15;
    const visibleInventoryItems = inventoryPrinting ? filteredInventoryItems : filteredInventoryItems.slice(inventoryPageOffset, inventoryPageOffset + 15);
    const visibleRunningLowItems = inventoryPrinting ? lowStockItems : lowStockItems.slice(inventoryPageOffset, inventoryPageOffset + 15);
    const visibleCountDifferences = inventoryPrinting ? (inventory.variances ?? []) : (inventory.variances ?? []).slice(inventoryPageOffset, inventoryPageOffset + 15);

    useEffect(() => {
        if (mainMode !== 'inventory') return;
        const beforePrint = () => flushSync(() => setInventoryPrinting(true));
        const afterPrint = () => setInventoryPrinting(false);
        window.addEventListener('beforeprint', beforePrint);
        window.addEventListener('afterprint', afterPrint);
        return () => {
            window.removeEventListener('beforeprint', beforePrint);
            window.removeEventListener('afterprint', afterPrint);
        };
    }, [mainMode]);

    useEffect(() => {
        setInventoryPage(1);
    }, [startDate, endDate, inventorySearchTerm, inventoryActiveSection]);

    const isLoading = mainMode === 'inventory'
        ? inventoryLoading && !inventoryReport
        : mainMode === 'sales'
            ? salesLoading
            : mainMode === 'commissions'
                ? commissionsLoading
                : false;
    const currentError = mainMode === 'inventory'
        ? inventoryError
        : mainMode === 'sales'
            ? salesError
            : mainMode === 'commissions'
                ? commissionsError
                : '';

    const canDownloadPdf = !isLoading && !currentError && (
        (mainMode === 'inventory' && Boolean(inventoryReport))
        || (mainMode === 'sales' && Boolean(salesReport))
        || (mainMode === 'commissions' && Boolean(commissionReport))
    );

    const handleDownloadPdf = () => {
        if (pdfDownloading || !canDownloadPdf) return;
        setPdfError('');
        setPdfDownloading(true);
        const context = { startDate, endDate, preparedBy };
        const task = mainMode === 'sales' && salesReport
            ? downloadReportPdf({ kind: 'sales', report: salesReport, ...context })
            : mainMode === 'commissions' && commissionReport
                ? downloadReportPdf({ kind: 'commissions', report: commissionReport, ...context })
                : inventoryReport
                    ? api.get<unknown>('/api/inventory/reports', {
                        params: { startDate, endDate, period: getReportPeriod(preset) },
                    }).then((response) => downloadReportPdf({ kind: 'inventory', report: parseInventoryReportResponse(response.data), displayMode, ...context }))
                    : Promise.reject(new Error('No report data is available to export.'));

        void task.catch((error: unknown) => {
            setPdfError(mainMode === 'inventory' ? 'We couldn’t prepare the PDF. Please try again.' : getReportErrorMessage(error, 'Failed to generate the PDF report.'));
        }).finally(() => {
            setPdfDownloading(false);
        });
    };

    return (
        <section className={`print-report min-h-0 flex flex-col gap-3 print:overflow-visible print:h-auto print:p-0 custom-scrollbar pb-24 sm:pb-28 lg:pb-6 touch-pan-y [-webkit-overflow-scrolling:touch] ${mainMode === 'inventory' || mainMode === 'appointments' || mainMode === 'commissions' ? 'h-auto overflow-visible' : 'h-full overflow-y-auto lg:overflow-hidden'}`}>
            <PrintReportHeader
                title={REPORT_PRINT_TITLES[mainMode]}
                startDate={startDate}
                endDate={endDate}
            />
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between shrink-0 print:hidden">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                        {REPORT_HEADER_DATA[mainMode]?.tag || 'Shop Admin • Reports'}
                    </p>
                    <h2 className="mt-1 text-2xl font-serif font-bold text-ivory">
                        {REPORT_HEADER_DATA[mainMode]?.title || 'Reports & Analytics'}
                    </h2>
                    <p className="mt-1 max-w-xl text-xs text-ivory-dim">
                        {REPORT_HEADER_DATA[mainMode]?.description || 'View real-time shop performance and operational data.'}
                    </p>
                </div>

                {/* Date Preset & Range Selector (Compact dropdown on mobile < md, horizontal pills on desktop >= md) */}
                {mainMode !== 'appointments' && (
                    <div className="w-full lg:w-auto flex flex-col items-start lg:items-end gap-2 shrink-0">
                        {/* Mobile Dropdown Selector (< md) */}
                        <div className="w-full md:hidden">
                            <div className="relative w-full">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gold">
                                    <Calendar className="h-4 w-4" />
                                </div>
                                <select
                                    id="mobile-period-preset-select"
                                    aria-label="Select date range preset"
                                    value={preset}
                                    onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
                                    className="min-h-[40px] w-full appearance-none rounded-lg border border-white/10 bg-charcoal-light py-2 pl-9 pr-9 text-xs font-bold text-ivory shadow-md focus:border-gold/60 focus:outline-none cursor-pointer"
                                >
                                    <option value="all" className="bg-charcoal text-ivory">All</option>
                                    <option value="today" className="bg-charcoal text-ivory">Today</option>
                                    <option value="this_week" className="bg-charcoal text-ivory">This Week</option>
                                    <option value="last_7_days" className="bg-charcoal text-ivory">Last 7 Days</option>
                                    <option value="this_month" className="bg-charcoal text-ivory">This Month</option>
                                    <option value="custom" className="bg-charcoal text-ivory">Custom Range</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-ivory-dim">
                                    <ChevronDown className="h-4 w-4" />
                                </div>
                            </div>
                        </div>

                        {/* Desktop Pill Buttons (>= md) */}
                        <div className="hidden md:flex items-center gap-1.5 rounded-full border border-white/10 bg-charcoal-light/95 p-1 shadow-md">
                            {([
                                ['all', 'All'],
                                ['today', 'Today'],
                                ['this_week', 'This Week'],
                                ['last_7_days', 'Last 7 Days'],
                                ['this_month', 'This Month'],
                                ['custom', 'Custom Range'],
                            ] as const).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => handlePresetChange(key)}
                                    className={`shrink-0 min-h-[36px] rounded-full px-3.5 py-1 text-xs font-bold transition-all cursor-pointer whitespace-nowrap touch-manipulation ${preset === key
                                        ? 'bg-gold text-charcoal shadow-sm'
                                        : 'text-ivory-dim hover:bg-white/5 hover:text-ivory'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {preset === 'custom' && (
                            <div className="w-full sm:w-auto flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-charcoal-light p-2.5 shadow-lg animate-fade-in">
                                <label className="flex items-center gap-1.5 text-xs text-ivory-dim flex-1 sm:flex-initial">
                                    <span className="text-[11px] font-semibold whitespace-nowrap">Start:</span>
                                    <input
                                        type="date"
                                        value={startDate}
                                        max={endDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="min-h-[36px] w-full sm:w-auto rounded border border-white/10 bg-charcoal px-2.5 py-1 text-xs text-ivory outline-none focus:border-gold/60"
                                    />
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-ivory-dim flex-1 sm:flex-initial">
                                    <span className="text-[11px] font-semibold whitespace-nowrap">End:</span>
                                    <input
                                        type="date"
                                        value={endDate}
                                        min={startDate}
                                        max={getManilaDateIso()}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="min-h-[36px] w-full sm:w-auto rounded border border-white/10 bg-charcoal px-2.5 py-1 text-xs text-ivory outline-none focus:border-gold/60"
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Top Sub-Header Segmented Bar */}
            <div className="print:hidden shrink-0 lg:hidden">
                <ReportSubHeaderNav
                    activeSub={mainMode}
                    onSelect={(id) => {
                        handleMainModeChange(id as MainReportMode);
                    }}
                />
            </div>

            {pdfError && (
                <p className="shrink-0 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200 print:hidden">
                    {pdfError}
                </p>
            )}

            {/* Loading & Error States */}
            {isLoading && (
                <ReportLoadingSkeleton label={`Loading ${mainMode} report`} />
            )}

            {currentError && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200" role="alert">
                    <div className="flex items-start gap-3">
                        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                        <div>
                            <p className="font-bold">{mainMode === 'inventory' ? 'Couldn’t update the stock report' : 'Report Error'}</p>
                            <p className="mt-1 text-xs">{currentError}</p>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleRefresh(false)}
                                className="mt-3 min-h-[44px] border-red-400/40 text-xs text-red-200 hover:bg-red-400/20"
                            >
                                {mainMode === 'inventory' ? 'Try again' : 'Retry Request'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`w-full flex flex-col overflow-visible print:overflow-visible ${mainMode === 'inventory' || mainMode === 'appointments' || mainMode === 'commissions' ? 'shrink-0' : 'shrink-0 lg:shrink lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain'}`}>
                {mainMode === 'transactions' && (
                    <TransactionHistoryTab
                        embedded={true}
                        startDate={startDate}
                        endDate={endDate}
                        dateFilterLabel={dateFilterLabel}
                    />
                )}

                {mainMode === 'appointments' && (
                    <React.Suspense fallback={<ReportLoadingSkeleton label="Loading reservation history" />}>
                        <AppointmentsTab
                            embedded={true}
                            startDate={preset === 'all' ? undefined : startDate}
                            endDate={preset === 'all' ? undefined : endDate}
                            onNavigateSubTab={(sub: string) => {
                                if (sub && sub !== 'appointments') {
                                    handleMainModeChange(sub as MainReportMode);
                                }
                            }}
                        />
                    </React.Suspense>
                )}

                {mainMode === 'audit-logs' && (
                    <AuditLogsTable
                        startDate={startDate}
                        endDate={endDate}
                        dateFilterLabel={dateFilterLabel}
                    />
                )}

                {mainMode === 'account-security' && (
                    <AuditLogsTable
                        initialModule="auth"
                        startDate={startDate}
                        endDate={endDate}
                        dateFilterLabel={dateFilterLabel}
                    />
                )}

                {!isLoading && !currentError && mainMode === 'sales' && salesReport && (
                    <React.Suspense fallback={<ReportLoadingSkeleton label="Loading sales report" />}>
                        <SalesBreakdown
                            report={salesReport}
                            startDate={startDate}
                            endDate={endDate}
                            dateFilterLabel={dateFilterLabel}
                            onDownloadPdf={handleDownloadPdf}
                            pdfDownloading={pdfDownloading}
                        />
                    </React.Suspense>
                )}

                {!isLoading && !currentError && mainMode === 'commissions' && commissionReport && (
                    <React.Suspense fallback={<ReportLoadingSkeleton label="Loading commission report" />}>
                        <BarberCommissions
                            report={commissionReport}
                            startDate={startDate}
                            endDate={endDate}
                            dateFilterLabel={dateFilterLabel}
                            onDownloadPdf={handleDownloadPdf}
                            pdfDownloading={pdfDownloading}
                        />
                    </React.Suspense>
                )}

                {/* ========================================================================= */}
                {/* VIEW B: INVENTORY VALUATION & RECONCILIATION                               */}
                {/* ========================================================================= */}
                {mainMode === 'inventory' && inventoryReport && inventorySummary && (
                    <div className="space-y-3 w-full">
                        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                            <p className="flex items-center gap-1.5 text-xs text-ivory-dim" role="status">
                                <Clock className="h-3.5 w-3.5" />
                                {inventoryLoading ? 'Updating stock report…' : `Updated ${new Date(inventory.updatedAt!).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="outline" disabled={inventoryLoading} onClick={() => void refreshInventory()} className="min-h-[44px] text-xs">
                                    <RefreshCw className={`mr-1.5 h-4 w-4 ${inventoryLoading ? 'animate-spin' : ''}`} /> Refresh
                                </Button>
                                <Button type="button" variant="outline" disabled={pdfDownloading || !canDownloadPdf} onClick={handleDownloadPdf} className="min-h-[44px] text-xs">
                                    <FileDown className="mr-1.5 h-4 w-4" /> {pdfDownloading ? 'Preparing PDF…' : 'Download PDF'}
                                </Button>
                            </div>
                        </div>
                        {/* Summary KPI Cards: Clickable navigation cards for dedicated inventory views */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 lg:gap-4 shrink-0">
                            {/* Card 1: Stock value */}
                            <button
                                type="button"
                                onClick={() => selectInventorySection('stock-value')}
                                aria-pressed={inventoryActiveSection === 'stock-value'}
                                className={`group rounded-lg border p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gold ${inventoryActiveSection === 'stock-value'
                                    ? 'border-gold bg-gold/15 shadow-md shadow-gold/10 ring-1 ring-gold'
                                    : 'border-gold/30 bg-gold/5 hover:border-gold/60 hover:bg-gold/10'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-1 w-full">
                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gold truncate">Stock value</p>
                                    <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold text-gold uppercase shrink-0 whitespace-nowrap">
                                        <span className="sm:hidden">₱ Cost</span>
                                        <span className="hidden sm:inline">₱ Cost value</span>
                                    </span>
                                </div>
                                <p className="mt-1 text-sm sm:text-xl lg:text-2xl font-serif font-bold text-gold truncate">
                                    {formatCurrency(inventorySummary.totalClosingValue)}
                                </p>
                                <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px] sm:text-[10px] text-ivory-dim">
                                    <span className="truncate">Ending stock at cost</span>
                                    {inventoryActiveSection === 'stock-value' ? (
                                        <span className="text-gold font-semibold shrink-0">Active table ↓</span>
                                    ) : (
                                        <span className="text-gold/60 group-hover:text-gold shrink-0">View table →</span>
                                    )}
                                </div>
                            </button>

                            {/* Card 2: Items tracked */}
                            <button
                                type="button"
                                onClick={() => selectInventorySection('items-tracked')}
                                aria-pressed={inventoryActiveSection === 'items-tracked' || inventoryActiveSection === 'ledger'}
                                className={`group rounded-lg border p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gold ${(inventoryActiveSection === 'items-tracked' || inventoryActiveSection === 'ledger')
                                    ? 'border-gold bg-white/[0.08] shadow-md ring-1 ring-gold'
                                    : 'border-white/10 bg-charcoal-light hover:border-white/25 hover:bg-white/[0.04]'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-1 w-full">
                                    <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider truncate ${(inventoryActiveSection === 'items-tracked' || inventoryActiveSection === 'ledger') ? 'text-gold' : 'text-ivory-dim'}`}>Items tracked</p>
                                    <Package className={`h-3.5 w-3.5 shrink-0 hidden sm:block ${(inventoryActiveSection === 'items-tracked' || inventoryActiveSection === 'ledger') ? 'text-gold' : 'text-ivory-dim'}`} />
                                </div>
                                <p className="mt-1 text-sm sm:text-lg lg:text-xl font-bold text-ivory truncate">{formatNumber(inventorySummary.activeTrackedSkuCount)}</p>
                                <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px] sm:text-[10px] text-ivory-dim">
                                    <span className="truncate">
                                        <span className="sm:hidden">Items in report</span>
                                        <span className="hidden sm:inline">Items in this report</span>
                                    </span>
                                    {(inventoryActiveSection === 'items-tracked' || inventoryActiveSection === 'ledger') ? (
                                        <span className="text-gold font-semibold shrink-0">Active table ↓</span>
                                    ) : (
                                        <span className="text-ivory-dim/60 group-hover:text-ivory shrink-0">View table →</span>
                                    )}
                                </div>
                            </button>

                            {/* Card 3: Items running low */}
                            <button
                                type="button"
                                onClick={() => selectInventorySection('running-low')}
                                aria-pressed={inventoryActiveSection === 'running-low'}
                                className={`group rounded-lg border p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer min-h-[44px] focus:outline-none focus:ring-2 focus:ring-red-400 ${inventoryActiveSection === 'running-low'
                                    ? 'border-red-400 bg-red-400/15 shadow-md shadow-red-500/10 ring-1 ring-red-400'
                                    : 'border-red-400/20 bg-red-400/5 hover:border-red-400/50 hover:bg-red-400/10'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-1 w-full">
                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-red-300 truncate">Items running low</p>
                                    <ShieldAlert className="h-3.5 w-3.5 text-red-300 shrink-0" />
                                </div>
                                <p className="mt-1 text-sm sm:text-lg lg:text-xl font-bold text-red-300 truncate">{formatNumber(inventorySummary.atRiskSkuCount)}</p>
                                <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px] sm:text-[10px] text-ivory-dim">
                                    <span className="truncate">
                                        <span className="sm:hidden">Critical / low</span>
                                        <span className="hidden sm:inline">Critical or low stock</span>
                                    </span>
                                    {inventoryActiveSection === 'running-low' ? (
                                        <span className="text-red-300 font-semibold shrink-0">Active table ↓</span>
                                    ) : (
                                        <span className="text-red-300/60 group-hover:text-red-300 shrink-0">View table →</span>
                                    )}
                                </div>
                            </button>

                            {/* Card 4: Stock changes */}
                            <button
                                type="button"
                                onClick={() => selectInventorySection('stock-changes')}
                                aria-pressed={inventoryActiveSection === 'stock-changes' || inventoryActiveSection === 'variances'}
                                className={`group rounded-lg border p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gold ${(inventoryActiveSection === 'stock-changes' || inventoryActiveSection === 'variances')
                                    ? 'border-gold bg-gold/15 shadow-md shadow-gold/10 ring-1 ring-gold'
                                    : 'border-gold/30 bg-gold/5 hover:border-gold/60 hover:bg-gold/10'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-1 w-full">
                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gold truncate">Stock changes</p>
                                    <Layers className="h-3.5 w-3.5 text-gold shrink-0" />
                                </div>
                                <p className="mt-1 text-sm sm:text-lg lg:text-xl font-bold text-gold truncate">{formatNumber(inventorySummary.totalMovementCount)}</p>
                                <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px] sm:text-[10px] text-ivory-dim">
                                    <span className="truncate">
                                        <span className="sm:hidden">During these dates</span>
                                        <span className="hidden sm:inline">In selected period</span>
                                    </span>
                                    {(inventoryActiveSection === 'stock-changes' || inventoryActiveSection === 'variances') ? (
                                        <span className="text-gold font-semibold shrink-0">Active table ↓</span>
                                    ) : (
                                        <span className="text-gold/60 group-hover:text-gold shrink-0">View table →</span>
                                    )}
                                </div>
                            </button>
                        </div>

                        {/* Status / Navigation Banner (Redundant tabs "Stock summary" & "Count differences" removed) */}
                        {/* Section 1 & 2: Stock Value & Items Tracked Tables */}
                        {(inventoryActiveSection === 'stock-value' || inventoryActiveSection === 'items-tracked' || inventoryActiveSection === 'ledger') && (
                            <div className="w-full overflow-hidden rounded-lg border border-white/10 bg-charcoal-light shadow-xl">
                                <div className="flex flex-col justify-between gap-3 border-b border-white/10 bg-charcoal/40 p-3 sm:p-4 xl:flex-row xl:items-center shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Package className="h-4 w-4 text-gold" />
                                        <p className="text-sm font-bold uppercase tracking-wider text-gold">
                                            {inventoryActiveSection === 'stock-value' ? 'Stock Value' : 'Items Tracked'}
                                        </p>
                                        <span className="rounded bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold uppercase">
                                            {inventoryActiveSection === 'stock-value'
                                                ? `${formatCurrency(inventorySummary.totalClosingValue)} Total Valuation`
                                                : `${inventoryReport.items.length} Tracked SKUs`}
                                        </span>
                                        <div ref={formulaPopoverRef} className="relative print:hidden">
                                            <button
                                                type="button"
                                                aria-label="How stock is calculated"
                                                aria-expanded={isFormulaOpen}
                                                onClick={() => setIsFormulaOpen((open) => !open)}
                                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-300/50 text-sky-300 transition-colors hover:bg-sky-300/10 focus:outline-none focus:ring-2 focus:ring-sky-300/50"
                                            >
                                                <Info className="h-3 w-3" />
                                            </button>
                                            {isFormulaOpen && (
                                                <div role="dialog" aria-label="How stock is calculated" className="absolute left-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-sky-300/30 bg-charcoal p-4 text-xs text-ivory-dim shadow-2xl">
                                                    <p className="font-bold text-ivory">How stock is calculated</p>
                                                    <p className="mt-1 leading-relaxed">
                                                        <code className="text-gold">Ending stock = Starting stock + Deliveries − Estimated use + Count fixes + Manual changes</code>.
                                                    </p>
                                                    <p className="mt-2 leading-relaxed">
                                                        Quantity shows how much stock you have, using each item’s unit. Cost value shows what that stock costs the shop, based on the cost per unit you set.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center print:hidden">
                                        <div className="flex items-center gap-2 text-[10px] text-ivory-dim">
                                            <span className="uppercase tracking-wider">Display</span>
                                            <div className="flex rounded border border-white/10 bg-charcoal p-0.5" role="group" aria-label="Stock display">
                                                <button
                                                    type="button"
                                                    aria-pressed={displayMode === 'units'}
                                                    onClick={() => setDisplayMode('units')}
                                                    className={`min-h-[44px] rounded px-2.5 py-1 font-bold transition-colors ${displayMode === 'units' ? 'bg-gold text-charcoal' : 'text-ivory-dim hover:text-ivory'}`}
                                                >
                                                    Quantity
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-pressed={displayMode === 'value'}
                                                    onClick={() => setDisplayMode('value')}
                                                    className={`min-h-[44px] rounded px-2.5 py-1 font-bold transition-colors ${displayMode === 'value' ? 'bg-gold text-charcoal' : 'text-ivory-dim hover:text-ivory'}`}
                                                >
                                                    ₱ Cost value
                                                </button>
                                            </div>
                                        </div>
                                        {displayMode === 'value' && (
                                            <p className="text-xs text-gold">
                                                Ending stock value: <strong>{formatCurrency(inventorySummary.totalClosingValue)}</strong>
                                            </p>
                                        )}
                                        <div className="relative w-full sm:w-64">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
                                            <input
                                                type="text"
                                                placeholder="Search item or category..."
                                                value={inventorySearchTerm}
                                                onChange={(e) => setInventorySearchTerm(e.target.value)}
                                                className="min-h-[44px] w-full rounded border border-white/10 bg-charcoal py-1.5 pl-8 pr-3 text-xs text-ivory outline-none focus:border-gold/60"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {filteredInventoryItems.length === 0 ? (
                                    <p className="p-8 text-center text-xs text-ivory-dim">
                                        No inventory records found for {dateFilterLabel}.
                                    </p>
                                ) : (
                                    <>
                                        {/* ========================================================================= */}
                                        {/* 1. MOBILE RESPONSIVE ACCORDION VIEW (< md / < 768px)                      */}
                                        {/* ========================================================================= */}
                                        <div className="block md:hidden divide-y divide-white/5">
                                            {visibleInventoryItems.map((item: InventoryReportItem) => {
                                                const isExpanded = expandedInventoryItemIds.has(item.inventoryStockId);
                                                const categoryOwnership = item.ownership === 'Consumables' || item.assignedBarber ? 'Consumables' : item.ownership;

                                                return (
                                                    <div
                                                        key={item.inventoryStockId}
                                                        className={`transition-colors ${isExpanded ? 'bg-white/[0.04] border-l-2 border-gold' : 'hover:bg-white/[0.02]'
                                                            }`}
                                                    >
                                                        {/* Primary Row Header (Always Visible on Mobile) */}
                                                        <div
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-expanded={isExpanded}
                                                            onClick={() => toggleInventoryItemExpand(item.inventoryStockId)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    toggleInventoryItemExpand(item.inventoryStockId);
                                                                }
                                                            }}
                                                            className="flex cursor-pointer items-center justify-between gap-3 p-3.5 select-none focus:outline-none focus:bg-white/[0.04]"
                                                        >
                                                            {/* 1. Product Name & Category / Unit */}
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate font-bold text-sm text-ivory">{item.name}</p>
                                                                <p className="truncate text-[10px] text-ivory-dim mt-0.5">
                                                                    {categoryOwnership} • {item.unit}
                                                                </p>
                                                            </div>

                                                            {/* 2. Stock Status Badge & Closing Stock */}
                                                            <div className="flex items-center gap-2.5 shrink-0">
                                                                <div className="text-right">
                                                                    <div className="font-mono text-xs font-bold text-gold">
                                                                        {displayMode === 'value'
                                                                            ? renderMetric(item.closingValue, formatCurrency, 'text-gold')
                                                                            : renderMetric(item.closingQuantity, (value) => `${formatNumber(value)} ${item.unit}`, 'text-gold')}
                                                                    </div>
                                                                    <div className="mt-0.5">
                                                                        <span className={`inline-flex rounded-full border px-1.5 py-0.2 text-[9px] font-bold ${inventoryStockStatusBadgeClasses[item.stockStatus] || inventoryStockStatusBadgeClasses['In Stock']}`}>
                                                                            {item.stockStatus}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* 3. View Details / Chevron Toggle Button */}
                                                                <div
                                                                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${isExpanded ? 'bg-gold/20 text-gold' : 'bg-charcoal text-ivory-dim hover:text-ivory'
                                                                        }`}
                                                                    title={isExpanded ? 'Collapse details' : 'View details'}
                                                                    aria-label={isExpanded ? 'Collapse details' : 'View details'}
                                                                >
                                                                    {isExpanded ? (
                                                                        <ChevronUp className="h-4 w-4 text-gold" />
                                                                    ) : (
                                                                        <ChevronDown className="h-4 w-4 text-ivory-dim" />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Expandable Accordion Panel (Complete Audit Breakdown) */}
                                                        {isExpanded && (
                                                            <div className="border-t border-white/5 bg-charcoal/80 px-3.5 py-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                                    {/* Morning physical count */}
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                                            Morning count
                                                                        </span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-semibold">
                                                                            {renderStockCount(item.morningStockCount, item.unit)}
                                                                        </div>
                                                                    </div>

                                                                    {/* Deliveries (+) */}
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                                                                            {displayMode === 'value' ? 'Deliveries (₱)' : 'Deliveries (+)'}
                                                                        </span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-semibold text-emerald-400">
                                                                            {displayMode === 'value'
                                                                                ? renderMetric(item.receiptsValue, (val) => `+${formatCurrency(val)}`, 'text-emerald-400')
                                                                                : renderMetric(item.receiptsQuantity, (val) => `+${formatNumber(val)} ${item.unit}`, 'text-emerald-400')}
                                                                        </div>
                                                                    </div>

                                                                    {/* Estimated use (−) */}
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                                                                            {displayMode === 'value' ? 'Estimated use (₱)' : 'Estimated use (−)'}
                                                                        </span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-semibold text-amber-400">
                                                                            {displayMode === 'value'
                                                                                ? renderMetric(item.estimatedConsumptionValue, (val) => `−${formatCurrency(val)}`, 'text-amber-400')
                                                                                : renderMetric(item.estimatedConsumptionQuantity, (val) => `−${formatNumber(val)} ${item.unit}`, 'text-amber-400')}
                                                                        </div>
                                                                    </div>

                                                                    {/* Spoilage / Expired (−) */}
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400/80">
                                                                            {displayMode === 'value' ? 'Spoilage (₱)' : 'Spoilage (−)'}
                                                                        </span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-semibold text-rose-400">
                                                                            {displayMode === 'value'
                                                                                ? renderMetric(item.spoilageValue ?? 0, (val) => `−${formatCurrency(val)}`, 'text-rose-400')
                                                                                : renderMetric(item.spoilageQuantity ?? 0, (val) => `−${formatNumber(val)} ${item.unit}`, 'text-rose-400')}
                                                                        </div>
                                                                    </div>

                                                                    {/* Count differences (±) */}
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400/80">
                                                                            {displayMode === 'value' ? 'Count fixes (₱)' : 'Count fixes (±)'}
                                                                        </span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-semibold text-sky-400">
                                                                            {displayMode === 'value'
                                                                                ? renderMetric(item.countCorrectionsValue, formatSignedCurrency, 'text-sky-400')
                                                                                : renderMetric(item.countCorrectionsQuantity, (v) => `${formatSignedNumber(v)} ${item.unit}`, 'text-sky-400')}
                                                                        </div>
                                                                    </div>

                                                                    {/* Admin Override Adjustments (±) */}
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                                            {displayMode === 'value' ? 'Manual changes (₱)' : 'Manual changes (±)'}
                                                                        </span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-semibold text-ivory">
                                                                            {displayMode === 'value'
                                                                                ? renderMetric(item.manualAdjustmentsValue, formatSignedCurrency, 'text-violet-300')
                                                                                : renderMetric(item.manualAdjustmentsQuantity, (v) => `${formatSignedNumber(v)} ${item.unit}`, 'text-ivory')}
                                                                        </div>
                                                                    </div>

                                                                    {/* Evening physical count & Unit Cost */}
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-gold/80">
                                                                            Evening count & unit cost
                                                                        </span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-bold text-gold">
                                                                            {renderStockCount(item.eveningStockCount, item.unit, 'text-gold')}
                                                                        </div>
                                                                        <p className="mt-0.5 text-[10px] text-ivory-dim">
                                                                            Cost: {formatCurrency(item.costPrice)}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                {/* When to restock */}
                                                                <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                                        When to restock
                                                                    </span>
                                                                    <div className="mt-1 text-xs">
                                                                        {item.forecastAvailable ? (
                                                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                                                                <p className="text-ivory">
                                                                                    May run out: <strong className="text-white">{item.projectedStockOutDate || 'No date estimated'}</strong>
                                                                                </p>
                                                                                {item.suggestedWeeklyReplenishment ? (
                                                                                    <p className="text-gold font-medium">
                                                                                        Suggested order: +{item.suggestedWeeklyReplenishment} {item.unit} per week
                                                                                    </p>
                                                                                ) : null}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="italic text-ivory-dim/60">
                                                                                {item.forecastUnavailableReason || 'Available after 14 days of stock history'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* ========================================================================= */}
                                        {/* 2. DESKTOP INVENTORY TABLE (>= md)                                         */}
                                        {/* ========================================================================= */}
                                        <div className="hidden md:block w-full max-w-full overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
                                            <table className="w-full min-w-[1000px] text-left text-xs">
                                                <thead className="border-b border-white/10 bg-charcoal text-[10px] uppercase tracking-wider text-ivory-dim">
                                                    <tr>
                                                        <th className="px-3 py-2">Item / Type</th>
                                                        <th className="px-3 py-3 text-right" title={`Physical morning count on ${startDate}`}>Morning count</th>
                                                        <th className="px-3 py-3 text-right" title={`Physical evening count on ${endDate}`}>Evening count</th>
                                                        <th className="px-3 py-3 text-right text-emerald-400">{displayMode === 'value' ? 'Deliveries (₱)' : 'Deliveries (+)'}</th>
                                                        <th className="px-3 py-3 text-right text-amber-400">{displayMode === 'value' ? 'Estimated use (₱)' : 'Estimated use (−)'}</th>
                                                        <th className="px-3 py-3 text-right text-rose-400">{displayMode === 'value' ? 'Spoilage (₱)' : 'Spoilage (−)'}</th>
                                                        <th className="px-3 py-3 text-right text-sky-400">{displayMode === 'value' ? 'Count fixes (₱)' : 'Count fixes (±)'}</th>
                                                        <th className="px-3 py-3 text-right">{displayMode === 'value' ? 'Manual changes (₱)' : 'Manual changes (±)'}</th>
                                                        <th className="px-3 py-2">Stock Status</th>
                                                        <th className="px-3 py-2">When to restock</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {visibleInventoryItems.map((item: InventoryReportItem) => (
                                                        <tr key={item.inventoryStockId} className="hover:bg-white/[0.03]">
                                                            <td className="px-3 py-2">
                                                                <p className="font-bold text-ivory">{item.name}</p>
                                                                <p className="text-[10px] text-ivory-dim">
                                                                    {item.ownership === 'Consumables' || item.assignedBarber ? 'Consumables' : item.ownership} • {item.unit} • Cost: {formatCurrency(item.costPrice)}
                                                                </p>
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-ivory-dim">
                                                                {renderStockCount(item.morningStockCount)}
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-ivory-dim">
                                                                {renderStockCount(item.eveningStockCount)}
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-emerald-400">
                                                                {displayMode === 'value'
                                                                    ? renderMetric(item.receiptsValue, (value) => `+${formatCurrency(value)}`, 'text-emerald-400')
                                                                    : renderMetric(item.receiptsQuantity, (value) => `+${formatNumber(value)}`, 'text-emerald-400')}
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-amber-400">
                                                                {displayMode === 'value'
                                                                    ? renderMetric(item.estimatedConsumptionValue, (value) => `−${formatCurrency(value)}`, 'text-amber-400')
                                                                    : renderMetric(item.estimatedConsumptionQuantity, (value) => `−${formatNumber(value)}`, 'text-amber-400')}
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-rose-400">
                                                                {displayMode === 'value'
                                                                    ? renderMetric(item.spoilageValue ?? 0, (value) => `−${formatCurrency(value)}`, 'text-rose-400')
                                                                    : renderMetric(item.spoilageQuantity ?? 0, (value) => `−${formatNumber(value)}`, 'text-rose-400')}
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-sky-400">
                                                                {displayMode === 'value'
                                                                    ? renderMetric(item.countCorrectionsValue, formatSignedCurrency, 'text-sky-400')
                                                                    : renderMetric(item.countCorrectionsQuantity, formatSignedNumber, 'text-sky-400')}
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-ivory-dim">
                                                                {displayMode === 'value'
                                                                    ? renderMetric(item.manualAdjustmentsValue, formatSignedCurrency, 'text-violet-300')
                                                                    : renderMetric(item.manualAdjustmentsQuantity, formatSignedNumber, 'text-ivory-dim')}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${inventoryStockStatusBadgeClasses[item.stockStatus] || inventoryStockStatusBadgeClasses['In Stock']}`}>
                                                                    {item.stockStatus}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-[11px] text-ivory-dim">
                                                                {item.forecastAvailable ? (
                                                                    <div>
                                                                        <p className="text-ivory">May run out: <strong>{item.projectedStockOutDate || 'No date estimated'}</strong></p>
                                                                        {item.suggestedWeeklyReplenishment ? (
                                                                            <p className="text-gold">Suggested order: +{item.suggestedWeeklyReplenishment} {item.unit} per week</p>
                                                                        ) : null}
                                                                    </div>
                                                                ) : (
                                                                    <span className="italic text-ivory-dim/60">
                                                                        {item.forecastUnavailableReason || 'Available after 14 days of stock history'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Section 3: Items Running Low Dedicated Table */}
                        {inventoryActiveSection === 'running-low' && (
                            <div className="w-full overflow-hidden rounded-lg border border-red-400/20 bg-charcoal-light shadow-xl">
                                <div className="flex flex-col justify-between gap-3 border-b border-white/10 bg-charcoal/40 p-3 sm:p-4 xl:flex-row xl:items-center shrink-0">
                                    <div className="flex items-center gap-2">
                                        <ShieldAlert className="h-4 w-4 text-red-300" />
                                        <p className="text-sm font-bold uppercase tracking-wider text-red-300">Items Running Low</p>
                                        <span className="rounded bg-red-400/20 px-2 py-0.5 text-[10px] font-bold text-red-300 uppercase">
                                            {lowStockItems.length} {lowStockItems.length === 1 ? 'Item at Risk' : 'Items at Risk'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center print:hidden">
                                        <div className="relative w-full sm:w-64">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
                                            <input
                                                type="text"
                                                placeholder="Search low stock item..."
                                                value={inventorySearchTerm}
                                                onChange={(e) => setInventorySearchTerm(e.target.value)}
                                                className="min-h-[44px] w-full rounded border border-white/10 bg-charcoal py-1.5 pl-8 pr-3 text-xs text-ivory outline-none focus:border-red-400/60"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {lowStockItems.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300 mb-2">
                                            <CheckCircle2 className="h-6 w-6" />
                                        </div>
                                        <p className="text-sm font-bold text-ivory">Stock Levels are Healthy</p>
                                        <p className="mt-1 text-xs text-ivory-dim">No items are currently running low or critical for {dateFilterLabel}.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Mobile Accordion View (< md) */}
                                        <div className="block md:hidden divide-y divide-white/5">
                                            {visibleRunningLowItems.map((item: InventoryReportItem) => {
                                                const isExpanded = expandedInventoryItemIds.has(item.inventoryStockId);
                                                const categoryOwnership = item.ownership === 'Consumables' || item.assignedBarber ? 'Consumables' : item.ownership;

                                                return (
                                                    <div
                                                        key={item.inventoryStockId}
                                                        className={`transition-colors ${isExpanded ? 'bg-white/[0.04] border-l-2 border-red-400' : 'hover:bg-white/[0.02]'}`}
                                                    >
                                                        <div
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-expanded={isExpanded}
                                                            onClick={() => toggleInventoryItemExpand(item.inventoryStockId)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    toggleInventoryItemExpand(item.inventoryStockId);
                                                                }
                                                            }}
                                                            className="flex cursor-pointer items-center justify-between gap-3 p-3.5 select-none focus:outline-none focus:bg-white/[0.04]"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate font-bold text-sm text-ivory">{item.name}</p>
                                                                <p className="truncate text-[10px] text-ivory-dim mt-0.5">
                                                                    {categoryOwnership} • {item.unit}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2.5 shrink-0">
                                                                <div className="text-right">
                                                                    <div className="font-mono text-xs font-bold text-red-300">
                                                                        {renderMetric(item.closingQuantity, (value) => `${formatNumber(value)} ${item.unit}`, 'text-red-300')}
                                                                    </div>
                                                                    <div className="mt-0.5">
                                                                        <span className={`inline-flex rounded-full border px-1.5 py-0.2 text-[9px] font-bold ${inventoryStockStatusBadgeClasses[item.stockStatus] || inventoryStockStatusBadgeClasses['In Stock']}`}>
                                                                            {item.stockStatus}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div
                                                                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${isExpanded ? 'bg-red-400/20 text-red-300' : 'bg-charcoal text-ivory-dim hover:text-ivory'}`}
                                                                    title={isExpanded ? 'Collapse details' : 'View details'}
                                                                    aria-label={isExpanded ? 'Collapse details' : 'View details'}
                                                                >
                                                                    {isExpanded ? (
                                                                        <ChevronUp className="h-4 w-4 text-red-300" />
                                                                    ) : (
                                                                        <ChevronDown className="h-4 w-4 text-ivory-dim" />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="border-t border-white/5 bg-charcoal/80 px-3.5 py-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Ending Stock</span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-bold text-red-300">
                                                                            {renderMetric(item.closingQuantity, (v) => `${formatNumber(v)} ${item.unit}`, 'text-red-300')}
                                                                        </div>
                                                                        <p className="mt-0.5 text-[10px] text-ivory-dim">Cost value: {formatCurrency(item.closingValue)}</p>
                                                                    </div>
                                                                    <div className="rounded-md border border-white/5 bg-charcoal/60 p-2.5">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Unit Cost</span>
                                                                        <div className="mt-1 font-mono text-xs sm:text-sm font-semibold text-ivory">
                                                                            {formatCurrency(item.costPrice)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="rounded-md border border-red-400/20 bg-red-400/5 p-2.5">
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-300">Replenishment Forecast</span>
                                                                    <div className="mt-1 text-xs">
                                                                        {item.forecastAvailable ? (
                                                                            <div className="flex flex-col gap-1">
                                                                                <p className="text-ivory">May run out: <strong className="text-white">{item.projectedStockOutDate || 'No date estimated'}</strong></p>
                                                                                {item.suggestedWeeklyReplenishment ? (
                                                                                    <p className="text-gold font-medium">Suggested order: +{item.suggestedWeeklyReplenishment} {item.unit} per week</p>
                                                                                ) : null}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="italic text-ivory-dim/60">
                                                                                {item.forecastUnavailableReason || 'Available after 14 days of stock history'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Desktop Table View (>= md) */}
                                        <div className="hidden md:block w-full max-w-full overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
                                            <table className="w-full min-w-[900px] text-left text-xs">
                                                <thead className="border-b border-white/10 bg-charcoal text-[10px] uppercase tracking-wider text-ivory-dim">
                                                    <tr>
                                                        <th className="px-3 py-2">Item / Type</th>
                                                        <th className="px-3 py-3 text-right">Unit Cost</th>
                                                        <th className="px-3 py-3 text-right font-bold text-red-300">Current Stock</th>
                                                        <th className="px-3 py-3 text-right text-gold">Stock Value (₱)</th>
                                                        <th className="px-3 py-2">Stock Status</th>
                                                        <th className="px-3 py-2">Replenishment / Run-out Forecast</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {visibleRunningLowItems.map((item: InventoryReportItem) => (
                                                        <tr key={item.inventoryStockId} className="hover:bg-white/[0.03]">
                                                            <td className="px-3 py-2">
                                                                <p className="font-bold text-ivory">{item.name}</p>
                                                                <p className="text-[10px] text-ivory-dim">
                                                                    {item.ownership === 'Consumables' || item.assignedBarber ? 'Consumables' : item.ownership} • {item.unit}
                                                                </p>
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-ivory-dim">
                                                                {formatCurrency(item.costPrice)}
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono font-bold text-red-300">
                                                                {renderMetric(item.closingQuantity, (value) => `${formatNumber(value)} ${item.unit}`, 'text-red-300')}
                                                            </td>
                                                            <td className="px-3 py-3 text-right font-mono text-gold">
                                                                {renderMetric(item.closingValue, formatCurrency, 'text-gold')}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${inventoryStockStatusBadgeClasses[item.stockStatus] || inventoryStockStatusBadgeClasses['In Stock']}`}>
                                                                    {item.stockStatus}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-[11px] text-ivory-dim">
                                                                {item.forecastAvailable ? (
                                                                    <div>
                                                                        <p className="text-ivory">May run out: <strong>{item.projectedStockOutDate || 'No date estimated'}</strong></p>
                                                                        {item.suggestedWeeklyReplenishment ? (
                                                                            <p className="text-gold">Suggested order: +{item.suggestedWeeklyReplenishment} {item.unit} per week</p>
                                                                        ) : null}
                                                                    </div>
                                                                ) : (
                                                                    <span className="italic text-ivory-dim/60">
                                                                        {item.forecastUnavailableReason || 'Available after 14 days of stock history'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Section 4: Count differences & Stock Changes */}
                        {(inventoryActiveSection === 'stock-changes' || inventoryActiveSection === 'variances') && (
                            <div className="w-full overflow-hidden rounded-lg border border-white/10 bg-charcoal-light shadow-xl">
                                <div className="border-b border-white/10 bg-charcoal/40 p-3 sm:p-4 shrink-0">
                                    <p className="text-sm font-bold uppercase tracking-wider text-gold">Stock count differences</p>
                                    <p className="mt-1 text-xs text-ivory-dim">
                                        Compare the stock counted by staff with the amount recorded in the system.
                                    </p>
                                </div>
                                {inventory.countsLoading || (inventory.variances === null && !inventory.countsError) ? (
                                    <p className="p-8 text-center text-sm text-ivory-dim" role="status">Loading stock counts…</p>
                                ) : inventory.countsError ? (
                                    <div className="p-4 text-sm text-red-200" role="alert">
                                        <p>{inventory.countsError}</p>
                                        <Button type="button" variant="outline" onClick={() => void inventory.refreshCounts()} className="mt-2 min-h-[44px]">Try again</Button>
                                    </div>
                                ) : inventory.variances?.length === 0 ? (
                                    <p className="p-8 text-center text-xs text-ivory-dim">No stock counts recorded for {dateFilterLabel}.</p>
                                ) : (
                                    <div className="w-full max-w-full overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
                                        <table className="w-full min-w-[950px] text-left text-xs">
                                            <thead className="border-b border-white/10 bg-charcoal text-[10px] uppercase tracking-wider text-ivory-dim">
                                                <tr>
                                                    <th className="px-3 py-2">Date / Shift</th>
                                                    <th className="px-3 py-2">Item</th>
                                                    <th className="px-3 py-3 text-right">System stock</th>
                                                    <th className="px-3 py-3 text-right">Counted stock</th>
                                                    <th className="px-3 py-3 text-right">Difference</th>
                                                    <th className="px-3 py-3 text-right">Cost / Unit</th>
                                                    <th className="px-3 py-3 text-right text-gold">Difference at cost (₱)</th>
                                                    <th className="px-3 py-2">Review / Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {visibleCountDifferences.map((v: InventoryVarianceItem, idx: number) => (
                                                    <tr key={`${v.stockCountId}-${v.inventoryStockId}-${idx}`} className="hover:bg-white/[0.03]">
                                                        <td className="px-3 py-2">
                                                            <p className="font-bold text-ivory">{v.countDate}</p>
                                                            <p className="text-[10px] uppercase tracking-wider text-gold">{v.shift} shift</p>
                                                        </td>
                                                        <td className="px-3 py-2 font-bold text-ivory">
                                                            {v.itemName}
                                                            <span className="block text-[10px] font-normal text-ivory-dim">{v.ownership}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-right font-mono text-ivory-dim">{formatNumber(v.currentQuantityBefore)} {v.unit}</td>
                                                        <td className="px-3 py-3 text-right font-mono font-bold text-ivory">{formatNumber(v.countedQuantity)} {v.unit}</td>
                                                        <td className="px-3 py-3 text-right font-mono font-bold">
                                                            <span className={v.varianceDelta < 0 ? 'text-red-300' : v.varianceDelta > 0 ? 'text-emerald-300' : 'text-ivory-dim'}>
                                                                {v.varianceDelta === 0 ? '—' : `${v.varianceDelta > 0 ? '+' : ''}${formatNumber(v.varianceDelta)} ${v.unit}`}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 text-right font-mono text-ivory-dim">{formatCurrency(v.costPrice)}</td>
                                                        <td className="px-3 py-3 text-right font-mono font-bold">
                                                            {renderMetric(
                                                                v.financialExposure,
                                                                formatSignedCurrency,
                                                                v.financialExposure < 0 ? 'text-red-300' : 'text-emerald-300',
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-ivory-dim">
                                                            {v.notes && <p className="italic">“{v.notes}”</p>}
                                                            {v.reviewedBy && (
                                                                <p className="text-[10px] text-ivory-dim/80">Reviewed by {v.reviewedBy} on {formatTimestamp(v.reviewedAt)}</p>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                        {inventoryRowCount > 0 && !inventory.countsLoading && (
                            <nav aria-label="Inventory report pages" className="flex flex-wrap items-center justify-between gap-2 text-xs text-ivory-dim print:hidden">
                                <p>Showing {inventoryPageOffset + 1}–{Math.min(inventoryPageOffset + 15, inventoryRowCount)} of {inventoryRowCount} {(inventoryActiveSection === 'stock-changes' || inventoryActiveSection === 'variances') ? (inventoryRowCount === 1 ? 'count difference' : 'count differences') : (inventoryRowCount === 1 ? 'item' : 'items')}</p>
                                {inventoryPageCount > 1 && <div className="flex items-center gap-2">
                                    <Button type="button" variant="outline" disabled={currentInventoryPage === 1} onClick={() => setInventoryPage(currentInventoryPage - 1)} className="min-h-[44px]">Previous</Button>
                                    <span>Page {currentInventoryPage} of {inventoryPageCount}</span>
                                    <Button type="button" variant="outline" disabled={currentInventoryPage === inventoryPageCount} onClick={() => setInventoryPage(currentInventoryPage + 1)} className="min-h-[44px]">Next</Button>
                                </div>}
                            </nav>
                        )}
                    </div>
                )}
            </div>
            <PrintReportFooter />
        </section>
    );
};

export default ReportsTab;
