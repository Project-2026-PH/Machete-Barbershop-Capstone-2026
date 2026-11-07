const MANILA_OFFSET_HOURS = 8;
export const ARRIVAL_GRACE_MINUTES = 10;

export const reservationTimeToEpoch = (
  preferredDate: string | Date | null | undefined,
  preferredTime: string | null | undefined,
): number | null => {
  const dateValue = preferredDate instanceof Date
    ? `${preferredDate.getFullYear()}-${String(preferredDate.getMonth() + 1).padStart(2, '0')}-${String(preferredDate.getDate()).padStart(2, '0')}`
    : String(preferredDate || '');
  const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;

  const timeStr = String(preferredTime || '').trim();
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(timeStr);
  if (!timeMatch) return null;

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = timeMatch[3] === undefined ? 0 : Number(timeMatch[3]);
  const modifier = (timeMatch[4] || '').toUpperCase();

  if (minutes > 59 || seconds > 59) return null;
  if (modifier ? hours < 1 || hours > 12 : hours > 23) return null;

  if (hours === 12 && modifier === 'AM') hours = 0;
  if (hours < 12 && modifier === 'PM') hours += 12;
  // If modifier is absent and hours is 1..8, it is afternoon (1:00 PM - 8:59 PM) in barbershop hours
  if (!modifier && hours >= 1 && hours <= 8) hours += 12;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const dateCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    dateCheck.getUTCFullYear() !== year ||
    dateCheck.getUTCMonth() !== month - 1 ||
    dateCheck.getUTCDate() !== day
  ) {
    return null;
  }

  return Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hours - MANILA_OFFSET_HOURS,
    minutes,
  );
};

export const getArrivalDeadlineEpoch = (
  preferredDate: string | Date | null | undefined,
  preferredTime: string | null | undefined,
): number | null => {
  const scheduledAt = reservationTimeToEpoch(preferredDate, preferredTime);
  return scheduledAt === null ? null : scheduledAt + ARRIVAL_GRACE_MINUTES * 60 * 1000;
};

export const getArrivalWindowStartEpoch = (
  preferredDate: string | Date | null | undefined,
  preferredTime: string | null | undefined,
): number | null => {
  const scheduledAt = reservationTimeToEpoch(preferredDate, preferredTime);
  return scheduledAt === null ? null : scheduledAt - ARRIVAL_GRACE_MINUTES * 60 * 1000;
};

export const isReservationDue = (
  preferredDate: string | Date | null | undefined,
  preferredTime: string | null | undefined,
  now = Date.now(),
): boolean => {
  const scheduledAt = reservationTimeToEpoch(preferredDate, preferredTime);
  return scheduledAt !== null && scheduledAt <= now;
};
