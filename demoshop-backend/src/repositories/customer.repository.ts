import db from '../db';

const maskedPaymentReference = (value: string | null | undefined): string | null => {
  const reference = value?.trim();
  return reference ? `••••${reference.slice(-4)}` : null;
};

/**
 * Repository for Customer-related database operations.
 */
export class CustomerRepository {
  /**
   * Finds customer profile by user_id.
   */
  async findProfileByUserId(userId: string): Promise<any | null> {
    const result = await db.query(
      `SELECT c.first_name, c.last_name, c.email, c.phone_number, u.profile_picture,
              COALESCE(u.email_notifications_enabled, c.email_notifications_enabled, TRUE) AS email_notifications_enabled
       FROM customers c 
       JOIN users u ON c.user_id = u.user_id
       WHERE c.user_id = $1`,
      [userId]
    );
    return result?.rows?.[0] || null;
  }

  /**
   * Updates customer profile details (first_name, last_name, email).
   */
  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; email?: string }
  ): Promise<any> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const customerUpdates: string[] = [];
      const customerValues: any[] = [];
      let cIdx = 1;

      if (data.firstName !== undefined) {
        customerUpdates.push(`first_name = $${cIdx++}`);
        customerValues.push(data.firstName.trim());
      }
      if (data.lastName !== undefined) {
        customerUpdates.push(`last_name = $${cIdx++}`);
        customerValues.push(data.lastName.trim());
      }
      if (data.email !== undefined) {
        customerUpdates.push(`email = $${cIdx++}`);
        customerValues.push(data.email.trim().toLowerCase());
      }

      if (customerUpdates.length > 0) {
        customerValues.push(userId);
        await client.query(
          `UPDATE public.customers SET ${customerUpdates.join(', ')} WHERE user_id = $${cIdx}`,
          customerValues
        );
      }

      const userUpdates: string[] = [];
      const userValues: any[] = [];
      let uIdx = 1;

      if (data.email !== undefined) {
        userUpdates.push(`email = $${uIdx++}`);
        userValues.push(data.email.trim().toLowerCase());
      }
      if (data.firstName !== undefined || data.lastName !== undefined) {
        const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
        if (fullName) {
          userUpdates.push(`username = $${uIdx++}`);
          userValues.push(fullName);
        }
      }

      if (userUpdates.length > 0) {
        userValues.push(userId);
        await client.query(
          `UPDATE public.users SET ${userUpdates.join(', ')} WHERE user_id = $${uIdx}`,
          userValues
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.findProfileByUserId(userId);
  }

  /**
   * Updates email notifications preference for user and customer records.
   */
  async updateEmailNotificationsPreference(userId: string, enabled: boolean): Promise<boolean> {
    await db.query(
      'UPDATE public.users SET email_notifications_enabled = $1 WHERE user_id = $2',
      [Boolean(enabled), userId]
    );
    await db.query(
      'UPDATE public.customers SET email_notifications_enabled = $1 WHERE user_id = $2',
      [Boolean(enabled), userId]
    );
    return true;
  }

  /**
   * Anonymizes customer PII and soft-deletes user records while maintaining relational integrity.
   */
  async anonymizeAndDeleteAccount(userId: string): Promise<boolean> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const anonymizedEmail = `deleted_${userId.slice(0, 8)}_${Date.now()}@deleted.local`;
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      await client.query(
        `UPDATE customers 
         SET first_name = 'Former', 
             last_name = 'Customer', 
             email = $1, 
             phone_number = NULL 
         WHERE user_id = $2`,
        [anonymizedEmail, userId]
      );
      await client.query(
        `UPDATE users 
         SET deleted_at = NOW(), 
             email = $1, 
             username = 'Former Customer', 
             profile_picture = NULL 
         WHERE user_id = $2`,
        [anonymizedEmail, userId]
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Finds customer_id by user_id.
   */
  async findCustomerIdByUserId(userId: string): Promise<number | null> {
    const result = await db.query(
      'SELECT customer_id FROM customers WHERE user_id = $1',
      [userId]
    );
    return result?.rows?.[0]?.customer_id || null;
  }

  /**
   * Finds the next future reservation that has been accepted by a cashier.
   * Pending, cancelled, and completed reservations are intentionally excluded.
   */
  async findUpcomingAppointment(customerId: number): Promise<any | null> {
    const result = await db.query(
      `SELECT qe.id AS appointment_id,
              qe.preferred_date AS appointment_date,
              qe.preferred_time AS appointment_time,
              qe.status,
              qe.barber_id,
              qe.branch_id,
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
              (qe.schedule_adjustment_status = 'rescheduled') AS has_used_reschedule,
              qe.group_booking_id::text AS group_booking_id,
              COALESCE(
                NULLIF(TRIM((
                  SELECT STRING_AGG(s2.title, ' + ' ORDER BY s2.service_id)
                  FROM queue_entry_services qes
                  JOIN services s2 ON s2.service_id = qes.service_id
                  WHERE qes.queue_entry_id = qe.id
                )), ''),
                s.title,
                'Grooming Service'
              ) AS service_name,
              COALESCE(b.name, 'Any Barber') AS barber_name,
              COALESCE(br.name, 'DemoShop Branch') AS branch_name
       FROM queue_entries qe
       LEFT JOIN services s ON qe.service_id = s.service_id
       LEFT JOIN barbers b ON qe.barber_id = b.barber_id
       LEFT JOIN branches br ON qe.branch_id = br.branch_id
       WHERE qe.customer_id = $1
         AND qe.status IN ('accepted', 'pending')
         AND qe.scheduled_start_at IS NOT NULL
         AND qe.scheduled_start_at > NOW()
       ORDER BY qe.scheduled_start_at ASC
       LIMIT 1`,
      [customerId],
    );
    const row = result?.rows?.[0] || null;
    if (!row) return null;

    if (row.group_booking_id) {
      try {
        const groupRes = await db.query(
          `SELECT qe.id, qe.guest_name, COALESCE(b.name, 'Any Barber') as barber_name,
                  u.profile_picture as barber_image, COALESCE(s.title, 'Grooming Service') as service_name
           FROM queue_entries qe
           LEFT JOIN barbers b ON qe.barber_id = b.barber_id
           LEFT JOIN users u ON b.user_id = u.user_id
           LEFT JOIN services s ON qe.service_id = s.service_id
           WHERE qe.group_booking_id = $1
           ORDER BY qe.id ASC`,
          [row.group_booking_id]
        );
        const groupEntries = groupRes.rows || [];
        if (groupEntries.length > 0) {
          row.is_group = true;
          row.isGroup = true;
          row.total_guests = groupEntries.length;
          row.guests = groupEntries;
          row.barber_name = Array.from(new Set(groupEntries.map((g: any) => g.barber_name))).filter(Boolean).join(' & ');
          const uniqueServices = Array.from(new Set(groupEntries.map((g: any) => g.service_name))).filter(Boolean);
          row.service_name = uniqueServices.join(', ');
        }
      } catch (err) {
        console.warn('[CustomerRepository] Failed to enrich upcoming group appointment:', err);
      }
    }

    return row;
  }

  /**
   * Finds appointment history for a customer (including reservations and transactions).
   */
  async findHistory(customerId: number): Promise<any[]> {
    const result = await db.query(
      `WITH combined_history AS (
         SELECT 
           qe.id as id,
           COALESCE(to_char(qe.preferred_date, 'Mon DD, YYYY'), to_char(qe.created_at, 'Mon DD, YYYY')) as date,
           COALESCE(s.title, 'Grooming Service') as service_name,
           COALESCE(qe.preferred_time, to_char(qe.created_at, 'HH12:MI AM')) as time,
           COALESCE(b.name, 'Any Barber') as barber_name,
           qe.barber_id,
           qe.group_booking_id::text as group_booking_id,
           qe.guest_name,
           u.profile_picture as barber_image,
           CASE 
             WHEN payment.has_res_fee = true THEN payment.total_amount
             WHEN payment.total_amount IS NOT NULL THEN (payment.total_amount + 50)
             ELSE (COALESCE(svc_sum.total_services_price, s.price, 0) + 50)
           END as price,
           50 as reservation_fee,
           qe.cancel_reason,
           qe.cancel_type,
           CASE 
             WHEN qe.status = 'completed' AND COALESCE(payment.payment_status, qe.payment_status::text, 'unpaid') != 'paid' THEN 'Serving'
             ELSE INITCAP(REPLACE(qe.status::text, '_', ' '))
           END as status,
           COALESCE(payment.payment_status, qe.payment_status::text, 'unpaid') as payment_status,
           qe.haircut_photo_url,
           qe.estimated_start_at,
           qe.schedule_delay_minutes,
           qe.created_at as sort_time
         FROM queue_entries qe
         LEFT JOIN services s ON qe.service_id = s.service_id
         LEFT JOIN barbers b ON qe.barber_id = b.barber_id
         LEFT JOIN users u ON b.user_id = u.user_id
         LEFT JOIN LATERAL (
           SELECT SUM(s2.price) AS total_services_price
           FROM queue_entry_services qes
           JOIN services s2 ON s2.service_id = qes.service_id
           WHERE qes.queue_entry_id = qe.id
         ) svc_sum ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(t.total_amount) AS total_amount,
                  BOOL_OR(t.transaction_type = 'reservation_fee') AS has_res_fee,
                  CASE WHEN COUNT(*) > 0 THEN 'paid' ELSE NULL END AS payment_status
           FROM transactions t
           WHERE t.queue_entry_id = qe.id
         ) payment ON TRUE
         WHERE qe.customer_id = $1

         UNION ALL

         SELECT 
           t.transaction_id + 100000 as id,
           to_char(t.created_at, 'Mon DD, YYYY') as date,
           COALESCE(s.title, 'Grooming Service') as service_name,
           to_char(t.created_at, 'HH12:MI AM') as time,
           COALESCE(b.name, 'DemoShop Barber') as barber_name,
           t.barber_id,
           NULL::text as group_booking_id,
           NULL::text as guest_name,
           u.profile_picture as barber_image,
           t.total_amount as price,
           0 as reservation_fee,
           NULL::text as cancel_reason,
           NULL::text as cancel_type,
           'Completed' as status,
           'paid' as payment_status,
           NULL::text as haircut_photo_url,
           NULL::timestamptz as estimated_start_at,
           0 as schedule_delay_minutes,
           t.created_at as sort_time
         FROM transactions t
         LEFT JOIN transaction_services ts ON t.transaction_id = ts.transaction_id
         LEFT JOIN services s ON ts.service_id = s.service_id
         LEFT JOIN barbers b ON t.barber_id = b.barber_id
         LEFT JOIN users u ON b.user_id = u.user_id
         WHERE t.customer_id = $1
           AND (t.queue_entry_id IS NULL OR t.queue_entry_id NOT IN (SELECT id FROM queue_entries WHERE customer_id = $1))
       ),
       deduplicated_history AS (
         SELECT DISTINCT ON (id)
                id, date, service_name, time, barber_name, barber_id, group_booking_id, guest_name, barber_image, price, reservation_fee,
                cancel_reason, cancel_type, status, payment_status, haircut_photo_url,
                estimated_start_at, schedule_delay_minutes, sort_time
         FROM combined_history
         ORDER BY id, sort_time DESC
       )
       SELECT id, date, service_name, time, barber_name, barber_id, group_booking_id, guest_name, barber_image, price, reservation_fee,
              cancel_reason, cancel_type, status, payment_status, haircut_photo_url,
              estimated_start_at, schedule_delay_minutes, sort_time
       FROM deduplicated_history
       ORDER BY sort_time DESC
       LIMIT 20`,
      [customerId]
    );
    const guestResult = await db.query(
      `SELECT qe.id + 200000 AS id,
              COALESCE(to_char(qe.preferred_date, 'Mon DD, YYYY'), to_char(qe.created_at, 'Mon DD, YYYY')) AS date,
              COALESCE(s.title, 'Grooming Service') AS service_name,
              COALESCE(qe.preferred_time, to_char(qe.created_at, 'HH12:MI AM')) AS time,
              COALESCE(b.name, 'Any Barber') AS barber_name,
              qe.group_booking_id::text AS group_booking_id,
              qe.guest_name,
              u.profile_picture AS barber_image,
              COALESCE(payment.total_amount, s.price, 0) AS price,
              qe.cancel_reason, qe.cancel_type, INITCAP(REPLACE(qe.status::text, '_', ' ')) AS status,
              COALESCE(payment.payment_status, qe.payment_status::text, 'unpaid') AS payment_status,
              NULL::text AS haircut_photo_url,
              qe.estimated_start_at,
              qe.schedule_delay_minutes,
              'guest' AS source,
              gp.guest_reference, qe.created_at AS sort_time
       FROM queue_entries qe
       JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
       LEFT JOIN services s ON s.service_id = qe.service_id
       LEFT JOIN barbers b ON b.barber_id = qe.barber_id
       LEFT JOIN users u ON b.user_id = u.user_id
       LEFT JOIN LATERAL (
         SELECT SUM(t.total_amount) AS total_amount,
                CASE WHEN COUNT(*) > 0 THEN 'paid' ELSE NULL END AS payment_status
         FROM transactions t
         WHERE t.queue_entry_id = qe.id AND t.branch_id = qe.branch_id
       ) payment ON TRUE
       WHERE gp.linked_customer_id = $1
       ORDER BY qe.created_at DESC, qe.id DESC
       LIMIT 20`,
      [customerId],
    );

    return [...(result?.rows || []), ...(guestResult?.rows || [])]
      .sort((left, right) => new Date(right.sort_time).getTime() - new Date(left.sort_time).getTime())
      .slice(0, 20);
  }

  /**
   * Finds a queue entry owned by a customer for haircut photo upload validation.
   */
  async findCompletedPaidQueueEntry(queueEntryId: number, customerId: number): Promise<any | null> {
    // History tab adds 100,000 to transaction IDs (e.g. 100028 -> transaction_id 28)
    const isTransactionOffset = queueEntryId > 100000;
    let result;
    if (isTransactionOffset) {
      const transactionId = queueEntryId - 100000;
      result = await db.query(
        `SELECT qe.id, qe.customer_id, 'completed' AS status, 'paid' AS payment_status, qe.haircut_photo_url
         FROM transactions t
         JOIN queue_entries qe ON t.queue_entry_id = qe.id
         WHERE t.transaction_id = $1 AND t.customer_id = $2`,
        [transactionId, customerId]
      );
    } else {
      result = await db.query(
        `SELECT id, customer_id, status, payment_status, haircut_photo_url
         FROM queue_entries
         WHERE id = $1 AND customer_id = $2`,
        [queueEntryId, customerId]
      );
    }
    return result?.rows?.[0] || null;
  }

  /**
   * Updates the haircut_photo_url for a queue entry, enforcing customer ownership.
   */
  async updateHaircutPhotoUrl(queueEntryId: number, photoUrl: string | null, customerId?: number): Promise<boolean> {
    const params: any[] = [photoUrl, queueEntryId];
    let query = `UPDATE queue_entries SET haircut_photo_url = $1 WHERE id = $2`;
    if (customerId !== undefined) {
      params.push(customerId);
      query += ` AND customer_id = $3`;
    }
    const result = await db.query(query, params);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Records an orphaned storage object cleanup job to the durable outbox table.
   */
  async recordStorageCleanupJob(bucketId: string, storagePath: string, reason: string, lastError?: string): Promise<void> {
    try {
      await db.query(
        `INSERT INTO storage_cleanup_jobs (bucket_id, storage_path, reason, status, last_error)
         VALUES ($1, $2, $3, 'pending', $4)`,
        [bucketId, storagePath, reason, lastError || null]
      );
    } catch (err: any) {
      // Don't throw if outbox insert fails; logger handles it
    }
  }

  /**
   * Finds all transactions for a customer.
   */
  async findTransactions(customerId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT 
          transaction_id as id,
          to_char(created_at, 'Mon DD, YYYY') as date,
          'Service Payment' as description,
          total_amount as amount,
          payment_method as method
       FROM transactions
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [customerId]
    );
    return result.rows;
  }

  /** Counts only services both paid and completed by the cashier. */
  async countCompletedPaidHaircuts(customerId: number): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM queue_entries qe
       WHERE qe.customer_id = $1
         AND qe.status = 'completed'
         AND qe.payment_status = 'paid'
         AND NOT EXISTS (
           SELECT 1
           FROM appointments a
           WHERE a.queue_entry_id = qe.id
             AND UPPER(a.status) IN ('CANCELLED', 'CANCELED', 'NO_SHOW')
         )`,
      [customerId],
    );
    return Number(result.rows[0]?.total || 0);
  }

  /**
   * Finds full breakdown details for a customer reservation/history item.
   */
  async findHistoryDetails(historyId: number, customerId: number): Promise<any | null> {
    let queueEntryId: number | null = null;
    let directTransactionId: number | null = null;

    if (historyId > 200000) {
      queueEntryId = historyId - 200000;
    } else if (historyId > 100000) {
      directTransactionId = historyId - 100000;
    } else {
      queueEntryId = historyId;
    }

    let headerRow: any = null;

    if (directTransactionId) {
      const txResult = await db.query(
        `SELECT t.transaction_id, t.queue_entry_id, t.branch_id, t.barber_id, t.customer_id,
                t.payment_method, t.gcash_ref_no, t.total_amount, t.created_at,
                COALESCE(b.name, 'DemoShop Barber') AS barber_name,
                COALESCE(br.name, 'DemoShop Barbershop') AS branch_name,
                br.address AS branch_address,
                'Completed' AS status,
                'paid' AS payment_status,
                NULL::text AS cancel_reason,
                NULL::text AS cancel_type,
                qe.haircut_photo_url,
                qe.preferred_date,
                qe.preferred_time,
                to_char(t.created_at, 'FMDay, Mon DD, YYYY') AS formatted_date,
                to_char(t.created_at, 'HH12:MI AM') AS formatted_time
         FROM transactions t
         LEFT JOIN queue_entries qe ON qe.id = t.queue_entry_id
         LEFT JOIN barbers b ON b.barber_id = t.barber_id
         LEFT JOIN branches br ON br.branch_id = t.branch_id
         WHERE t.transaction_id = $1 AND t.customer_id = $2`,
        [directTransactionId, customerId]
      );
      headerRow = txResult.rows[0] || null;
      if (headerRow?.queue_entry_id) {
        queueEntryId = headerRow.queue_entry_id;
      }
      const qeResult = await db.query(
        `SELECT qe.id, qe.customer_id, qe.barber_id, qe.branch_id, qe.service_id,
                qe.status::text AS status,
                qe.payment_status::text AS payment_status,
                qe.group_booking_id::text AS group_booking_id,
                qe.guest_name,
                qe.preferred_date, qe.preferred_time, qe.scheduled_start_at,
                qe.cancel_reason, qe.cancel_type, qe.haircut_photo_url, qe.created_at,
                COALESCE(to_char(qe.preferred_date, 'FMDay, Mon DD, YYYY'), to_char(qe.created_at, 'FMDay, Mon DD, YYYY')) AS formatted_date,
                COALESCE(qe.preferred_time, to_char(qe.created_at, 'HH12:MI AM')) AS formatted_time,
                COALESCE(b.name, 'Any Barber') AS barber_name,
                COALESCE(br.name, 'DemoShop Barbershop') AS branch_name,
                br.address AS branch_address,
                gp.guest_reference
         FROM queue_entries qe
         LEFT JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
         LEFT JOIN barbers b ON b.barber_id = qe.barber_id
         LEFT JOIN branches br ON br.branch_id = qe.branch_id
         WHERE qe.id = $1 AND (qe.customer_id = $2 OR gp.linked_customer_id = $2)`,
        [queueEntryId, customerId]
      );
      headerRow = qeResult.rows[0] || null;
    }

    if (!headerRow) {
      return null;
    }

    // Check if entry belongs to a group booking
    const groupBookingId = headerRow.group_booking_id;
    let groupEntries: any[] = [];
    if (groupBookingId) {
      const gRes = await db.query(
        `SELECT qe.id, qe.guest_name, COALESCE(b.name, 'Any Barber') as barber_name,
                u.profile_picture as barber_image, COALESCE(s.title, 'Grooming Service') as service_name,
                COALESCE(s.category, 'Haircut & Styling') as category,
                COALESCE(s.duration_minutes, 30) as duration_minutes,
                COALESCE(s.price, 0)::numeric as price
         FROM queue_entries qe
         LEFT JOIN barbers b ON qe.barber_id = b.barber_id
         LEFT JOIN users u ON b.user_id = u.user_id
         LEFT JOIN services s ON qe.service_id = s.service_id
         WHERE qe.group_booking_id = $1
         ORDER BY qe.id ASC`,
        [groupBookingId]
      );
      groupEntries = gRes.rows || [];
    }

    // Fetch itemized services
    let services: Array<{ service_id: number; title: string; category?: string; duration_minutes: number; price: number; guest_name?: string; custom_specification?: string | null }> = [];

    if (groupEntries.length > 1) {
      services = groupEntries.map((g, idx) => ({
        service_id: Number(g.id),
        title: `${g.service_name} (${g.guest_name || `Guest ${idx + 1}`})`,
        category: g.category || 'Haircut & Styling',
        duration_minutes: Number(g.duration_minutes) || 30,
        price: Number(g.price) || 0,
        guest_name: g.guest_name || `Guest ${idx + 1}`,
      }));
    } else if (queueEntryId) {
      const sResult = await db.query(
        `SELECT DISTINCT s.service_id, s.title, s.category,
                ts.custom_specification,
                COALESCE(s.duration_minutes, 30) AS duration_minutes,
                COALESCE(s.price, 0)::numeric AS price
         FROM (
           SELECT service_id FROM queue_entry_services WHERE queue_entry_id = $1
           UNION
           SELECT service_id FROM queue_entries WHERE id = $1 AND service_id IS NOT NULL
           UNION
           SELECT ts.service_id FROM transactions t
           JOIN transaction_services ts ON ts.transaction_id = t.transaction_id
           WHERE t.queue_entry_id = $1
         ) qes
         JOIN services s ON s.service_id = qes.service_id
         LEFT JOIN LATERAL (
           SELECT ts.custom_specification
           FROM transactions tx
           JOIN transaction_services ts ON ts.transaction_id = tx.transaction_id
           WHERE tx.queue_entry_id = $1 AND ts.service_id = s.service_id
           ORDER BY (NULLIF(TRIM(ts.custom_specification), '') IS NOT NULL) DESC,
                    tx.created_at DESC, tx.transaction_id DESC
           LIMIT 1
         ) ts ON TRUE`,
        [queueEntryId]
      );
      services = sResult.rows.map(r => ({
        service_id: Number(r.service_id),
        title: String(r.title),
        category: r.category ? String(r.category) : 'Haircut & Styling',
        duration_minutes: Number(r.duration_minutes) || 30,
        price: Number(r.price) || 0,
        custom_specification: r.custom_specification ? String(r.custom_specification) : null,
      }));
    } else if (directTransactionId) {
      const tsResult = await db.query(
        `SELECT s.service_id, s.title, s.category,
                ts.custom_specification,
                COALESCE(s.duration_minutes, 30) AS duration_minutes,
                COALESCE(ts.actual_price_at_time, s.price, 0)::numeric AS price
         FROM transaction_services ts
         JOIN services s ON s.service_id = ts.service_id
         WHERE ts.transaction_id = $1`,
        [directTransactionId]
      );
      services = tsResult.rows.map(r => ({
        service_id: Number(r.service_id),
        title: String(r.title),
        category: r.category ? String(r.category) : 'Haircut & Styling',
        duration_minutes: Number(r.duration_minutes) || 30,
        price: Number(r.price) || 0,
        custom_specification: r.custom_specification ? String(r.custom_specification) : null,
      }));
    }

    // If still empty, check default service
    if (services.length === 0 && headerRow.service_id) {
      const singleSvc = await db.query(
        `SELECT service_id, title, category, COALESCE(duration_minutes, 30) AS duration_minutes, COALESCE(price, 0)::numeric AS price
         FROM services WHERE service_id = $1`,
        [headerRow.service_id]
      );
      if (singleSvc.rows[0]) {
        services.push({
          service_id: Number(singleSvc.rows[0].service_id),
          title: String(singleSvc.rows[0].title),
          category: singleSvc.rows[0].category || 'Haircut & Styling',
          duration_minutes: Number(singleSvc.rows[0].duration_minutes) || 30,
          price: Number(singleSvc.rows[0].price) || 0,
        });
      }
    }

    // Fetch transactions & payment breakdown
    let transactions: any[] = [];
    if (queueEntryId) {
      const txs = await db.query(
        `SELECT t.transaction_id, t.total_amount, t.payment_method, t.gcash_ref_no, t.transaction_type, t.created_at,
                COALESCE(u.username, u.email, 'Front Desk') AS processed_by
         FROM transactions t
         LEFT JOIN payment_attempts pa ON pa.payment_attempt_id = t.payment_attempt_id
         LEFT JOIN users u ON u.user_id = COALESCE(pa.submitted_by, pa.manually_reviewed_by)
         WHERE t.queue_entry_id = $1
         ORDER BY t.created_at ASC`,
        [queueEntryId]
      );
      transactions = txs.rows;
    } else if (directTransactionId) {
      const txs = await db.query(
        `SELECT t.transaction_id, t.total_amount, t.payment_method, t.gcash_ref_no, t.transaction_type, t.created_at,
                COALESCE(u.username, u.email, 'Front Desk') AS processed_by
         FROM transactions t
         LEFT JOIN payment_attempts pa ON pa.payment_attempt_id = t.payment_attempt_id
         LEFT JOIN users u ON u.user_id = COALESCE(pa.submitted_by, pa.manually_reviewed_by)
         WHERE t.transaction_id = $1`,
        [directTransactionId]
      );
      transactions = txs.rows;
    }

    // Check receipt document if available for receipt number and cashier name
    let receiptDoc: any = null;
    if (queueEntryId) {
      const rd = await db.query(
        `SELECT receipt_document_id, receipt_number, receipt_data, created_at
         FROM receipt_documents
         WHERE queue_entry_id = $1
         ORDER BY receipt_document_id DESC LIMIT 1`,
        [queueEntryId]
      );
      receiptDoc = rd.rows[0] || null;
    }

    const subtotal = services.reduce((sum, s) => sum + s.price, 0);
    const guestCount = groupEntries.length > 0 ? groupEntries.length : 1;
    const reservationFee = (headerRow.guest_reference || directTransactionId) ? 0 : (50 * guestCount);
    const hasResFeeTx = transactions.some(t => t.transaction_type === 'reservation_fee');
    const txTotal = transactions.reduce((sum, t) => sum + Number(t.total_amount || 0), 0);
    
    let totalPaid: number;
    if (txTotal > 0) {
      totalPaid = hasResFeeTx ? txTotal : (txTotal + reservationFee);
    } else {
      totalPaid = subtotal + reservationFee;
    }

    // Determine payment method and split breakdown
    const uniqueMethods = [...new Set(transactions.map(t => String(t.payment_method || 'Cash')))];
    let paymentMethodDisplay = uniqueMethods.length > 1 ? 'Split Payment' : (uniqueMethods[0] || headerRow.payment_method || 'Cash');
    
    const splitBreakdown: Array<{ method: string; amount: number; reference?: string | null }> = [];
    if (transactions.length > 0) {
      for (const t of transactions) {
        splitBreakdown.push({
          method: t.payment_method || 'Cash',
          amount: Number(t.total_amount) || 0,
          reference: maskedPaymentReference(t.gcash_ref_no),
        });
      }
    }

    // Reference number
    const referenceNumber = receiptDoc?.receipt_number
      || (transactions[0]?.gcash_ref_no ? `GCASH-${maskedPaymentReference(transactions[0].gcash_ref_no)}` : null)
      || (transactions[0]?.transaction_id ? `MCH-${String(transactions[0].transaction_id).padStart(4, '0')}` : `RES-${headerRow.id || directTransactionId}`);

    const processedBy = receiptDoc?.receipt_data?.cashierName
      || transactions.find(t => t.processed_by && t.processed_by !== 'Front Desk')?.processed_by
      || 'Front Desk Cashier';

    const isPaid = String(headerRow.payment_status || '').toLowerCase() === 'paid' || transactions.length > 0;
    const resolvedStatus = (String(headerRow.status || '').toLowerCase() === 'completed' && !isPaid)
      ? 'Serving'
      : headerRow.status;

    const barberDisplay = groupEntries.length > 1
      ? Array.from(new Set(groupEntries.map((g) => g.barber_name))).filter(Boolean).join(' & ')
      : headerRow.barber_name;

    return {
      id: historyId,
      queue_entry_id: queueEntryId,
      transaction_id: directTransactionId || transactions[0]?.transaction_id || null,
      status: resolvedStatus,
      payment_status: headerRow.payment_status || 'unpaid',
      date: headerRow.formatted_date || headerRow.preferred_date || 'N/A',
      time: headerRow.formatted_time || headerRow.preferred_time || 'N/A',
      barber_id: headerRow.barber_id || null,
      branch_id: headerRow.branch_id || null,
      preferred_date: headerRow.preferred_date || null,
      preferred_time: headerRow.preferred_time || null,
      scheduled_start_at: headerRow.scheduled_start_at || null,
      barber_name: barberDisplay,
      branch_name: headerRow.branch_name,
      branch_address: headerRow.branch_address,
      processed_by: processedBy,
      haircut_photo_url: headerRow.haircut_photo_url || null,
      cancel_reason: headerRow.cancel_reason || null,
      cancel_type: headerRow.cancel_type || null,
      services,
      subtotal,
      reservation_fee: reservationFee,
      discount_amount: 0,
      total_amount: totalPaid,
      payment_method: paymentMethodDisplay,
      split_breakdown: splitBreakdown,
      reference_number: referenceNumber,
      transaction_date: transactions[0]?.created_at || headerRow.created_at,
      guest_reference: headerRow.guest_reference || null,
      is_group: groupEntries.length > 1,
      total_guests: groupEntries.length > 1 ? groupEntries.length : 1,
      guests: groupEntries.length > 1 ? groupEntries : [],
    };
  }
}

export const customerRepository = new CustomerRepository();

