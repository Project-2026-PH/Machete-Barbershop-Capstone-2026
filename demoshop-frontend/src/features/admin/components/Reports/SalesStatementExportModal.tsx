import React, { useState } from 'react';
import {
    Calendar,
    Check,
    Download,
    FileDown,
    Printer,
    X,
    Filter,
    Loader2,
} from 'lucide-react';
import type { SalesReportResponse } from '@demoshop/shared-types';
import { Button } from '@/components/ui/Button';
import { api } from '@/config/api';
import {
    addDaysToIsoDate,
    getManilaDateIso,
} from './sales-chart-filters';
import { downloadSalesReportPdf } from './report-pdf';

export type StatementExportAction = 'pdf' | 'print';

interface SalesStatementExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialAction: StatementExportAction;
    currentReport: SalesReportResponse;
    currentStartDate: string;
    currentEndDate: string;
    preparedBy: string;
    onTriggerPrintStatement: (report: SalesReportResponse, startDate: string, endDate: string) => void;
}

export const SalesStatementExportModal: React.FC<SalesStatementExportModalProps> = ({
    isOpen,
    onClose,
    initialAction,
    currentReport,
    currentStartDate,
    currentEndDate,
    preparedBy,
    onTriggerPrintStatement,
}) => {
    const [actionType, setActionType] = useState<StatementExportAction>(initialAction);
    const [startDate, setStartDate] = useState<string>(currentStartDate || getManilaDateIso());
    const [endDate, setEndDate] = useState<string>(currentEndDate || getManilaDateIso());
    const [activePreset, setActivePreset] = useState<string>('current');
    const [excludeEmptyDates, setExcludeEmptyDates] = useState<boolean>(true);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleApplyPreset = (presetKey: string) => {
        setActivePreset(presetKey);
        const todayIso = getManilaDateIso();

        if (presetKey === 'today') {
            setStartDate(todayIso);
            setEndDate(todayIso);
        } else if (presetKey === 'yesterday') {
            const yesterday = addDaysToIsoDate(todayIso, -1);
            setStartDate(yesterday);
            setEndDate(yesterday);
        } else if (presetKey === 'this_week') {
            const utcd = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
            const diff = utcd === 0 ? -6 : 1 - utcd;
            setStartDate(addDaysToIsoDate(todayIso, diff));
            setEndDate(todayIso);
        } else if (presetKey === 'last_7_days') {
            setStartDate(addDaysToIsoDate(todayIso, -6));
            setEndDate(todayIso);
        } else if (presetKey === 'this_month') {
            setStartDate(`${todayIso.slice(0, 7)}-01`);
            setEndDate(todayIso);
        } else if (presetKey === 'last_month') {
            const [y, m] = todayIso.split('-').map(Number);
            const prevMonthDate = new Date(Date.UTC(y, m - 2, 1));
            const prevYear = prevMonthDate.getUTCFullYear();
            const prevMonth = String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0');
            const lastDay = new Date(Date.UTC(prevYear, prevMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
            setStartDate(`${prevYear}-${prevMonth}-01`);
            setEndDate(`${prevYear}-${prevMonth}-${String(lastDay).padStart(2, '0')}`);
        } else if (presetKey === 'all_time') {
            setStartDate('2024-01-01');
            setEndDate(todayIso);
        } else if (presetKey === 'current') {
            setStartDate(currentStartDate);
            setEndDate(currentEndDate);
        }
    };

    const handleExecuteExport = async () => {
        setErrorMessage(null);
        setIsProcessing(true);

        try {
            let reportToUse = currentReport;

            // If the user modified the dates, fetch the exact sales data for this date range
            if (startDate !== currentStartDate || endDate !== currentEndDate) {
                const res = await api.get('/api/admin/reports/sales', {
                    params: { startDate, endDate },
                });
                const fetchedData = res.data?.data || res.data;
                if (!fetchedData || !fetchedData.summary) {
                    throw new Error('Could not retrieve sales report for selected date range.');
                }
                reportToUse = fetchedData as SalesReportResponse;
            }

            // Exclude empty dates from timeline
            const filteredTimeline = (reportToUse.timeline || []).filter((point) => {
                if (!excludeEmptyDates) return true;
                return Number(point.transactionCount || 0) > 0 || Number(point.totalRevenue || 0) > 0;
            });

            const finalizedReport: SalesReportResponse = {
                ...reportToUse,
                timeline: filteredTimeline,
            };

            if (actionType === 'pdf') {
                await downloadSalesReportPdf(finalizedReport, {
                    startDate,
                    endDate,
                    preparedBy,
                });
                onClose();
            } else {
                onClose();
                onTriggerPrintStatement(finalizedReport, startDate, endDate);
            }
        } catch (err: any) {
            console.error('[SalesStatementExportModal] Export failed:', err);
            const msg = err?.response?.data?.message || err?.message || 'Failed to process statement export.';
            setErrorMessage(msg);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="statement-modal-title"
        >
            <div
                className="bg-charcoal-light border border-gold/40 rounded-sm w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-charcoal">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-full bg-gold/10 border border-gold/30 text-gold">
                            {actionType === 'pdf' ? <FileDown className="w-5 h-5" /> : <Printer className="w-5 h-5" />}
                        </div>
                        <div>
                            <h3 id="statement-modal-title" className="font-serif font-bold text-ivory text-base">
                                Official Sales Statement
                            </h3>
                            <p className="text-[11px] text-ivory-dim">
                                Select date range and export parameters for the official statement.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isProcessing}
                        className="text-ivory-dim hover:text-ivory p-1.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
                        aria-label="Close modal"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar text-xs">
                    {/* Error Banner */}
                    {errorMessage && (
                        <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
                            {errorMessage}
                        </div>
                    )}

                    {/* Mode Toggle (PDF vs Print View) */}
                    <div>
                        <label className="block text-[11px] uppercase font-bold tracking-wider text-gold mb-1.5">
                            Statement Output Mode
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setActionType('pdf')}
                                className={`flex items-center justify-center gap-2 py-2 px-3 rounded text-xs font-semibold border transition-all cursor-pointer ${
                                    actionType === 'pdf'
                                        ? 'bg-gold/15 border-gold text-gold shadow-xs'
                                        : 'bg-white/5 border-white/10 text-ivory-dim hover:text-ivory hover:bg-white/10'
                                }`}
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download PDF</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActionType('print')}
                                className={`flex items-center justify-center gap-2 py-2 px-3 rounded text-xs font-semibold border transition-all cursor-pointer ${
                                    actionType === 'print'
                                        ? 'bg-gold/15 border-gold text-gold shadow-xs'
                                        : 'bg-white/5 border-white/10 text-ivory-dim hover:text-ivory hover:bg-white/10'
                                }`}
                            >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Print View</span>
                            </button>
                        </div>
                    </div>

                    {/* Date Presets */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[11px] uppercase font-bold tracking-wider text-gold flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Date Range Preset</span>
                            </label>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { key: 'current', label: 'Current View' },
                                { key: 'today', label: 'Today' },
                                { key: 'yesterday', label: 'Yesterday' },
                                { key: 'this_week', label: 'This Week' },
                                { key: 'last_7_days', label: 'Last 7 Days' },
                                { key: 'this_month', label: 'This Month' },
                                { key: 'last_month', label: 'Last Month' },
                                { key: 'all_time', label: 'All Time' },
                            ].map((preset) => (
                                <button
                                    key={preset.key}
                                    type="button"
                                    onClick={() => handleApplyPreset(preset.key)}
                                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                                        activePreset === preset.key
                                            ? 'bg-gold text-black border-gold font-bold'
                                            : 'bg-white/5 border-white/10 text-ivory hover:bg-white/10 hover:border-gold/30'
                                    }`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Start Date & End Date Inputs */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                            <label className="block text-[11px] font-semibold text-ivory-dim mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setActivePreset('custom');
                                }}
                                max={endDate}
                                className="w-full bg-charcoal border border-white/15 rounded px-2.5 py-1.5 text-xs text-ivory focus:border-gold focus:outline-none [color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-ivory-dim mb-1">
                                End Date
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setActivePreset('custom');
                                }}
                                min={startDate}
                                className="w-full bg-charcoal border border-white/15 rounded px-2.5 py-1.5 text-xs text-ivory focus:border-gold focus:outline-none [color-scheme:dark]"
                            />
                        </div>
                    </div>

                    {/* Exclude Empty Dates Option (Default checked) */}
                    <div className="bg-charcoal border border-white/10 rounded p-3 flex items-start gap-2.5">
                        <input
                            type="checkbox"
                            id="exclude-empty-dates-checkbox"
                            checked={excludeEmptyDates}
                            onChange={(e) => setExcludeEmptyDates(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 text-gold focus:ring-gold cursor-pointer accent-[#D4AF37]"
                        />
                        <label htmlFor="exclude-empty-dates-checkbox" className="cursor-pointer select-none">
                            <span className="font-bold text-ivory block text-xs">
                                Exclude Empty Dates
                            </span>
                            <span className="text-[11px] text-ivory-dim mt-0.5 block leading-normal">
                                Omits calendar dates with zero transactions (0 sales / no transactions) from the daily revenue trend table.
                            </span>
                        </label>
                    </div>

                    {/* Information Note */}
                    <div className="p-2.5 rounded bg-gold/5 border border-gold/20 text-[11px] text-ivory-dim flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-gold shrink-0" />
                        <span>
                            Print View and Download PDF render identical official statements with unified formatting, letterhead, and itemized receipts.
                        </span>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-3.5 border-t border-white/10 bg-charcoal flex items-center justify-end gap-2.5">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isProcessing}
                        className="text-xs border-white/15 hover:bg-white/5 text-ivory cursor-pointer"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleExecuteExport}
                        disabled={isProcessing}
                        className="bg-gold hover:bg-gold-light text-black font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Generating Statement…</span>
                            </>
                        ) : actionType === 'pdf' ? (
                            <>
                                <Download className="w-3.5 h-3.5" />
                                <span>Download PDF Statement</span>
                            </>
                        ) : (
                            <>
                                <Printer className="w-3.5 h-3.5" />
                                <span>Open Print View</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default SalesStatementExportModal;
