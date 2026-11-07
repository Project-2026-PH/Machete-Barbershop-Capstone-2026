import db from '../db';

const SHIFT_REQUEST_ID_SQL = `COALESCE(
  CASE
    WHEN (n.metadata->>'requestId') ~ '^[0-9]{1,10}$' THEN
      CASE
        WHEN (n.metadata->>'requestId')::numeric BETWEEN 1 AND 2147483647
        THEN (n.metadata->>'requestId')::int
      END
  END,
  CASE
    WHEN n.dedupe_key ~ '^barber_shift_[^:]+:[0-9]{1,10}:' THEN
      CASE
        WHEN split_part(n.dedupe_key, ':', 2)::numeric BETWEEN 1 AND 2147483647
        THEN split_part(n.dedupe_key, ':', 2)::int
      END
  END
)`;

export interface NotificationRecordInput {
  recipientUserId: string;
  event: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  branchId?: number | null;
  queueEntryId?: number | null;
  dedupeKey: string;
  metadata?: Record<string, unknown> | null;
}

export class NotificationRepository {
  async insertReservationReassigned(params: {
    customerId?: number | null;
    customerName: string;
    replacementBarberName: string;
    branchId?: number | null;
    queueEntryId: number;
  }): Promise<void> {
    await db.query(
      `WITH cust AS (
         SELECT user_id FROM customers WHERE customer_id = $1::int
       )
       INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key, metadata
       )
       SELECT c.user_id, 'reservation_confirmed', 'success', 'Appointment Transferred',
              CONCAT('Notice: ', $2::text, '''s appointment has been transferred to ', $3::text,
                     '. Your ₱50 deposit remains credited and no additional reservation fee is required.'),
              $4::int, $5::int,
              CONCAT('reservation_reassigned:', $5::text),
              jsonb_build_object('reassignment_status', 'transferred', 'deposit_status', 'PAID', 'replacement_barber', $3::text)
       FROM cust c
       WHERE c.user_id IS NOT NULL
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [params.customerId ?? null, params.customerName, params.replacementBarberName, params.branchId ?? null, params.queueEntryId],
    );
  }

  async insertNotification(input: NotificationRecordInput): Promise<void> {
    if (input.metadata !== undefined) {
      await db.query(
        `INSERT INTO notifications (
           recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          input.recipientUserId,
          input.event,
          input.type,
          input.title,
          input.message,
          input.branchId ?? null,
          input.queueEntryId ?? null,
          input.dedupeKey,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      return;
    }

    await db.query(
      `INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        input.recipientUserId,
        input.event,
        input.type,
        input.title,
        input.message,
        input.branchId ?? null,
        input.queueEntryId ?? null,
        input.dedupeKey,
      ],
    );
  }

  async insertInventoryStockCountSubmission(input: {
    stockCountId: string | number;
    branchId?: number | null;
    submittedBy: string;
    countDate: string;
    shift: string;
    lineCount: number;
  }): Promise<void> {
    const shiftLabel = input.shift.charAt(0).toUpperCase() + input.shift.slice(1);
    const title = input.shift === 'morning'
      ? 'Opening stock count awaiting review'
      : 'Stock count awaiting review';
    const message = `${shiftLabel} stock count for ${input.countDate} was submitted for review (${input.lineCount} item${input.lineCount === 1 ? '' : 's'}).`;

    await db.query(
      `INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, dedupe_key
       )
       SELECT u.user_id, 'inventory_stock_count_pending', 'info', $4, $5, $1::int,
              CONCAT('inventory_stock_count_pending:', $2::text, ':', u.user_id::text)
       FROM users u
       WHERE u.deleted_at IS NULL
         AND LOWER(TRIM(u.role::text)) IN ('owner', 'admin', 'shopadmin')
         AND ($1::int IS NULL OR u.branch_id IS NULL OR u.branch_id = $1::int)
         AND u.user_id <> $3::uuid
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [input.branchId ?? null, input.stockCountId, input.submittedBy, title, message],
    );
  }

  async insertShiftRequestNotificationBatch(params: {
    title: string;
    message: string;
    branchId?: number | null;
    requestId: number;
  }): Promise<void> {
    try {
      await db.query(
        `WITH target_staff AS (
           SELECT user_id FROM users
           WHERE (
             LOWER(TRIM(role::text)) IN ('system admin', 'admin', 'owner', 'shopadmin', 'staff')
             OR LOWER(TRIM(role::text)) LIKE '%admin%'
             OR LOWER(TRIM(role::text)) LIKE '%owner%'
           ) AND deleted_at IS NULL
         )
         INSERT INTO notifications (
           recipient_user_id, event, type, title, message, branch_id, dedupe_key, metadata
         )
         SELECT s.user_id, 'barber_shift_request', 'info',
                $1::text,
                $2::text,
                $3::int,
                CONCAT('barber_shift_request:', $4::text, ':', s.user_id),
                jsonb_build_object('requestId', $4::int)
         FROM target_staff s
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          params.title,
          params.message,
          params.branchId ?? null,
          params.requestId,
        ]
      );
    } catch (err) {
      // Non-blocking notification delivery
    }
  }

  async insertReservationPendingBatch(params: {
    customerId?: number | null;
    reservationStr: string;
    branchId?: number | null;
    queueEntryId: number;
    fallbackCustomerName: string;
    timestamp: number;
    referenceNumber?: string | null;
  }): Promise<void> {
    await db.query(
      `WITH target_staff AS (
         SELECT user_id FROM users
         WHERE (
           LOWER(TRIM(role::text)) IN ('cashier', 'front desk', 'frontdesk')
           OR LOWER(TRIM(role::text)) LIKE '%cashier%'
           OR LOWER(TRIM(role::text)) LIKE '%front%'
         ) AND deleted_at IS NULL
         AND ($3::int IS NULL OR branch_id IS NULL OR branch_id = $3::int)
       ),
       pending_entry AS (
         SELECT id FROM queue_entries
         WHERE id = $4::int AND status = 'pending'
       ),
       cust AS (
         SELECT user_id, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name
         FROM customers
         WHERE customer_id = $1::int
       ),
       customer_insert AS (
         INSERT INTO notifications (
           recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key, metadata
         )
         SELECT c.user_id, 'reservation_pending', 'success', 'Reservation Submitted',
                CONCAT('Your reservation request', $2::text, ' is pending cashier approval.'),
                $3::int, $4::int, CONCAT('reservation_pending:', $4::text, ':customer')
         FROM pending_entry
         CROSS JOIN cust c
         WHERE c.user_id IS NOT NULL
         ON CONFLICT (dedupe_key) DO NOTHING
       )
       INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key
       )
       SELECT s.user_id, 'cashier_reservation_pending', 'info', 'New Reservation Request',
              CASE
                WHEN $7::text IS NOT NULL AND TRIM($7::text) != '' THEN
                  CONCAT(COALESCE(c.name, $5::text, 'Customer'), ' submitted reservation fee proof (Ref: #', TRIM($7::text), '). Please verify and confirm.')
                ELSE
                  CONCAT(COALESCE(c.name, $5::text, 'Customer'), ' submitted a reservation request', $2::text, '. Review it in the reservations queue.')
              END,
              $3::int, $4::int,
              CONCAT('reservation_pending:', $4::text, ':', $6::text, ':cashier:', s.user_id)
       FROM target_staff s
       CROSS JOIN pending_entry
       LEFT JOIN cust c ON true
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        params.customerId ?? null,
        params.reservationStr,
        params.branchId ?? null,
        params.queueEntryId,
        params.fallbackCustomerName,
        params.timestamp,
        params.referenceNumber ?? null,
      ]
    );
  }

  async insertReservationConfirmed(params: {
    customerId: number;
    reservationStr: string;
    branchId?: number | null;
    queueEntryId: number;
    timestamp: number;
  }): Promise<void> {
    await db.query(
      `WITH cust AS (
         SELECT user_id, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name
         FROM customers WHERE customer_id = $1::int
       ),
       qe AS (
         SELECT barber_id FROM queue_entries WHERE id = $4::int
       ),
       barb_user AS (
         SELECT b.user_id 
         FROM barbers b
         JOIN qe ON qe.barber_id = b.barber_id
         WHERE b.user_id IS NOT NULL
       ),
       customer_insert AS (
         INSERT INTO notifications (
           recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key
         )
         SELECT c.user_id, 'reservation_confirmed', 'success', 'Reservation Confirmed',
                CONCAT('Your reservation', $2::text, ' has been approved by the cashier.'),
                $3::int, $4::int, CONCAT('reservation_confirmed:', $4::text, ':', $5::text, ':customer')
         FROM cust c
         WHERE c.user_id IS NOT NULL
         ON CONFLICT (dedupe_key) DO NOTHING
       )
       INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key
       )
       SELECT bu.user_id, 'barber_reservation_assigned', 'info', 'New Online Reservation',
              CONCAT(COALESCE(c.name, 'A customer'), ' has been confirmed in your queue', $2::text, '.'),
              $3::int, $4::int, CONCAT('barber_reservation_assigned:', $4::text, ':', $5::text, ':', bu.user_id)
       FROM barb_user bu
       LEFT JOIN cust c ON true
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        params.customerId,
        params.reservationStr,
        params.branchId ?? null,
        params.queueEntryId,
        params.timestamp,
      ]
    );
  }

  async insertCustomerCancellationBatch(params: {
    customerId?: number | null;
    barberId?: number | null;
    customerName: string;
    appointmentLabel: string;
    reason: string;
    branchId?: number | null;
    queueEntryId: number;
    timestamp: number;
  }): Promise<void> {
    await db.query(
      `WITH target_staff AS (
         SELECT user_id FROM users
         WHERE (
           LOWER(TRIM(role::text)) IN ('cashier', 'front desk', 'frontdesk', 'admin', 'shopadmin', 'system admin', 'owner')
           OR LOWER(TRIM(role::text)) LIKE '%cashier%'
           OR LOWER(TRIM(role::text)) LIKE '%front%'
           OR LOWER(TRIM(role::text)) LIKE '%admin%'
           OR LOWER(TRIM(role::text)) LIKE '%owner%'
         ) AND deleted_at IS NULL
         AND ($6::int IS NULL OR branch_id IS NULL OR branch_id = $6::int)
       ),
       cust AS (
         SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) AS name
         FROM customers WHERE customer_id = $1::int
       ),
       barb AS (
         SELECT name, user_id FROM barbers WHERE barber_id = $2::int
       ),
       cashier_insert AS (
         INSERT INTO notifications (
           recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key, metadata
         )
         SELECT s.user_id, 'reservation_cancelled', 'warning', 'Customer Cancelled Booking — Slot Available',
                CONCAT(COALESCE(c.name, $3::text, 'Customer'), ' ', $4::text, ' with ', COALESCE(b.name, 'your barber'), ' was cancelled by the customer. Reason: ', $5::text, '.'),
                $6::int, $7::int,
                CONCAT('reservation_cancelled:', $7::text, ':', $8::text, ':cashier:', s.user_id)
                ,jsonb_build_object(
                  'customerName', COALESCE(c.name, $3::text, 'Customer'),
                  'barberName', COALESCE(b.name, 'your barber'),
                  'appointmentLabel', $4::text,
                  'reason', $5::text,
                  'queueEntryId', $7::int
                )
         FROM target_staff s
         LEFT JOIN cust c ON true
         LEFT JOIN barb b ON true
         ON CONFLICT (dedupe_key) DO NOTHING
       )
       INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key, metadata
       )
         SELECT b.user_id, 'reservation_cancelled', 'warning', 'Reservation Cancelled — Slot Available',
              CONCAT(COALESCE(c.name, $3::text, 'Customer'), ' cancelled their ', $4::text, '. Reason: ', $5::text, '.'),
              $6::int, $7::int,
              CONCAT('reservation_cancelled:', $7::text, ':', $8::text, ':barber:', b.user_id),
              jsonb_build_object(
                'customerName', COALESCE(c.name, $3::text, 'Customer'),
                'barberName', b.name,
                'appointmentLabel', $4::text,
                'reason', $5::text,
                'queueEntryId', $7::int
              )
       FROM barb b
       LEFT JOIN cust c ON true
       WHERE b.user_id IS NOT NULL
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        params.customerId ?? null,
        params.barberId ?? null,
        params.customerName,
        params.appointmentLabel,
        params.reason,
        params.branchId ?? null,
        params.queueEntryId,
        params.timestamp,
      ]
    );
  }

  async insertReservationDeclined(params: {
    customerId: number;
    barberId?: number | null;
    appointmentLabel: string;
    cancellationReason: string;
    branchId?: number | null;
    queueEntryId: number;
    timestamp: number;
  }): Promise<void> {
    await db.query(
      `WITH cust AS (
         SELECT user_id FROM customers WHERE customer_id = $1::int
       ),
       barb AS (
         SELECT name FROM barbers WHERE barber_id = $2::int
       )
       INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key, metadata
       )
       SELECT c.user_id, 'reservation_declined', 'warning', 'Appointment Cancelled',
              CONCAT('Your ', $3::text, ' with ', COALESCE(b.name, 'your barber'), ' was cancelled by the front desk. Reason: ', $4::text, '. We apologize for the inconvenience and invite you to reschedule.'),
              $5::int, $6::int,
              CONCAT('reservation_declined:', $6::text, ':', $7::text, ':customer'),
              jsonb_build_object('barber_id', $2::int, 'original_barber_id', $2::int, 'queue_id', $6::int)
       FROM cust c
       LEFT JOIN barb b ON true
       WHERE c.user_id IS NOT NULL
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        params.customerId,
        params.barberId ?? null,
        params.appointmentLabel,
        params.cancellationReason,
        params.branchId ?? null,
        params.queueEntryId,
        params.timestamp,
      ]
    );
  }

  async insertEmergencyRebookAcceptedBatch(params: {
    customerId?: number | null;
    barberId?: number | null;
    customerName: string;
    appointmentTimeInfo: string;
    barberNameOverride?: string | null;
    branchId?: number | null;
    queueEntryId: number;
    timestamp: number;
  }): Promise<void> {
    await db.query(
      `WITH target_staff AS (
         SELECT user_id FROM users
         WHERE (
           LOWER(TRIM(role::text)) IN ('cashier', 'front desk', 'frontdesk')
           OR LOWER(TRIM(role::text)) LIKE '%cashier%'
           OR LOWER(TRIM(role::text)) LIKE '%front%'
         ) AND deleted_at IS NULL
         AND ($6::int IS NULL OR branch_id IS NULL OR branch_id = $6::int)
       ),
       cust AS (
         SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) AS name
         FROM customers WHERE customer_id = $1::int
       ),
       barb AS (
         SELECT name FROM barbers WHERE barber_id = $2::int
       )
       INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key
       )
       SELECT s.user_id, 'reservation_confirmed', 'success', 'Customer Accepted Rebook',
              CONCAT(COALESCE(c.name, $3::text, 'Customer'), ' accepted the rebook', $4::text, '. It is now in ', COALESCE($5::text, b.name, 'your barber'), '''s queue.'),
              $6::int, $7::int,
              CONCAT('emergency_rebook_accepted:', $7::text, ':', $8::text, ':cashier:', s.user_id)
       FROM target_staff s
       LEFT JOIN cust c ON true
       LEFT JOIN barb b ON true
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        params.customerId ?? null,
        params.barberId ?? null,
        params.customerName,
        params.appointmentTimeInfo,
        params.barberNameOverride || null,
        params.branchId ?? null,
        params.queueEntryId,
        params.timestamp,
      ]
    );
  }

  async insertEmergencyRebookRejectedBatch(params: {
    customerId?: number | null;
    customerName: string;
    branchId?: number | null;
    queueEntryId: number;
    timestamp: number;
  }): Promise<void> {
    await db.query(
      `WITH target_staff AS (
         SELECT user_id FROM users
         WHERE (
           LOWER(TRIM(role::text)) IN ('cashier', 'front desk', 'frontdesk')
           OR LOWER(TRIM(role::text)) LIKE '%cashier%'
           OR LOWER(TRIM(role::text)) LIKE '%front%'
         ) AND deleted_at IS NULL
         AND ($3::int IS NULL OR branch_id IS NULL OR branch_id = $3::int)
       ),
       cust AS (
         SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) AS name
         FROM customers WHERE customer_id = $1::int
       )
       INSERT INTO notifications (
         recipient_user_id, event, type, title, message, branch_id, queue_entry_id, dedupe_key
       )
       SELECT s.user_id, 'reservation_cancelled', 'warning', 'Customer Declined Emergency Rebook',
              CONCAT(COALESCE(c.name, $2::text, 'Customer'), ' declined the automated emergency rebooking for their cancelled appointment.'),
              $3::int, $4::int,
              CONCAT('emergency_rebook_rejected:', $4::text, ':', $5::text, ':cashier:', s.user_id)
       FROM target_staff s
       LEFT JOIN cust c ON true
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        params.customerId ?? null,
        params.customerName,
        params.branchId ?? null,
        params.queueEntryId,
        params.timestamp,
      ]
    );
  }

  async findBarberUserId(barberId: number): Promise<string | null> {
    const result = await db.query('SELECT user_id FROM barbers WHERE barber_id = $1', [barberId]);
    return result.rows[0]?.user_id || null;
  }

  private isValidUuid(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  async listForUser(userId: string, limit: number, cursor?: number): Promise<{ items: any[]; nextCursor: number | null }> {
    if (!this.isValidUuid(userId)) {
      return { items: [], nextCursor: null };
    }
    const result = await db.query(
      `SELECT n.id, n.event, n.type, n.title, n.message, n.metadata, n.branch_id, n.queue_entry_id,
              n.read_at IS NOT NULL AS read, n.created_at
       FROM notifications n
       WHERE n.recipient_user_id = $1
         AND ($3::bigint IS NULL OR n.id < $3::bigint)
         AND NOT (
           n.event LIKE 'barber_shift_%'
           AND (
             EXISTS (
               SELECT 1 FROM barber_shift_requests bsr
               WHERE bsr.id = ${SHIFT_REQUEST_ID_SQL}
               AND bsr.status IN ('approved', 'declined', 'acknowledged')
               AND (n.read_at IS NOT NULL OR n.created_at < NOW() - INTERVAL '7 days')
             )
             OR n.created_at < NOW() - INTERVAL '30 days'
           )
         )
       ORDER BY n.id DESC
       LIMIT $2`,
      [userId, limit + 1, cursor ?? null],
    );
    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;
    return { items, nextCursor: hasMore ? Number(items[items.length - 1].id) : null };
  }

  async countUnreadForUser(userId: string): Promise<number> {
    if (!this.isValidUuid(userId)) return 0;
    const result = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications n
       WHERE n.recipient_user_id = $1
         AND n.read_at IS NULL
         AND NOT (
           n.event LIKE 'barber_shift_%'
           AND (
             EXISTS (
               SELECT 1 FROM barber_shift_requests bsr
               WHERE bsr.id = ${SHIFT_REQUEST_ID_SQL}
               AND bsr.status IN ('approved', 'declined', 'acknowledged')
             )
             OR n.created_at < NOW() - INTERVAL '30 days'
           )
         )`,
      [userId],
    );
    return Number(result.rows[0]?.count || 0);
  }

  async markShiftRequestNotificationsRead(requestId: number): Promise<number> {
    try {
      const result = await db.query(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, NOW())
         WHERE (
           (metadata->>'requestId') = $1::text
           OR (
             dedupe_key ~ '^barber_shift_[^:]+:[0-9]+:'
             AND split_part(dedupe_key, ':', 2) = $1::text
           )
         )
         AND read_at IS NULL
         RETURNING id`,
        [String(requestId)],
      );
      return result.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  async markAllShiftRequestNotificationsRead(): Promise<number> {
    try {
      const result = await db.query(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, NOW())
         WHERE (event LIKE 'barber_shift_%' OR event = 'barber_shift_request') AND read_at IS NULL
         RETURNING id`,
      );
      return result.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  async markRead(userId: string, notificationId: number): Promise<boolean> {
    if (!this.isValidUuid(userId)) {
      return false;
    }
    const result = await db.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND recipient_user_id = $2
       RETURNING id`,
      [notificationId, userId],
    );
    return result.rows.length > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    if (!this.isValidUuid(userId)) {
      return 0;
    }
    const result = await db.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE recipient_user_id = $1 AND read_at IS NULL
       RETURNING id`,
      [userId],
    );
    return result.rowCount ?? 0;
  }
}

export const notificationRepository = new NotificationRepository();
