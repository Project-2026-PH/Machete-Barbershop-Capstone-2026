import React, { useState, useMemo } from 'react';
import { Maximize2, Star, Scissors, ArrowRight, Search, X, Crown } from 'lucide-react';
import type { TopPerformingBarber } from '@demoshop/shared-types';

interface TopBarbersGraphProps {
    barbers?: TopPerformingBarber[];
    onExpand?: () => void;
    isExpanded?: boolean;
    onNavigateToStaff?: () => void;
    embedded?: boolean;
}

export const TopBarbersGraph: React.FC<TopBarbersGraphProps> = ({
    barbers = [],
    onExpand,
    isExpanded = false,
    onNavigateToStaff,
    embedded = false,
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    const maxCuts = useMemo(() => {
        if (!barbers || barbers.length === 0) return 1;
        return Math.max(...barbers.map((b) => b.completed_services_count), 1);
    }, [barbers]);

    const filteredBarbers = useMemo(() => {
        if (!searchTerm.trim()) return barbers;
        const term = searchTerm.trim().toLowerCase();
        return barbers.filter((b) =>
            b.barber_name.toLowerCase().includes(term) ||
            String(b.specialty || '').toLowerCase().includes(term)
        );
    }, [barbers, searchTerm]);

    const displayBarbers = isExpanded ? filteredBarbers : barbers.slice(0, 5);
    const featuredBarbers = isExpanded ? displayBarbers.filter((barber) => barber.rank >= 1 && barber.rank <= 3) : [];
    const remainingBarbers = isExpanded ? displayBarbers.filter((barber) => barber.rank < 1 || barber.rank > 3) : displayBarbers;

    const rankStyles: Record<number, string> = {
        1: 'border-gold/50 bg-gold/15 text-gold ring-2 ring-gold/10',
        2: 'border-slate-300/40 bg-slate-300/10 text-slate-200',
        3: 'border-amber-600/40 bg-amber-600/10 text-amber-500',
    };
    const rowStyles: Record<number, string> = {
        1: 'border-gold/30 bg-gradient-to-r from-gold/10 to-transparent',
        2: 'border-slate-300/20 bg-slate-300/[0.04]',
        3: 'border-amber-600/20 bg-amber-600/[0.04]',
    };
    const getRankBadge = (rank: number, compact = false) => (
        <div aria-label={`Rank ${rank}`} className={`${compact ? 'w-6 h-6 text-xs' : 'w-7 h-7 sm:w-8 sm:h-8 text-xs sm:text-sm'} rounded-full border flex items-center justify-center font-serif font-bold tabular-nums shrink-0 ${rankStyles[rank] ?? 'border-white/10 bg-white/5 text-ivory-dim'}`}>
            {rank}
        </div>
    );

    return (
        <div className={embedded || isExpanded ? 'flex flex-col min-w-0 h-full justify-between' : 'bg-charcoal-light border border-white/5 rounded-sm p-4 sm:p-5 card-gold-accent flex flex-col w-full'}>
            {/* Header & Controls */}
            {!isExpanded && <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className={embedded ? 'p-1 rounded-full bg-gold/10 border border-gold/20 text-gold shrink-0' : 'p-2 rounded-full bg-gold/10 border border-gold/20 text-gold shrink-0'}>
                        <Scissors className={`${embedded ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
                    </div>
                    <h3 className="font-serif font-bold text-ivory text-sm sm:text-base truncate">
                        Top Performing Barbers
                    </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {onNavigateToStaff && (
                        <button
                            type="button"
                            onClick={onNavigateToStaff}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-gold hover:text-gold/80 transition-colors group cursor-pointer px-1.5 py-1 rounded"
                            title="Open Staff Directory in Management"
                        >
                            <span>Directory</span>
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    )}

                    {!isExpanded && onExpand && (
                        <button
                            type="button"
                            onClick={onExpand}
                            className="p-1.5 rounded-sm border border-white/10 bg-white/5 hover:bg-gold/10 hover:border-gold/30 hover:text-gold text-ivory-dim transition-all cursor-pointer flex items-center justify-center shrink-0 min-h-[30px] min-w-[30px]"
                            title="Expand Top Barbers Leaderboard"
                            aria-label="Expand Top Barbers Leaderboard"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>}

            {/* In Expanded Mode: Search Bar */}
            {isExpanded && (
                <div className="space-y-3 pb-4 border-b border-white/5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-ivory-dim absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="search"
                            aria-label="Search barbers by name or specialty"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search name or specialty..."
                            className="w-full bg-white/5 border border-white/10 rounded-sm pl-9 pr-11 py-3 text-xs text-ivory placeholder:text-ivory-dim/50 focus:outline-none focus:border-gold/40 [&::-webkit-search-cancel-button]:appearance-none"
                        />
                        {searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear barber search" className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-ivory-dim hover:text-gold cursor-pointer focus-visible:outline focus-visible:outline-gold">
                            <X className="w-4 h-4" />
                        </button>}
                    </div>
                    {onNavigateToStaff && <button type="button" onClick={onNavigateToStaff} className="inline-flex items-center justify-center gap-2 px-3 py-3 rounded-sm border border-gold/20 text-xs font-bold text-gold hover:bg-gold/10 transition-colors cursor-pointer">
                        Staff Directory <ArrowRight className="w-3.5 h-3.5" />
                    </button>}
                    </div>
                    <p role="status" className="text-[11px] text-ivory-dim">
                        {searchTerm.trim() ? `${filteredBarbers.length} of ${barbers.length} barbers` : `${barbers.length} ${barbers.length === 1 ? 'barber' : 'barbers'}`} · Ranked by completed services
                    </p>
                </div>
            )}

            {featuredBarbers.length > 0 && (
                <section aria-label="Top three barbers" className="@container pt-3">
                    {isExpanded && <h4 className="text-[10px] font-bold uppercase tracking-widest text-ivory-dim mb-3">Top performers</h4>}
                    <div className="grid grid-cols-1 @min-[480px]:grid-cols-3 items-end gap-2.5">
                        {featuredBarbers.map((barber) => (
                            <article key={barber.barber_id} className={`relative flex flex-col min-w-0 rounded-sm border overflow-hidden ${rowStyles[barber.rank]} ${barber.rank === 1 ? 'border-gold/60 ring-1 ring-gold/30 shadow-[0_0_24px_rgba(212,175,55,0.1)] @min-[480px]:order-2' : barber.rank === 2 ? '@min-[480px]:order-1' : '@min-[480px]:order-3'}`}>
                                <div className={`flex flex-col items-center text-center flex-1 ${isExpanded ? 'px-3 py-3.5' : 'px-3 py-2.5'} ${barber.rank === 1 ? isExpanded ? '@min-[480px]:pt-5' : '@min-[480px]:pt-4' : ''}`}>
                                    <div className={`flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] mb-2 ${barber.rank === 1 ? 'text-gold' : barber.rank === 2 ? 'text-slate-200' : 'text-amber-500'}`}>
                                        {barber.rank === 1 && <Crown aria-hidden="true" className={isExpanded ? 'w-4 h-4' : 'w-3.5 h-3.5'} />}
                                        {barber.rank === 1 ? 'Top performer' : barber.rank === 2 ? 'Second place' : 'Third place'}
                                    </div>
                                    <div className={`rounded-full border-2 flex items-center justify-center font-serif font-bold shrink-0 overflow-hidden ${rankStyles[barber.rank]} ${isExpanded ? barber.rank === 1 ? 'w-14 h-14 text-base sm:text-lg' : 'w-12 h-12 text-sm sm:text-base' : barber.rank === 1 ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-xs'}`}>
                                        {barber.avatar ? <img src={barber.avatar} alt={barber.barber_name} className="w-full h-full object-cover" /> : barber.barber_name.charAt(0)}
                                    </div>
                                    <div className="min-w-0 w-full mt-2">
                                        <h5 className={`font-serif font-bold leading-tight break-words ${isExpanded ? barber.rank === 1 ? 'text-base sm:text-lg' : 'text-sm sm:text-base' : 'text-xs sm:text-sm'} ${barber.rank === 1 ? 'text-gold' : 'text-ivory'}`}>{barber.barber_name}</h5>
                                        {isExpanded && barber.specialty && <p className="text-[10px] text-ivory-dim mt-0.5 break-words">{barber.specialty}</p>}
                                    </div>
                                    <div className={`w-full border-y border-white/10 mt-2.5 ${isExpanded ? 'py-2.5 space-y-2' : 'py-2 space-y-1.5'}`}>
                                        <div>
                                            <p className="text-[9px] text-ivory-dim font-bold uppercase tracking-wider">Completed cuts</p>
                                            <p className={`${isExpanded ? 'text-xl sm:text-2xl' : 'text-lg'} font-serif font-bold text-ivory tabular-nums mt-0.5`}>{barber.completed_services_count.toLocaleString('en-US')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-ivory-dim font-bold uppercase tracking-wider">Gross service sales</p>
                                            <p className={`${isExpanded ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'} font-bold tabular-nums tracking-tight mt-0.5 break-words ${barber.rank === 1 ? 'text-gold' : barber.rank === 2 ? 'text-slate-200' : 'text-amber-500'}`}>₱{Number(barber.total_revenue || 0).toLocaleString('en-US')}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap justify-center items-center gap-1 text-[10px] text-ivory-dim pt-2">
                                        {barber.review_count > 0 ? <><Star aria-hidden="true" className="w-3 h-3 fill-gold text-gold" /><span className="font-bold text-ivory">{barber.rating.toFixed(1)}</span><span>· {barber.review_count} reviews</span></> : <span>No reviews yet</span>}
                                    </div>
                                </div>
                                <div aria-label={`Rank ${barber.rank}`} className={`flex items-center justify-center border-t font-serif font-bold tabular-nums ${barber.rank === 1 ? 'bg-gold/15 border-gold/30 text-gold' : barber.rank === 2 ? 'bg-slate-300/10 border-slate-300/20 text-slate-200' : 'bg-amber-600/10 border-amber-600/20 text-amber-500'} ${isExpanded ? 'h-7 sm:h-8 text-base sm:text-lg' : 'h-6 sm:h-7 text-sm'}`}>
                                    #{barber.rank}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            )}

            {/* Each barber appears once: featured cards above, remaining ranks below. */}
            {isExpanded && remainingBarbers.length > 0 && <h4 className="text-[10px] font-bold uppercase tracking-widest text-ivory-dim mt-4">Team rankings</h4>}
            <div className={`flex flex-col gap-1.5 ${isExpanded ? 'pt-2' : 'pt-2.5'}`}>
                {displayBarbers.length > 0 ? (
                    remainingBarbers.map((barber) => {
                        const cuts = barber.completed_services_count;
                        const pctOfMax = maxCuts > 0 ? Math.round((cuts / maxCuts) * 100) : 0;
                        const highlighted = !isExpanded && barber.rank <= 3;

                        return (
                            <div
                                key={barber.barber_id}
                                className={`${embedded ? 'p-2' : 'p-2 sm:p-2.5'} rounded-sm border hover:border-gold/40 transition-colors group ${rowStyles[barber.rank] ?? 'bg-white/[0.02] border-white/5'} ${highlighted && barber.rank === 1 ? 'ring-1 ring-gold/20' : ''}`}
                            >
                                <div className={`flex justify-between gap-2 mb-1 ${isExpanded ? 'flex-col sm:flex-row sm:items-center' : 'items-center'}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        {getRankBadge(barber.rank, embedded)}

                                        {/* Avatar / Initial */}
                                        <div className={`${embedded ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 sm:w-8 sm:h-8 text-xs'} rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center font-bold text-gold shrink-0 overflow-hidden`}>
                                            {barber.avatar ? (
                                                <img
                                                    src={barber.avatar}
                                                    alt={barber.barber_name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                barber.barber_name.charAt(0)
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <h4 title={barber.barber_name} className={`${isExpanded ? 'text-sm' : 'text-xs'} font-bold text-ivory truncate group-hover:text-gold transition-colors`}>
                                                {barber.barber_name}
                                            </h4>
                                            <div className="flex items-center gap-1 text-[10px] text-ivory-dim leading-none mt-0.5">
                                                {barber.review_count > 0 ? <span className="flex items-center text-gold">
                                                    <Star className="w-2.5 h-2.5 fill-gold inline mr-0.5" />
                                                    {barber.rating.toFixed(1)}
                                                </span> : null}
                                                {barber.review_count > 0 && <span>•</span>}
                                                <span>{barber.review_count > 0 ? `${barber.review_count} rev` : 'No reviews'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats (Cuts + Sales) */}
                                    <div className={isExpanded ? 'flex items-center justify-between gap-3 sm:block sm:text-right shrink-0' : 'text-right shrink-0'}>
                                        <div className="text-xs font-bold text-ivory font-mono">
                                            {cuts} <span className="text-[10px] text-ivory-dim font-sans font-normal">{isExpanded ? 'services' : 'cuts'}</span>
                                        </div>
                                        <div className="text-[11px] font-bold text-gold font-mono">
                                            ₱{Number(barber.total_revenue || 0).toLocaleString('en-US')}
                                            {isExpanded && <span className="ml-1 text-[10px] text-ivory-dim font-sans font-normal">gross sales</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* Relative Volume Progress Bar */}
                                <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ease-out ${barber.rank === 1
                                            ? 'bg-gold'
                                            : barber.rank === 2
                                                ? 'bg-slate-300'
                                                : barber.rank === 3
                                                    ? 'bg-amber-600'
                                                    : 'bg-gold/50'
                                            }`}
                                        style={{ width: `${pctOfMax}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-8 text-ivory-dim text-xs italic">
                        {searchTerm.trim() ? 'No barbers found. Try another name or specialty, or clear your search.' : 'No barber performance data recorded yet.'}
                    </div>
                )}
            </div>

        </div>
    );
};
