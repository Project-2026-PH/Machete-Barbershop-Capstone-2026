import db from '../db';

/**
 * Repository for Feedback/Rating database operations.
 */
export class FeedbackRepository {
  /**
   * Finds queue entry details for rating (customer_id, barber_id, service_id).
   */
  async findQueueEntryForRating(queueId: number): Promise<{
    id: number;
    customer_id: number;
    barber_id: number;
    service_id: number;
  } | null> {
    const result = await db.query(
      'SELECT id, customer_id, barber_id, service_id FROM queue_entries WHERE id = $1',
      [queueId]
    );
    return result.rows[0] || null;
  }

  /**
   * Finds customer_id by user_id.
   */
  async findCustomerIdByUserId(userId: number): Promise<number | null> {
    const result = await db.query(
      'SELECT customer_id FROM customers WHERE user_id = $1',
      [userId]
    );
    return result.rows[0]?.customer_id || null;
  }

  /**
   * Checks if a rating already exists for a queue entry.
   */
  async findExistingRating(queueId: number): Promise<boolean> {
    const result = await db.query(
      'SELECT rating_id FROM ratings WHERE queue_id = $1',
      [queueId]
    );
    return result.rows.length > 0;
  }

  /**
   * Inserts a new rating.
   */
  async insertRating(data: {
    queueId?: number | null;
    customerId: number;
    barberId: number;
    serviceId?: number | null;
    stars: number;
    comment: string | null;
    isTest?: boolean;
    isPublicTest?: boolean;
  }): Promise<any> {
    const isTest = Boolean(data.isTest);
    const isPublicTest = data.isPublicTest !== undefined ? Boolean(data.isPublicTest) : true;
    const result = await db.query(
      `INSERT INTO ratings (queue_id, customer_id, barber_id, service_id, stars, comment, is_test, is_public_test)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.queueId ?? null,
        data.customerId,
        data.barberId,
        data.serviceId ?? null,
        data.stars,
        data.comment,
        isTest,
        isPublicTest,
      ]
    );
    return result.rows[0];
  }
}

export const feedbackRepository = new FeedbackRepository();
