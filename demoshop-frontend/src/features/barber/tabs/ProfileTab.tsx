import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { 
    Star, 
    TrendingUp, 
    Users, 
    Award, 
    Loader2, 
    ChevronRight, 
    Calendar,
    Plus,
    Eye,
    Edit3,
    Camera,
    CheckCircle,
    ShieldCheck,
    Scissors
} from 'lucide-react';
import { 
    barberService, 
    BarberPerformanceData, 
    BarberEarningsReceipt,
    BarberPortfolioData,
    BarberPortfolioItem,
    BarberSpecialty
} from '../services/barber.service';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { EarningsBreakdownModal } from '../components/modals/EarningsBreakdownModal';
import { AddPortfolioWorkModal } from '../components/modals/AddPortfolioWorkModal';
import { EditPortfolioWorkModal } from '../components/modals/EditPortfolioWorkModal';
import { EditSpecialtiesModal } from '../components/modals/EditSpecialtiesModal';
import { EditBioModal } from '../components/modals/EditBioModal';
import { PublicPortfolioPreviewModal } from '../components/modals/PublicPortfolioPreviewModal';

/**
 * Custom hook for smooth numerical count-up easing animations
 */
function useCountUp(target: number, duration: number = 900, decimals: number = 0, isReady: boolean = true) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!isReady) {
            setCount(0);
            return;
        }

        let startTimestamp: number | null = null;
        let animationFrameId: number;

        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setCount(easeOut * target);

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(step);
            } else {
                setCount(target);
            }
        };

        animationFrameId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animationFrameId);
    }, [target, duration, decimals, isReady]);

    return count.toFixed(decimals);
}

export interface ProfileTabProps {
    /** Opens the shared BarberProfileModal (name, photo, password). */
    onOpenAccount?: () => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ onOpenAccount }) => {
    const [performance, setPerformance] = useState<BarberPerformanceData | null>(null);
    const [portfolio, setPortfolio] = useState<BarberPortfolioData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { user } = useAuth() as any;
    const lastUsernameRef = useRef<string | undefined>(user?.username);
    const [animateBars, setAnimateBars] = useState(false);

    // Modal Visibility States
    const [isServedModalOpen, setIsServedModalOpen] = useState(false);
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [isEarningsModalOpen, setIsEarningsModalOpen] = useState(false);
    const [isAddWorkModalOpen, setIsAddWorkModalOpen] = useState(false);
    const [selectedEditItem, setSelectedEditItem] = useState<BarberPortfolioItem | null>(null);
    const [isEditSpecialtiesModalOpen, setIsEditSpecialtiesModalOpen] = useState(false);
    const [isEditBioModalOpen, setIsEditBioModalOpen] = useState(false);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

    const [servedReceipts, setServedReceipts] = useState<BarberEarningsReceipt[]>([]);
    const [loadingServed, setLoadingServed] = useState(false);

    // Load served customer receipts on modal open
    useEffect(() => {
        if (!isServedModalOpen) return;
        let isMounted = true;
        setLoadingServed(true);
        barberService.getEarnings('today')
            .then(data => {
                if (isMounted) setServedReceipts(data.receipts || []);
            })
            .catch(err => {
                console.warn('Failed to load served receipts:', err);
                if (isMounted) setServedReceipts([]);
            })
            .finally(() => {
                if (isMounted) setLoadingServed(false);
            });
        return () => { isMounted = false; };
    }, [isServedModalOpen]);

    // Initial parallel data fetch: Performance + Portfolio
    useEffect(() => {
        let isMounted = true;
        const loadAllData = async () => {
            setIsLoading(true);
            setAnimateBars(false);
            try {
                const [perfData, portData] = await Promise.all([
                    barberService.getPerformance().catch(() => ({
                        servedCount: 0,
                        targetCount: 12,
                        rating: null,
                        totalReviews: 0,
                        totalSales: 0,
                        reviews: []
                    })),
                    barberService.getPortfolio().catch((err) => {
                        console.warn('Failed to load portfolio:', err);
                        return null;
                    })
                ]);

                if (isMounted) {
                    setPerformance(perfData);
                    setPortfolio(portData);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                    setTimeout(() => setAnimateBars(true), 80);
                }
            }
        };

        loadAllData();
        return () => { isMounted = false; };
    }, []);

    // A saved name in BarberProfileModal refreshes the auth user (refetchMe),
    // but the portfolio name above was fetched once. Re-read it when the
    // username changes so the header card reflects the update immediately.
    useEffect(() => {
        const username = user?.username;
        if (!username || username === lastUsernameRef.current) return;
        lastUsernameRef.current = username;
        let isMounted = true;
        setPortfolio(prev => prev ? { ...prev, name: username } : prev);
        barberService.getPortfolio()
            .then(data => { if (isMounted && data) setPortfolio(data); })
            .catch(() => { /* keep optimistic name */ });
        return () => { isMounted = false; };
    }, [user?.username]);

    // Operational statistics computations
    const servedCount = performance?.servedCount ?? 0;
    const targetCount = performance?.targetCount || 12;
    const rating = portfolio?.rating ?? performance?.rating ?? null;
    const totalReviews = portfolio?.totalReviews ?? performance?.totalReviews ?? (performance?.reviews?.length || 0);
    const hasRatings = rating !== null && totalReviews > 0;
    const totalSales = performance?.totalSales || 0;
    const reviews = portfolio?.feedback?.length ? portfolio.feedback : (performance?.reviews || []);
    const completedAllTime = portfolio?.completedServicesCount ?? servedCount;
    const heroName = portfolio?.name || user?.username || 'Barber';
    // Prefer the auth user's photo so a change in BarberProfileModal shows immediately.
    const userPicture = user?.profile_picture || user?.profilePicture;
    const avatarUrl = (typeof userPicture === 'string' && userPicture.startsWith('http') ? userPicture : null) || portfolio?.profilePicture || null;

    const isHigherTier = totalSales >= 3000;
    const commissionRate = isHigherTier ? 0.50 : 0.40;
    const estimatedCommission = totalSales * commissionRate;
    const quotaProgressPercent = Math.min(100, Math.round((totalSales / 3000) * 100));

    // Animated CountUp Values
    const animatedServed = useCountUp(servedCount, 900, 0, !isLoading);
    const animatedRating = useCountUp(hasRatings ? (rating || 0) : 0, 900, 1, !isLoading && hasRatings);
    const animatedCommission = useCountUp(estimatedCommission, 1000, 2, !isLoading);
    const animatedProgressPercent = useCountUp(quotaProgressPercent, 1000, 0, !isLoading);
    const animatedSales = useCountUp(totalSales, 1000, 0, !isLoading);

    const starCounts = useMemo(() => {
        const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reviews.forEach((r: any) => {
            const s = Math.round(Number(r.rating));
            if (s >= 1 && s <= 5) counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
    }, [reviews]);

    // Portfolio State Handlers
    const handlePortfolioWorkAdded = (newItem: BarberPortfolioItem) => {
        setPortfolio(prev => prev ? {
            ...prev,
            portfolioItems: [newItem, ...(prev.portfolioItems || [])],
        } : prev);
    };

    const handlePortfolioWorkUpdated = (updatedItem: BarberPortfolioItem) => {
        setPortfolio(prev => prev ? {
            ...prev,
            portfolioItems: (prev.portfolioItems || []).map(i => i.id === updatedItem.id ? updatedItem : i),
        } : prev);
    };

    const handlePortfolioWorkDeleted = (deletedItemId: number) => {
        setPortfolio(prev => prev ? {
            ...prev,
            portfolioItems: (prev.portfolioItems || []).filter(i => i.id !== deletedItemId),
        } : prev);
    };

    const handleSpecialtiesUpdated = (newSpecs: BarberSpecialty[]) => {
        setPortfolio(prev => prev ? {
            ...prev,
            specialties: newSpecs,
        } : prev);
    };

    const handleBioUpdated = (newBio: string) => {
        setPortfolio(prev => prev ? {
            ...prev,
            bio: newBio,
        } : prev);
    };

    return (
        <div className="space-y-6 sm:space-y-8 animate-fade-in w-full max-w-5xl mx-auto pb-16">
            
            {/* 1. Identity hero: matches the staff profile layout */}
            <section className="relative overflow-hidden rounded-xl border border-white/10 bg-charcoal-light shadow-2xl">
                <div className="relative h-24 overflow-hidden bg-gradient-to-r from-gold/25 via-gold/10 to-transparent sm:h-28">
                    <div className="absolute inset-0 bg-texture opacity-30 pointer-events-none"></div>
                    <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-[70px] pointer-events-none"></div>
                </div>

                <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
                    <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
                        <div className="relative -mt-12 shrink-0 sm:-mt-14">
                            {isLoading ? (
                                <Skeleton className="h-24 w-24 rounded-full sm:h-28 sm:w-28" />
                            ) : avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt={heroName}
                                    className="h-24 w-24 rounded-full border-4 border-charcoal-light object-cover shadow-2xl ring-1 ring-gold/40 sm:h-28 sm:w-28"
                                />
                            ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-charcoal-light bg-gradient-to-br from-gold/30 to-gold/5 font-serif text-3xl font-bold text-gold shadow-2xl ring-1 ring-gold/40 sm:h-28 sm:w-28">
                                    {heroName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <span className="absolute bottom-2 right-2 h-4 w-4 rounded-full border-2 border-charcoal-light bg-emerald-500" aria-label="Active"></span>
                        </div>

                        <div className="w-full min-w-0 flex-1 space-y-2 pb-1">
                            {isLoading ? (
                                <Skeleton className="mx-auto h-8 w-44 sm:mx-0" />
                            ) : (
                                <h2 className="[overflow-wrap:anywhere] font-serif text-2xl font-bold text-ivory sm:truncate sm:text-3xl">{heroName}</h2>
                            )}
                            <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:justify-start">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-bold uppercase tracking-[0.15em] text-gold">
                                    <Scissors className="h-3.5 w-3.5" />
                                    Master Barber
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-ivory">
                                    <Star className={`h-3.5 w-3.5 ${hasRatings ? 'fill-gold text-gold' : 'text-white/30'}`} />
                                    {hasRatings ? `${Number(rating).toFixed(1)} · ${totalReviews} ${totalReviews === 1 ? 'review' : 'reviews'}` : 'No ratings yet'}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-ivory">
                                    <Award className="h-3.5 w-3.5 text-gold/80" />
                                    {completedAllTime} completed {completedAllTime === 1 ? 'cut' : 'cuts'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-4 border-t border-white/5 pt-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 lg:max-w-xl">
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">About</span>
                            {isLoading ? (
                                <Skeleton className="mt-1.5 h-4 w-64" />
                            ) : portfolio?.bio && portfolio.bio.trim() ? (
                                <p className="mt-1 line-clamp-3 text-sm italic leading-relaxed text-ivory-dim">"{portfolio.bio}"</p>
                            ) : (
                                <p className="mt-1 text-sm text-ivory-dim/70">Add a short bio so customers know your style.</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
                            {onOpenAccount && (
                                <Button
                                    variant="outline"
                                    onClick={onOpenAccount}
                                    className="flex items-center justify-center gap-1.5 border-white/20 !px-4 !py-2 text-xs hover:border-gold/50"
                                >
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Account &amp; Security
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={() => setIsEditBioModalOpen(true)}
                                className="flex items-center justify-center gap-1.5 border-white/20 !px-4 !py-2 text-xs hover:border-gold/50"
                            >
                                <Edit3 className="h-3.5 w-3.5" />
                                {portfolio?.bio ? 'Edit Bio' : 'Add Bio'}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => setIsPreviewModalOpen(true)}
                                className="flex items-center justify-center gap-1.5 !px-4 !py-2 text-xs"
                            >
                                <Eye className="h-3.5 w-3.5" />
                                Preview Portfolio
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. Quick stats row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Served Today Card */}
                <div 
                    className="bg-charcoal-light border border-white/10 hover:border-gold/40 active:border-gold/70 active:scale-[0.98] active:bg-white/[0.02] p-5 rounded-sm relative overflow-hidden flex items-center justify-between shadow-2xl group transition-all duration-200 cursor-pointer select-none animate-fade-in"
                    onClick={() => setIsServedModalOpen(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsServedModalOpen(true); } }}
                    title="Tap to view served customer overview"
                >
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>
                    <div className="w-full">
                        <div className="flex items-center justify-between pr-2">
                            <span className="text-[10px] uppercase tracking-widest text-ivory-dim font-bold block">Served Today</span>
                            <span className="text-[9px] font-bold text-gold/90 bg-gold/10 px-1.5 py-0.5 rounded-xs uppercase tracking-wider border border-gold/20 flex items-center gap-0.5 group-hover:text-gold group-hover:bg-gold/20 transition-colors">
                                Details <ChevronRight className="w-2.5 h-2.5" />
                            </span>
                        </div>
                        {isLoading ? (
                            <Skeleton className="h-7 w-20 mt-1" />
                        ) : (
                            <span className="text-2xl font-bold text-ivory mt-1 block">
                                {animatedServed} / {targetCount}
                            </span>
                        )}
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/25 to-gold/5 border border-gold/40 flex items-center justify-center text-gold shadow-[0_0_12px_rgba(212,175,55,0.15)] flex-shrink-0 group-hover:scale-105 group-active:scale-95 transition-transform">
                        <Users className="w-5 h-5" />
                    </div>
                </div>

                {/* Average Rating Card */}
                <div 
                    className="bg-charcoal-light border border-white/10 hover:border-gold/40 active:border-gold/70 active:scale-[0.98] active:bg-white/[0.02] p-5 rounded-sm relative overflow-hidden flex items-center justify-between shadow-2xl group transition-all duration-200 cursor-pointer select-none animate-fade-in"
                    style={{ animationDelay: '80ms', animationFillMode: 'both' }}
                    onClick={() => setIsRatingModalOpen(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsRatingModalOpen(true); } }}
                    title="Tap to view customer ratings and feedback summary"
                >
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>
                    <div className="w-full">
                        <div className="flex items-center justify-between pr-2">
                            <span className="text-[10px] uppercase tracking-widest text-ivory-dim font-bold block">Average Rating</span>
                            <span className="text-[9px] font-bold text-gold/90 bg-gold/10 px-1.5 py-0.5 rounded-xs uppercase tracking-wider border border-gold/20 flex items-center gap-0.5 group-hover:text-gold group-hover:bg-gold/20 transition-colors">
                                Reviews <ChevronRight className="w-2.5 h-2.5" />
                            </span>
                        </div>
                        {isLoading ? (
                            <Skeleton className="h-7 w-20 mt-1" />
                        ) : hasRatings ? (
                            <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-2xl font-bold text-gold block">
                                    {animatedRating}
                                </span>
                                <Star className="w-4 h-4 fill-gold text-gold inline ml-0.5 shrink-0 self-center" />
                                <span className="text-xs text-ivory-dim font-normal ml-1 font-mono">({totalReviews})</span>
                            </div>
                        ) : (
                            <span className="text-sm font-semibold text-ivory-dim mt-2 block">
                                No ratings yet
                            </span>
                        )}
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/25 to-gold/5 border border-gold/40 flex items-center justify-center text-gold shadow-[0_0_12px_rgba(212,175,55,0.15)] flex-shrink-0 group-hover:scale-105 group-active:scale-95 transition-transform">
                        <Star className={`w-5 h-5 ${hasRatings ? 'fill-gold text-gold' : 'text-gold/40'}`} />
                    </div>
                </div>

                {/* Est Commission Card */}
                <div 
                    className="bg-charcoal-light border border-white/10 hover:border-gold/50 active:border-gold/70 active:scale-[0.98] active:bg-white/[0.02] p-5 rounded-sm relative overflow-hidden flex items-center justify-between shadow-2xl group transition-all duration-200 cursor-pointer select-none animate-fade-in"
                    style={{ animationDelay: '160ms', animationFillMode: 'both' }}
                    onClick={() => setIsEarningsModalOpen(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEarningsModalOpen(true); } }}
                    title="Tap to view detailed itemized earnings breakdown"
                >
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/60 to-transparent"></div>
                    <div className="w-full">
                        <div className="flex items-center justify-between pr-2 gap-1 flex-wrap">
                            <span className="text-[10px] uppercase tracking-widest text-ivory-dim font-bold block">Est. Commission</span>
                            <span className="text-[9px] font-bold text-gold/90 bg-gold/10 px-1.5 py-0.5 rounded-xs uppercase tracking-wider border border-gold/20 flex items-center gap-0.5 group-hover:text-gold group-hover:bg-gold/20 transition-colors shrink-0">
                                Breakdown <ChevronRight className="w-2.5 h-2.5" />
                            </span>
                        </div>
                        {isLoading ? (
                            <Skeleton className="h-7 w-28 mt-1" />
                        ) : (
                            <div className="mt-1">
                                <span className="text-2xl font-bold text-emerald-400 block font-mono">
                                    ₱{animatedCommission}
                                </span>
                                <span className="text-[10px] text-ivory-dim/70 flex items-center gap-1 mt-0.5">
                                    <TrendingUp className="w-3 h-3 text-gold/70 shrink-0" />
                                    {isHigherTier ? '50% High-Volume Tier' : '40% Standard Tier'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 3. BARBER-MANAGED: Specialties Section */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 sm:p-5 relative overflow-hidden shadow-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <span className="text-[11px] uppercase tracking-widest text-gold font-bold block">
                            Specialties
                        </span>
                        <span className="text-[10px] text-ivory-dim/60">
                            Services you specialize in from DemoShop catalog
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setIsEditSpecialtiesModalOpen(true)}
                        className="text-xs text-gold border-gold/30 hover:border-gold/60 hover:bg-gold/10 shrink-0 px-3 py-1.5"
                    >
                        <Edit3 className="w-3 h-3 mr-1" />
                        {portfolio?.specialties?.length ? 'Edit Specialties' : 'Add Specialties'}
                    </Button>
                </div>

                {isLoading ? (
                    <div className="flex gap-2">
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-8 w-28" />
                        <Skeleton className="h-8 w-20" />
                    </div>
                ) : portfolio?.specialties?.length ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {portfolio.specialties.map((spec) => (
                            <span
                                key={spec.serviceId}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-gold/10 border border-gold/30 text-gold text-xs font-semibold tracking-wide shadow-xs"
                            >
                                <CheckCircle className="w-3.5 h-3.5 text-gold/80" />
                                {spec.title}
                            </span>
                        ))}
                    </div>
                ) : (
                    <div className="p-5 rounded-sm border border-dashed border-white/10 bg-white/[0.01] text-center space-y-2">
                        <p className="text-xs text-ivory-dim/60">No specialties selected yet.</p>
                        <Button
                            variant="ghost"
                            onClick={() => setIsEditSpecialtiesModalOpen(true)}
                            className="text-gold text-xs hover:text-gold/80 px-3 py-1.5"
                        >
                            + Select from DemoShop Services
                        </Button>
                    </div>
                )}
            </div>

            {/* 4. BARBER-MANAGED: Previous Work Gallery */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 sm:p-5 relative overflow-hidden shadow-xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] uppercase tracking-widest text-gold font-bold block">
                                Previous Work
                            </span>
                            <span className="text-[10px] text-ivory-dim/50 font-mono">
                                ({portfolio?.portfolioItems?.length || 0})
                            </span>
                        </div>
                        <span className="text-[10px] text-ivory-dim/60">
                            Upload your cuts and fades to display on your public portfolio
                        </span>
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => setIsAddWorkModalOpen(true)}
                        className="text-xs flex items-center gap-1.5 shrink-0 px-4 py-2"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Work
                    </Button>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        <Skeleton className="aspect-square w-full rounded-sm" />
                        <Skeleton className="aspect-square w-full rounded-sm" />
                        <Skeleton className="aspect-square w-full rounded-sm" />
                        <Skeleton className="aspect-square w-full rounded-sm" />
                    </div>
                ) : portfolio?.portfolioItems?.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {portfolio.portfolioItems.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setSelectedEditItem(item)}
                                className="group relative rounded-sm overflow-hidden bg-charcoal border border-white/10 hover:border-gold/60 transition-all cursor-pointer aspect-square shadow-lg"
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedEditItem(item);
                                    }
                                }}
                            >
                                <img
                                    src={item.imageUrl}
                                    alt={item.caption || 'Barber portfolio work'}
                                    width={400}
                                    height={400}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-end">
                                    {item.serviceTitle && (
                                        <span className="text-[10px] font-bold text-gold uppercase tracking-wider block truncate">
                                            {item.serviceTitle}
                                        </span>
                                    )}
                                    {item.caption && (
                                        <p className="text-[11px] text-ivory/90 leading-tight line-clamp-2 mt-0.5">
                                            {item.caption}
                                        </p>
                                    )}
                                    <span className="text-[9px] text-white/50 mt-1 flex items-center gap-1 font-mono">
                                        <Edit3 className="w-2.5 h-2.5" /> Tap to manage
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-12 px-4 rounded-sm border border-dashed border-white/10 bg-white/[0.01] text-center space-y-2">
                        <Camera className="w-9 h-9 text-gold/30 mx-auto" />
                        <p className="text-xs font-semibold text-ivory">No portfolio work added yet.</p>
                        <p className="text-[11px] text-ivory-dim/60 max-w-sm mx-auto">
                            Showcase your best haircuts, fades, and styles to attract new clients during booking.
                        </p>
                        <Button
                            variant="primary"
                            onClick={() => setIsAddWorkModalOpen(true)}
                            className="text-xs mt-2 px-4 py-2"
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Add Work
                        </Button>
                    </div>
                )}
            </div>

            {/* 5. SYSTEM-GENERATED / READ-ONLY: Customer Feedback & Performance */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm p-4 sm:p-5 relative overflow-hidden shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/5 pb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] uppercase tracking-widest text-gold font-bold block">
                                Verified Customer Feedback
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-xs bg-white/5 border border-white/10 text-ivory-dim/70 flex items-center gap-1 font-mono">
                                <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                                System Verified • Read Only
                            </span>
                        </div>
                        <span className="text-[10px] text-ivory-dim/50">
                            Ratings and reviews are system-recorded from completed appointments. Not manually editable.
                        </span>
                    </div>
                    {hasRatings && (
                        <div className="flex items-center gap-1.5 self-start sm:self-center mt-1 sm:mt-0 font-mono">
                            <span className="text-xs font-bold text-gold">{animatedRating}</span>
                            <Star className="w-3 h-3 fill-gold text-gold" />
                            <span className="text-[10px] text-ivory-dim/60">({totalReviews} reviews)</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Rating Breakdown Chart */}
                    <div className="space-y-3">
                        <div className="text-center p-4 bg-charcoal rounded-sm border border-white/5">
                            <span className="text-3xl font-serif font-bold text-gold block font-mono">
                                {hasRatings ? animatedRating : '—'}
                            </span>
                            <div className="flex items-center justify-center gap-1 mt-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Star 
                                        key={i} 
                                        className={`w-3.5 h-3.5 ${
                                            hasRatings && i < Math.floor(rating || 0)
                                                ? 'fill-gold text-gold'
                                                : 'text-white/15'
                                        }`} 
                                    />
                                ))}
                            </div>
                            <span className="text-[11px] text-ivory-dim/60 mt-1 block font-mono">
                                {totalReviews} client reviews
                            </span>
                        </div>

                        {/* Distribution Bars */}
                        <div className="space-y-1.5 px-1">
                            {[5, 4, 3, 2, 1].map((stars) => {
                                const count = starCounts[stars] || 0;
                                const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
                                return (
                                    <div key={stars} className="flex items-center gap-2 text-xs">
                                        <span className="text-[11px] text-ivory-dim w-3 font-mono">{stars}</span>
                                        <Star className="w-2.5 h-2.5 text-gold/60 shrink-0" />
                                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-gold rounded-full transition-all duration-700 ease-out"
                                                style={{ width: animateBars ? `${pct}%` : '0%' }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-ivory-dim/50 w-7 text-right font-mono">{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reviews List */}
                    <div className="lg:col-span-2 space-y-3 max-h-[360px] overflow-y-auto pr-1">
                        {isLoading ? (
                            <div className="space-y-2.5">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        ) : reviews.length ? (
                            reviews.map((r: any) => (
                                <div
                                    key={r.id}
                                    className="bg-charcoal border border-white/10 p-3.5 rounded-sm space-y-1.5 hover:border-gold/30 transition-colors shadow-inner"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <div className="flex items-center gap-0.5">
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                    <Star
                                                        key={i}
                                                        className={`w-3 h-3 ${
                                                            i < Math.floor(r.rating)
                                                                ? 'fill-gold text-gold'
                                                                : 'text-white/15'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                            <span className="text-xs font-bold text-ivory">{r.customerName}</span>
                                        </div>
                                        <span className="text-[10px] text-ivory-dim/50 font-mono flex items-center gap-1">
                                            <Calendar className="w-2.5 h-2.5 text-gold/60" />
                                            {r.date}
                                        </span>
                                    </div>
                                    {r.comment && r.comment.trim() ? (
                                        <p className="text-xs text-ivory-dim italic leading-relaxed">
                                            "{r.comment}"
                                        </p>
                                    ) : (
                                        <p className="text-[10px] text-white/30 italic">
                                            (No written comment provided)
                                        </p>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12 text-xs text-ivory-dim/50 space-y-1.5 bg-charcoal rounded-sm border border-white/5">
                                <Award className="w-7 h-7 text-gold/30 mx-auto" />
                                <p className="font-semibold text-ivory">No verified feedback yet</p>
                                <p className="text-[11px] text-ivory-dim/40">Reviews will automatically appear here once customers rate completed services.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* MODALS */}
            
            {/* Add Portfolio Work Modal */}
            <AddPortfolioWorkModal
                isOpen={isAddWorkModalOpen}
                onClose={() => setIsAddWorkModalOpen(false)}
                onSuccess={handlePortfolioWorkAdded}
            />

            {/* Edit Portfolio Work Modal */}
            <EditPortfolioWorkModal
                item={selectedEditItem}
                isOpen={selectedEditItem !== null}
                onClose={() => setSelectedEditItem(null)}
                onUpdated={handlePortfolioWorkUpdated}
                onDeleted={handlePortfolioWorkDeleted}
            />

            {/* Edit Specialties Modal */}
            <EditSpecialtiesModal
                isOpen={isEditSpecialtiesModalOpen}
                onClose={() => setIsEditSpecialtiesModalOpen(false)}
                currentSpecialties={portfolio?.specialties || []}
                onSuccess={handleSpecialtiesUpdated}
            />

            {/* Edit Bio Modal */}
            <EditBioModal
                isOpen={isEditBioModalOpen}
                onClose={() => setIsEditBioModalOpen(false)}
                currentBio={portfolio?.bio || ''}
                onSuccess={handleBioUpdated}
            />

            {/* Public Portfolio Preview Modal */}
            <PublicPortfolioPreviewModal
                isOpen={isPreviewModalOpen}
                onClose={() => setIsPreviewModalOpen(false)}
                portfolio={portfolio}
            />

            {/* Served Today Modal Drill-Down */}
            <Modal
                isOpen={isServedModalOpen}
                onClose={() => setIsServedModalOpen(false)}
                title="Served Today Data"
                size="md"
                footer={
                    <Button variant="primary" className="w-full sm:w-auto" onClick={() => setIsServedModalOpen(false)}>
                        Close
                    </Button>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-ivory-dim">
                        Overview of customers served during your current shift today.
                    </p>
                    {loadingServed ? (
                        <div className="py-8 flex justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-gold" />
                        </div>
                    ) : servedReceipts.length > 0 ? (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {servedReceipts.map((receipt) => (
                                <div key={receipt.receiptId} className="bg-charcoal p-3 rounded-sm border border-white/5 flex items-center justify-between text-xs">
                                    <div>
                                        <span className="font-bold text-ivory block">{receipt.customerName}</span>
                                        <span className="text-[10px] text-ivory-dim">{receipt.serviceName} • {receipt.formattedTime}</span>
                                    </div>
                                    <span className="text-gold font-mono font-bold">₱{receipt.ticketAmount.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6 text-xs text-ivory-dim/60">
                            No customers completed yet today.
                        </div>
                    )}
                </div>
            </Modal>

            {/* Rating Modal Drill-Down */}
            <Modal
                isOpen={isRatingModalOpen}
                onClose={() => setIsRatingModalOpen(false)}
                title="Customer Ratings & Feedback"
                size="md"
                footer={
                    <Button variant="primary" className="w-full sm:w-auto" onClick={() => setIsRatingModalOpen(false)}>
                        Close
                    </Button>
                }
            >
                <div className="space-y-4">
                    <p className="text-xs text-ivory-dim">
                        Complete client ratings breakdown across all recorded cuts.
                    </p>
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {reviews.map((r: any) => (
                            <div key={r.id} className="bg-charcoal p-3 rounded-sm border border-white/5 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-ivory">{r.customerName}</span>
                                    <div className="flex items-center gap-0.5">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star key={i} className={`w-2.5 h-2.5 ${i < Math.floor(r.rating) ? 'fill-gold text-gold' : 'text-white/10'}`} />
                                        ))}
                                    </div>
                                </div>
                                {r.comment && <p className="text-xs text-ivory-dim italic leading-tight">"{r.comment}"</p>}
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>

            {/* Earnings Breakdown Modal */}
            <EarningsBreakdownModal
                isOpen={isEarningsModalOpen}
                onClose={() => setIsEarningsModalOpen(false)}
            />
        </div>
    );
};

export default ProfileTab;
