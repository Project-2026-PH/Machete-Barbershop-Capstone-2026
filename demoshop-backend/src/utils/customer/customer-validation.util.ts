import { AppError } from '../error/AppError';

/**
 * Ensures a valid user ID is provided for customer-related requests.
 */
export const ensureUserId = (userId: string): void => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }
};
