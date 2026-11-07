import { AppError } from '../error/AppError';

/**
 * Ensures a barber belongs to the same branch as the requested operation.
 */
export const ensureBarberBranchAccess = (barberBranchId: number | null, branchId: number): void => {
  if (barberBranchId === null || barberBranchId !== branchId) {
    throw new AppError('Not authorized for this barber', 403);
  }
};
