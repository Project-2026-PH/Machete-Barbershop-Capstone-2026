export interface RankableBarber {
  barber_id?: number | string;
  id?: number | string;
  rating?: number | string | null;
  review_count?: number | null;
  service_completed_counts?: Record<string, number> | null;
}

export interface BarberRecommendation {
  recommended: boolean;
  reason: string;
}

export interface BarberRanking<T> {
  ordered: T[];
  recommendations: Map<string, BarberRecommendation>;
}

const SERVICE_FIT_WEIGHT = 0.7;
const RATING_WEIGHT = 0.3;
const RATING_PRIOR_MEAN = 4.5;
const RATING_PRIOR_WEIGHT = 5;
const RECOMMENDATION_LIMIT = 2;

export const getBarberKey = (barber: RankableBarber): string => String(barber.barber_id ?? barber.id);

export const getServiceFitCount = (barber: RankableBarber, serviceIds: number[]): number =>
  serviceIds.reduce((sum, serviceId) => sum + (Number(barber.service_completed_counts?.[String(serviceId)]) || 0), 0);

// Bayesian average: a barber with few reviews is pulled toward the prior mean,
// so a single 5-star review does not outrank a well-reviewed barber.
export const getAdjustedRating = (rating: RankableBarber['rating'], reviewCount: number | null | undefined): number => {
  const value = Number(rating);
  const reviews = Math.max(0, Number(reviewCount) || 0);
  const hasRating = reviews > 0 && Number.isFinite(value);
  const observedReviews = hasRating ? reviews : 0;
  const observedRating = hasRating ? value : 0;
  return (observedReviews * observedRating + RATING_PRIOR_WEIGHT * RATING_PRIOR_MEAN) / (observedReviews + RATING_PRIOR_WEIGHT);
};

const toRatingScore = (adjustedRating: number): number => Math.min(1, Math.max(0, (adjustedRating - 1) / 4));

const buildReason = (fitCount: number, barber: RankableBarber): string => {
  const parts = [`${fitCount} ${fitCount === 1 ? 'cut' : 'cuts'} of this service`];
  const reviews = Number(barber.review_count) || 0;
  const rating = Number(barber.rating);
  if (reviews > 0 && Number.isFinite(rating)) {
    parts.push(`${rating.toFixed(1)}★ from ${reviews} ${reviews === 1 ? 'review' : 'reviews'}`);
  }
  return parts.join(' · ');
};

// Ranks barbers for the chosen services: service fit (70%) plus rating (30%).
// Only bookable barbers (available now) are ordered first and can be recommended.
// Walk-in-only and booked barbers are listed after them and never recommended.
// Barbers with no completed cuts of the chosen services are not recommended either.
export const rankBarbersForServices = <T extends RankableBarber>(
  barbers: T[],
  serviceIds: number[],
  isBookable: (barber: T) => boolean = () => true,
): BarberRanking<T> => {
  const recommendations = new Map<string, BarberRecommendation>();
  if (serviceIds.length === 0) {
    return { ordered: barbers, recommendations };
  }

  const fitCounts = new Map<T, number>(barbers.map((barber) => [barber, getServiceFitCount(barber, serviceIds)]));
  const maxFit = Math.max(0, ...fitCounts.values());
  const fitOf = (barber: T): number => fitCounts.get(barber) ?? 0;

  const bookable = barbers.filter(isBookable);
  const notBookable = barbers.filter((barber) => !isBookable(barber));

  const scored = bookable
    .filter((barber) => fitOf(barber) > 0)
    .map((barber) => {
      const fit = fitOf(barber);
      const fitScore = maxFit > 0 ? fit / maxFit : 0;
      const ratingScore = toRatingScore(getAdjustedRating(barber.rating, barber.review_count));
      return { barber, fit, score: SERVICE_FIT_WEIGHT * fitScore + RATING_WEIGHT * ratingScore };
    })
    .sort((a, b) => b.score - a.score || b.fit - a.fit);

  scored.forEach(({ barber, fit }, index) => {
    recommendations.set(getBarberKey(barber), {
      recommended: index < RECOMMENDATION_LIMIT,
      reason: buildReason(fit, barber),
    });
  });

  const bookableUnscored = bookable.filter((barber) => fitOf(barber) === 0);
  [...bookableUnscored, ...notBookable].forEach((barber) => {
    recommendations.set(getBarberKey(barber), { recommended: false, reason: '' });
  });

  return {
    ordered: [...scored.map((entry) => entry.barber), ...bookableUnscored, ...notBookable],
    recommendations,
  };
};
