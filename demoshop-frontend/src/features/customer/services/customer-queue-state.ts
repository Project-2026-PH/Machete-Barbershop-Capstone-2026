const ACTIVE_QUEUE_STATUSES = new Set(['pending', 'accepted', 'confirmed', 'late', 'waiting', 'serving']);

export const isActiveCustomerQueueEntry = (entry: any): boolean =>
  Boolean(entry && ACTIVE_QUEUE_STATUSES.has(String(entry.status || '').toLowerCase()));

/** Select by guest reference, keeping only group metadata shared between guests. */
export const selectGroupQueueEntry = (queue: any, selectedGuestId: string | null): any => {
  const entries: any[] = Array.isArray(queue?.group_entries) && queue.group_entries.length
    ? queue.group_entries
    : (Array.isArray(queue?.entries) ? queue.entries : []);
  if (!entries.length) return queue;

  const ordered = [...entries].sort((a, b) => Number(a.id) - Number(b.id));
  const selected = ordered.find(entry => String(entry.id) === selectedGuestId && isActiveCustomerQueueEntry(entry))
    || ordered.find(isActiveCustomerQueueEntry)
    || ordered[0];
  return {
    ...selected,
    group_booking_id: queue.group_booking_id,
    group_booking: queue.group_booking,
    group_entries: ordered,
    is_group: true,
    total_guests: queue.total_guests ?? ordered.length,
    total_deposit: queue.total_deposit,
    branch_name: queue.branch_name,
  };
};

/** A completed guest may still have an unfinished guest in the same group. */
export const resolveCustomerQueueEntry = async (
  entry: any,
  loadActiveEntry: () => Promise<any>,
): Promise<any | null> => {
  if (isActiveCustomerQueueEntry(entry)) return entry;
  if (entry?.group_booking_id || entry?.is_group || entry?.isGroup) {
    const remainingEntry = await loadActiveEntry();
    return isActiveCustomerQueueEntry(remainingEntry) ? remainingEntry : null;
  }
  return null;
};
