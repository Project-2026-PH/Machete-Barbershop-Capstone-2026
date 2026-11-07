import { AppError } from '../error/AppError';
import { RatingData, ProfanityFilter } from '@demoshop/shared-types';

/**
 * Validates the core requirements for a service rating.
 * Ensures the queue ID and stars are provided and valid, and feedback comment is clean.
 */
export const validateRatingInput = (data: RatingData): void => {
  const { queueId, stars, comment } = data;

  if (!queueId || !stars) {
    throw new AppError('queueId and stars are required.', 400);
  }

  if (stars < 1 || stars > 5) {
    throw new AppError('Stars must be between 1 and 5.', 400);
  }

  if (comment) {
    const result = ProfanityFilter.getInstance().validateFeedback(comment);
    if (!result.isValid) {
      throw new AppError(result.reason || 'Inappropriate feedback.', 400);
    }
  }
};

