import { feedbackRepository } from '../repositories/feedback.repository';
import logger from '../utils/general/logger';
import { RatingData } from '@demoshop/shared-types';
import { validateRatingInput } from '../utils/feedback/feedback-validation.util';
import { 
  ensureServiceOwnership, 
  ensureNotDuplicateRating, 
  ensureQueueEntryExists 
} from '../utils/feedback/feedback-guard.util';
import { prepareRatingPayload } from '../utils/feedback/feedback-worker.util';
import { notificationService } from './notification.service';

/**
 * Service for Feedback/Rating business logic.
 * Follows the Coordinator Pattern: orchestrates specialized utilities, 
 * repositories, and guards to handle user reviews.
 */
export class FeedbackService {
  /**
   * Submits a rating for a completed queue entry.
   */
  async submitRating(data: RatingData, userId: number) {
    // Validation: Basic input checks
    validateRatingInput(data);

    const { queueId } = data;

    // Identification: Gather required context from repository
    const [queueEntry, customerId, alreadyRated] = await Promise.all([
      feedbackRepository.findQueueEntryForRating(queueId),
      feedbackRepository.findCustomerIdByUserId(userId),
      feedbackRepository.findExistingRating(queueId)
    ]);

    // Guards: Authorization and data integrity checks
    ensureQueueEntryExists(queueEntry);
    ensureServiceOwnership(customerId ?? undefined, queueEntry!.customer_id);
    ensureNotDuplicateRating(alreadyRated);

    // Execution: Prepare and insert the final rating
    const payload = prepareRatingPayload(data, queueEntry!, customerId!);
    const result = await feedbackRepository.insertRating(payload);

    logger.info(`[Feedback] New rating submitted: ${data.stars} stars for queue ${queueId}`);

    // Notify assigned barber of the feedback submission
    await notificationService.notifyBarberFeedbackReceived({
      queueEntryId: queueEntry!.id,
      barberId: queueEntry!.barber_id,
      stars: data.stars,
      comment: data.comment,
    });

    return result;
  }
}

export const feedbackService = new FeedbackService();
export default feedbackService;
