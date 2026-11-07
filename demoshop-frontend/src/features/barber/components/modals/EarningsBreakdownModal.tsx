import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Calendar, Clock, Award, ShieldCheck, FileText, Loader2, Sparkles, AlertCircle, ArrowUpRight, Scissors } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { barberService, BarberEarningsResponse } from '../../services/barber.service';

interface EarningsBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const EarningsBreakdownModal: React.FC<EarningsBreakdownModalProps> = ({ isOpen, onClose }) => {
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
    const [earningsData, setEarningsData] = useState<BarberEarningsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        const fetchEarnings = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await barberService.getEarnings(period);
                setEarningsData(data);
            } catch (err: any) {
                console.error('[EarningsBreakdownModal] Error fetching earnings:', err);
                setError(err?.response?.data?.error || err?.message || 'Failed to load earnings breakdown.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchEarnings();
    }, [isOpen, period]);

    const totalSales = earningsData?.totalGrossSales || 0;
    const totalServices = earningsData?.totalServices || 0;
    const commissionRate = earningsData?.commissionRate || 0.40;
    const netPayout = earningsData?.netCommissionPayout || 0;
    const isHigherTier = earningsData?.isQuotaReached || false;
    const quotaProgressPercent = Math.min(100, Math.round((totalSales / 3000) * 100));

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Financial Earnings & Commission Breakdown"
            size="lg"
        >
            <div className="space-y-6">
                {/* Period Selector Tabs */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-1 bg-charcoal p-1 rounded-sm border border-white/10">
                        <button
                            onClick={() => setPeriod('today')}
                            className={`px-4 py-1.5 rounded-xs text-xs font-bold transition-all cursor-pointer ${
                                period === 'today'
                                    ? 'bg-gold text-charcoal shadow-sm'
                                    : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                            }`}
                        >
                            Today
                        </button>
                        <button
                            onClick={() => setPeriod('week')}
                            className={`px-4 py-1.5 rounded-xs text-xs font-bold transition-all cursor-pointer ${
                                period === 'week'
                                    ? 'bg-gold text-charcoal shadow-sm'
                                    : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                            }`}
                        >
                            This Week
                        </button>
                        <button
                            onClick={() => setPeriod('month')}
                            className={`px-4 py-1.5 rounded-xs text-xs font-bold transition-all cursor-pointer ${
                                period === 'month'
                                    ? 'bg-gold text-charcoal shadow-sm'
                                    : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                            }`}
                        >
                            This Month
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${
                            isHigherTier
                                ? 'bg-gold/20 text-gold border-gold/40 shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                                : 'bg-white/5 text-ivory-dim border-white/10'
                        }`}>
                            {isHigherTier ? '50% BONUS TIER UNLOCKED' : '40% STANDARD BASE TIER'}
                        </span>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-sm text-xs text-red-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Summary Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-charcoal p-3.5 rounded-sm border border-white/10 space-y-1 shadow-inner">
                        <span className="text-[10px] uppercase font-bold text-ivory-dim block">Completed Services</span>
                        {isLoading ? (
                            <Skeleton className="h-6 w-12 mt-1" />
                        ) : (
                            <span className="text-xl font-bold text-ivory block">{totalServices}</span>
                        )}
                    </div>

                    <div className="bg-charcoal p-3.5 rounded-sm border border-white/10 space-y-1 shadow-inner">
                        <span className="text-[10px] uppercase font-bold text-ivory-dim block">Gross Sales</span>
                        {isLoading ? (
                            <Skeleton className="h-6 w-16 mt-1" />
                        ) : (
                            <span className="text-xl font-bold text-ivory block">₱{totalSales.toFixed(2)}</span>
                        )}
                    </div>

                    <div className="bg-charcoal p-3.5 rounded-sm border border-white/10 space-y-1 shadow-inner">
                        <span className="text-[10px] uppercase font-bold text-ivory-dim block">Commission Rate</span>
                        {isLoading ? (
                            <Skeleton className="h-6 w-14 mt-1" />
                        ) : (
                            <span className="text-xl font-bold text-gold block">{(commissionRate * 100).toFixed(0)}%</span>
                        )}
                    </div>

                    <div className="bg-charcoal p-3.5 rounded-sm border border-gold/30 space-y-1 shadow-[0_0_12px_rgba(212,175,55,0.1)]">
                        <span className="text-[10px] uppercase font-bold text-gold block">Net Barber Payout</span>
                        {isLoading ? (
                            <Skeleton className="h-6 w-20 mt-1" />
                        ) : (
                            <span className="text-xl font-bold text-gold block">₱{netPayout.toFixed(2)}</span>
                        )}
                    </div>
                </div>

                {/* Tier Quota Threshold Banner */}
                <div className="bg-white/[0.02] border border-white/10 p-4 rounded-sm space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-ivory-dim flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-gold" />
                            50% Commission Tier Quota (₱3,000.00 Threshold)
                        </span>
                        <span className="font-mono text-gold font-bold">{quotaProgressPercent}% Reached</span>
                    </div>

                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                        <div
                            className="bg-gradient-to-r from-gold/70 via-gold to-gold-400 h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(212,175,55,0.4)]"
                            style={{ width: `${quotaProgressPercent}%` }}
                        ></div>
                    </div>

                    <p className="text-[10px] text-white/40">
                        {isHigherTier
                            ? 'Congratulations! You unlocked the 50% commission split tier.'
                            : `Generate ₱${Math.max(0, 3000 - totalSales).toFixed(2)} more in service sales to unlock the 50% high-volume split.`}
                    </p>
                </div>

                {/* Itemized Daily Receipts Table */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gold" />
                            <h4 className="text-xs uppercase font-bold tracking-wider text-ivory">
                                Itemized Service Receipts & Commission Log
                            </h4>
                        </div>
                        <span className="text-[10px] font-mono text-ivory-dim">
                            {earningsData?.receipts?.length || 0} Tickets
                        </span>
                    </div>

                    <div className="bg-charcoal border border-white/10 rounded-sm overflow-hidden shadow-inner max-h-[360px] overflow-y-auto">
                        {isLoading ? (
                            <div className="p-8 text-center space-y-3">
                                <Loader2 className="w-6 h-6 text-gold animate-spin mx-auto" />
                                <span className="text-xs text-ivory-dim block">Calculating financial breakdown...</span>
                            </div>
                        ) : !earningsData || earningsData.receipts.length === 0 ? (
                            <div className="py-12 text-center text-xs text-white/40 space-y-2">
                                <Scissors className="w-6 h-6 text-white/20 mx-auto" />
                                <p>No completed paid service receipts recorded for this period.</p>
                            </div>
                        ) : (
                            <>
                                {/* Mobile Stacked Receipt Cards (Phone view) */}
                                <div className="block sm:hidden divide-y divide-white/5 p-2 space-y-2">
                                    {earningsData.receipts.map((receipt) => (
                                        <div key={receipt.queueEntryId} className="bg-white/[0.02] border border-white/5 rounded-xs p-3 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <span className="font-bold text-ivory text-sm block leading-tight truncate">{receipt.customerName}</span>
                                                    <span className="text-[10px] font-mono text-gold/80 block mt-0.5">{receipt.guestRef}</span>
                                                </div>
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-xs border shrink-0 ${
                                                    receipt.commissionRate >= 0.5
                                                        ? 'bg-gold/15 text-gold border-gold/30'
                                                        : 'bg-white/5 text-ivory-dim border-white/10'
                                                }`}>
                                                    {(receipt.commissionRate * 100).toFixed(0)}% Split
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between text-xs text-ivory-dim pt-1 border-t border-white/5">
                                                <span className="truncate">{receipt.serviceName}</span>
                                                <span className="text-[10px] text-white/40 font-mono shrink-0 ml-2">{receipt.formattedTime}</span>
                                            </div>

                                            <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5 bg-charcoal/40 p-1.5 rounded-xs">
                                                <div>
                                                    <span className="text-[10px] text-ivory-dim block">Ticket Amount</span>
                                                    <span className="font-mono font-semibold text-ivory">₱{receipt.ticketAmount.toFixed(2)}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] text-gold block font-semibold">Your Cut</span>
                                                    <span className="font-mono font-bold text-gold text-sm">₱{receipt.barberCut.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop & Tablet Table */}
                                <div className="hidden sm:block overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left text-xs min-w-[540px]">
                                        <thead className="bg-white/[0.03] text-[9px] uppercase tracking-wider text-gold font-bold border-b border-white/10 sticky top-0 z-10 backdrop-blur-xs">
                                            <tr>
                                                <th className="py-3 px-4">Time</th>
                                                <th className="py-3 px-4">Customer / Guest Ref</th>
                                                <th className="py-3 px-4">Service Availed</th>
                                                <th className="py-3 px-4 text-right">Ticket (₱)</th>
                                                <th className="py-3 px-4 text-center">Split %</th>
                                                <th className="py-3 px-4 text-right">Barber Cut (₱)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {earningsData.receipts.map((receipt) => (
                                                <tr key={receipt.queueEntryId} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="py-3 px-4 text-ivory-dim font-mono text-[11px] whitespace-nowrap">
                                                        <div>{receipt.formattedTime}</div>
                                                        <div className="text-[9px] text-white/30">{receipt.formattedDate}</div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="font-bold text-ivory block leading-tight">{receipt.customerName}</span>
                                                        <span className="text-[9px] font-mono text-gold/80 block mt-0.5">{receipt.guestRef}</span>
                                                    </td>
                                                    <td className="py-3 px-4 text-ivory-dim font-medium">
                                                        <span>{receipt.serviceName}</span>
                                                        <span className="text-[9px] text-white/30 block mt-0.5">{receipt.paymentMethod}</span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono font-bold text-ivory whitespace-nowrap">
                                                        ₱{receipt.ticketAmount.toFixed(2)}
                                                    </td>
                                                    <td className="py-3 px-4 text-center whitespace-nowrap">
                                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-xs border ${
                                                            receipt.commissionRate >= 0.5
                                                                ? 'bg-gold/15 text-gold border-gold/30'
                                                                : 'bg-white/5 text-ivory-dim border-white/10'
                                                        }`}>
                                                            {(receipt.commissionRate * 100).toFixed(0)}%
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono font-bold text-gold whitespace-nowrap">
                                                        ₱{receipt.barberCut.toFixed(2)}
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

                {/* Modal Footer */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-white/10">
                    <div className="text-xs text-ivory-dim w-full sm:w-auto text-center sm:text-left">
                        Total Payout: <span className="font-bold text-gold font-mono text-sm">₱{netPayout.toFixed(2)}</span>
                    </div>
                    <Button variant="primary" onClick={onClose} className="bg-gold hover:bg-gold-600 text-charcoal font-bold text-xs w-full sm:w-auto">
                        Close Breakdown
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
