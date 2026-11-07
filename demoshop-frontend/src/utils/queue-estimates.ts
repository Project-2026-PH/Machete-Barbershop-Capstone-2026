export interface QueueEstimateEntry {
  id: string | number;
  barber_id?: string | number | null;
  position?: number | string | null;
  status?: string | null;
  is_walk_in?: boolean | null;
  duration_minutes?: number | string | null;
  scheduled_start_at?: string | null;
  estimated_start_at?: string | null;
  service_started_at?: string | null;
  timer_started_at?: string | null;
  service_ends_at?: string | null;
  barber_status?: string | null;
  barber_break_started_at?: string | null;
}

export interface QueueEstimate {
  estimated_start_time: number;
  estimated_completion_time: number;
}

const timestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const durationOf = (value?: number | string | null): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 720 ? parsed : 30;
};

/** Estimate a barber lane in its supplied queue order, respecting reservation start times. */
export const calculateQueueCompletionEstimates = (
  entries: readonly QueueEstimateEntry[],
  now = Date.now(),
): Map<string, QueueEstimate> => {
  const estimates = new Map<string, QueueEstimate>();
  let freeAt = now;

  for (const entry of entries) {
    const durationMs = durationOf(entry.duration_minutes) * 60_000;
    const serving = ['serving', 'in_chair', 'in_service'].includes(String(entry.status || '').toLowerCase());
    const barberStatus = String(entry.barber_status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const breakStartedAt = timestamp(entry.barber_break_started_at);
    const isOnBreak = ['on_break', 'break'].includes(barberStatus);
    const activeBreakMs = isOnBreak && breakStartedAt !== null
      ? Math.max(0, now - breakStartedAt)
      : isOnBreak ? 15 * 60_000 : 0;

    if (serving) {
      const actualStart = timestamp(entry.service_started_at)
        ?? timestamp(entry.timer_started_at)
        ?? timestamp(entry.estimated_start_at)
        ?? now;
      const storedEnd = timestamp(entry.service_ends_at);
      // A barber's active break pauses the service clock. Add elapsed break time
      // to the displayed end, matching the backend wait-time calculation.
      const completion = (storedEnd ?? actualStart + durationMs) + activeBreakMs;
      estimates.set(String(entry.id), {
        estimated_start_time: actualStart,
        estimated_completion_time: completion,
      });
      freeAt = Math.max(freeAt, completion);
      continue;
    }

    const scheduled = entry.is_walk_in === true
      ? null
      : Math.max(timestamp(entry.scheduled_start_at) ?? 0, timestamp(entry.estimated_start_at) ?? 0) || null;
    const persistedEstimate = timestamp(entry.estimated_start_at);
    // An unqueued walk-in has no scheduled or persisted start to shift. Anchor
    // its start after the current break delay so the service duration is added
    // only once the barber is expected to be available.
    const effectiveScheduled = scheduled === null
      ? (isOnBreak ? now + activeBreakMs : null)
      : scheduled + activeBreakMs;
    const effectivePersistedEstimate = persistedEstimate === null ? null : persistedEstimate + activeBreakMs;
    const start = Math.max(now, freeAt, effectiveScheduled ?? 0, effectivePersistedEstimate ?? 0);
    const completion = start + durationMs;
    estimates.set(String(entry.id), {
      estimated_start_time: start,
      estimated_completion_time: completion,
    });
    freeAt = completion;
  }

  return estimates;
};

/** Estimate each barber independently, even when a branch queue contains mixed barbers. */
export const calculateQueueCompletionEstimatesByBarber = (
  entries: readonly QueueEstimateEntry[],
  now = Date.now(),
): Map<string, QueueEstimate> => {
  const lanes = new Map<string, Array<{ entry: QueueEstimateEntry; index: number }>>();
  entries.forEach((entry, index) => {
    const barberId = String(entry.barber_id ?? 'unassigned');
    const lane = lanes.get(barberId) ?? [];
    lane.push({ entry, index });
    lanes.set(barberId, lane);
  });

  const statusOrder = (entry: QueueEstimateEntry): number => {
    const status = String(entry.status || '').toLowerCase();
    if (['serving', 'in_chair', 'in_service'].includes(status)) return 0;
    if (status === 'waiting') return 1;
    return 2;
  };
  const queuePosition = (entry: QueueEstimateEntry): number => {
    const position = Number(entry.position);
    return Number.isFinite(position) && position > 0 ? position : Number.POSITIVE_INFINITY;
  };

  const estimates = new Map<string, QueueEstimate>();
  for (const lane of lanes.values()) {
    lane.sort((left, right) =>
      statusOrder(left.entry) - statusOrder(right.entry)
      || queuePosition(left.entry) - queuePosition(right.entry)
      || left.index - right.index);
    for (const [id, estimate] of calculateQueueCompletionEstimates(lane.map(({ entry }) => entry), now)) {
      estimates.set(id, estimate);
    }
  }
  return estimates;
};
