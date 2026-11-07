interface ReservationCardStatus {
  status?: string | null;
  payment_status?: string | null;
}

/** Counts completed reservation cards, not individual guests within group bookings. */
export const countCompletedReservationCards = (cards: readonly ReservationCardStatus[]): number =>
  cards.filter((card) =>
    ['completed', 'done', 'completed_paid'].includes(String(card.status || '').toLowerCase().trim())
    && String(card.payment_status || '').toLowerCase().trim() === 'paid',
  ).length;
