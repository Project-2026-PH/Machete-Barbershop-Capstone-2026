import { AppError } from '../error/AppError';

/**
 * Ensures the user attempting to rate is the one who was served.
 */
export const ensureServiceOwnership = (customerId: number | undefined, queueEntryCustomerId: number): void => {
  if (!customerId || customerId !== queueEntryCustomerId) {
    throw new AppError('You are not authorized to rate this service.', 403);
  }
};

/**
 * Ensures a service hasn't already been rated to prevent duplicates.
 */
export const ensureNotDuplicateRating = (alreadyRated: any): void => {
  if (alreadyRated) {
    throw new AppError('You have already rated this service.', 409);
  }
};

/**
 * Ensures a queue entry exists for the given ID.
 */
export const ensureQueueEntryExists = (queueEntry: any): void => {
  if (!queueEntry) {
    throw new AppError('Queue entry not found.', 404);
  }
};
