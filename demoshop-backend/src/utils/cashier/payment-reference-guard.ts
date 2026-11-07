import { queueRepository } from '../../repositories/queue.repository';
import { AppError } from '../error/AppError';

export const normalizeGcashReference = (value: string): string =>
  value.trim().toUpperCase().replace(/[\s-]+/g, '');

/** Final server check shared by cashier confirmation and later evidence upload. */
export const assertGcashReferenceAvailable = async (value: string): Promise<string> => {
  const reference = normalizeGcashReference(value);
  if (!/^[A-Z0-9]{8,32}$/.test(reference)) throw new AppError('Enter the full GCash reference number.', 400);
  if (await queueRepository.isReferenceNumberDuplicate(reference)) {
    throw new AppError('This GCash reference number has already been used.', 409);
  }
  return reference;
};
