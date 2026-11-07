import { RatingData } from '@demoshop/shared-types';

/**
 * Prepares the final feedback object for database insertion.
 * Maps data from the request and the existing queue entry.
 */
export const prepareRatingPayload = (
  data: RatingData,
  queueEntry: any,
  customerId: number
) => {
  return {
    queueId: data.queueId,
    customerId,
    barberId: queueEntry.barber_id,
    serviceId: queueEntry.service_id,
    stars: data.stars,
    comment: data.comment || null,
  };
};
