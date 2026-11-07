export const SCHEDULE_DELAY_THRESHOLD_MINUTES = 10;
export const SCHEDULE_DELAY_NOTIFY_DELTA_MINUTES = 5;
export const CHAIR_TURNOVER_BUFFER_MINUTES = 5;

export interface ScheduleReservationInput {
  id: number;
  scheduledStartAt: string | Date | null;
  durationMinutes: number | string | null | undefined;
}

export interface ScheduleReservationEstimate {
  id: number;
  estimatedStartAt: string;
  delayMinutes: number;
}

const toEpoch = (value: string | Date | null | undefined): number | null => {
  if (!value) return null;
  const epoch = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(epoch) ? epoch : null;
};

/**
 * Replays one barber lane after the current serving entry's projected end.
 * The original reservation start remains unchanged; only the operational ETA
 * moves when the preceding work actually overlaps that reservation.
 */
export const calculateScheduleEstimates = (
  projectedCurrentEndAt: string | Date,
  reservations: ScheduleReservationInput[],
  turnoverBufferMinutes = CHAIR_TURNOVER_BUFFER_MINUTES,
): ScheduleReservationEstimate[] => {
  const projectedEnd = toEpoch(projectedCurrentEndAt);
  if (projectedEnd === null) return [];

  let previousEnd = projectedEnd;
  return reservations
    .map((reservation) => ({ ...reservation, scheduledEpoch: toEpoch(reservation.scheduledStartAt) }))
    .filter((reservation): reservation is typeof reservation & { scheduledEpoch: number } => reservation.scheduledEpoch !== null)
    .sort((left, right) => left.scheduledEpoch - right.scheduledEpoch)
    .map((reservation) => {
      const overlapsPreviousWork = reservation.scheduledEpoch < previousEnd;
      const estimatedEpoch = overlapsPreviousWork
        ? previousEnd + turnoverBufferMinutes * 60 * 1000
        : reservation.scheduledEpoch;
      const delayMinutes = Math.max(
        0,
        Math.ceil((estimatedEpoch - reservation.scheduledEpoch) / 60_000),
      );
      const durationMinutes = Math.max(1, Number(reservation.durationMinutes) || 30);
      previousEnd = estimatedEpoch + durationMinutes * 60_000;

      return {
        id: reservation.id,
        estimatedStartAt: new Date(estimatedEpoch).toISOString(),
        delayMinutes,
      };
    });
};

export const shouldNotifyScheduleDelay = (
  previousDelayMinutes: number | null | undefined,
  nextDelayMinutes: number,
): boolean => nextDelayMinutes > SCHEDULE_DELAY_THRESHOLD_MINUTES
  && (
    Number(previousDelayMinutes || 0) <= SCHEDULE_DELAY_THRESHOLD_MINUTES
    || nextDelayMinutes - Number(previousDelayMinutes || 0) >= SCHEDULE_DELAY_NOTIFY_DELTA_MINUTES
  );
