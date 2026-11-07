import { AppError } from '../utils/error/AppError';
import type { CreateGroupBookingData, GroupBookingItemData } from '@demoshop/shared-types';

export interface ValidatedGroupReservationDto extends CreateGroupBookingData {
  branchId: number;
  preferredDate: string;
  baseTimeSlot?: string;
  isStaggered?: boolean;
  guests: GroupBookingItemData[];
  referenceNumber: string;
}

const TIME_12H_REGEX = /^([1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$/i;
const TIME_24H_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidTimeString(val: string): boolean {
  const trimmed = String(val || '').trim();
  return TIME_12H_REGEX.test(trimmed) || TIME_24H_REGEX.test(trimmed);
}

export function isValidCalendarDate(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export function validateCreateGroupReservationDto(data: any): ValidatedGroupReservationDto {
  if (!data || typeof data !== 'object') {
    throw new AppError('Invalid request payload: expected an object.', 400);
  }

  const branchId = Number(data.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw new AppError('Invalid branchId: must be a positive integer.', 400);
  }

  if (!Array.isArray(data.guests) || data.guests.length === 0) {
    throw new AppError('At least one guest appointment must be provided for a group booking.', 400);
  }

  if (data.guests.length > 3) {
    throw new AppError('A group booking cannot exceed 3 guests.', 400);
  }

  const preferredDate = String(data.preferredDate || data.guests[0]?.preferredDate || '').trim();
  if (!isValidCalendarDate(preferredDate)) {
    throw new AppError(`Invalid preferredDate '${preferredDate}': must be a valid calendar date in YYYY-MM-DD format.`, 400);
  }

  const baseTimeSlot = data.baseTimeSlot ? String(data.baseTimeSlot).trim() : undefined;
  if (baseTimeSlot && !isValidTimeString(baseTimeSlot)) {
    throw new AppError(`Invalid baseTimeSlot '${baseTimeSlot}': must be in 'hh:mm AM/PM' or 'HH:mm' format.`, 400);
  }

  const referenceNumber = String(data.referenceNumber || '').trim();
  if (!referenceNumber) {
    throw new AppError('Payment referenceNumber is required.', 400);
  }

  const validatedGuests: GroupBookingItemData[] = data.guests.map((g: any, index: number) => {
    if (!g || typeof g !== 'object') {
      throw new AppError(`Guest at index ${index} must be an object.`, 400);
    }

    const barberId = Number(g.barberId);
    if (!Number.isInteger(barberId) || barberId <= 0) {
      throw new AppError(`Guest ${index + 1}: valid barberId is required.`, 400);
    }

    const rawServiceIds = Array.isArray(g.serviceIds) ? g.serviceIds : (g.serviceId !== undefined ? [g.serviceId] : []);
    if (rawServiceIds.length === 0) {
      throw new AppError(`Guest ${index + 1}: at least one service must be selected.`, 400);
    }

    const serviceIds: number[] = [];
    for (const rawId of rawServiceIds) {
      const num = Number(rawId);
      if (!Number.isInteger(num) || num <= 0) {
        throw new AppError(`Guest ${index + 1}: invalid serviceId '${rawId}'. Service IDs must be positive integers.`, 400);
      }
      if (serviceIds.includes(num)) {
        throw new AppError(`Guest ${index + 1}: duplicate serviceId '${num}'.`, 400);
      }
      serviceIds.push(num);
    }

    const preferredTime = String(g.preferredTime || g.scheduledStartTime || '').trim();
    if (!preferredTime || !isValidTimeString(preferredTime)) {
      throw new AppError(`Guest ${index + 1}: invalid preferredTime '${preferredTime}'. Must be in 'hh:mm AM/PM' or 'HH:mm' format.`, 400);
    }

    let scheduledStartTime = preferredTime;
    if (g.scheduledStartTime) {
      const candidateScheduled = String(g.scheduledStartTime).trim();
      if (!isValidTimeString(candidateScheduled)) {
        throw new AppError(`Guest ${index + 1}: invalid scheduledStartTime '${candidateScheduled}'. Must be in 'hh:mm AM/PM' or 'HH:mm' format.`, 400);
      }
      scheduledStartTime = candidateScheduled;
    }

    const guestDate = String(g.preferredDate || preferredDate).trim();
    if (!isValidCalendarDate(guestDate)) {
      throw new AppError(`Guest ${index + 1}: invalid preferredDate '${guestDate}'.`, 400);
    }
    if (guestDate !== preferredDate) {
      throw new AppError('All guests in a group booking must share the same appointment date.', 400);
    }

    return {
      guestName: g.guestName ? String(g.guestName).trim().slice(0, 100) : `Guest ${index + 1}`,
      barberId,
      serviceIds,
      preferredDate,
      preferredTime,
      scheduledStartTime,
      estimatedEndTime: g.estimatedEndTime && isValidTimeString(g.estimatedEndTime) ? String(g.estimatedEndTime).trim() : undefined,
      durationMinutes: typeof g.durationMinutes === 'number' && g.durationMinutes > 0 ? g.durationMinutes : undefined,
    };
  });

  return {
    branchId,
    preferredDate,
    baseTimeSlot,
    isStaggered: Boolean(data.isStaggered),
    guests: validatedGuests,
    referenceNumber,
    proofImageUrl: data.proofImageUrl ? String(data.proofImageUrl) : undefined,
    paymentMethod: data.paymentMethod ? String(data.paymentMethod) : undefined,
    paymentMethodId: data.paymentMethodId ? String(data.paymentMethodId) : undefined,
    imageHash: data.imageHash ? String(data.imageHash) : undefined,
    ocrReferenceNumber: data.ocrReferenceNumber ? String(data.ocrReferenceNumber) : undefined,
    recipientIdentifierDetected: data.recipientIdentifierDetected ? String(data.recipientIdentifierDetected) : undefined,
    agreedToTerms: Boolean(data.agreedToTerms),
  };
}
