import React, { useMemo } from 'react';
import { Calendar, Maximize2, Users, ArrowRight } from 'lucide-react';
import type { MonthlyCustomersServed } from '@demoshop/shared-types';

interface MonthlyCustomersGraphProps {
    monthlyData?: MonthlyCustomersServed;
    onExpand?: () => void;
    isExpanded?: boolean;
    onNavigateToTransactions?: () => void;
    onSelectMonth?: (monthKey: string) => void;
    isLoadingMonth?: boolean;
}

export const MonthlyCustomersGraph: React.FC<MonthlyCustomersGraphProps> = ({
    monthlyData,
    onExpand,
    isExpanded = false,
    onNavigateToTransactions,
    onSelectMonth,
    isLoadingMonth = false,
}) => {
    const days = useMemo(() => monthlyData?.days || [], [monthlyData?.days]);

    const fallbackMonths = useMemo(() => {
        const list: Array<{ key: string; label: string }> = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
            const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
            list.push({ key, label });
        }
        return list;
    }, []);

    const maxCount = useMemo(() => {
        if (days.length === 0) return 1;
        return Math.max(...days.map((d) => d.count), 1);
    }, [days]);

    const totalMonth = monthlyData?.total_month_served ?? 0;
    const dailyAvg = monthlyData?.daily_average ?? 0;
    const peakDay = monthlyData?.peak_day;
    const monthName = monthlyData?.month_name || 'This Month';

    return (
        <div className={`bg-charcoal-light border border-white/5 rounded-sm p-4 card-gold-accent flex flex-col justify-between ${isExpanded ? 'h-full' : 'min-h-[300px]'}`}>
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-serif font-bold text-ivory text-base">Customers Served in Month</h3>
                    </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto flex-wrap">
                    {/* Walk-in vs Online Legend */}
                    <div className="flex items-center gap-3 text-[10px] text-ivory-dim font-bold">
                        <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-gold inline-block" />
                            Walk-In
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                            Online
                        </span>
                    </div>

                    {/* Month Filter Selector */}
                    {onSelectMonth && (
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-sm px-2 py-1 text-xs hover:border-gold/30 transition-colors">
                            <Calendar className="w-3.5 h-3.5 text-gold shrink-0" />
                            <select
                                value={monthlyData?.month_key || ''}
                                onChange={(e) => onSelectMonth(e.target.value)}
                                disabled={isLoadingMonth}
                                className="bg-transparent text-ivory text-xs font-semibold focus:outline-none cursor-pointer pr-1"
                                aria-label="Select Month for Customers Served"
                            >
                                {(monthlyData?.available_months && monthlyData.available_months.length > 0
                                    ? monthlyData.available_months
                                    : fallbackMonths
                                ).map((m) => (
                                    <option key={m.key} value={m.key} className="bg-zinc-900 text-ivory">
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                            {isLoadingMonth && (
                                <div className="w-3 h-3 border-2 border-gold border-t-transparent rounded-full animate-spin ml-1" />
                            )}
                        </div>
                    )}

                    {!isExpanded && onExpand && (
                        <button
                            type="button"
                            onClick={onExpand}
                            className="p-1.5 rounded-sm border border-white/10 bg-white/5 hover:bg-gold/10 hover:border-gold/30 hover:text-gold text-ivory-dim transition-all cursor-pointer"
                            title="Expand Monthly Customers Graph"
                            aria-label="Expand Monthly Customers Graph"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Quick KPIs */}
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 shrink-0">
                <div>
                    <span className="text-[10px] uppercase tracking-widest text-ivory-dim block">
                        Total Completed ({monthName})
                    </span>
                    <span className="text-2xl sm:text-3xl font-serif font-bold text-emerald-400">
                        {totalMonth}
                        <span className="text-xs font-sans text-ivory-dim font-normal ml-1.5">customers served</span>
                    </span>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider text-ivory-dim block font-sans">Daily Avg</span>
                        <span className="font-bold text-ivory">{dailyAvg}</span>
                    </div>

                    {peakDay && peakDay.count > 0 && (
                        <div className="text-right border-l border-white/10 pl-3">
                            <span className="text-[10px] uppercase tracking-wider text-ivory-dim block font-sans">Peak Traffic</span>
                            <span className="font-bold text-gold">Day {peakDay.day} ({peakDay.count})</span>
                        </div>
                    )}

                    {onNavigateToTransactions && (
                        <button
                            type="button"
                            onClick={onNavigateToTransactions}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-gold hover:text-gold/80 transition-colors group cursor-pointer"
                            title="View Transaction History for This Month"
                        >
                            <span className="font-sans">Ledger</span>
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    )}
                </div>
            </div>

            {/* Day-by-Day Interactive Chart */}
            <div className={`w-full flex flex-col justify-end ${isExpanded ? 'min-h-[260px]' : 'min-h-[160px]'}`}>
                {days.length > 0 ? (
                    <div
                        className="grid w-full items-end gap-1 sm:gap-1.5"
                        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                    >
                        {days.map((d, i) => {
                            const heightPct = maxCount > 0 ? Math.max(Math.round((d.count / maxCount) * 100), d.count > 0 ? 8 : 2) : 2;
                            const walkInPct = d.count > 0 ? (d.walk_in_count / d.count) * 100 : 0;
                            const onlinePct = d.count > 0 ? (d.online_count / d.count) * 100 : 0;
                            const totalDays = days.length;
                            const shouldShow = totalDays <= 15 || i % Math.ceil(totalDays / 10) === 0 || i === totalDays - 1;

                            return (
                                <div
                                    key={i}
                                    className="flex flex-col items-center min-w-0 w-full group relative cursor-pointer"
                                >
                                    {/* Tooltip on Hover */}
                                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-zinc-900 border border-emerald-500/30 text-[10px] text-ivory px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-20 whitespace-nowrap">
                                        <div className="font-bold text-emerald-400 font-mono">
                                            {d.count} Served ({d.weekday}, {d.date})
                                        </div>
                                        <div className="flex items-center gap-2 text-ivory-dim text-[9px] mt-0.5">
                                            <span className="text-gold font-bold">{d.walk_in_count} Walk-In</span>
                                            <span>•</span>
                                            <span className="text-cyan-400 font-bold">{d.online_count} Online</span>
                                        </div>
                                    </div>

                                    {/* Segmented Bar Pillar Slot */}
                                    <div className={`w-full ${isExpanded ? 'h-64 sm:h-72' : 'h-36 sm:h-40'} bg-white/5 rounded-t-sm flex items-end overflow-hidden group-hover:bg-emerald-500/10 transition-colors`}>
                                        {d.count > 0 ? (
                                            <div
                                                className="w-full flex flex-col-reverse rounded-t-sm overflow-hidden transition-all duration-300"
                                                style={{
                                                    height: `${heightPct}%`,
                                                    minHeight: '6px',
                                                }}
                                            >
                                                {/* Walk-in portion (gold) */}
                                                {d.walk_in_count > 0 && (
                                                    <div
                                                        className="w-full bg-gold shadow-[0_0_6px_rgba(212,175,55,0.3)]"
                                                        style={{
                                                            height: `${walkInPct}%`,
                                                            minHeight: '3px',
                                                        }}
                                                    />
                                                )}
                                                {/* Online portion (cyan) */}
                                                {d.online_count > 0 && (
                                                    <div
                                                        className="w-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.3)]"
                                                        style={{
                                                            height: `${onlinePct}%`,
                                                            minHeight: '3px',
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        ) : (
                                            <div
                                                className="w-full bg-white/10 rounded-t-sm"
                                                style={{ height: '3px' }}
                                            />
                                        )}
                                    </div>

                                    {/* Synchronized X-Axis Day Number */}
                                    <div className="w-full text-center mt-2 pt-1 border-t border-white/5 text-[9px] text-ivory-dim font-mono">
                                        <span className={`block truncate ${shouldShow ? 'opacity-100' : 'opacity-0 sm:opacity-40'}`}>
                                            {d.day}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grid w-full grid-cols-10 gap-1 sm:gap-1.5 items-end">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                            <div key={i} className="flex flex-col items-center w-full">
                                <div className={`w-full ${isExpanded ? 'h-64 sm:h-72' : 'h-36 sm:h-40'} bg-white/5 rounded-t-sm flex items-end`}>
                                    <div className="w-full bg-white/10 rounded-t-[1px] h-3"></div>
                                </div>
                                <div className="w-full text-center mt-2 pt-1 border-t border-white/5 text-[9px] text-ivory-dim font-mono">
                                    {i * 3}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* In Expanded Mode: Detailed Day Breakdown Table */}
            {isExpanded && days.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ivory mb-2">
                        Day-by-Day Traffic Ledger ({days.length} days recorded)
                    </h4>
                    <div className="max-h-56 overflow-y-auto admin-table-scroll border border-white/5 rounded-sm">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-white/5 text-[10px] text-ivory-dim uppercase tracking-wider sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Day</th>
                                    <th className="px-3 py-2 font-medium">Date</th>
                                    <th className="px-3 py-2 font-medium">Weekday</th>
                                    <th className="px-3 py-2 font-medium text-right">Walk-in</th>
                                    <th className="px-3 py-2 font-medium text-right">Online</th>
                                    <th className="px-3 py-2 font-medium text-right">Total Served</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-mono">
                                {days.map((d, idx) => (
                                    <tr key={idx} className="hover:bg-white/[0.02]">
                                        <td className="px-3 py-2 text-ivory font-bold">{d.day}</td>
                                        <td className="px-3 py-2 text-ivory-dim">{d.date}</td>
                                        <td className="px-3 py-2 text-ivory-dim">{d.weekday}</td>
                                        <td className="px-3 py-2 text-right text-gold">{d.walk_in_count}</td>
                                        <td className="px-3 py-2 text-right text-cyan-400">{d.online_count}</td>
                                        <td className="px-3 py-2 text-right text-emerald-400 font-bold font-mono">
                                            {d.count}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
