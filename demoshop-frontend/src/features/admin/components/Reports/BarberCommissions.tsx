import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Award,
    CheckCircle2,
    ChevronDown,
    Download,
    FileDown,
    History,
    Printer,
    Search,
    TrendingUp,
    Users,
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import type { BarberCommissionItem, BarberCommissionResponse } from '@demoshop/shared-types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import {
    darkChartLegend,
    darkTooltip,
    exportCsv,
    formatCurrency,
} from './chart-theme';

interface BarberCommissionsProps {
    report: BarberCommissionResponse;
    startDate: string;
    endDate: string;
    dateFilterLabel: string;
    onDownloadPdf?: () => void;
    pdfDownloading?: boolean;
}

export const BarberCommissions: React.FC<BarberCommissionsProps> = ({
    report,
    startDate,
    endDate,
    dateFilterLabel,
    onDownloadPdf,
    pdfDownloading = false,
}) => {
    const [barberFilter, setBarberFilter] = useState('');
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [paidBarberIds, setPaidBarberIds] = useState<Set<number>>(new Set());
    const [voucherBarber, setVoucherBarber] = useState<BarberCommissionItem | null>(null);
    const [historyBarber, setHistoryBarber] = useState<BarberCommissionItem | null>(null);
    const { addToast } = useToast();

    const [showCharts, setShowCharts] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

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

    const { summary, barbers } = report;

    const filteredBarbers = useMemo(() => {
        const term = barberFilter.trim().toLowerCase();
        if (!term) return barbers;
        return barbers.filter((b: BarberCommissionItem) =>
            b.barberName.toLowerCase().includes(term) || (b.role && b.role.toLowerCase().includes(term))
        );
    }, [barbers, barberFilter]);

    const topBarber = useMemo(() => {
        if (barbers.length === 0) return null;
        return [...barbers].sort((a, b) => b.netCommissionPayout - a.netCommissionPayout)[0];
    }, [barbers]);

    const chartBarbers = useMemo(
        () => filteredBarbers.filter((b) => b.netCommissionPayout > 0 || b.completedServicesCount > 0),
        [filteredBarbers],
    );

    const toggleRow = (barberId: number | string) => {
        const key = String(barberId);
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const handlePrintVoucher = (barber: BarberCommissionItem) => {
        setVoucherBarber(barber);
    };

    const handleMarkPaid = (barber: BarberCommissionItem) => {
        setPaidBarberIds((prev) => {
            const next = new Set(prev);
            const isCurrentlyPaid = next.has(barber.barberId);
            if (isCurrentlyPaid) {
                next.delete(barber.barberId);
                addToast({
                    type: 'info',
                    title: 'Status Updated',
                    message: `Marked ${barber.barberName}'s payout as unpaid.`,
                });
            } else {
                next.add(barber.barberId);
                addToast({
                    type: 'success',
                    title: 'Commission Paid',
                    message: `Marked ${barber.barberName}'s payout of ${formatCurrency(barber.netCommissionPayout)} as paid.`,
                });
            }
            return next;
        });
    };

    const handleViewHistory = (barber: BarberCommissionItem) => {
        setHistoryBarber(barber);
    };

    const handleExportCommissionsCsv = () => {
        const headers = [
            'Barber ID',
            'Barber Name',
            'Role',
            'Completed Services',
            'Gross Sales (PHP)',
            'Commission Rate',
            'Commission Rate Tier',
            'Net Commission Payout (PHP)',
            'Shop Net Revenue (PHP)',
        ];
        const rows = barbers.map((b) => [
            b.barberId,
            b.barberName,
            b.role || 'Barber',
            b.completedServicesCount,
            b.totalGrossSales.toFixed(2),
            `${(b.commissionRate * 100).toFixed(0)}%`,
            b.commissionRateLabel,
            b.netCommissionPayout.toFixed(2),
            b.shopNetRevenue.toFixed(2),
        ]);
        exportCsv(`barber-commissions-${startDate}-to-${endDate}.csv`, headers, rows);
    };

    const chartHeight = Math.max(280, chartBarbers.length * 48);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end print:hidden">
                <div className="relative inline-block text-left" ref={exportMenuRef}>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsExportMenuOpen((prev) => !prev)}
                        disabled={pdfDownloading}
                        className="min-h-[40px] text-xs border-white/15 bg-charcoal-light hover:bg-white/5 text-ivory font-semibold shadow-sm"
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
                                    handleExportCommissionsCsv();
                                }}
                                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs text-ivory hover:bg-white/5 transition-colors cursor-pointer text-left"
                            >
                                <Download className="h-4 w-4 text-gold shrink-0" />
                                <div>
                                    <p className="font-semibold">Export CSV</p>
                                    <p className="text-[10px] text-ivory-dim">Download spreadsheet data</p>
                                </div>
                            </button>

                            <button
                                type="button"
                                role="menuitem"
                                disabled={!onDownloadPdf || pdfDownloading}
                                onClick={() => {
                                    setIsExportMenuOpen(false);
                                    onDownloadPdf?.();
                                }}
                                className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs text-left transition-colors cursor-pointer ${
                                    !onDownloadPdf || pdfDownloading
                                        ? 'opacity-50 cursor-not-allowed text-ivory-dim'
                                        : 'text-ivory hover:bg-white/5'
                                }`}
                            >
                                <FileDown className="h-4 w-4 text-sky-400 shrink-0" />
                                <div>
                                    <p className="font-semibold">Download PDF</p>
                                    <p className="text-[10px] text-ivory-dim">Official payout statement</p>
                                </div>
                            </button>

                            <div className="my-1 border-t border-white/10" />

                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setIsExportMenuOpen(false);
                                    window.print();
                                }}
                                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs text-ivory hover:bg-white/5 transition-colors cursor-pointer text-left"
                            >
                                <Printer className="h-4 w-4 text-emerald-400 shrink-0" />
                                <div>
                                    <p className="font-semibold">Print View</p>
                                    <p className="text-[10px] text-ivory-dim">Send report to printer</p>
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
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gold truncate">Total Payouts</p>
                        <Award className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gold shrink-0 hidden sm:block" />
                    </div>
                    <p className="mt-1 text-sm sm:text-2xl font-serif font-bold text-gold truncate">{formatCurrency(summary.totalCommissionPayout)}</p>
                    <p className="mt-0.5 text-[9px] sm:text-[10px] text-gold/80 truncate">
                        <span className="hidden sm:inline">{summary.totalServicesCompleted} completed services</span>
                        <span className="sm:hidden">{summary.totalServicesCompleted} services</span>
                    </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-charcoal-light p-2 sm:p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-ivory-dim truncate">Top Barber</p>
                        <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-ivory-dim shrink-0 hidden sm:block" />
                    </div>
                    <p className="mt-1 text-sm sm:text-2xl font-serif font-bold text-ivory truncate">{topBarber?.barberName || '—'}</p>
                    <p className="mt-0.5 text-[9px] sm:text-[10px] text-ivory-dim truncate">
                        {topBarber
                            ? `${formatCurrency(topBarber.netCommissionPayout)}`
                            : 'No data'}
                    </p>
                </div>
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2 sm:p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-emerald-300 truncate">Shop Net</p>
                        <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0 hidden sm:block" />
                    </div>
                    <p className="mt-1 text-sm sm:text-2xl font-serif font-bold text-emerald-300 truncate">{formatCurrency(summary.totalShopNetRevenue)}</p>
                    <p className="mt-0.5 text-[9px] sm:text-[10px] text-emerald-300/80 truncate">Gross {formatCurrency(summary.totalGrossSales)}</p>
                </div>
            </div>

            {/* Mobile / Tablet Collapsible Visual Analytics Drawer (< md) */}
            <div className="md:hidden rounded-lg border border-white/10 bg-charcoal-light overflow-hidden shadow-lg print:hidden">
                <button
                    type="button"
                    onClick={() => setShowCharts((prev) => !prev)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-gold" />
                        <span className="text-xs font-bold uppercase tracking-wider text-gold">
                            Visual Analytics • Commission Chart
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-ivory-dim">
                        <span>{showCharts ? 'Hide Chart' : 'View Chart'}</span>
                        <ChevronDown className={`w-4 h-4 text-gold transition-transform duration-200 ${showCharts ? 'rotate-180' : ''}`} />
                    </div>
                </button>
                {showCharts && (
                    <div className="p-3 border-t border-white/5 space-y-2 animate-fade-in touch-pan-y">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gold">Commission Earnings by Barber</h4>
                        <p className="text-[11px] text-ivory-dim">Horizontal comparison of net payouts. 40% base, 50% high-volume tier at ₱3,000.</p>
                        <div className="mt-2 w-full min-w-0 touch-pan-y" style={{ height: Math.max(220, chartBarbers.length * 36) }}>
                            {chartBarbers.length === 0 ? (
                                <div className="flex h-32 items-center justify-center text-xs text-ivory-dim">
                                    No barber commission earnings to chart for {dateFilterLabel}.
                                </div>
                            ) : (
                                <Bar
                                    data={{
                                        labels: chartBarbers.map((b) => b.barberName),
                                        datasets: [{
                                            label: 'Commission Payout',
                                            data: chartBarbers.map((b) => b.netCommissionPayout),
                                            backgroundColor: 'rgba(212,175,55,0.75)',
                                            borderColor: '#D4AF37',
                                            borderWidth: 1,
                                            borderRadius: 4,
                                        }],
                                    }}
                                    options={{
                                        indexAxis: 'y',
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { display: false, ...darkChartLegend },
                                            tooltip: darkTooltip,
                                        },
                                        scales: {
                                            x: {
                                                ticks: {
                                                    color: '#E0E0D0',
                                                    font: { size: 10 },
                                                    callback: (value) => formatCurrency(Number(value)),
                                                },
                                                grid: { color: 'rgba(255,255,255,0.08)' },
                                            },
                                            y: {
                                                ticks: { color: '#FFFFF0', font: { size: 10 } },
                                                grid: { display: false },
                                            },
                                        },
                                    }}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop Full Visual Analytics Card (>= md) */}
            <div className="hidden md:block min-w-0 overflow-visible rounded-lg border border-white/10 bg-charcoal-light p-4 shadow-xl touch-pan-y">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Commission Earnings by Barber</h3>
                <p className="mt-1 text-xs text-ivory-dim">
                    Horizontal comparison of net payouts. 40% base, 50% high-volume tier at ₱3,000.
                </p>
                <div className="mt-2 w-full min-w-0 h-full min-h-[280px] print:hidden" style={{ minHeight: chartHeight }}>
                    {chartBarbers.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-xs text-ivory-dim">
                            No barber commission earnings to chart for {dateFilterLabel}.
                        </div>
                    ) : (
                        <Bar
                            data={{
                                labels: chartBarbers.map((b) => b.barberName),
                                datasets: [{
                                    label: 'Commission Payout',
                                    data: chartBarbers.map((b) => b.netCommissionPayout),
                                    backgroundColor: 'rgba(212,175,55,0.75)',
                                    borderColor: '#D4AF37',
                                    borderWidth: 1,
                                    borderRadius: 4,
                                }],
                            }}
                            options={{
                                indexAxis: 'y',
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { display: false, ...darkChartLegend },
                                    tooltip: darkTooltip,
                                },
                                scales: {
                                    x: {
                                        ticks: {
                                            color: '#E0E0D0',
                                            font: { size: 10 },
                                            callback: (value) => formatCurrency(Number(value)),
                                        },
                                        grid: { color: 'rgba(255,255,255,0.08)' },
                                    },
                                    y: {
                                        ticks: { color: '#FFFFF0', font: { size: 11 } },
                                        grid: { display: false },
                                    },
                                },
                            }}
                        />
                    )}
                </div>
                {chartBarbers.length > 0 && (
                    <table className="print-summary-table hidden print:table">
                        <thead>
                            <tr>
                                <th>Barber</th>
                                <th>Commission payout</th>
                                <th>Services</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chartBarbers.map((barber) => (
                                <tr key={barber.barberId}>
                                    <td>{barber.barberName}</td>
                                    <td>{formatCurrency(barber.netCommissionPayout)}</td>
                                    <td>{barber.completedServicesCount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="rounded-lg border border-white/10 bg-charcoal-light shadow-xl overflow-visible touch-pan-y">
                <div className="flex flex-col justify-between gap-3 border-b border-white/10 bg-charcoal/40 p-4 sm:flex-row sm:items-center rounded-t-lg">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-gold">Barber Commission Breakdown</h3>
                        <p className="mt-0.5 text-xs text-ivory-dim">
                            Exact numerical payouts for {dateFilterLabel}.
                        </p>
                    </div>
                    <div className="relative w-full sm:w-64 print:hidden">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
                        <input
                            type="text"
                            placeholder="Filter by barber name..."
                            value={barberFilter}
                            onChange={(e) => setBarberFilter(e.target.value)}
                            className="min-h-[44px] w-full rounded border border-white/10 bg-charcoal py-1.5 pl-8 pr-3 text-xs text-ivory outline-none focus:border-gold/60"
                        />
                    </div>
                </div>

                {filteredBarbers.length === 0 ? (
                    <p className="p-8 text-center text-xs text-ivory-dim">No barber commission records found for {dateFilterLabel}.</p>
                ) : (
                    <>
                        {/* ========================================================================= */}
                        {/* 1. MOBILE RESPONSIVE ACCORDION VIEW (< md / < 768px)                      */}
                        {/* ========================================================================= */}
                        <div className="divide-y divide-white/10 md:hidden">
                            {filteredBarbers.map((b) => {
                                const isExpanded = expandedRows.has(String(b.barberId));
                                const isPaid = paidBarberIds.has(b.barberId);

                                return (
                                    <div
                                        key={b.barberId}
                                        className={`transition-colors ${
                                            isExpanded
                                                ? 'bg-white/[0.04] border-l-2 border-gold'
                                                : 'hover:bg-white/[0.02]'
                                        }`}
                                    >
                                        {/* Primary Row Header (Always Visible on Mobile) */}
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={isExpanded}
                                            onClick={() => toggleRow(b.barberId)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    toggleRow(b.barberId);
                                                }
                                            }}
                                            className="flex cursor-pointer items-center justify-between gap-3 p-3.5 select-none focus:outline-none focus:bg-white/[0.04]"
                                        >
                                            {/* Barber Avatar + Name / Role */}
                                            <div className="flex items-center gap-3 min-w-0">
                                                {b.avatarUrl ? (
                                                    <img
                                                        src={b.avatarUrl}
                                                        alt={b.barberName}
                                                        className="h-10 w-10 shrink-0 rounded-full border border-gold/30 object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 font-bold text-xs text-gold">
                                                        {b.barberName.slice(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="truncate font-bold text-sm text-ivory">{b.barberName}</p>
                                                        {isPaid && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400">
                                                                Paid
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
                                                            {b.role || 'BARBER / STAFF'}
                                                        </span>
                                                        {b.isHigherTier && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.2 text-[9px] font-bold text-gold">
                                                                <Award className="h-2.5 w-2.5" />
                                                                {b.commissionRateLabel}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Net Commission / Total Payout + Chevron */}
                                            <div className="flex items-center gap-2.5 shrink-0">
                                                <div className="text-right">
                                                    <div className="font-mono text-sm font-bold text-gold">
                                                        {formatCurrency(b.netCommissionPayout)}
                                                    </div>
                                                    <p className="text-[10px] text-ivory-dim">
                                                        {b.completedServicesCount} {b.completedServicesCount === 1 ? 'service' : 'services'}
                                                    </p>
                                                </div>
                                                <div
                                                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                                                        isExpanded ? 'bg-gold/20 text-gold' : 'bg-charcoal text-ivory-dim hover:text-ivory'
                                                    }`}
                                                    title={isExpanded ? 'Collapse breakdown' : 'Expand breakdown'}
                                                >
                                                    <ChevronDown
                                                        className={`h-4 w-4 transition-transform duration-200 ${
                                                            isExpanded ? 'rotate-180 text-gold' : ''
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expandable Accordion Panel (Secondary Breakdown Details) */}
                                        {isExpanded && (
                                            <div className="border-t border-white/5 bg-charcoal/80 px-4 py-3.5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                                {/* Clean Key-Value Summary List */}
                                                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                            Services Completed
                                                        </span>
                                                        <p className="mt-0.5 font-mono text-sm font-semibold text-ivory">
                                                            {b.completedServicesCount}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                            Gross Sales Generated
                                                        </span>
                                                        <p className="mt-0.5 font-mono text-sm font-semibold text-ivory">
                                                            {formatCurrency(b.totalGrossSales)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                            Service Commission Rate
                                                        </span>
                                                        <p className="mt-0.5 font-mono text-sm font-semibold text-gold">
                                                            {(b.commissionRate * 100).toFixed(0)}% ({b.commissionRateLabel})
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                            Service Commission Amount
                                                        </span>
                                                        <p className="mt-0.5 font-mono text-sm font-semibold text-gold">
                                                            {formatCurrency(b.netCommissionPayout)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                            Product Commission
                                                        </span>
                                                        <p className="mt-0.5 font-mono text-xs text-ivory-dim">
                                                            0% ({formatCurrency(0)})
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                            Deductions / Advances
                                                        </span>
                                                        <p className="mt-0.5 font-mono text-xs text-ivory-dim">
                                                            None ({formatCurrency(0)})
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                                                            Shop Net Revenue
                                                        </span>
                                                        <p className="mt-0.5 font-mono text-sm font-semibold text-emerald-400">
                                                            {formatCurrency(b.shopNetRevenue)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">
                                                            Avg Ticket Value
                                                        </span>
                                                        <p className="mt-0.5 font-mono text-xs text-ivory">
                                                            {formatCurrency(b.averageTicketValue)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Total Payout / Net Commission Due Highlight */}
                                                <div className="flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 p-3">
                                                    <div>
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gold">
                                                            Total Payout / Net Commission Due
                                                        </p>
                                                        <p className="text-[11px] text-ivory-dim">
                                                            Payable for {dateFilterLabel}
                                                        </p>
                                                    </div>
                                                    <span className="font-mono text-lg font-bold text-gold">
                                                        {formatCurrency(b.netCommissionPayout)}
                                                    </span>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handlePrintVoucher(b);
                                                        }}
                                                        className="flex flex-1 min-h-[40px] items-center justify-center gap-1.5 rounded-md border border-gold/40 bg-gold/15 px-3 py-2 text-xs font-bold text-gold transition-colors hover:bg-gold/25 active:scale-95"
                                                    >
                                                        <Printer className="h-3.5 w-3.5" />
                                                        <span>Print Voucher</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleMarkPaid(b);
                                                        }}
                                                        className={`flex flex-1 min-h-[40px] items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold transition-colors active:scale-95 ${
                                                            isPaid
                                                                ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                                                                : 'border-white/10 bg-white/5 text-ivory hover:bg-white/10'
                                                        }`}
                                                    >
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        <span>{isPaid ? 'Paid' : 'Mark Paid'}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleViewHistory(b);
                                                        }}
                                                        className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-ivory-dim transition-colors hover:text-ivory hover:bg-white/10 active:scale-95"
                                                        title="View history"
                                                    >
                                                        <History className="h-3.5 w-3.5" />
                                                        <span className="inline">History</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Mobile Total Footer Summary */}
                            <div className="border-t-2 border-white/10 bg-charcoal p-3.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold uppercase tracking-wider text-ivory">Total Commission Due</span>
                                    <span className="font-mono text-base font-bold text-gold">
                                        {formatCurrency(summary.totalCommissionPayout)}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-ivory-dim">
                                    <span>{summary.totalServicesCompleted} services across {summary.totalBarbers} barbers</span>
                                    <span className="text-emerald-400 font-mono font-medium">
                                        Shop Net: {formatCurrency(summary.totalShopNetRevenue)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ========================================================================= */}
                        {/* 2. DESKTOP FULL DATA TABLE VIEW (>= md / >= 768px)                         */}
                        {/* ========================================================================= */}
                        <div className="hidden md:block overflow-x-auto overscroll-x-contain touch-pan-y">
                            <table className="w-full min-w-[780px] text-left text-xs">
                                <thead className="border-b border-white/10 bg-charcoal text-[10px] uppercase tracking-wider text-ivory-dim">
                                    <tr>
                                        <th className="px-4 py-3">Barber / Staff</th>
                                        <th className="px-3 py-3 text-right">Services Done</th>
                                        <th className="px-3 py-3 text-right font-mono">Gross Sales (₱)</th>
                                        <th className="px-4 py-3">Commission Tier</th>
                                        <th className="px-3 py-3 text-right text-gold">Commission Payout (₱)</th>
                                        <th className="px-3 py-3 text-right text-emerald-400">Shop Net (₱)</th>
                                        <th className="px-3 py-3 text-right print:hidden">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredBarbers.map((b) => {
                                        const isPaid = paidBarberIds.has(b.barberId);

                                        return (
                                            <tr key={b.barberId} className="hover:bg-white/[0.03] transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        {b.avatarUrl ? (
                                                            <img
                                                                src={b.avatarUrl}
                                                                alt={b.barberName}
                                                                className="h-8 w-8 rounded-full border border-gold/30 object-cover"
                                                            />
                                                        ) : (
                                                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/20 bg-gold/10 font-bold text-gold">
                                                                {b.barberName.slice(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="font-bold text-ivory">{b.barberName}</p>
                                                                {isPaid && (
                                                                    <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400">
                                                                        Paid
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-ivory-dim">{b.role || 'Barber / Staff'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-right font-mono font-bold text-ivory">
                                                    {b.completedServicesCount}
                                                </td>
                                                <td className="px-3 py-3 text-right font-mono text-ivory">
                                                    {formatCurrency(b.totalGrossSales)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                                            b.isHigherTier
                                                                ? 'border-gold/40 bg-gold/10 text-gold'
                                                                : 'border-white/10 bg-charcoal text-ivory-dim'
                                                        }`}
                                                    >
                                                        {b.isHigherTier && <Award className="h-3 w-3" />}
                                                        {b.commissionRateLabel}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right font-mono font-bold text-gold">
                                                    {formatCurrency(b.netCommissionPayout)}
                                                </td>
                                                <td className="px-3 py-3 text-right font-mono font-bold text-emerald-400">
                                                    {formatCurrency(b.shopNetRevenue)}
                                                </td>
                                                <td className="px-3 py-3 text-right print:hidden">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePrintVoucher(b)}
                                                            className="rounded border border-gold/30 bg-gold/10 p-1.5 text-gold hover:bg-gold/20 active:scale-95 transition-all"
                                                            title="Print Voucher"
                                                        >
                                                            <Printer className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleMarkPaid(b)}
                                                            className={`rounded border p-1.5 transition-all active:scale-95 ${
                                                                isPaid
                                                                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                                                                    : 'border-white/10 bg-charcoal text-ivory-dim hover:text-ivory'
                                                            }`}
                                                            title={isPaid ? 'Marked as Paid' : 'Mark Paid'}
                                                        >
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewHistory(b)}
                                                            className="rounded border border-white/10 bg-charcoal p-1.5 text-ivory-dim hover:text-ivory active:scale-95 transition-all"
                                                            title="View Commission History"
                                                        >
                                                            <History className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="border-t-2 border-white/10 bg-charcoal font-bold">
                                    <tr>
                                        <td className="px-4 py-3 text-ivory">Total</td>
                                        <td className="px-3 py-3 text-right font-mono text-ivory">{summary.totalServicesCompleted}</td>
                                        <td className="px-3 py-3 text-right font-mono text-ivory">{formatCurrency(summary.totalGrossSales)}</td>
                                        <td className="px-4 py-3 text-[11px] text-ivory-dim">—</td>
                                        <td className="px-3 py-3 text-right font-mono text-gold">{formatCurrency(summary.totalCommissionPayout)}</td>
                                        <td className="px-3 py-3 text-right font-mono text-emerald-400">{formatCurrency(summary.totalShopNetRevenue)}</td>
                                        <td className="px-3 py-3 print:hidden"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* ========================================================================= */}
            {/* VOUCHER PRINT MODAL                                                       */}
            {/* ========================================================================= */}
            <Modal
                isOpen={!!voucherBarber}
                onClose={() => setVoucherBarber(null)}
                title="Barber Commission Payout Voucher"
                size="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setVoucherBarber(null)}
                            className="text-xs"
                        >
                            Close
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            onClick={() => window.print()}
                            className="text-xs"
                        >
                            <Printer className="mr-1.5 h-3.5 w-3.5" />
                            Print Voucher
                        </Button>
                    </div>
                }
            >
                {voucherBarber && (
                    <div className="space-y-4 text-xs">
                        {/* Voucher Header */}
                        <div className="border-b border-white/10 pb-3 text-center">
                            <h4 className="text-base font-serif font-bold text-gold">DEMOSHOP BARBER & CO.</h4>
                            <p className="text-[10px] uppercase tracking-widest text-ivory-dim">Official Commission Payout Slip</p>
                            <p className="mt-1 text-[11px] text-ivory-dim">
                                Period: <span className="font-semibold text-ivory">{dateFilterLabel}</span> ({startDate} — {endDate})
                            </p>
                        </div>

                        {/* Barber Info Box */}
                        <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-charcoal/60 p-3">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Barber Name</span>
                                <p className="font-bold text-sm text-ivory">{voucherBarber.barberName}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Staff Role</span>
                                <p className="font-semibold text-ivory">{voucherBarber.role || 'Barber / Staff'}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Staff ID</span>
                                <p className="font-mono text-ivory-dim">#BARBER-{voucherBarber.barberId}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim">Commission Tier</span>
                                <p className="font-bold text-gold">{voucherBarber.commissionRateLabel}</p>
                            </div>
                        </div>

                        {/* Itemized Calculations */}
                        <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-charcoal/30 px-3 py-1">
                            <div className="flex items-center justify-between py-2">
                                <span className="text-ivory-dim">Completed Services Count</span>
                                <span className="font-mono font-bold text-ivory">{voucherBarber.completedServicesCount}</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-ivory-dim">Gross Sales Revenue Generated</span>
                                <span className="font-mono font-bold text-ivory">{formatCurrency(voucherBarber.totalGrossSales)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-ivory-dim">Commission Rate Cut ({(voucherBarber.commissionRate * 100).toFixed(0)}%)</span>
                                <span className="font-mono font-bold text-gold">{formatCurrency(voucherBarber.netCommissionPayout)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-ivory-dim">Product Commission Share</span>
                                <span className="font-mono text-ivory-dim">₱0.00</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-ivory-dim">Deductions / Advances</span>
                                <span className="font-mono text-ivory-dim">₱0.00</span>
                            </div>
                            <div className="flex items-center justify-between py-2 font-bold text-sm text-gold">
                                <span className="uppercase tracking-wider">Net Amount Payable</span>
                                <span className="font-mono text-base">{formatCurrency(voucherBarber.netCommissionPayout)}</span>
                            </div>
                        </div>

                        {/* Signature section */}
                        <div className="grid grid-cols-2 gap-6 pt-4 text-center">
                            <div className="border-t border-white/20 pt-2">
                                <p className="text-[10px] uppercase tracking-wider text-ivory-dim">Authorized By (Manager)</p>
                            </div>
                            <div className="border-t border-white/20 pt-2">
                                <p className="text-[10px] uppercase tracking-wider text-ivory-dim">Received By (Barber Signature)</p>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ========================================================================= */}
            {/* COMMISSION HISTORY MODAL                                                  */}
            {/* ========================================================================= */}
            <Modal
                isOpen={!!historyBarber}
                onClose={() => setHistoryBarber(null)}
                title={`Commission History • ${historyBarber?.barberName}`}
                size="md"
                footer={
                    <div className="flex items-center justify-end w-full">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setHistoryBarber(null)}
                            className="text-xs"
                        >
                            Close
                        </Button>
                    </div>
                }
            >
                {historyBarber && (
                    <div className="space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div className="rounded-lg border border-white/10 bg-charcoal/50 p-3">
                                <span className="text-[10px] uppercase tracking-wider text-ivory-dim">Completed Services</span>
                                <p className="mt-1 font-mono text-lg font-bold text-ivory">{historyBarber.completedServicesCount}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-charcoal/50 p-3">
                                <span className="text-[10px] uppercase tracking-wider text-ivory-dim">Gross Sales</span>
                                <p className="mt-1 font-mono text-lg font-bold text-ivory">{formatCurrency(historyBarber.totalGrossSales)}</p>
                            </div>
                            <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
                                <span className="text-[10px] uppercase tracking-wider text-gold">Commission Earned</span>
                                <p className="mt-1 font-mono text-lg font-bold text-gold">{formatCurrency(historyBarber.netCommissionPayout)}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-charcoal/50 p-3">
                                <span className="text-[10px] uppercase tracking-wider text-ivory-dim">Avg Ticket Value</span>
                                <p className="mt-1 font-mono text-lg font-bold text-ivory">{formatCurrency(historyBarber.averageTicketValue)}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 col-span-2 sm:col-span-2">
                                <span className="text-[10px] uppercase tracking-wider text-emerald-300">Shop Net Generated</span>
                                <p className="mt-1 font-mono text-lg font-bold text-emerald-400">{formatCurrency(historyBarber.shopNetRevenue)}</p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-charcoal/40 p-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-ivory-dim">Current Tier Performance</span>
                                <span className="font-bold text-gold">{historyBarber.commissionRateLabel}</span>
                            </div>
                            <p className="text-[11px] text-ivory-dim">
                                {historyBarber.isHigherTier
                                    ? 'High volume performance threshold reached (> ₱3,000 gross). Qualifying for 50% commission rate.'
                                    : 'Standard performance tier (40% commission rate). Reach ₱3,000 gross to unlock 50% bonus tier.'}
                            </p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default BarberCommissions;

