import type { ReservationInfo } from '../components/queue/types';

// Cashiers only receive reservations that have already been approved by an admin.
const activeReservationStatuses = new Set(['confirmed', 'late', 'accepted']);

/** Keeps upcoming and current-day active reservations in the Reservations worklist. */
export const filterCashierUpcomingReservations = <T extends Pick<ReservationInfo, 'date' | 'status'>>(
  reservations: T[],
  businessDate: string,
): T[] => reservations.filter((reservation) => {
  const reservationDate = reservation.date?.slice(0, 10);
  return Boolean(reservationDate && reservationDate >= businessDate)
    && activeReservationStatuses.has(reservation.status.toLowerCase());
});

/** Keeps the cashier reservation worklist on the current Manila business day. */
export const filterCashierReservationsForBusinessDay = <T extends Pick<ReservationInfo, 'date' | 'status'>>(
  reservations: T[],
  businessDate: string,
): T[] => reservations.filter((reservation) => reservation.date === businessDate
  && activeReservationStatuses.has(reservation.status.toLowerCase()));

type CashierQueueReservation = {
  isWalkIn?: boolean;
  preferredDate?: string | null;
  preferredTime?: string | null;
  status?: string;
};

/** Date-filter upcoming reservations; guests already in the live queue stay visible until settled. */
export const filterCashierQueueForBusinessDay = <T extends CashierQueueReservation>(
  customers: T[],
  businessDate: string,
): T[] => customers.filter((customer) => {
  const status = (customer.status || '').toLowerCase();
  if (['waiting', 'serving', 'in_service', 'in_chair', 'completed', 'done'].includes(status)) return true;

  const isReservation = customer.isWalkIn === false || Boolean(customer.preferredDate || customer.preferredTime);
  if (!isReservation) return true;
  return customer.preferredDate?.slice(0, 10) === businessDate;
});

