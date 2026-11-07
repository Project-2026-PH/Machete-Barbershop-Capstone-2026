export const RESERVATION_FEE_AMOUNT = 50;

/**
 * A pure walk-in (no linked customer/reservation) never owes the ₱50
 * reservation fee. Anything checked in from a reservation — including one
 * reconciled through the walk-in flow, which carries a customer_id — does.
 */
export const isReservationFeeEligible = (entry: { is_walk_in?: boolean | null; customer_id?: number | string | null }): boolean =>
  !(entry.is_walk_in && !entry.customer_id);
