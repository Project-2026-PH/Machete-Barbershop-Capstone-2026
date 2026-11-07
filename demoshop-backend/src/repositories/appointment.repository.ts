import db from '../db';
import logger from '../utils/general/logger';
import type {
  AppointmentRecord,
  CustomerBookingStats,
  AppointmentFilterStatus,
  AppointmentCounts,
} from '@demoshop/shared-types';

export interface AppointmentFilters {
  status?: AppointmentFilterStatus | string;
  search?: string;
  barberId?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  scope?: 'active' | 'history';
  view?: 'today' | 'overdue';
  sort?: 'newest' | 'oldest';
  branchId?: number;
  origin?: 'in_app';
}

// Queue finalization is authoritative when an older appointment projection has
// not caught up. An elapsed schedule alone never changes a reservation's status.
const FINAL_STATUSES = "'COMPLETED', 'DONE', 'CANCELLED', 'CANCELED', 'NO_SHOW', 'EXPIRED', 'DECLINED', 'REJECTED'";
const STATUS_SQL = `(CASE
  WHEN UPPER(a.status) IN (${FINAL_STATUSES}) THEN UPPER(a.status)
  WHEN UPPER(qe.status::text) IN (${FINAL_STATUSES}) THEN UPPER(qe.status::text)
  ELSE UPPER(COALESCE(a.status, 'PENDING')) END)`;
const ACTIVE_SQL = `${STATUS_SQL} NOT IN (${FINAL_STATUSES})`;
const HISTORY_SQL = `${STATUS_SQL} IN (${FINAL_STATUSES})`;
const SCHEDULE_SQL = `COALESCE(a.scheduled_start_at, qe.scheduled_start_at,
  (a.scheduled_date + CASE
    WHEN TRIM(a.scheduled_time) ~* '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?([ ]*(AM|PM))?$'
    THEN TRIM(a.scheduled_time)::time ELSE TIME '00:00' END) AT TIME ZONE 'Asia/Manila')`;

function addLifecycleFilters(filters: AppointmentFilters, conditions: string[], params: any[]): void {
  if (filters.view === 'overdue') {
    conditions.push(`(${STATUS_SQL} IN ('CONFIRMED', 'SCHEDULED', 'CANCELLED', 'CANCELED', 'NO_SHOW') AND ${SCHEDULE_SQL} < NOW())`);
  } else {
    if (filters.scope === 'active') {
      conditions.push(ACTIVE_SQL);
      if (!filters.view) {
        // Active Upcoming view: pending approval or scheduled today/future (excluding overdue past confirmed slots)
        conditions.push(`(${STATUS_SQL} = 'PENDING' OR ${SCHEDULE_SQL} >= NOW() OR (${SCHEDULE_SQL} AT TIME ZONE 'Asia/Manila')::date >= (NOW() AT TIME ZONE 'Asia/Manila')::date)`);
      }
    }
    if (filters.scope === 'history') conditions.push(HISTORY_SQL);
  }
  if (filters.branchId) {
    params.push(filters.branchId);
    conditions.push(`a.branch_id = $${params.length}`);
  }
  if (filters.origin === 'in_app') {
    conditions.push('(a.customer_id IS NOT NULL OR a.customer_int_id IS NOT NULL)');
  }
  if (filters.view === 'today') conditions.push(`(${SCHEDULE_SQL} AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date`);
}

export class AppointmentRepository {
  async findById(id: string): Promise<AppointmentRecord | null> {
    const query = `
      SELECT 
        a.id,
        qe.group_booking_id::text AS group_booking_id,
        a.customer_id,
        a.customer_int_id,
        COALESCE(a.customer_name, CONCAT_WS(' ', c.first_name, c.last_name), 'Customer') AS customer_name,
        COALESCE(a.customer_phone, c.phone_number) AS customer_phone,
        COALESCE(a.customer_email, c.email) AS customer_email,
        a.barber_id,
        b.name AS barber_name,
        a.branch_id,
        br.name AS branch_name,
        a.service_id,
        s.title AS service_title,
        s.price AS service_price,
        ${STATUS_SQL} AS status,
        a.scheduled_date::text,
        a.scheduled_time,
        a.scheduled_start_at::text,
        a.cancellation_reason,
        a.cancelled_at::text,
        a.cancelled_by,
        COALESCE(u_cancel.username, u_cancel.email) AS cancelled_by_name,
        a.other_notes,
        a.queue_entry_id,
        qe.proof_image_url,
        qe.reference_number,
        qe.ocr_reference_number,
        qe.recipient_identifier_detected,
        COALESCE(qe.payment_provider, gb.payment_provider, gb.payment_method, pa.payment_provider, pa.payment_method, rf.payment_method) AS payment_method,
        COALESCE(qe.payment_provider, gb.payment_provider, pa.payment_provider) AS payment_provider,
        COALESCE(pa.amount, gb.total_deposit, rf.total_amount, 50) AS deposit_amount,
        (rf.transaction_id IS NOT NULL) AS reservation_fee_paid,
        COALESCE(pa.status::text, qe.payment_status::text, 'pending') AS payment_status,
        CASE WHEN qe.is_walk_in = TRUE THEN 'walk_in' ELSE 'online' END AS booking_channel,
        a.created_at::text,
        a.updated_at::text
      FROM appointments a
      LEFT JOIN customers c ON c.user_id = a.customer_id OR c.customer_id = a.customer_int_id
      LEFT JOIN barbers b ON b.barber_id = a.barber_id
      LEFT JOIN branches br ON br.branch_id = a.branch_id
      LEFT JOIN services s ON s.service_id = a.service_id
      LEFT JOIN users u_cancel ON u_cancel.user_id = a.cancelled_by
      LEFT JOIN queue_entries qe ON qe.id = a.queue_entry_id
      LEFT JOIN LATERAL (
        SELECT payment_method, payment_provider, amount, status
        FROM payment_attempts
        WHERE queue_entry_id = qe.id
        ORDER BY payment_attempt_id DESC
        LIMIT 1
      ) pa ON true
      LEFT JOIN LATERAL (
        SELECT transaction_id, total_amount, payment_method
        FROM transactions
        WHERE queue_entry_id = qe.id AND transaction_type = 'reservation_fee'
        ORDER BY transaction_id DESC
        LIMIT 1
      ) rf ON true
      LEFT JOIN group_bookings gb ON gb.id = qe.group_booking_id
      WHERE a.id = $1::uuid
    `;

    try {
      const result = await db.query(query, [id]);
      if (result.rows.length === 0) return null;
      return this.mapRowToRecord(result.rows[0]);
    } catch (err) {
      logger.error('[AppointmentRepository] findById error:', { error: err, id });
      throw err;
    }
  }

  async listAppointments(filters: AppointmentFilters = {}): Promise<{
    appointments: AppointmentRecord[];
    total: number;
  }> {
    const {
      status = 'ALL',
      search,
      barberId,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = filters;

    const conditions: string[] = [];
    const params: any[] = [];
    addLifecycleFilters(filters, conditions, params);
    let paramIndex = params.length + 1;

    // Status filter mapping
    if (status && status !== 'ALL') {
      if (status === 'UPCOMING') {
        conditions.push(ACTIVE_SQL);
      } else if (status === 'HISTORY') {
        conditions.push(HISTORY_SQL);
      } else if (status === 'CANCELLED_NO_SHOW') {
        conditions.push(`${STATUS_SQL} IN ('CANCELLED', 'CANCELED', 'NO_SHOW')`);
      } else if (status === 'CONFIRMED') {
        conditions.push(`${STATUS_SQL} IN ('CONFIRMED', 'SCHEDULED')`);
      } else {
        conditions.push(`${STATUS_SQL} = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }
    }

    if (barberId) {
      conditions.push(`a.barber_id = $${paramIndex}`);
      params.push(barberId);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`a.scheduled_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`a.scheduled_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      conditions.push(`(
        a.customer_name ILIKE $${paramIndex}
        OR c.first_name ILIKE $${paramIndex}
        OR c.last_name ILIKE $${paramIndex}
        OR CONCAT_WS(' ', c.first_name, c.last_name) ILIKE $${paramIndex}
        OR b.name ILIKE $${paramIndex}
        OR s.title ILIKE $${paramIndex}
        OR COALESCE(a.customer_phone, c.phone_number, '') ILIKE $${paramIndex}
        OR qe.reference_number ILIKE $${paramIndex}
        OR a.id::text ILIKE $${paramIndex}
        OR a.cancellation_reason ILIKE $${paramIndex}
        OR a.other_notes ILIKE $${paramIndex}
      )`);
      params.push(searchPattern);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM appointments a
      LEFT JOIN customers c ON c.user_id = a.customer_id OR c.customer_id = a.customer_int_id
      LEFT JOIN barbers b ON b.barber_id = a.barber_id
      LEFT JOIN services s ON s.service_id = a.service_id
      LEFT JOIN queue_entries qe ON qe.id = a.queue_entry_id
      ${whereClause}
    `;

    const offset = Math.max(0, (page - 1) * limit);
    const dataQuery = `
      SELECT 
        a.id,
        qe.group_booking_id::text AS group_booking_id,
        a.customer_id,
        a.customer_int_id,
        COALESCE(a.customer_name, CONCAT_WS(' ', c.first_name, c.last_name), 'Customer') AS customer_name,
        COALESCE(a.customer_phone, c.phone_number) AS customer_phone,
        COALESCE(a.customer_email, c.email) AS customer_email,
        a.barber_id,
        b.name AS barber_name,
        a.branch_id,
        br.name AS branch_name,
        a.service_id,
        s.title AS service_title,
        s.price AS service_price,
        ${STATUS_SQL} AS status,
        (${ACTIVE_SQL} AND ${SCHEDULE_SQL} < NOW()) AS is_overdue,
        a.scheduled_date::text,
        a.scheduled_time,
        a.scheduled_start_at::text,
        a.cancellation_reason,
        a.cancelled_at::text,
        a.cancelled_by,
        COALESCE(u_cancel.username, u_cancel.email) AS cancelled_by_name,
        a.other_notes,
        a.queue_entry_id,
        qe.proof_image_url,
        qe.reference_number,
        qe.ocr_reference_number,
        qe.recipient_identifier_detected,
        COALESCE(qe.payment_provider, gb.payment_provider, gb.payment_method, pa.payment_provider, pa.payment_method, rf.payment_method) AS payment_method,
        COALESCE(qe.payment_provider, gb.payment_provider, pa.payment_provider) AS payment_provider,
        COALESCE(pa.amount, gb.total_deposit, rf.total_amount, 50) AS deposit_amount,
        (rf.transaction_id IS NOT NULL) AS reservation_fee_paid,
        COALESCE(pa.status::text, qe.payment_status::text, 'pending') AS payment_status,
        CASE WHEN qe.is_walk_in = TRUE THEN 'walk_in' ELSE 'online' END AS booking_channel,
        a.created_at::text,
        a.updated_at::text
      FROM appointments a
      LEFT JOIN customers c ON c.user_id = a.customer_id OR c.customer_id = a.customer_int_id
      LEFT JOIN barbers b ON b.barber_id = a.barber_id
      LEFT JOIN branches br ON br.branch_id = a.branch_id
      LEFT JOIN services s ON s.service_id = a.service_id
      LEFT JOIN users u_cancel ON u_cancel.user_id = a.cancelled_by
      LEFT JOIN queue_entries qe ON qe.id = a.queue_entry_id
      LEFT JOIN LATERAL (
        SELECT payment_method, payment_provider, amount, status
        FROM payment_attempts
        WHERE queue_entry_id = qe.id
        ORDER BY payment_attempt_id DESC
        LIMIT 1
      ) pa ON true
      LEFT JOIN LATERAL (
        SELECT transaction_id, total_amount, payment_method
        FROM transactions
        WHERE queue_entry_id = qe.id AND transaction_type = 'reservation_fee'
        ORDER BY transaction_id DESC
        LIMIT 1
      ) rf ON true
      LEFT JOIN group_bookings gb ON gb.id = qe.group_booking_id
      ${whereClause}
      ORDER BY ${SCHEDULE_SQL} ${filters.sort === 'oldest' ? 'ASC' : 'DESC'} NULLS LAST,
        a.created_at DESC, a.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    try {
      const [countRes, dataRes] = await Promise.all([
        db.query(countQuery, params),
        db.query(dataQuery, [...params, limit, offset]),
      ]);

      const total = Number(countRes.rows[0]?.total || 0);
      const appointments = dataRes.rows.map((row: any) => this.mapRowToRecord(row));

      return { appointments, total };
    } catch (err) {
      logger.error('[AppointmentRepository] listAppointments error:', { error: err, filters });
      throw err;
    }
  }

  async getCounts(filters: Omit<AppointmentFilters, 'status' | 'page' | 'limit'> = {}): Promise<AppointmentCounts> {
    const { search, barberId, startDate, endDate } = filters;
    const conditions: string[] = [];
    const params: any[] = [];
    addLifecycleFilters({ ...filters, view: undefined }, conditions, params);
    let paramIndex = params.length + 1;

    if (barberId) {
      conditions.push(`a.barber_id = $${paramIndex}`);
      params.push(barberId);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`a.scheduled_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`a.scheduled_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      conditions.push(`(
        a.customer_name ILIKE $${paramIndex}
        OR c.first_name ILIKE $${paramIndex}
        OR c.last_name ILIKE $${paramIndex}
        OR CONCAT_WS(' ', c.first_name, c.last_name) ILIKE $${paramIndex}
        OR b.name ILIKE $${paramIndex}
        OR s.title ILIKE $${paramIndex}
        OR COALESCE(a.customer_phone, c.phone_number, '') ILIKE $${paramIndex}
        OR qe.reference_number ILIKE $${paramIndex}
        OR a.id::text ILIKE $${paramIndex}
        OR a.cancellation_reason ILIKE $${paramIndex}
        OR a.other_notes ILIKE $${paramIndex}
      )`);
      params.push(searchPattern);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        COUNT(*)::int AS all_count,
        COUNT(*) FILTER (WHERE ${STATUS_SQL} = 'PENDING')::int AS pending_count,
        COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND ${STATUS_SQL} IN ('CONFIRMED', 'SCHEDULED'))::int AS confirmed_count,
        COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND (${STATUS_SQL} = 'PENDING' OR ${SCHEDULE_SQL} >= NOW() OR (${SCHEDULE_SQL} AT TIME ZONE 'Asia/Manila')::date >= (NOW() AT TIME ZONE 'Asia/Manila')::date))::int AS upcoming_count,
        COUNT(*) FILTER (WHERE ${STATUS_SQL} IN ('COMPLETED', 'DONE'))::int AS completed_count,
        COUNT(*) FILTER (WHERE ${STATUS_SQL} IN ('CANCELLED', 'CANCELED', 'NO_SHOW'))::int AS cancelled_no_show_count,
        COUNT(*) FILTER (WHERE ${HISTORY_SQL})::int AS history_count,
        COUNT(*) FILTER (WHERE ${STATUS_SQL} IN ('CONFIRMED', 'SCHEDULED') AND ${SCHEDULE_SQL} < NOW())::int AS overdue_count,
        COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND (${SCHEDULE_SQL} AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date)::int AS today_count
      FROM appointments a
      LEFT JOIN customers c ON c.user_id = a.customer_id OR c.customer_id = a.customer_int_id
      LEFT JOIN barbers b ON b.barber_id = a.barber_id
      LEFT JOIN services s ON s.service_id = a.service_id
      LEFT JOIN queue_entries qe ON qe.id = a.queue_entry_id
      ${whereClause}
    `;

    try {
      const result = await db.query(query, params);
      const row = result.rows[0] || {};
      return {
        all: Number(row.all_count || 0),
        pending: Number(row.pending_count || 0),
        confirmed: Number(row.confirmed_count || 0),
        upcoming: Number(row.upcoming_count || 0),
        history: Number(row.history_count || 0),
        overdue: Number(row.overdue_count || 0),
        today: Number(row.today_count || 0),
        completed: Number(row.completed_count || 0),
        cancelled_no_show: Number(row.cancelled_no_show_count || 0),
      };
    } catch (err) {
      logger.error('[AppointmentRepository] getCounts error:', { error: err });
      throw err;
    }
  }

  async updateAppointmentCancel(
    id: string,
    update: {
      status: 'CANCELLED' | 'NO_SHOW';
      cancellation_reason: string;
      cancelled_at: string;
      cancelled_by: string | null;
      other_notes?: string;
    }
  ): Promise<AppointmentRecord> {
    const query = `
      UPDATE appointments
      SET
        status = $1,
        cancellation_reason = $2,
        cancelled_at = $3::timestamptz,
        cancelled_by = $4::uuid,
        other_notes = COALESCE($5, other_notes),
        updated_at = NOW()
      WHERE id = $6::uuid
      RETURNING *
    `;

    try {
      const result = await db.query(query, [
        update.status,
        update.cancellation_reason,
        update.cancelled_at,
        update.cancelled_by,
        update.other_notes || null,
        id,
      ]);

      if (result.rows.length === 0) {
        throw new Error(`Appointment with id ${id} not found`);
      }

      // Re-query with joins to return complete record
      const fullRecord = await this.findById(id);
      if (!fullRecord) throw new Error(`Failed to reload appointment ${id}`);
      return fullRecord;
    } catch (err) {
      logger.error('[AppointmentRepository] updateAppointmentCancel error:', { error: err, id });
      throw err;
    }
  }

  async syncQueueEntryCancel(
    queueEntryId: number,
    status: 'cancelled' | 'no_show',
    reason: string
  ): Promise<void> {
    try {
      await db.query(
        `UPDATE queue_entries
         SET status = $1,
             cancel_reason = $2,
             cancelled_at = NOW()
         WHERE id = $3`,
        [status, reason, queueEntryId]
      );
    } catch (err) {
      logger.warn('[AppointmentRepository] syncQueueEntryCancel warning:', { error: err, queueEntryId });
    }
  }

  async updateAppointmentStatus(
    id: string,
    status: 'CONFIRMED' | 'SCHEDULED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW',
    options?: { cancellation_reason?: string; cancelled_by?: string | null }
  ): Promise<void> {
    const query = `
      UPDATE appointments
      SET
        status = $1,
        cancellation_reason = COALESCE($2, cancellation_reason),
        cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN NOW() ELSE cancelled_at END,
        cancelled_by = COALESCE($3::uuid, cancelled_by),
        updated_at = NOW()
      WHERE id = $4::uuid
    `;
    try {
      await db.query(query, [
        status,
        options?.cancellation_reason || null,
        options?.cancelled_by || null,
        id,
      ]);
    } catch (err) {
      logger.error('[AppointmentRepository] updateAppointmentStatus error:', { error: err, id, status });
    }
  }

  async updateAppointmentGroupStatus(
    groupBookingId: string,
    status: 'SCHEDULED' | 'CANCELLED',
    options?: { cancellation_reason?: string; cancelled_by?: string | null },
  ): Promise<void> {
    try {
      await db.query(
        `UPDATE appointments a
         SET status = $1,
             cancellation_reason = COALESCE($2, a.cancellation_reason),
             cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN NOW() ELSE a.cancelled_at END,
             cancelled_by = COALESCE($3::uuid, a.cancelled_by),
             updated_at = NOW()
         FROM queue_entries qe
         WHERE a.queue_entry_id = qe.id
           AND qe.group_booking_id = $4::uuid`,
        [status, options?.cancellation_reason || null, options?.cancelled_by || null, groupBookingId],
      );
    } catch (err) {
      logger.error('[AppointmentRepository] updateAppointmentGroupStatus error:', { error: err, groupBookingId, status });
    }
  }

  async getCustomerBookingStats(targetCustomerId: string): Promise<CustomerBookingStats | null> {
    const query = `SELECT * FROM get_customer_booking_stats($1::uuid);`;

    try {
      const result = await db.query(query, [targetCustomerId]);
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const total = Number(row.total_bookings || 0);
      const completed = Number(row.completed_bookings || 0);
      const cancelled = Number(row.cancelled_bookings || 0);
      const noShow = Number(row.no_show_bookings || 0);
      const cancellationRate = row.cancellation_rate !== null ? Number(row.cancellation_rate) : 0;
      const reliabilityScore = Math.max(0, Math.min(100, Math.round((100 - cancellationRate) * 100) / 100));

      let riskLevel: 'normal' | 'moderate' | 'high' = 'normal';
      if (cancellationRate >= 50 || noShow >= 3) {
        riskLevel = 'high';
      } else if (cancellationRate >= 20) {
        riskLevel = 'moderate';
      }

      return {
        total_bookings: total,
        completed_bookings: completed,
        cancelled_bookings: cancelled,
        no_show_bookings: noShow,
        cancellation_rate: cancellationRate,
        reliability_score: reliabilityScore,
        risk_level: riskLevel,
      };
    } catch (err) {
      logger.error('[AppointmentRepository] getCustomerBookingStats error:', { error: err, targetCustomerId });
      return null;
    }
  }

  private mapRowToRecord(row: any): AppointmentRecord {
    return {
      id: row.id,
      group_booking_id: row.group_booking_id || null,
      customer_id: row.customer_id,
      customer_int_id: row.customer_int_id ? Number(row.customer_int_id) : null,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      customer_email: row.customer_email,
      barber_id: row.barber_id ? Number(row.barber_id) : null,
      barber_name: row.barber_name,
      branch_id: row.branch_id ? Number(row.branch_id) : null,
      branch_name: row.branch_name,
      service_id: row.service_id ? Number(row.service_id) : null,
      service_title: row.service_title,
      service_price: row.service_price !== null ? Number(row.service_price) : null,
      status: row.status,
      is_overdue: Boolean(row.is_overdue),
      scheduled_date: row.scheduled_date,
      scheduled_time: row.scheduled_time,
      scheduled_start_at: row.scheduled_start_at,
      cancellation_reason: row.cancellation_reason,
      cancelled_at: row.cancelled_at,
      cancelled_by: row.cancelled_by,
      cancelled_by_name: row.cancelled_by_name,
      other_notes: row.other_notes,
      queue_entry_id: row.queue_entry_id ? Number(row.queue_entry_id) : null,
      proof_image_url: row.proof_image_url || null,
      reference_number: row.reference_number || null,
      ocr_reference_number: row.ocr_reference_number || null,
      recipient_identifier_detected: row.recipient_identifier_detected || null,
      payment_method: row.payment_method || null,
      payment_provider: row.payment_provider || null,
      payment_status: row.payment_status || null,
      reservation_fee_paid: Boolean(row.reservation_fee_paid),
      deposit_amount: row.deposit_amount !== null && row.deposit_amount !== undefined ? Number(row.deposit_amount) : 50,
      booking_channel: row.booking_channel || 'online',
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const appointmentRepository = new AppointmentRepository();
