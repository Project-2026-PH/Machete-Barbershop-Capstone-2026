import React, { useEffect } from 'react';
import { X, Minimize2, TrendingUp, Star, Calendar, Scissors } from 'lucide-react';
import Portal from '@/components/common/Portal';
import type { BranchStatsResponse } from '@demoshop/shared-types';
import { RevenueOverviewGraph } from './RevenueOverviewGraph';
import { CustomerReviewsGraph } from './CustomerReviewsGraph';
import { MonthlyCustomersGraph } from './MonthlyCustomersGraph';
import { TopBarbersGraph } from './TopBarbersGraph';

export type ExpandedGraphType = 'revenue' | 'reviews' | 'monthly_customers' | 'barbers';

interface ExpandedGraphModalProps {
    isOpen: boolean;
    onClose: () => void;
    graphType: ExpandedGraphType | null;
    branchStats: BranchStatsResponse | null;
    onNavigateTab?: (tab: string, subTab?: string, extraParams?: Record<string, string>) => void;
    onSelectMonth?: (monthKey: string) => void;
    isLoadingMonth?: boolean;
}

export const ExpandedGraphModal: React.FC<ExpandedGraphModalProps> = ({
    isOpen,
    onClose,
    graphType,
    branchStats,
    onNavigateTab,
    onSelectMonth,
    isLoadingMonth,
}) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !graphType) return null;

    const titles: Record<ExpandedGraphType, { title: string; subtitle: string; icon: React.ReactNode }> = {
        revenue: {
            title: 'Revenue Overview Analytics',
            subtitle: 'Granular period performance, revenue aggregations, and daily velocity',
            icon: <TrendingUp className="w-5 h-5 text-gold" />,
        },
        reviews: {
            title: 'Customer Reviews & Feedback Ratings',
            subtitle: 'Detailed rating distribution, customer satisfaction scores, and feedback volume',
            icon: <Star className="w-5 h-5 fill-gold text-gold" />,
        },
        monthly_customers: {
            title: 'Monthly Customers Served Timeline',
            subtitle: 'Day-by-day customer traffic with walk-in vs online reservation segmentation',
            icon: <Calendar className="w-5 h-5 text-emerald-400" />,
        },
        barbers: {
            title: 'Barber Leaderboard',
            subtitle: 'Compare completed services, gross sales, and customer feedback.',
            icon: <Scissors className="w-5 h-5 text-gold" />,
        },
    };

    const currentMeta = titles[graphType];

    return (
        <Portal>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 md:p-8">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/85 backdrop-blur-md transform-gpu will-change-transform animate-fade-in"
                    onClick={onClose}
                />

                {/* Modal Container */}
                <div className="relative w-full max-w-5xl bg-charcoal text-ivory border border-white/10 rounded-sm shadow-2xl animate-zoom-in flex flex-col max-h-[92vh] overflow-hidden card-gold-accent">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-white/[0.02] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-gold/10 border border-gold/20">
                                {currentMeta.icon}
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-xl font-serif font-bold text-ivory">
                                    {currentMeta.title}
                                </h3>
                                <p className="text-xs text-ivory-dim hidden sm:block">
                                    {currentMeta.subtitle}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {graphType !== 'barbers' && <button
                                type="button"
                                onClick={onClose}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-white/10 bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-ivory text-xs transition-colors cursor-pointer"
                                title="Exit Full Screen View"
                            >
                                <Minimize2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Minimize</span>
                            </button>}

                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 text-ivory-dim hover:text-gold hover:bg-white/5 rounded-full transition-colors cursor-pointer"
                                aria-label="Close modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                        {graphType === 'revenue' && (
                            <RevenueOverviewGraph
                                revenueChart={branchStats?.revenue_chart}
                                isExpanded={true}
                                onNavigateToSales={() => {
                                    onClose();
                                    onNavigateTab?.('reports', 'sales');
                                }}
                            />
                        )}

                        {graphType === 'reviews' && (
                            <CustomerReviewsGraph
                                customerSatisfaction={branchStats?.customer_satisfaction}
                                isExpanded={true}
                            />
                        )}

                        {graphType === 'monthly_customers' && (
                            <MonthlyCustomersGraph
                                monthlyData={branchStats?.monthly_customers_served}
                                isExpanded={true}
                                onNavigateToTransactions={() => {
                                    onClose();
                                    onNavigateTab?.('reports', 'transactions', { channel: 'all', preset: 'this_month' });
                                }}
                                onSelectMonth={onSelectMonth}
                                isLoadingMonth={isLoadingMonth}
                            />
                        )}

                        {graphType === 'barbers' && (
                            <TopBarbersGraph
                                barbers={branchStats?.top_performing_barbers}
                                isExpanded={true}
                                onNavigateToStaff={() => {
                                    onClose();
                                    onNavigateTab?.('management', 'staff');
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </Portal>
    );
};
