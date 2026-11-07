import React from 'react';
import { Star } from 'lucide-react';
import { getBarberRatingFormatted, getBarberStarFills } from '../utils/barber-rating.util';

export interface BarberRatingStarsProps {
  rating?: number | string | null;
  reviewCount?: number | null;
  size?: 'sm' | 'md';
  showCount?: boolean;
  className?: string;
}

export const BarberRatingStars: React.FC<BarberRatingStarsProps> = ({
  rating,
  reviewCount,
  size = 'sm',
  showCount = false,
  className = '',
}) => {
  const { value, formatted } = getBarberRatingFormatted(rating);
  const starFills = getBarberStarFills(value);
  const count = typeof reviewCount === 'number' && Number.isFinite(reviewCount) ? reviewCount : 0;

  const starSizeClass = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const textClass = size === 'md' ? 'text-xs' : 'text-[11px]';

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      aria-label={`Rating: ${formatted} out of 5 stars${count > 0 ? ` from ${count} reviews` : ''}`}
    >
      <div className="flex items-center text-gold" aria-hidden="true">
        {starFills.map(({ star, fillType }) => (
          <Star
            key={star}
            className={`${starSizeClass} ${
              fillType === 'full'
                ? 'fill-gold text-gold'
                : fillType === 'partial'
                  ? 'fill-gold/50 text-gold'
                  : 'text-white/20'
            }`}
          />
        ))}
      </div>
      <span className={`${textClass} font-bold text-ivory tabular-nums leading-none`}>
        {formatted}
      </span>
      {showCount && count > 0 && (
        <span className="text-[10px] text-ivory-dim/60 leading-none tabular-nums">
          ({count})
        </span>
      )}
    </div>
  );
};
