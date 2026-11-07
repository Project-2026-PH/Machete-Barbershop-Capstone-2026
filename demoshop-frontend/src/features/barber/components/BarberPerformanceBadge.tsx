import React from 'react';
import { Crown } from 'lucide-react';
import { getBarberPerformanceTier } from '../utils/barber-rating.util';

export interface BarberPerformanceBadgeProps {
  isTopPerformer?: boolean;
  rank?: number | null;
  className?: string;
}

export const BarberPerformanceBadge: React.FC<BarberPerformanceBadgeProps> = ({
  isTopPerformer = false,
  rank,
  className = '',
}) => {
  const tier = getBarberPerformanceTier(isTopPerformer, rank);

  if (!tier.label) {
    return null;
  }

  if (tier.isTopPerformer) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-charcoal bg-gold px-1.5 py-0.5 rounded shrink-0 shadow-sm ${className}`}
        title={tier.title || 'Top Performing Barber'}
      >
        <Crown aria-hidden="true" className="w-2.5 h-2.5 fill-current" />
        <span>{tier.label}</span>
      </span>
    );
  }

  if (tier.rank === 2) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-slate-200 bg-slate-300/15 border border-slate-300/30 px-1.5 py-0.5 rounded shrink-0 shadow-sm ${className}`}
        title={tier.title || 'Rank #2 Barber'}
      >
        <span>{tier.label}</span>
      </span>
    );
  }

  if (tier.rank === 3) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-amber-500 bg-amber-600/15 border border-amber-600/30 px-1.5 py-0.5 rounded shrink-0 shadow-sm ${className}`}
        title={tier.title || 'Rank #3 Barber'}
      >
        <span>{tier.label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-ivory-dim bg-white/10 border border-white/15 px-1.5 py-0.5 rounded shrink-0 ${className}`}
      title={tier.title || `Rank #${tier.rank} Barber`}
    >
      <span>{tier.label}</span>
    </span>
  );
};
