/**
 * Represents an order in the queue for wait time calculation.
 */
interface QueueOrder {
  queue_status: string;
  duration_minutes: number | string | null;
  timer_started_at?: string | null;
  scheduled_start_at?: string | Date | null;
  service_started_at?: string | null;
  service_ends_at?: string | null;
  is_walk_in?: boolean | null;
}

/**
 * Calculates the total estimated wait time for a barber based on their queue.
 * Adds the elapsed break time when a break start timestamp is available.
 * 
 * @param orders - Array of order objects with queue_status, duration_minutes, timer_started_at
 * @param options - Optional flags including isOnBreak and breakBufferMinutes (default: 15)
 * @returns Total estimated wait time in minutes
 */
export const calculateTotalWaitTime = (
  orders: QueueOrder[],
  options?: { isOnBreak?: boolean; breakBufferMinutes?: number; breakStartedAt?: string | Date | null; now?: number }
): number => {
  const now = options?.now ?? Date.now();
  const breakStart = options?.breakStartedAt instanceof Date
    ? options.breakStartedAt.getTime()
    : options?.breakStartedAt
      ? new Date(options.breakStartedAt).getTime()
      : Number.NaN;
  const breakBuffer = options?.isOnBreak
    ? (Number.isFinite(breakStart)
      ? Math.max(0, Math.ceil((now - breakStart) / 60_000))
      : (options.breakBufferMinutes ?? 15))
    : 0;
  if (!orders || !Array.isArray(orders)) return breakBuffer;

  const breakMs = breakBuffer * 60_000;
  let freeAt = now;

  orders.forEach(order => {
    const { queue_status, duration_minutes, timer_started_at } = order;
    const parsedDuration = Number(duration_minutes);
    const duration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 30;
    const durationMs = duration * 60_000;

    if (queue_status === 'waiting' || queue_status === 'accepted' || queue_status === 'late') {
      const scheduledAt = order.is_walk_in === true ? Number.NaN : order.scheduled_start_at
        ? new Date(order.scheduled_start_at).getTime()
        : Number.NaN;
      freeAt = Math.max(freeAt, (Number.isFinite(scheduledAt) ? scheduledAt : now) + breakMs) + durationMs;
    } else if (queue_status === 'in_chair' || queue_status === 'serving') {
      const startValue = order.service_started_at || timer_started_at;
      const startTime = startValue ? new Date(startValue).getTime() : Number.NaN;
      const storedEnd = order.service_ends_at ? new Date(order.service_ends_at).getTime() : Number.NaN;
      const completion = Number.isFinite(storedEnd)
        ? storedEnd + breakMs
        : Number.isFinite(startTime)
          ? now + Math.max(0, duration - Math.floor((now - startTime) / 60_000)) * 60_000 + breakMs
          : now + durationMs + breakMs;
      freeAt = Math.max(freeAt, now, completion);
    }
  });

  // A barber on break keeps at least the break buffer, even with no queued orders.
  return Math.max(breakBuffer, Math.max(0, Math.ceil((freeAt - now) / 60_000)));
};
