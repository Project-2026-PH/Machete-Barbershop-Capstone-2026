import { AppError } from '../error/AppError';

/**
 * Validations and security guards for queue-related operations.
 * Ensures the data and state are valid before proceeding with queue membership.
 */

/**
 * Ensures a customer is not already active in another queue at this or any other branch.
 * 
 * @param existingEntries - The results of a check for the customer's active queue entries.
 * @throws AppError if the customer is already queued.
 */
export const ensureNotActiveInQueue = (existingEntries: any[]): void => {
  if (existingEntries && existingEntries.length > 0) {
    throw new AppError('You are already in a queue.', 400);
  }
};

/**
 * Ensures a queue entry exists for the given ID.
 * 
 * @param entry - The queue entry record retrieved from the database.
 * @throws AppError if the entry is not found.
 */
export const ensureQueueEntryFound = (entry: any): void => {
  if (!entry) {
    throw new AppError('Queue entry not found.', 404);
  }
};
