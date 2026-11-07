import React, { useState, useMemo } from 'react';
import { TrendingUp, Maximize2, ArrowRight } from 'lucide-react';
import type { BranchStatsResponse, RevenueChartPoint } from '@demoshop/shared-types';

interface RevenueOverviewGraphProps {
    revenueChart?: BranchStatsResponse['revenue_chart'];
    onExpand?: () => void;
    isExpanded?: boolean;
    onNavigateToSales?: () => void;
}

export const RevenueOverviewGraph: React.FC<RevenueOverviewGraphProps> = ({
    revenueChart,
    onExpand,
    isExpanded = false,
    onNavigateToSales,
}) => {
    const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '12m'>('7d');

    const activePeriodData = useMemo(() => {
        if (!revenueChart) {
            return {
                totalRevenue: 0,
                growth: '+0%',
                points: [] as RevenueChartPoint[],
                label: 'Last 7 Days',
            };
        }

        if (revenueChart.periods && revenueChart.periods[selectedPeriod]) {
            const p = revenueChart.periods[selectedPeriod];
            const labels = {
                '7d': 'Last 7 Days',
                '30d': 'Last 30 Days',
                '12m': 'Last 12 Months',
            };
            return {
                totalRevenue: p.total_revenue,
                growth: p.growth_percentage || '+0%',
                points: p.points || [],
                label: labels[selectedPeriod],
            };
        }

        // Fallback to legacy revenue_chart
        return {
            totalRevenue: revenueChart.total_period_revenue || 0,
            growth: revenueChart.growth_percentage || '+0%',
            points: revenueChart.points || [],
            label: 'Past 7 Days',
        };
    }, [revenueChart, selectedPeriod]);

    const maxRevenue = useMemo(() => {
        const points = activePeriodData.points;
        if (!points || points.length === 0) return 1;
        return Math.max(...points.map((p) => Number(p.revenue) || 0), 1);
    }, [activePeriodData.points]);

    return (
        <div className={`bg-charcoal-light border border-white/5 rounded-sm p-4 card-gold-accent flex flex-col justify-between ${isExpanded ? 'h-full' : 'min-h-[300px]'}`}>
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-full bg-gold/10 border border-gold/20 text-gold">
                        <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-serif font-bold text-ivory text-base">Revenue Overview</h3>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Period Switcher */}
                    <div className="flex bg-white/5 p-0.5 rounded-sm border border-white/10 text-xs font-semibold">
                        {(['7d', '30d', '12m'] as const).map((periodKey) => {
                            const labels = { '7d': '7D', '30d': '30D', '12m': '12M' };
                            const isActive = selectedPeriod === periodKey;
                            return (
                                <button
                                    key={periodKey}
                                    type="button"
                                    onClick={() => setSelectedPeriod(periodKey)}
                                    className={`px-2.5 py-1 text-[11px] rounded-sm transition-all cursor-pointer ${isActive
                                        ? 'bg-gold text-charcoal font-bold shadow'
                                        : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                                        }`}
                                    title={`View ${periodKey === '7d' ? '7 Days' : periodKey === '30d' ? '30 Days' : '12 Months'} Revenue`}
                                >
                                    {labels[periodKey]}
                                </button>
                            );
                        })}
                    </div>

                    {/* Expand Button */}
                    {!isExpanded && onExpand && (
                        <button
                            type="button"
                            onClick={onExpand}
                            className="p-1.5 rounded-sm border border-white/10 bg-white/5 hover:bg-gold/10 hover:border-gold/30 hover:text-gold text-ivory-dim transition-all cursor-pointer"
                            title="Expand Revenue Overview Graph"
                            aria-label="Expand Revenue Overview Graph"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Summary Row */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 py-3 shrink-0">
                <div>
                    <span className="text-[10px] uppercase tracking-widest text-ivory-dim block">
                        Total {activePeriodData.label} Revenue
                    </span>
                    <span className="text-2xl sm:text-3xl font-serif font-bold text-gold">
                        ₱{Number(activePeriodData.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${activePeriodData.growth.startsWith('+')
                        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                        : activePeriodData.growth.startsWith('-')
                            ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                            : 'text-ivory-dim bg-white/5'
                        }`}>
                        {activePeriodData.growth} vs previous period
                    </span>

                    {onNavigateToSales && (
                        <button
                            type="button"
                            onClick={onNavigateToSales}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-gold hover:text-gold/80 transition-colors group cursor-pointer"
                            title="View Sales Breakdown in Reports"
                        >
                            <span>Sales Breakdown</span>
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    )}
                </div>
            </div>

            {/* Interactive Bar Chart */}
            <div className={`w-full flex flex-col justify-end ${isExpanded ? 'min-h-[260px]' : 'min-h-[160px]'}`}>
                {activePeriodData.points && activePeriodData.points.length > 0 ? (
                    <div
                        className="grid w-full items-end gap-1 sm:gap-1.5"
                        style={{ gridTemplateColumns: `repeat(${activePeriodData.points.length}, minmax(0, 1fr))` }}
                    >
                        {activePeriodData.points.map((pt, i) => {
                            const rev = Number(pt.revenue) || 0;
                            const heightPct = maxRevenue > 0 ? Math.max(Math.round((rev / maxRevenue) * 100), rev > 0 ? 8 : 2) : 2;
                            const totalPts = activePeriodData.points.length;
                            const shouldShow = totalPts <= 12 || i % Math.ceil(totalPts / 8) === 0 || i === totalPts - 1;

                            return (
                                <div key={i} className="flex flex-col items-center min-w-0 w-full group relative cursor-pointer">
                                    {/* Tooltip on Hover */}
                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-zinc-900 border border-gold/30 text-[10px] text-ivory px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-20 whitespace-nowrap">
                                        <div className="font-bold text-gold font-mono">
                                            ₱{rev.toLocaleString('en-US')}
                                        </div>
                                        <div className="text-ivory-dim text-[9px]">
                                            {pt.date || pt.day}
                                        </div>
                                    </div>

                                    {/* Bar Pillar Slot */}
                                    <div className={`w-full ${isExpanded ? 'h-64 sm:h-72' : 'h-36 sm:h-40'} bg-white/5 rounded-t-sm flex items-end overflow-hidden group-hover:bg-gold/10 transition-colors`}>
                                        <div
                                            className={`w-full rounded-t-sm transition-all duration-300 ${
                                                rev > 0
                                                    ? 'bg-gold group-hover:bg-amber-400 shadow-[0_0_8px_rgba(212,175,55,0.4)]'
                                                    : 'bg-white/10'
                                            }`}
                                            style={{
                                                height: `${heightPct}%`,
                                                minHeight: rev > 0 ? '6px' : '2px',
                                            }}
                                        />
                                    </div>

                                    {/* Synchronized X-Axis Label */}
                                    <div className="w-full text-center mt-2 pt-1 border-t border-white/5 text-[9px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-mono">
                                        <span className={`block truncate ${shouldShow ? 'opacity-100' : 'opacity-0 sm:opacity-40'}`}>
                                            {pt.day}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grid w-full grid-cols-7 gap-1.5 items-end">
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                            <div key={i} className="flex flex-col items-center w-full">
                                <div className={`w-full ${isExpanded ? 'h-64 sm:h-72' : 'h-36 sm:h-40'} bg-white/5 rounded-t-sm flex items-end`}>
                                    <div className="w-full bg-white/10 rounded-t-[1px] h-3"></div>
                                </div>
                                <div className="w-full text-center mt-2 pt-1 border-t border-white/5 text-[9px] text-ivory-dim font-mono">
                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i - 1]}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* In Expanded Mode: Detailed Ledger Table */}
            {isExpanded && activePeriodData.points.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ivory mb-2">
                        Period Revenue Breakdown ({activePeriodData.points.length} entries)
                    </h4>
                    <div className="max-h-56 overflow-y-auto admin-table-scroll border border-white/5 rounded-sm">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-white/5 text-[10px] text-ivory-dim uppercase tracking-wider sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Timeline Point</th>
                                    <th className="px-3 py-2 font-medium">Date</th>
                                    <th className="px-3 py-2 font-medium text-right">Revenue</th>
                                    <th className="px-3 py-2 font-medium text-right">Share</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {activePeriodData.points.map((pt, idx) => {
                                    const rev = Number(pt.revenue) || 0;
                                    const share = activePeriodData.totalRevenue > 0
                                        ? Math.round((rev / activePeriodData.totalRevenue) * 100)
                                        : 0;
                                    return (
                                        <tr key={idx} className="hover:bg-white/[0.02]">
                                            <td className="px-3 py-2 text-ivory font-bold">{pt.day}</td>
                                            <td className="px-3 py-2 text-ivory-dim font-mono">{pt.date}</td>
                                            <td className="px-3 py-2 text-right text-gold font-mono font-bold">
                                                ₱{rev.toLocaleString('en-US')}
                                            </td>
                                            <td className="px-3 py-2 text-right text-ivory-dim">{share}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
