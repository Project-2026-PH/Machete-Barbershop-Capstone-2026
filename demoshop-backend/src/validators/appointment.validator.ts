import { AppError } from '../utils/error/AppError';
import type { CancelAppointmentPayload } from '@demoshop/shared-types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateCancelAppointmentPayload(data: any): CancelAppointmentPayload {
  if (!data || typeof data !== 'object') {
    throw new AppError('Invalid payload: expected an object', 400);
  }

  const appointmentId = String(data.appointmentId || '').trim();
  if (!appointmentId || !UUID_REGEX.test(appointmentId)) {
    throw new AppError('Invalid appointment ID: must be a valid UUID', 400);
  }

  const status = String(data.status || '').trim().toUpperCase();
  if (status !== 'CANCELLED' && status !== 'NO_SHOW') {
    throw new AppError('Invalid status: must be either CANCELLED or NO_SHOW', 400);
  }

  const cancellation_reason = String(data.cancellation_reason || '').trim();
  if (cancellation_reason.length < 3) {
    throw new AppError('Reason must be at least 3 characters', 400);
  }
  if (cancellation_reason.length > 255) {
    throw new AppError('Reason must not exceed 255 characters', 400);
  }

  let other_notes: string | undefined = undefined;
  if (data.other_notes !== undefined && data.other_notes !== null) {
    other_notes = String(data.other_notes).trim();
    if (other_notes.length > 500) {
      throw new AppError('Other notes must not exceed 500 characters', 400);
    }
  }

  return {
    appointmentId,
    status: status as 'CANCELLED' | 'NO_SHOW',
    cancellation_reason,
    other_notes,
  };
}
