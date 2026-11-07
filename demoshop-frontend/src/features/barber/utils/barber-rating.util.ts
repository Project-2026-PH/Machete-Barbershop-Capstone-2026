export interface FormattedBarberRating {
  value: number;
  formatted: string;
}

export interface BarberStarFill {
  star: number;
  fillLevel: number;
  fillType: 'full' | 'partial' | 'empty';
}

export interface BarberPerformanceTier {
  isTopPerformer: boolean;
  rank: number | null;
  label: string | null;
  title: string | null;
}

/**
 * Computes the formatted barber rating.
 * When rating is null or undefined, gracefully falls back to 4.8 (matching Customer Book tab).
 */
export function getBarberRatingFormatted(rating?: number | string | null): FormattedBarberRating {
  const value = rating !== null && rating !== undefined && !Number.isNaN(Number(rating))
    ? Number(rating)
    : 4.8;
  return {
    value,
    formatted: value.toFixed(1),
  };
}

/**
 * Computes 5-star visual fill states based on the numeric rating score.
 */
export function getBarberStarFills(ratingValue: number): BarberStarFill[] {
  return [1, 2, 3, 4, 5].map((star) => {
    const fillLevel = Math.max(0, Math.min(1, ratingValue - (star - 1)));
    const fillType: 'full' | 'partial' | 'empty' =
      fillLevel >= 0.8 ? 'full' : fillLevel >= 0.3 ? 'partial' : 'empty';
    return {
      star,
      fillLevel,
      fillType,
    };
  });
}

/**
 * Evaluates performance tier / rank indicator for top-performing barber logic.
 */
export function getBarberPerformanceTier(
  isTopPerformer = false,
  rank?: number | null,
): BarberPerformanceTier {
  // Rank alone does not qualify a barber with no completed services.
  if (isTopPerformer) {
    return {
      isTopPerformer: true,
      rank: 1,
      label: 'Top performer',
      title: 'Top Performing Barber',
    };
  }

  if (typeof rank === 'number' && rank >= 1) {
    return {
      isTopPerformer: false,
      rank,
      label: `Rank #${rank}`,
      title: `Rank #${rank} Barber`,
    };
  }

  return {
    isTopPerformer: false,
    rank: null,
    label: null,
    title: null,
  };
}
