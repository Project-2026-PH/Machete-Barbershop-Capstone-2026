import React, { useEffect, useState } from 'react';
import { Star, Maximize2, ThumbsUp, Award } from 'lucide-react';
import type { DashboardCustomerSatisfaction } from '@demoshop/shared-types';
import { Modal } from '@/components/feedback/Modal';
import { adminDashboardService } from '@/features/admin/services/admin-dashboard.service';

type CustomerReview = NonNullable<DashboardCustomerSatisfaction['recent_reviews']>[number];

const ReviewItem = ({ review, compact = false }: { review: CustomerReview; compact?: boolean }) => (
    <article className={`${compact ? 'py-1.5' : 'py-2'} min-w-0`}>
        <div className="flex items-center justify-between gap-2 text-xs">
            <span title={review.customer_name} className="font-bold text-ivory truncate">{review.customer_name}</span>
            <span aria-label={`${review.stars} out of 5 stars`} className="flex items-center gap-1 text-gold shrink-0"><Star aria-hidden="true" className="w-3 h-3 fill-gold" />{Number(review.stars).toFixed(1)}</span>
        </div>
        <p className={`text-xs text-ivory-dim leading-relaxed mt-0.5 break-words ${compact ? 'line-clamp-2 text-[11px]' : 'whitespace-pre-wrap'}`}>{review.comment?.trim() || 'No written comment.'}</p>
        <p className="mt-0.5 text-[10px] text-ivory-dim/80 break-words">{review.barber_name} · {new Date(`${review.date}T12:00:00+08:00`).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}</p>
    </article>
);

interface CustomerReviewsGraphProps {
    customerSatisfaction?: DashboardCustomerSatisfaction;
    onExpand?: () => void;
    isExpanded?: boolean;
    embedded?: boolean;
}

export const CustomerReviewsGraph: React.FC<CustomerReviewsGraphProps> = ({
    customerSatisfaction,
    onExpand,
    isExpanded = false,
    embedded = false,
}) => {
    const [reviewsOpen, setReviewsOpen] = useState(false);
    const [reviewPage, setReviewPage] = useState(1);
    const [reviewList, setReviewList] = useState<{ reviews: CustomerReview[]; total: number; limit: number }>({ reviews: [], total: 0, limit: 10 });
    const [loadingReviews, setLoadingReviews] = useState(false);
    const [reviewsError, setReviewsError] = useState('');
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        if (!reviewsOpen) return;
        let cancelled = false;
        setLoadingReviews(true);
        setReviewsError('');
        adminDashboardService.getCustomerReviews(reviewPage).then((data) => {
            if (!cancelled) setReviewList(data);
        }).catch(() => {
            if (!cancelled) setReviewsError('Unable to load reviews. Please try again.');
        }).finally(() => { if (!cancelled) setLoadingReviews(false); });
        return () => { cancelled = true; };
    }, [reviewsOpen, reviewPage, retry]);
    const avgRating = customerSatisfaction?.average_rating ?? 0;
    const totalReviews = customerSatisfaction?.total_reviews ?? 0;
    const breakdown = customerSatisfaction?.stars_breakdown ?? {
        star5: 0,
        star4: 0,
        star3: 0,
        star2: 0,
        star1: 0,
    };

    const positivePercentage = customerSatisfaction?.positive_percentage ?? (
        totalReviews > 0
            ? Math.round(((breakdown.star5 + breakdown.star4) / totalReviews) * 100)
            : 0
    );

    const starTiers = [5, 4, 3, 2, 1] as const;

    return (
        <div className={embedded ? 'flex flex-col min-w-0 h-full justify-between' : `bg-charcoal-light border border-white/5 rounded-sm p-4 card-gold-accent flex flex-col justify-between ${isExpanded ? 'h-full' : 'min-h-[300px]'}`}>
            {/* Header & Controls */}
            <div className="flex justify-between items-center pb-2.5 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                    <div className={`${embedded ? 'p-1 rounded-full bg-gold/10 border border-gold/20 text-gold' : 'p-2 rounded-full bg-gold/10 border border-gold/20 text-gold'}`}>
                        <Star className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'} fill-gold text-gold`} />
                    </div>
                    <div>
                        <h3 className="font-serif font-bold text-ivory text-sm sm:text-base">Customer Reviews</h3>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {totalReviews > 0 && <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-bold">
                        <ThumbsUp className="w-3 h-3" />
                        <span>{positivePercentage}% Positive</span>
                    </div>}

                    {!isExpanded && onExpand && (
                        <button
                            type="button"
                            onClick={onExpand}
                            className="p-1.5 rounded-sm border border-white/10 bg-white/5 hover:bg-gold/10 hover:border-gold/30 hover:text-gold text-ivory-dim transition-all cursor-pointer flex items-center justify-center shrink-0 min-h-[30px] min-w-[30px]"
                            title="Expand Customer Reviews Graph"
                            aria-label="Expand Customer Reviews Graph"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Score & Distribution Visual */}
            <div className={embedded ? 'grid grid-cols-[90px_minmax(0,1fr)] items-center gap-3 pt-2.5' : 'flex-1 flex flex-col sm:flex-row items-center gap-6 py-4'}>
                {/* Left: Overall Score Card */}
                <div className={`flex flex-col items-center justify-center text-center shrink-0 ${embedded ? 'py-1 w-full' : 'p-3 sm:p-4 bg-white/[0.02] border border-white/5 rounded-sm w-full sm:w-44'}`}>
                    <span className={`${embedded ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl'} font-serif font-bold text-gold tracking-tight leading-none`}>
                        {totalReviews > 0 ? avgRating.toFixed(1) : '—'}
                    </span>

                    {/* Star Display */}
                    <div className="flex items-center gap-0.5 my-1.5">
                        {[1, 2, 3, 4, 5].map((i) => {
                            const isFull = totalReviews > 0 && i <= Math.floor(avgRating);
                            const isPartial = totalReviews > 0 && i === Math.ceil(avgRating) && avgRating % 1 !== 0;
                            return (
                                <Star
                                    key={i}
                                    className={`${embedded ? 'w-3 h-3' : 'w-4 h-4'} ${isFull
                                        ? 'text-gold fill-gold'
                                        : isPartial
                                            ? 'text-gold fill-gold/50'
                                            : 'text-white/20'
                                        }`}
                                />
                            );
                        })}
                    </div>

                    <span className="text-[10px] font-bold uppercase tracking-wider text-ivory">
                        {totalReviews} Total Reviews
                    </span>
                    <span className="text-[9px] text-ivory-dim/70 mt-0.5 leading-tight">
                        {totalReviews > 0 ? `${positivePercentage}% rated 4 or 5 stars` : 'Awaiting customer feedback'}
                    </span>
                </div>

                {/* Right: Star Distribution Bars */}
                <div className="min-w-0 w-full space-y-1.5">
                    {starTiers.map((stars) => {
                        const count = breakdown[`star${stars}` as keyof typeof breakdown] || 0;
                        const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;

                        return (
                            <div key={stars} className="flex items-center gap-1.5 text-xs group cursor-default">
                                <div className="flex items-center gap-1 w-5 text-ivory font-bold shrink-0 text-[11px]">
                                    <span>{stars}</span>
                                    <Star className="w-2.5 h-2.5 text-gold fill-gold" />
                                </div>

                                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gold rounded-full transition-all duration-700 ease-out group-hover:bg-amber-300"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>

                                <div className="w-11 text-right text-[10px] shrink-0 font-mono">
                                    <span className="text-ivory font-bold">{count}</span>
                                    <span className="text-ivory-dim/60 ml-0.5">({pct}%)</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {embedded && (
                <section aria-label="Latest customer reviews" className="mt-2.5 pt-2 border-t border-white/10 shrink-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-ivory-dim">Latest reviews</h4>
                        {totalReviews > 2 && <button type="button" onClick={() => { setReviewPage(1); setReviewsOpen(true); }} className="text-[11px] text-gold py-0.5 hover:underline cursor-pointer">View All ({totalReviews})</button>}
                    </div>
                    {customerSatisfaction?.recent_reviews?.length ? (
                        <div className="divide-y divide-white/5">
                            {customerSatisfaction.recent_reviews.slice(0, 2).map((review) => <ReviewItem key={review.id} review={review} compact />)}
                        </div>
                    ) : <p className="text-xs text-ivory-dim py-2">Recent feedback will appear here when customer reviews are available.</p>}
                </section>
            )}

            <Modal isOpen={reviewsOpen} onClose={() => setReviewsOpen(false)} title="Customer Reviews" size="lg" footer={
                <div className="flex flex-wrap items-center justify-between gap-3 w-full text-xs text-ivory-dim">
                    <span>{reviewList.total} reviews · Newest first</span>
                    <div className="flex items-center gap-3">
                        <button type="button" disabled={loadingReviews || reviewPage <= 1} onClick={() => setReviewPage((page) => page - 1)} className="py-2 text-gold disabled:opacity-40 cursor-pointer">Previous</button>
                        <span>Page {reviewPage} of {Math.max(1, Math.ceil(reviewList.total / reviewList.limit))}</span>
                        <button type="button" disabled={loadingReviews || reviewPage * reviewList.limit >= reviewList.total} onClick={() => setReviewPage((page) => page + 1)} className="py-2 text-gold disabled:opacity-40 cursor-pointer">Next</button>
                    </div>
                </div>
            }>
                {loadingReviews ? <p role="status" className="text-sm text-ivory-dim py-6">Loading reviews…</p> : reviewsError ? <div role="alert" className="text-sm text-ivory-dim">{reviewsError}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-2 text-gold underline cursor-pointer">Retry</button></div> : reviewList.reviews.length ? <div className="divide-y divide-white/10">{reviewList.reviews.map((review) => <ReviewItem key={review.id} review={review} />)}</div> : <p className="text-sm text-ivory-dim py-6">No customer reviews yet.</p>}
            </Modal>

            {/* In Expanded Mode: Detailed breakdown info */}
            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-sm bg-white/[0.02] border border-white/5">
                        <div className="flex items-center gap-2 text-gold mb-1">
                            <Award className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Service Reputation</span>
                        </div>
                        <p className="text-base font-serif font-bold text-ivory">
                            {totalReviews === 0 ? 'Awaiting feedback' : avgRating >= 4.5 ? 'Exceptional Tier' : avgRating >= 4.0 ? 'Great Tier' : 'Standard'}
                        </p>
                        <p className="text-[10px] text-ivory-dim mt-0.5">Based on client verified ratings</p>
                    </div>

                    <div className="p-3 rounded-sm bg-white/[0.02] border border-white/5">
                        <div className="flex items-center gap-2 text-emerald-400 mb-1">
                            <ThumbsUp className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Satisfaction Rate</span>
                        </div>
                        <p className="text-base font-serif font-bold text-emerald-400">
                            {positivePercentage}%
                        </p>
                        <p className="text-[10px] text-ivory-dim mt-0.5">Positive 4 & 5-star ratio</p>
                    </div>

                    <div className="p-3 rounded-sm bg-white/[0.02] border border-white/5">
                        <div className="flex items-center gap-2 text-gold mb-1">
                            <Star className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">5-Star Volume</span>
                        </div>
                        <p className="text-base font-serif font-bold text-gold">
                            {breakdown.star5} reviews
                        </p>
                        <p className="text-[10px] text-ivory-dim mt-0.5">Top-tier customer praise</p>
                    </div>
                </div>
            )}
        </div>
    );
};
