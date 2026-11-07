import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Banknote,
    Calendar,
    ChevronDown,
    CreditCard,
    DollarSign,
    Download,
    FileDown,
    PieChart,
    Printer,
    Scissors,
    Search,
} from 'lucide-react';
import { Doughnut, Line } from 'react-chartjs-2';
import type { SalesReportResponse, SalesReportTransaction } from '@demoshop/shared-types';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/auth/AuthContext';
import { api } from '@/config/api';
import { SalesStatementExportModal, type StatementExportAction } from './SalesStatementExportModal';
import { OfficialSalesStatementDocument } from './OfficialSalesStatementDocument';
import {
    calculateChartPaymentDistribution,
    extractAvailableMonths,
    formatChartDateRangeSubtitle,
    formatMonthLabel,
    formatReportDate,
    getBoundedTimeline,
    getChartDateFilterBounds,
} from './sales-chart-filters';
import {
    colorForPaymentMethod,
    darkCartesianScales,
    darkChartLegend,
    darkTooltip,
    exportCsv,
    formatCurrency,
} from './chart-theme';

interface SalesBreakdownProps {
    report: SalesReportResponse;
    startDate: string;
    endDate: string;
    dateFilterLabel: string;
    onDownloadPdf?: () => void;
    pdfDownloading?: boolean;
}

export const SalesBreakdown: React.FC<SalesBreakdownProps> = ({
    report,
    startDate,
    endDate,
    dateFilterLabel,
    onDownloadPdf,
    pdfDownloading = false,
}) => {
    const { user, role } = useAuth();
    const preparedBy = user?.username || user?.email || role || 'Shop Admin';
    const [shopName, setShopName] = useState("DemoShop's Barbershop");
    const [branchName, setBranchName] = useState('SampleBranch, Brgy. Kaypian, SJDM, Bulacan');

    // Official sales statement modal and unified print state
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportModalAction, setExportModalAction] = useState<StatementExportAction>('pdf');
    const [statementToPrint, setStatementToPrint] = useState<{
        report: SalesReportResponse;
        startDate: string;
        endDate: string;
    } | null>(null);

    const [txSearchTerm, setTxSearchTerm] = useState('');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'digital'>('all');
    const [showCharts, setShowCharts] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let isMounted = true;
        void api.get('/api/admin/settings').then((res) => {
            if (!isMounted) return;
            const data = res.data || {};
            if (typeof data.shopName === 'string' && data.shopName.trim()) {
                setShopName(data.shopName.trim());
            }
            if (typeof data.physicalAddress === 'string' && data.physicalAddress.trim()) {
                setBranchName(data.physicalAddress.trim());
            }
        }).catch(() => { });
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const handleAfterPrint = () => {
            document.body.classList.remove('printing-official-statement');
            setStatementToPrint(null);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('afterprint', handleAfterPrint);
            document.body.classList.remove('printing-official-statement');
        };
    }, []);

    const handleTriggerPrintStatement = (
        finalizedReport: SalesReportResponse,
        selStartDate: string,
        selEndDate: string
    ) => {
        setStatementToPrint({
            report: finalizedReport,
            startDate: selStartDate,
            endDate: selEndDate,
        });
        document.body.classList.add('printing-official-statement');
        setTimeout(() => {
            window.print();
        }, 120);
    };

    useEffect(() => {
        if (!isExportMenuOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
                setIsExportMenuOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsExportMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isExportMenuOpen]);

    const [chartDateFilter, setChartDateFilter] = useState<string>('all');

    useEffect(() => {
        setChartDateFilter('all');
    }, [startDate, endDate]);

    const { summary, timeline, transactions } = report;
    const displayDateRange = `${formatReportDate(startDate)} - ${formatReportDate(endDate)}`;

    const availableMonths = useMemo(() => {
        return extractAvailableMonths(transactions, timeline);
    }, [transactions, timeline]);

    const { filterStart, filterEnd } = useMemo(() => {
        return getChartDateFilterBounds(chartDateFilter);
    }, [chartDateFilter]);

    const activeTimeline = useMemo(() => {
        return getBoundedTimeline(timeline, transactions, filterStart, filterEnd);
    }, [timeline, transactions, filterStart, filterEnd]);

    const chartDateRangeText = useMemo(() => {
        return formatChartDateRangeSubtitle(activeTimeline);
    }, [activeTimeline]);

    const chartPieData = useMemo(() => {
        return calculateChartPaymentDistribution(
            transactions,
            summary,
            chartDateFilter,
            filterStart,
            filterEnd
        );
    }, [transactions, summary, chartDateFilter, filterStart, filterEnd]);

    const chartTrendLabels = useMemo(
        () => activeTimeline.map((point) => point.formattedDate || formatReportDate(point.date)),
        [activeTimeline]
    );
    const hasChartTrendData = activeTimeline.length > 0;

    const activeFilterLabel = useMemo(() => {
        if (chartDateFilter === 'all') return dateFilterLabel || 'All Time';
        if (chartDateFilter === 'today') return 'Today';
        if (chartDateFilter === 'this_week') return 'This Week';
        if (chartDateFilter === 'last_7_days') return 'Last 7 Days';
        if (chartDateFilter === 'this_month') return 'This Month';
        if (chartDateFilter.startsWith('month_')) {
            return formatMonthLabel(chartDateFilter.replace('month_', ''));
        }
        return 'the selected timeframe';
    }, [chartDateFilter, dateFilterLabel]);

    const renderChartDateDropdown = (id: string, isMobile = false) => (
        <div className="relative inline-flex items-center">
            <select
                id={id}
                aria-label="Filter chart timeframe"
                value={chartDateFilter}
                onChange={(e) => setChartDateFilter(e.target.value)}
                className={`appearance-none bg-charcoal border border-white/15 text-ivory rounded px-2.5 py-1 text-xs font-medium focus:border-gold focus:outline-none cursor-pointer pr-7 transition-colors hover:border-white/25 [color-scheme:dark] ${isMobile ? 'text-[11px] py-1 pl-2 pr-6' : ''
                    }`}
            >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="last_7_days">Last 7 Days</option>
                <option value="this_month">This Month</option>
                {availableMonths.length > 0 && (
                    <optgroup label="Months">
                        {availableMonths.map((m) => (
                            <option key={m} value={`month_${m}`}>
                                {formatMonthLabel(m)}
                            </option>
                        ))}
                    </optgroup>
                )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-gold shrink-0" />
        </div>
    );

    const filteredTransactions = useMemo(() => {
        let list = transactions;
        if (paymentFilter === 'cash') {
            list = list.filter((t) => t.paymentMethod.toLowerCase() === 'cash');
        } else if (paymentFilter === 'digital') {
            list = list.filter((t) => t.paymentMethod.toLowerCase() !== 'cash');
        }
        const term = txSearchTerm.trim().toLowerCase();
        if (!term) return list;
        return list.filter((t: SalesReportTransaction) =>
            t.customerName.toLowerCase().includes(term)
            || t.barberName.toLowerCase().includes(term)
            || t.serviceName.toLowerCase().includes(term)
            || t.paymentMethod.toLowerCase().includes(term)
            || String(t.transactionId).toLowerCase().includes(term)
        );
    }, [transactions, paymentFilter, txSearchTerm]);

    const handleExportSalesCsv = () => {
        const headers = ['Transaction ID', 'Date', 'Time', 'Customer', 'Barber', 'Service', 'Payment Method', 'Amount (PHP)'];
        const rows = transactions.map((tx) => [
            tx.transactionId,
            tx.date,
            tx.formattedTime,
            tx.customerName,
            tx.barberName,
            tx.serviceName,
            tx.paymentMethod,
            tx.amount.toFixed(2),
        ]);
        exportCsv(`sales-report-${startDate}-to-${endDate}.csv`, headers, rows);
    };



    return (
        <>
            <div className="sales-breakdown-screen-view space-y-4">
            <div className="flex items-center justify-end print:hidden">
                <div className="relative inline-block text-left" ref={exportMenuRef}>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsExportMenuOpen((prev) => !prev)}
                        disabled={pdfDownloading}
                        className="min-h-[40px] text-xs border-white/15 bg-charcoal-light hover:bg-white/5 text-ivory font-semibold shadow-sm cursor-pointer"
                        aria-haspopup="true"
                        aria-expanded={isExportMenuOpen}
                    >
                        <Download className="mr-1.5 h-3.5 w-3.5 text-gold" />
                        <span>{pdfDownloading ? 'Preparing PDF…' : 'Export / Actions'}</span>
                        <ChevronDown className={`ml-1.5 h-3.5 w-3.5 text-ivory-dim transition-transform duration-200 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                    </Button>

                    {isExportMenuOpen && (
                        <div
                            className="absolute right-0 mt-1.5 w-56 rounded-md border border-white/10 bg-charcoal-light p-1.5 shadow-xl z-30 animate-fade-in"
                            role="menu"
                            aria-orientation="vertical"
                        >
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setIsExportMenuOpen(false);
                                    handleExportSalesCsv();
                                }}
                                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs text-ivory hover:bg-white/5 transition-colors cursor-pointer text-left"
                            >
                                <Download className="h-4 w-4 text-gold shrink-0" />
                                <div>
                                    <p className="font-semibold">Export Sales CSV</p>
                                    <p className="text-[10px] text-ivory-dim">Download spreadsheet data</p>
                                </div>
                            </button>

                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setIsExportMenuOpen(false);
                                    setExportModalAction('pdf');
                                    setIsExportModalOpen(true);
                                }}
                                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs text-left transition-colors cursor-pointer text-ivory hover:bg-white/5"
                            >
                                <FileDown className="h-4 w-4 text-sky-400 shrink-0" />
                                <div>
                                    <p className="font-semibold">Download PDF</p>
                                    <p className="text-[10px] text-ivory-dim">Official sales statement</p>
                                </div>
                            </button>

                            <div className="my-1 border-t border-white/10" />

                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setIsExportMenuOpen(false);
                                    setExportModalAction('print');
                                    setIsExportModalOpen(true);
                                }}
                                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs text-ivory hover:bg-white/5 transition-colors cursor-pointer text-left"
                            >
                                <Printer className="h-4 w-4 text-emerald-400 shrink-0" />
                                <div>
                                    <p className="font-semibold">Print View</p>
                                    <p className="text-[10px] text-ivory-dim">Official statement print preview</p>
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* KPI Metrics: Compact 3-column grid on mobile, spacious cards on tablet/desktop */}
            <div className="print-keep grid grid-cols-3 gap-2 sm:gap-4">
                <div className="rounded-lg border border-gold/30 bg-gold/5 p-2 sm:p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gold truncate">Total Sales</p>
                        <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gold shrink-0 hidden sm:block" />
                    </div>
                    <p className="mt-1 text-sm sm:text-2xl font-serif font-bold text-gold truncate">{formatCurrency(summary.totalGrossRevenue)}</p>
                    <p className="mt-0.5 text-[9px] sm:text-[10px] text-ivory-dim truncate">
                        <span className="hidden sm:inline">{summary.totalTransactionsCount} sales • average {formatCurrency(summary.averageTicketValue)}</span>
                        <span className="sm:hidden">{summary.totalTransactionsCount} sales</span>
                    </p>
                </div>
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2 sm:p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-emerald-300 truncate">Cash</p>
                        <Banknote className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0 hidden sm:block" />
                    </div>
                    <p className="mt-1 text-sm sm:text-2xl font-bold text-emerald-300 truncate">{formatCurrency(summary.cashRevenue)}</p>
                    <p className="mt-0.5 text-[9px] sm:text-[10px] text-emerald-300/80 truncate">
                        {summary.cashPercentage}% <span className="hidden sm:inline">• {summary.cashTransactionsCount} payments</span>
                    </p>
                </div>
                <div className="rounded-lg border border-sky-400/20 bg-sky-400/5 p-2 sm:p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-sky-300 truncate">Digital</p>
                        <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-400 shrink-0 hidden sm:block" />
                    </div>
                    <p className="mt-1 text-sm sm:text-2xl font-bold text-sky-300 truncate">{formatCurrency(summary.digitalRevenue)}</p>
                    <p className="mt-0.5 text-[9px] sm:text-[10px] text-sky-300/80 truncate">
                        {summary.digitalPercentage}% <span className="hidden sm:inline">• {summary.digitalTransactionsCount} payments</span>
                    </p>
                </div>
            </div>

            {/* Mobile / Tablet Collapsible Visual Analytics Drawer */}
            <div className="xl:hidden rounded-lg border border-white/10 bg-charcoal-light overflow-hidden shadow-lg print:hidden">
                <button
                    type="button"
                    onClick={() => setShowCharts((prev) => !prev)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-2">
                        <PieChart className="w-4 h-4 text-gold" />
                        <span className="text-xs font-bold uppercase tracking-wider text-gold">
                            Visual Analytics & Charts
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-ivory-dim">
                        <span>{showCharts ? 'Hide Charts' : 'View Charts'}</span>
                        <ChevronDown className={`w-4 h-4 text-gold transition-transform duration-200 ${showCharts ? 'rotate-180' : ''}`} />
                    </div>
                </button>
                {showCharts && (
                    <div className="p-3 border-t border-white/5 space-y-4 animate-fade-in">
                        {/* Mobile Doughnut */}
                        <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-charcoal p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gold">Revenue by Payment Method</h4>
                                    <p className="mt-0.5 text-[11px] text-ivory-dim">
                                        Cash vs GCash / PayMongo distribution{chartDateRangeText ? ` for ${chartDateRangeText}` : ''}.
                                    </p>
                                </div>
                                <div className="shrink-0 print:hidden">
                                    {renderChartDateDropdown('mobile-payment-method-chart-date-filter', true)}
                                </div>
                            </div>
                            <div className="relative mt-2 h-[240px] w-full min-w-0">
                                {chartPieData.length === 0 ? (
                                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                                        <div className="rounded-full bg-white/5 p-2.5 text-ivory-dim/60 mb-2">
                                            <PieChart className="h-4 w-4 text-gold/60" />
                                        </div>
                                        <p className="text-xs font-semibold text-ivory">No payment data recorded</p>
                                        <p className="mt-0.5 text-[10px] text-ivory-dim/70">
                                            No payment-method revenue recorded for {activeFilterLabel}.
                                        </p>
                                    </div>
                                ) : (
                                    <Doughnut
                                        data={{
                                            labels: chartPieData.map((slice) => slice.label),
                                            datasets: [{
                                                data: chartPieData.map((slice) => slice.value),
                                                backgroundColor: chartPieData.map((slice) => slice.color),
                                                borderColor: '#2A2A2A',
                                                borderWidth: 2,
                                                hoverOffset: 6,
                                            }],
                                        }}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            plugins: {
                                                legend: { position: 'bottom', ...darkChartLegend },
                                                tooltip: {
                                                    ...darkTooltip,
                                                    callbacks: {
                                                        label: (context) => {
                                                            const value = Number(context.parsed || 0);
                                                            return `${context.label}: ${formatCurrency(value)}`;
                                                        },
                                                    },
                                                },
                                            },
                                            cutout: '58%',
                                        }}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Mobile Trend */}
                        <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-charcoal p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gold">Revenue Trend</h4>
                                    <p className="mt-0.5 text-[11px] text-ivory-dim">
                                        Daily cash, digital, and total collections{chartDateRangeText ? ` (${chartDateRangeText})` : ''}.
                                    </p>
                                </div>
                                <div className="shrink-0 print:hidden">
                                    {renderChartDateDropdown('mobile-trend-chart-date-filter', true)}
                                </div>
                            </div>
                            <div className="relative mt-2 h-[240px] w-full min-w-0">
                                {!hasChartTrendData ? (
                                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                                        <div className="rounded-full bg-white/5 p-2.5 text-ivory-dim/60 mb-2">
                                            <Calendar className="h-4 w-4 text-gold/60" />
                                        </div>
                                        <p className="text-xs font-semibold text-ivory">No revenue trend data</p>
                                        <p className="mt-0.5 text-[10px] text-ivory-dim/70">
                                            No daily revenue trend to chart for {activeFilterLabel}.
                                        </p>
                                    </div>
                                ) : (
                                    <Line
                                        data={{
                                            labels: chartTrendLabels,
                                            datasets: [
                                                {
                                                    label: 'Total',
                                                    data: activeTimeline.map((point) => Number(point.totalRevenue)),
                                                    borderColor: '#D4AF37',
                                                    backgroundColor: 'rgba(212,175,55,0.12)',
                                                    tension: 0.3,
                                                    fill: true,
                                                    pointRadius: activeTimeline.length <= 14 ? 3 : 0,
                                                },
                                                {
                                                    label: 'Cash',
                                                    data: activeTimeline.map((point) => Number(point.cashRevenue)),
                                                    borderColor: '#34d399',
                                                    backgroundColor: 'transparent',
                                                    tension: 0.3,
                                                    pointRadius: activeTimeline.length <= 14 ? 3 : 0,
                                                },
                                                {
                                                    label: 'Digital',
                                                    data: activeTimeline.map((point) => Number(point.digitalRevenue)),
                                                    borderColor: '#38bdf8',
                                                    backgroundColor: 'transparent',
                                                    tension: 0.3,
                                                    pointRadius: activeTimeline.length <= 14 ? 3 : 0,
                                                },
                                            ],
                                        }}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            interaction: { mode: 'index', intersect: false },
                                            plugins: {
                                                legend: { position: 'bottom', ...darkChartLegend },
                                                tooltip: darkTooltip,
                                            },
                                            scales: darkCartesianScales,
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop Side-by-Side Charts (xl+ and print view) */}
            <div className="hidden xl:grid xl:grid-cols-2 gap-4 print:grid print:grid-cols-2">
                <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-charcoal-light p-4 shadow-xl">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Revenue by Payment Method</h3>
                            <p className="mt-1 text-xs text-ivory-dim">
                                Cash vs GCash / PayMongo distribution{chartDateRangeText ? ` for ${chartDateRangeText}` : ''}.
                            </p>
                        </div>
                        <div className="shrink-0 print:hidden">
                            {renderChartDateDropdown('payment-method-chart-date-filter')}
                        </div>
                    </div>
                    <div className="relative mt-2 h-[280px] w-full min-w-0 print:hidden">
                        {chartPieData.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                                <div className="rounded-full bg-white/5 p-3 text-ivory-dim/60 mb-2">
                                    <PieChart className="h-5 w-5 text-gold/60" />
                                </div>
                                <p className="text-xs font-semibold text-ivory">No payment data recorded</p>
                                <p className="mt-1 text-[11px] text-ivory-dim/70">
                                    No payment-method revenue recorded for {activeFilterLabel}.
                                </p>
                            </div>
                        ) : (
                            <Doughnut
                                data={{
                                    labels: chartPieData.map((slice) => slice.label),
                                    datasets: [{
                                        data: chartPieData.map((slice) => slice.value),
                                        backgroundColor: chartPieData.map((slice) => slice.color),
                                        borderColor: '#2A2A2A',
                                        borderWidth: 2,
                                        hoverOffset: 6,
                                    }],
                                }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'bottom', ...darkChartLegend },
                                        tooltip: {
                                            ...darkTooltip,
                                            callbacks: {
                                                label: (context) => {
                                                    const value = Number(context.parsed || 0);
                                                    return `${context.label}: ${formatCurrency(value)}`;
                                                },
                                            },
                                        },
                                    },
                                    cutout: '58%',
                                }}
                            />
                        )}
                    </div>
                    {chartPieData.length > 0 && (
                        <table className="print-summary-table hidden print:table">
                            <thead>
                                <tr>
                                    <th>Payment method</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {chartPieData.map((slice) => (
                                    <tr key={slice.label}>
                                        <td>{slice.label}</td>
                                        <td>{formatCurrency(slice.value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-charcoal-light p-4 shadow-xl">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Revenue Trend</h3>
                            <p className="mt-1 text-xs text-ivory-dim">
                                Daily cash, digital, and total collections{chartDateRangeText ? ` (${chartDateRangeText})` : ''}.
                            </p>
                        </div>
                        <div className="shrink-0 print:hidden">
                            {renderChartDateDropdown('trend-chart-date-filter')}
                        </div>
                    </div>
                    <div className="relative mt-2 h-[280px] w-full min-w-0 print:hidden">
                        {!hasChartTrendData ? (
                            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                                <div className="rounded-full bg-white/5 p-3 text-ivory-dim/60 mb-2">
                                    <Calendar className="h-5 w-5 text-gold/60" />
                                </div>
                                <p className="text-xs font-semibold text-ivory">No revenue trend data</p>
                                <p className="mt-1 text-[11px] text-ivory-dim/70">
                                    No daily revenue trend to chart for {activeFilterLabel}.
                                </p>
                            </div>
                        ) : (
                            <Line
                                data={{
                                    labels: chartTrendLabels,
                                    datasets: [
                                        {
                                            label: 'Total',
                                            data: activeTimeline.map((point) => Number(point.totalRevenue)),
                                            borderColor: '#D4AF37',
                                            backgroundColor: 'rgba(212,175,55,0.12)',
                                            tension: 0.3,
                                            fill: true,
                                            pointRadius: activeTimeline.length <= 14 ? 3 : 0,
                                        },
                                        {
                                            label: 'Cash',
                                            data: activeTimeline.map((point) => Number(point.cashRevenue)),
                                            borderColor: '#34d399',
                                            backgroundColor: 'transparent',
                                            tension: 0.3,
                                            pointRadius: activeTimeline.length <= 14 ? 3 : 0,
                                        },
                                        {
                                            label: 'Digital',
                                            data: activeTimeline.map((point) => Number(point.digitalRevenue)),
                                            borderColor: '#38bdf8',
                                            backgroundColor: 'transparent',
                                            tension: 0.3,
                                            pointRadius: activeTimeline.length <= 14 ? 3 : 0,
                                        },
                                    ],
                                }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    interaction: { mode: 'index', intersect: false },
                                    plugins: {
                                        legend: { position: 'bottom', ...darkChartLegend },
                                        tooltip: darkTooltip,
                                    },
                                    scales: darkCartesianScales,
                                }}
                            />
                        )}
                    </div>
                    {hasChartTrendData && (
                        <table className="print-summary-table hidden print:table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Cash</th>
                                    <th>Digital</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeTimeline.map((point) => (
                                    <tr key={point.formattedDate}>
                                        <td>{point.formattedDate}</td>
                                        <td>{formatCurrency(point.cashRevenue)}</td>
                                        <td>{formatCurrency(point.digitalRevenue)}</td>
                                        <td>{formatCurrency(point.totalRevenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-charcoal-light shadow-xl overflow-visible lg:overflow-hidden">
                <div className="flex flex-col justify-between gap-3 border-b border-white/10 bg-charcoal/40 p-4 sm:flex-row sm:items-center rounded-t-lg">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Sales Details</h3>
                        <p className="mt-0.5 text-xs text-ivory-dim">
                            {transactions.length} completed sales ({displayDateRange}).
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center print:hidden">
                        <div className="flex rounded border border-white/10 bg-charcoal p-0.5">
                            {(['all', 'cash', 'digital'] as const).map((method) => (
                                <button
                                    key={method}
                                    type="button"
                                    onClick={() => setPaymentFilter(method)}
                                    className={`min-h-[44px] rounded px-3 py-1 text-xs font-bold capitalize transition-colors ${paymentFilter === method
                                        ? 'bg-gold text-charcoal'
                                        : 'text-ivory-dim hover:text-ivory'
                                        }`}
                                >
                                    {method === 'all' ? 'All Channels' : method}
                                </button>
                            ))}
                        </div>
                        <div className="relative w-full sm:w-64">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
                            <input
                                type="text"
                                placeholder="Search customer, barber, service..."
                                value={txSearchTerm}
                                onChange={(e) => setTxSearchTerm(e.target.value)}
                                className="min-h-[44px] w-full rounded border border-white/10 bg-charcoal py-1.5 pl-8 pr-3 text-xs text-ivory outline-none focus:border-gold/60"
                            />
                        </div>
                    </div>
                </div>

                {filteredTransactions.length === 0 ? (
                    <p className="p-8 text-center text-xs text-ivory-dim">No sales match your filters for {dateFilterLabel}.</p>
                ) : (
                    <>
                        {/* Mobile Stacked Card View */}
                        <div className="block md:hidden divide-y divide-white/5 p-3 space-y-3">
                            {filteredTransactions.map((tx) => (
                                <div key={tx.transactionId} className="rounded-lg border border-white/10 bg-charcoal/60 p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="font-mono font-bold text-gold text-xs">TX-{tx.transactionId}</span>
                                            <span className="text-[10px] text-ivory-dim ml-2 font-mono">{tx.formattedDate} • {tx.formattedTime}</span>
                                        </div>
                                        <span className="font-mono font-bold text-gold text-sm">
                                            {formatCurrency(tx.amount)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-ivory">{tx.customerName}</span>
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tx.paymentMethod.toLowerCase() === 'cash'
                                                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                                                : 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                                                }`}
                                        >
                                            {tx.paymentMethod.toLowerCase() === 'cash' ? (
                                                <Banknote className="h-3 w-3" />
                                            ) : (
                                                <CreditCard className="h-3 w-3" />
                                            )}
                                            {tx.paymentMethod}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-ivory-dim border-t border-white/5 pt-2">
                                        <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                                            <Scissors className="w-3 h-3 text-gold/70 shrink-0" />
                                            <span className="truncate text-ivory-dim">{tx.serviceName}</span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 text-ivory">
                                            <span className="text-[10px] text-ivory-dim">Barber:</span>
                                            <span className="font-medium text-xs text-ivory">{tx.barberName}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop / Tablet Table View */}
                        <div className="hidden md:block overflow-x-auto overflow-y-auto admin-table-scroll">
                            <table className="w-full min-w-[750px] text-left text-xs">
                                <thead className="border-b border-white/10 bg-charcoal text-[10px] uppercase tracking-wider text-ivory-dim">
                                    <tr>
                                        <th className="px-4 py-3">TX ID / Time</th>
                                        <th className="px-4 py-3">Customer</th>
                                        <th className="px-4 py-3">Service</th>
                                        <th className="px-4 py-3">Barber</th>
                                        <th className="px-4 py-3">Payment Method</th>
                                        <th className="px-4 py-3 text-right font-bold text-gold">Amount (₱)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredTransactions.map((tx) => (
                                        <tr key={tx.transactionId} className="hover:bg-white/[0.03]">
                                            <td className="px-4 py-3">
                                                <p className="font-mono font-bold text-ivory">TX-{tx.transactionId}</p>
                                                <p className="text-[10px] text-ivory-dim">{tx.formattedDate} • {tx.formattedTime}</p>
                                            </td>
                                            <td className="px-4 py-3 font-bold text-ivory">{tx.customerName}</td>
                                            <td className="px-4 py-3 text-ivory-dim">{tx.serviceName}</td>
                                            <td className="px-4 py-3 text-ivory">{tx.barberName}</td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${tx.paymentMethod.toLowerCase() === 'cash'
                                                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                                                        : 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                                                        }`}
                                                >
                                                    {tx.paymentMethod.toLowerCase() === 'cash' ? (
                                                        <Banknote className="h-3 w-3" />
                                                    ) : (
                                                        <CreditCard className="h-3 w-3" />
                                                    )}
                                                    {tx.paymentMethod}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-gold">
                                                {formatCurrency(tx.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
            </div>

            {/* Date Range Selection & Export Configuration Modal */}
            <SalesStatementExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                initialAction={exportModalAction}
                currentReport={report}
                currentStartDate={startDate}
                currentEndDate={endDate}
                preparedBy={preparedBy}
                onTriggerPrintStatement={handleTriggerPrintStatement}
            />

            {/* Unified Official Sales Statement Print Layout (Matches Download PDF 1:1) */}
            {statementToPrint && (
                <div className="official-statement-print-root hidden print:block">
                    <OfficialSalesStatementDocument
                        report={statementToPrint.report}
                        startDate={statementToPrint.startDate}
                        endDate={statementToPrint.endDate}
                        preparedBy={preparedBy}
                        shopName={shopName}
                        branchName={branchName}
                        excludeEmptyDates
                    />
                </div>
            )}
        </>
    );
};

export default SalesBreakdown;
