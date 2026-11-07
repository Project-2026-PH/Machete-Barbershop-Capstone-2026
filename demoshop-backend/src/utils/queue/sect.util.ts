import { BarberEtaCandidate, SectResolution } from '@demoshop/shared-types';

export const DEFAULT_SECT_TIE_RANGE_MINUTES = parseInt(process.env.SECT_TIE_RANGE_MINUTES || '0', 10) || 0;

/**
 * Normalizes barber break status across all supported representations
 * ('On Break', 'on_break', 'break', 'Break', 'ON_BREAK').
 */
export const isBarberOnBreak = (status?: string | null): boolean => {
  if (!status || typeof status !== 'string') return false;
  const normalized = status.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return normalized === 'onbreak' || normalized === 'break';
};

const UNAVAILABLE_STATUSES = new Set([
  'offline',
  'on_break',
  'break',
  'leave',
  'day_off',
  'off_duty',
  'absent',
  'suspended',
]);

/**
  * Determines if a barber is eligible for Shortest Estimated Completion Time (SECT) queue assignment.
  * Active barbers with 'available', 'serving', or 'busy' are eligible.
  * Barbers who are inactive, offline, or on break/leave are excluded.
  */
export const isBarberEligibleForSect = (barber: {
  is_active?: boolean;
  isActive?: boolean;
  status?: string | null;
}): boolean => {
  const isActive = barber.isActive !== undefined ? barber.isActive : barber.is_active !== false;
  if (!isActive) return false;
  if (isBarberOnBreak(barber.status)) return false;

  const rawStatus = barber.status ? String(barber.status).trim() : 'available';
  const normalized = rawStatus.toLowerCase().replace(/\s+/g, '_');
  return !UNAVAILABLE_STATUSES.has(normalized);
};

/**
  * Resolves SECT assignment and detects ties across candidate barbers.
  * 
  * @param candidates - List of barbers with server-computed etaMinutes
  * @param tieRangeMinutes - Max difference from lowest ETA to be considered a tie (defaults to env or 0)
  * @returns Resolution object indicating whether a tie exists, the winner if no tie, and eligible candidates
  */
export const resolveSectAssignment = (
  candidates: BarberEtaCandidate[],
  tieRangeMinutes?: number
): SectResolution => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      isTie: false,
      winner: null,
      tiedBarbers: [],
      eligibleBarbers: [],
    };
  }

  // Ensure only eligible barbers are evaluated
  const eligible = candidates.filter(isBarberEligibleForSect);
  if (eligible.length === 0) {
    return {
      isTie: false,
      winner: null,
      tiedBarbers: [],
      eligibleBarbers: [],
    };
  }

  // Sort candidates by etaMinutes ASC, then by barberId ASC
  const sorted = [...eligible].sort((a, b) => {
    if (a.etaMinutes !== b.etaMinutes) {
      return a.etaMinutes - b.etaMinutes;
    }
    return a.barberId - b.barberId;
  });

  const minEta = sorted[0].etaMinutes;
  const configuredRange = tieRangeMinutes !== undefined ? tieRangeMinutes : DEFAULT_SECT_TIE_RANGE_MINUTES;
  const effectiveTieRange = Math.max(0, configuredRange);

  // Barbers within [minEta, minEta + effectiveTieRange]
  const tiedBarbers = sorted.filter(c => c.etaMinutes <= minEta + effectiveTieRange);

  if (tiedBarbers.length > 1) {
    return {
      isTie: true,
      winner: null,
      tiedBarbers,
      eligibleBarbers: sorted,
    };
  }

  return {
    isTie: false,
    winner: sorted[0],
    tiedBarbers: [],
    eligibleBarbers: sorted,
  };
};
