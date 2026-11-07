import React, { useState, useEffect } from 'react';
import { Star, Scissors, Award, Users, CheckCircle, Eye, X, Calendar, AlertCircle, Sparkles } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { barberService, BarberPortfolioData, BarberPortfolioItem } from '../../services/barber.service';
import { HaircutPhotoViewerModal } from './HaircutPhotoViewerModal';

export interface PublicPortfolioPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    portfolio?: BarberPortfolioData | null;
    barberId?: number | null;
    barberName?: string;
    highlightServiceName?: string;
    isBookingMode?: boolean; // For Phase 4B booking decision support
    onSelectBarber?: () => void;
}

export const PublicPortfolioPreviewModal: React.FC<PublicPortfolioPreviewModalProps> = ({
    isOpen,
    onClose,
    portfolio: initialPortfolio,
    barberId,
    barberName,
    highlightServiceName,
    isBookingMode = false,
    onSelectBarber,
}) => {
    const [fetchedPortfolio, setFetchedPortfolio] = useState<BarberPortfolioData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedPhoto, setSelectedPhoto] = useState<{ 
        name: string; 
        photoUrl: string; 
        serviceTitle?: string | null; 
        caption?: string | null; 
    } | null>(null);

    // Fetch public portfolio if barberId is provided and no static portfolio was passed
    useEffect(() => {
        if (!isOpen) {
            setLoadError(null);
            return;
        }

        if (initialPortfolio) {
            setFetchedPortfolio(initialPortfolio);
            setIsLoading(false);
            setLoadError(null);
            return;
        }

        if (barberId) {
            let isCancelled = false;
            setIsLoading(true);
            setLoadError(null);

            barberService.getPublicPortfolio(barberId)
                .then((data) => {
                    if (!isCancelled) {
                        setFetchedPortfolio(data);
                        setIsLoading(false);
                    }
                })
                .catch((err) => {
                    if (!isCancelled) {
                        console.error('Failed to load barber public portfolio:', err);
                        setLoadError('Unable to load this portfolio right now.');
                        setIsLoading(false);
                    }
                });

            return () => {
                isCancelled = true;
            };
        }
    }, [isOpen, barberId, initialPortfolio]);

    if (!isOpen) return null;

    const portfolio = initialPortfolio || fetchedPortfolio;
    const rating = portfolio?.rating ?? null;
    const hasRatings = rating !== null && (portfolio?.totalReviews ?? 0) > 0;
    const specialties = portfolio?.specialties || [];
    const portfolioItems = portfolio?.portfolioItems || [];
    const feedback = portfolio?.feedback || [];
    const displayName = portfolio?.name || barberName || 'Barber';

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={isBookingMode ? 'Barber Portfolio' : 'Public Portfolio Preview'}
                size="lg"
                footer={
                    <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 w-full">
                        <div className="text-[11px] text-ivory-dim/60 font-mono text-center sm:text-left">
                            {isBookingMode ? 'Portfolio is optional decision support' : 'Previewing live customer booking view'}
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={onClose}
                                className="w-full sm:w-auto"
                            >
                                Close
                            </Button>
                            {isBookingMode && onSelectBarber && (
                                <Button
                                    type="button"
                                    variant="primary"
                                    onClick={() => {
                                        onSelectBarber();
                                        onClose();
                                    }}
                                    className="w-full sm:w-auto min-w-[160px]"
                                >
                                    Select This Barber
                                </Button>
                            )}
                        </div>
                    </div>
                }
            >
                {/* 1. Loading Skeleton State (Requirement 22: LOADING !== EMPTY) */}
                {isLoading && (
                    <div className="space-y-6 pb-2 animate-pulse">
                        {/* Skeleton Header */}
                        <div className="bg-charcoal border border-white/10 p-5 rounded-sm flex flex-col sm:flex-row items-center sm:items-start gap-4">
                            <div className="w-20 h-20 rounded-full bg-white/10 shrink-0"></div>
                            <div className="flex-1 space-y-3 w-full text-center sm:text-left">
                                <div className="h-6 bg-white/15 rounded w-48 mx-auto sm:mx-0"></div>
                                <div className="h-4 bg-white/10 rounded w-28 mx-auto sm:mx-0"></div>
                                <div className="flex justify-center sm:justify-start gap-3 pt-2">
                                    <div className="h-7 w-28 bg-white/10 rounded"></div>
                                    <div className="h-7 w-32 bg-white/10 rounded"></div>
                                </div>
                            </div>
                        </div>

                        {/* Skeleton Specialties */}
                        <div className="space-y-2">
                            <div className="h-3 bg-white/10 rounded w-24"></div>
                            <div className="flex gap-2">
                                <div className="h-8 w-24 bg-white/10 rounded"></div>
                                <div className="h-8 w-28 bg-white/10 rounded"></div>
                                <div className="h-8 w-20 bg-white/10 rounded"></div>
                            </div>
                        </div>

                        {/* Skeleton Gallery */}
                        <div className="space-y-2">
                            <div className="h-3 bg-white/10 rounded w-28"></div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="aspect-square bg-white/5 rounded border border-white/5"></div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Error State (Requirement 23) */}
                {!isLoading && loadError && (
                    <div className="py-12 px-4 text-center space-y-4">
                        <AlertCircle className="w-10 h-10 text-red-400 mx-auto opacity-80" />
                        <div className="space-y-1">
                            <h4 className="text-base font-serif font-bold text-ivory">Unable to load this portfolio right now.</h4>
                            <p className="text-xs text-ivory-dim/70 max-w-md mx-auto">
                                You can still continue your reservation and select this barber directly.
                            </p>
                        </div>
                        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                            <Button variant="ghost" onClick={onClose}>
                                Close
                            </Button>
                            {isBookingMode && onSelectBarber && (
                                <Button
                                    variant="primary"
                                    onClick={() => {
                                        onSelectBarber();
                                        onClose();
                                    }}
                                >
                                    Select This Barber
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. Loaded Portfolio Content */}
                {!isLoading && !loadError && portfolio && (
                    <div className="space-y-6 pb-2">
                        {/* Header: Barber Identity & Verified Statistics */}
                        <div className="bg-charcoal border border-white/10 p-5 rounded-sm flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/50 to-transparent"></div>
                            
                            {/* Avatar */}
                            <div className="relative shrink-0">
                                {portfolio.profilePicture ? (
                                    <img
                                        src={portfolio.profilePicture}
                                        alt={portfolio.name}
                                        className="w-20 h-20 rounded-full object-cover border-2 border-gold/40 shadow-xl"
                                    />
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gold/25 to-gold/5 border-2 border-gold/40 flex items-center justify-center text-gold font-serif text-2xl font-bold shadow-xl">
                                        {portfolio.name ? portfolio.name.charAt(0).toUpperCase() : 'B'}
                                    </div>
                                )}
                                <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-charcoal"></span>
                            </div>

                            {/* Info & Stats */}
                            <div className="flex-1 min-w-0 space-y-2">
                                <div>
                                    <h3 className="font-serif text-xl sm:text-2xl font-bold text-ivory tracking-wide">
                                        {portfolio.name}
                                    </h3>
                                    <div className="flex items-center justify-center sm:justify-start gap-2 mt-0.5">
                                        <span className="text-xs uppercase tracking-widest text-gold font-bold">
                                            Barber
                                        </span>
                                        <span className="text-white/20">•</span>
                                        <span className="text-xs text-ivory-dim/70">
                                            DemoShop Master Barber
                                        </span>
                                    </div>
                                </div>

                                {/* Verified Operational Statistics (Read-Only) */}
                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4 pt-1">
                                    {/* Rating Badge */}
                                    <div className="flex items-center gap-1.5 bg-white/[0.04] px-2.5 py-1 rounded-xs border border-white/10">
                                        <Star className={`w-3.5 h-3.5 ${hasRatings ? 'fill-gold text-gold' : 'text-white/30'}`} />
                                        <span className="font-bold text-xs text-ivory font-mono">
                                            {hasRatings ? Number(rating).toFixed(1) : 'No ratings yet'}
                                        </span>
                                        {hasRatings && (
                                            <span className="text-[10px] text-ivory-dim/60 font-mono">
                                                ({portfolio.totalReviews} {portfolio.totalReviews === 1 ? 'review' : 'reviews'})
                                            </span>
                                        )}
                                    </div>

                                    {/* Completed Services Badge */}
                                    <div className="flex items-center gap-1.5 bg-white/[0.04] px-2.5 py-1 rounded-xs border border-white/10">
                                        <Scissors className="w-3.5 h-3.5 text-gold" />
                                        <span className="font-bold text-xs text-ivory font-mono">
                                            {portfolio.completedServicesCount}
                                        </span>
                                        <span className="text-[10px] text-ivory-dim/60">
                                            completed cuts
                                        </span>
                                    </div>
                                </div>

                                {/* Mobile Quick-Select (Requirement 26) */}
                                {isBookingMode && onSelectBarber && (
                                    <div className="pt-2 sm:hidden w-full">
                                        <Button
                                            type="button"
                                            variant="primary"
                                            onClick={() => {
                                                onSelectBarber();
                                                onClose();
                                            }}
                                            className="w-full text-xs py-2 px-4"
                                        >
                                            Select This Barber
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ABOUT / BIO (Barber-Managed) */}
                        {portfolio.bio && portfolio.bio.trim() ? (
                            <div className="space-y-1.5">
                                <h4 className="text-[10px] uppercase tracking-widest text-gold font-bold flex items-center gap-1.5">
                                    <span>About</span>
                                </h4>
                                <p className="text-xs sm:text-sm text-ivory-dim leading-relaxed bg-charcoal-light p-3.5 rounded-sm border border-white/5">
                                    {portfolio.bio}
                                </p>
                            </div>
                        ) : null}

                        {/* SPECIALTIES (Barber-Managed from Real Services) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] uppercase tracking-widest text-gold font-bold">
                                    Specialties
                                </h4>
                                {highlightServiceName && specialties.some(s => s.title.toLowerCase().trim() === highlightServiceName.toLowerCase().trim()) && (
                                    <span className="text-[10px] text-gold/80 font-mono flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-gold" />
                                        Matches selected service
                                    </span>
                                )}
                            </div>

                            {specialties.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {specialties.map((spec) => {
                                        const isHighlighted = Boolean(
                                            highlightServiceName &&
                                            spec.title.toLowerCase().trim() === highlightServiceName.toLowerCase().trim()
                                        );

                                        return (
                                            <span
                                                key={spec.serviceId}
                                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-semibold tracking-wide transition-all shadow-xs ${
                                                    isHighlighted
                                                        ? 'bg-gold/25 border border-gold text-gold font-bold ring-1 ring-gold/40 shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                                                        : 'bg-gold/10 border border-gold/30 text-gold'
                                                }`}
                                            >
                                                <CheckCircle className={`w-3 h-3 ${isHighlighted ? 'text-gold' : 'text-gold/80'}`} />
                                                {spec.title}
                                            </span>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-xs text-ivory-dim/50 italic bg-charcoal-light p-3 rounded-sm border border-white/5">
                                    No specialties listed yet.
                                </div>
                            )}
                        </div>

                        {/* PREVIOUS WORK (Barber-Managed Portfolio Gallery) */}
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] uppercase tracking-widest text-gold font-bold">
                                    Previous Work
                                </h4>
                                <span className="text-[10px] text-ivory-dim/60 font-mono">
                                    {portfolioItems.length} {portfolioItems.length === 1 ? 'photo' : 'photos'}
                                </span>
                            </div>

                            {portfolioItems.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {portfolioItems.map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedPhoto({ 
                                                name: portfolio.name, 
                                                photoUrl: item.imageUrl,
                                                serviceTitle: item.serviceTitle,
                                                caption: item.caption,
                                            })}
                                            className="group relative rounded-sm overflow-hidden bg-charcoal border border-white/10 hover:border-gold/50 transition-all cursor-pointer aspect-square shadow-md"
                                        >
                                            <img
                                                src={item.imageUrl}
                                                alt={item.caption || 'Haircut work'}
                                                width={400}
                                                height={400}
                                                loading="lazy"
                                                decoding="async"
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                                                {item.serviceTitle && (
                                                    <span className="text-[9px] font-bold text-gold uppercase tracking-wider block truncate">
                                                        {item.serviceTitle}
                                                    </span>
                                                )}
                                                {item.caption && (
                                                    <p className="text-[10px] text-ivory/90 leading-tight line-clamp-2">
                                                        {item.caption}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 bg-charcoal-light border border-white/5 rounded-sm text-xs text-ivory-dim/50 space-y-1.5">
                                    <Award className="w-7 h-7 text-gold/30 mx-auto" />
                                    <p className="font-semibold text-ivory-dim">No portfolio work added yet</p>
                                    <p className="text-[10px] text-ivory-dim/40">Recent haircut photos will appear here once uploaded.</p>
                                </div>
                            )}
                        </div>

                        {/* CUSTOMER FEEDBACK (System-Generated / Verified Ratings) */}
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] uppercase tracking-widest text-gold font-bold">
                                    Verified Customer Feedback
                                </h4>
                                <span className="text-[10px] text-ivory-dim/60 font-mono">
                                    {feedback.length} {feedback.length === 1 ? 'review' : 'reviews'}
                                </span>
                            </div>

                            {feedback.length > 0 ? (
                                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                    {feedback.map((item) => (
                                        <div
                                            key={item.id}
                                            className="bg-charcoal border border-white/10 p-3.5 rounded-sm space-y-1.5 hover:border-gold/30 transition-colors"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="flex items-center gap-0.5">
                                                        {Array.from({ length: 5 }).map((_, i) => (
                                                            <Star
                                                                key={i}
                                                                className={`w-3 h-3 ${
                                                                    i < Math.floor(item.rating)
                                                                        ? 'fill-gold text-gold'
                                                                        : 'text-white/15'
                                                                }`}
                                                            />
                                                        ))}
                                                    </div>
                                                    <span className="text-xs font-bold text-ivory">
                                                        {item.customerName}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-ivory-dim/50 font-mono flex items-center gap-1">
                                                    <Calendar className="w-2.5 h-2.5 text-gold/60" />
                                                    {item.date}
                                                </span>
                                            </div>
                                            {item.comment && item.comment.trim() ? (
                                                <p className="text-xs text-ivory-dim italic leading-relaxed">
                                                    "{item.comment}"
                                                </p>
                                            ) : (
                                                <p className="text-[10px] text-white/30 italic">
                                                    (No written comment provided)
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-charcoal-light border border-white/5 rounded-sm text-xs text-ivory-dim/50">
                                    No customer feedback yet.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Photo Lightbox */}
            <HaircutPhotoViewerModal
                photoData={selectedPhoto}
                onClose={() => setSelectedPhoto(null)}
            />
        </>
    );
};
