import type { SalesReportDailyPoint, SalesReportTransaction } from '@demoshop/shared-types';

export interface ChartPieSlice {
    label: string;
    value: number;
    color: string;
}

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
    cash: '#34d399',
    gcash: '#38bdf8',
    paymongo: '#a78bfa',
    digital: '#38bdf8',
};

export const colorForPaymentMethod = (method: string, index: number): string => {
    const key = method.trim().toLowerCase();
    if (PAYMENT_METHOD_COLORS[key]) return PAYMENT_METHOD_COLORS[key];
    const fallback = ['#D4AF37', '#f59e0b', '#f472b6', '#818cf8', '#2dd4bf'];
    return fallback[index % fallback.length];
};

export const formatReportDate = (value?: string | null): string => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00+08:00`);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Manila',
    }).format(date);
};

export const formatMonthLabel = (yyyyMm: string): string => {
    const [y, m] = yyyyMm.split('-').map(Number);
    if (!y || !m) return yyyyMm;
    const d = new Date(Date.UTC(y, m - 1, 1));
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
};

export const addDaysToIsoDate = (dateIso: string, days: number): string => {
    const date = new Date(`${dateIso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

export const getManilaDateIso = (date: Date = new Date()): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return `${year}-${month}-${day}`;
};

export const getChartDateFilterBounds = (
    chartDateFilter: string,
    referenceDateIso?: string
): { filterStart?: string; filterEnd?: string } => {
    if (!chartDateFilter || chartDateFilter === 'all') {
        return { filterStart: undefined, filterEnd: undefined };
    }

    const todayIso = referenceDateIso || getManilaDateIso();

    if (chartDateFilter === 'today') {
        return { filterStart: todayIso, filterEnd: todayIso };
    }

    if (chartDateFilter === 'this_week') {
        const utcd = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
        const diff = utcd === 0 ? -6 : 1 - utcd;
        return {
            filterStart: addDaysToIsoDate(todayIso, diff),
            filterEnd: todayIso,
        };
    }

    if (chartDateFilter === 'last_7_days') {
        return {
            filterStart: addDaysToIsoDate(todayIso, -6),
            filterEnd: todayIso,
        };
    }

    if (chartDateFilter === 'this_month') {
        return {
            filterStart: `${todayIso.slice(0, 7)}-01`,
            filterEnd: todayIso,
        };
    }

    if (chartDateFilter.startsWith('month_')) {
        const monthPrefix = chartDateFilter.replace('month_', '');
        const [y, m] = monthPrefix.split('-').map(Number);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return {
            filterStart: `${monthPrefix}-01`,
            filterEnd: `${monthPrefix}-${String(lastDay).padStart(2, '0')}`,
        };
    }

    return { filterStart: undefined, filterEnd: undefined };
};

export const extractAvailableMonths = (
    transactions: SalesReportTransaction[] = [],
    timeline: SalesReportDailyPoint[] = []
): string[] => {
    const monthsSet = new Set<string>();
    for (const tx of transactions) {
        if (tx.date && tx.date.length >= 7) {
            monthsSet.add(tx.date.slice(0, 7));
        }
    }
    for (const p of timeline) {
        if (Number(p.totalRevenue) > 0 && p.date && p.date.length >= 7) {
            monthsSet.add(p.date.slice(0, 7));
        }
    }
    return Array.from(monthsSet).sort().reverse();
};

export const getBoundedTimeline = (
    timeline: SalesReportDailyPoint[] = [],
    transactions: SalesReportTransaction[] = [],
    filterStart?: string,
    filterEnd?: string
): SalesReportDailyPoint[] => {
    const rawFiltered = timeline.filter((point) => {
        if (filterStart && point.date < filterStart) return false;
        if (filterEnd && point.date > filterEnd) return false;
        return Number(point.totalRevenue) > 0;
    });

    if (rawFiltered.length > 0) {
        return rawFiltered.slice().sort((a, b) => a.date.localeCompare(b.date));
    }

    const filteredTransactions = transactions.filter((tx) => {
        if (filterStart && tx.date < filterStart) return false;
        if (filterEnd && tx.date > filterEnd) return false;
        return true;
    });

    if (filteredTransactions.length > 0) {
        const dateMap = new Map<string, SalesReportDailyPoint>();

        for (const tx of filteredTransactions) {
            const d = tx.date;
            if (!dateMap.has(d)) {
                dateMap.set(d, {
                    date: d,
                    formattedDate: formatReportDate(d),
                    day: '',
                    totalRevenue: 0,
                    cashRevenue: 0,
                    digitalRevenue: 0,
                    transactionCount: 0,
                });
            }
            const entry = dateMap.get(d)!;
            const amt = Number(tx.amount || 0);
            entry.totalRevenue = Number((entry.totalRevenue + amt).toFixed(2));
            if (tx.paymentMethod.toLowerCase() === 'cash') {
                entry.cashRevenue = Number((entry.cashRevenue + amt).toFixed(2));
            } else {
                entry.digitalRevenue = Number((entry.digitalRevenue + amt).toFixed(2));
            }
            entry.transactionCount += 1;
        }

        return Array.from(dateMap.values())
            .filter((p) => p.totalRevenue > 0)
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    return [];
};

export const formatChartDateRangeSubtitle = (timeline: SalesReportDailyPoint[]): string | null => {
    if (!timeline || timeline.length === 0) return null;
    const firstDate = timeline[0].date;
    const lastDate = timeline[timeline.length - 1].date;
    const firstFormatted = formatReportDate(firstDate);
    const lastFormatted = formatReportDate(lastDate);
    if (!firstFormatted) return null;
    return firstFormatted === lastFormatted ? firstFormatted : `${firstFormatted} - ${lastFormatted}`;
};

export const calculateChartPaymentDistribution = (
    transactions: SalesReportTransaction[] = [],
    summary: { totalGrossRevenue: number; cashRevenue: number; digitalRevenue: number } = { totalGrossRevenue: 0, cashRevenue: 0, digitalRevenue: 0 },
    chartDateFilter = 'all',
    filterStart?: string,
    filterEnd?: string
): ChartPieSlice[] => {
    const filteredTx = transactions.filter((tx) => {
        if (filterStart && tx.date < filterStart) return false;
        if (filterEnd && tx.date > filterEnd) return false;
        return true;
    });

    const buckets = new Map<string, number>();
    for (const tx of filteredTx) {
        const method = (tx.paymentMethod || 'Unknown').trim() || 'Unknown';
        buckets.set(method, (buckets.get(method) || 0) + Number(tx.amount || 0));
    }

    if (chartDateFilter === 'all' && buckets.size === 0 && summary.totalGrossRevenue > 0) {
        if (summary.cashRevenue > 0) buckets.set('Cash', summary.cashRevenue);
        if (summary.digitalRevenue > 0) buckets.set('Digital', summary.digitalRevenue);
    }

    return Array.from(buckets.entries()).map(([label, value], index) => ({
        label,
        value: Number(value.toFixed(2)),
        color: colorForPaymentMethod(label, index),
    })).filter((slice) => slice.value > 0);
};
