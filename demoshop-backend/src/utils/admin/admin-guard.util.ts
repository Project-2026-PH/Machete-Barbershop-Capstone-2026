import { AppError } from '../error/AppError';

/**
 * Ensures an admin cannot suspend their own account.
 */
export const ensureNotSelfSuspension = (targetId: string, currentUserId: string | number): void => {
  if (String(targetId) === String(currentUserId)) {
    throw new AppError('Cannot suspend your own account.', 400);
  }
};
