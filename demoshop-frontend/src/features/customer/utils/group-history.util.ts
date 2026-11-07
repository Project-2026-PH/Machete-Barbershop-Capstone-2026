import { ReservationCardItem, ReservationGuestItem } from '../components/ReservationCard';

/**
 * Groups individual history records that belong to the same group booking into unified group cards.
 */
export function groupHistoryItems(rawItems: any[]): ReservationCardItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  const groupMap = new Map<string, any[]>();
  const singles: ReservationCardItem[] = [];

  for (const item of rawItems) {
    if (item.group_booking_id) {
      const gId = String(item.group_booking_id);
      if (!groupMap.has(gId)) {
        groupMap.set(gId, []);
      }
      groupMap.get(gId)!.push(item);
    } else if (item.is_group || item.isGroup) {
      // Already formatted group item
      singles.push(item);
    } else {
      singles.push(item);
    }
  }

  const consolidatedGroups: ReservationCardItem[] = [];

  groupMap.forEach((entries, groupBookingId) => {
    if (entries.length === 1 && !entries[0].is_group) {
      // Single item group booking: treat as regular with group tag
      const single = entries[0];
      consolidatedGroups.push({
        ...single,
        is_group: true,
        total_guests: 1,
        guests: [{
          id: single.id,
          guest_name: single.guest_name || 'You',
          barber_name: single.barber_name,
          barber_image: single.barber_image,
          service_name: single.service_name,
          price: single.price,
          haircut_photo_url: single.haircut_photo_url,
        }],
        group_entries: entries,
      });
      return;
    }

    // Sort entries so primary / first guest is first
    entries.sort((a, b) => Number(a.id) - Number(b.id));
    const primary = entries[0];

    const uniqueServices = Array.from(
      new Set(entries.map((e) => e.service_name || e.service || 'Grooming Service').filter(Boolean))
    );
    const serviceTitleSummary = uniqueServices.length > 0 ? uniqueServices.join(', ') : 'Group Booking';

    const totalPrice = entries.reduce((sum, e) => sum + (Number(e.price) || 0), 0);
    const totalDeposit = entries.reduce((sum, e) => sum + (Number(e.reservation_fee) || 50), 0);

    // Resolve unified status
    const allCompleted = entries.every((e) => (e.status || '').toLowerCase() === 'completed');
    const anyCancelled = entries.some((e) => ['cancelled', 'canceled', 'declined', 'expired'].includes((e.status || '').toLowerCase()));
    const anyNoShow = entries.some((e) => ['no_show', 'no show', 'noshow'].includes((e.status || '').toLowerCase()));
    const anyPending = entries.some((e) => (e.status || '').toLowerCase() === 'pending');
    const allPaid = entries.every((e) => (e.payment_status || '').toLowerCase() === 'paid');

    let unifiedStatus = primary.status || 'Pending';
    if (anyPending) unifiedStatus = 'Pending';
    else if (anyCancelled) unifiedStatus = 'Cancelled';
    else if (anyNoShow) unifiedStatus = 'NO_SHOW';
    else if (allCompleted) unifiedStatus = 'Completed';

    const guests: ReservationGuestItem[] = entries.map((e, idx) => ({
      id: e.id,
      guest_name: e.guest_name || (idx === 0 ? 'Guest 1 (You)' : `Guest ${idx + 1}`),
      barber_name: e.barber_name || 'Any Barber',
      barber_image: e.barber_image || null,
      service_name: e.service_name || 'Grooming Service',
      price: e.price ?? 0,
      haircut_photo_url: e.haircut_photo_url || null,
    }));

    consolidatedGroups.push({
      id: primary.id,
      group_booking_id: groupBookingId,
      is_group: true,
      isGroup: true,
      date: primary.date,
      appointment_date: primary.appointment_date || primary.date,
      time: primary.time,
      appointment_time: primary.appointment_time || primary.time,
      service_name: `${serviceTitleSummary} (Group Booking)`,
      barber_name: entries.map((e) => e.barber_name).filter(Boolean).join(', ') || 'Multiple Barbers',
      price: totalPrice,
      total_amount: totalPrice,
      reservation_fee: totalDeposit,
      status: unifiedStatus,
      payment_status: allPaid ? 'paid' : (primary.payment_status || 'unpaid'),
      haircut_photo_url: entries.find((e) => e.haircut_photo_url)?.haircut_photo_url || null,
      total_guests: entries.length,
      guests,
      group_entries: entries,
      cancellation_reason: entries.find((e) => e.cancellation_reason || e.cancel_reason)?.cancellation_reason,
    });
  });

  // Merge and sort all items chronologically
  const allMerged = [...consolidatedGroups, ...singles];
  return allMerged.sort((a: any, b: any) => {
    const timeA = new Date(a.transaction_date || a.created_at || a.sort_time || a.date || 0).getTime();
    const timeB = new Date(b.transaction_date || b.created_at || b.sort_time || b.date || 0).getTime();
    return timeB - timeA;
  });
}
