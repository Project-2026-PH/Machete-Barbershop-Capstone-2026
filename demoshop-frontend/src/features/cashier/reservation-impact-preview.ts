export interface ReservationImpactItem {
  queueEntryId: number;
  customerName: string;
  scheduledStartAt: string;
  estimatedStartAt: string;
  delayMinutes: number;
  addedDelayMinutes: number;
}

export interface ReservationImpactPreview {
  previewFingerprint: string;
  projectedCompletionAt: string | null;
  impacts: ReservationImpactItem[];
}

export type ReservationImpactConflictType =
  | 'ReservationImpactConfirmationRequired'
  | 'ReservationImpactChanged';

export interface ReservationImpactConflict {
  type: ReservationImpactConflictType;
  preview: ReservationImpactPreview | null;
}

export const requiresReservationImpactPreview = (
  entry: { isWalkIn?: boolean; status: string },
  currentDurationMinutes: number,
  proposedDurationMinutes: number,
): boolean => entry.isWalkIn === true
  && ['serving', 'waiting'].includes(entry.status.toLowerCase())
  && proposedDurationMinutes > currentDurationMinutes;

/** Accepts either the endpoint response body or an Axios response containing it. */
export const parseReservationImpactPreview = (value: unknown): ReservationImpactPreview | null => {
  if (!value || typeof value !== 'object') return null;

  const response = value as Record<string, unknown>;
  const candidate = (response.preview && typeof response.preview === 'object'
    ? response.preview
    : response.data && typeof response.data === 'object'
      ? response.data
      : response) as Record<string, unknown>;

  if (typeof candidate.previewFingerprint !== 'string' || !candidate.previewFingerprint) return null;
  if (!Array.isArray(candidate.impacts)) return null;

  const impacts: ReservationImpactItem[] = [];
  for (const rawImpact of candidate.impacts) {
    if (!rawImpact || typeof rawImpact !== 'object') return null;
    const impact = rawImpact as Record<string, unknown>;
    const queueEntryId = Number(impact.queueEntryId);
    const delayMinutes = Number(impact.delayMinutes);
    const addedDelayMinutes = Number(impact.addedDelayMinutes);
    if (
      !Number.isSafeInteger(queueEntryId)
      || typeof impact.customerName !== 'string'
      || typeof impact.scheduledStartAt !== 'string'
      || typeof impact.estimatedStartAt !== 'string'
      || !Number.isFinite(delayMinutes)
      || !Number.isFinite(addedDelayMinutes)
    ) return null;

    impacts.push({
      queueEntryId,
      customerName: impact.customerName,
      scheduledStartAt: impact.scheduledStartAt,
      estimatedStartAt: impact.estimatedStartAt,
      delayMinutes,
      addedDelayMinutes,
    });
  }

  const projectedCompletionAt = candidate.projectedCompletionAt;
  if (projectedCompletionAt !== null && typeof projectedCompletionAt !== 'string') return null;

  return {
    previewFingerprint: candidate.previewFingerprint,
    projectedCompletionAt: projectedCompletionAt as string | null,
    impacts,
  };
};

export const getReservationImpactConflict = (error: unknown): ReservationImpactConflict | null => {
  if (!error || typeof error !== 'object') return null;
  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;
  if (!data || typeof data !== 'object') return null;

  const body = data as Record<string, unknown>;
  const type = body.errorType ?? body.code;
  if (type !== 'ReservationImpactConfirmationRequired' && type !== 'ReservationImpactChanged') return null;

  return {
    type,
    preview: parseReservationImpactPreview(body.preview),
  };
};
