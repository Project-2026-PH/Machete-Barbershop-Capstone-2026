import React, { useEffect, useState, useCallback } from 'react';
import {
    DollarSign, Globe, Users, UserCheck, ArrowRight,
    RefreshCw, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/config/supabaseClient';
import { adminDashboardService } from '@/features/admin/services/admin-dashboard.service';
import type { BranchStatsResponse } from '@demoshop/shared-types';
import { RevenueOverviewGraph } from '@/features/admin/components/Dashboard/RevenueOverviewGraph';
import { CustomerReviewsGraph } from '@/features/admin/components/Dashboard/CustomerReviewsGraph';
import { MonthlyCustomersGraph } from '@/features/admin/components/Dashboard/MonthlyCustomersGraph';
import { TopBarbersGraph } from '@/features/admin/components/Dashboard/TopBarbersGraph';
import { ExpandedGraphModal, type ExpandedGraphType } from '@/features/admin/components/Dashboard/ExpandedGraphModal';

interface DashboardTabProps {
    onNavigateTab?: (tab: string, subTab?: string, extraParams?: Record<string, string>) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ onNavigateTab }) => {
    // Live branch metrics state
    const [branchStats, setBranchStats] = useState<BranchStatsResponse | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const [statsError, setStatsError] = useState<string | null>(null);

    // Enlarged interactive modal state
    const [expandedGraph, setExpandedGraph] = useState<ExpandedGraphType | null>(null);

    // Selected month filter for expanded traffic timeline
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [isLoadingMonth, setIsLoadingMonth] = useState<boolean>(false);

    // Live fetch branch statistics
    const fetchDashboardStats = useCallback(async (silent = false, monthOverride?: string) => {
        if (!silent) {
            setIsLoadingStats(true);
            setStatsError(null);
        }
        try {
            const activeMonth = monthOverride !== undefined ? monthOverride : selectedMonth;
            const data = await adminDashboardService.getBranchStats(undefined, activeMonth || undefined);
            setBranchStats(data);
            setStatsError(null);
        } catch (err: any) {
            console.error('[DashboardTab] Failed to fetch branch statistics:', err);
            if (!silent) {
                const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to load branch statistics.';
                setStatsError(msg);
            }
        } finally {
            if (!silent) {
                setIsLoadingStats(false);
            }
        }
    }, [selectedMonth]);

    const handleMonthChange = useCallback(async (monthKey: string) => {
        setSelectedMonth(monthKey);
        setIsLoadingMonth(true);
        try {
            const data = await adminDashboardService.getBranchStats(undefined, monthKey);
            setBranchStats(data);
        } catch (err: any) {
            console.error('[DashboardTab] Failed to fetch month stats:', err);
        } finally {
            setIsLoadingMonth(false);
        }
    }, []);

    // Automated Real-Time Synchronization via Supabase Channels & Local Events
    useEffect(() => {
        void fetchDashboardStats();

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                void fetchDashboardStats(true);
            }, 300);
        };

        const handleStaffUpdate = () => debouncedRefresh();
        const handleQueueUpdate = () => debouncedRefresh();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                debouncedRefresh();
            }
        };
        const handleWindowFocus = () => debouncedRefresh();

        window.addEventListener('demoshop:staff-changed', handleStaffUpdate);
        window.addEventListener('demoshop:queue-updated', handleQueueUpdate);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);

        // Supabase Realtime channel listeners across relevant business tables
        const realtimeChannel = supabase
            .channel('admin-dashboard-live-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'queue_entries' },
                () => debouncedRefresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => debouncedRefresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transactions' },
                () => debouncedRefresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'audit_logs' },
                () => debouncedRefresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'barbers' },
                () => debouncedRefresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'inventory_stock' },
                () => debouncedRefresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'ratings' },
                () => debouncedRefresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'users' },
                () => debouncedRefresh()
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    debouncedRefresh();
                }
            });

        return () => {
            window.removeEventListener('demoshop:staff-changed', handleStaffUpdate);
            window.removeEventListener('demoshop:queue-updated', handleQueueUpdate);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleWindowFocus);
            if (debounceTimer) clearTimeout(debounceTimer);
            void supabase.removeChannel(realtimeChannel).catch(() => { });
        };
    }, [fetchDashboardStats]);

    // 4 Revised Top Metric Cards Definition (Subtitles & Helper Text Removed)
    const statCards = [
        {
            title: 'Total Revenue',
            value: branchStats?.stats.total_revenue.value || '₱0',
            change: branchStats?.stats.total_revenue.change || '+0%',
            trend: branchStats?.stats.total_revenue.trend || 'up',
            icon: <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-gold" />,
            iconBg: 'bg-gold/10 border-gold/20 text-gold group-hover:bg-gold/20 group-hover:border-gold/50',
            badgeClass: branchStats?.stats.total_revenue.change?.startsWith('+')
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : branchStats?.stats.total_revenue.change?.startsWith('-')
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : 'text-ivory-dim bg-white/5 border-white/10',
            onClick: () => onNavigateTab?.('reports', 'sales'),
            tooltip: 'Navigate to Sales Breakdown (Reports & Audits)',
        },
        {
            title: 'Total Online Bookings',
            value: branchStats?.stats.online_bookings?.value || '0',
            change: branchStats?.stats.online_bookings?.change || '+0%',
            trend: branchStats?.stats.online_bookings?.trend || 'up',
            icon: <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />,
            iconBg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/20 group-hover:border-cyan-500/50',
            badgeClass: branchStats?.stats.online_bookings?.change?.startsWith('+')
                ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                : 'text-ivory-dim bg-white/5 border-white/10',
            onClick: () => onNavigateTab?.('reports', 'transactions', { channel: 'online', preset: 'all' }),
            tooltip: 'Navigate to Transaction History (Online Bookings, All Time)',
        },
        {
            title: 'Total Walk-In Customers',
            value: branchStats?.stats.walk_in_customers?.value || branchStats?.stats.customers_served?.value || '0',
            change: branchStats?.stats.walk_in_customers?.change || branchStats?.stats.customers_served?.change || '+0%',
            trend: branchStats?.stats.walk_in_customers?.trend || branchStats?.stats.customers_served?.trend || 'up',
            icon: <Users className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />,
            iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/50',
            badgeClass: (branchStats?.stats.walk_in_customers?.change || branchStats?.stats.customers_served?.change)?.startsWith('+')
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-ivory-dim bg-white/5 border-white/10',
            onClick: () => onNavigateTab?.('reports', 'transactions', { channel: 'walk-in', preset: 'all' }),
            tooltip: 'Navigate to Transaction History (Walk-in Customers, All Time)',
        },
        {
            title: 'Total Staffs',
            value: branchStats?.stats.total_staff?.value || '0',
            change: branchStats?.stats.total_staff?.change || 'Active',
            trend: 'neutral',
            icon: <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />,
            iconBg: 'bg-amber-500/10 border-amber-500/20 text-amber-400 group-hover:bg-amber-500/20 group-hover:border-amber-500/50',
            badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
            onClick: () => onNavigateTab?.('management', 'staff'),
            tooltip: 'Navigate to Staff Directory (Management)',
        },
    ];

    return (
        <div className="h-full min-h-0 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar pr-0.5 pb-32 sm:pb-36 lg:pb-12 touch-pan-y [-webkit-overflow-scrolling:touch]">
            {/* Error Banner */}
            {statsError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm flex items-center justify-between text-xs text-red-300 shrink-0">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span>{statsError}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => void fetchDashboardStats()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors cursor-pointer font-bold"
                    >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                    </button>
                </div>
            )}

            {/* --- 1. REVISED TOP METRIC CARDS (CLICK-NAVIGABLE, CLEAN TYPOGRAPHY) --- */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 xl:gap-4 shrink-0">
                {isLoadingStats && !branchStats ? (
                    [1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-charcoal-light border border-white/5 p-2.5 sm:p-4 rounded-sm animate-pulse space-y-2 sm:space-y-3">
                            <div className="flex justify-between items-start">
                                <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-white/5" />
                                <div className="w-12 sm:w-16 h-4 sm:h-5 bg-white/5 rounded-full" />
                            </div>
                            <div className="h-6 sm:h-8 bg-white/10 rounded w-1/2" />
                            <div className="h-3 sm:h-4 bg-white/5 rounded w-3/4" />
                        </div>
                    ))
                ) : (
                    statCards.map((stat, index) => (
                        <div
                            key={index}
                            onClick={stat.onClick}
                            className="bg-charcoal-light border border-white/5 p-2.5 sm:p-3.5 lg:p-4 rounded-sm card-gold-accent cursor-pointer hover:bg-zinc-800/70 hover:border-gold/40 transition-all group relative flex flex-col justify-between"
                            title={stat.tooltip}
                        >
                            <div className="flex justify-between items-start mb-1.5 sm:mb-2.5">
                                <div className={`p-1.5 sm:p-2.5 rounded-full border transition-all shrink-0 ${stat.iconBg}`}>
                                    {stat.icon}
                                </div>
                                <div className="flex items-center gap-1 sm:gap-1.5">
                                    <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border font-mono truncate max-w-[62px] sm:max-w-none ${stat.badgeClass}`}>
                                        {stat.change}
                                    </span>
                                    <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-ivory-dim/30 group-hover:text-gold group-hover:translate-x-0.5 transition-all shrink-0" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-2xl lg:text-3xl font-serif font-bold text-ivory mb-0.5 group-hover:text-gold transition-colors truncate">
                                    {stat.value}
                                </h3>
                                <p className="text-ivory-dim text-[9px] sm:text-[10px] lg:text-[11px] uppercase tracking-wider font-semibold truncate leading-tight">
                                    {stat.title}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* --- 2. REORDERED GRAPH SECTIONS: REVENUE & MONTHLY CUSTOMERS FULL-WIDTH FIRST, REVIEWS & BARBERS AT BOTTOM --- */}
            {isLoadingStats && !branchStats ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 xl:gap-4 shrink-0">
                    <div className="col-span-1 lg:col-span-2 bg-charcoal-light border border-white/5 p-5 rounded-sm animate-pulse min-h-[300px] flex flex-col justify-between">
                        <div className="flex justify-between items-center">
                            <div className="h-5 bg-white/10 rounded w-1/3" />
                            <div className="h-6 w-16 bg-white/5 rounded" />
                        </div>
                        <div className="h-32 bg-white/5 rounded w-full my-4" />
                        <div className="h-4 bg-white/10 rounded w-1/4" />
                    </div>
                    <div className="col-span-1 lg:col-span-2 bg-charcoal-light border border-white/5 p-5 rounded-sm animate-pulse min-h-[300px] flex flex-col justify-between">
                        <div className="flex justify-between items-center">
                            <div className="h-5 bg-white/10 rounded w-1/3" />
                            <div className="h-6 w-16 bg-white/5 rounded" />
                        </div>
                        <div className="h-32 bg-white/5 rounded w-full my-4" />
                        <div className="h-4 bg-white/10 rounded w-1/4" />
                    </div>
                    <div className="bg-charcoal-light border border-white/5 p-5 rounded-sm animate-pulse min-h-[300px] flex flex-col justify-between">
                        <div className="flex justify-between items-center">
                            <div className="h-5 bg-white/10 rounded w-1/3" />
                            <div className="h-6 w-16 bg-white/5 rounded" />
                        </div>
                        <div className="h-28 bg-white/5 rounded w-full my-4" />
                        <div className="h-4 bg-white/10 rounded w-1/4" />
                    </div>
                    <div className="bg-charcoal-light border border-white/5 p-5 rounded-sm animate-pulse min-h-[300px] flex flex-col justify-between">
                        <div className="flex justify-between items-center">
                            <div className="h-5 bg-white/10 rounded w-1/3" />
                            <div className="h-6 w-16 bg-white/5 rounded" />
                        </div>
                        <div className="h-28 bg-white/5 rounded w-full my-4" />
                        <div className="h-4 bg-white/10 rounded w-1/4" />
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 xl:gap-4 shrink-0">
                    {/* Graph 1: Revenue Overview (Full Width Stacked) */}
                    <div className="col-span-1 lg:col-span-2">
                        <RevenueOverviewGraph
                            revenueChart={branchStats?.revenue_chart}
                            onExpand={() => setExpandedGraph('revenue')}
                            onNavigateToSales={() => onNavigateTab?.('reports', 'sales')}
                        />
                    </div>

                    {/* Graph 2: Customers Served in Month (Full Width Stacked) */}
                    <div className="col-span-1 lg:col-span-2">
                        <MonthlyCustomersGraph
                            monthlyData={branchStats?.monthly_customers_served}
                            onExpand={() => setExpandedGraph('monthly_customers')}
                            onNavigateToTransactions={() => onNavigateTab?.('reports', 'transactions', { channel: 'all', preset: 'this_month' })}
                            onSelectMonth={handleMonthChange}
                            isLoadingMonth={isLoadingMonth}
                        />
                    </div>

                    <section aria-label="Customer experience and barber performance" className="col-span-1 lg:col-span-2 bg-charcoal-light border border-white/5 rounded-sm card-gold-accent">
                        <div className="px-4 py-4 sm:px-5 border-b border-white/5">
                            <h2 className="font-serif font-bold text-ivory text-lg">Customer Experience & Team Performance</h2>
                            <p className="text-xs text-ivory-dim mt-1">Customer feedback alongside your leading barbers. Ranked by completed services.</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch">
                            <div className="p-4 min-w-0 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col justify-between">
                                <CustomerReviewsGraph
                                    embedded
                                    customerSatisfaction={branchStats?.customer_satisfaction}
                                    onExpand={() => setExpandedGraph('reviews')}
                                />
                            </div>
                            <div className="p-4 min-w-0">
                                <TopBarbersGraph
                                    embedded
                                    barbers={branchStats?.top_performing_barbers}
                                    onExpand={() => setExpandedGraph('barbers')}
                                    onNavigateToStaff={() => onNavigateTab?.('management', 'staff')}
                                />
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {/* --- 3. ENLARGED INTERACTIVE MODAL VIEW --- */}
            <ExpandedGraphModal
                isOpen={expandedGraph !== null}
                onClose={() => setExpandedGraph(null)}
                graphType={expandedGraph}
                branchStats={branchStats}
                onNavigateTab={onNavigateTab}
                onSelectMonth={handleMonthChange}
                isLoadingMonth={isLoadingMonth}
            />
        </div>
    );
};

export default DashboardTab;
