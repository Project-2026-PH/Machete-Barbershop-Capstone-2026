import { PoolClient } from 'pg';
import db from '../db';
import logger from '../utils/general/logger';
import { AppError } from '../utils/error/AppError';

const activeLaneRequests = new Map<number, Promise<any[]>>();

const persistQueueEntryServices = async (
  client: PoolClient,
  queueEntryId: number,
  serviceIds: number[],
): Promise<void> => {
  if (serviceIds.length === 0) return;
  await client.query(
    `INSERT INTO queue_entry_services (queue_entry_id, service_id)
     SELECT $1, selected.service_id
     FROM (SELECT DISTINCT unnest($2::int[]) AS service_id) selected
     ON CONFLICT (queue_entry_id, service_id) DO NOTHING`,
    [queueEntryId, serviceIds],
  );
};

/**
 * Repository for Queue-related database operations.
 * Encapsulates all SQL — controllers and services never touch db.query() directly.
 */
export class QueueRepository {
  async hasCustomerUsedReschedule(queueId: number): Promise<boolean> {
    const result = await db.query(
      `SELECT COALESCE(schedule_adjustment_status = 'rescheduled', false) AS used
       FROM queue_entries
       WHERE id = $1`,
      [queueId],
    );
    return Boolean(result.rows[0]?.used);
  }

  async hasCustomerUsedRescheduleForUpdate(client: PoolClient, queueId: number): Promise<boolean> {
    const result = await client.query(
      `SELECT COALESCE(schedule_adjustment_status = 'rescheduled', false) AS used
       FROM queue_entries
       WHERE id = $1
       FOR UPDATE`,
      [queueId],
    );
    return Boolean(result.rows[0]?.used);
  }

  /**
   * Checks if a customer already has an active queue entry (with row-level lock).
   */
  async findActiveByCustomerForUpdate(
    client: PoolClient,
    customerId: number
  ): Promise<{ id: number }[]> {
    const result = await client.query(
      `SELECT id FROM queue_entries 
       WHERE customer_id = $1 AND status IN ('pending', 'accepted', 'waiting', 'serving')
       FOR UPDATE`,
      [customerId]
    );
    return result.rows;
  }

  /**
   * Checks whether another customer already holds this barber at this exact
   * scheduled start, taking a row lock so a concurrent booking cannot slip in
   * between this read and the subsequent insert.
   *
   * Matches on scheduled_start_at (normalized server-side) rather than the raw
   * preferred_date/preferred_time pair, because preferred_time is free-form text
   * where '2:00 PM', '14:00' and '2:00' all denote the same instant.
   */
  /**
   * Finds every active assignment whose service interval overlaps the proposed
   * interval. The barber row must be locked by the caller before this query so
   * concurrent claims for the same barber cannot both observe a free interval.
   *
   * Scheduled reservations use scheduled_start_at + duration. Waiting and
   * serving walk-ins reserve at least one service duration from now, so an
   * active barber remains occupied when an estimate has already elapsed.
   */
  async findBarberIntervalConflictsForUpdate(
    client: PoolClient,
    barberId: number,
    branchId: number,
    proposedStartAt: string,
    durationMinutes: number,
    excludedQueueId = 0,
  ): Promise<{ id: number; customer_id: number | null }[]> {
    const result = await client.query(
      `SELECT qe.id, qe.customer_id
       FROM queue_entries qe
       LEFT JOIN services s ON s.service_id = qe.service_id
       WHERE qe.barber_id = $1
         AND qe.branch_id = $2
         AND qe.id <> $5
         AND qe.status::text IN ('pending', 'accepted', 'late', 'waiting', 'serving')
         AND (
           (
             qe.is_walk_in IS NOT TRUE
             AND qe.scheduled_start_at IS NOT NULL
             AND qe.scheduled_start_at < ($3::timestamptz + ($4::int * INTERVAL '1 minute'))
             AND (qe.scheduled_start_at + (COALESCE(qe.duration_minutes, s.duration_minutes, 30) * INTERVAL '1 minute')) > $3::timestamptz
           )
           OR (
             qe.is_walk_in IS TRUE
             AND qe.status::text = 'waiting'
             AND GREATEST(COALESCE(qe.estimated_start_at, qe.created_at), NOW()) < ($3::timestamptz + ($4::int * INTERVAL '1 minute'))
             AND (GREATEST(COALESCE(qe.estimated_start_at, qe.created_at), NOW())
               + (COALESCE(qe.duration_minutes, s.duration_minutes, 30) * INTERVAL '1 minute')) > $3::timestamptz
           )
           OR (
             qe.is_walk_in IS TRUE
             AND qe.service_started_at IS NOT NULL
             AND qe.service_started_at < ($3::timestamptz + ($4::int * INTERVAL '1 minute'))
             AND GREATEST(
               COALESCE(qe.service_ends_at,
                 qe.service_started_at + (COALESCE(qe.duration_minutes, s.duration_minutes, 30) * INTERVAL '1 minute')),
               NOW() + (COALESCE(qe.duration_minutes, s.duration_minutes, 30) * INTERVAL '1 minute')
             ) > $3::timestamptz
           )
         )
       FOR UPDATE OF qe`,
      [barberId, branchId, proposedStartAt, durationMinutes, excludedQueueId],
    );
    return result.rows;
  }

  async findSlotConflictForUpdate(
    client: PoolClient,
    barberId: number,
    scheduledStartAt: string,
  ): Promise<{ id: number; customer_id: number | null }[]> {
    const result = await client.query(
      `SELECT id, customer_id FROM queue_entries
       WHERE barber_id = $1
         AND scheduled_start_at = $2
         AND is_walk_in IS NOT TRUE
         AND status IN ('pending', 'accepted', 'waiting', 'serving', 'late')
       FOR UPDATE`,
      [barberId, scheduledStartAt],
    );
    return result.rows;
  }

  /**
   * Confirms that a barber is active and belongs to the authenticated branch.
   */
  async isActiveBarberAtBranch(barberId: number, branchId: number): Promise<boolean> {
    const result = await db.query(
      `SELECT 1
       FROM barbers b
       JOIN users u ON u.user_id = b.user_id
       WHERE b.barber_id = $1 AND u.branch_id = $2 AND b.is_active = TRUE
       LIMIT 1`,
      [barberId, branchId],
    );
    return result.rowCount === 1;
  }

  async isActiveBarberAtBranchForUpdate(client: PoolClient, barberId: number, branchId: number): Promise<boolean> {
    const result = await client.query(
      `SELECT b.barber_id
       FROM barbers b
       JOIN users u ON u.user_id = b.user_id
       WHERE b.barber_id = $1 AND u.branch_id = $2 AND b.is_active = TRUE
       FOR UPDATE OF b`,
      [barberId, branchId],
    );
    return result.rows.length === 1;
  }

  async getBarberStatusForUpdate(client: PoolClient, barberId: number): Promise<string | null> {
    const result = await client.query(
      `SELECT status::text AS status
       FROM barbers
       WHERE barber_id = $1
       FOR UPDATE`,
      [barberId],
    );
    return result.rows[0]?.status ?? null;
  }

  /**
   * Resolves the branch assigned to a barber, including inactive barbers that
   * may still have queue entries requiring staff action.
   */
  async findBarberBranchId(barberId: number): Promise<number | null> {
    const result = await db.query(
      `SELECT COALESCE(
          u.branch_id,
          (SELECT u2.branch_id FROM users u2 WHERE LOWER(u2.username) = LOWER(b.name) OR LOWER(u2.email) LIKE LOWER(CONCAT('%', b.name, '%')) LIMIT 1),
          1
       ) AS branch_id
       FROM barbers b
       LEFT JOIN users u ON u.user_id = b.user_id
       WHERE b.barber_id = $1
       LIMIT 1`,
      [barberId],
    );
    const branchId = result.rows[0]?.branch_id;
    return branchId === null || branchId === undefined ? null : Number(branchId);
  }

  /**
   * Finds an idempotent walk-in submission while holding its row lock.
   */
  async findWalkInByIdempotencyKeyForUpdate(client: PoolClient, idempotencyKey: string): Promise<any | null> {
    const result = await client.query(
      `SELECT qe.id, qe.customer_id, qe.branch_id, qe.barber_id, qe.position, qe.status, qe.payment_status, qe.is_walk_in, qe.customer_name,
              qe.service_id, qe.retail_items,
              COALESCE(
                (SELECT ARRAY_AGG(qes.service_id ORDER BY qes.service_id)
                 FROM queue_entry_services qes
                 WHERE qes.queue_entry_id = qe.id),
                CASE WHEN qe.service_id IS NOT NULL THEN ARRAY[qe.service_id] ELSE ARRAY[]::int[] END
              ) AS service_ids,
              qe.duration_minutes, qe.offline_idempotency_key,
              qe.guest_profile_id
       FROM queue_entries qe
         WHERE qe.offline_idempotency_key = $1 AND qe.is_walk_in IS TRUE
       FOR UPDATE`,
      [idempotencyKey],
    );
    return result.rows[0] || null;
  }

  async findReservationByIdempotencyKey(idempotencyKey: string): Promise<any | null> {
    const result = await db.query(
      `SELECT * FROM queue_entries WHERE offline_idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    );
    return result.rows[0] || null;
  }

  async findReservationByIdempotencyKeyForUpdate(client: PoolClient, idempotencyKey: string): Promise<any | null> {
    const result = await client.query(
      `SELECT * FROM queue_entries WHERE offline_idempotency_key = $1 AND is_walk_in IS NOT TRUE FOR UPDATE`,
      [idempotencyKey],
    );
    return result.rows[0] || null;
  }

  /** Claims an offline edit/cancel key inside the caller's queue transaction. */
  async claimCashierOfflineQueueOperation(
    client: PoolClient,
    data: {
      idempotencyKey: string;
      queueEntryId: number;
      branchId: number;
      cashierId: string | null;
      operationType: 'edit' | 'cancel';
      requestHash: string;
    },
  ): Promise<any | null> {
    const inserted = await client.query(
      `INSERT INTO cashier_offline_queue_operations
         (idempotency_key, queue_entry_id, branch_id, cashier_id, operation_type, request_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [data.idempotencyKey, data.queueEntryId, data.branchId, data.cashierId, data.operationType, data.requestHash],
    );
    if (inserted.rows.length > 0) return null;

    const existingResult = await client.query(
      `SELECT queue_entry_id, branch_id, cashier_id, operation_type, request_hash, response_payload
       FROM cashier_offline_queue_operations
       WHERE idempotency_key = $1
       FOR UPDATE`,
      [data.idempotencyKey],
    );
    const existing = existingResult.rows[0];
    if (!existing
      || Number(existing.queue_entry_id) !== data.queueEntryId
      || Number(existing.branch_id) !== data.branchId
      || String(existing.cashier_id || '') !== String(data.cashierId || '')
      || existing.operation_type !== data.operationType
      || existing.request_hash !== data.requestHash) {
      throw new AppError('This offline operation key was already used with different data.', 409);
    }
    if (existing.response_payload === null || existing.response_payload === undefined) {
      throw new AppError('This offline operation is still being recorded. Retry shortly.', 409);
    }
    return typeof existing.response_payload === 'string'
      ? JSON.parse(existing.response_payload)
      : existing.response_payload;
  }

  async saveCashierOfflineQueueOperationResponse(
    client: PoolClient,
    idempotencyKey: string,
    response: unknown,
  ): Promise<void> {
    await client.query(
      `UPDATE cashier_offline_queue_operations
       SET response_payload = $2::jsonb
       WHERE idempotency_key = $1`,
      [idempotencyKey, JSON.stringify(response)],
    );
  }

  async findQueueServiceIdsForUpdate(client: PoolClient, queueEntryId: number): Promise<number[]> {
    const result = await client.query(
      `SELECT service_id FROM queue_entry_services WHERE queue_entry_id = $1 ORDER BY service_id`,
      [queueEntryId],
    );
    if (result.rows.length > 0) return result.rows.map((row: any) => Number(row.service_id));
    const entry = await this.findByIdForUpdate(client, queueEntryId);
    return entry?.service_id ? [Number(entry.service_id)] : [];
  }

  async hasPaymentActivityForQueue(client: PoolClient, queueEntryId: number): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM payment_attempts
       WHERE queue_entry_id = $1 AND status <> 'rejected'
       UNION ALL
       SELECT 1 FROM transactions
       WHERE queue_entry_id = $1 AND transaction_type IS DISTINCT FROM 'reservation_fee'
       LIMIT 1`,
      [queueEntryId],
    );
    return result.rows.length > 0;
  }

  async updateOfflineQueueServices(
    client: PoolClient,
    queueEntryId: number,
    serviceIds: number[],
    durationMinutes: number,
  ): Promise<any | null> {
    const result = await client.query(
      `UPDATE queue_entries
       SET service_id = $2,
           duration_minutes = $3,
           service_ends_at = CASE
             WHEN status::text = 'serving' AND service_started_at IS NOT NULL
               THEN service_started_at + ($3::int * INTERVAL '1 minute')
             ELSE service_ends_at
           END
       WHERE id = $1
       RETURNING *`,
      [queueEntryId, serviceIds[0], durationMinutes],
    );
    await client.query('DELETE FROM queue_entry_services WHERE queue_entry_id = $1', [queueEntryId]);
    await persistQueueEntryServices(client, queueEntryId, serviceIds);
    const entry = result.rows[0] || null;
    if (entry) entry.service_ids = [...serviceIds];
    return entry;
  }

  async reassignOfflineQueueBarber(
    client: PoolClient,
    queueEntryId: number,
    barberId: number,
    position: number,
  ): Promise<any | null> {
    const result = await client.query(
      `UPDATE queue_entries
       SET barber_id = $2,
           status = 'waiting'::queue_status_type,
           position = $3,
           timer_started_at = NULL,
           service_started_at = NULL,
           service_ends_at = NULL
       WHERE id = $1
       RETURNING *`,
      [queueEntryId, barberId, position],
    );
    return result.rows[0] || null;
  }

  async reassignPaidOfflineQueueBarber(client: PoolClient, queueEntryId: number, barberId: number): Promise<any | null> {
    const result = await client.query(
      `UPDATE queue_entries SET barber_id = $2 WHERE id = $1 RETURNING *`,
      [queueEntryId, barberId],
    );
    return result.rows[0] || null;
  }

  async cancelOfflineQueueEntry(client: PoolClient, queueEntryId: number): Promise<any | null> {
    const result = await client.query(
      `UPDATE queue_entries
       SET status = 'cancelled'::queue_status_type,
           position = 0,
           timer_started_at = NULL,
           service_started_at = NULL,
           service_ends_at = NULL
       WHERE id = $1
       RETURNING *`,
      [queueEntryId],
    );
    return result.rows[0] || null;
  }

  /**
   * Acquires a row-level lock on the barber row for queue operations.
   */
  async lockBarber(client: PoolClient, barberId: number): Promise<void> {
    await client.query(
      `SELECT barber_id FROM barbers WHERE barber_id = $1 FOR UPDATE`,
      [barberId]
    );
  }

  /**
   * Gets the next position for a barber's active queue.
   */
  async getNextPosition(client: PoolClient, barberId: number): Promise<number> {
    const result = await client.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
       FROM queue_entries
       WHERE barber_id = $1 AND status IN ('waiting', 'serving')`,
      [barberId]
    );
    return Number.parseInt(String(result.rows[0].next_pos), 10) || 1;
  }

  async countActiveServingByBarber(client: PoolClient, barberId: number): Promise<number> {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM queue_entries WHERE barber_id = $1 AND status = 'serving'`,
      [barberId]
    );
    return result.rows[0]?.count || 0;
  }

  /** Serialize a break transition with queue assignment and promotion. */
  async withBarberReadyForBreak<T>(barberId: number, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withTransaction(async (client) => {
      await this.lockBarber(client, barberId);
      if (await this.countActiveServingByBarber(client, barberId) > 0) {
        throw new AppError('Complete the serving customer before setting this barber On Break.', 409);
      }
      return work(client);
    });
  }

  /**
   * Runs a queue transaction while keeping connection and rollback handling in
   * the repository layer. Services coordinate the work through repository methods.
   */
  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await db.connect();
    let hasError = false;
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      hasError = true;
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure on disconnected socket
      }
      throw error;
    } finally {
      client.release(hasError);
    }
  }

  private isInitialized = false;

  async ensureColumns(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await db.query(`
        ALTER TABLE public.queue_entries 
        ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64),
        ADD COLUMN IF NOT EXISTS ocr_reference_number VARCHAR(64),
        ADD COLUMN IF NOT EXISTS recipient_identifier_detected TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_queue_entries_image_hash 
        ON public.queue_entries (image_hash)
        WHERE image_hash IS NOT NULL;

        CREATE TABLE IF NOT EXISTS public.group_bookings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          customer_id INT NOT NULL REFERENCES public.customers(customer_id) ON DELETE CASCADE,
          branch_id INT NOT NULL REFERENCES public.branches(branch_id),
          total_guests INT NOT NULL DEFAULT 1,
          total_deposit NUMERIC(10, 2) NOT NULL DEFAULT 0,
          reference_number VARCHAR(50),
          proof_image_url TEXT,
          payment_method VARCHAR(50),
          payment_method_id VARCHAR(50),
          status VARCHAR(30) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_group_bookings_customer
          ON public.group_bookings (customer_id);

        CREATE INDEX IF NOT EXISTS idx_group_bookings_branch
          ON public.group_bookings (branch_id);

        ALTER TABLE public.queue_entries
          ADD COLUMN IF NOT EXISTS group_booking_id UUID REFERENCES public.group_bookings(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS guest_name VARCHAR(100) DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS recipient_identifier_detected TEXT,
          ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

        ALTER TABLE public.group_bookings
          ADD COLUMN IF NOT EXISTS recipient_identifier_detected TEXT;

        CREATE INDEX IF NOT EXISTS idx_queue_entries_is_test
          ON public.queue_entries (is_test)
          WHERE is_test = TRUE;

        ALTER TABLE public.ratings
          ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS is_public_test BOOLEAN NOT NULL DEFAULT TRUE;

        CREATE INDEX IF NOT EXISTS idx_ratings_is_test
          ON public.ratings (is_test)
          WHERE is_test = TRUE;

        CREATE INDEX IF NOT EXISTS idx_queue_entries_group_booking_id
          ON public.queue_entries (group_booking_id)
          WHERE group_booking_id IS NOT NULL;

        -- Provider-aware payment columns migration
        -- Note: gcash_ref_no retained across transactions/payment_attempts as generic reference column (naming debt)
        ALTER TABLE public.payment_attempts
          ADD COLUMN IF NOT EXISTS payment_provider TEXT;

        ALTER TABLE public.group_bookings
          ADD COLUMN IF NOT EXISTS payment_provider TEXT;

        ALTER TABLE public.transactions
          ADD COLUMN IF NOT EXISTS payment_provider TEXT;

        ALTER TABLE public.queue_entries
          ADD COLUMN IF NOT EXISTS payment_provider TEXT;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'check_payment_attempts_provider'
          ) THEN
            ALTER TABLE public.payment_attempts
              ADD CONSTRAINT check_payment_attempts_provider
              CHECK (payment_provider IS NULL OR payment_provider IN ('gcash', 'maya', 'maribank', 'gotyme'));
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'check_group_bookings_provider'
          ) THEN
            ALTER TABLE public.group_bookings
              ADD CONSTRAINT check_group_bookings_provider
              CHECK (payment_provider IS NULL OR payment_provider IN ('gcash', 'maya', 'maribank', 'gotyme'));
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'check_transactions_provider'
          ) THEN
            ALTER TABLE public.transactions
              ADD CONSTRAINT check_transactions_provider
              CHECK (payment_provider IS NULL OR payment_provider IN ('gcash', 'maya', 'maribank', 'gotyme'));
          END IF;
        END $$;
      `);
      this.isInitialized = true;
    } catch (err) {
      logger.warn('[QueueRepository] Failed to ensure group_bookings/columns:', err);
    }
  }

  /** Checks whether a receipt image hash has already been submitted. */
  async isImageHashDuplicate(imageHash: string): Promise<boolean> {
    const trimmed = imageHash.trim();
    if (!trimmed) return false;
    await this.ensureColumns();
    const result = await db.query(
      `SELECT 1 FROM (
         SELECT 1 FROM queue_entries
         WHERE image_hash = $1
           AND status NOT IN ('cancelled', 'expired', 'no_show')
         UNION ALL
         SELECT 1 FROM payment_attempts
         WHERE receipt_sha256 = $1
           AND status NOT IN ('rejected')
       ) duplicate_hash_check
       LIMIT 1`,
      [trimmed],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** A payment reference remains used even if its booking was later cancelled or expired. */
  async isReferenceNumberDuplicate(referenceNumber: string): Promise<boolean> {
    const normalized = referenceNumber.trim().toUpperCase().replace(/[\s-]+/g, '');
    if (!normalized) return false;
    await this.ensureColumns();
    const result = await db.query(
      `SELECT 1 FROM (
         SELECT 1 FROM queue_entries
         WHERE reference_number IS NOT NULL
           AND regexp_replace(upper(reference_number), '[^A-Z0-9]', '', 'g') = $1
         UNION ALL
         SELECT 1 FROM group_bookings
         WHERE reference_number IS NOT NULL
           AND regexp_replace(upper(reference_number), '[^A-Z0-9]', '', 'g') = $1
         UNION ALL
         SELECT 1 FROM transactions
         WHERE gcash_ref_no IS NOT NULL
           AND regexp_replace(upper(gcash_ref_no), '[^A-Z0-9]', '', 'g') = $1
         UNION ALL
         SELECT 1 FROM payment_attempts
         WHERE gcash_ref_no IS NOT NULL AND status <> 'rejected'
           AND regexp_replace(upper(gcash_ref_no), '[^A-Z0-9]', '', 'g') = $1
       ) duplicate_check
       LIMIT 1`,
      [normalized],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Inserts a parent group booking record. */
  async insertGroupBooking(
    client: PoolClient,
    data: {
      customerId: number;
      branchId: number;
      totalGuests: number;
      totalDeposit: number;
      referenceNumber?: string | null;
      proofImageUrl?: string | null;
      paymentMethod?: string | null;
      paymentMethodId?: string | null;
      paymentProvider?: string | null;
      recipientIdentifierDetected?: string | null;
      status?: string;
    },
  ): Promise<any> {
    await this.ensureColumns();
    const status = data.status || 'pending';
    const result = await client.query(
      `INSERT INTO public.group_bookings (
         customer_id, branch_id, total_guests, total_deposit,
         reference_number, proof_image_url, payment_method, payment_method_id, payment_provider, recipient_identifier_detected, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.customerId,
        data.branchId,
        data.totalGuests,
        data.totalDeposit,
        data.referenceNumber || null,
        data.proofImageUrl || null,
        data.paymentMethod || null,
        data.paymentMethodId || null,
        data.paymentProvider || null,
        data.recipientIdentifierDetected || null,
        status,
      ],
    );
    return result.rows[0];
  }

  /** Inserts a pending reservation with its server-calculated schedule snapshot. */
  async insertReservation(
    client: PoolClient,
    data: {
      customerId: number;
      barberId: number;
      branchId: number;
      serviceId: number;
      serviceIds: number[];
      durationMinutes: number;
      preferredDate?: string;
      preferredTime?: string;
      scheduledStartAt: string | null;
      arrivalDeadlineAt: string | null;
      status?: string;
      referenceNumber?: string | null;
      proofImageUrl?: string | null;
      imageHash?: string | null;
      ocrReferenceNumber?: string | null;
      recipientIdentifierDetected?: string | null;
      expiresAt?: string | null;
      groupBookingId?: string | null;
      guestName?: string | null;
      customerName?: string | null;
      isTest?: boolean;
      offlineIdempotencyKey?: string | null;
      paymentProvider?: string | null;
    },
  ): Promise<any> {
    // Schema/index initialization is performed during application startup or
    // migrations. Never execute DDL inside the reservation request path.
    const status = data.status || 'pending';
    const isTest = Boolean(data.isTest);
    const result = await client.query(
      `INSERT INTO queue_entries (
        customer_id, barber_id, branch_id, service_id, duration_minutes,
           position, status, preferred_date, preferred_time, scheduled_start_at, arrival_deadline_at,
         reference_number, proof_image_url, image_hash, ocr_reference_number, recipient_identifier_detected, expires_at,
         group_booking_id, guest_name, customer_name, is_test, offline_idempotency_key, payment_provider
       )
           VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [
          data.customerId > 0 ? data.customerId : null,
        data.barberId,
        data.branchId,
        data.serviceId,
        data.durationMinutes,
        status,
        data.preferredDate || null,
        data.preferredTime || null,
        data.scheduledStartAt,
        data.arrivalDeadlineAt,
        data.referenceNumber || null,
        data.proofImageUrl || null,
        data.imageHash || null,
        data.ocrReferenceNumber || null,
        data.recipientIdentifierDetected || null,
        data.expiresAt || null,
        data.groupBookingId || null,
        data.guestName || null,
        data.customerName || null,
        isTest,
        data.offlineIdempotencyKey || null,
        data.paymentProvider || null,
      ],
    );
    const entry = result.rows[0];
    if (entry?.id) {
      const sIds = (Array.isArray(data.serviceIds) && data.serviceIds.length > 0)
        ? data.serviceIds
        : (data.serviceId ? [data.serviceId] : []);
      await persistQueueEntryServices(client, Number(entry.id), sIds);
      entry.service_ids = sIds;
    }
    return entry;
  }

  /**
   * Inserts a new queue entry for a registered customer.
   */
  async insertEntry(
    client: PoolClient,
    data: {
      customerId: number;
      barberId: number;
      branchId: number;
      serviceId: number | null;
      position: number;
      status: string;
      timerStartedAt: string | null;
    }
  ): Promise<any> {
    const result = await client.query(
      `INSERT INTO queue_entries (customer_id, barber_id, branch_id, service_id, position, status, timer_started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.customerId, data.barberId, data.branchId, data.serviceId, data.position, data.status, data.timerStartedAt]
    );
    return result.rows[0];
  }

  /**
   * Inserts a walk-in queue entry.
   */
  async insertWalkIn(
    client: PoolClient,
    data: {
      customerName: string;
      barberId: number;
      branchId: number;
      serviceId?: number | null;
      serviceIds?: number[];
      durationMinutes?: number | null;
      idempotencyKey?: string | null;
      position: number;
      status: string;
      timerStartedAt?: string | null;
      paymentStatus: string;
    }
  ): Promise<any> {
    const result = await client.query(
      `INSERT INTO queue_entries (
         customer_name, barber_id, branch_id, service_id, duration_minutes,
         offline_idempotency_key, position, status, timer_started_at, payment_status, is_walk_in
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       ON CONFLICT DO NOTHING
       RETURNING id, position, status, payment_status, is_walk_in, customer_name,
                 service_id, duration_minutes, offline_idempotency_key`,
      [
        data.customerName,
        data.barberId,
        data.branchId,
        data.serviceId ?? null,
        data.durationMinutes ?? null,
        data.idempotencyKey ?? null,
        data.position,
        data.status,
        data.timerStartedAt ?? null,
        data.paymentStatus,
      ]
    );
    let entry = result.rows[0];
    if (!entry && data.idempotencyKey) {
      const existing = await client.query(
        `SELECT id, position, status, payment_status, is_walk_in, customer_name,
                service_id, duration_minutes, offline_idempotency_key
         FROM queue_entries
         WHERE offline_idempotency_key = $1`,
        [data.idempotencyKey]
      );
      entry = existing.rows[0];
    }
    if (entry?.id) {
      const sIds = (Array.isArray(data.serviceIds) && data.serviceIds.length > 0)
        ? data.serviceIds
        : (data.serviceId ? [data.serviceId] : []);
      await persistQueueEntryServices(client, Number(entry.id), sIds);
      entry.service_ids = sIds;
    }
    return entry;
  }

  /** Inserts a walk-in and associates it with its durable guest profile. */
  async insertGuestWalkIn(
    client: PoolClient,
    data: {
      customerName: string;
      guestProfileId: number;
      barberId: number;
      branchId: number;
      serviceId?: number | null;
      serviceIds?: number[];
      retailItems?: unknown;
      durationMinutes?: number | null;
      idempotencyKey?: string | null;
      position: number;
      status: string;
      timerStartedAt?: string | null;
      paymentStatus: string;
      isTest?: boolean;
    },
  ): Promise<any> {
    const isTest = Boolean(data.isTest);
    const serviceIds = data.serviceIds?.length ? data.serviceIds : (data.serviceId ? [data.serviceId] : []);
    const result = await client.query(
      `WITH inserted_entry AS (INSERT INTO queue_entries (
         customer_name, guest_profile_id, barber_id, branch_id, service_id,
         retail_items, duration_minutes, offline_idempotency_key, position, status, timer_started_at,
         payment_status, is_walk_in, is_test
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, TRUE, $13)
       ON CONFLICT DO NOTHING
       RETURNING id, branch_id, barber_id, position, status, payment_status, is_walk_in, customer_name,
                 service_id, retail_items, duration_minutes, offline_idempotency_key,
                 guest_profile_id, is_test
       ), inserted_services AS (
         INSERT INTO queue_entry_services (queue_entry_id, service_id)
         SELECT entry.id, selected.service_id
         FROM inserted_entry entry CROSS JOIN UNNEST($14::int[]) AS selected(service_id)
         ON CONFLICT (queue_entry_id, service_id) DO NOTHING
         RETURNING queue_entry_id
       )
       SELECT entry.*, $14::int[] AS service_ids FROM inserted_entry entry`,
      [
        data.customerName,
        data.guestProfileId,
        data.barberId,
        data.branchId,
        data.serviceId ?? null,
        JSON.stringify(data.retailItems ?? []),
        data.durationMinutes ?? null,
        data.idempotencyKey ?? null,
        data.position,
        data.status,
        data.timerStartedAt ?? null,
        data.paymentStatus,
        isTest,
        serviceIds,
      ],
    );
    let entry = result.rows[0];
    if (!entry && data.idempotencyKey) {
      // A retry returns the original services; it must not attach a changed cart.
      entry = await this.findWalkInByIdempotencyKeyForUpdate(client, data.idempotencyKey);
    }
    return entry;
  }

  async updateRetailItems(client: PoolClient, queueEntryId: number, retailItems: unknown): Promise<void> {
    await client.query(
      `UPDATE queue_entries SET retail_items = $2::jsonb WHERE id = $1`,
      [queueEntryId, JSON.stringify(retailItems ?? [])],
    );
  }

  async updateQueueIdentity(client: PoolClient, queueEntryId: number, customerName: string, barberId: number, position: number): Promise<any> {
    const result = await client.query(
      `UPDATE queue_entries
       SET customer_name = $2,
           barber_id = $3,
           status = CASE WHEN barber_id <> $3 THEN 'waiting' ELSE status END,
           position = CASE WHEN barber_id <> $3 THEN $4 ELSE position END,
           timer_started_at = CASE WHEN barber_id <> $3 THEN NULL ELSE timer_started_at END,
           service_started_at = CASE WHEN barber_id <> $3 THEN NULL ELSE service_started_at END,
           service_ends_at = CASE WHEN barber_id <> $3 THEN NULL ELSE service_ends_at END
       WHERE id = $1
       RETURNING *`,
      [queueEntryId, customerName, barberId, position],
    );
    return result.rows[0] || null;
  }

  async updateReservationIdentity(client: PoolClient, queueEntryId: number, barberId: number): Promise<any> {
    const result = await client.query(`UPDATE queue_entries SET barber_id = $2 WHERE id = $1 RETURNING *`, [queueEntryId, barberId]);
    return result.rows[0] || null;
  }

  async updateOrderItems(
    client: PoolClient,
    queueEntryId: number,
    data: {
      serviceId: number;
      serviceIds: number[];
      durationMinutes: number | null;
      retailItems: unknown;
      serviceEndsAt?: string | null;
    },
  ): Promise<any> {
    const result = await client.query(
      `UPDATE queue_entries
       SET service_id = $2, duration_minutes = $3,
           retail_items = $4::jsonb,
           service_ends_at = COALESCE($5::timestamptz, service_ends_at)
       WHERE id = $1
       RETURNING *`,
      [
        queueEntryId,
        data.serviceId,
        data.durationMinutes,
        JSON.stringify(data.retailItems ?? []),
        data.serviceEndsAt ?? null,
      ],
    );

    const sIds = (data.serviceIds && data.serviceIds.length > 0)
      ? data.serviceIds
      : (data.serviceId ? [data.serviceId] : []);

    if (sIds.length > 0) {
      await client.query(`DELETE FROM queue_entry_services WHERE queue_entry_id = $1`, [queueEntryId]);
      await persistQueueEntryServices(client, queueEntryId, sIds);
    }

    const row = result.rows[0];
    if (row) {
      row.service_ids = sIds;
    }
    return row || null;
  }

  async findFutureReservationsForSchedule(
    client: PoolClient,
    barberId: number,
    branchId: number,
    currentQueueId: number,
  ): Promise<any[]> {
    const result = await client.query(
      `SELECT qe.id,
              qe.customer_id,
              qe.branch_id,
              qe.barber_id,
              qe.preferred_date,
              qe.preferred_time,
              qe.service_id,
              COALESCE(
                (SELECT ARRAY_AGG(qes.service_id ORDER BY qes.service_id)
                 FROM queue_entry_services qes
                 WHERE qes.queue_entry_id = qe.id),
                CASE WHEN qe.service_id IS NOT NULL THEN ARRAY[qe.service_id] ELSE ARRAY[]::int[] END
              ) AS service_ids,
              qe.scheduled_start_at,
              qe.estimated_start_at,
              qe.schedule_delay_minutes,
              qe.schedule_adjustment_status,
              qe.status,
              COALESCE(qe.duration_minutes, s.duration_minutes, 30) AS duration_minutes,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Customer') AS customer_name,
              c.user_id AS customer_user_id,
              COALESCE(NULLIF(TRIM(c.email), ''), NULLIF(TRIM(u.email), '')) AS customer_email,
              COALESCE(u.email_notifications_enabled, c.email_notifications_enabled, TRUE) AS email_notifications_enabled,
              COALESCE(NULLIF(TRIM(b.name), ''), 'your barber') AS barber_name,
              COALESCE(br.name, 'DemoShop Barbershop') AS branch_name
       FROM queue_entries qe
       LEFT JOIN services s ON s.service_id = qe.service_id
       LEFT JOIN customers c ON c.customer_id = qe.customer_id
       LEFT JOIN users u ON u.user_id = c.user_id
       LEFT JOIN barbers b ON b.barber_id = qe.barber_id
       LEFT JOIN branches br ON br.branch_id = qe.branch_id
       WHERE qe.barber_id = $1
         AND qe.branch_id = $2
         AND qe.id <> $3
         AND qe.status IN ('accepted', 'late')
         AND qe.scheduled_start_at IS NOT NULL
         AND qe.scheduled_start_at > NOW()
       ORDER BY qe.scheduled_start_at ASC, qe.id ASC
       FOR UPDATE OF qe`,
      [barberId, branchId, currentQueueId],
    );
    return result.rows;
  }

  async findServingEntryForScheduleForUpdate(client: PoolClient, barberId: number): Promise<any | null> {
    const result = await client.query(
      `SELECT qe.id, qe.service_started_at, qe.timer_started_at, qe.service_ends_at,
              COALESCE(qe.duration_minutes, s.duration_minutes, 30) AS duration_minutes
       FROM queue_entries qe
       LEFT JOIN services s ON s.service_id = qe.service_id
       WHERE qe.barber_id = $1
         AND qe.status = 'serving'
       ORDER BY qe.position ASC, qe.id ASC
       LIMIT 1
       FOR UPDATE OF qe`,
      [barberId],
    );
    return result.rows[0] || null;
  }

  async findActiveEntriesForScheduleForUpdate(
    client: PoolClient,
    barberId: number,
    branchId: number,
  ): Promise<any[]> {
    const result = await client.query(
      `SELECT qe.id, qe.branch_id, qe.barber_id, qe.position, qe.status,
              COALESCE(
                qe.duration_minutes,
                (
                  SELECT SUM(COALESCE(s.duration_minutes, 30))::int
                  FROM services s
                  WHERE s.service_id IN (
                    SELECT qes.service_id FROM queue_entry_services qes WHERE qes.queue_entry_id = qe.id
                    UNION
                    SELECT qe.service_id WHERE qe.service_id IS NOT NULL
                  )
                ),
                30
              ) AS duration_minutes,
              qe.service_started_at, qe.timer_started_at,
              qe.service_ends_at, qe.is_walk_in
       FROM queue_entries qe
       WHERE qe.barber_id = $1
         AND qe.branch_id = $2
         AND qe.status IN ('waiting', 'serving')
       ORDER BY qe.position ASC, qe.id ASC
       FOR UPDATE OF qe`,
      [barberId, branchId],
    );
    return result.rows;
  }

  async updateReservationScheduleEstimates(
    client: PoolClient,
    updates: Array<{
      queueId: number;
      estimatedStartAt: string;
      delayMinutes: number;
      scheduleAdjustmentStatus?: 'none' | 'pending';
    }>,
  ): Promise<any[]> {
    if (updates.length === 0) return [];
    const result = await client.query(
      `UPDATE queue_entries qe
       SET estimated_start_at = schedule_update.estimated_start_at,
           schedule_delay_minutes = schedule_update.delay_minutes,
           schedule_adjustment_status = COALESCE(schedule_update.adjustment_status, qe.schedule_adjustment_status)
       FROM UNNEST($1::int[], $2::timestamptz[], $3::int[], $4::text[])
         AS schedule_update(id, estimated_start_at, delay_minutes, adjustment_status)
       WHERE qe.id = schedule_update.id
       RETURNING qe.id, qe.customer_id, qe.branch_id, qe.barber_id, qe.preferred_date,
                 qe.preferred_time, qe.scheduled_start_at, qe.estimated_start_at,
                 qe.schedule_delay_minutes, qe.schedule_adjustment_status`,
      [
        updates.map((update) => update.queueId),
        updates.map((update) => update.estimatedStartAt),
        updates.map((update) => update.delayMinutes),
        updates.map((update) => update.scheduleAdjustmentStatus ?? null),
      ],
    );
    return result.rows;
  }

  /**
   * Locks all active reservations whose service interval overlaps a proposed
   * start/end window. This is the authoritative last-mile guard for customer
   * rescheduling; the public availability endpoint is only advisory.
   */
  async findReservationIntervalConflictsForUpdate(
    client: PoolClient,
    barberId: number,
    branchId: number,
    scheduledStartAt: string,
    durationMinutes: number,
    excludedQueueId: number,
  ): Promise<{ id: number; customer_id: number | null }[]> {
    return this.findBarberIntervalConflictsForUpdate(
      client,
      barberId,
      branchId,
      scheduledStartAt,
      durationMinutes,
      excludedQueueId,
    );
  }

  async acknowledgeScheduleAdjustment(
    client: PoolClient,
    queueId: number,
    customerId: number,
  ): Promise<any | null> {
    const result = await client.query(
      `UPDATE queue_entries
       SET schedule_adjustment_status = 'kept'
       WHERE id = $1
         AND customer_id = $2
         AND status::text IN ('accepted', 'late')
         AND schedule_delay_minutes > 0
       RETURNING id, schedule_adjustment_status, estimated_start_at, schedule_delay_minutes`,
      [queueId, customerId],
    );
    return result.rows[0] || null;
  }

  async rescheduleReservationForCustomer(
    client: PoolClient,
    data: {
      queueId: number;
      customerId: number;
      preferredDate: string;
      preferredTime: string;
      scheduledStartAt: string;
      arrivalDeadlineAt: string;
    },
  ): Promise<any | null> {
    const result = await client.query(
      `UPDATE queue_entries
       SET preferred_date = $3::date,
           preferred_time = $4,
           scheduled_start_at = $5::timestamptz,
           arrival_deadline_at = $6::timestamptz,
           estimated_start_at = $5::timestamptz,
           schedule_delay_minutes = 0,
           schedule_adjustment_status = 'rescheduled',
           position = 0
       WHERE id = $1
         AND customer_id = $2
         AND status::text IN ('accepted', 'late')
       RETURNING *`,
      [
        data.queueId,
        data.customerId,
        data.preferredDate,
        data.preferredTime,
        data.scheduledStartAt,
        data.arrivalDeadlineAt,
      ],
    );
    return result.rows[0] || null;
  }

  async findScheduledReservationsForUpdate(client: PoolClient, barberId: number): Promise<any[]> {
    const result = await client.query(
      `SELECT id, status, position, preferred_date, preferred_time,
              scheduled_start_at, arrival_deadline_at, arrived_at
       FROM queue_entries
       WHERE barber_id = $1
         AND status IN ('accepted', 'late', 'waiting', 'serving')
         AND (preferred_date IS NOT NULL OR scheduled_start_at IS NOT NULL OR arrival_deadline_at IS NOT NULL)
       FOR UPDATE`,
      [barberId],
    );
    return result.rows;
  }

  /**
   * Performs atomic set-based synchronization of scheduled reservations for a barber.
   * Updates no-shows, lates, and timestamps across all matching rows in one statement.
   */
  async syncScheduledReservationsSetBased(
    client: PoolClient,
    barberId: number,
    nowIso: string,
  ): Promise<{ rebalanceNeeded: boolean }> {
    try {
      const result = await client.query(
        `WITH no_shows AS (
           UPDATE queue_entries
           SET status = 'no_show', position = 0,
               no_show_at = COALESCE(no_show_at, NOW()),
               timer_started_at = NULL, service_started_at = NULL
           WHERE barber_id = $1
             AND status IN ('accepted', 'late', 'waiting')
             AND arrived_at IS NULL
             AND arrival_deadline_at IS NOT NULL
             AND arrival_deadline_at <= $2
           RETURNING id
         ),
         lates AS (
           UPDATE queue_entries
           SET status = 'late', position = 0,
               timer_started_at = NULL, service_started_at = NULL
           WHERE barber_id = $1
             AND status = 'accepted'
             AND scheduled_start_at IS NOT NULL
             AND scheduled_start_at <= $2
             AND (arrival_deadline_at IS NULL OR arrival_deadline_at > $2)
           RETURNING id
         )
         UPDATE queue_entries
         SET status = 'accepted', position = 0,
             timer_started_at = NULL, service_started_at = NULL, service_ends_at = NULL
         WHERE barber_id = $1
           AND status IN ('waiting', 'serving')
           AND arrived_at IS NULL
           AND scheduled_start_at IS NOT NULL
           AND scheduled_start_at > $2
         RETURNING id`,
        [barberId, nowIso]
      );

      return { rebalanceNeeded: result.rows.length > 0 };
    } catch (err: any) {
      logger.warn(`[QueueRepository] syncScheduledReservationsSetBased error for barber ${barberId}: ${err?.message}`);
      return { rebalanceNeeded: false };
    }
  }

  async markScheduledNoShow(client: PoolClient, queueId: number, arrivalDeadlineAt: string): Promise<void> {
    await client.query(
      `UPDATE queue_entries
       SET status = 'no_show', position = 0,
           arrival_deadline_at = $2, no_show_at = COALESCE(no_show_at, NOW()),
           timer_started_at = NULL, service_started_at = NULL
       WHERE id = $1 AND status::text IN ('accepted', 'late')`,
      [queueId, arrivalDeadlineAt],
    );
  }

  async markScheduledLate(
    client: PoolClient,
    queueId: number,
    scheduledStartAt: string,
    arrivalDeadlineAt: string,
  ): Promise<void> {
    try {
      await client.query(
        `UPDATE queue_entries
         SET status = 'late', position = 0,
             scheduled_start_at = $2, arrival_deadline_at = $3,
             timer_started_at = NULL, service_started_at = NULL
         WHERE id = $1 AND status::text = 'accepted'`,
        [queueId, scheduledStartAt, arrivalDeadlineAt],
      );
    } catch (err: any) {
      logger.warn(`[QueueRepository] Failed to set status='late' for queue entry ${queueId}: ${err?.message}`);
      await client.query(
        `UPDATE queue_entries
         SET position = 0,
             scheduled_start_at = $2, arrival_deadline_at = $3,
             timer_started_at = NULL, service_started_at = NULL
         WHERE id = $1 AND status::text = 'accepted'`,
        [queueId, scheduledStartAt, arrivalDeadlineAt],
      );
    }
  }

  async hydrateScheduledTimes(
    client: PoolClient,
    queueId: number,
    scheduledStartAt: string,
    arrivalDeadlineAt: string,
  ): Promise<void> {
    await client.query(
      `UPDATE queue_entries
       SET scheduled_start_at = $2, arrival_deadline_at = $3
       WHERE id = $1`,
      [queueId, scheduledStartAt, arrivalDeadlineAt],
    );
  }

  async restoreScheduledReservation(
    client: PoolClient,
    queueId: number,
    scheduledStartAt: string,
    arrivalDeadlineAt: string,
  ): Promise<void> {
    await client.query(
      `UPDATE queue_entries
       SET status = 'accepted', position = 0,
           timer_started_at = NULL, service_started_at = NULL, service_ends_at = NULL,
           scheduled_start_at = $2, arrival_deadline_at = $3
       WHERE id = $1 AND status::text IN ('waiting', 'serving')`,
      [queueId, scheduledStartAt, arrivalDeadlineAt],
    );
  }

  async rebalanceLiveQueue(client: PoolClient, barberId: number): Promise<void> {
    await client.query(
      `UPDATE queue_entries qe
       SET position = ranked.new_position
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS new_position
         FROM queue_entries
         WHERE barber_id = $1 AND status::text IN ('waiting', 'serving')
       ) ranked
       WHERE qe.id = ranked.id`,
      [barberId],
    );
  }

  async promoteEligibleFirst(client: PoolClient, barberId: number): Promise<void> {
    await client.query(
      `UPDATE queue_entries qe
       SET status = 'serving', timer_started_at = NOW(), service_started_at = NOW(),
           service_ends_at = NOW() + (COALESCE(qe.duration_minutes, 30) * INTERVAL '1 minute')
       WHERE qe.barber_id = $1
         AND qe.position = 1
         AND qe.status::text = 'waiting'
         AND (qe.scheduled_start_at IS NULL OR qe.scheduled_start_at <= NOW() OR qe.arrived_at IS NOT NULL)
         AND EXISTS (
           SELECT 1 FROM barbers b
           WHERE b.barber_id = qe.barber_id
             AND LOWER(REPLACE(COALESCE(b.status::text, ''), '-', '_')) NOT IN ('on_break', 'break')
         )
         AND NOT EXISTS (
           SELECT 1 FROM queue_entries
           WHERE barber_id = qe.barber_id AND status::text = 'serving'
         )`,
      [barberId],
    );
  }

  async findByIdForUpdate(client: PoolClient, queueId: number): Promise<any | null> {
    const result = await client.query(
      'SELECT * FROM queue_entries WHERE id = $1 FOR UPDATE',
      [queueId],
    );
    return result.rows[0] || null;
  }

  async checkInReservation(
    client: PoolClient,
    data: {
      queueId: number;
      status: string;
      position: number;
      timerStartedAt: string | null;
      scheduledStartAt: string;
      arrivalDeadlineAt: string;
    },
  ): Promise<any | null> {
    const result = await client.query(
      `UPDATE queue_entries
       SET status = $1::queue_status_type, position = $2, arrived_at = NOW(),
           timer_started_at = $3, service_started_at = $3,
           service_ends_at = CASE WHEN $1::text = 'serving'
             THEN NOW() + (COALESCE(duration_minutes, 30) * INTERVAL '1 minute')
             ELSE NULL END,
           scheduled_start_at = COALESCE(scheduled_start_at, $4),
           arrival_deadline_at = COALESCE(arrival_deadline_at, $5)
       WHERE id = $6 AND status::text IN ('accepted', 'late')
       RETURNING *`,
      [
        data.status,
        data.position,
        data.timerStartedAt,
        data.scheduledStartAt,
        data.arrivalDeadlineAt,
        data.queueId,
      ],
    );
    return result.rows[0] || null;
  }

  async findStatusForUpdate(client: PoolClient, queueId: number): Promise<any | null> {
    const result = await client.query(
      `SELECT id, branch_id, status FROM queue_entries WHERE id = $1 FOR UPDATE`,
      [queueId],
    );
    return result.rows[0] || null;
  }

  async markReservationNoShow(client: PoolClient, queueId: number): Promise<any | null> {
    const result = await client.query(
      `UPDATE queue_entries
       SET status = 'no_show', position = 0, no_show_at = COALESCE(no_show_at, NOW()),
           timer_started_at = NULL, service_started_at = NULL
       WHERE id = $1 AND status::text IN ('accepted', 'late')
       RETURNING *`,
      [queueId],
    );
    return result.rows[0] || null;
  }

  async findAcceptedReservationsForAvailability(barberId: number, branchId: number, date: string): Promise<any[]> {
    const result = await db.query(
      `SELECT qe.id, qe.preferred_date, qe.preferred_time,
              COALESCE(qe.duration_minutes, s.duration_minutes, 30) AS duration_minutes,
              qe.status, qe.timer_started_at, qe.created_at
       FROM queue_entries qe
       LEFT JOIN services s ON qe.service_id = s.service_id
       WHERE qe.barber_id = $1
         AND (qe.branch_id = $2 OR qe.branch_id IS NULL OR $2 IS NULL)
         AND qe.status::text IN ('pending', 'accepted', 'late')
         AND qe.preferred_date = $3::date
         AND qe.preferred_time IS NOT NULL`,
      [barberId, branchId, date],
    );
    return result.rows;
  }

  async findReservationForAcceptanceForUpdate(client: PoolClient, queueId: number): Promise<any | null> {
    const result = await client.query(
      `SELECT qe.*, COALESCE(qe.duration_minutes, s.duration_minutes, 30) AS resolved_duration
       FROM queue_entries qe
       LEFT JOIN services s ON qe.service_id = s.service_id
       WHERE qe.id = $1 AND qe.status::text IN ('pending', 'accepted')
       FOR UPDATE OF qe`,
      [queueId],
    );
    return result.rows[0] || null;
  }

  async findAcceptedConflicts(client: PoolClient, barberId: number, queueId: number): Promise<any[]> {
    const result = await client.query(
      `SELECT qe.id, qe.preferred_date, qe.preferred_time,
              COALESCE(qe.duration_minutes, s.duration_minutes, 30) AS resolved_duration
       FROM queue_entries qe
       LEFT JOIN services s ON qe.service_id = s.service_id
       WHERE qe.barber_id = $1
         AND qe.id != $2
         AND qe.status::text IN ('accepted', 'waiting', 'serving')
         AND qe.preferred_date IS NOT NULL`,
      [barberId, queueId],
    );
    return result.rows;
  }

  async acceptScheduledReservation(
    client: PoolClient,
    queueId: number,
    status: string,
    scheduledStartAt: string | null,
    arrivalDeadlineAt: string | null,
  ): Promise<any | null> {
    const result = await client.query(
      `WITH updated AS (
         UPDATE queue_entries
         SET position = 0, status = $2, timer_started_at = NULL, service_started_at = NULL,
             scheduled_start_at = COALESCE(scheduled_start_at, $3),
             arrival_deadline_at = COALESCE(arrival_deadline_at, $4)
         WHERE id = $1
         RETURNING *
       )
       SELECT u.*,
              COALESCE(u.duration_minutes, s.duration_minutes) AS duration_minutes,
              s.title AS service_name,
              b.name AS barber_name,
              b.status::text AS barber_status,
              b.break_started_at AS barber_break_started_at,
              br.name AS branch_name
       FROM updated u
       LEFT JOIN services s ON u.service_id = s.service_id
       LEFT JOIN barbers b ON u.barber_id = b.barber_id
       LEFT JOIN branches br ON u.branch_id = br.branch_id`,
      [queueId, status, scheduledStartAt, arrivalDeadlineAt],
    );
    return result.rows[0] || null;
  }

  async acceptLiveReservation(
    client: PoolClient,
    queueId: number,
    position: number,
    status: string,
    timerStartedAt: string | null,
  ): Promise<any | null> {
    const result = await client.query(
      `WITH updated AS (
         UPDATE queue_entries
         SET position = $1, status = $2::text, timer_started_at = $3,
             service_started_at = $3,
             service_ends_at = CASE WHEN $2::text = 'serving'
               THEN NOW() + (COALESCE(duration_minutes, 30) * INTERVAL '1 minute')
               ELSE NULL END
         WHERE id = $4
         RETURNING *
       )
       SELECT u.*,
              COALESCE(u.duration_minutes, s.duration_minutes) AS duration_minutes,
              s.title AS service_name,
              b.name AS barber_name,
              br.name AS branch_name
       FROM updated u
       LEFT JOIN services s ON u.service_id = s.service_id
       LEFT JOIN barbers b ON u.barber_id = b.barber_id
       LEFT JOIN branches br ON u.branch_id = br.branch_id`,
      [position, status, timerStartedAt, queueId],
    );
    return result.rows[0] || null;
  }

  /**
   * Finds all active queue entries for a barber, ordered by position.
   */
  async findActiveByBarber(barberId: number, branchId?: number, preferredDate?: string): Promise<any[]> {
    const activeStatuses = preferredDate
      ? "qe.status::text IN ('waiting', 'serving', 'late')"
      : "(qe.status::text IN ('accepted', 'waiting', 'serving', 'late') OR (qe.status::text = 'completed' AND qe.payment_status = 'unpaid'))";
    const params: Array<number | string> = [barberId];
    const conditions = ['qe.barber_id = $1', activeStatuses];

    if (branchId !== undefined && branchId !== null) {
      params.push(branchId);
      conditions.push(`qe.branch_id = $${params.length}`);
    }

    if (preferredDate) {
      params.push(preferredDate);
      const dateParam = `$${params.length}`;
      conditions.push(`(
        -- Once a reservation has actually checked in, it belongs to the
        -- live barber lane even if its scheduled date is in the future
        -- (test/bypass mode and cashier corrections rely on this).
        qe.arrived_at IS NOT NULL
        OR
        qe.preferred_date = ${dateParam}::date
        OR (
          qe.preferred_date IS NULL
          AND ${dateParam}::date = (NOW() AT TIME ZONE 'Asia/Manila')::date
        )
      )`);
    }

    const result = await db.query(
      `SELECT qe.id, qe.customer_id, qe.customer_name, qe.guest_profile_id, gp.guest_reference,
              qe.group_booking_id, qe.guest_name,
              CASE WHEN qe.group_booking_id IS NOT NULL THEN (
                SELECT COUNT(*)::int FROM queue_entries group_guest
                WHERE group_guest.group_booking_id = qe.group_booking_id
                  AND group_guest.id <= qe.id
              ) END AS group_guest_number,
              qe.branch_id, qe.position, qe.status,
              b.status::text AS barber_status, b.break_started_at AS barber_break_started_at,
              qe.timer_started_at, qe.service_started_at, qe.service_ends_at, qe.arrival_deadline_at,
              qe.scheduled_start_at, qe.estimated_start_at, qe.arrived_at, qe.no_show_at, qe.created_at, qe.is_walk_in,
              qe.preferred_date, qe.preferred_time,
              COALESCE(
                (SELECT ARRAY_AGG(qes.service_id ORDER BY qes.service_id)
                 FROM queue_entry_services qes
                 WHERE qes.queue_entry_id = qe.id),
                CASE WHEN qe.service_id IS NOT NULL THEN ARRAY[qe.service_id] ELSE ARRAY[]::int[] END
              ) AS service_ids,
              qe.retail_items,
              COALESCE(
                qe.duration_minutes,
                (SELECT SUM(s2.duration_minutes) FROM queue_entry_services qes JOIN services s2 ON s2.service_id = qes.service_id WHERE qes.queue_entry_id = qe.id),
                s.duration_minutes
              ) AS duration_minutes,
              c.first_name, c.last_name,
              COALESCE(
                NULLIF(TRIM((
                  SELECT STRING_AGG(s2.title, ' + ' ORDER BY s2.service_id)
                  FROM queue_entry_services qes
                  JOIN services s2 ON s2.service_id = qes.service_id
                  WHERE qes.queue_entry_id = qe.id
                )), ''),
                s.title,
                'Classic Cut'
              ) AS service_name,
              COALESCE(
                (
                  SELECT SUM(s2.price)
                  FROM queue_entry_services qes
                  JOIN services s2 ON s2.service_id = qes.service_id
                  WHERE qes.queue_entry_id = qe.id
                ),
                s.price,
                0
              ) AS service_price
       FROM queue_entries qe
       LEFT JOIN barbers b ON qe.barber_id = b.barber_id
       LEFT JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
       LEFT JOIN customers c ON qe.customer_id = c.customer_id
       LEFT JOIN services s ON qe.service_id = s.service_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE WHEN qe.status::text = 'serving' THEN 0 WHEN qe.status::text = 'waiting' THEN 1 ELSE 2 END,
                qe.position ASC, qe.scheduled_start_at ASC NULLS LAST`,
      params
    );
    return result.rows;
  }

  /**
   * Finds a customer's active queue entry (for page-refresh resilience).
   */
  async enrichWithGroupDetails(entry: any): Promise<any> {
    if (!entry || !entry.group_booking_id) return entry;

    try {
      const [groupRes, entriesRes] = await Promise.all([
        db.query(
          `SELECT id, total_guests, total_deposit, reference_number, payment_method, status
           FROM group_bookings WHERE id = $1`,
          [entry.group_booking_id]
        ),
        db.query(
          `SELECT qe.id, qe.customer_id, qe.customer_name, qe.guest_name,
                  qe.barber_id, qe.branch_id, qe.service_id,
                  COALESCE(
                    (SELECT ARRAY_AGG(qes.service_id ORDER BY qes.service_id)
                     FROM queue_entry_services qes
                     WHERE qes.queue_entry_id = qe.id),
                    CASE WHEN qe.service_id IS NOT NULL THEN ARRAY[qe.service_id] ELSE ARRAY[]::int[] END
                  ) AS service_ids,
                  qe.status, qe.position, qe.scheduled_start_at, qe.preferred_date, qe.preferred_time,
                  qe.timer_started_at, qe.service_started_at, qe.service_ends_at,
                  qe.arrival_deadline_at, qe.arrived_at, qe.no_show_at, qe.created_at,
                  qe.estimated_start_at, qe.schedule_delay_minutes, qe.schedule_adjustment_status,
                  (qe.schedule_adjustment_status = 'rescheduled') AS has_used_reschedule,
                  COALESCE(
                    qe.duration_minutes,
                    (SELECT SUM(s2.duration_minutes) FROM queue_entry_services qes JOIN services s2 ON s2.service_id = qes.service_id WHERE qes.queue_entry_id = qe.id),
                    s.duration_minutes,
                    30
                  ) AS duration_minutes,
                  COALESCE(
                    NULLIF(TRIM((
                      SELECT STRING_AGG(s2.title, ' + ' ORDER BY s2.service_id)
                      FROM queue_entry_services qes
                      JOIN services s2 ON s2.service_id = qes.service_id
                      WHERE qes.queue_entry_id = qe.id
                    )), ''),
                    s.title,
                    'Classic Cut'
                  ) AS service_name,
                  COALESCE(
                    (
                      SELECT SUM(s2.price)
                      FROM queue_entry_services qes
                      JOIN services s2 ON s2.service_id = qes.service_id
                      WHERE qes.queue_entry_id = qe.id
                    ),
                    s.price,
                    0
                  ) AS service_price,
                  b.name AS barber_name,
                  u.profile_picture AS barber_image
           FROM queue_entries qe
           LEFT JOIN services s ON qe.service_id = s.service_id
           LEFT JOIN barbers b ON qe.barber_id = b.barber_id
           LEFT JOIN users u ON b.user_id = u.user_id
           WHERE qe.group_booking_id = $1
           ORDER BY qe.id ASC`,
          [entry.group_booking_id]
        ),
      ]);

      const groupInfo = groupRes.rows[0];
      const groupEntries = entriesRes.rows || [];

      entry.is_group = true;
      entry.isGroup = true;
      entry.total_guests = groupInfo ? Number(groupInfo.total_guests) : groupEntries.length;
      entry.total_deposit = groupInfo ? Number(groupInfo.total_deposit) : (entry.total_guests * 50);
      entry.group_entries = groupEntries;
      entry.group_booking = groupInfo || null;
    } catch (err) {
      logger.warn('[QueueRepository] Failed to enrich with group details:', err);
    }

    return entry;
  }

  async findGroupQueueEntryIds(groupBookingId: string, status?: string): Promise<number[]> {
    const params: unknown[] = [groupBookingId];
    const statusClause = status ? 'AND status = $2' : '';
    if (status) params.push(status);
    const result = await db.query(
      `SELECT id
       FROM queue_entries
       WHERE group_booking_id = $1
       ${statusClause}
       ORDER BY id ASC`,
      params,
    );
    return result.rows.map((row: any) => Number(row.id)).filter((id: number) => Number.isInteger(id));
  }

  async findGroupQueueEntriesForUpdate(client: PoolClient, groupBookingId: string): Promise<any[]> {
    const result = await client.query(
      `SELECT *
       FROM queue_entries
       WHERE group_booking_id = $1
       ORDER BY barber_id ASC, id ASC
       FOR UPDATE`,
      [groupBookingId],
    );
    return result.rows;
  }

  async findGroupBookingForUpdate(client: PoolClient, groupBookingId: string): Promise<any | null> {
    const result = await client.query(
      `SELECT id, branch_id, total_guests, status
       FROM group_bookings
       WHERE id = $1
       FOR UPDATE`,
      [groupBookingId],
    );
    return result.rows[0] || null;
  }

  async findGroupBooking(groupBookingId: string): Promise<any | null> {
    const result = await db.query(
      'SELECT * FROM group_bookings WHERE id = $1',
      [groupBookingId],
    );
    return result.rows[0] || null;
  }

  async updateGroupBookingStatus(client: PoolClient, groupBookingId: string, status: string): Promise<any | null> {
    const result = await client.query(
      `UPDATE group_bookings
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, groupBookingId],
    );
    return result.rows[0] || null;
  }

  async findActiveByCustomer(customerId: number): Promise<any | null> {
    const result = await db.query(
      `SELECT qe.id, qe.customer_id, qe.barber_id, qe.branch_id, qe.service_id,
             COALESCE(
               (SELECT ARRAY_AGG(qes.service_id ORDER BY qes.service_id)
                FROM queue_entry_services qes
                WHERE qes.queue_entry_id = qe.id),
               CASE WHEN qe.service_id IS NOT NULL THEN ARRAY[qe.service_id] ELSE ARRAY[]::int[] END
             ) AS service_ids,
             qe.position, qe.status, qe.timer_started_at, qe.service_started_at, qe.service_ends_at,
             qe.scheduled_start_at, qe.estimated_start_at, qe.arrival_deadline_at, qe.arrived_at, qe.no_show_at,
             qe.created_at, qe.preferred_date, qe.preferred_time,
             qe.group_booking_id, qe.guest_name, qe.reference_number,
             b.status::text AS barber_status, b.break_started_at AS barber_break_started_at,
             (qe.schedule_adjustment_status = 'rescheduled') AS has_used_reschedule,
             COALESCE(
               qe.duration_minutes,
               (SELECT SUM(s2.duration_minutes) FROM queue_entry_services qes JOIN services s2 ON s2.service_id = qes.service_id WHERE qes.queue_entry_id = qe.id),
               s.duration_minutes
             ) AS duration_minutes,
             COALESCE(
               NULLIF(TRIM((
                 SELECT STRING_AGG(s2.title, ' + ' ORDER BY s2.service_id)
                 FROM queue_entry_services qes
                 JOIN services s2 ON s2.service_id = qes.service_id
                 WHERE qes.queue_entry_id = qe.id
               )), ''),
               s.title,
               'Classic Cut'
             ) AS service_name,
             COALESCE(
               (SELECT SUM(s2.price) FROM queue_entry_services qes JOIN services s2 ON s2.service_id = qes.service_id WHERE qes.queue_entry_id = qe.id),
               s.price,
               0
             ) AS service_price,
             b.name AS barber_name,
             br.name AS branch_name
      FROM queue_entries qe
      LEFT JOIN services s ON qe.service_id = s.service_id
      LEFT JOIN barbers b ON qe.barber_id = b.barber_id
      LEFT JOIN branches br ON qe.branch_id = br.branch_id
      WHERE qe.customer_id = $1
        AND qe.status IN ('pending', 'accepted', 'late', 'waiting', 'serving')
      ORDER BY qe.created_at DESC, qe.id ASC
      LIMIT 1`,
      [customerId]
    );
    const row = result.rows[0] || null;
    return this.enrichWithGroupDetails(row);
  }

  /**
   * Finds a queue entry by ID.
   */
  async findById(id: number): Promise<any | null> {
    const result = await db.query(
      `SELECT qe.*,
              COALESCE(
                (SELECT ARRAY_AGG(qes.service_id ORDER BY qes.service_id)
                 FROM queue_entry_services qes
                 WHERE qes.queue_entry_id = qe.id),
                CASE WHEN qe.service_id IS NOT NULL THEN ARRAY[qe.service_id] ELSE ARRAY[]::int[] END
              ) AS service_ids,
              COALESCE(
                qe.duration_minutes,
                (SELECT SUM(s2.duration_minutes) FROM queue_entry_services qes JOIN services s2 ON s2.service_id = qes.service_id WHERE qes.queue_entry_id = qe.id),
                s.duration_minutes
              ) AS duration_minutes,
              COALESCE(
                NULLIF(TRIM((
                  SELECT STRING_AGG(s2.title, ' + ' ORDER BY s2.service_id)
                  FROM queue_entry_services qes
                  JOIN services s2 ON s2.service_id = qes.service_id
                  WHERE qes.queue_entry_id = qe.id
                )), ''),
                s.title,
                'Classic Cut'
              ) AS service_name,
              COALESCE(
                (SELECT SUM(s2.price) FROM queue_entry_services qes JOIN services s2 ON s2.service_id = qes.service_id WHERE qes.queue_entry_id = qe.id),
                s.price,
                0
              ) AS service_price,
              b.name AS barber_name,
              b.status::text AS barber_status,
              b.break_started_at AS barber_break_started_at,
              br.name AS branch_name
       FROM queue_entries qe
       LEFT JOIN services s ON qe.service_id = s.service_id
       LEFT JOIN barbers b ON qe.barber_id = b.barber_id
       LEFT JOIN branches br ON qe.branch_id = br.branch_id
       WHERE qe.id = $1`,
      [id]
    );
    const row = result.rows[0] || null;
    return this.enrichWithGroupDetails(row);
  }

  /**
   * Marks the current #1 position as completed for a barber.
   */
  async completeFirstInQueue(barberId: number): Promise<void> {
    await db.query(
      `UPDATE queue_entries
       SET status = 'completed', timer_started_at = NULL, service_started_at = NULL, service_ends_at = NULL
       WHERE barber_id = $1 AND position = 1 AND status IN ('waiting', 'serving')`,
      [barberId]
    );
  }

  /**
   * Decrements positions for entries after a given position.
   */
  async decrementPositionsAfter(barberId: number, afterPosition: number = 1): Promise<void> {
    await db.query(
      `UPDATE queue_entries
       SET position = position - 1
       WHERE barber_id = $1 AND status IN ('waiting', 'serving') AND position > $2`,
      [barberId, afterPosition]
    );
  }

  /**
   * Promotes the new #1 to 'serving' with a timer.
   */
  async promoteNextToServing(barberId: number): Promise<void> {
    await this.withTransaction(async (client) => {
      await this.lockBarber(client, barberId);
      await this.promoteEligibleFirst(client, barberId);
    });
  }

  /**
   * Gets the barber_id and position of a queue entry.
   */
  async findBarberAndPosition(queueId: number): Promise<{ id: number; barber_id: number; position: number; status: string; customer_id: number | null; branch_id: number | null; group_booking_id: string | null; preferred_date: string | null; preferred_time: string | null; scheduled_start_at: string | null } | null> {
    const result = await db.query(
      `SELECT id, barber_id, position, status, customer_id, branch_id, group_booking_id,
              preferred_date, preferred_time, scheduled_start_at
       FROM queue_entries
       WHERE id = $1`,
      [queueId]
    );
    return result.rows[0] || null;
  }

  async findBarberReassignmentOptions(
    branchId: number,
    excludedBarberId: number,
  ): Promise<Array<{ barber_id: number; name: string; status: string; queue_count: number }>> {
    const result = await db.query(
      `SELECT b.barber_id, b.name, COALESCE(b.status::text, 'available') AS status,
              COALESCE(q.queue_count, 0)::int AS queue_count
       FROM barbers b
       JOIN users u ON u.user_id = b.user_id
       LEFT JOIN (
         SELECT barber_id, COUNT(*)::int AS queue_count
         FROM queue_entries
         WHERE branch_id = $1
           AND status IN ('pending', 'accepted', 'waiting', 'serving', 'late')
         GROUP BY barber_id
       ) q ON q.barber_id = b.barber_id
       WHERE b.is_active = TRUE
         AND u.deleted_at IS NULL
         AND u.role = 'Barber'
         AND (u.branch_id = $1 OR u.branch_id IS NULL)
         AND b.barber_id <> $2
       ORDER BY queue_count ASC, b.name ASC`,
      [branchId, excludedBarberId],
    );
    return result.rows;
  }

  async reassignQueueEntry(
    queueId: number,
    replacementBarberId: number,
    actingUserId: string,
    reason: string,
  ): Promise<any> {
    return this.withTransaction(async (client) => {
      const entryResult = await client.query(
        `SELECT q.*, old_b.name AS original_barber_name
         FROM queue_entries q
         LEFT JOIN barbers old_b ON old_b.barber_id = q.barber_id
         WHERE q.id = $1
         FOR UPDATE OF q`,
        [queueId],
      );
      const entry = entryResult.rows[0];
      if (!entry) throw new Error('Queue entry not found.');
      if (!['pending', 'accepted', 'waiting', 'serving', 'late'].includes(String(entry.status))) {
        throw new Error('Only active queue entries can be reassigned.');
      }
      if (Number(entry.barber_id) === replacementBarberId) {
        throw new Error('Choose a different replacement barber.');
      }

      const barberResult = await client.query(
        `SELECT b.barber_id, b.name, COALESCE(b.status::text, 'available') AS status
         FROM barbers b
         JOIN users u ON u.user_id = b.user_id
         WHERE b.barber_id = $1
           AND b.is_active = TRUE
           AND u.deleted_at IS NULL
           AND u.role = 'Barber'
           AND (u.branch_id = $2 OR u.branch_id IS NULL)
         FOR UPDATE`,
        [replacementBarberId, entry.branch_id],
      );
      const replacement = barberResult.rows[0];
      if (!replacement) throw new Error('Replacement barber is not active.');

      const destinationLoadResult = await client.query(
        `SELECT COUNT(*)::int AS active_count
         FROM queue_entries
         WHERE barber_id = $1
           AND branch_id = $2
           AND status IN ('pending', 'accepted', 'waiting', 'serving', 'late')
           AND id <> $3`,
        [replacementBarberId, entry.branch_id, queueId],
      );
      const destinationLaneEmpty = Number(destinationLoadResult.rows[0]?.active_count || 0) === 0;
      const promoteToServing = destinationLaneEmpty && ['waiting', 'pending', 'accepted', 'late'].includes(String(entry.status));

      const positionResult = await client.query(
        `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
         FROM queue_entries
         WHERE barber_id = $1
           AND branch_id = $2
           AND status IN ('pending', 'accepted', 'waiting', 'serving', 'late')`,
        [replacementBarberId, entry.branch_id],
      );
      const nextPosition = Number(positionResult.rows[0]?.next_position || 1);

      if (entry.barber_id && Number(entry.position) > 0) {
        await client.query(
          `UPDATE queue_entries
           SET position = position - 1
           WHERE barber_id = $1 AND branch_id = $2 AND position > $3
             AND status IN ('pending', 'accepted', 'waiting', 'serving', 'late')`,
          [entry.barber_id, entry.branch_id, entry.position],
        );
      }

      const updatedResult = await client.query(
        `UPDATE queue_entries
         SET barber_id = $1,
             position = CASE WHEN $7::boolean THEN 1 ELSE $2 END,
             status = CASE WHEN $7::boolean THEN 'serving' ELSE status END,
             timer_started_at = CASE WHEN $7::boolean THEN COALESCE(timer_started_at, NOW()) ELSE timer_started_at END,
             service_started_at = CASE WHEN $7::boolean THEN COALESCE(service_started_at, NOW()) ELSE service_started_at END,
             reassigned_from_barber_id = $3,
             reassigned_by_user_id = $4,
             reassigned_at = NOW(),
             reassignment_reason = $5,
             rebooking_status = 'reassigned',
             reservation_fee_disposition = CASE
               WHEN payment_status = 'paid' OR EXISTS (
                 SELECT 1 FROM transactions t
                 WHERE t.queue_entry_id = queue_entries.id
                   AND t.transaction_type = 'reservation_fee'
               ) THEN 'transferred'
               ELSE reservation_fee_disposition
             END
         WHERE id = $6
         RETURNING *`,
        [replacementBarberId, nextPosition, entry.barber_id, actingUserId, reason, queueId, promoteToServing],
      );

      await client.query(
        `UPDATE transactions
         SET assigned_barber_id = $1,
             transfer_reason = 'CASHIER_BARBER_UNAVAILABLE_OVERRIDE'
         WHERE queue_entry_id = $2
           AND transaction_type = 'reservation_fee'`,
        [replacementBarberId, queueId],
      );

      return { ...updatedResult.rows[0], original_barber_name: entry.original_barber_name, replacement_barber_name: replacement.name };
    });
  }

  /**
   * Retains the active-break delay on the next queue entries before the serving
   * entry is removed from the lane.
   */
  async preserveBreakDelayForFollowingEntries(queueId: number): Promise<void> {
    await db.query(
      `UPDATE queue_entries next_entry
       SET estimated_start_at = GREATEST(
         COALESCE(next_entry.estimated_start_at, next_entry.scheduled_start_at, NOW()),
         COALESCE(
           serving.service_ends_at,
           COALESCE(serving.service_started_at, serving.timer_started_at, NOW())
             + (COALESCE(serving.duration_minutes, 30) * INTERVAL '1 minute')
         ) - GREATEST(
           COALESCE(serving.service_started_at, serving.timer_started_at, barber.break_started_at)
             - barber.break_started_at,
           INTERVAL '0 seconds'
         )
       )
       FROM queue_entries serving
       JOIN barbers barber ON barber.barber_id = serving.barber_id
       WHERE serving.id = $1
         AND serving.status::text = 'serving'
         AND LOWER(REPLACE(COALESCE(barber.status::text, ''), '-', '_')) IN ('on_break', 'break')
         AND barber.break_started_at IS NOT NULL
         AND next_entry.barber_id = serving.barber_id
         AND next_entry.position > serving.position
         AND next_entry.status::text IN ('pending', 'accepted', 'late', 'waiting')`,
      [queueId],
    );
  }

  /**
   * Completes a queue entry and updates haircut specs and photo URL if provided.
   */
  async completeEntry(
    queueId: number,
    specs?: {
      base_style?: string | null;
      haircut_length?: string | null;
      accent_style?: string | null;
      specs_notes?: string | null;
      custom_specification?: string | null;
      haircut_photo_url?: string | null;
    }
  ): Promise<any> {
    const hasSpecs = specs && (
      specs.base_style !== undefined ||
      specs.haircut_length !== undefined ||
      specs.accent_style !== undefined ||
      specs.specs_notes !== undefined ||
      specs.custom_specification !== undefined ||
      specs.haircut_photo_url !== undefined
    );

    if (hasSpecs) {
      try {
        const result = await db.query(
          `UPDATE queue_entries
           SET status = 'completed'::queue_status_type,
               position = 0,
               timer_started_at = NULL,
               service_started_at = NULL,
               service_ends_at = NULL,
               base_style = COALESCE($2, base_style),
               haircut_length = COALESCE($3, haircut_length),
               accent_style = COALESCE($4, accent_style),
               specs_notes = COALESCE($5, specs_notes),
               haircut_photo_url = COALESCE($6, haircut_photo_url),
               custom_specification = COALESCE($7, custom_specification)
           WHERE id = $1
           RETURNING *`,
          [
            queueId,
            specs.base_style ?? null,
            specs.haircut_length ?? null,
            specs.accent_style ?? null,
            specs.specs_notes ?? null,
            specs.haircut_photo_url ?? null,
            specs.custom_specification?.trim()?.slice(0, 100) || null,
          ]
        );
        return result.rows[0];
      } catch (err: any) {
        logger.warn(`[QueueRepository] completeEntry specs update fallback for ${queueId}: ${err?.message}`);
      }
    }

    return await this.updateStatus(queueId, 'completed');
  }

  /** Acknowledge an offline start only if the authoritative queue still serves this walk-in. */
  async recordOfflineServiceStart(queueId: number, branchId: number | undefined, idempotencyKey: string): Promise<any> {
    try {
      return await this.withTransaction(async (client) => {
        const result = await client.query(
          'SELECT * FROM queue_entries WHERE id = $1 FOR UPDATE',
          [queueId],
        );
        const entry = result.rows[0];
        if (!entry) throw new AppError('Queue entry not found.', 404);
        if (branchId !== undefined && Number(entry.branch_id) !== Number(branchId)) {
          throw new AppError('Access denied for this branch.', 403);
        }
        if (entry.offline_service_started_idempotency_key === idempotencyKey) return entry;
        if (entry.offline_service_started_idempotency_key) {
          throw new AppError('A different offline service-start operation was already recorded.', 409);
        }
        if (entry.status !== 'serving') {
          throw new AppError(`The walk-in cannot start because the server queue status is '${entry.status}'.`, 409);
        }
        const updated = await client.query(
          `UPDATE queue_entries
           SET offline_service_started_idempotency_key = $2
           WHERE id = $1
           RETURNING *`,
          [queueId, idempotencyKey],
        );
        return updated.rows[0];
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new AppError('This offline service-start key was already used for another queue entry.', 409);
      }
      throw error;
    }
  }

  /** Completes an offline service and its queue-lane updates in one idempotent transaction. */
  async completeOfflineService(
    queueId: number,
    branchId: number | undefined,
    idempotencyKey: string,
  ): Promise<any> {
    try {
      return await this.withTransaction(async (client) => {
        const initialResult = await client.query(
          'SELECT barber_id FROM queue_entries WHERE id = $1',
          [queueId],
        );
        const initial = initialResult.rows[0];
        if (!initial) throw new AppError('Queue entry not found.', 404);
        const barberId = Number(initial.barber_id);
        if (!Number.isSafeInteger(barberId) || barberId < 1) {
          throw new AppError('The walk-in has no valid barber lane for completion.', 409);
        }
        await this.lockBarber(client, barberId);

        const result = await client.query(
          'SELECT * FROM queue_entries WHERE id = $1 FOR UPDATE',
          [queueId],
        );
        const entry = result.rows[0];
        if (!entry) throw new AppError('Queue entry not found.', 404);
        if (branchId !== undefined && Number(entry.branch_id) !== Number(branchId)) {
          throw new AppError('Access denied for this branch.', 403);
        }
        if (Number(entry.barber_id) !== barberId) {
          throw new AppError('The barber lane changed while the offline completion was syncing.', 409);
        }
        if (entry.offline_service_completed_idempotency_key === idempotencyKey) return entry;
        if (entry.offline_service_completed_idempotency_key) {
          throw new AppError('A different offline completion was already recorded.', 409);
        }
        if (entry.status !== 'serving') {
          throw new AppError(`Queue entry cannot be completed from status '${entry.status}'.`, 409);
        }

        const position = Number(entry.position) || 0;
        const updated = await client.query(
          `UPDATE queue_entries
           SET status = 'completed'::queue_status_type,
               position = 0,
               timer_started_at = NULL,
               service_started_at = NULL,
               service_ends_at = NULL,
               offline_service_completed_idempotency_key = $2
           WHERE id = $1
           RETURNING *`,
          [queueId, idempotencyKey],
        );
        if (position > 0) {
          await client.query(
            `UPDATE queue_entries
             SET position = position - 1
             WHERE barber_id = $1 AND status IN ('waiting', 'serving') AND position > $2`,
            [barberId, position],
          );
          if (position === 1) {
            await this.promoteEligibleFirst(client, barberId);
          }
        }
        return updated.rows[0];
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new AppError('This offline completion key was already used for another queue entry.', 409);
      }
      throw error;
    }
  }

  /**
   * Updates a queue entry's status. Prefer service-level transition methods
   * for scheduled arrival and no-show state changes.
   */
  async updateStatus(
    queueId: number,
    status: string,
    cancelReason?: string | null,
    cancelType?: string | null,
    reservationFeeDisposition?: 'retained' | null,
  ): Promise<any> {
    const cancellationDetailsProvided = cancelReason !== undefined || cancelType !== undefined;
    const cancellationFields = cancellationDetailsProvided
      ? `cancel_reason = $3, cancel_type = $4,`
      : '';
    const feeDispositionField = reservationFeeDisposition !== undefined
      ? `reservation_fee_disposition = $5,`
      : '';
    const params = reservationFeeDisposition !== undefined
      ? [status, queueId, cancelReason ?? null, cancelType ?? null, reservationFeeDisposition]
      : cancellationDetailsProvided
        ? [status, queueId, cancelReason ?? null, cancelType ?? null]
      : [status, queueId];

    try {
      const result = await db.query(
        `UPDATE queue_entries
         SET status = $1::queue_status_type,
             ${cancellationFields}
             ${feeDispositionField}
             position = CASE WHEN $1::queue_status_type IN ('completed', 'cancelled', 'no_show') THEN 0 ELSE position END,
             timer_started_at = CASE WHEN $1::queue_status_type IN ('completed', 'cancelled', 'no_show') THEN NULL ELSE timer_started_at END,
             service_started_at = CASE WHEN $1::queue_status_type IN ('completed', 'cancelled', 'no_show') THEN NULL ELSE service_started_at END,
             service_ends_at = CASE WHEN $1::queue_status_type IN ('completed', 'cancelled', 'no_show') THEN NULL ELSE service_ends_at END
         WHERE id = $2
         RETURNING *`,
        params,
      );
      return result.rows[0];
    } catch (error) {
      // A customer cancellation must never succeed without durably recording
      // that the non-refundable reservation fee is retained.
      if (reservationFeeDisposition !== undefined) throw error;
      if (!cancellationDetailsProvided) throw error;

      // Preserve cancellation behavior for databases where the additive
      // cancellation-columns migration has not been applied yet.
      logger.warn(`[QueueRepository] Cancellation details could not be saved for ${queueId}; applying status only.`);
      const result = await db.query(
        `UPDATE queue_entries
         SET status = $1::queue_status_type,
             position = CASE WHEN $1::queue_status_type IN ('completed', 'cancelled', 'no_show') THEN 0 ELSE position END,
             timer_started_at = CASE WHEN $1::queue_status_type IN ('completed', 'cancelled', 'no_show') THEN NULL ELSE timer_started_at END,
             service_started_at = CASE WHEN $1::queue_status_type IN ('completed', 'cancelled', 'no_show') THEN NULL ELSE service_started_at END,
             service_ends_at = CASE WHEN $1::queue_status_type IN ('completed', 'cancelled', 'no_show') THEN NULL ELSE service_ends_at END
         WHERE id = $2
         RETURNING *`,
        [status, queueId],
      );
      return result.rows[0];
    }
  }

  /** Persists cashier confirmation that a completed queue entry was paid. */
  async markPaid(queueId: number): Promise<any> {
    const result = await db.query(
      `UPDATE queue_entries
       SET payment_status = 'paid'
       WHERE id = $1
       RETURNING *`,
      [queueId],
    );
    return result.rows[0];
  }

  /**
   * Uses the server-calculated duration; the 10-minute arrival grace period
   * is intentionally not used as a service-duration fallback. An elapsed
   * service is completed but remains unpaid so the cashier can collect it.
   */
  async expireOverdueEntries(barberId: number): Promise<number[]> {
    try {
      const result = await db.query(
        `UPDATE queue_entries
         SET status = 'completed'
         WHERE barber_id = $1
           AND status::text = 'serving'
           AND COALESCE(service_started_at, timer_started_at) IS NOT NULL
           AND COALESCE(service_ends_at,
                         COALESCE(service_started_at, timer_started_at)
                         + (COALESCE(duration_minutes, 30) * INTERVAL '1 minute')) < NOW()
         RETURNING id`,
        [barberId]
      );
      return result.rows.map((r: any) => r.id);
    } catch (err: any) {
      logger.warn(`[QueueRepository] Failed to complete overdue entries for barber ${barberId}: ${err?.message}`);
      const fallbackResult = await db.query(
        `UPDATE queue_entries
         SET status = 'completed'
         WHERE barber_id = $1
           AND status::text = 'serving'
           AND COALESCE(service_started_at, timer_started_at) IS NOT NULL
           AND COALESCE(service_ends_at,
                         COALESCE(service_started_at, timer_started_at)
                         + (COALESCE(duration_minutes, 30) * INTERVAL '1 minute')) < NOW()
         RETURNING id`,
        [barberId]
      );
      return fallbackResult.rows.map((r: any) => r.id);
    }
  }

  /**
   * Bulk recalculates positions using ROW_NUMBER().
   */
  async recalculatePositions(barberId: number): Promise<void> {
    await db.query(
      `UPDATE queue_entries qe
       SET position = ranked.new_pos
       FROM (
           SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC) AS new_pos
           FROM queue_entries
           WHERE barber_id = $1 AND status IN ('waiting', 'serving')
       ) ranked
       WHERE qe.id = ranked.id`,
      [barberId]
    );
  }

  /**
   * Finds customer_id by user_id.
   */
  async findCustomerIdByUserId(userId: string): Promise<number | null> {
    const result = await db.query(
      'SELECT customer_id FROM customers WHERE user_id = $1',
      [userId]
    );
    if (result.rows[0]) {
      return result.rows[0].customer_id;
    }

    const userResult = await db.query(
      "SELECT role, username, email FROM users WHERE user_id = $1",
      [userId]
    );
    const user = userResult.rows[0];
    if (user && (user.role === 'System Admin' || user.role === 'Admin')) {
      const nameParts = (user.username || 'System Admin').split(' ');
      const firstName = nameParts[0] || 'System';
      const lastName = nameParts.slice(1).join(' ') || 'Admin';
      const insertResult = await db.query(
        `INSERT INTO customers (user_id, first_name, last_name, email)
         VALUES ($1, $2, $3, $4)
         RETURNING customer_id`,
        [userId, firstName, lastName, user.email]
      );
      return insertResult.rows[0].customer_id;
    }

    return null;
  }

  /**
   * Finds queue entry details for feedback (customer_id, barber_id, service_id).
   */
  async findQueueEntryForFeedback(queueId: number): Promise<{
    customer_id: number;
    barber_id: number;
    service_id: number;
  } | null> {
    const result = await db.query(
      'SELECT customer_id, barber_id, service_id FROM queue_entries WHERE id = $1',
      [queueId]
    );
    return result.rows[0] || null;
  }

  /**
   * Finds active queue entries matching emergency cancellation criteria.
   */
  async findActiveEntriesForEmergency(
    client: PoolClient,
    branchId: number,
    cancellationType: 'barber_unavailability' | 'time_window' | 'shop_closure',
    barberId?: number,
    startTime?: string,
    endTime?: string
  ): Promise<any[]> {
    let query = `
      SELECT q.*, b.name as barber_name
      FROM queue_entries q
      LEFT JOIN barbers b ON q.barber_id = b.barber_id
      WHERE q.branch_id = $1 
        AND q.status IN ('pending', 'accepted', 'waiting', 'serving')
    `;
    const params: any[] = [branchId];

    if (cancellationType === 'barber_unavailability' && barberId) {
      params.push(barberId);
      query += ` AND q.barber_id = $${params.length}`;
    } else if (cancellationType === 'time_window') {
      if (barberId) {
        params.push(barberId);
        query += ` AND q.barber_id = $${params.length}`;
      }
      if (startTime && endTime) {
        params.push(startTime, endTime);
        query += ` AND (
          (q.preferred_time IS NOT NULL AND q.preferred_time >= $${params.length - 1} AND q.preferred_time <= $${params.length})
          OR
          (q.created_at::time >= $${params.length - 1}::time AND q.created_at::time <= $${params.length}::time)
        )`;
      }
    }
    // shop_closure cancels all active entries in the branch

    query += ` FOR UPDATE`;
    const result = await client.query(query, params);
    return result.rows;
  }

  /**
   * Batch updates queue entries for emergency cancellation.
   */
  async batchEmergencyCancel(
    client: PoolClient,
    ids: number[],
    cancellationType: string,
    reason: string
  ): Promise<void> {
    if (ids.length === 0) return;
    await client.query(
      `UPDATE queue_entries
       SET status = 'cancelled',
           is_emergency_cancelled = TRUE,
           emergency_cancellation_type = $1,
           emergency_cancellation_reason = $2,
           emergency_cancelled_at = NOW(),
           rebooking_status = 'pending_action'
       WHERE id = ANY($3::int[])`,
      [cancellationType, reason, ids]
    );
  }

  /**
   * Finds pending emergency cancellation notice for a customer.
   */
  async findPendingEmergencyNoticeByCustomer(customerId: number): Promise<any | null> {
    const result = await db.query(
      `SELECT q.*, b.name as barber_name
       FROM queue_entries q
       LEFT JOIN barbers b ON q.barber_id = b.barber_id
       WHERE q.customer_id = $1
         AND q.is_emergency_cancelled = TRUE
         AND q.rebooking_status = 'pending_action'
       ORDER BY q.emergency_cancelled_at DESC
       LIMIT 1`,
      [customerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Updates emergency rebooking status on a queue entry.
   */
  async updateEmergencyRebookingStatus(
    queueId: number,
    status: 'rebooked' | 'refunded' | 'declined',
    rebookedQueueId?: number
  ): Promise<void> {
    await db.query(
      `UPDATE queue_entries
       SET rebooking_status = $1,
           rebooked_from_queue_id = COALESCE($2, rebooked_from_queue_id)
       WHERE id = $3`,
      [status, rebookedQueueId || null, queueId]
    );
  }

  async transferReservationDeposit(
    originalQueueId: number,
    replacementQueueId: number,
    replacementBarberId: number,
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      // 1. Mark replacement entry as paid
      await client.query(
        `UPDATE queue_entries
         SET payment_status = 'paid'
         WHERE id = $1`,
        [replacementQueueId],
      );

      // 2. Mark reservation fee disposition as transferred on original cancelled booking
      try {
        await client.query(
          `UPDATE queue_entries
           SET reservation_fee_disposition = 'transferred'
           WHERE id = $1`,
          [originalQueueId],
        );
      } catch (dispErr: any) {
        logger.warn(`[QueueRepository] reservation_fee_disposition update skipped for ${originalQueueId}: ${dispErr?.message}`);
      }

      // 3. Reassign reservation fee transaction to replacement appointment
      try {
        await client.query(
          `UPDATE transactions
           SET queue_entry_id = $1,
               assigned_barber_id = $2,
               transfer_reason = 'EMERGENCY_REBOOK'
           WHERE queue_entry_id = $3
             AND transaction_type = 'reservation_fee'`,
          [replacementQueueId, replacementBarberId, originalQueueId],
        );
      } catch (txErr: any) {
        try {
          await client.query(
            `UPDATE transactions
             SET queue_entry_id = $1
             WHERE queue_entry_id = $2
               AND transaction_type = 'reservation_fee'`,
            [replacementQueueId, originalQueueId],
          );
        } catch (innerTxErr: any) {
          logger.warn(`[QueueRepository] Failed to transfer transaction: ${innerTxErr?.message}`);
        }
      }
    });
  }
  /**
   * Retrieves comprehensive reservation email details including customer preference,
   * cashier/barber details, availed services, and payment summary.
   */
  async findReservationEmailDetails(queueId: number): Promise<{
    id: number;
    customerId: number | null;
    customerName: string;
    customerEmail: string | null;
    emailNotificationsEnabled: boolean;
    barberId: number | null;
    barberName: string;
    barberEmail: string | null;
    barberEmailNotificationsEnabled: boolean;
    branchName: string;
    branchAddress: string | null;
    preferredDate: string;
    preferredTime: string;
    status: string;
    cancelReason: string | null;
    services: Array<{ serviceId: number; title: string; price: number }>;
    totalAmount: number;
    depositPaid: number;
    reservationFee?: number;
    guestCount?: number;
    remainingBalance: number;
  } | null> {
    const headerResult = await db.query(
      `SELECT qe.id, qe.customer_id, qe.barber_id, qe.branch_id, qe.service_id, qe.group_booking_id,
              qe.status, qe.preferred_date, qe.preferred_time, qe.cancel_reason,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
                       NULLIF(TRIM(qe.customer_name), ''), 'Valued Customer') AS customer_name,
              COALESCE(NULLIF(TRIM(c.email), ''), NULLIF(TRIM(u.email), '')) AS customer_email,
              COALESCE(u.email_notifications_enabled, c.email_notifications_enabled, TRUE) AS email_notifications_enabled,
              COALESCE(NULLIF(TRIM(b.name), ''), NULLIF(TRIM(bu.username), ''), 'Any Available Barber') AS barber_name,
              NULLIF(TRIM(bu.email), '') AS barber_email,
              COALESCE(bu.email_notifications_enabled, TRUE) AS barber_email_notifications_enabled,
              COALESCE(br.name, 'DemoShop Barbershop') AS branch_name,
              br.address AS branch_address
       FROM queue_entries qe
       LEFT JOIN customers c ON c.customer_id = qe.customer_id
       LEFT JOIN users u ON u.user_id = c.user_id
       LEFT JOIN barbers b ON b.barber_id = qe.barber_id
       LEFT JOIN users bu ON bu.user_id = b.user_id
       LEFT JOIN branches br ON br.branch_id = qe.branch_id
       WHERE qe.id = $1`,
      [queueId]
    );

    const row = headerResult?.rows?.[0];
    if (!row) return null;

    const servicesResult = await db.query(
      `SELECT DISTINCT s.service_id, s.title, COALESCE(s.price, 0)::numeric AS price
       FROM (
         SELECT service_id FROM queue_entry_services WHERE queue_entry_id = $1
         UNION
         SELECT service_id FROM queue_entries WHERE id = $1 AND service_id IS NOT NULL
       ) js
       JOIN services s ON s.service_id = js.service_id`,
      [queueId]
    );

    const services = servicesResult.rows.map(r => ({
      serviceId: Number(r.service_id),
      title: String(r.title),
      price: Number(r.price) || 0,
    }));

    const serviceTotal = services.reduce((acc, s) => acc + s.price, 0);
    let guestCount = 1;
    let reservationFee = 50;
    let depositPaid = 50;

    if (row.group_booking_id) {
      const groupRes = await db.query(
        `SELECT total_guests, total_deposit FROM group_bookings WHERE id = $1`,
        [row.group_booking_id]
      );
      if (groupRes?.rows?.length) {
        guestCount = Number(groupRes.rows[0].total_guests) || 1;
        depositPaid = Number(groupRes.rows[0].total_deposit) || (guestCount * 50);
        reservationFee = depositPaid;
      }
    }

    const totalAmount = serviceTotal + reservationFee;
    const remainingBalance = serviceTotal;

    let formattedDate = 'Scheduled Date';
    if (row.preferred_date) {
      formattedDate = typeof row.preferred_date === 'string'
        ? row.preferred_date
        : new Date(row.preferred_date).toISOString().slice(0, 10);
    }

    return {
      id: Number(row.id),
      customerId: row.customer_id ? Number(row.customer_id) : null,
      customerName: String(row.customer_name),
      customerEmail: row.customer_email ? String(row.customer_email) : null,
      emailNotificationsEnabled: row.email_notifications_enabled === true,
      barberId: row.barber_id ? Number(row.barber_id) : null,
      barberName: String(row.barber_name),
      barberEmail: row.barber_email ? String(row.barber_email) : null,
      barberEmailNotificationsEnabled: row.barber_email_notifications_enabled === true,
      branchName: String(row.branch_name),
      branchAddress: row.branch_address ? String(row.branch_address) : null,
      preferredDate: formattedDate,
      preferredTime: String(row.preferred_time || 'Scheduled Time'),
      status: String(row.status),
      cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
      services,
      totalAmount,
      guestCount,
      depositPaid,
      reservationFee,
      remainingBalance,
    };
  }

  /**
   * Returns all active barbers for a branch along with their current active queue entries,
   * used to compute authoritative SECT wait times.
   */
  async findActiveLanesForBranch(branchId: number): Promise<any[]> {
    const inFlight = activeLaneRequests.get(branchId);
    if (inFlight) return inFlight;

    const request = db.query(
      `SELECT
         b.barber_id,
         b.name AS barber_name,
         COALESCE(b.status::text, 'available') AS barber_status,
         b.is_active,
         qe.id AS entry_id,
         qe.status::text AS queue_status,
         qe.timer_started_at,
         qe.service_started_at,
         qe.service_ends_at,
         qe.scheduled_start_at,
         COALESCE(qe.duration_minutes, s.duration_minutes, 30) AS duration_minutes
       FROM barbers b
       JOIN users u ON b.user_id = u.user_id
       LEFT JOIN queue_entries qe ON qe.barber_id = b.barber_id
         AND qe.branch_id = $1
         AND (
           (qe.status IN ('accepted', 'waiting', 'serving', 'late'))
           OR (qe.status = 'completed' AND qe.payment_status = 'unpaid')
         )
         AND (
           qe.preferred_date IS NULL
           OR qe.preferred_date = (NOW() AT TIME ZONE 'Asia/Manila')::date
         )
       LEFT JOIN services s ON s.service_id = qe.service_id
       WHERE b.is_active = TRUE
         AND u.role = 'Barber'
         AND u.deleted_at IS NULL
         AND (u.branch_id = $1 OR u.branch_id IS NULL)
       ORDER BY b.barber_id ASC, qe.position ASC`,
      [branchId]
    ).then((result) => result.rows);
    activeLaneRequests.set(branchId, request);

    try {
      return await request;
    } finally {
      if (activeLaneRequests.get(branchId) === request) {
        activeLaneRequests.delete(branchId);
      }
    }
  }

  /**
   * Finds all active queue entries for all barbers in a branch in a single query.
   * Matches the filtering and ordering of findActiveByBarber, but scoped to the entire branch.
   */
  async findActiveByBranch(branchId: number, preferredDate?: string): Promise<any[]> {
    const activeStatuses = preferredDate
      ? "qe.status::text IN ('waiting', 'serving', 'late')"
      : "(qe.status::text IN ('accepted', 'waiting', 'serving', 'late') OR (qe.status::text = 'completed' AND qe.payment_status = 'unpaid'))";
    const params: Array<number | string> = [branchId];
    const conditions = ['qe.branch_id = $1', activeStatuses];

    if (preferredDate) {
      params.push(preferredDate);
      const dateParam = `$${params.length}`;
      conditions.push(`(
        qe.preferred_date = ${dateParam}::date
        OR (
          qe.preferred_date IS NULL
          AND ${dateParam}::date = (NOW() AT TIME ZONE 'Asia/Manila')::date
        )
      )`);
    }

    const result = await db.query(
      `SELECT qe.id, qe.barber_id, qe.customer_id, qe.customer_name,
              qe.group_booking_id, qe.guest_name, gp.guest_reference,
              CASE WHEN qe.group_booking_id IS NOT NULL THEN (
                SELECT COUNT(*)::int FROM queue_entries group_guest
                WHERE group_guest.group_booking_id = qe.group_booking_id
                  AND group_guest.id <= qe.id
              ) END AS group_guest_number,
              qe.branch_id, qe.position, qe.status, qe.payment_status,
              b.status::text AS barber_status, b.break_started_at AS barber_break_started_at,
              qe.timer_started_at, qe.service_started_at, qe.service_ends_at, qe.arrival_deadline_at,
              qe.scheduled_start_at, qe.estimated_start_at, qe.arrived_at, qe.no_show_at, qe.created_at, qe.is_walk_in,
              qe.preferred_date, qe.preferred_time,
              COALESCE(
                (SELECT ARRAY_AGG(qes.service_id ORDER BY qes.service_id)
                 FROM queue_entry_services qes
                 WHERE qes.queue_entry_id = qe.id),
                CASE WHEN qe.service_id IS NOT NULL THEN ARRAY[qe.service_id] ELSE ARRAY[]::int[] END
              ) AS service_ids,
              qe.retail_items,
              COALESCE(qe.duration_minutes, s.duration_minutes) AS duration_minutes,
              c.first_name, c.last_name, s.title AS service_name, s.price AS service_price
       FROM queue_entries qe
       LEFT JOIN barbers b ON qe.barber_id = b.barber_id
       LEFT JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
       LEFT JOIN customers c ON qe.customer_id = c.customer_id
       LEFT JOIN services s ON qe.service_id = s.service_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY qe.barber_id ASC,
                CASE WHEN qe.status::text = 'serving' THEN 0 WHEN qe.status::text = 'waiting' THEN 1 ELSE 2 END,
                qe.position ASC, qe.scheduled_start_at ASC NULLS LAST`,
      params
    );
    return result.rows;
  }
}

export const queueRepository = new QueueRepository();


